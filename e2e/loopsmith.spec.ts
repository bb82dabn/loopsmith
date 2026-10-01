import { readFile } from 'node:fs/promises'
import { unzipSync } from 'fflate'
import { expect, test, type Page } from '@playwright/test'

type WorkerFailureMode = 'render-constructor' | 'render-post' | 'render-runtime' | 'render-message' | 'encoder-constructor' | 'encoder-post' | 'encoder-runtime' | 'encoder-message' | 'encoder-stale' | 'stems-stale' | null

async function installWorkerFailureInjection(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker
    const state = { mode: null as WorkerFailureMode }
    ;(window as typeof window & { workerFailureState: typeof state }).workerFailureState = state
    window.Worker = class InjectedWorker {
      onmessage: ((event: MessageEvent) => void) | null = null
      onmessageerror: ((event: MessageEvent) => void) | null = null
      onerror: ((event: ErrorEvent) => void) | null = null
      private terminated = false
      private readonly kind: 'render' | 'encoder' | 'stems'

      constructor(url: string | URL, options?: WorkerOptions) {
        const path = String(url)
        const kind = path.includes('render.worker') ? 'render' : path.includes('encoder.worker') ? 'encoder' : path.includes('stems.worker') ? 'stems' : null
        if (!kind || !state.mode?.startsWith(kind)) return new NativeWorker(url, options)
        if (state.mode === `${kind}-constructor`) throw new Error(`Simulated ${kind} constructor failure`)
        this.kind = kind
      }

      postMessage(message: { jobId: string }): void {
        if (state.mode === `${this.kind}-post`) throw new Error(`Simulated ${this.kind} post failure`)
        if (state.mode === `${this.kind}-runtime`) {
          setTimeout(() => {
            if (!this.terminated) this.onerror?.(new ErrorEvent('error', { message: 'Simulated worker runtime failure' }))
          })
        } else if (state.mode === `${this.kind}-message`) {
          setTimeout(() => {
            if (!this.terminated) this.onmessageerror?.(new MessageEvent('messageerror'))
          })
        } else if (state.mode === 'encoder-stale') {
          this.onmessage?.(new MessageEvent('message', { data: { type: 'progress', jobId: message.jobId, progress: 0.4 } }))
          setTimeout(() => this.onmessage?.(new MessageEvent('message', { data: { type: 'encoded', jobId: message.jobId, bytes: new ArrayBuffer(8) } })), 500)
        } else if (state.mode === 'stems-stale') {
          const request = message as { jobId: string; composition: { id: string } }
          this.onmessage?.(new MessageEvent('message', { data: { type: 'progress', jobId: request.jobId, progress: 0.4, label: 'Rendering WAV stems' } }))
          setTimeout(() => this.onmessage?.(new MessageEvent('message', { data: { type: 'exported-stems', jobId: request.jobId, compositionId: request.composition.id, bytes: new ArrayBuffer(8), stemCount: 1 } })), 500)
        }
      }

      terminate(): void {
        this.terminated = true
      }

      addEventListener(): void {}
      removeEventListener(): void {}
      dispatchEvent(): boolean { return true }
    } as unknown as typeof Worker
  })
}

async function setWorkerFailureMode(page: Page, mode: WorkerFailureMode): Promise<void> {
  await page.evaluate((nextMode) => {
    ;(window as typeof window & { workerFailureState: { mode: WorkerFailureMode } }).workerFailureState.mode = nextMode
  }, mode)
}

async function installAudioContextSpy(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const state = { starts: 0, stops: 0 }
    ;(window as typeof window & { auditionAudioState: typeof state }).auditionAudioState = state
    class AuditionBufferSource {
      buffer: AudioBuffer | null = null
      loop = false
      loopStart = 0
      loopEnd = 0
      onended: (() => void) | null = null
      connect(): void {}
      disconnect(): void {}
      start(): void { state.starts += 1 }
      stop(): void { state.stops += 1 }
    }
    class AuditionAudioContext {
      currentTime = 0
      destination = {}
      state: AudioContextState = 'running'
      createGain() {
        return { gain: { value: 1, setTargetAtTime() {} }, connect() {} }
      }
      createBuffer(channels: number, length: number, sampleRate: number) {
        const data = Array.from({ length: channels }, () => new Float32Array(length))
        return {
          duration: length / sampleRate,
          copyToChannel(channel: Float32Array, index: number) { data[index].set(channel) },
        }
      }
      createBufferSource() { return new AuditionBufferSource() }
      async resume(): Promise<void> { this.state = 'running' }
    }
    window.AudioContext = AuditionAudioContext as unknown as typeof AudioContext
  })
}

test('auditions selected notes', async ({ page }) => {
  await installAudioContextSpy(page)
  const consoleErrors: string[] = []
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()) })
  await page.goto('/')
  await expect(page.getByText(/Audio ready · seam RMS/)).toBeVisible({ timeout: 60_000 })

  const pianoRoll = page.locator('canvas.piano-roll')
  const noteCount = await pianoRoll.getAttribute('aria-label')
  const undo = page.getByRole('button', { name: 'Undo' })
  const undoDisabled = await undo.isDisabled()
  const play = page.getByRole('button', { name: 'Play', exact: true })
  const audition = page.getByRole('button', { name: 'Audition selected note' })
  await expect(audition).toBeDisabled()
  await expect(play).toBeVisible()

  const notePoint = await pianoRoll.evaluate((canvas) => {
    const context = canvas.getContext('2d')!
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        const index = (y * canvas.width + x) * 4
        if (pixels[index] === 169 && pixels[index + 1] === 112 && pixels[index + 2] === 255) {
          return { x: x / (window.devicePixelRatio || 1), y: y / (window.devicePixelRatio || 1) }
        }
      }
    }
    throw new Error('No rendered piano-roll note found')
  })
  await pianoRoll.click({ position: notePoint })
  await expect(audition).toBeEnabled()
  await expect.poll(() => page.evaluate(() => (window as typeof window & { auditionAudioState: { starts: number } }).auditionAudioState.starts)).toBe(1)

  const startBeats = Number(await page.getByLabel('Start beat').inputValue())
  const tempo = Number(await page.locator('label.range-field').filter({ hasText: /^Tempo/ }).locator('input').inputValue())
  await expect.poll(async () => Number(await page.getByLabel('Playback position').inputValue())).toBeCloseTo(startBeats * 60 / tempo, 2)

  await page.getByRole('button', { name: 'Previous note' }).click()
  await page.getByRole('button', { name: 'Next note' }).click()
  await audition.focus()
  await audition.press('Space')
  await audition.click({ clickCount: 3 })
  await expect.poll(() => page.evaluate(() => (window as typeof window & { auditionAudioState: { starts: number } }).auditionAudioState.starts)).toBe(7)
  expect(await page.evaluate(() => (window as typeof window & { auditionAudioState: { stops: number } }).auditionAudioState.stops)).toBeGreaterThanOrEqual(6)

  await expect(pianoRoll).toHaveAttribute('aria-label', noteCount ?? '')
  expect(await undo.isDisabled()).toBe(undoDisabled)
  await expect(play).toBeVisible()
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toHaveCount(0)
  expect(consoleErrors).toEqual([])
})

test('generates, auditions, mixes, and downloads standard MIDI', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle(/LoopSmith/)
  await expect(page.getByRole('heading', { name: /measures/ })).toBeVisible()
  await expect(page.getByText(/Audio ready · seam RMS/)).toBeVisible({ timeout: 60_000 })

  await page.getByLabel('Seed').fill('playwright-repeatable')
  await page.getByRole('button', { name: 'Generate composition' }).click()
  await expect(page.getByText('Composing arrangement')).toBeVisible()
  await expect(page.getByText(/Audio ready · seam RMS/)).toBeVisible({ timeout: 60_000 })

  const play = page.getByRole('button', { name: 'Play', exact: true })
  await expect(play).toBeEnabled()
  await play.click()
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Pause', exact: true }).click()

  await page.getByRole('button', { name: 'Mute', exact: false }).first().click()
  await expect(page.getByText('Preparing audio')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText(/Audio ready · seam RMS/)).toBeVisible({ timeout: 60_000 })

  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: /Standard MIDI/ }).click()
  expect((await download).suggestedFilename()).toMatch(/\.mid$/)
})

test('exports loop-ready WAV stems', async ({ page }) => {
  test.slow()
  await page.goto('/')
  await expect(page.getByText(/Audio ready · seam RMS/)).toBeVisible({ timeout: 60_000 })
  const downloadEvent = page.waitForEvent('download', { timeout: 120_000 })
  await page.getByRole('button', { name: 'Export WAV stems' }).click()
  const download = await downloadEvent
  expect(download.suggestedFilename()).toMatch(/-stems\.zip$/)
  const archive = unzipSync(await readFile(await download.path()))
  const names = Object.keys(archive)
  expect(names).toContain('manifest.json')
  expect(names).toContain('full-mix.wav')
  const manifest = JSON.parse(new TextDecoder().decode(archive['manifest.json'])) as { includedTrackIds: string[]; tracks: Array<{ id: string; filename: string | null }> }
  const layerEntries = names.filter((name) => name.startsWith('stems/') && name.endsWith('.wav'))
  expect(layerEntries).toHaveLength(manifest.includedTrackIds.length)
  expect(manifest.tracks.filter((track) => track.filename).map((track) => track.filename).sort()).toEqual(layerEntries.sort())
  await expect(page.getByText(/WAV stem bundle exported · \d+ synchronized layers/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Export Game-ready MP3' })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Export WAV stems' })).toBeEnabled()
})

test('configures target duration and renders phrase-aligned loops', async ({ page }) => {
  test.slow()
  await page.goto('/')
  await expect(page.getByText(/Audio ready · seam RMS/)).toBeVisible({ timeout: 60_000 })

  const targetDuration = page.getByRole('slider', { name: 'Target duration' })
  await targetDuration.focus()
  await targetDuration.press('Home')
  for (let step = 0; step < 12; step += 1) await targetDuration.press('ArrowRight')
  await expect(targetDuration).toHaveValue('90')
  await page.locator('label.range-field').filter({ hasText: /^Tempo/ }).locator('input').fill('102')
  await expect(page.getByText('Requested 90s · Generated result: 40 measures, 94.12s.')).toBeVisible()
  await page.getByLabel('Seed').fill('duration-e2e')
  await page.getByRole('button', { name: 'Generate composition' }).click()
  await expect(page.getByText('Composing arrangement')).toBeVisible()
  await expect(page.getByText(/Audio ready · seam RMS/)).toBeVisible({ timeout: 60_000 })
  await expect(page.getByRole('heading', { name: /^40 measures/ })).toBeVisible()
  await expect(page.getByText('Length').locator('..')).toContainText('01:34')
  const longRenderDuration = Number(await page.getByLabel('Playback position').getAttribute('max'))
  expect(longRenderDuration).toBeCloseTo(94.12, 2)

  await targetDuration.fill('30')
  await expect(page.getByText('Requested 30s · Generated result: 12 measures, 28.24s.')).toBeVisible()
  await page.getByRole('button', { name: 'Generate composition' }).click()
  await expect(page.getByText('Composing arrangement')).toBeVisible()
  await expect(page.getByText(/Audio ready · seam RMS/)).toBeVisible({ timeout: 60_000 })
  await expect(page.getByRole('heading', { name: /^12 measures/ })).toBeVisible()
  const shortRenderDuration = Number(await page.getByLabel('Playback position').getAttribute('max'))
  expect(shortRenderDuration).toBeCloseTo(28.24, 2)
  expect(shortRenderDuration).toBeLessThan(longRenderDuration)
  await expect(page.getByText(/worker stopped unexpectedly/i)).toHaveCount(0)
})

test('encodes, decodes, verifies, and downloads MP3 variations', async ({ page }) => {
  test.slow()
  await page.goto('/')
  const scenarios = [
    ['peaceful-village', 'e2e-village'],
    ['dungeon-tension', 'e2e-dungeon'],
    ['retro-platformer', 'e2e-platform'],
  ] as const

  for (const [preset, seed] of scenarios) {
    await page.getByLabel('Scene preset').selectOption(preset)
    await page.getByLabel('Seed').fill(seed)
    await page.getByRole('button', { name: 'Generate composition' }).click()
    await expect(page.getByText('Composing arrangement')).toBeVisible()
    await expect(page.getByText(/Audio ready · seam RMS/)).toBeVisible({ timeout: 60_000 })
    await page.getByLabel('MP3 quality').selectOption('96')
    const download = page.waitForEvent('download', { timeout: 120_000 })
    await page.getByRole('button', { name: /Game-ready MP3/ }).click()
    const file = await download
    expect(file.suggestedFilename()).toMatch(/-96k\.mp3$/)
    await expect(page.getByText(/MP3 decoded and verified · seam RMS/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Export Game-ready MP3' })).toBeEnabled()
    await expect(page.getByRole('button', { name: 'Export WAV stems' })).toBeEnabled()
  }
})

test('falls back safely when the composition worker cannot start', async ({ page }) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker
    class WorkerWithCompositionFailure extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        if (String(url).includes('composition.worker')) throw new Error('Simulated worker startup failure')
        super(url, options)
      }
    }
    window.Worker = WorkerWithCompositionFailure
  })
  await page.goto('/')
  await expect(page.getByText(/Audio ready · seam RMS/)).toBeVisible({ timeout: 60_000 })
  await page.getByLabel('Seed').fill('worker-fallback-test')
  await page.getByRole('button', { name: 'Generate composition' }).click()
  await expect(page.getByText(/Audio ready · seam RMS/)).toBeVisible({ timeout: 60_000 })
  await expect(page.getByText('The composition worker stopped unexpectedly.')).toHaveCount(0)
})

test('reports render worker startup, post, runtime, and message failures with retry', async ({ page }) => {
  await installWorkerFailureInjection(page)
  await page.goto('/')
  const scenarios = [
    ['render-constructor', 'Audio rendering could not start. Retry the render.'],
    ['render-post', 'The audio worker stopped unexpectedly. Retry the render.'],
    ['render-runtime', 'The audio worker stopped unexpectedly. Retry the render.'],
    ['render-message', 'The audio worker returned an unreadable message. Retry the render.'],
  ] as const

  for (const [mode, message] of scenarios) {
    await setWorkerFailureMode(page, mode)
    await page.getByRole('button', { name: 'Mute', exact: false }).first().click()
    await expect(page.getByText(message)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Retry failed audio job' })).toBeVisible()
  }
  await setWorkerFailureMode(page, null)
  await page.getByRole('button', { name: 'Retry failed audio job' }).click()
  await expect(page.getByText(/Audio ready · seam RMS/)).toBeVisible({ timeout: 60_000 })
})

test('reports encoder worker startup, post, runtime, and message failures with retry', async ({ page }) => {
  await installWorkerFailureInjection(page)
  await page.goto('/')
  await expect(page.getByText(/Audio ready · seam RMS/)).toBeVisible({ timeout: 60_000 })
  const scenarios = [
    ['encoder-constructor', 'MP3 encoding could not start. Retry the export.'],
    ['encoder-post', 'The MP3 encoder stopped unexpectedly. Retry the export.'],
    ['encoder-runtime', 'The MP3 encoder stopped unexpectedly. Retry the export.'],
    ['encoder-message', 'The MP3 encoder returned an unreadable message. Retry the export.'],
  ] as const

  for (const [mode, message] of scenarios) {
    await setWorkerFailureMode(page, mode)
    await page.getByRole('button', { name: 'Export Game-ready MP3' }).click()
    await expect(page.getByText(message)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Retry failed audio job' })).toBeVisible()
  }
})

test('cancels MP3 export and ignores a stale encoded response', async ({ page }) => {
  await installWorkerFailureInjection(page)
  await page.goto('/')
  await expect(page.getByText(/Audio ready · seam RMS/)).toBeVisible({ timeout: 60_000 })
  await setWorkerFailureMode(page, 'encoder-stale')
  let downloads = 0
  page.on('download', () => { downloads += 1 })
  await page.getByRole('button', { name: 'Export Game-ready MP3' }).click()
  await expect(page.getByRole('button', { name: 'Cancel MP3 export' })).toBeVisible()
  await page.getByRole('button', { name: 'Cancel MP3 export' }).click()
  await expect(page.getByText('MP3 export cancelled.')).toBeVisible()
  await page.waitForTimeout(700)
  expect(downloads).toBe(0)
  await expect(page.getByText(/MP3 decoded and verified/)).toHaveCount(0)
})

test('cancels WAV stem export and ignores a stale exported-stems response', async ({ page }) => {
  await installWorkerFailureInjection(page)
  await page.goto('/')
  await expect(page.getByText(/Audio ready · seam RMS/)).toBeVisible({ timeout: 60_000 })
  await setWorkerFailureMode(page, 'stems-stale')
  let downloads = 0
  page.on('download', () => { downloads += 1 })
  const exportMp3 = page.getByRole('button', { name: 'Export Game-ready MP3' })
  const exportStems = page.getByRole('button', { name: 'Export WAV stems' })
  await exportStems.click()
  await expect(page.getByText('Rendering WAV stems')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Cancel WAV stems' })).toBeVisible()
  await expect(exportMp3).toBeDisabled()
  await page.getByRole('button', { name: 'Cancel WAV stems' }).click()
  await expect(page.getByText('WAV stem export cancelled.')).toBeVisible()
  await expect(exportMp3).toBeEnabled()
  await expect(exportStems).toBeEnabled()
  await page.waitForTimeout(700)
  expect(downloads).toBe(0)
  await expect(page.getByText('WAV stem export cancelled.')).toBeVisible()
  await expect(page.getByText(/WAV stem bundle exported/)).toHaveCount(0)
})

test('prevents concurrent audio exports and restores controls after cancellation', async ({ page }) => {
  await installWorkerFailureInjection(page)
  await page.goto('/')
  await expect(page.getByText(/Audio ready · seam RMS/)).toBeVisible({ timeout: 60_000 })
  await setWorkerFailureMode(page, 'encoder-stale')
  const exportMp3 = page.getByRole('button', { name: 'Export Game-ready MP3' })
  const exportStems = page.getByRole('button', { name: 'Export WAV stems' })
  await exportMp3.click()
  await expect(exportStems).toBeDisabled()
  await page.getByRole('button', { name: 'Cancel MP3 export' }).click()
  await expect(exportMp3).toBeEnabled()
  await expect(exportStems).toBeEnabled()
  await setWorkerFailureMode(page, 'stems-stale')
  await exportStems.click()
  await expect(exportMp3).toBeDisabled()
  await page.getByRole('button', { name: 'Cancel WAV stems' }).click()
  await expect(exportMp3).toBeEnabled()
  await expect(exportStems).toBeEnabled()
})

test('composition changes cancel MP3 export and prevent stale downloads', async ({ page }) => {
  await installWorkerFailureInjection(page)
  await page.goto('/')
  await expect(page.getByText(/Audio ready · seam RMS/)).toBeVisible({ timeout: 60_000 })
  await setWorkerFailureMode(page, 'encoder-stale')
  let downloads = 0
  page.on('download', () => { downloads += 1 })
  await page.getByRole('button', { name: 'Export Game-ready MP3' }).click()
  await expect(page.getByRole('button', { name: 'Cancel MP3 export' })).toBeVisible()
  await page.getByRole('button', { name: 'Mute', exact: false }).first().click()
  await setWorkerFailureMode(page, null)
  await expect(page.getByText(/Audio ready · seam RMS/)).toBeVisible({ timeout: 60_000 })
  await page.waitForTimeout(700)
  expect(downloads).toBe(0)
  await expect(page.getByRole('button', { name: 'Export Game-ready MP3' })).toBeEnabled()
})

test('edits generated notes and restores them with undo and redo', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText(/Audio ready · seam RMS/)).toBeVisible({ timeout: 60_000 })

  const pianoRoll = page.locator('canvas.piano-roll')
  const noteCount = async () => Number((await pianoRoll.getAttribute('aria-label'))?.match(/with (\d+) notes/)?.[1])
  const originalCount = await noteCount()
  await page.getByLabel('Grid resolution').selectOption('0.25')
  await page.getByRole('button', { name: 'Add note' }).click()
  await expect.poll(noteCount).toBe(originalCount + 1)
  await expect(page.getByText(/Audio ready · seam RMS/)).toBeVisible({ timeout: 60_000 })

  const start = page.getByLabel('Start beat')
  const duration = page.getByLabel('Duration in beats')
  const pitch = page.getByLabel(/MIDI pitch/)
  const velocity = page.getByLabel('Velocity percent')
  await start.fill('2.5')
  await start.press('Enter')
  await duration.fill('1.25')
  await duration.press('Enter')
  await pitch.fill('40')
  await pitch.press('Enter')
  await velocity.fill('42')
  await velocity.press('Enter')
  await expect(page.getByText(/Audio ready · seam RMS/)).toBeVisible({ timeout: 60_000 })

  await page.getByRole('button', { name: 'Previous note' }).click()
  await page.getByRole('button', { name: 'Next note' }).click()
  await expect(start).toHaveValue('2.5')
  await expect(duration).toHaveValue('1.25')
  await expect(pitch).toHaveValue('40')
  await expect(velocity).toHaveValue('42')

  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByText(/Audio ready · seam RMS/)).toBeVisible({ timeout: 60_000 })
  await expect(velocity).not.toHaveValue('42')
  await page.getByRole('button', { name: 'Redo' }).click()
  await expect(page.getByText(/Audio ready · seam RMS/)).toBeVisible({ timeout: 60_000 })
  await expect(velocity).toHaveValue('42')

  await page.getByRole('button', { name: 'Delete note' }).click()
  await expect.poll(noteCount).toBe(originalCount)
  await expect(page.getByRole('button', { name: 'Delete note' })).toBeDisabled()
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect.poll(noteCount).toBe(originalCount + 1)
  await expect(page.getByText(/Audio ready · seam RMS/)).toBeVisible({ timeout: 60_000 })
  await page.getByRole('button', { name: 'Redo' }).click()
  await expect.poll(noteCount).toBe(originalCount)
  await expect(page.getByText(/Audio ready · seam RMS/)).toBeVisible({ timeout: 60_000 })
  await expect(page.getByText(/worker stopped unexpectedly/i)).toHaveCount(0)
})

test('removes duplicated layers with undo and redo', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText(/Audio ready · seam RMS/)).toBeVisible({ timeout: 60_000 })

  const layerCount = page.locator('.mixer .eyebrow')
  const originalLayer = page.getByRole('button', { name: /^Select .* layer$/ }).first()
  const originalName = (await originalLayer.getAttribute('aria-label'))!.replace(/^Select | layer$/g, '')
  const originalCount = Number((await layerCount.textContent())!.match(/\d+/)![0])
  await expect(page.getByRole('button', { name: `Remove ${originalName}` })).toHaveCount(0)

  const exportMp3 = page.getByRole('button', { name: 'Export Game-ready MP3' })
  await page.getByRole('button', { name: `Duplicate ${originalName}` }).click()
  await expect(layerCount).toHaveText(`Layers (${originalCount + 1})`)
  await expect(exportMp3).toBeDisabled()
  await expect(exportMp3).toBeEnabled({ timeout: 60_000 })

  const removeCopy = page.getByRole('button', { name: `Remove ${originalName} copy 1` })
  await expect(removeCopy).toBeVisible()
  await removeCopy.focus()
  await removeCopy.press('Enter')
  await expect(layerCount).toHaveText(`Layers (${originalCount})`)
  await expect(removeCopy).toHaveCount(0)
  await expect(exportMp3).toBeDisabled()
  await expect(exportMp3).toBeEnabled({ timeout: 60_000 })
  await expect(page.getByText(/Audio ready · seam RMS/)).toBeVisible()

  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(layerCount).toHaveText(`Layers (${originalCount + 1})`)
  await expect(page.getByRole('button', { name: `Remove ${originalName} copy 1` })).toBeVisible()
  await expect(page.getByText(/Audio ready · seam RMS/)).toBeVisible({ timeout: 60_000 })
  await page.getByRole('button', { name: 'Redo' }).click()
  await expect(layerCount).toHaveText(`Layers (${originalCount})`)
  await expect(page.getByRole('button', { name: `Remove ${originalName} copy 1` })).toHaveCount(0)
  await expect(page.getByText(/Audio ready · seam RMS/)).toBeVisible({ timeout: 60_000 })

  await page.setViewportSize({ width: 390, height: 844 })
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(1)
})

test('selects layers and operates the professional editor controls', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText(/Audio ready · seam RMS/)).toBeVisible({ timeout: 60_000 })

  const layerButtons = page.getByRole('button', { name: /^Select .* layer$/ })
  await expect(layerButtons).toHaveCount(6)
  const secondLayerLabel = await layerButtons.nth(1).getAttribute('aria-label')
  await layerButtons.nth(1).click()
  await expect(layerButtons.nth(1)).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('canvas.piano-roll')).toHaveAttribute('aria-label', new RegExp(secondLayerLabel!.replace(/^Select | layer$/g, '')))

  await page.getByLabel('Grid resolution').selectOption('0.25')
  await page.getByRole('button', { name: 'Zoom in' }).click()
  await expect(page.getByRole('button', { name: 'Reset editor zoom' })).toContainText('1.5×')

  await page.getByRole('tab', { name: 'Arrangement' }).click()
  await expect(page.getByRole('tab', { name: 'Arrangement' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('canvas.arrangement-overview')).toBeVisible()

  const playbackPosition = page.getByLabel('Playback position')
  await playbackPosition.focus()
  await playbackPosition.press('Home')
  await expect(playbackPosition).toHaveValue('0')
  await playbackPosition.press('ArrowRight')
  expect(Number(await playbackPosition.inputValue())).toBeGreaterThan(0)
})

test('rejects unsafe project files without replacing the active composition', async ({ page }) => {
  await page.goto('/')
  const heading = page.getByRole('heading', { name: /measures/ })
  const originalHeading = await heading.textContent()
  await expect(page.getByText(/Audio ready · seam RMS/)).toBeVisible({ timeout: 60_000 })
  const play = page.getByRole('button', { name: 'Play', exact: true })
  await expect(play).toBeEnabled()
  await page.evaluate(() => {
    ;(window as typeof window & { fileTextCalls: number }).fileTextCalls = 0
    File.prototype.text = async () => {
      ;(window as typeof window & { fileTextCalls: number }).fileTextCalls += 1
      throw new Error('Oversized file content was read')
    }
  })

  await page.locator('input[type="file"]').setInputFiles({
    name: 'unsafe.loopsmith.json',
    mimeType: 'application/json',
    buffer: Buffer.alloc(5 * 1024 * 1024 + 1, 120),
  })

  await expect(page.getByText('Project files must be 5 MB or smaller.')).toBeVisible()
  expect(await page.evaluate(() => (window as typeof window & { fileTextCalls: number }).fileTextCalls)).toBe(0)
  await expect(heading).toHaveText(originalHeading ?? '')
  await expect(play).toBeEnabled()
  await play.click()
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible()
})

test('keeps the workspace within a mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /measures/ })).toBeVisible()
  await expect(page.getByRole('button', { name: 'New composition' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Load project' })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Select .* layer$/ }).first()).toBeVisible()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(1)
})
