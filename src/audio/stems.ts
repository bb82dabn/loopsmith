import { strToU8, zipSync, type Zippable } from 'fflate'
import type { Composition, StemManifest, StemRenderResult } from '../music/types'
import { encodeWav } from './wav'

export const STEM_RECONSTRUCTION_TOLERANCE = 0.0006
const ZIP_TIMESTAMP = new Date('1980-01-02T00:00:00.000Z')

function safeName(value: string): string {
  return value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'layer'
}

function uniqueStemNames(stems: StemRenderResult['stems']): Map<string, string> {
  const counts = new Map<string, number>()
  const names = new Map<string, string>()
  stems.forEach((stem) => {
    const base = safeName(stem.name)
    const count = (counts.get(base) ?? 0) + 1
    counts.set(base, count)
    names.set(stem.trackId, `stems/${base}${count === 1 ? '' : `-${count}`}.wav`)
  })
  return names
}

export function createStemBundle(composition: Composition, rendered: StemRenderResult): { bytes: Uint8Array; manifest: StemManifest } {
  const frameCount = rendered.mix.channels[0].length
  if (rendered.mix.channels[1].length !== frameCount) throw new Error('Reference mix channels must have equal sample counts.')
  rendered.stems.forEach((stem) => {
    if (stem.sampleRate !== rendered.mix.sampleRate || stem.channels[0].length !== frameCount || stem.channels[1].length !== frameCount) {
      throw new Error(`Stem ${stem.name} is not sample-aligned with the reference mix.`)
    }
  })

  const names = uniqueStemNames(rendered.stems)
  const manifest: StemManifest = {
    format: 'loopsmith-stems',
    version: 1,
    composition: { id: composition.id, title: composition.title },
    tempo: composition.settings.tempo,
    meter: { beatsPerMeasure: composition.beatsPerMeasure, beatUnit: 4 },
    durationSeconds: composition.durationSeconds,
    sampleRate: rendered.mix.sampleRate,
    frameCount,
    loopStartSample: 0,
    loopEndSample: frameCount,
    normalization: rendered.normalization,
    reconstructionTolerance: STEM_RECONSTRUCTION_TOLERANCE,
    mix: { filename: 'full-mix.wav', loopMetrics: rendered.mix.loopMetrics },
    includedTrackIds: rendered.includedTrackIds,
    excludedTrackIds: rendered.excludedTrackIds,
    tracks: composition.tracks.map((track) => {
      const stem = rendered.stems.find((candidate) => candidate.trackId === track.id)
      return {
        id: track.id,
        name: track.name,
        role: track.role,
        channel: track.channel,
        instrument: track.instrument,
        volume: track.volume,
        pan: track.pan,
        octave: track.octave,
        mute: track.mute,
        solo: track.solo,
        filename: names.get(track.id) ?? null,
        loopMetrics: stem?.loopMetrics ?? null,
      }
    }),
  }
  const zipEntries: Zippable = {
    'manifest.json': [strToU8(`${JSON.stringify(manifest, null, 2)}\n`), { level: 6, mtime: ZIP_TIMESTAMP }],
    'full-mix.wav': [encodeWav(rendered.mix), { level: 0, mtime: ZIP_TIMESTAMP }],
  }
  rendered.stems.forEach((stem) => {
    zipEntries[names.get(stem.trackId)!] = [encodeWav(stem), { level: 0, mtime: ZIP_TIMESTAMP }]
  })
  return { bytes: zipSync(zipEntries, { level: 6, mtime: ZIP_TIMESTAMP }), manifest }
}
