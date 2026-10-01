import type { InstrumentId, Instrumentation, TrackRole } from './types'

export type InstrumentDefinition = {
  id: InstrumentId
  name: string
  family: string
  midiProgram: number
}

export const INSTRUMENTS: InstrumentDefinition[] = [
  { id: 'noise-kit', name: 'Noise kit', family: 'Percussion', midiProgram: 0 },
  { id: 'triangle-bass', name: 'Triangle bass', family: 'Bass', midiProgram: 38 },
  { id: 'pulse-bass', name: 'Pulse bass', family: 'Bass', midiProgram: 39 },
  { id: 'square-lead', name: 'Square lead', family: 'Lead', midiProgram: 80 },
  { id: 'pulse-lead', name: 'Pulse lead', family: 'Lead', midiProgram: 81 },
  { id: 'bell', name: 'Glass bell', family: 'Mallets', midiProgram: 98 },
  { id: 'mallet', name: 'Soft mallet', family: 'Mallets', midiProgram: 12 },
  { id: 'strings', name: 'Sampled strings', family: 'Ensemble', midiProgram: 48 },
  { id: 'brass', name: 'Console brass', family: 'Ensemble', midiProgram: 61 },
  { id: 'warm-pad', name: 'Warm pad', family: 'Pad', midiProgram: 89 },
]

export const INSTRUMENT_BY_ID = Object.fromEntries(
  INSTRUMENTS.map((instrument) => [instrument.id, instrument]),
) as Record<InstrumentId, InstrumentDefinition>

const roleOptions: Record<TrackRole, InstrumentId[]> = {
  drums: ['noise-kit'],
  bass: ['triangle-bass', 'pulse-bass'],
  harmony: ['strings', 'brass', 'warm-pad', 'mallet'],
  melody: ['square-lead', 'pulse-lead', 'bell', 'mallet'],
  countermelody: ['pulse-lead', 'bell', 'mallet', 'strings'],
  arpeggio: ['square-lead', 'bell', 'mallet'],
}

export function instrumentsForRole(role: TrackRole): InstrumentDefinition[] {
  return roleOptions[role].map((id) => INSTRUMENT_BY_ID[id])
}

export function defaultInstrument(role: TrackRole, palette: Instrumentation): InstrumentId {
  const palettes: Record<Instrumentation, Partial<Record<TrackRole, InstrumentId>>> = {
    balanced: { bass: 'triangle-bass', harmony: 'warm-pad', melody: 'square-lead', countermelody: 'mallet', arpeggio: 'bell' },
    chip: { bass: 'pulse-bass', harmony: 'pulse-lead', melody: 'square-lead', countermelody: 'pulse-lead', arpeggio: 'square-lead' },
    orchestral: { bass: 'triangle-bass', harmony: 'strings', melody: 'brass', countermelody: 'mallet', arpeggio: 'bell' },
    hybrid: { bass: 'triangle-bass', harmony: 'warm-pad', melody: 'pulse-lead', countermelody: 'mallet', arpeggio: 'bell' },
  }
  return role === 'drums' ? 'noise-kit' : (palettes[palette][role] ?? roleOptions[role][0])
}
