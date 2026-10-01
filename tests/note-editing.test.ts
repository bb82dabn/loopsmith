import { describe, expect, it } from 'vitest'
import { addNote, deleteNote, nextEditedNoteId, normalizeNote, snapBeat, sortNotes, updateNote } from '../src/music/noteEditing'
import { serializeProject } from '../src/music/persistence'
import { settingsFromPreset } from '../src/music/presets'
import { TRACK_RANGES } from '../src/music/theory'
import { generateComposition } from '../src/music/generator'
import type { NoteEvent, Track, TrackRole } from '../src/music/types'
import { parseProjectFile } from '../src/music/validation'

function editableTrack(role: TrackRole = 'melody'): Track {
  return {
    id: `track-${role}`,
    name: role,
    role,
    channel: role === 'drums' ? 9 : 1,
    instrument: role === 'drums' ? 'noise-kit' : 'square-lead',
    notes: [
      { id: 'source-2', startBeats: 2, durationBeats: 1, midi: TRACK_RANGES[role][1], velocity: 0.8 },
      { id: 'source-1', startBeats: 1, durationBeats: 0.5, midi: TRACK_RANGES[role][0], velocity: 0.6 },
    ],
    volume: 0.8,
    pan: 0,
    mute: false,
    solo: false,
    octave: 0,
    locked: false,
    revision: 4,
  }
}

function expectValidNote(note: NoteEvent, role: TrackRole, totalBeats: number): void {
  expect(note.startBeats).toBeGreaterThanOrEqual(0)
  expect(note.startBeats).toBeLessThan(totalBeats)
  expect(note.durationBeats).toBeGreaterThan(0)
  expect(note.startBeats + note.durationBeats).toBeLessThanOrEqual(totalBeats)
  expect(note.midi).toBeGreaterThanOrEqual(TRACK_RANGES[role][0])
  expect(note.midi).toBeLessThanOrEqual(TRACK_RANGES[role][1])
  expect(note.velocity).toBeGreaterThanOrEqual(0)
  expect(note.velocity).toBeLessThanOrEqual(1)
}

describe('note editing', () => {
  it('sorts notes without mutating the input and snaps beats to the grid', () => {
    const track = editableTrack()
    const originalNotes = track.notes.slice()
    expect(sortNotes(track.notes).map((note) => note.id)).toEqual(['source-1', 'source-2'])
    expect(track.notes).toEqual(originalNotes)
    expect(snapBeat(1.13, 0.25)).toBe(1.25)
    expect(snapBeat(1.12, 0.25)).toBe(1)
  })

  it('adds a normalized, ordered note with a collision-free local ID immutably', () => {
    const track = { ...editableTrack(), notes: [...editableTrack().notes, { ...editableTrack().notes[0], id: 'edit-note-1' }] }
    const result = addNote(track, 8, 0.25, { startBeats: 1.13, durationBeats: 0.5, midi: 76, velocity: 0.75 })
    expect(result).not.toBe(track)
    expect(result.notes).not.toBe(track.notes)
    expect(track.notes).toHaveLength(3)
    expect(result.notes).toHaveLength(4)
    expect(result.notes.find((note) => note.id === 'edit-note-2')).toMatchObject({ startBeats: 1.25, durationBeats: 0.5, midi: 76, velocity: 0.75 })
    expect(nextEditedNoteId(result.notes)).toBe('edit-note-3')
    expect(result.notes).toEqual(sortNotes(result.notes))
    expect(result.revision).toBe(track.revision)
  })

  it.each(Object.keys(TRACK_RANGES) as TrackRole[])('clamps timing, pitch, and velocity for %s', (role) => {
    const track = editableTrack(role)
    const low = normalizeNote({ id: 'low', startBeats: -10, durationBeats: -2, midi: -100, velocity: -1 }, track, 4, 0.25)
    const high = normalizeNote({ id: 'high', startBeats: 99, durationBeats: 99, midi: 999, velocity: 9 }, track, 4, 0.25)
    expect(low).toMatchObject({ startBeats: 0, durationBeats: 0.25, midi: TRACK_RANGES[role][0], velocity: 0 })
    expect(high).toMatchObject({ startBeats: 3.75, durationBeats: 0.25, midi: TRACK_RANGES[role][1], velocity: 1 })
    expectValidNote(low, role, 4)
    expectValidNote(high, role, 4)
  })

  it('updates and deletes notes immutably while missing IDs are no-ops', () => {
    const track = editableTrack()
    const updated = updateNote(track, 'source-1', { startBeats: 7.999, durationBeats: 9, midi: 200, velocity: 2 }, 8, 0.5)
    expect(updated).not.toBe(track)
    expect(updated.notes).not.toBe(track.notes)
    expect(track.notes[1]).toMatchObject({ startBeats: 1, midi: TRACK_RANGES.melody[0] })
    expect(updated.notes.find((note) => note.id === 'source-1')).toMatchObject({ startBeats: 7.5, durationBeats: 0.5, midi: TRACK_RANGES.melody[1], velocity: 1 })
    expect(updateNote(track, 'missing', { midi: 70 }, 8, 0.25)).toBe(track)

    const deleted = deleteNote(updated, 'source-1')
    expect(deleted).not.toBe(updated)
    expect(deleted.notes).not.toBe(updated.notes)
    expect(deleted.notes.some((note) => note.id === 'source-1')).toBe(false)
    expect(deleteNote(track, 'missing')).toBe(track)
  })

  it('round-trips manual additions and edits without changing project version', () => {
    const composition = generateComposition(settingsFromPreset('melancholy', 'edited-roundtrip'))
    const source = composition.tracks.find((track) => track.role === 'melody')!
    const added = addNote(source, composition.totalBeats, 0.25, { startBeats: 3.1, durationBeats: 0.5, midi: 72, velocity: 0.75 })
    const noteId = added.notes.find((note) => note.id.startsWith('edit-note-'))!.id
    const edited = updateNote(added, noteId, { startBeats: 4.5, durationBeats: 1.25, midi: 74, velocity: 0.42 }, composition.totalBeats, 0.25)
    const changed = { ...composition, tracks: composition.tracks.map((track) => track.id === source.id ? edited : track) }
    const parsed = parseProjectFile(serializeProject(changed, '2026-09-12T12:00:00.000Z'))
    expect(parsed.version).toBe(composition.version)
    expect(parsed.composition).toEqual(changed)
  })
})
