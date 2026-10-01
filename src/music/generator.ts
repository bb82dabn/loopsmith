import { defaultInstrument } from './instruments'
import { CORPUS_PRIORS, weightedCorpusValue } from './corpus-priors'
import { PRESETS } from './presets'
import { hashString, SeededRandom } from './prng'
import { chordForDegree, degreeToMidi, fitToRange, keyToMidi, SCALES, TRACK_RANGES } from './theory'
import type { ArrangementSection, ComposerSettings, Composition, Mood, NoteEvent, Track, TrackRole } from './types'
import { MIDI_PERCUSSION_CHANNEL, PROJECT_VERSION } from './types'
import { validateSettings } from './validation'

const CHANNELS: Record<TrackRole, number> = {
  bass: 0,
  harmony: 1,
  melody: 2,
  countermelody: 3,
  arpeggio: 4,
  drums: MIDI_PERCUSSION_CHANNEL,
}

const ROLE_NAMES: Record<TrackRole, string> = {
  drums: 'Rhythm',
  bass: 'Bass',
  harmony: 'Harmony',
  melody: 'Lead motif',
  countermelody: 'Counterline',
  arpeggio: 'Arpeggio',
}

const PROGRESSIONS: Record<Mood, readonly number[][]> = {
  peaceful: [[0, 3, 4, 0], [0, 4, 3, 4], [0, 2, 3, 0]],
  bright: [[0, 4, 5, 3], [0, 3, 0, 4], [0, 5, 3, 4]],
  mysterious: [[0, 1, 5, 3], [0, 3, 1, 4], [0, 5, 1, 0]],
  tense: [[0, 5, 1, 4], [0, 1, 0, 6], [0, 3, 1, 4]],
  heroic: [[0, 3, 4, 0], [0, 4, 5, 3], [0, 5, 3, 4]],
  melancholy: [[0, 5, 3, 4], [0, 3, 6, 4], [0, 1, 5, 4]],
}

export function calculateMeasures(tempo: number, targetSeconds = 60): number {
  const secondsPerMeasure = (4 * 60) / tempo
  const nearestFourBarPhrase = Math.round(targetSeconds / secondsPerMeasure / 4) * 4
  return Math.max(12, Math.min(96, nearestFourBarPhrase))
}

export function calculateDuration(tempo: number, measures: number): number {
  return (measures * 4 * 60) / tempo
}

function makeSections(measures: number): ArrangementSection[] {
  const names = ['Theme', 'Development', 'Contrast', 'Return']
  const phraseBlocks = Math.floor(measures / 4)
  const lengths = [0, 0, 0, 0]
  if (phraseBlocks < 4) {
    ;[2, 4, 2, 4].forEach((length, index) => { lengths[index] = length })
  } else {
    const baseBlocks = Math.floor(phraseBlocks / 4)
    lengths.fill(baseBlocks * 4)
    const remainderOrder = [1, 2, 0, 3]
    for (let block = 0; block < phraseBlocks % 4; block += 1) lengths[remainderOrder[block]] += 4
  }
  let cursor = 0
  return lengths.map((length, index) => ({ length, index })).filter(({ length }) => length > 0).map(({ length, index }) => {
    const section = { id: `section-${index}`, name: names[index], startMeasure: cursor, measures: length }
    cursor += length
    return section
  })
}

function noteFactory(role: TrackRole, totalBeats: number) {
  let index = 0
  return (startBeats: number, durationBeats: number, midi: number, velocity: number): NoteEvent => {
    const range = TRACK_RANGES[role]
    const start = Math.max(0, Math.min(totalBeats - 0.01, startBeats))
    const duration = Math.max(0.03, Math.min(durationBeats, totalBeats - start))
    return {
      id: `${role}-${index++}`,
      startBeats: Number(start.toFixed(4)),
      durationBeats: Number(duration.toFixed(4)),
      midi: fitToRange(Math.round(midi), range[0], range[1]),
      velocity: Number(Math.max(0.05, Math.min(1, velocity)).toFixed(3)),
    }
  }
}

function corpusDegreeTarget(settings: ComposerSettings, currentDegree: number, rng: SeededRandom): number {
  const scale = SCALES[settings.scale]
  const currentPitchClass = scale[((currentDegree % scale.length) + scale.length) % scale.length]
  const motion = weightedCorpusValue(CORPUS_PRIORS.global.harmonicRootMotionSemitones, rng.next())
  const targetPitchClass = (currentPitchClass + motion) % 12
  let bestDegree = 0
  let bestDistance = 13
  scale.forEach((pitchClass, degree) => {
    const distance = Math.min((pitchClass - targetPitchClass + 12) % 12, (targetPitchClass - pitchClass + 12) % 12)
    if (distance < bestDistance) {
      bestDistance = distance
      bestDegree = degree
    }
  })
  return bestDegree
}

function progressionFor(settings: ComposerSettings, rng: SeededRandom, measures: number, sections: ArrangementSection[]): number[] {
  const options = PROGRESSIONS[settings.mood]
  const theme = rng.pick(options)
  const contrast = rng.pick(options.filter((candidate) => candidate !== theme))
  let previous = 0
  return Array.from({ length: measures }, (_, measure) => {
    if (measure === 0 || measure === measures - 1) {
      previous = 0
      return 0
    }
    const section = sectionForMeasure(sections, measure)
    const localMeasure = measure - (sections[section]?.startMeasure ?? 0)
    const source = section === 2 ? contrast : theme
    let degree = source[localMeasure % source.length]
    if (section === 1 && localMeasure % 4 !== 0 && rng.chance(0.5)) degree = corpusDegreeTarget(settings, previous, rng)
    if (section === 2 && localMeasure % 4 === 3) degree = settings.mood === 'tense' ? 4 : 0
    if (section === 3 && localMeasure % 4 === 2 && settings.complexity >= 3) degree = rng.pick([3, 4, 5])
    previous = degree
    return degree
  })
}

function generateDrums(settings: ComposerSettings, rng: SeededRandom, measures: number, sections: ArrangementSection[]): NoteEvent[] {
  const totalBeats = measures * 4
  const add = noteFactory('drums', totalBeats)
  const notes: NoteEvent[] = []
  const kickPatterns: Record<Mood, readonly number[][]> = {
    peaceful: [[0, 2.75], [0, 2], [0, 1.5, 3]],
    bright: [[0, 1.5, 2.5], [0, 2, 3.25], [0, 1.75, 2.5]],
    mysterious: [[0, 2.5], [0, 1.75, 3], [0, 2, 3.5]],
    tense: [[0, 1, 2.5, 3.25], [0, 1.5, 2, 3], [0, 0.75, 2.5]],
    heroic: [[0, 1.5, 2.5, 3.5], [0, 2, 2.75], [0, 1, 2.5]],
    melancholy: [[0, 2.5], [0, 2], [0, 3]],
  }
  const baseKickPattern = rng.pick(kickPatterns[settings.mood])
  for (let measure = 0; measure < measures; measure += 1) {
    const base = measure * 4
    const section = sectionForMeasure(sections, measure)
    const sectionInfo = sections[section]
    const localMeasure = measure - (sectionInfo?.startMeasure ?? 0)
    const sectionEdge = sectionInfo ? measure === sectionInfo.startMeasure + sectionInfo.measures - 1 : measure % 4 === 3
    const kickPattern = section === 2
      ? baseKickPattern.map((beat) => (beat + (settings.mood === 'tense' ? 0.25 : 0)) % 4)
      : baseKickPattern
    kickPattern.forEach((beat, index) => {
      if (index > 1 && settings.intensity <= 2) return
      if (localMeasure % 2 === 1 && index === kickPattern.length - 1 && rng.chance(0.32)) return
      notes.push(add(base + beat, 0.16, 36, 0.68 + (beat === 0 ? 0.14 : 0) + settings.intensity * 0.02))
    })
    const backbeats = settings.style === 'platformer' || settings.mood === 'tense' || settings.intensity >= 4 ? [1, 3] : [2]
    backbeats.forEach((beat) => notes.push(add(base + beat, 0.16, 38, 0.64 + settings.intensity * 0.04)))
    if (settings.complexity >= 3 && section === 1 && localMeasure % 2 === 1) notes.push(add(base + 2.75, 0.1, 38, 0.32))
    const subdivision = settings.complexity >= 3 || settings.intensity >= 4 ? 0.5 : 1
    for (let beat = 0; beat < 4; beat += subdivision) {
      if (rng.chance(section === 2 ? 0.18 : 0.06) && beat % 1 !== 0) continue
      const openHat = (sectionEdge && beat === 3.5) || (section === 2 && beat === 1.5 && localMeasure % 2 === 0)
      notes.push(add(base + beat, 0.08, openHat ? 46 : 42, 0.3 + (beat % 1 === 0 ? 0.13 : 0) + rng.next() * 0.04))
    }
    if (sectionEdge && settings.complexity >= 3) {
      const fillSubdivision = settings.complexity >= 5 ? 0.25 : 0.5
      for (let beat = 3; beat < 4; beat += fillSubdivision) {
        notes.push(add(base + beat, 0.1, rng.pick([38, 39, 45]), 0.5 + (beat - 3) * 0.16))
      }
    }
  }
  return notes
}

function generateBass(settings: ComposerSettings, rng: SeededRandom, progression: number[], sections: ArrangementSection[]): NoteEvent[] {
  const totalBeats = progression.length * 4
  const add = noteFactory('bass', totalBeats)
  const root = keyToMidi(settings.key, 2)
  const notes: NoteEvent[] = []
  progression.forEach((degree, measure) => {
    const beat = measure * 4
    const section = sectionForMeasure(sections, measure)
    const rootNote = degreeToMidi(root, settings.scale, degree)
    const patterns = settings.complexity <= 2
      ? [[0, 2], [0, 2.5]]
      : section === 2
        ? [[0, 1.5, 2.25, 3.5], [0, 0.75, 2, 3.25]]
        : settings.intensity >= 4
          ? [[0, 0.75, 1.5, 2.5, 3.25], [0, 1, 2, 2.75, 3.5]]
          : [[0, 1.5, 2.5], [0, 1, 2.75]]
    const pattern = patterns[measure % patterns.length]
    pattern.forEach((offset, index) => {
      const nextOffset = pattern[index + 1] ?? 4
      const isLast = index === pattern.length - 1
      let note = rootNote
      if (index > 0 && index % 3 === 1) note = degreeToMidi(root, settings.scale, degree + 4)
      if (index > 0 && index % 3 === 2) note = degreeToMidi(root, settings.scale, degree + 7)
      if (isLast && measure < progression.length - 1 && settings.complexity >= 3 && rng.chance(0.62)) {
        const nextDegree = progression[measure + 1]
        note = degreeToMidi(root, settings.scale, nextDegree + rng.pick([-1, 1]))
      }
      notes.push(add(beat + offset, Math.max(0.18, (nextOffset - offset) * 0.82), note, 0.55 + (offset === 0 ? 0.17 : rng.next() * 0.07)))
    })
  })
  return notes
}

function voiceLeadChord(chord: number[], previous: number[] | undefined, inversion: number): number[] {
  const inverted = [...chord]
  for (let index = 0; index < inversion % inverted.length; index += 1) inverted.push(inverted.shift()! + 12)
  if (!previous) return inverted
  return inverted.map((midi, voice) => {
    const candidates = [midi - 12, midi, midi + 12]
    return candidates.reduce((closest, candidate) => Math.abs(candidate - previous[voice]) < Math.abs(closest - previous[voice]) ? candidate : closest)
  })
}

function generateHarmony(settings: ComposerSettings, progression: number[], sections: ArrangementSection[]): NoteEvent[] {
  const totalBeats = progression.length * 4
  const add = noteFactory('harmony', totalBeats)
  const root = keyToMidi(settings.key, 3)
  const notes: NoteEvent[] = []
  let previous: number[] | undefined
  progression.forEach((degree, measure) => {
    const section = sectionForMeasure(sections, measure)
    const inversion = settings.complexity >= 3 ? (measure + section) % 3 : 0
    const chord = voiceLeadChord(chordForDegree(root, settings.scale, degree), previous, inversion)
    previous = chord
    const starts = settings.intensity <= 2
      ? [0]
      : section === 1
        ? [0, 1.5, 3]
        : section === 2
          ? [0.5, 2.5]
          : [0, 2]
    starts.forEach((offset, chordIndex) => {
      const nextOffset = starts[chordIndex + 1] ?? 4
      const duration = Math.max(0.25, nextOffset - offset - 0.12)
      chord.forEach((midi, voice) => notes.push(add(measure * 4 + offset, duration, midi, 0.36 + voice * 0.035 + (offset === 0 ? 0.08 : 0))))
    })
  })
  return notes
}

type MotifNote = { degree: number; offset: number; duration: number }

function semitoneIntervalToDegreeStep(semitones: number): number {
  const steps = [0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 7]
  return Math.sign(semitones) * steps[Math.min(12, Math.abs(Math.round(semitones)))]
}

function makeMotif(settings: ComposerSettings, rng: SeededRandom, openingDegree = 0): MotifNote[] {
  const profile = CORPUS_PRIORS.moods[settings.mood]
  const targetNotes = 6 + settings.complexity * 2
  const motif: MotifNote[] = [{ degree: openingDegree, offset: 0, duration: 0.5 }]
  let cursor = 0
  let degree = openingDegree
  let previousStep = 0
  while (cursor < 7.5 && motif.length < targetNotes) {
    const corpusGap = weightedCorpusValue(CORPUS_PRIORS.global.onsetGapsBeats, rng.next())
    const densityScale = 1.65 - settings.complexity * 0.16
    const gap = Math.max(0.25, Math.round(corpusGap * densityScale * 4) / 4)
    cursor = Number((cursor + gap).toFixed(2))
    if (cursor >= 7.8) break
    let semitoneStep = weightedCorpusValue(CORPUS_PRIORS.global.melodicIntervals, rng.next())
    if (rng.chance(profile.repeatedNoteProbability * 0.45)) semitoneStep = 0
    let degreeStep = semitoneIntervalToDegreeStep(semitoneStep)
    if (Math.abs(previousStep) >= 3 && rng.chance(profile.leapResolutionProbability)) {
      degreeStep = -Math.sign(previousStep) * rng.pick([1, 2])
    } else if (previousStep !== 0 && degreeStep !== 0 && rng.chance(profile.directionChangeProbability)) {
      degreeStep = -Math.sign(previousStep) * Math.abs(degreeStep)
    }
    degree += degreeStep
    if (degree > 9 || degree < -3) {
      degree = Math.max(-3, Math.min(9, degree - degreeStep * 2))
      degreeStep *= -1
    }
    const corpusDuration = weightedCorpusValue(CORPUS_PRIORS.global.noteDurationsBeats, rng.next())
    const durationScale = 1 + (5 - settings.complexity) * 0.18
    motif.push({ degree, offset: cursor, duration: Math.max(0.18, corpusDuration * durationScale) })
    previousStep = degreeStep
  }
  if (motif.length < 5) {
    ;[1, 2, 3, 4].forEach((offset) => motif.push({ degree: openingDegree + (offset % 3), offset: offset * 1.5, duration: 0.75 }))
  }
  motif.forEach((note, index) => {
    const nextOffset = motif[index + 1]?.offset ?? 8
    note.duration = Math.min(note.duration, Math.max(0.08, nextOffset - note.offset - 0.06))
  })
  return motif
}

function sectionForMeasure(sections: ArrangementSection[], measure: number): number {
  return Math.max(0, sections.findIndex((section) => measure >= section.startMeasure && measure < section.startMeasure + section.measures))
}

function nearestChordToneDegree(degree: number, chordDegree: number): number {
  const candidates = [chordDegree, chordDegree + 2, chordDegree + 4]
    .flatMap((candidate) => [candidate - 7, candidate, candidate + 7])
  return candidates.reduce((closest, candidate) => Math.abs(candidate - degree) < Math.abs(closest - degree) ? candidate : closest)
}

function generateMelody(settings: ComposerSettings, rng: SeededRandom, measures: number, sections: ArrangementSection[], progression: number[]): NoteEvent[] {
  const totalBeats = measures * 4
  const add = noteFactory('melody', totalBeats)
  const root = keyToMidi(settings.key, 4)
  const motifA = makeMotif(settings, rng, 0)
  const motifB = makeMotif(settings, rng, rng.pick([2, 3, 4]))
  const notes: NoteEvent[] = []
  for (let phraseMeasure = 0; phraseMeasure < measures; phraseMeasure += 2) {
    const section = sectionForMeasure(sections, phraseMeasure)
    const sectionStart = sections[section]?.startMeasure ?? 0
    const localPhrase = Math.floor((phraseMeasure - sectionStart) / 2)
    const motif = section === 2 ? motifB : motifA
    const phraseNotes = motif.flatMap((motifNote, index): MotifNote[] => {
      if (localPhrase > 0 && index > 0 && index < motif.length - 1 && (index + localPhrase) % 9 === 0) return []
      let degree = motifNote.degree
      let offset = motifNote.offset
      if (section === 1) {
        degree += localPhrase % 2 === 0 ? 1 : -1
        if (index % 4 === 2) degree += localPhrase % 2 === 0 ? 2 : -2
        if (index > 0 && (index + localPhrase) % 5 === 0) offset = Math.min(7.75, offset + 0.25)
      }
      if (section === 2 && localPhrase % 2 === 1) degree = 5 - degree
      if (section === 3 && localPhrase > 0 && index % 5 === 3) degree += rng.pick([-1, 1])
      const absoluteMeasure = Math.min(measures - 1, phraseMeasure + Math.floor(offset / 4))
      if (Math.abs(offset % 1) < 0.01 && rng.chance(0.7)) degree = nearestChordToneDegree(degree, progression[absoluteMeasure])
      return [{ degree, offset, duration: motifNote.duration }]
    })
    if (phraseMeasure + 2 >= measures && phraseNotes.length) {
      const cadence = phraseNotes[phraseNotes.length - 1]
      cadence.degree = 0
      cadence.duration = Math.min(cadence.duration, 7.94 - cadence.offset)
    }
    phraseNotes.sort((left, right) => left.offset - right.offset)
    const uniquePhraseNotes = phraseNotes.filter((motifNote, index) => index === 0 || Math.abs(motifNote.offset - phraseNotes[index - 1].offset) > 0.01)
    uniquePhraseNotes.forEach((motifNote, index) => {
      const absoluteOffset = phraseMeasure * 4 + motifNote.offset
      if (absoluteOffset >= totalBeats) return
      const nextOffset = uniquePhraseNotes[index + 1]?.offset ?? 8
      const duration = Math.min(motifNote.duration, Math.max(0.08, nextOffset - motifNote.offset - 0.05))
      const strongBeat = Math.abs(motifNote.offset % 1) < 0.01
      const sectionLift = section === 1 ? 0.04 : section === 2 ? -0.03 : 0
      notes.push(add(absoluteOffset, duration, degreeToMidi(root, settings.scale, motifNote.degree), 0.57 + sectionLift + (strongBeat ? 0.12 : 0) + rng.next() * 0.08))
    })
  }
  return notes
}

function generateCountermelody(settings: ComposerSettings, rng: SeededRandom, progression: number[], sections: ArrangementSection[]): NoteEvent[] {
  const totalBeats = progression.length * 4
  const add = noteFactory('countermelody', totalBeats)
  const root = keyToMidi(settings.key, 3)
  const notes: NoteEvent[] = []
  progression.forEach((degree, measure) => {
    const section = sectionForMeasure(sections, measure)
    const localMeasure = measure - (sections[section]?.startMeasure ?? 0)
    if ((localMeasure + section) % 2 === 0 || rng.chance(section === 2 ? 0.12 : 0.25)) return
    const starts = settings.complexity >= 4
      ? section === 1 ? [0.75, 2, 3.25] : [0.5, 2.5]
      : section === 2 ? [0.5, 2.75] : [1]
    starts.forEach((offset, index) => {
      const nextOffset = starts[index + 1] ?? 4
      const contraryDegree = section === 2 ? 5 - degree : degree + (measure % 4 === 1 ? 4 : 2)
      const neighbor = index % 2 === 0 ? 0 : rng.pick([-1, 1])
      notes.push(add(measure * 4 + offset, Math.max(0.3, nextOffset - offset - 0.18), degreeToMidi(root, settings.scale, contraryDegree + neighbor), 0.37 + rng.next() * 0.1))
    })
  })
  return notes
}

function generateArpeggio(settings: ComposerSettings, rng: SeededRandom, progression: number[], sections: ArrangementSection[]): NoteEvent[] {
  const totalBeats = progression.length * 4
  const add = noteFactory('arpeggio', totalBeats)
  const root = keyToMidi(settings.key, 4)
  const notes: NoteEvent[] = []
  progression.forEach((degree, measure) => {
    const chord = chordForDegree(root, settings.scale, degree)
    const section = sectionForMeasure(sections, measure)
    const subdivision = settings.complexity >= 5 ? 0.25 : 0.5
    const shapes = [[0, 1, 2, 1], [0, 2, 1, 2], [2, 1, 0, 1], [0, 1, 2, 0]]
    const shape = shapes[(section + measure) % shapes.length]
    for (let beat = 0; beat < 4; beat += subdivision) {
      const index = Math.floor(beat / subdivision)
      if (section === 0 && beat % 1 !== 0 && rng.chance(0.24)) continue
      if (section === 2 && index % 4 === 3) continue
      const chordIndex = shape[index % shape.length]
      const octave = section === 1 && index % 8 >= 4 ? 12 : 0
      const midi = chord[chordIndex] + octave
      notes.push(add(measure * 4 + beat, subdivision * 0.7, midi, 0.28 + (beat % 1 === 0 ? 0.1 : 0) + rng.next() * 0.04))
    }
  })
  return notes
}

function buildTrack(role: TrackRole, settings: ComposerSettings, progression: number[], measures: number, sections: ArrangementSection[], revision: number): Track {
  const rng = new SeededRandom(`${settings.seed}|${settings.variation}|${role}|${revision}|${settings.key}|${settings.scale}|${settings.complexity}|${settings.intensity}`)
  const generators = new Map<TrackRole, () => NoteEvent[]>([
    ['drums', () => generateDrums(settings, rng, measures, sections)],
    ['bass', () => generateBass(settings, rng, progression, sections)],
    ['harmony', () => generateHarmony(settings, progression, sections)],
    ['melody', () => generateMelody(settings, rng, measures, sections, progression)],
    ['countermelody', () => generateCountermelody(settings, rng, progression, sections)],
    ['arpeggio', () => generateArpeggio(settings, rng, progression, sections)],
  ])
  const generateNotes = generators.get(role)
  if (!generateNotes) throw new Error('Choose a supported track role.')
  const volume: Record<TrackRole, number> = { drums: 0.72, bass: 0.68, harmony: 0.52, melody: 0.66, countermelody: 0.48, arpeggio: 0.42 }
  const pan: Record<TrackRole, number> = { drums: 0, bass: 0, harmony: -0.2, melody: 0.12, countermelody: -0.28, arpeggio: 0.3 }
  return {
    id: role,
    name: ROLE_NAMES[role],
    role,
    channel: CHANNELS[role],
    instrument: defaultInstrument(role, settings.instrumentation),
    notes: generateNotes(),
    volume: volume[role],
    pan: pan[role],
    mute: false,
    solo: false,
    octave: 0,
    locked: false,
    revision,
  }
}

function clipTrack(track: Track, totalBeats: number): Track {
  return {
    ...track,
    notes: track.notes
      .filter((note) => note.startBeats < totalBeats)
      .map((note) => ({ ...note, durationBeats: Math.min(note.durationBeats, totalBeats - note.startBeats) })),
  }
}

export function generateComposition(settingsInput: ComposerSettings, previous?: Composition, regenerateTrackId?: string): Composition {
  const settings = validateSettings({ ...settingsInput, seed: settingsInput.seed.trim() })
  const measures = calculateMeasures(settings.tempo, settings.targetSeconds)
  const totalBeats = measures * 4
  const durationSeconds = calculateDuration(settings.tempo, measures)
  const sections = makeSections(measures)
  const progressionRng = new SeededRandom(`${settings.seed}|${settings.variation}|progression|${settings.mood}`)
  const progression = progressionFor(settings, progressionRng, measures, sections)
  const roles: TrackRole[] = ['drums', 'bass', 'harmony', 'melody', 'countermelody']
  if (settings.complexity >= 3) roles.push('arpeggio')

  const tracks = roles.map((role) => {
    const prior = previous?.tracks.find((track) => track.id === role)
    const regenerate = regenerateTrackId === role
    const preserve = prior && !regenerate && (regenerateTrackId !== undefined || prior.locked)
    if (preserve) return clipTrack({ ...prior }, totalBeats)
    return buildTrack(role, settings, progression, measures, sections, regenerate ? (prior?.revision ?? 0) + 1 : 0)
  })

  const extraTracks = previous?.tracks.filter((track) => !roles.includes(track.id as TrackRole)) ?? []
  extraTracks.forEach((prior) => {
    if (prior.id === regenerateTrackId) {
      const fresh = buildTrack(prior.role, settings, progression, measures, sections, prior.revision + 1)
      tracks.push({
        ...fresh,
        id: prior.id,
        name: prior.name,
        channel: prior.channel,
        instrument: prior.instrument,
        volume: prior.volume,
        pan: prior.pan,
        mute: prior.mute,
        solo: prior.solo,
        octave: prior.octave,
        locked: prior.locked,
        notes: fresh.notes.map((note) => ({ ...note, id: `${prior.id}-${note.id}` })),
      })
    } else {
      tracks.push(clipTrack({ ...prior }, totalBeats))
    }
  })

  const presetName = PRESETS.find((preset) => preset.id === settings.presetId)?.name ?? 'Custom loop'
  const identity = `${settings.seed}|${settings.variation}|${settings.tempo}|${settings.key}|${settings.scale}|${settings.intensity}|${settings.complexity}`
  return {
    version: PROJECT_VERSION,
    id: `loop-${hashString(identity).toString(16).padStart(8, '0')}`,
    title: `${presetName} · V${settings.variation + 1}`,
    settings,
    beatsPerMeasure: 4,
    measures,
    totalBeats,
    durationSeconds,
    sections,
    tracks,
  }
}

export function isDuplicatedTrack(track: Pick<Track, 'id' | 'role'>): boolean {
  return track.id !== track.role
}

export function removeDuplicatedTrack(composition: Composition, trackId: string): Composition {
  const track = composition.tracks.find((candidate) => candidate.id === trackId)
  if (!track || !isDuplicatedTrack(track)) return composition
  return { ...composition, tracks: composition.tracks.filter((candidate) => candidate.id !== trackId) }
}

export function duplicateTrack(composition: Composition, trackId: string): Composition {
  const source = composition.tracks.find((track) => track.id === trackId)
  if (!source || composition.tracks.length >= 16) return composition
  const usedChannels = new Set(composition.tracks.map((track) => track.channel))
  let channel = MIDI_PERCUSSION_CHANNEL
  if (source.role !== 'drums') {
    channel = 0
    while (usedChannels.has(channel) || channel === MIDI_PERCUSSION_CHANNEL) channel += 1
    if (channel > 15) channel = source.channel
  }
  const usedTrackIds = new Set(composition.tracks.map((track) => track.id))
  let copyIndex = 1
  while (usedTrackIds.has(`${source.id}-copy-${copyIndex}`)) copyIndex += 1
  const copy: Track = {
    ...source,
    id: `${source.id}-copy-${copyIndex}`,
    name: `${source.name} copy ${copyIndex}`,
    channel,
    pan: Math.max(-1, Math.min(1, -source.pan)),
    notes: source.notes.map((note) => ({ ...note, id: `${note.id}-copy-${copyIndex}` })),
  }
  return { ...composition, tracks: [...composition.tracks, copy] }
}
