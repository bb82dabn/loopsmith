import { addCircularDelay, makeSeamlessLoop, measureLoopBoundary } from './loop'
import { hashString } from '../music/prng'
import type { Composition, InstrumentId, NoteEvent, PcmAudio, Track } from '../music/types'

const TAU = Math.PI * 2
export const MAX_NOTE_PREVIEW_SECONDS = 2

function midiFrequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12)
}

function oscillator(instrument: InstrumentId, phase: number, time: number, random: number): number {
  const sine = Math.sin(phase)
  switch (instrument) {
    case 'triangle-bass': return (2 / Math.PI) * Math.asin(sine)
    case 'pulse-bass': return sine > -0.35 ? 0.72 : -0.72
    case 'square-lead': return sine >= 0 ? 0.72 : -0.72
    case 'pulse-lead': return sine > 0.45 ? 0.8 : -0.52
    case 'bell': return sine * Math.exp(-time * 1.8) + Math.sin(phase * 2.01) * 0.38 * Math.exp(-time * 3.5) + Math.sin(phase * 3.97) * 0.13 * Math.exp(-time * 5)
    case 'mallet': return sine * Math.exp(-time * 2.5) + Math.sin(phase * 3) * 0.22 * Math.exp(-time * 6)
    case 'strings': return sine * 0.65 + Math.sin(phase * 2) * 0.2 + Math.sin(phase * 0.501) * 0.15
    case 'brass': return (sine >= 0 ? 0.45 : -0.45) + Math.sin(phase * 2) * 0.23 + sine * 0.25
    case 'warm-pad': return sine * 0.65 + Math.sin(phase * 0.502) * 0.22 + Math.sin(phase * 1.997) * 0.13
    case 'noise-kit': return random
  }
}

function envelope(instrument: InstrumentId, time: number, duration: number): number {
  const percussion = instrument === 'noise-kit'
  const attack = percussion ? 0.0015 : instrument === 'strings' || instrument === 'warm-pad' ? 0.035 : 0.007
  const release = percussion ? Math.min(0.09, duration * 0.8) : Math.min(0.045, duration * 0.28)
  const attackGain = Math.min(1, time / attack)
  const releaseGain = Math.min(1, (duration - time) / Math.max(0.001, release))
  const decay = percussion ? Math.exp(-time * 23) : 1
  return Math.max(0, Math.min(attackGain, releaseGain)) * decay
}

function renderNote(
  left: Float32Array,
  right: Float32Array,
  track: Track,
  noteIndex: number,
  startSeconds: number,
  durationSeconds: number,
  midi: number,
  velocity: number,
  sampleRate: number,
): void {
  const start = Math.max(0, Math.round(startSeconds * sampleRate))
  const end = Math.min(left.length, Math.round((startSeconds + durationSeconds) * sampleRate))
  const frequency = midiFrequency(midi + track.octave * 12)
  const angle = (track.pan + 1) * Math.PI * 0.25
  const leftGain = Math.cos(angle) * track.volume * velocity
  const rightGain = Math.sin(angle) * track.volume * velocity
  const noise = track.instrument === 'noise-kit'
  let noiseState = noise ? hashString(`${track.id}|${noteIndex}|${midi}`) || 1 : 0
  let time = 0
  let phase = 0
  const timeStep = 1 / sampleRate
  const phaseStep = TAU * frequency * timeStep

  for (let sample = start; sample < end; sample += 1) {
    let tone: number
    if (noise) {
      noiseState ^= noiseState << 13
      noiseState ^= noiseState >>> 17
      noiseState ^= noiseState << 5
      const random = ((noiseState >>> 0) / 2147483648) - 1
      if (midi === 36) tone = random * 0.3 + Math.sin(TAU * (72 - time * 45) * time) * 0.9
      else if (midi === 38 || midi === 39) tone = random * 0.86 + Math.sin(TAU * 165 * time) * 0.14
      else tone = random * 0.62
    } else tone = oscillator(track.instrument, phase, time, 0)
    const gain = envelope(track.instrument, time, durationSeconds) * 0.24
    left[sample] += tone * gain * leftGain
    right[sample] += tone * gain * rightGain
    time += timeStep
    phase += phaseStep
  }
}

export function renderNotePreview(track: Track, note: NoteEvent, tempo: number, sampleRate = 44100): PcmAudio {
  const secondsPerBeat = 60 / tempo
  const durationSeconds = Math.min(MAX_NOTE_PREVIEW_SECONDS, note.durationBeats * secondsPerBeat)
  const sampleCount = Math.max(1, Math.round(durationSeconds * sampleRate))
  const left = new Float32Array(sampleCount)
  const right = new Float32Array(sampleCount)
  const noteIndex = Math.max(0, track.notes.findIndex((candidate) => candidate.id === note.id))
  renderNote(left, right, track, noteIndex, 0, durationSeconds, note.midi, note.velocity, sampleRate)
  return {
    sampleRate,
    channels: [left, right],
    durationSeconds,
    loopMetrics: measureLoopBoundary(left, right),
  }
}

function audibleTracks(composition: Composition): Track[] {
  const hasSolo = composition.tracks.some((track) => track.solo)
  return composition.tracks.filter((track) => !track.mute && (!hasSolo || track.solo))
}

function renderTrack(composition: Composition, track: Track, sampleRate: number): [Float32Array, Float32Array] {
  const sampleCount = Math.round(composition.durationSeconds * sampleRate)
  const left = new Float32Array(sampleCount)
  const right = new Float32Array(sampleCount)
  const secondsPerBeat = 60 / composition.settings.tempo
  track.notes.forEach((note, noteIndex) => {
    renderNote(
      left,
      right,
      track,
      noteIndex,
      note.startBeats * secondsPerBeat,
      Math.min(note.durationBeats * secondsPerBeat, composition.durationSeconds - note.startBeats * secondsPerBeat),
      note.midi,
      note.velocity,
      sampleRate,
    )
  })
  addCircularDelay(left, sampleRate, 0.137, 0.08)
  addCircularDelay(right, sampleRate, 0.149, 0.08)
  return [left, right]
}

type StereoChannels = [Float32Array, Float32Array]

function allocateStereoMix(sampleCount: number): StereoChannels {
  return [new Float32Array(sampleCount), new Float32Array(sampleCount)]
}

function addTrackToMix(mix: StereoChannels, track: StereoChannels): void {
  for (let index = 0; index < mix[0].length; index += 1) {
    mix[0][index] += track[0][index]
    mix[1][index] += track[1][index]
  }
}

function normalizationForMix(channels: StereoChannels): number {
  let peak = 0
  for (let index = 0; index < channels[0].length; index += 1) {
    peak = Math.max(peak, Math.abs(channels[0][index]), Math.abs(channels[1][index]))
  }
  return peak > 0.94 ? 0.94 / peak : 1
}

function processChannels(channels: StereoChannels, sampleRate: number, normalization: number): void {
  const [left, right] = channels
  if (normalization !== 1) {
    for (let index = 0; index < left.length; index += 1) {
      left[index] *= normalization
      right[index] *= normalization
    }
  }
  makeSeamlessLoop(left, right, sampleRate)
}

export function renderCompositionStems(
  composition: Composition,
  sampleRate = 44100,
  onProgress?: (progress: number, label: string, trackId?: string) => void,
): import('../music/types').StemRenderResult {
  const tracks = audibleTracks(composition)
  const sampleCount = Math.round(composition.durationSeconds * sampleRate)
  const mixChannels = allocateStereoMix(sampleCount)
  const rendered = tracks.map((track, trackIndex) => {
    const channels = renderTrack(composition, track, sampleRate)
    addTrackToMix(mixChannels, channels)
    onProgress?.((trackIndex + 1) / (tracks.length + 2), `Rendering ${track.name}`, track.id)
    return { track, channels }
  })
  const normalization = normalizationForMix(mixChannels)
  onProgress?.((tracks.length + 1) / (tracks.length + 2), 'Polishing loop boundaries')
  processChannels(mixChannels, sampleRate, normalization)
  const stems = rendered.map(({ track, channels }) => {
    processChannels(channels, sampleRate, normalization)
    return {
      trackId: track.id,
      name: track.name,
      role: track.role,
      channel: track.channel,
      sampleRate,
      channels,
      durationSeconds: composition.durationSeconds,
      loopMetrics: measureLoopBoundary(channels[0], channels[1]),
    }
  })
  const mix: PcmAudio = {
    sampleRate,
    channels: mixChannels,
    durationSeconds: composition.durationSeconds,
    loopMetrics: measureLoopBoundary(mixChannels[0], mixChannels[1]),
  }
  onProgress?.(1, 'Audio ready')
  const includedTrackIds = tracks.map((track) => track.id)
  return {
    mix,
    stems,
    normalization,
    includedTrackIds,
    excludedTrackIds: composition.tracks.filter((track) => !includedTrackIds.includes(track.id)).map((track) => track.id),
  }
}

export function renderComposition(
  composition: Composition,
  sampleRate = 44100,
  onProgress?: (progress: number, label: string) => void,
): PcmAudio {
  const tracks = audibleTracks(composition)
  const sampleCount = Math.round(composition.durationSeconds * sampleRate)
  const mixChannels = allocateStereoMix(sampleCount)
  tracks.forEach((track, trackIndex) => {
    const channels = renderTrack(composition, track, sampleRate)
    addTrackToMix(mixChannels, channels)
    onProgress?.((trackIndex + 1) / (tracks.length + 2), `Rendering ${track.name}`)
  })
  const normalization = normalizationForMix(mixChannels)
  onProgress?.((tracks.length + 1) / (tracks.length + 2), 'Polishing loop boundaries')
  processChannels(mixChannels, sampleRate, normalization)
  onProgress?.(1, 'Audio ready')
  return {
    sampleRate,
    channels: mixChannels,
    durationSeconds: composition.durationSeconds,
    loopMetrics: measureLoopBoundary(mixChannels[0], mixChannels[1]),
  }
}
