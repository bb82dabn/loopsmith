import type { Mood } from './types'

export type WeightedNumber = { value: number; weight: number }

type MoodShape = {
  directionChangeProbability: number
  leapResolutionProbability: number
  repeatedNoteProbability: number
  averageNotesPerBeat: number
}

export const CORPUS_PRIORS = {
  schemaVersion: 1,
  kind: 'aggregate-midi-statistics',
  sourceId: 'oga-generic-8bit-jrpg',
  sourceMidiFiles: 25,
  sourceNotes: 8371,
  originalityGuard: 'No source note sequence, chord sequence, or rhythm template is retained.',
  global: {
    melodicIntervals: [
      { value: -12, weight: 0.045485 }, { value: -9, weight: 0.036585 },
      { value: -7, weight: 0.046803 }, { value: -5, weight: 0.031312 },
      { value: -4, weight: 0.034937 }, { value: -3, weight: 0.050099 },
      { value: -2, weight: 0.0735 }, { value: -1, weight: 0.050099 },
      { value: 0, weight: 0.154252 }, { value: 1, weight: 0.046144 },
      { value: 2, weight: 0.082399 }, { value: 3, weight: 0.042189 },
      { value: 5, weight: 0.052076 }, { value: 7, weight: 0.047132 },
      { value: 12, weight: 0.042189 },
    ] satisfies WeightedNumber[],
    noteDurationsBeats: [
      { value: 0.125, weight: 0.02321 }, { value: 0.25, weight: 0.578294 },
      { value: 0.5, weight: 0.247793 }, { value: 0.75, weight: 0.05492 },
      { value: 1, weight: 0.030075 }, { value: 1.5, weight: 0.036613 },
      { value: 2, weight: 0.011115 }, { value: 4, weight: 0.009807 },
    ] satisfies WeightedNumber[],
    onsetGapsBeats: [
      { value: 0.25, weight: 0.554713 }, { value: 0.5, weight: 0.271589 },
      { value: 0.75, weight: 0.019776 }, { value: 1, weight: 0.073171 },
      { value: 1.5, weight: 0.020435 }, { value: 2, weight: 0.030982 },
      { value: 3, weight: 0.010218 }, { value: 4, weight: 0.012195 },
    ] satisfies WeightedNumber[],
    onsetSixteenths: [
      { value: 0, weight: 0.119974 }, { value: 1, weight: 0.028441 },
      { value: 2, weight: 0.071919 }, { value: 3, weight: 0.038575 },
      { value: 4, weight: 0.083034 }, { value: 5, weight: 0.039555 },
      { value: 6, weight: 0.082053 }, { value: 7, weight: 0.046747 },
      { value: 8, weight: 0.098398 }, { value: 9, weight: 0.031383 },
      { value: 10, weight: 0.072246 }, { value: 11, weight: 0.039229 },
      { value: 12, weight: 0.090879 }, { value: 13, weight: 0.04119 },
      { value: 14, weight: 0.076169 }, { value: 15, weight: 0.040209 },
    ] satisfies WeightedNumber[],
    harmonicRootMotionSemitones: [
      { value: 0, weight: 0.266204 }, { value: 1, weight: 0.043981 },
      { value: 2, weight: 0.108796 }, { value: 3, weight: 0.050926 },
      { value: 5, weight: 0.101852 }, { value: 7, weight: 0.083333 },
      { value: 8, weight: 0.05787 }, { value: 9, weight: 0.046296 },
      { value: 10, weight: 0.122685 }, { value: 11, weight: 0.0625 },
    ] satisfies WeightedNumber[],
    directionChangeProbability: 0.7447,
    leapResolutionProbability: 0.1732,
    repeatedNoteProbability: 0.1543,
    averageTrackCount: 3.16,
    averageNotesPerBeat: 3.791,
    averagePitchSpan: 39.2,
  },
  moods: {
    peaceful: { directionChangeProbability: 0.5033, leapResolutionProbability: 0.1341, repeatedNoteProbability: 0.0815, averageNotesPerBeat: 3.3 },
    bright: { directionChangeProbability: 0.6315, leapResolutionProbability: 0.2411, repeatedNoteProbability: 0.0202, averageNotesPerBeat: 4.44 },
    mysterious: { directionChangeProbability: 0.6288, leapResolutionProbability: 0.1954, repeatedNoteProbability: 0.0541, averageNotesPerBeat: 3.34 },
    tense: { directionChangeProbability: 0.8711, leapResolutionProbability: 0.1223, repeatedNoteProbability: 0.1311, averageNotesPerBeat: 4.053 },
    heroic: { directionChangeProbability: 0.4831, leapResolutionProbability: 0.9167, repeatedNoteProbability: 0.4086, averageNotesPerBeat: 3.204 },
    melancholy: { directionChangeProbability: 0.6364, leapResolutionProbability: 0.5, repeatedNoteProbability: 0.1923, averageNotesPerBeat: 2.986 },
  } satisfies Record<Mood, MoodShape>,
} as const

export function weightedCorpusValue(values: readonly WeightedNumber[], random: number): number {
  const total = values.reduce((sum, item) => sum + item.weight, 0)
  let cursor = random * total
  for (const item of values) {
    cursor -= item.weight
    if (cursor <= 0) return item.value
  }
  return values.at(-1)?.value ?? 0
}
