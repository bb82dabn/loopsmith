import { Midi } from '@tonejs/midi'
import { describe, expect, it } from 'vitest'
import { duplicateTrack, generateComposition } from '../src/music/generator'
import { serializeMidi } from '../src/music/midi'
import { settingsFromPreset } from '../src/music/presets'
import { MIDI_PERCUSSION_CHANNEL } from '../src/music/types'

describe('standard MIDI serialization', () => {
  it('writes parseable format data, metadata, programs, channels, and notes', () => {
    const composition = generateComposition(settingsFromPreset('battle', 'midi-inspection'))
    const bytes = serializeMidi(composition)
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x4d, 0x54, 0x68, 0x64])
    const parsed = new Midi(bytes)
    expect(parsed.header.tempos[0].bpm).toBeCloseTo(composition.settings.tempo, 3)
    expect(parsed.header.timeSignatures[0].timeSignature).toEqual([4, 4])
    expect(parsed.tracks).toHaveLength(composition.tracks.length)
    parsed.tracks.forEach((track, index) => {
      expect(track.channel).toBe(composition.tracks[index].channel)
      expect(track.notes).toHaveLength(composition.tracks[index].notes.length)
      expect(track.notes.every((note) => note.velocity > 0 && note.duration > 0)).toBe(true)
      expect(track.endOfTrackTicks).toBe(composition.totalBeats * parsed.header.ppq)
    })
  })

  it('routes duplicated drums to percussion with intact notes and controllers', () => {
    const original = generateComposition(settingsFromPreset('battle', 'midi-drums'))
    const rhythm = original.tracks.find((track) => track.role === 'drums')!
    const composition = duplicateTrack(original, rhythm.id)
    const drumSources = composition.tracks.filter((track) => track.role === 'drums')
    const parsed = new Midi(serializeMidi(composition))
    const drumTracks = parsed.tracks.filter((track) => drumSources.some((source) => source.name === track.name))

    expect(drumTracks).toHaveLength(2)
    drumTracks.forEach((track, index) => {
      const source = drumSources[index]
      expect(track.channel).toBe(MIDI_PERCUSSION_CHANNEL)
      expect(track.notes).toHaveLength(source.notes.length)
      expect(track.notes.map((note) => note.midi).sort((left, right) => left - right)).toEqual(
        source.notes.map((note) => note.midi).sort((left, right) => left - right),
      )
      expect(track.controlChanges[7][0].value).toBeCloseTo(source.volume, 2)
      expect(track.controlChanges[10][0].value).toBeCloseTo((source.pan + 1) / 2, 2)
      expect(track.endOfTrackTicks).toBe(composition.totalBeats * parsed.header.ppq)
    })
  })

  it('defensively exports legacy drum tracks on the percussion channel', () => {
    const generated = generateComposition(settingsFromPreset('battle', 'legacy-midi-drums'))
    const composition = {
      ...generated,
      tracks: generated.tracks.map((track) => track.role === 'drums' ? { ...track, channel: 5 } : track),
    }
    const parsed = new Midi(serializeMidi(composition))
    const drumTrack = parsed.tracks.find((track) => track.name === 'Rhythm')!

    expect(composition.version).toBe(1)
    expect(composition.tracks.find((track) => track.role === 'drums')?.channel).toBe(5)
    expect(drumTrack.channel).toBe(MIDI_PERCUSSION_CHANNEL)
  })
})
