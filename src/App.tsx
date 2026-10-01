import { useCallback, useEffect, useRef, useState } from 'react'
import { LoopAudioEngine } from './audio/engine'
import { renderNotePreview } from './audio/synthesis'
import { verifyEncodedMp3 } from './audio/verify'
import { encodeWav } from './audio/wav'
import { duplicateTrack, generateComposition, removeDuplicatedTrack } from './music/generator'
import { serializeMidi } from './music/midi'
import { loadAutosave, saveAutosave, serializeProject } from './music/persistence'
import { PRESETS, settingsFromPreset } from './music/presets'
import type { ComposerSettings, Composition, EncodeRequest, EncodeResponse, GenerationRequest, GenerationResponse, NoteEvent, PcmAudio, RenderRequest, RenderResponse, StemExportRequest, StemExportResponse, Track } from './music/types'
import { MAX_PROJECT_FILE_SIZE, parseProjectFile } from './music/validation'
import { ComposerControls } from './ui/ComposerControls'
import { EditorPanel } from './ui/EditorPanel'
import { useCompositionHistory } from './ui/history'
import { LayerMixer } from './ui/LayerMixer'
import { PlaybackExportPanel } from './ui/PlaybackExportPanel'
import { TransportBar } from './ui/TransportBar'
import { WorkerJobLifecycle } from './ui/workerJobs'

type JobState = {
  kind: 'idle' | 'working' | 'success' | 'error'
  label: string
  progress?: number
}

type RetryTarget = 'render' | 'export' | null

const idleJob = (label = 'Ready'): JobState => ({ kind: 'idle', label })
const initialComposition = () => loadAutosave() ?? generateComposition(settingsFromPreset('forest-exploration'))

function formatTime(seconds: number): string {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0)
  const minutes = Math.floor(safe / 60)
  return `${minutes}:${Math.floor(safe % 60).toString().padStart(2, '0')}`
}

function filename(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'loopsmith-loop'
}

function downloadBytes(bytes: Uint8Array | string, name: string, type: string): void {
  const blob = new Blob([bytes instanceof Uint8Array ? bytes.slice().buffer : bytes], { type })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function createRandomSeed(): string {
  return `forge-${crypto.getRandomValues(new Uint32Array(1))[0].toString(36)}`
}

export default function App() {
  const [initial] = useState(initialComposition)
  const { composition, commit, replace, undo, redo, canUndo, canRedo } = useCompositionHistory(initial)
  const [settings, setSettings] = useState<ComposerSettings>(composition.settings)
  const [activeTrackId, setActiveTrackId] = useState(composition.tracks[0]?.id ?? '')
  const [audio, setAudio] = useState<PcmAudio | null>(null)
  const [audioOwner, setAudioOwner] = useState<Composition | null>(null)
  const [generationJob, setGenerationJob] = useState<JobState>(idleJob())
  const [renderJob, setRenderJob] = useState<JobState>(idleJob())
  const [exportJob, setExportJob] = useState<JobState>(idleJob())
  const [stemJob, setStemJob] = useState<JobState>(idleJob())
  const [noticeJob, setNoticeJob] = useState<JobState>(idleJob())
  const [retryTarget, setRetryTarget] = useState<RetryTarget>(null)
  const [renderAttempt, setRenderAttempt] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playhead, setPlayhead] = useState(0)
  const [loopEnabled, setLoopEnabled] = useState(true)
  const [masterVolume, setMasterVolume] = useState(0.82)
  const [mp3Bitrate, setMp3Bitrate] = useState<96 | 128 | 192>(128)
  const [showHelp, setShowHelp] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const engineRef = useRef(new LoopAudioEngine())
  const generationJobsRef = useRef(new WorkerJobLifecycle())
  const renderJobsRef = useRef(new WorkerJobLifecycle())
  const exportJobsRef = useRef(new WorkerJobLifecycle())
  const stemJobsRef = useRef(new WorkerJobLifecycle())
  const isAudioCurrent = audio !== null && audioOwner === composition
  const browserSupported = engineRef.current.isSupported() && typeof Worker !== 'undefined'

  useEffect(() => {
    if (!composition.tracks.some((track) => track.id === activeTrackId)) {
      setActiveTrackId(composition.tracks[0]?.id ?? '')
    }
  }, [activeTrackId, composition.tracks])

  useEffect(() => {
    saveAutosave(composition)
    engineRef.current.stop()
    setIsPlaying(false)
    setPlayhead(0)
    setAudioOwner(null)
    exportJobsRef.current.cancel()
    stemJobsRef.current.cancel()
    setExportJob(idleJob())
    setStemJob(idleJob())
    setRetryTarget((current) => current === 'export' ? null : current)
    const lifecycle = renderJobsRef.current
    const jobId = lifecycle.start()
    const timer = window.setTimeout(() => {
      if (!lifecycle.isCurrent(jobId)) return
      setGenerationJob(idleJob())
      let worker: Worker
      try {
        worker = new Worker(new URL('./workers/render.worker.ts', import.meta.url), { type: 'module' })
      } catch {
        lifecycle.complete(jobId)
        setRenderJob({ kind: 'error', label: 'Audio rendering could not start. Retry the render.' })
        setRetryTarget('render')
        return
      }
      if (!lifecycle.attach(jobId, worker)) return
      setRenderJob({ kind: 'working', label: 'Preparing audio', progress: 0 })
      setRetryTarget((current) => current === 'render' ? null : current)
      worker.onmessage = (event: MessageEvent<RenderResponse>) => {
        const message = event.data
        if (message.jobId !== jobId || !lifecycle.isCurrent(jobId)) return
        if (message.type === 'progress') {
          setRenderJob({ kind: 'working', label: message.label, progress: message.progress })
          return
        }
        if (message.type === 'rendered') {
          const rendered: PcmAudio = {
            sampleRate: message.sampleRate,
            channels: [new Float32Array(message.left), new Float32Array(message.right)],
            durationSeconds: message.durationSeconds,
            loopMetrics: message.loopMetrics,
          }
          if (!lifecycle.complete(jobId)) return
          setAudio(rendered)
          setAudioOwner(composition)
          engineRef.current.load(rendered)
          setRenderJob({ kind: 'success', label: `Audio ready · seam RMS ${message.loopMetrics.rmsDiscontinuity.toFixed(4)}` })
          setRetryTarget((current) => current === 'render' ? null : current)
          return
        }
        if (!lifecycle.complete(jobId)) return
        setRenderJob({ kind: 'error', label: message.message })
        setRetryTarget('render')
      }
      const handleWorkerFailure = (event?: Event) => {
        event?.preventDefault()
        if (!lifecycle.complete(jobId)) return
        setRenderJob({ kind: 'error', label: event?.type === 'messageerror' ? 'The audio worker returned an unreadable message. Retry the render.' : 'The audio worker stopped unexpectedly. Retry the render.' })
        setRetryTarget('render')
      }
      worker.onerror = handleWorkerFailure
      worker.onmessageerror = handleWorkerFailure
      const request: RenderRequest = { type: 'render', jobId, composition, sampleRate: 44100 }
      try {
        worker.postMessage(request)
      } catch {
        handleWorkerFailure()
      }
    }, 260)
    return () => {
      window.clearTimeout(timer)
      if (lifecycle.isCurrent(jobId)) lifecycle.cancel()
    }
  }, [composition, renderAttempt])

  useEffect(() => {
    if (!isPlaying) return
    const interval = window.setInterval(() => {
      const current = engineRef.current.currentTime()
      setPlayhead(current)
      if (!loopEnabled && current >= composition.durationSeconds - 0.02) setIsPlaying(false)
    }, 50)
    return () => window.clearInterval(interval)
  }, [composition.durationSeconds, isPlaying, loopEnabled])

  useEffect(() => () => {
    generationJobsRef.current.dispose()
    renderJobsRef.current.dispose()
    exportJobsRef.current.dispose()
    stemJobsRef.current.dispose()
    engineRef.current.stop()
  }, [])

  const runGeneration = useCallback((nextSettings: ComposerSettings, regenerateTrackId?: string) => {
    const lifecycle = generationJobsRef.current
    const jobId = lifecycle.start()
    const applyGeneratedComposition = (generated: Composition) => {
      commit(generated)
      setSettings(generated.settings)
    }
    const generateWithoutWorker = () => {
      if (!lifecycle.isCurrent(jobId)) return
      try {
        setGenerationJob({ kind: 'working', label: 'Worker unavailable · composing safely', progress: 0.35 })
        const generated = generateComposition(nextSettings, composition, regenerateTrackId)
        if (!lifecycle.complete(jobId)) return
        applyGeneratedComposition(generated)
      } catch (error) {
        if (!lifecycle.complete(jobId)) return
        setGenerationJob({ kind: 'error', label: error instanceof Error ? error.message : 'Composition failed.' })
      }
    }
    let worker: Worker
    try {
      worker = new Worker(new URL('./workers/composition.worker.ts', import.meta.url), { type: 'module' })
    } catch {
      generateWithoutWorker()
      return
    }
    if (!lifecycle.attach(jobId, worker)) return
    setGenerationJob({ kind: 'working', label: regenerateTrackId ? 'Regenerating layer' : 'Composing arrangement', progress: 0.15 })
    worker.onmessage = (event: MessageEvent<GenerationResponse>) => {
      const message = event.data
      if (message.jobId !== jobId || !lifecycle.isCurrent(jobId)) return
      if (!lifecycle.complete(jobId)) return
      if (message.type === 'generated') {
        applyGeneratedComposition(message.composition)
      } else {
        setGenerationJob({ kind: 'error', label: message.message })
      }
    }
    const handleWorkerFailure = (event?: Event) => {
      event?.preventDefault()
      if (!lifecycle.isCurrent(jobId)) return
      worker.terminate()
      generateWithoutWorker()
    }
    worker.onerror = handleWorkerFailure
    worker.onmessageerror = handleWorkerFailure
    const request: GenerationRequest = { type: 'generate', jobId, settings: nextSettings, previous: composition, regenerateTrackId }
    try {
      worker.postMessage(request)
    } catch {
      handleWorkerFailure()
    }
  }, [commit, composition])

  const selectPreset = (id: string) => {
    const seed = settings.seed || 'loopsmith-001'
    setSettings(settingsFromPreset(id, seed))
  }

  const randomize = () => {
    const preset = PRESETS[Math.floor(Math.random() * PRESETS.length)]
    const randomized = settingsFromPreset(preset.id, createRandomSeed())
    randomized.tempo = Math.max(55, Math.min(185, randomized.tempo + Math.floor(Math.random() * 25) - 12))
    randomized.intensity = 1 + Math.floor(Math.random() * 5)
    randomized.complexity = 1 + Math.floor(Math.random() * 5)
    setSettings(randomized)
  }

  const randomizeSeed = () => setSettings((current) => ({ ...current, seed: createRandomSeed() }))

  const regenerateAll = () => {
    const next = { ...settings, variation: settings.variation + 1 }
    setSettings(next)
    runGeneration(next)
  }

  const updateTrack = (trackId: string, patch: Partial<Track>) => {
    commit((current) => ({ ...current, tracks: current.tracks.map((track) => track.id === trackId ? { ...track, ...patch } : track) }))
  }

  const togglePlayback = async () => {
    try {
      if (!isAudioCurrent) throw new Error('Wait for the current mix to finish rendering.')
      if (isPlaying) {
        engineRef.current.pause()
        setPlayhead(engineRef.current.currentTime())
        setIsPlaying(false)
      } else {
        await engineRef.current.play()
        setIsPlaying(true)
      }
    } catch (error) {
      setNoticeJob({ kind: 'error', label: error instanceof Error ? error.message : 'Playback failed.' })
    }
  }

  const seek = (seconds: number) => {
    engineRef.current.seek(seconds)
    setPlayhead(seconds)
  }

  const auditionNote = async (track: Track, note: NoteEvent) => {
    try {
      await engineRef.current.audition(renderNotePreview(track, note, composition.settings.tempo))
    } catch {
      setNoticeJob({ kind: 'error', label: 'Note audition failed.' })
    }
  }

  const stopPlayback = () => {
    engineRef.current.stop()
    setIsPlaying(false)
    setPlayhead(0)
  }

  const toggleLoop = () => {
    const next = !loopEnabled
    setLoopEnabled(next)
    engineRef.current.setLoop(next)
  }

  const changeMasterVolume = (volume: number) => {
    setMasterVolume(volume)
    engineRef.current.setVolume(volume)
  }

  const exportMidi = () => {
    try {
      const bytes = serializeMidi(composition)
      downloadBytes(bytes, `${filename(composition.title)}.mid`, 'audio/midi')
      setNoticeJob({ kind: 'success', label: `MIDI exported · ${composition.tracks.length} channels` })
    } catch (error) {
      setNoticeJob({ kind: 'error', label: error instanceof Error ? error.message : 'MIDI export failed.' })
    }
  }

  const exportWav = () => {
    if (!audio || !isAudioCurrent) {
      setNoticeJob({ kind: 'error', label: 'Wait for the current mix to finish rendering.' })
      return
    }
    const bytes = encodeWav(audio)
    downloadBytes(bytes, `${filename(composition.title)}.wav`, 'audio/wav')
    setNoticeJob({ kind: 'success', label: `Lossless WAV exported · ${formatTime(audio.durationSeconds)}` })
  }

  const exportMp3 = () => {
    if (stemJob.kind === 'working') return
    if (!audio || !isAudioCurrent) {
      setExportJob({ kind: 'error', label: 'Wait for the current mix to finish rendering.' })
      setRetryTarget(null)
      return
    }
    const lifecycle = exportJobsRef.current
    const jobId = lifecycle.start()
    setStemJob(idleJob())
    const title = composition.title
    const bitrate = mp3Bitrate
    const expectedSampleCount = audio.channels[0].length
    const left = audio.channels[0].slice().buffer
    const right = audio.channels[1].slice().buffer
    let worker: Worker
    try {
      worker = new Worker(new URL('./workers/encoder.worker.ts', import.meta.url), { type: 'module' })
    } catch {
      lifecycle.complete(jobId)
      setExportJob({ kind: 'error', label: 'MP3 encoding could not start. Retry the export.' })
      setRetryTarget('export')
      return
    }
    if (!lifecycle.attach(jobId, worker)) return
    setExportJob({ kind: 'working', label: `Encoding ${bitrate} kbps MP3`, progress: 0 })
    setRetryTarget((current) => current === 'export' ? null : current)
    worker.onmessage = async (event: MessageEvent<EncodeResponse>) => {
      const message = event.data
      if (message.jobId !== jobId || !lifecycle.isCurrent(jobId)) return
      if (message.type === 'progress') {
        setExportJob({ kind: 'working', label: `Encoding ${bitrate} kbps MP3`, progress: message.progress })
        return
      }
      if (message.type === 'error') {
        if (!lifecycle.complete(jobId)) return
        setExportJob({ kind: 'error', label: message.message })
        setRetryTarget('export')
        return
      }
      worker.terminate()
      try {
        const bytes = new Uint8Array(message.bytes)
        if (!lifecycle.isCurrent(jobId)) return
        setExportJob({ kind: 'working', label: 'Decoding and checking MP3 seam', progress: 0.96 })
        const verification = await verifyEncodedMp3(bytes, expectedSampleCount)
        if (!lifecycle.isCurrent(jobId)) return
        if (verification.metrics.rmsDiscontinuity > 0.08 || verification.metrics.peakDiscontinuity > 0.4) {
          throw new Error(`MP3 seam verification failed (RMS ${verification.metrics.rmsDiscontinuity.toFixed(4)}). Try WAV or another quality.`)
        }
        if (!lifecycle.isCurrent(jobId)) return
        downloadBytes(bytes, `${filename(title)}-${bitrate}k.mp3`, 'audio/mpeg')
        if (!lifecycle.complete(jobId)) return
        setExportJob({ kind: 'success', label: `MP3 decoded and verified · seam RMS ${verification.metrics.rmsDiscontinuity.toFixed(4)}` })
        setRetryTarget((current) => current === 'export' ? null : current)
      } catch (error) {
        if (!lifecycle.complete(jobId)) return
        setExportJob({ kind: 'error', label: error instanceof Error ? error.message : 'MP3 verification failed.' })
        setRetryTarget('export')
      }
    }
    const handleWorkerFailure = (event?: Event) => {
      event?.preventDefault()
      if (!lifecycle.complete(jobId)) return
      setExportJob({ kind: 'error', label: event?.type === 'messageerror' ? 'The MP3 encoder returned an unreadable message. Retry the export.' : 'The MP3 encoder stopped unexpectedly. Retry the export.' })
      setRetryTarget('export')
    }
    worker.onerror = handleWorkerFailure
    worker.onmessageerror = handleWorkerFailure
    const request: EncodeRequest = { type: 'encode', jobId, left, right, sampleRate: audio.sampleRate, bitrate }
    try {
      worker.postMessage(request, [left, right])
    } catch {
      handleWorkerFailure()
    }
  }

  const exportWavStems = () => {
    if (!composition || exportJob.kind === 'working') return
    const lifecycle = stemJobsRef.current
    const jobId = lifecycle.start()
    setExportJob(idleJob())
    const owner = composition
    let worker: Worker
    try {
      worker = new Worker(new URL('./workers/stems.worker.ts', import.meta.url), { type: 'module' })
    } catch {
      lifecycle.complete(jobId)
      setStemJob({ kind: 'error', label: 'WAV stem export could not start.' })
      return
    }
    if (!lifecycle.attach(jobId, worker)) return
    setStemJob({ kind: 'working', label: 'Preparing synchronized WAV stems', progress: 0 })
    worker.onmessage = (event: MessageEvent<StemExportResponse>) => {
      const message = event.data
      if (message.jobId !== jobId || owner !== composition || !lifecycle.isCurrent(jobId)) return
      if (message.type === 'progress') {
        setStemJob({ kind: 'working', label: message.label, progress: message.progress })
        return
      }
      if (message.type === 'error') {
        if (!lifecycle.complete(jobId)) return
        setStemJob({ kind: 'error', label: message.message })
        return
      }
      if (message.compositionId !== owner.id) return
      const bytes = new Uint8Array(message.bytes)
      downloadBytes(bytes, `${filename(owner.title)}-stems.zip`, 'application/zip')
      if (!lifecycle.complete(jobId)) return
      setStemJob({ kind: 'success', label: `WAV stem bundle exported · ${message.stemCount} synchronized layers` })
    }
    const handleWorkerFailure = (event?: Event) => {
      event?.preventDefault()
      if (!lifecycle.complete(jobId)) return
      setStemJob({ kind: 'error', label: event?.type === 'messageerror' ? 'The stem worker returned an unreadable message.' : 'The stem worker stopped unexpectedly.' })
    }
    worker.onerror = handleWorkerFailure
    worker.onmessageerror = handleWorkerFailure
    const request: StemExportRequest = { type: 'export-stems', jobId, composition: owner, sampleRate: 44100 }
    try {
      worker.postMessage(request)
    } catch {
      handleWorkerFailure()
    }
  }

  const cancelMp3Export = () => {
    if (!exportJobsRef.current.cancel()) return
    setExportJob(idleJob('MP3 export cancelled.'))
    setRetryTarget(null)
  }

  const cancelWavStemExport = () => {
    if (!stemJobsRef.current.cancel()) return
    setStemJob(idleJob('WAV stem export cancelled.'))
  }

  const retryFailedJob = () => {
    if (retryTarget === 'render') {
      setRetryTarget(null)
      setRenderAttempt((attempt) => attempt + 1)
    } else if (retryTarget === 'export') {
      exportMp3()
    }
  }

  const saveProject = () => {
    downloadBytes(serializeProject(composition), `${filename(composition.title)}.loopsmith.json`, 'application/json')
    setNoticeJob({ kind: 'success', label: 'Editable project saved' })
  }

  const loadProject = async (file: File) => {
    try {
      if (file.size > MAX_PROJECT_FILE_SIZE) throw new Error(`Project files must be ${MAX_PROJECT_FILE_SIZE / 1024 / 1024} MB or smaller.`)
      const project = parseProjectFile(await file.text())
      replace(project.composition)
      setSettings(project.composition.settings)
      setNoticeJob({ kind: 'success', label: `Loaded ${project.composition.title}` })
    } catch (error) {
      setNoticeJob({ kind: 'error', label: error instanceof Error ? error.message : 'Project load failed.' })
    }
  }

  const generationBusy = generationJob.kind === 'working'
  const exporting = exportJob.kind === 'working'
  const exportingStems = stemJob.kind === 'working'
  const job = noticeJob.kind === 'error'
    ? noticeJob
    : stemJob.kind === 'working' || stemJob.kind === 'error'
      ? stemJob
      : exportJob.kind === 'working'
      ? exportJob
      : renderJob.kind === 'working' || renderJob.kind === 'error'
        ? renderJob
        : generationJob.kind === 'working' || generationJob.kind === 'error'
          ? generationJob
          : stemJob.kind === 'success' || stemJob.label !== 'Ready'
            ? stemJob
            : exportJob.kind === 'error' || exportJob.kind === 'success' || exportJob.label !== 'Ready'
              ? exportJob
              : renderJob.kind === 'success' ? renderJob : generationJob.kind !== 'idle' ? generationJob : noticeJob
  const activeTrack = composition.tracks.find((track) => track.id === activeTrackId) ?? composition.tracks[0]

  return (
    <div className="app-shell">
      <TransportBar
        title={composition.title}
        audio={audio}
        isAudioCurrent={isAudioCurrent}
        isPlaying={isPlaying}
        loopEnabled={loopEnabled}
        playheadSeconds={playhead}
        durationSeconds={composition.durationSeconds}
        masterVolume={masterVolume}
        canUndo={canUndo}
        canRedo={canRedo}
        onTogglePlayback={() => void togglePlayback()}
        onStop={stopPlayback}
        onToggleLoop={toggleLoop}
        onSeek={seek}
        onVolumeChange={changeMasterVolume}
        onNew={() => runGeneration(settingsFromPreset('forest-exploration', `loopsmith-${Date.now().toString(36)}`))}
        onLoad={() => fileInputRef.current?.click()}
        onSave={saveProject}
        onUndo={undo}
        onRedo={redo}
        onHelp={() => setShowHelp((value) => !value)}
      />
      <input ref={fileInputRef} hidden type="file" accept=".json,.loopsmith.json,application/json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void loadProject(file); event.currentTarget.value = '' }} />

      {!browserSupported && <div className="browser-warning" role="alert">LoopSmith requires a current browser with Web Audio and Web Worker support. Composition data remains accessible, but playback and export are unavailable.</div>}

      <main className="workspace">
        <ComposerControls
          settings={settings}
          busy={generationBusy || !browserSupported}
          onChange={(patch) => setSettings((current) => ({ ...current, ...patch }))}
          onPreset={selectPreset}
          onRandomize={randomize}
          onRandomSeed={randomizeSeed}
          onGenerate={() => runGeneration(settings)}
          onRegenerate={regenerateAll}
        />

        <section className="studio-column">
          <LayerMixer
            composition={composition}
            settings={composition.settings}
            activeTrackId={activeTrackId}
            onSelectTrack={setActiveTrackId}
            onChangeTrack={updateTrack}
            onRegenerateTrack={(trackId) => runGeneration(settings, trackId)}
            onDuplicateTrack={(trackId) => commit((current) => duplicateTrack(current, trackId))}
            onRemoveTrack={(trackId) => commit((current) => removeDuplicatedTrack(current, trackId))}
          />
          {activeTrack && <EditorPanel composition={composition} activeTrack={activeTrack} playheadSeconds={playhead} onSeek={seek} onAuditionNote={(note) => void auditionNote(activeTrack, note)} onChangeTrack={updateTrack} />}
        </section>

        <PlaybackExportPanel
          composition={composition}
          audio={audio}
          isAudioCurrent={isAudioCurrent}
          exporting={exporting}
          exportingStems={exportingStems}
          masterVolume={masterVolume}
          mp3Bitrate={mp3Bitrate}
          job={job}
          retryable={retryTarget !== null && job.kind === 'error'}
          onVolumeChange={changeMasterVolume}
          onBitrateChange={setMp3Bitrate}
          onExportMp3={exportMp3}
          onCancelMp3={cancelMp3Export}
          onRetry={retryFailedJob}
          onExportWav={exportWav}
          onExportWavStems={exportWavStems}
          onCancelWavStems={cancelWavStemExport}
          onExportMidi={exportMidi}
          onSaveProject={saveProject}
        />
      </main>

      {showHelp && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setShowHelp(false)}>
          <section className="help-modal" role="dialog" aria-modal="true" aria-labelledby="help-title" onMouseDown={(event) => event.stopPropagation()}>
            <span className="eyebrow">Quick guide</span><h2 id="help-title">Build a repeatable game loop</h2>
            <ol><li>Choose a scene preset or shape the style, mood, key, instrumentation, intensity, and complexity.</li><li>Enter a seed. The same settings, seed, and variation always create the same notes.</li><li>Select a layer to inspect it in the piano roll. Lock favorites and regenerate the rest.</li><li>Mix, audition the seamless loop, then export MIDI, reference WAV, or verified MP3.</li></ol>
            <p>Keyboard tip: tab reaches every control; Space activates focused buttons.</p>
            <button className="generate-button" onClick={() => setShowHelp(false)}>Return to the studio</button>
          </section>
        </div>
      )}
    </div>
  )
}
