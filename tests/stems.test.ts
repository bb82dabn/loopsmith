import { unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { measureLoopBoundary } from '../src/audio/loop'
import { createStemBundle, STEM_RECONSTRUCTION_TOLERANCE } from '../src/audio/stems'
import { renderComposition, renderCompositionStems } from '../src/audio/synthesis'
import { generateComposition } from '../src/music/generator'
import { settingsFromPreset } from '../src/music/presets'
import type { Composition, StemManifest } from '../src/music/types'

function shortComposition(): Composition {
  const generated = generateComposition({ ...settingsFromPreset('retro-platformer', 'stem-test'), targetSeconds: 30 })
  return {
    ...generated,
    id: 'stem-test-composition',
    title: 'Unsafe / Stem Test',
    measures: 1,
    totalBeats: 4,
    durationSeconds: 2,
    sections: [{ id: 'section', name: 'Loop', startMeasure: 0, measures: 1 }],
    tracks: generated.tracks.slice(0, 4).map((track, index) => ({
      ...track,
      id: `track-${index}`,
      name: index < 2 ? '../Lead: Layer' : `Layer ${index + 1}`,
      notes: [{ id: `note-${index}`, startBeats: index * 0.25, durationBeats: 0.5, midi: 48 + index * 5, velocity: 0.7 }],
      mute: index === 3,
      solo: false,
    })),
  }
}

function decodeWav(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const frames = view.getUint32(40, true) / 4
  const left = new Float32Array(frames)
  const right = new Float32Array(frames)
  for (let index = 0; index < frames; index += 1) {
    left[index] = view.getInt16(44 + index * 4, true) / 32767
    right[index] = view.getInt16(46 + index * 4, true) / 32767
  }
  return { view, frames, channels: [left, right] as [Float32Array, Float32Array] }
}

function bundle(composition = shortComposition(), sampleRate = 2000) {
  const rendered = renderCompositionStems(composition, sampleRate)
  const result = createStemBundle(composition, rendered)
  return { rendered, result, entries: unzipSync(result.bytes) }
}

describe('loop-ready WAV stem bundles', () => {
  it('exports deterministic, safe, aligned WAV entries and complete metadata', () => {
    const composition = shortComposition()
    const first = bundle(composition)
    const second = bundle(composition)
    const names = Object.keys(first.entries).sort()
    expect(names).toEqual(['full-mix.wav', 'manifest.json', 'stems/layer-3.wav', 'stems/lead-layer-2.wav', 'stems/lead-layer.wav'])
    expect(first.result.bytes).toEqual(second.result.bytes)

    const manifest = JSON.parse(new TextDecoder().decode(first.entries['manifest.json'])) as StemManifest
    expect(manifest).toEqual(first.result.manifest)
    expect(manifest.composition).toEqual({ id: composition.id, title: composition.title })
    expect(manifest.tempo).toBe(composition.settings.tempo)
    expect(manifest.meter).toEqual({ beatsPerMeasure: 4, beatUnit: 4 })
    expect(manifest.sampleRate).toBe(2000)
    expect(manifest.frameCount).toBe(4000)
    expect(manifest.loopStartSample).toBe(0)
    expect(manifest.loopEndSample).toBe(4000)
    expect(manifest.includedTrackIds).toEqual(['track-0', 'track-1', 'track-2'])
    expect(manifest.excludedTrackIds).toEqual(['track-3'])
    expect(manifest.tracks.find((track) => track.id === 'track-3')?.filename).toBeNull()
    expect(manifest.reconstructionTolerance).toBe(STEM_RECONSTRUCTION_TOLERANCE)

    for (const name of names.filter((entry) => entry.endsWith('.wav'))) {
      const wav = decodeWav(first.entries[name])
      expect(new TextDecoder().decode(first.entries[name].subarray(0, 4))).toBe('RIFF')
      expect(new TextDecoder().decode(first.entries[name].subarray(8, 12))).toBe('WAVE')
      expect(wav.view.getUint16(22, true)).toBe(2)
      expect(wav.view.getUint32(24, true)).toBe(2000)
      expect(wav.frames).toBe(manifest.frameCount)
      const metrics = measureLoopBoundary(wav.channels[0], wav.channels[1])
      expect(metrics.peakDiscontinuity).toBeLessThan(0.2)
      expect(metrics.rmsDiscontinuity).toBeLessThan(0.03)
    }
  })

  it('reconstructs the decoded reference mix by summing decoded stems', () => {
    const { entries, result } = bundle()
    const manifest = result.manifest
    const mix = decodeWav(entries[manifest.mix.filename])
    const stems = manifest.tracks.filter((track) => track.filename).map((track) => decodeWav(entries[track.filename!]))
    let maximumError = 0
    for (let channel = 0; channel < 2; channel += 1) {
      for (let frame = 0; frame < manifest.frameCount; frame += 1) {
        const sum = stems.reduce((total, stem) => total + stem.channels[channel][frame], 0)
        maximumError = Math.max(maximumError, Math.abs(sum - mix.channels[channel][frame]))
      }
    }
    expect(maximumError).toBeLessThanOrEqual(manifest.reconstructionTolerance)
  })

  it('matches the normal mix with global normalization and mute filtering', () => {
    const composition = shortComposition()
    const normalizationSensitive = {
      ...composition,
      tracks: composition.tracks.map((track, index) => ({
        ...track,
        mute: index === 3,
        solo: false,
        volume: index < 3 ? 4 : track.volume,
        notes: index < 3
          ? [{ id: `loud-note-${index}`, startBeats: 0, durationBeats: 1.5, midi: 60, velocity: 1 }]
          : track.notes,
      })),
    }
    const rendered = renderCompositionStems(normalizationSensitive, 1500)
    const normalMix = renderComposition(normalizationSensitive, 1500)

    expect(rendered.includedTrackIds).toEqual(['track-0', 'track-1', 'track-2'])
    expect(rendered.excludedTrackIds).toEqual(['track-3'])
    expect(rendered.normalization).toBeLessThan(1)
    expect(Math.max(...normalMix.channels[0].map(Math.abs), ...normalMix.channels[1].map(Math.abs))).toBeLessThanOrEqual(0.94)
    expect(normalMix.channels[0]).toEqual(rendered.mix.channels[0])
    expect(normalMix.channels[1]).toEqual(rendered.mix.channels[1])
    expect(normalMix.loopMetrics).toEqual(rendered.mix.loopMetrics)
  })

  it('gives solo state precedence and matches the normal mix and loop metrics', () => {
    const composition = shortComposition()
    const soloed = {
      ...composition,
      tracks: composition.tracks.map((track, index) => ({ ...track, mute: false, solo: index === 1 })),
    }
    const rendered = renderCompositionStems(soloed, 1500)
    const normalMix = renderComposition(soloed, 1500)

    expect(rendered.includedTrackIds).toEqual(['track-1'])
    expect(rendered.excludedTrackIds).toEqual(['track-0', 'track-2', 'track-3'])
    expect(normalMix.channels[0]).toEqual(rendered.mix.channels[0])
    expect(normalMix.channels[1]).toEqual(rendered.mix.channels[1])
    expect(normalMix.loopMetrics).toEqual(rendered.mix.loopMetrics)
  })
})
