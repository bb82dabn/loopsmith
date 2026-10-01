import { Dices, Landmark, RotateCcw, Sparkles } from 'lucide-react'
import { calculateDuration, calculateMeasures } from '../music/generator'
import { PRESETS } from '../music/presets'
import { KEYS } from '../music/theory'
import type { ComposerSettings } from '../music/types'

interface ComposerControlsProps {
  settings: ComposerSettings
  busy: boolean
  onChange: (patch: Partial<ComposerSettings>) => void
  onPreset: (id: string) => void
  onRandomize: () => void
  onRandomSeed: () => void
  onGenerate: () => void
  onRegenerate: () => void
}

export function ComposerControls({ settings, busy, onChange, onPreset, onRandomize, onRandomSeed, onGenerate, onRegenerate }: ComposerControlsProps) {
  const selectedPreset = PRESETS.find((preset) => preset.id === settings.presetId)
  const predictedMeasures = calculateMeasures(settings.tempo, settings.targetSeconds)
  const predictedDuration = calculateDuration(settings.tempo, predictedMeasures)

  return (
    <aside className="composer-panel panel">
      <section className="control-section preset-section">
        <div className="section-heading"><h2>Scene preset</h2><button className="icon-button" onClick={onRandomize} title="Randomize all settings" aria-label="Randomize all settings"><Dices size={17} /></button></div>
        <label className="preset-picker">
          <span className="preset-art" aria-hidden="true"><Landmark size={22} /></span>
          <span className="preset-copy"><span className="sr-only">Scene preset</span><select aria-label="Scene preset" value={settings.presetId} onChange={(event) => onPreset(event.target.value)}>{PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}</select><small>{selectedPreset?.description ?? 'A custom procedural configuration.'}</small></span>
        </label>
      </section>

      <section className="control-section">
        <h2>Musical controls</h2>
        <div className="control-grid">
          <label className="field"><span>Style</span><select value={settings.style} onChange={(event) => onChange({ style: event.target.value as ComposerSettings['style'], presetId: 'custom' })}><option value="adventure">Adventure</option><option value="platformer">Platformer</option><option value="rpg">RPG</option><option value="cinematic">Cinematic</option><option value="electronic">Electronic</option></select></label>
          <label className="field"><span>Mood</span><select value={settings.mood} onChange={(event) => onChange({ mood: event.target.value as ComposerSettings['mood'], presetId: 'custom' })}><option value="peaceful">Peaceful</option><option value="bright">Bright</option><option value="mysterious">Mysterious</option><option value="tense">Tense</option><option value="heroic">Heroic</option><option value="melancholy">Melancholy</option></select></label>
          <label className="range-field wide-control"><span>Tempo <output>{settings.tempo} BPM</output></span><input type="range" min="50" max="200" step="1" value={settings.tempo} onChange={(event) => onChange({ tempo: Number(event.target.value), presetId: 'custom' })} /></label>
          <label className="range-field wide-control"><span>Target duration <output>{settings.targetSeconds} seconds</output></span><input aria-label="Target duration" type="range" min="30" max="120" step="5" value={settings.targetSeconds} onChange={(event) => onChange({ targetSeconds: Number(event.target.value), presetId: 'custom' })} /><small>Requested {settings.targetSeconds}s · Generated result: {predictedMeasures} measures, {predictedDuration.toFixed(2)}s. Complete four-measure phrases, minimum 12 measures.</small></label>
          <label className="field"><span>Key</span><select value={settings.key} onChange={(event) => onChange({ key: event.target.value, presetId: 'custom' })}>{KEYS.map((key) => <option key={key}>{key}</option>)}</select></label>
          <label className="field"><span>Scale</span><select value={settings.scale} onChange={(event) => onChange({ scale: event.target.value as ComposerSettings['scale'], presetId: 'custom' })}><option value="major">Major (Ionian)</option><option value="natural-minor">Natural minor</option><option value="dorian">Dorian</option><option value="mixolydian">Mixolydian</option><option value="pentatonic">Pentatonic</option></select></label>
          <label className="range-field wide-control"><span>Intensity <output>{settings.intensity}/5</output></span><input type="range" min="1" max="5" step="1" value={settings.intensity} onChange={(event) => onChange({ intensity: Number(event.target.value), presetId: 'custom' })} /></label>
          <label className="field wide-control"><span>Instrumentation</span><select value={settings.instrumentation} onChange={(event) => onChange({ instrumentation: event.target.value as ComposerSettings['instrumentation'], presetId: 'custom' })}><option value="balanced">Balanced</option><option value="chip">Chip voices</option><option value="orchestral">Sampled-style</option><option value="hybrid">Hybrid</option></select></label>
          <label className="range-field wide-control"><span>Complexity <output>{settings.complexity}/5</output></span><input type="range" min="1" max="5" step="1" value={settings.complexity} onChange={(event) => onChange({ complexity: Number(event.target.value), presetId: 'custom' })} /></label>
        </div>
      </section>

      <section className="control-section seed-section">
        <h2>Seed &amp; variation</h2>
        <div className="seed-row">
          <label className="field"><span>Seed</span><input value={settings.seed} maxLength={80} spellCheck={false} onChange={(event) => onChange({ seed: event.target.value })} /></label>
          <button className="icon-button seed-button" onClick={onRandomSeed} title="Create random seed" aria-label="Create random value"><Dices size={17} /></button>
        </div>
        <label className="field variation-field"><span>Variation</span><input type="number" min="1" max="999" value={settings.variation + 1} onChange={(event) => onChange({ variation: Math.max(0, Number(event.target.value) - 1) })} /></label>
        <button className="generate-button" onClick={onGenerate} disabled={busy || !settings.seed.trim()}><Sparkles size={18} />{busy ? 'Forging loop…' : 'Generate composition'}</button>
        <div className="composer-secondary-actions">
          <button onClick={onRegenerate} disabled={busy}><RotateCcw size={15} />Regenerate all</button>
          <button onClick={onRandomSeed} disabled={busy}><Dices size={15} />Random seed</button>
        </div>
      </section>

      <p className="corpus-disclosure">Corpus-informed from 25 licensed MIDI works using aggregate statistics only. <a href="./CORPUS_ATTRIBUTION.txt" target="_blank" rel="noreferrer">Attribution</a></p>
    </aside>
  )
}
