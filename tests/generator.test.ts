import { describe, expect, it } from 'vitest'
import { calculateDuration, calculateMeasures, duplicateTrack, generateComposition, isDuplicatedTrack, removeDuplicatedTrack } from '../src/music/generator'
import { PRESETS, settingsFromPreset } from '../src/music/presets'
import { TRACK_RANGES } from '../src/music/theory'
import { MIDI_PERCUSSION_CHANNEL } from '../src/music/types'
import type { TrackRole } from '../src/music/types'

function maximumPolyphony(notes: { startBeats: number; durationBeats: number }[]): number {
  const endings: number[] = []
  let maximum = 0
  notes.slice().sort((a, b) => a.startBeats - b.startBeats).forEach((note) => {
    for (let index = endings.length - 1; index >= 0; index -= 1) {
      if (endings[index] <= note.startBeats + 0.00001) endings.splice(index, 1)
    }
    endings.push(note.startBeats + note.durationBeats)
    maximum = Math.max(maximum, endings.length)
  })
  return maximum
}

describe('deterministic procedural generation', () => {
  it.each(['toString', 'constructor', '__proto__', 'unsupported-role'])('rejects an untrusted duplicated-track role %s before generator dispatch', (role) => {
    const settings = settingsFromPreset('battle', 'untrusted-duplicate-role')
    const previous = duplicateTrack(generateComposition(settings), 'melody')
    const malformed = {
      ...previous,
      tracks: previous.tracks.map((track) => track.id === 'melody-copy-1' ? { ...track, role: role as TrackRole } : track),
    }

    expect(() => generateComposition(settings, malformed, 'melody-copy-1')).toThrow('Choose a supported track role.')
  })

  it.each<TrackRole>(['drums', 'bass', 'harmony', 'melody', 'countermelody', 'arpeggio'])('preserves deterministic %s duplicate regeneration', (role) => {
    const settings = { ...settingsFromPreset('battle', 'safe-duplicate-regeneration'), complexity: 5 }
    const original = generateComposition(settings)
    const previous = duplicateTrack(original, role)
    const before = structuredClone(previous)
    const copyId = `${role}-copy-1`
    const expected = generateComposition(settings, original, role).tracks.find((track) => track.id === role)!
    const regenerated = generateComposition(settings, previous, copyId)
    const copy = regenerated.tracks.find((track) => track.id === copyId)!

    expect(copy.notes).toEqual(expected.notes.map((note) => ({ ...note, id: `${copyId}-${note.id}` })))
    expect(copy.revision).toBe(1)
    expect(regenerated.tracks.find((track) => track.id === role)).toEqual(original.tracks.find((track) => track.id === role))
    expect(previous).toEqual(before)
  })

  it('reproduces the same composition for the same settings and seed', () => {
    const settings = settingsFromPreset('forest-exploration', 'repeatable-map-42')
    expect(generateComposition(settings)).toEqual(generateComposition({ ...settings }))
  })

  it('creates a distinct, repeatable numbered variation', () => {
    const base = settingsFromPreset('retro-platformer', 'repeatable-map-42')
    const original = generateComposition(base)
    const variation = generateComposition({ ...base, variation: 1 })
    expect(variation.tracks.find((track) => track.role === 'melody')?.notes).not.toEqual(original.tracks.find((track) => track.role === 'melody')?.notes)
    expect(generateComposition({ ...base, variation: 1 })).toEqual(variation)
  })

  it('keeps every preset near one minute using complete four-measure phrases', () => {
    PRESETS.forEach((preset) => {
      const settings = settingsFromPreset(preset.id, `duration-${preset.id}`)
      const measures = calculateMeasures(settings.tempo, settings.targetSeconds)
      const duration = calculateDuration(settings.tempo, measures)
      expect(measures % 4).toBe(0)
      expect(duration).toBeGreaterThanOrEqual(50)
      expect(duration).toBeLessThanOrEqual(70)
      const composition = generateComposition(settings)
      expect(composition.totalBeats).toBe(composition.measures * 4)
      expect(composition.durationSeconds).toBeCloseTo(duration, 8)
      expect(composition.sections.reduce((sum, section) => sum + section.measures, 0)).toBe(measures)
    })
  })

  it.each([
    [30, 60],
    [60, 90],
    [90, 102],
    [120, 192],
  ])('generates a phrase-aligned loop for a %i-second target at %i BPM', (targetSeconds, tempo) => {
    const settings = {
      ...settingsFromPreset('forest-exploration', `duration-${targetSeconds}-${tempo}`),
      targetSeconds,
      tempo,
      variation: 2,
    }
    const expectedMeasures = calculateMeasures(tempo, targetSeconds)
    const expectedDuration = expectedMeasures * 4 * 60 / tempo
    const composition = generateComposition(settings)

    expect(composition.measures).toBe(expectedMeasures)
    expect(composition.measures % 4).toBe(0)
    expect(composition.measures).toBeGreaterThanOrEqual(12)
    expect(composition.measures).toBeLessThanOrEqual(96)
    expect(composition.durationSeconds).toBeCloseTo(expectedDuration, 8)
    expect(calculateDuration(tempo, composition.measures)).toBeCloseTo(expectedDuration, 8)
    expect(composition.totalBeats).toBe(composition.measures * 4)
    expect(composition.sections.reduce((sum, section) => sum + section.measures, 0)).toBe(composition.measures)
    expect(generateComposition({ ...settings })).toEqual(composition)
  })

  it('enforces note ranges, end boundaries, and practical polyphony', () => {
    const composition = generateComposition(settingsFromPreset('boss-fight', 'range-stress'))
    const limits = { drums: 4, bass: 1, harmony: 3, melody: 1, countermelody: 1, arpeggio: 1 }
    composition.tracks.forEach((track) => {
      const [minimum, maximum] = TRACK_RANGES[track.role]
      track.notes.forEach((note) => {
        expect(note.midi).toBeGreaterThanOrEqual(minimum)
        expect(note.midi).toBeLessThanOrEqual(maximum)
        expect(note.startBeats + note.durationBeats).toBeLessThanOrEqual(composition.totalBeats + 0.0001)
      })
      expect(maximumPolyphony(track.notes)).toBeLessThanOrEqual(limits[track.role])
    })
  })

  it('preserves locked layers while regenerating the rest', () => {
    const settings = settingsFromPreset('mystery', 'locked-bells')
    const original = generateComposition(settings)
    const lockedNotes = original.tracks[3].notes
    const withLock = { ...original, tracks: original.tracks.map((track, index) => index === 3 ? { ...track, locked: true } : track) }
    const regenerated = generateComposition({ ...settings, variation: 2 }, withLock)
    expect(regenerated.tracks[3].notes).toEqual(lockedNotes)
    expect(regenerated.tracks[1].notes).not.toEqual(original.tracks[1].notes)
  })

  it('duplicates drums on the percussion channel without mutating the source', () => {
    const original = generateComposition(settingsFromPreset('battle', 'duplicate-rhythm'))
    const originalSnapshot = structuredClone(original)
    const source = original.tracks.find((track) => track.role === 'drums')!
    const duplicated = duplicateTrack(original, source.id)
    const copy = duplicated.tracks.at(-1)!

    expect(copy.role).toBe('drums')
    expect(copy.channel).toBe(MIDI_PERCUSSION_CHANNEL)
    expect(copy.notes).toEqual(source.notes.map((note) => ({
      ...note,
      id: `${note.id}-copy-1`,
    })))
    expect(copy.notes).not.toBe(source.notes)
    expect(original).toEqual(originalSnapshot)
  })

  it('keeps melodic duplicates off the percussion channel', () => {
    const original = generateComposition(settingsFromPreset('battle', 'duplicate-melody'))
    const source = original.tracks.find((track) => track.role === 'melody')!
    const copy = duplicateTrack(original, source.id).tracks.at(-1)!

    expect(copy.role).toBe('melody')
    expect(copy.channel).not.toBe(MIDI_PERCUSSION_CHANNEL)
  })

  it('removes exactly one duplicated layer without mutating the source', () => {
    const original = generateComposition(settingsFromPreset('battle', 'remove-duplicate'))
    const withCopies = duplicateTrack(duplicateTrack(original, 'melody'), 'melody')
    const originalSnapshot = structuredClone(withCopies)
    const removed = removeDuplicatedTrack(withCopies, 'melody-copy-1')

    expect(removed).not.toBe(withCopies)
    expect(removed.tracks).toHaveLength(withCopies.tracks.length - 1)
    expect(removed.tracks.some((track) => track.id === 'melody-copy-1')).toBe(false)
    expect(removed.tracks.some((track) => track.id === 'melody-copy-2')).toBe(true)
    expect(withCopies).toEqual(originalSnapshot)
    expect(isDuplicatedTrack(withCopies.tracks.find((track) => track.id === 'melody-copy-2')!)).toBe(true)
  })

  it('protects canonical layers and ignores unknown track IDs', () => {
    const composition = duplicateTrack(generateComposition(settingsFromPreset('battle', 'protected-layers')), 'bass')

    expect(removeDuplicatedTrack(composition, 'bass')).toBe(composition)
    expect(removeDuplicatedTrack(composition, 'missing-track')).toBe(composition)
    expect(isDuplicatedTrack(composition.tracks.find((track) => track.id === 'bass')!)).toBe(false)
  })

  it('frees capacity and assigns a unique ID after removing a middle copy', () => {
    let composition = generateComposition(settingsFromPreset('battle', 'duplicate-capacity'))
    const canonicalCount = composition.tracks.length
    while (composition.tracks.length < 16) composition = duplicateTrack(composition, 'melody')
    expect(duplicateTrack(composition, 'bass')).toBe(composition)

    const removed = removeDuplicatedTrack(composition, 'melody-copy-4')
    const duplicated = duplicateTrack(removed, 'melody')
    const ids = duplicated.tracks.map((track) => track.id)

    expect(removed.tracks).toHaveLength(15)
    expect(duplicated.tracks).toHaveLength(16)
    expect(ids).toHaveLength(new Set(ids).size)
    expect(duplicated.tracks.at(-1)?.id).toBe('melody-copy-4')
    expect(duplicated.tracks.filter((track) => isDuplicatedTrack(track))).toHaveLength(16 - canonicalCount)
  })

  it('assigns a collision-free suffix when duplicating a duplicate', () => {
    const original = generateComposition(settingsFromPreset('battle', 'nested-duplicate'))
    const firstCopy = duplicateTrack(original, 'melody')
    const duplicated = duplicateTrack(firstCopy, 'melody-copy-1')
    const ids = duplicated.tracks.map((track) => track.id)

    expect(duplicated.tracks.at(-1)?.id).toBe('melody-copy-1-copy-1')
    expect(ids).toHaveLength(new Set(ids).size)
  })
})
