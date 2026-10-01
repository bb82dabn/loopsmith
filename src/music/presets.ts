import type { ComposerSettings } from './types'

export type Preset = {
  id: string
  name: string
  description: string
  settings: Omit<ComposerSettings, 'seed' | 'variation' | 'targetSeconds' | 'presetId'>
}

export const PRESETS: Preset[] = [
  { id: 'peaceful-village', name: 'Peaceful village', description: 'Warm mallets and an easy pastoral pulse.', settings: { style: 'rpg', mood: 'peaceful', tempo: 84, key: 'C', scale: 'major', intensity: 2, instrumentation: 'hybrid', complexity: 2 } },
  { id: 'forest-exploration', name: 'Forest exploration', description: 'Curious motifs over a light walking rhythm.', settings: { style: 'adventure', mood: 'bright', tempo: 102, key: 'D', scale: 'dorian', intensity: 3, instrumentation: 'hybrid', complexity: 3 } },
  { id: 'dungeon-tension', name: 'Dungeon tension', description: 'Sparse pulses, low drones, and unresolved motion.', settings: { style: 'rpg', mood: 'tense', tempo: 92, key: 'D#', scale: 'natural-minor', intensity: 3, instrumentation: 'orchestral', complexity: 3 } },
  { id: 'battle', name: 'Battle', description: 'Urgent percussion and tightly developed hooks.', settings: { style: 'adventure', mood: 'heroic', tempo: 148, key: 'E', scale: 'natural-minor', intensity: 5, instrumentation: 'hybrid', complexity: 4 } },
  { id: 'boss-fight', name: 'Boss fight', description: 'Heavy brass gestures and relentless syncopation.', settings: { style: 'cinematic', mood: 'tense', tempo: 164, key: 'C', scale: 'natural-minor', intensity: 5, instrumentation: 'orchestral', complexity: 5 } },
  { id: 'mystery', name: 'Mystery', description: 'Bell fragments and shifting modal harmony.', settings: { style: 'rpg', mood: 'mysterious', tempo: 76, key: 'F#', scale: 'dorian', intensity: 2, instrumentation: 'hybrid', complexity: 4 } },
  { id: 'victory', name: 'Victory', description: 'A bright, compact fanfare with forward momentum.', settings: { style: 'cinematic', mood: 'heroic', tempo: 126, key: 'A#', scale: 'major', intensity: 4, instrumentation: 'orchestral', complexity: 3 } },
  { id: 'melancholy', name: 'Melancholy', description: 'Measured phrases and restrained harmonic color.', settings: { style: 'rpg', mood: 'melancholy', tempo: 70, key: 'A', scale: 'natural-minor', intensity: 2, instrumentation: 'orchestral', complexity: 3 } },
  { id: 'retro-platformer', name: 'Retro platformer', description: 'Bouncy pulse leads and playful counterpoint.', settings: { style: 'platformer', mood: 'bright', tempo: 132, key: 'G', scale: 'mixolydian', intensity: 4, instrumentation: 'chip', complexity: 4 } },
  { id: 'science-fiction-menu', name: 'Science-fiction menu', description: 'Glassy arpeggios over a suspended electronic bed.', settings: { style: 'electronic', mood: 'mysterious', tempo: 96, key: 'F', scale: 'pentatonic', intensity: 2, instrumentation: 'hybrid', complexity: 4 } },
]

export function settingsFromPreset(presetId: string, seed = 'loopsmith-001'): ComposerSettings {
  const preset = PRESETS.find((candidate) => candidate.id === presetId) ?? PRESETS[0]
  return {
    presetId: preset.id,
    ...preset.settings,
    seed,
    variation: 0,
    targetSeconds: 60,
  }
}
