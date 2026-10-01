import type { ScaleName } from './types'

export const KEYS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const

export const SCALES: Record<ScaleName, readonly number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  'natural-minor': [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  pentatonic: [0, 2, 4, 7, 9],
}

export const TRACK_RANGES = {
  bass: [28, 52],
  harmony: [45, 76],
  melody: [60, 88],
  countermelody: [52, 81],
  arpeggio: [60, 91],
  drums: [35, 46],
} as const

export function keyToMidi(key: string, octave = 4): number {
  const index = KEYS.indexOf(key as (typeof KEYS)[number])
  if (index < 0) throw new Error(`Unsupported key: ${key}`)
  return 12 * (octave + 1) + index
}

export function degreeToMidi(root: number, scale: ScaleName, degree: number): number {
  const intervals = SCALES[scale]
  const wrapped = ((degree % intervals.length) + intervals.length) % intervals.length
  const octave = Math.floor(degree / intervals.length)
  return root + intervals[wrapped] + octave * 12
}

export function fitToRange(midi: number, min: number, max: number): number {
  let fitted = midi
  while (fitted < min) fitted += 12
  while (fitted > max) fitted -= 12
  return Math.max(min, Math.min(max, fitted))
}

export function chordForDegree(root: number, scale: ScaleName, degree: number): number[] {
  return [0, 2, 4].map((offset) => degreeToMidi(root, scale, degree + offset))
}

export function midiToName(midi: number): string {
  const note = KEYS[((midi % 12) + 12) % 12]
  return `${note}${Math.floor(midi / 12) - 1}`
}
