import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'

const projectRoot = resolve(import.meta.dirname, '..')
const outputDir = resolve(projectRoot, 'release', 'itch', 'media')
const origin = 'http://127.0.0.1:4187'
mkdirSync(outputDir, { recursive: true })

const server = spawn(process.execPath, ['server.mjs'], {
  cwd: projectRoot,
  env: { ...process.env, HOST: '127.0.0.1', PORT: '4187' },
  stdio: ['ignore', 'pipe', 'pipe'],
})

async function waitForServer() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(`${origin}/healthz`)
      if (response.ok) return
    } catch {
      // The server may still be starting.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100))
  }
  throw new Error('Timed out waiting for the media capture server')
}

async function waitForAudio(page) {
  await page.getByText(/Audio ready · seam RMS/).waitFor({ state: 'visible', timeout: 60_000 })
}

async function generate(page, preset, seed) {
  await page.getByLabel('Scene preset').selectOption(preset)
  await page.getByLabel('Seed').fill(seed)
  await page.getByRole('button', { name: 'Generate composition' }).click()
  await waitForAudio(page)
}

let browser
try {
  await waitForServer()
  browser = await chromium.launch({ channel: 'chrome' })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
  const page = await context.newPage()
  await page.goto(origin)
  await waitForAudio(page)

  await generate(page, 'peaceful-village', 'itch-launch-village')
  await page.screenshot({ path: resolve(outputDir, 'screenshot-01-composer.png') })

  await generate(page, 'dungeon-tension', 'itch-launch-dungeon')
  await page.locator('.mixer').scrollIntoViewIfNeeded()
  await page.waitForTimeout(250)
  await page.screenshot({ path: resolve(outputDir, 'screenshot-02-mixer.png') })

  await page.setViewportSize({ width: 1000, height: 720 })
  await page.locator('.export-panel').scrollIntoViewIfNeeded()
  await page.waitForTimeout(250)
  await page.locator('.export-panel').screenshot({ path: resolve(outputDir, 'screenshot-03-exports.png') })

  const cover = await context.newPage()
  await cover.setViewportSize({ width: 630, height: 500 })
  await cover.setContent(`<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <style>
          * { box-sizing: border-box; }
          html, body { width: 630px; height: 500px; margin: 0; overflow: hidden; }
          body { background: #111310; color: #f0eee5; font-family: Inter, Arial, sans-serif; }
          .frame { width: 100%; height: 100%; padding: 38px 42px 34px; display: grid; grid-template-rows: auto 1fr auto; border: 1px solid #353931; position: relative; }
          .frame::before { content: ''; position: absolute; inset: 0; opacity: .2; background-image: linear-gradient(#353931 1px, transparent 1px), linear-gradient(90deg, #353931 1px, transparent 1px); background-size: 32px 32px; }
          .brand, .content, .formats { position: relative; z-index: 1; }
          .brand { display: flex; align-items: center; gap: 13px; color: #b6b8ad; font: 700 13px/1.2 ui-monospace, SFMono-Regular, Consolas, monospace; letter-spacing: .15em; text-transform: uppercase; }
          .mark { width: 42px; height: 42px; display: grid; place-items: center; background: #efb654; border: 1px solid #f2c66e; }
          .content { align-self: center; }
          .eyebrow { color: #efb654; font: 700 12px/1 ui-monospace, SFMono-Regular, Consolas, monospace; letter-spacing: .17em; text-transform: uppercase; margin-bottom: 18px; }
          h1 { margin: 0; max-width: 520px; font-size: 70px; line-height: .9; letter-spacing: -.065em; }
          .tagline { margin: 21px 0 0; max-width: 470px; color: #b6b8ad; font-size: 20px; line-height: 1.35; }
          .formats { display: flex; align-items: center; justify-content: space-between; padding-top: 20px; border-top: 1px solid #454a40; }
          .formats span { color: #f0eee5; font: 700 12px/1 ui-monospace, SFMono-Regular, Consolas, monospace; letter-spacing: .1em; }
          .formats strong { color: #7fc6ae; font-size: 12px; letter-spacing: .08em; text-transform: uppercase; }
        </style>
      </head>
      <body>
        <main class="frame">
          <div class="brand">
            <span class="mark">
              <svg width="27" height="27" viewBox="0 0 64 64" aria-hidden="true"><path d="M4 33c7-17 14-17 21 0s14 17 21 0 14-17 14 0" fill="none" stroke="#15170f" stroke-width="7" stroke-linecap="round"/></svg>
            </span>
            Procedural score forge
          </div>
          <div class="content">
            <div class="eyebrow">Browser music composer</div>
            <h1>LoopSmith</h1>
            <p class="tagline">Forge deterministic, seamless game-music loops.</p>
          </div>
          <div class="formats"><span>MP3 · WAV · MIDI · PROJECT</span><strong>10 scene presets</strong></div>
        </main>
      </body>
    </html>`)
  await cover.screenshot({ path: resolve(outputDir, 'cover-630x500.png') })
  await context.close()
  console.log(`Captured itch.io media in ${outputDir}`)
} finally {
  await browser?.close()
  server.kill('SIGTERM')
}
