import { AudioLines, Download, FileAudio, FileJson, FileMusic, Volume2 } from 'lucide-react'
import type { Composition, PcmAudio } from '../music/types'

export interface JobStateView {
  kind: 'idle' | 'working' | 'success' | 'error'
  label: string
  progress?: number
}

interface PlaybackExportPanelProps {
  composition: Composition
  audio: PcmAudio | null
  isAudioCurrent: boolean
  exporting: boolean
  exportingStems: boolean
  masterVolume: number
  mp3Bitrate: 96 | 128 | 192
  job: JobStateView
  retryable: boolean
  onVolumeChange: (volume: number) => void
  onBitrateChange: (bitrate: 96 | 128 | 192) => void
  onExportMp3: () => void
  onCancelMp3: () => void
  onRetry: () => void
  onExportWav: () => void
  onExportWavStems: () => void
  onCancelWavStems: () => void
  onExportMidi: () => void
  onSaveProject: () => void
}

function formatTime(seconds: number): string {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0)
  return `${Math.floor(safe / 60).toString().padStart(2, '0')}:${Math.floor(safe % 60).toString().padStart(2, '0')}`
}

export function PlaybackExportPanel(props: PlaybackExportPanelProps) {
  const masterDb = props.masterVolume === 0 ? '−∞ dB' : `${(20 * Math.log10(props.masterVolume)).toFixed(1)} dB`
  const seamWarning = Boolean(props.audio?.loopMetrics.rmsDiscontinuity && props.audio.loopMetrics.rmsDiscontinuity > 0.03)

  return (
    <aside className="playback-sidebar panel">
      <section className="sidebar-section playback-section">
        <h2>Playback</h2>
        <label className="playback-volume"><span>Master volume <output>{masterDb}</output></span><span className="volume-control"><Volume2 size={17} /><input aria-label="Master volume" type="range" min="0" max="1" step="0.01" value={props.masterVolume} onChange={(event) => props.onVolumeChange(Number(event.target.value))} /></span></label>
        <dl className="loop-details">
          <div><dt>Loop start</dt><dd>1.1.1</dd></div>
          <div><dt>Loop end</dt><dd>{props.composition.measures + 1}.1.1</dd></div>
          <div><dt>Length</dt><dd>{formatTime(props.composition.durationSeconds)}</dd></div>
          <div><dt>Boundary</dt><dd className={seamWarning ? 'warning-text' : ''}>{props.isAudioCurrent && props.audio ? `RMS ${props.audio.loopMetrics.rmsDiscontinuity.toFixed(4)}` : 'Rendering'}</dd></div>
        </dl>
      </section>

      <section className="sidebar-section export-section">
        <div className="sidebar-heading"><h2>Export</h2><Download size={17} aria-hidden="true" /></div>
        <label className="quality-select"><span>MP3 quality</span><select value={props.mp3Bitrate} onChange={(event) => props.onBitrateChange(Number(event.target.value) as 96 | 128 | 192)}><option value="96">96 kbps</option><option value="128">128 kbps</option><option value="192">192 kbps</option></select></label>
        <div className="export-list">
          <button onClick={props.onExportMp3} disabled={!props.isAudioCurrent || props.exporting || props.exportingStems} aria-label="Export Game-ready MP3"><FileAudio size={25} /><span><strong>Game-ready MP3</strong><small>Verified seamless playback</small></span><em>~1 MB</em></button>
          <button onClick={props.onExportWav} disabled={!props.isAudioCurrent}><AudioLines size={25} /><span><strong>Lossless WAV</strong><small>16-bit reference</small></span><em>~10 MB</em></button>
          <button onClick={props.onExportWavStems} disabled={props.exporting || props.exportingStems} aria-label="Export WAV stems"><AudioLines size={25} /><span><strong>WAV stems</strong><small>Mix, synchronized layers &amp; manifest</small></span><em>ZIP</em></button>
          <button onClick={props.onExportMidi}><FileMusic size={25} /><span><strong>Standard MIDI</strong><small>Programs &amp; channels</small></span><em>~25 KB</em></button>
          <button onClick={props.onSaveProject}><FileJson size={25} /><span><strong>LoopSmith project</strong><small>Editable JSON session</small></span><em>~5 KB</em></button>
        </div>
      </section>

      <section className="sidebar-section delivery-section">
        <div className={`job-state ${props.job.kind}`} role="status" aria-live="polite">
          {props.job.kind === 'working' && <span className="spinner" />}
          <div><strong>{props.job.kind === 'error' ? 'Action needed' : props.job.kind === 'working' ? 'Working' : props.job.kind === 'success' ? 'Complete' : 'Ready'}</strong><span>{props.job.label}</span></div>
          {props.job.kind === 'working' && <div className="progress-track"><span style={{ width: `${Math.round((props.job.progress ?? 0) * 100)}%` }} /></div>}
        </div>
        {(props.exporting || props.exportingStems || props.retryable) && <div className="delivery-actions">{props.exporting && <button type="button" aria-label="Cancel MP3 export" onClick={props.onCancelMp3}>Cancel MP3</button>}{props.exportingStems && <button type="button" aria-label="Cancel WAV stems" onClick={props.onCancelWavStems}>Cancel WAV stems</button>}{props.retryable && <button type="button" aria-label="Retry failed audio job" onClick={props.onRetry}>Retry</button>}</div>}
        <p>MP3 is ideal for in-game use. WAV is the exact reference for loop testing. MIDI can be edited in any DAW.</p>
        <dl className="project-summary"><div><dt>Tempo</dt><dd>{props.composition.settings.tempo} BPM</dd></div><div><dt>Meter</dt><dd>4/4</dd></div><div><dt>Key</dt><dd>{props.composition.settings.key} {props.composition.settings.scale.replace('-', ' ')}</dd></div></dl>
      </section>
    </aside>
  )
}
