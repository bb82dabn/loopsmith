export const PROJECT_VERSION = 1 as const
export const MIDI_PERCUSSION_CHANNEL = 9

export type Style = 'adventure' | 'platformer' | 'rpg' | 'cinematic' | 'electronic'
export type Mood = 'peaceful' | 'bright' | 'mysterious' | 'tense' | 'heroic' | 'melancholy'
export type ScaleName = 'major' | 'natural-minor' | 'dorian' | 'mixolydian' | 'pentatonic'
export type Instrumentation = 'balanced' | 'chip' | 'orchestral' | 'hybrid'
export type TrackRole = 'drums' | 'bass' | 'harmony' | 'melody' | 'countermelody' | 'arpeggio'
export type InstrumentId =
  | 'noise-kit'
  | 'triangle-bass'
  | 'pulse-bass'
  | 'square-lead'
  | 'pulse-lead'
  | 'bell'
  | 'mallet'
  | 'strings'
  | 'brass'
  | 'warm-pad'

export interface ComposerSettings {
  presetId: string
  style: Style
  mood: Mood
  tempo: number
  key: string
  scale: ScaleName
  intensity: number
  instrumentation: Instrumentation
  complexity: number
  seed: string
  variation: number
  targetSeconds: number
}

export interface NoteEvent {
  id: string
  startBeats: number
  durationBeats: number
  midi: number
  velocity: number
}

export interface Track {
  id: string
  name: string
  role: TrackRole
  channel: number
  instrument: InstrumentId
  notes: NoteEvent[]
  volume: number
  pan: number
  mute: boolean
  solo: boolean
  octave: number
  locked: boolean
  revision: number
}

export interface ArrangementSection {
  id: string
  name: string
  startMeasure: number
  measures: number
}

export interface Composition {
  version: typeof PROJECT_VERSION
  id: string
  title: string
  settings: ComposerSettings
  beatsPerMeasure: 4
  measures: number
  totalBeats: number
  durationSeconds: number
  sections: ArrangementSection[]
  tracks: Track[]
}

export interface LoopMetrics {
  peakDiscontinuity: number
  rmsDiscontinuity: number
  windowSamples: number
}

export interface SerializedProject {
  format: 'loopsmith-project'
  version: typeof PROJECT_VERSION
  savedAt: string
  composition: Composition
}

export interface PcmAudio {
  sampleRate: number
  channels: [Float32Array, Float32Array]
  durationSeconds: number
  loopMetrics: LoopMetrics
}

export type GenerationRequest = {
  type: 'generate'
  jobId: string
  settings: ComposerSettings
  previous?: Composition
  regenerateTrackId?: string
}

export type GenerationResponse =
  | { type: 'generated'; jobId: string; composition: Composition }
  | { type: 'error'; jobId: string; message: string }

export type RenderRequest = { type: 'render'; jobId: string; composition: Composition; sampleRate?: number }
export type RenderResponse =
  | {
      type: 'rendered'
      jobId: string
      sampleRate: number
      left: ArrayBuffer
      right: ArrayBuffer
      durationSeconds: number
      loopMetrics: LoopMetrics
    }
  | { type: 'progress'; jobId: string; progress: number; label: string }
  | { type: 'error'; jobId: string; message: string }

export type EncodeRequest = {
  type: 'encode'
  jobId: string
  left: ArrayBuffer
  right: ArrayBuffer
  sampleRate: number
  bitrate: 96 | 128 | 192
}

export type EncodeResponse =
  | { type: 'progress'; jobId: string; progress: number }
  | { type: 'encoded'; jobId: string; bytes: ArrayBuffer }
  | { type: 'error'; jobId: string; message: string }

export interface RenderedStem extends PcmAudio {
  trackId: string
  name: string
  role: TrackRole
  channel: number
}

export interface StemRenderResult {
  mix: PcmAudio
  stems: RenderedStem[]
  normalization: number
  includedTrackIds: string[]
  excludedTrackIds: string[]
}

export interface StemManifest {
  format: 'loopsmith-stems'
  version: 1
  composition: { id: string; title: string }
  tempo: number
  meter: { beatsPerMeasure: number; beatUnit: 4 }
  durationSeconds: number
  sampleRate: number
  frameCount: number
  loopStartSample: 0
  loopEndSample: number
  normalization: number
  reconstructionTolerance: number
  mix: { filename: string; loopMetrics: LoopMetrics }
  includedTrackIds: string[]
  excludedTrackIds: string[]
  tracks: Array<{
    id: string
    name: string
    role: TrackRole
    channel: number
    instrument: InstrumentId
    volume: number
    pan: number
    octave: number
    mute: boolean
    solo: boolean
    filename: string | null
    loopMetrics: LoopMetrics | null
  }>
}

export type StemExportRequest = {
  type: 'export-stems'
  jobId: string
  composition: Composition
  sampleRate?: number
}

export type StemExportResponse =
  | { type: 'progress'; jobId: string; progress: number; label: string; trackId?: string }
  | { type: 'exported-stems'; jobId: string; compositionId: string; bytes: ArrayBuffer; stemCount: number }
  | { type: 'error'; jobId: string; message: string }
