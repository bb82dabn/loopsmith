import { describe, expect, it } from 'vitest'
import { CORPUS_PRIORS, weightedCorpusValue } from '../src/music/corpus-priors'
import { generateComposition } from '../src/music/generator'
import { settingsFromPreset } from '../src/music/presets'

function barSignatures(notes: { startBeats: number; midi: number }[], measures: number): Set<string> {
  return new Set(Array.from({ length: measures }, (_, measure) => notes
    .filter((note) => Math.floor(note.startBeats / 4) === measure)
    .map((note) => `${(note.startBeats % 4).toFixed(2)}:${note.midi}`)
    .join('|')))
}

function melodyPhraseSignatures(notes: { startBeats: number; midi: number }[], measures: number): Set<string> {
  return new Set(Array.from({ length: Math.ceil(measures / 2) }, (_, phrase) => {
    const phraseNotes = notes.filter((note) => Math.floor(note.startBeats / 8) === phrase).sort((left, right) => left.startBeats - right.startBeats)
    return phraseNotes.map((note, index) => `${(note.startBeats % 8).toFixed(2)}:${index ? note.midi - phraseNotes[index - 1].midi : 0}`).join('|')
  }))
}

describe('licensed aggregate corpus priors', () => {
  it('contains aggregate distributions but no source sequences', () => {
    expect(CORPUS_PRIORS.sourceMidiFiles).toBe(25)
    expect(CORPUS_PRIORS.sourceNotes).toBe(8371)
    expect(CORPUS_PRIORS.originalityGuard).toMatch(/No source note sequence/)
    expect(CORPUS_PRIORS.global.melodicIntervals.length).toBeGreaterThan(10)
    expect(CORPUS_PRIORS.global.noteDurationsBeats.length).toBeGreaterThan(5)
    expect(JSON.stringify(CORPUS_PRIORS)).not.toMatch(/Opening\.mid|Victory\.mid|noteSequence|rhythmTemplate/)
  })

  it('samples weighted values deterministically from a supplied random value', () => {
    const values = CORPUS_PRIORS.global.onsetGapsBeats
    expect(weightedCorpusValue(values, 0)).toBe(values[0].value)
    expect(weightedCorpusValue(values, 0.999999)).toBe(values.at(-1)?.value)
  })

  it('produces recognizable sections with developed rather than cloned phrases', () => {
    const composition = generateComposition(settingsFromPreset('forest-exploration', 'corpus-variety-audit'))
    const melody = composition.tracks.find((track) => track.role === 'melody')!
    const drums = composition.tracks.find((track) => track.role === 'drums')!
    expect(composition.sections.map((section) => section.name)).toEqual(['Theme', 'Development', 'Contrast', 'Return'])
    expect(Math.max(...composition.sections.map((section) => section.measures))).toBeLessThan(composition.measures / 2)
    expect(melodyPhraseSignatures(melody.notes, composition.measures).size).toBeGreaterThanOrEqual(6)
    expect(barSignatures(drums.notes, composition.measures).size).toBeGreaterThanOrEqual(5)
  })
})
