import { SlidersHorizontal } from 'lucide-react'
import type { ComposerSettings, Composition, Track } from '../music/types'
import { TrackStrip } from './TrackStrip'

interface LayerMixerProps {
  composition: Composition
  settings: ComposerSettings
  activeTrackId: string
  onSelectTrack: (trackId: string) => void
  onChangeTrack: (trackId: string, patch: Partial<Track>) => void
  onRegenerateTrack: (trackId: string) => void
  onDuplicateTrack: (trackId: string) => void
  onRemoveTrack: (trackId: string) => void
}

export function LayerMixer({ composition, settings, activeTrackId, onSelectTrack, onChangeTrack, onRegenerateTrack, onDuplicateTrack, onRemoveTrack }: LayerMixerProps) {
  return (
    <section className="mixer panel">
      <div className="panel-heading mixer-heading">
        <div><span className="eyebrow">Layers ({composition.tracks.length})</span><h1><span className="sr-only">{composition.measures} measures · </span>{composition.title}</h1></div>
        <div className="composition-facts"><span>{settings.tempo} BPM</span><span>{settings.key} {settings.scale.replace('-', ' ')}</span><span><SlidersHorizontal size={13} /> Auto render</span></div>
      </div>
      <div className="layer-columns" aria-hidden="true"><span>#</span><span>Layer</span><span>Lock</span><span>Vol</span><span>Pan</span><span>Voice</span><span>Oct</span><span>Actions</span></div>
      <div className="track-list">
        {composition.tracks.map((track, index) => (
          <TrackStrip
            key={track.id}
            track={track}
            colorIndex={index}
            active={track.id === activeTrackId}
            onSelect={() => onSelectTrack(track.id)}
            onChange={(patch) => onChangeTrack(track.id, patch)}
            onRegenerate={() => onRegenerateTrack(track.id)}
            onDuplicate={() => onDuplicateTrack(track.id)}
            onRemove={() => onRemoveTrack(track.id)}
          />
        ))}
      </div>
    </section>
  )
}
