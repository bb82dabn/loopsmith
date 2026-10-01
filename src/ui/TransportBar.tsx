import {
  CircleHelp,
  FileInput,
  FilePlus2,
  Pause,
  Play,
  Redo2,
  Repeat2,
  Save,
  SkipBack,
  Undo2,
  Volume2,
} from 'lucide-react'
import type { PcmAudio } from '../music/types'
import { WaveformOverview } from './WaveformOverview'

interface TransportBarProps {
  title: string
  audio: PcmAudio | null
  isAudioCurrent: boolean
  isPlaying: boolean
  loopEnabled: boolean
  playheadSeconds: number
  durationSeconds: number
  masterVolume: number
  canUndo: boolean
  canRedo: boolean
  onTogglePlayback: () => void
  onStop: () => void
  onToggleLoop: () => void
  onSeek: (seconds: number) => void
  onVolumeChange: (volume: number) => void
  onNew: () => void
  onLoad: () => void
  onSave: () => void
  onUndo: () => void
  onRedo: () => void
  onHelp: () => void
}

function formatTime(seconds: number): string {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0)
  return `${Math.floor(safe / 60).toString().padStart(2, '0')}:${Math.floor(safe % 60).toString().padStart(2, '0')}`
}

export function TransportBar(props: TransportBarProps) {
  return (
    <header className="topbar">
      <a className="brand" href="./" aria-label="LoopSmith home">
        <img className="brand-logo" src="./loopsmith-logo.webp" alt="" />
        <small>Procedural music for your games</small>
      </a>

      <div className="transport-cluster" aria-label="Transport controls">
        <div className="transport-buttons">
          <button className="transport-button" aria-label="Stop and return to start" title="Stop" onClick={props.onStop}><SkipBack size={18} /></button>
          <button className="play-button" aria-label={props.isPlaying ? 'Pause' : 'Play'} onClick={props.onTogglePlayback} disabled={!props.isAudioCurrent}>
            {props.isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
          </button>
        </div>
        <div className="transport-time">
          <time>{formatTime(props.playheadSeconds)} <span>/ {formatTime(props.durationSeconds)}</span></time>
          <button className={props.loopEnabled ? 'loop-status active' : 'loop-status'} aria-label="Toggle loop playback" aria-pressed={props.loopEnabled} onClick={props.onToggleLoop}>
            <Repeat2 size={13} />{props.loopEnabled ? 'Looping' : 'Play once'}
          </button>
        </div>
      </div>

      <div className="top-waveform" aria-label={`Waveform for ${props.title}`}>
        <WaveformOverview
          audio={props.isAudioCurrent ? props.audio : null}
          currentSeconds={props.playheadSeconds}
          durationSeconds={props.durationSeconds}
          disabled={!props.isAudioCurrent}
          onSeek={props.onSeek}
        />
      </div>

      <label className="toolbar-volume">
        <Volume2 size={18} aria-hidden="true" />
        <span className="sr-only">Toolbar volume</span>
        <input aria-label="Toolbar volume" type="range" min="0" max="1" step="0.01" value={props.masterVolume} onChange={(event) => props.onVolumeChange(Number(event.target.value))} />
      </label>

      <nav className="top-actions" aria-label="Project actions">
        <button className="text-button" onClick={props.onNew} aria-label="New composition"><FilePlus2 size={16} /><span className="action-label">New</span></button>
        <button className="text-button" onClick={props.onLoad} aria-label="Load project"><FileInput size={16} /><span className="action-label">Load</span></button>
        <button className="text-button" onClick={props.onSave} aria-label="Save project"><Save size={16} /><span className="action-label">Save</span></button>
        <span className="toolbar-separator" aria-hidden="true" />
        <button className="icon-button" aria-label="Undo" title="Undo" disabled={!props.canUndo} onClick={props.onUndo}><Undo2 size={17} /></button>
        <button className="icon-button" aria-label="Redo" title="Redo" disabled={!props.canRedo} onClick={props.onRedo}><Redo2 size={17} /></button>
        <button className="icon-button" aria-label="Help" title="Help" onClick={props.onHelp}><CircleHelp size={18} /></button>
      </nav>
    </header>
  )
}
