import { Copy, Lock, RefreshCw, Trash2, Unlock, Volume2, VolumeX } from 'lucide-react'
import { isDuplicatedTrack } from '../music/generator'
import { instrumentsForRole } from '../music/instruments'
import type { Track } from '../music/types'

const trackColors = ['#9b62ed', '#4f7ed2', '#389f91', '#79984f', '#c58a31', '#cb633d', '#b74570', '#6d85ba']

interface TrackStripProps {
  track: Track
  colorIndex: number
  active: boolean
  onSelect: () => void
  onChange: (patch: Partial<Track>) => void
  onRegenerate: () => void
  onDuplicate: () => void
  onRemove: () => void
}

export function TrackStrip({ track, colorIndex, active, onSelect, onChange, onRegenerate, onDuplicate, onRemove }: TrackStripProps) {
  return (
    <article className={active ? 'track-strip active' : 'track-strip'} style={{ '--track-color': trackColors[colorIndex % trackColors.length] } as React.CSSProperties}>
      <span className="track-number" aria-hidden="true">{colorIndex + 1}</span>
      <button className="track-identity" onClick={onSelect} aria-label={`Select ${track.name} layer`} aria-pressed={active}>
        <span className="track-dot" aria-hidden="true" />
        <span className="track-copy"><strong>{track.name}</strong><small>CH {track.channel + 1} · {track.notes.length} notes</small></span>
      </button>
      <button className="lock-button" title={track.locked ? 'Unlock layer' : 'Lock layer'} aria-label={track.locked ? `Unlock ${track.name}` : `Lock ${track.name}`} aria-pressed={track.locked} onClick={() => onChange({ locked: !track.locked })}>
        {track.locked ? <Lock size={17} /> : <Unlock size={17} />}
      </button>
      <label className="mini-fader">
        <span>Volume <output>{Math.round(track.volume * 100)}</output></span>
        <input aria-label={`${track.name} volume`} type="range" min="0" max="1" step="0.01" value={track.volume} onChange={(event) => onChange({ volume: Number(event.target.value) })} />
      </label>
      <label className="mini-fader">
        <span>Pan <output>{track.pan === 0 ? 'C' : `${Math.round(Math.abs(track.pan) * 100)}${track.pan < 0 ? 'L' : 'R'}`}</output></span>
        <input aria-label={`${track.name} pan`} type="range" min="-1" max="1" step="0.01" value={track.pan} onChange={(event) => onChange({ pan: Number(event.target.value) })} />
      </label>
      <label className="compact-control">
        <span>Voice</span>
        <select aria-label={`${track.name} voice`} value={track.instrument} onChange={(event) => onChange({ instrument: event.target.value as Track['instrument'] })}>
          {instrumentsForRole(track.role).map((instrument) => <option key={instrument.id} value={instrument.id}>{instrument.name}</option>)}
        </select>
      </label>
      <label className="octave-control">
        <span>Octave</span>
        <select aria-label={`${track.name} octave`} value={track.octave} onChange={(event) => onChange({ octave: Number(event.target.value) })}>
          {[-2, -1, 0, 1, 2].map((octave) => <option key={octave} value={octave}>{octave > 0 ? `+${octave}` : octave}</option>)}
        </select>
      </label>
      <div className="track-actions" aria-label={`${track.name} actions`}>
        <button className="icon-button" title="Regenerate layer" aria-label={`Regenerate ${track.name}`} onClick={onRegenerate} disabled={track.locked}><RefreshCw size={16} /></button>
        <button className="icon-button" title="Duplicate layer" aria-label={`Duplicate ${track.name}`} onClick={onDuplicate}><Copy size={16} /></button>
        {isDuplicatedTrack(track) && <button className="icon-button destructive" title="Remove duplicated layer" aria-label={`Remove ${track.name}`} onClick={onRemove}><Trash2 size={16} /></button>}
        <button className={track.mute ? 'icon-button active warning' : 'icon-button'} onClick={() => onChange({ mute: !track.mute })} aria-label={`Mute ${track.name}`} aria-pressed={track.mute} title={track.mute ? 'Unmute layer' : 'Mute layer'}>{track.mute ? <VolumeX size={16} /> : <Volume2 size={16} />}</button>
        <button className={track.solo ? 'solo-button active' : 'solo-button'} onClick={() => onChange({ solo: !track.solo })} aria-label={`Solo ${track.name}`} aria-pressed={track.solo} title="Solo layer">S</button>
      </div>
    </article>
  )
}
