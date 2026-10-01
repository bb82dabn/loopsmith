import { INSTRUMENT_BY_ID } from './instruments'
import { KEYS, TRACK_RANGES } from './theory'
import type { ComposerSettings, Composition, NoteEvent, SerializedProject, Track } from './types'
import { PROJECT_VERSION } from './types'

export const MAX_PROJECT_FILE_SIZE = 5 * 1024 * 1024

const MIN_MEASURES = 12
const MAX_MEASURES = 96
const MAX_SECTIONS = 24
const MAX_TRACKS = 16
const MAX_NOTES_PER_TRACK = 5_000
const MAX_TOTAL_NOTES = 10_000
const MAX_RENDERED_NOTE_SECONDS = 2_400
const MAX_ID_LENGTH = 120
const MAX_NAME_LENGTH = 160
const DURATION_TOLERANCE = 0.0001

const styles = new Set(['adventure', 'platformer', 'rpg', 'cinematic', 'electronic'])
const moods = new Set(['peaceful', 'bright', 'mysterious', 'tense', 'heroic', 'melancholy'])
const scales = new Set(['major', 'natural-minor', 'dorian', 'mixolydian', 'pentatonic'])
const palettes = new Set(['balanced', 'chip', 'orchestral', 'hybrid'])
const roles = new Set(['drums', 'bass', 'harmony', 'melody', 'countermelody', 'arpeggio'])
const instruments = new Set(Object.keys(INSTRUMENT_BY_ID))

export function validateSettings(settings: ComposerSettings): ComposerSettings {
  if (!styles.has(settings.style)) throw new Error('Choose a supported musical style.')
  if (!moods.has(settings.mood)) throw new Error('Choose a supported mood.')
  if (!scales.has(settings.scale)) throw new Error('Choose a supported scale.')
  if (!palettes.has(settings.instrumentation)) throw new Error('Choose a supported instrumentation palette.')
  if (!KEYS.includes(settings.key as (typeof KEYS)[number])) throw new Error('Choose a supported key.')
  if (!Number.isInteger(settings.tempo) || settings.tempo < 50 || settings.tempo > 200) throw new Error('Tempo must be a whole number from 50 to 200 BPM.')
  if (!Number.isInteger(settings.intensity) || settings.intensity < 1 || settings.intensity > 5) throw new Error('Intensity must be from 1 to 5.')
  if (!Number.isInteger(settings.complexity) || settings.complexity < 1 || settings.complexity > 5) throw new Error('Complexity must be from 1 to 5.')
  if (!settings.seed.trim() || settings.seed.length > 80) throw new Error('Seed must contain 1–80 characters.')
  if (!Number.isInteger(settings.variation) || settings.variation < 0 || settings.variation > 9999) throw new Error('Variation must be from 0 to 9999.')
  if (!Number.isFinite(settings.targetSeconds) || settings.targetSeconds < 30 || settings.targetSeconds > 120) throw new Error('Target duration must be from 30 to 120 seconds.')
  return settings
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isBoundedText(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength
}

function validateNote(note: unknown, totalBeats: number, role: Track['role']): note is NoteEvent {
  if (!note || typeof note !== 'object') return false
  const candidate = note as Partial<NoteEvent>
  const range = TRACK_RANGES[role]
  return (
    isBoundedText(candidate.id, MAX_ID_LENGTH) &&
    isFiniteNumber(candidate.startBeats) &&
    candidate.startBeats >= 0 &&
    candidate.startBeats < totalBeats &&
    isFiniteNumber(candidate.durationBeats) &&
    candidate.durationBeats > 0 &&
    candidate.startBeats + candidate.durationBeats <= totalBeats + 0.0001 &&
    typeof candidate.midi === 'number' &&
    Number.isInteger(candidate.midi) &&
    candidate.midi >= range[0] &&
    candidate.midi <= range[1] &&
    isFiniteNumber(candidate.velocity) &&
    candidate.velocity >= 0 &&
    candidate.velocity <= 1
  )
}

function validateComposition(value: unknown): value is Composition {
  if (!value || typeof value !== 'object') return false
  const composition = value as Partial<Composition>
  if (
    composition.version !== PROJECT_VERSION ||
    !isBoundedText(composition.id, MAX_ID_LENGTH) ||
    !isBoundedText(composition.title, MAX_NAME_LENGTH) ||
    composition.beatsPerMeasure !== 4 ||
    !Number.isInteger(composition.measures) ||
    typeof composition.measures !== 'number' ||
    composition.measures < MIN_MEASURES ||
    composition.measures > MAX_MEASURES ||
    composition.measures % 4 !== 0 ||
    !isFiniteNumber(composition.totalBeats) ||
    composition.totalBeats !== composition.measures * 4 ||
    !isFiniteNumber(composition.durationSeconds) ||
    composition.durationSeconds <= 0 ||
    !Array.isArray(composition.sections) ||
    !Array.isArray(composition.tracks) ||
    !composition.settings
  ) return false

  try {
    validateSettings(composition.settings)
  } catch {
    return false
  }

  const expectedDuration = composition.totalBeats * 60 / composition.settings.tempo
  if (Math.abs(composition.durationSeconds - expectedDuration) > DURATION_TOLERANCE) return false

  if (composition.sections.length < 1 || composition.sections.length > MAX_SECTIONS) return false
  const sectionIds = new Set<string>()
  let sectionBoundary = 0
  for (const section of composition.sections) {
    if (!section || typeof section !== 'object') return false
    const candidate = section as Partial<Composition['sections'][number]>
    if (
      !isBoundedText(candidate.id, MAX_ID_LENGTH) ||
      sectionIds.has(candidate.id) ||
      !isBoundedText(candidate.name, MAX_NAME_LENGTH) ||
      !Number.isInteger(candidate.startMeasure) ||
      candidate.startMeasure !== sectionBoundary ||
      !Number.isInteger(candidate.measures) ||
      typeof candidate.measures !== 'number' ||
      candidate.measures <= 0
    ) return false
    sectionIds.add(candidate.id)
    sectionBoundary += candidate.measures
    if (sectionBoundary > composition.measures) return false
  }
  if (sectionBoundary !== composition.measures) return false

  if (composition.tracks.length < 5 || composition.tracks.length > MAX_TRACKS) return false
  const trackIds = new Set<string>()
  let totalNotes = 0
  let renderedNoteSeconds = 0
  const secondsPerBeat = 60 / composition.settings.tempo
  return composition.tracks.every((track) => {
    if (!track || typeof track !== 'object') return false
    const candidate = track as Partial<Track>
    if (
      !isBoundedText(candidate.id, MAX_ID_LENGTH) ||
      trackIds.has(candidate.id) ||
      !isBoundedText(candidate.name, MAX_NAME_LENGTH) ||
      typeof candidate.role !== 'string' ||
      !roles.has(candidate.role) ||
      !Number.isInteger(candidate.channel) ||
      candidate.channel! < 0 || candidate.channel! > 15 ||
      typeof candidate.instrument !== 'string' ||
      !instruments.has(candidate.instrument) ||
      !Array.isArray(candidate.notes) ||
      candidate.notes.length > MAX_NOTES_PER_TRACK ||
      !isFiniteNumber(candidate.volume) || candidate.volume < 0 || candidate.volume > 1 ||
      !isFiniteNumber(candidate.pan) || candidate.pan < -1 || candidate.pan > 1 ||
      typeof candidate.mute !== 'boolean' ||
      typeof candidate.solo !== 'boolean' ||
      !Number.isInteger(candidate.octave) || candidate.octave! < -2 || candidate.octave! > 2 ||
      typeof candidate.locked !== 'boolean' ||
      !Number.isInteger(candidate.revision) || candidate.revision! < 0
    ) return false

    trackIds.add(candidate.id)
    totalNotes += candidate.notes.length
    if (totalNotes > MAX_TOTAL_NOTES) return false
    const noteIds = new Set<string>()
    return candidate.notes.every((note) => {
      if (!validateNote(note, composition.totalBeats!, candidate.role as Track['role']) || noteIds.has(note.id)) return false
      renderedNoteSeconds += note.durationBeats * secondsPerBeat
      if (renderedNoteSeconds > MAX_RENDERED_NOTE_SECONDS) return false
      noteIds.add(note.id)
      return true
    })
  })
}

export function parseProjectFile(raw: string): SerializedProject {
  if (raw.length > MAX_PROJECT_FILE_SIZE) throw new Error(`Project files must be ${MAX_PROJECT_FILE_SIZE / 1024 / 1024} MB or smaller.`)
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    throw new Error('This is not valid JSON.')
  }
  if (!value || typeof value !== 'object') throw new Error('Project data must be an object.')
  const project = value as Partial<SerializedProject>
  if (project.format !== 'loopsmith-project') throw new Error('This is not a LoopSmith project file.')
  if (project.version !== PROJECT_VERSION) throw new Error(`Project version ${String(project.version)} is not supported.`)
  if (typeof project.savedAt !== 'string' || !Number.isFinite(Date.parse(project.savedAt)) || !validateComposition(project.composition)) throw new Error('The project is incomplete or contains invalid musical data.')
  return project as SerializedProject
}
