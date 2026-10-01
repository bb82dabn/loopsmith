import { describe, expect, it } from 'vitest'
import { measureLoopBoundary } from '../src/audio/loop'
import { compensateEncoderDelay, MP3_ENCODER_DELAY, MP3_FRAME_SAMPLES } from '../src/audio/mp3'
import { MAX_NOTE_PREVIEW_SECONDS, renderComposition, renderNotePreview } from '../src/audio/synthesis'
import { generateComposition } from '../src/music/generator'
import { settingsFromPreset } from '../src/music/presets'
import type { Composition, NoteEvent, Track } from '../src/music/types'

describe('loop boundary measurement', () => {
  it('uses the full default window and honors caller and buffer limits', () => {
    const longLeft = new Float32Array(512)
    const longRight = new Float32Array(512)
    const shortLeft = new Float32Array(32)
    const shortRight = new Float32Array(32)

    expect(measureLoopBoundary(longLeft, longRight).windowSamples).toBe(256)
    expect(measureLoopBoundary(longLeft, longRight, 24.9).windowSamples).toBe(24)
    expect(measureLoopBoundary(shortLeft, shortRight).windowSamples).toBe(32)
  })

  it('measures finite metrics across the full configured window', () => {
    const continuousLeft = new Float32Array(512)
    const continuousRight = new Float32Array(512)
    const continuous = measureLoopBoundary(continuousLeft, continuousRight)
    const mismatchedLeft = continuousLeft.slice()
    mismatchedLeft[64] = 1
    const mismatched = measureLoopBoundary(mismatchedLeft, continuousRight)

    expect(continuous).toEqual({ peakDiscontinuity: 0, rmsDiscontinuity: 0, windowSamples: 256 })
    expect(Object.values(mismatched).every(Number.isFinite)).toBe(true)
    expect(mismatched.peakDiscontinuity).toBeGreaterThan(0)
    expect(mismatched.rmsDiscontinuity).toBeGreaterThan(0)
  })

  it('rejects malformed channels and invalid windows with descriptive errors', () => {
    const valid = new Float32Array(2)

    expect(() => measureLoopBoundary(new Float32Array(), new Float32Array())).toThrow(
      new RangeError('Loop boundary channels must contain at least two samples'),
    )
    expect(() => measureLoopBoundary(new Float32Array(1), new Float32Array(1))).toThrow(
      new RangeError('Loop boundary channels must contain at least two samples'),
    )
    expect(() => measureLoopBoundary(new Float32Array(2), new Float32Array(3))).toThrow(
      new RangeError('Loop boundary channels must have equal lengths'),
    )
    expect(() => measureLoopBoundary(valid, valid, Number.NaN)).toThrow(
      new RangeError('Loop boundary window must be finite and at least two samples'),
    )
    expect(() => measureLoopBoundary(valid, valid, Number.POSITIVE_INFINITY)).toThrow(
      new RangeError('Loop boundary window must be finite and at least two samples'),
    )
    expect(() => measureLoopBoundary(valid, valid, 1)).toThrow(
      new RangeError('Loop boundary window must be finite and at least two samples'),
    )
  })
})

describe('loop-safe offline audio', () => {
  it('renders a deterministic maximum-duration 16-track mix with complete progress', () => {
    const generated = generateComposition({ ...settingsFromPreset('retro-platformer', 'maximum-mix-test'), targetSeconds: 120 })
    const composition: Composition = {
      ...generated,
      durationSeconds: 120,
      tracks: Array.from({ length: 16 }, (_, index) => ({
        ...generated.tracks[index % generated.tracks.length],
        id: `maximum-${index}`,
        name: `Maximum ${index}`,
        notes: index === 0 ? [{ id: 'bounded-note', startBeats: 0, durationBeats: 0.25, midi: 60, velocity: 0.7 }] : [],
        mute: false,
        solo: false,
      })),
    }
    const updates: Array<{ progress: number; label: string }> = []
    const first = renderComposition(composition, 250, (progress, label) => updates.push({ progress, label }))
    const second = renderComposition(composition, 250)

    expect(first.channels[0]).toHaveLength(Math.round(composition.durationSeconds * 250))
    expect(first.channels[1]).toHaveLength(Math.round(composition.durationSeconds * 250))
    expect(first.channels[0]).toEqual(second.channels[0])
    expect(first.channels[1]).toEqual(second.channels[1])
    expect(first.channels.every((channel) => channel.every(Number.isFinite))).toBe(true)
    expect(Object.values(first.loopMetrics).every(Number.isFinite)).toBe(true)
    expect(first.loopMetrics.windowSamples).toBeGreaterThanOrEqual(2)
    expect(updates.filter(({ label }) => label.startsWith('Rendering '))).toHaveLength(16)
    expect(updates.at(-2)?.label).toBe('Polishing loop boundaries')
    expect(updates.at(-1)).toEqual({ progress: 1, label: 'Audio ready' })
    expect(renderComposition.toString()).not.toContain('renderCompositionStems')
    expect(renderComposition.toString()).not.toContain('tracks.map')
  })

  it('keeps the measured end-to-start discontinuity below the seam threshold', () => {
    const settings = { ...settingsFromPreset('dungeon-tension', 'audio-seam-test'), targetSeconds: 30 }
    const audio = renderComposition(generateComposition(settings), 8000)
    expect(Math.abs(audio.channels[0][0] - audio.channels[0].at(-1)!)).toBeLessThan(0.001)
    expect(Math.abs(audio.channels[1][0] - audio.channels[1].at(-1)!)).toBeLessThan(0.001)
    expect(audio.loopMetrics.rmsDiscontinuity).toBeLessThan(0.03)
    expect(audio.loopMetrics.peakDiscontinuity).toBeLessThan(0.2)
  }, 20_000)

  it('wraps guard samples and aligns encoded data to MP3 frame boundaries', () => {
    const sampleCount = 5000
    const left = Float32Array.from({ length: sampleCount }, (_, index) => Math.sin(index / 17) * 0.5)
    const right = Float32Array.from({ length: sampleCount }, (_, index) => Math.cos(index / 19) * 0.5)
    const compensated = compensateEncoderDelay(left, right)
    expect(compensated.encoderDelay).toBe(MP3_ENCODER_DELAY)
    expect(compensated.left.length % MP3_FRAME_SAMPLES).toBe(0)
    expect(compensated.left[MP3_ENCODER_DELAY]).toBe(Math.round(left[0] * 32767))
    expect(compensated.left[0]).toBe(Math.round(left[sampleCount - MP3_ENCODER_DELAY] * 32767))
    expect(compensated.endPadding).toBeGreaterThanOrEqual(0)
    expect(compensated.endPadding).toBeLessThan(MP3_FRAME_SAMPLES)
  })
})

function previewTrack(instrument: Track['instrument'] = 'square-lead'): Track {
  return {
    id: 'preview-track',
    name: 'Preview',
    role: instrument === 'noise-kit' ? 'drums' : 'melody',
    channel: instrument === 'noise-kit' ? 9 : 0,
    instrument,
    notes: [],
    volume: 0.8,
    pan: 0,
    mute: false,
    solo: false,
    octave: 0,
    locked: false,
    revision: 0,
  }
}

const previewNote: NoteEvent = { id: 'preview-note', startBeats: 7, durationBeats: 1, midi: 60, velocity: 0.75 }
const peak = (channel: Float32Array) => channel.reduce((maximum, sample) => Math.max(maximum, Math.abs(sample)), 0)

describe('note audition rendering', () => {
  it('renders deterministic finite stereo PCM without mutating its inputs', () => {
    const track = previewTrack()
    track.notes = [previewNote]
    const trackBefore = structuredClone(track)
    const noteBefore = structuredClone(previewNote)
    const first = renderNotePreview(track, previewNote, 120, 8000)
    const second = renderNotePreview(track, previewNote, 120, 8000)

    expect(first.durationSeconds).toBe(0.5)
    expect(first.channels[0]).toHaveLength(4000)
    expect(first.channels[1]).toHaveLength(4000)
    expect(first.channels[0]).toEqual(second.channels[0])
    expect(first.channels.flatMap((channel) => [...channel]).every(Number.isFinite)).toBe(true)
    expect(peak(first.channels[0])).toBeGreaterThan(0)
    expect(peak(first.channels[1])).toBeGreaterThan(0)
    expect(track).toEqual(trackBefore)
    expect(previewNote).toEqual(noteBefore)
  })

  it('renders deterministic non-silent noise-kit percussion and caps long notes', () => {
    const track = previewTrack('noise-kit')
    const note = { ...previewNote, durationBeats: 20, midi: 36 }
    track.notes = [note]
    const first = renderNotePreview(track, note, 60, 4000)
    const second = renderNotePreview(track, note, 60, 4000)

    expect(first.durationSeconds).toBe(MAX_NOTE_PREVIEW_SECONDS)
    expect(first.channels[0]).toHaveLength(MAX_NOTE_PREVIEW_SECONDS * 4000)
    expect(first.channels[0]).toEqual(second.channels[0])
    expect(peak(first.channels[0])).toBeGreaterThan(0)
    expect(first.channels.flatMap((channel) => [...channel]).every(Number.isFinite)).toBe(true)
  })

  it('reflects pitch, velocity, pan, octave, and instrument changes', () => {
    const baseTrack = previewTrack()
    const base = renderNotePreview(baseTrack, previewNote, 120, 8000)
    const pitch = renderNotePreview(baseTrack, { ...previewNote, midi: 67 }, 120, 8000)
    const velocity = renderNotePreview(baseTrack, { ...previewNote, velocity: 0.3 }, 120, 8000)
    const panned = renderNotePreview({ ...baseTrack, pan: 1 }, previewNote, 120, 8000)
    const octave = renderNotePreview({ ...baseTrack, octave: 1 }, previewNote, 120, 8000)
    const instrument = renderNotePreview({ ...baseTrack, instrument: 'bell' }, previewNote, 120, 8000)

    expect(pitch.channels[0]).not.toEqual(base.channels[0])
    expect(peak(velocity.channels[0])).toBeLessThan(peak(base.channels[0]))
    expect(peak(panned.channels[0])).toBeLessThan(peak(panned.channels[1]) * 0.001)
    expect(octave.channels[0]).not.toEqual(base.channels[0])
    expect(instrument.channels[0]).not.toEqual(base.channels[0])
  })
})
