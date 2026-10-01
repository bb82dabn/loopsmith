import { TRACK_RANGES } from './theory'
import type { NoteEvent, Track } from './types'

export type GridDivision = 1 | 0.5 | 0.25

const roundBeat = (value: number): number => Number(value.toFixed(4))
const clamp = (value: number, minimum: number, maximum: number): number => Math.max(minimum, Math.min(maximum, value))

export function sortNotes(notes: readonly NoteEvent[]): NoteEvent[] {
  return [...notes].sort((left, right) => left.startBeats - right.startBeats || left.midi - right.midi || left.id.localeCompare(right.id))
}

export function snapBeat(beat: number, gridDivision: GridDivision): number {
  return roundBeat(Math.round(beat / gridDivision) * gridDivision)
}

export function nextEditedNoteId(notes: readonly NoteEvent[]): string {
  const ids = new Set(notes.map((note) => note.id))
  let index = 1
  while (ids.has(`edit-note-${index}`)) index += 1
  return `edit-note-${index}`
}

export function normalizeNote(note: NoteEvent, track: Pick<Track, 'role'>, totalBeats: number, gridDivision: GridDivision): NoteEvent {
  const minimumDuration = Math.min(gridDivision, totalBeats)
  const maximumStart = Math.max(0, totalBeats - minimumDuration)
  const startBeats = roundBeat(clamp(Number.isFinite(note.startBeats) ? note.startBeats : 0, 0, maximumStart))
  const durationBeats = roundBeat(clamp(Number.isFinite(note.durationBeats) ? note.durationBeats : minimumDuration, minimumDuration, totalBeats - startBeats))
  const range = TRACK_RANGES[track.role]
  return {
    ...note,
    startBeats,
    durationBeats,
    midi: clamp(Math.round(Number.isFinite(note.midi) ? note.midi : range[0]), range[0], range[1]),
    velocity: Number(clamp(Number.isFinite(note.velocity) ? note.velocity : 0.75, 0, 1).toFixed(4)),
  }
}

export function addNote(
  track: Track,
  totalBeats: number,
  gridDivision: GridDivision,
  values: Pick<NoteEvent, 'startBeats' | 'durationBeats' | 'midi' | 'velocity'>,
): Track {
  const note = normalizeNote({ id: nextEditedNoteId(track.notes), ...values, startBeats: snapBeat(values.startBeats, gridDivision) }, track, totalBeats, gridDivision)
  return { ...track, notes: sortNotes([...track.notes, note]) }
}

export function updateNote(
  track: Track,
  noteId: string,
  patch: Partial<Pick<NoteEvent, 'startBeats' | 'durationBeats' | 'midi' | 'velocity'>>,
  totalBeats: number,
  gridDivision: GridDivision,
): Track {
  const index = track.notes.findIndex((note) => note.id === noteId)
  if (index < 0) return track
  const current = track.notes[index]
  const updated = normalizeNote({ ...current, ...patch }, track, totalBeats, gridDivision)
  if (
    current.startBeats === updated.startBeats &&
    current.durationBeats === updated.durationBeats &&
    current.midi === updated.midi &&
    current.velocity === updated.velocity
  ) return track
  const notes = track.notes.map((note) => note.id === noteId ? updated : note)
  return { ...track, notes: sortNotes(notes) }
}

export function deleteNote(track: Track, noteId: string): Track {
  if (!track.notes.some((note) => note.id === noteId)) return track
  return { ...track, notes: track.notes.filter((note) => note.id !== noteId) }
}
