import { describe, expect, it } from 'vitest'
import { duplicateTrack, generateComposition, removeDuplicatedTrack } from '../src/music/generator'
import { serializeProject } from '../src/music/persistence'
import { PRESETS, settingsFromPreset } from '../src/music/presets'
import type { SerializedProject } from '../src/music/types'
import { MAX_PROJECT_FILE_SIZE, parseProjectFile } from '../src/music/validation'

function validProject(): SerializedProject {
  return JSON.parse(serializeProject(generateComposition(settingsFromPreset('victory', 'validation-test')), '2026-08-14T12:00:00.000Z')) as SerializedProject
}

function mutatedProject(mutate: (project: SerializedProject) => void): string {
  const project = validProject()
  mutate(project)
  return JSON.stringify(project)
}

describe('editable project persistence', () => {
  it('round-trips a complete composition without changing musical data', () => {
    const composition = generateComposition(settingsFromPreset('melancholy', 'save-roundtrip'))
    const serialized = serializeProject(composition, '2026-08-14T12:00:00.000Z')
    expect(parseProjectFile(serialized).composition).toEqual(composition)
  })

  it('round-trips a composition after removing a middle duplicate and duplicating again', () => {
    const original = generateComposition(settingsFromPreset('battle', 'removed-copy-roundtrip'))
    const withCopies = duplicateTrack(duplicateTrack(duplicateTrack(original, 'melody'), 'melody'), 'melody')
    const removed = removeDuplicatedTrack(withCopies, 'melody-copy-2')
    const composition = duplicateTrack(removed, 'melody')
    const trackIds = composition.tracks.map((track) => track.id)
    const parsed = parseProjectFile(serializeProject(composition, '2026-08-14T12:00:00.000Z')).composition

    expect(composition.tracks).toHaveLength(original.tracks.length + 3)
    expect(trackIds).toHaveLength(new Set(trackIds).size)
    expect(parsed).toEqual(composition)
  })

  it.each(PRESETS.flatMap((preset) => [30, 120].map((targetSeconds) => [preset.id, targetSeconds] as const)))(
    'accepts generated %s projects at %i seconds',
    (presetId, targetSeconds) => {
      const settings = { ...settingsFromPreset(presetId, `boundary-${targetSeconds}`), targetSeconds }
      expect(parseProjectFile(serializeProject(generateComposition(settings))).composition.settings).toEqual(settings)
    },
  )

  it.each([
    ['not json', '{ broken'],
    ['wrong format', JSON.stringify({ format: 'other', version: 1 })],
    ['missing composition', JSON.stringify({ format: 'loopsmith-project', version: 1, savedAt: 'today' })],
  ])('rejects malformed save data: %s', (_label, input) => {
    expect(() => parseProjectFile(input)).toThrow()
  })

  it.each([
    ['zero measures', (project: SerializedProject) => { project.composition.measures = 0 }],
    ['too few measures', (project: SerializedProject) => { project.composition.measures = 8 }],
    ['too many measures', (project: SerializedProject) => { project.composition.measures = 100 }],
    ['non-four-bar measures', (project: SerializedProject) => { project.composition.measures = 13 }],
    ['inconsistent total beats', (project: SerializedProject) => { project.composition.totalBeats += 4 }],
    ['negative duration', (project: SerializedProject) => { project.composition.durationSeconds = -1 }],
    ['excessive duration', (project: SerializedProject) => { project.composition.durationSeconds = 100_000 }],
    ['inconsistent duration', (project: SerializedProject) => { project.composition.durationSeconds += 1 }],
    ['empty sections', (project: SerializedProject) => { project.composition.sections = [] }],
    ['section gap', (project: SerializedProject) => { project.composition.sections[1].startMeasure += 1 }],
    ['section overlap', (project: SerializedProject) => { project.composition.sections[1].startMeasure -= 1 }],
    ['section past boundary', (project: SerializedProject) => { project.composition.sections.at(-1)!.measures += 4 }],
    ['duplicate section ID', (project: SerializedProject) => { project.composition.sections[1].id = project.composition.sections[0].id }],
    ['duplicate track ID', (project: SerializedProject) => { project.composition.tracks[1].id = project.composition.tracks[0].id }],
    ['duplicate note ID', (project: SerializedProject) => { project.composition.tracks[0].notes[1].id = project.composition.tracks[0].notes[0].id }],
    ['invalid saved timestamp', (project: SerializedProject) => { project.savedAt = 'today' }],
    ['empty composition ID', (project: SerializedProject) => { project.composition.id = '' }],
    ['empty title', (project: SerializedProject) => { project.composition.title = '   ' }],
    ['empty track ID', (project: SerializedProject) => { project.composition.tracks[0].id = '' }],
    ['empty track name', (project: SerializedProject) => { project.composition.tracks[0].name = '' }],
    ['inherited instrument name', (project: SerializedProject) => { project.composition.tracks[0].instrument = 'constructor' as never }],
    ['prototype instrument name', (project: SerializedProject) => { project.composition.tracks[0].instrument = '__proto__' as never }],
    ['empty note ID', (project: SerializedProject) => { project.composition.tracks[0].notes[0].id = '' }],
  ])('rejects unsafe project data: %s', (_label, mutate) => {
    expect(() => parseProjectFile(mutatedProject(mutate))).toThrow(/invalid musical data/i)
  })

  it('rejects excessive notes per track', () => {
    expect(() => parseProjectFile(mutatedProject((project) => {
      const note = project.composition.tracks[0].notes[0]
      project.composition.tracks[0].notes = Array.from({ length: 10_001 }, (_, index) => ({ ...note, id: `note-${index}` }))
    }))).toThrow(/invalid musical data/i)
  })

  it('rejects excessive notes across the composition', () => {
    expect(() => parseProjectFile(mutatedProject((project) => {
      project.composition.tracks = Array.from({ length: 16 }, (_, trackIndex) => {
        const source = project.composition.tracks[trackIndex % project.composition.tracks.length]
        const note = source.notes[0]
        return {
          ...source,
          id: `track-${trackIndex}`,
          notes: Array.from({ length: 626 }, (_, noteIndex) => ({ ...note, id: `note-${trackIndex}-${noteIndex}` })),
        }
      })
    }))).toThrow(/invalid musical data/i)
  })

  it('rejects excessive aggregate synthesis work', () => {
    expect(() => parseProjectFile(mutatedProject((project) => {
      project.composition.tracks.forEach((track, trackIndex) => {
        const note = track.notes[0]
        track.notes = Array.from({ length: 500 }, (_, noteIndex) => ({
          ...note,
          id: `long-note-${trackIndex}-${noteIndex}`,
          startBeats: 0,
          durationBeats: project.composition.totalBeats,
        }))
      })
    }))).toThrow(/invalid musical data/i)
  })

  it('rejects raw input beyond the declared size limit before parsing', () => {
    expect(() => parseProjectFile('x'.repeat(MAX_PROJECT_FILE_SIZE + 1))).toThrow(/5 MB or smaller/i)
  })

  it('rejects notes that cross the exact loop boundary', () => {
    const composition = generateComposition(settingsFromPreset('victory', 'bad-note'))
    composition.tracks[0].notes[0].startBeats = composition.totalBeats - 0.1
    composition.tracks[0].notes[0].durationBeats = 1
    expect(() => parseProjectFile(serializeProject(composition))).toThrow(/invalid musical data/i)
  })
})
