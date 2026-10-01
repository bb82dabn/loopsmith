import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { basename, extname, join, resolve } from 'node:path'
import midiPackage from '@tonejs/midi'

const { Midi } = midiPackage

function argument(name, fallback) {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : fallback
}

const input = argument('input')
const sourceId = argument('source')
if (!input || !sourceId) {
  console.error('Usage: node tools/analyze-midi-corpus.mjs --input <midi-directory> --source <source-id> --stdout')
  process.exit(1)
}

const durationBuckets = [0.125, 0.25, 0.375, 0.5, 0.75, 1, 1.5, 2, 3, 4]
const gapBuckets = [0.125, 0.25, 0.375, 0.5, 0.75, 1, 1.5, 2, 3, 4]

function nearestBucket(value, buckets) {
  return buckets.reduce((best, candidate) => Math.abs(candidate - value) < Math.abs(best - value) ? candidate : best)
}

function add(map, key, amount = 1) {
  map.set(String(key), (map.get(String(key)) ?? 0) + amount)
}

function normalize(map, numeric = true) {
  const entries = [...map.entries()]
    .map(([value, count]) => ({ value: numeric ? Number(value) : value, count }))
    .sort((left, right) => numeric ? left.value - right.value : String(left.value).localeCompare(String(right.value)))
  const total = entries.reduce((sum, entry) => sum + entry.count, 0)
  return entries.map(({ value, count }) => ({ value, weight: Number((count / total).toFixed(6)) }))
}

function selectMelodyTrack(midi) {
  return midi.tracks
    .filter((track) => track.channel !== 9 && track.notes.length >= 4)
    .map((track) => {
      const averagePitch = track.notes.reduce((sum, note) => sum + note.midi, 0) / track.notes.length
      return { track, score: averagePitch + Math.log2(track.notes.length) * 2 }
    })
    .sort((left, right) => right.score - left.score)[0]?.track
}

function monophonicOnsets(track) {
  const byTick = new Map()
  track.notes.forEach((note) => {
    const existing = byTick.get(note.ticks)
    if (!existing || note.midi > existing.midi) byTick.set(note.ticks, note)
  })
  return [...byTick.values()].sort((left, right) => left.ticks - right.ticks)
}

function classifyMood(name) {
  const title = name.toLowerCase()
  if (/danger|emperor|barbarian|rage|battle/.test(title)) return 'tense'
  if (/dungeon|pagoda|night|courtesan/.test(title)) return 'mysterious'
  if (/game over|reunion|lament|sad/.test(title)) return 'melancholy'
  if (/victory|fanfare|finale|opening|rebel/.test(title)) return 'heroic'
  if (/town|inn|sanctuary/.test(title)) return 'peaceful'
  if (/ostrich|comrade|overworld|prelude/.test(title)) return 'bright'
  return 'all'
}

function freshStats() {
  return {
    intervals: new Map(),
    durations: new Map(),
    gaps: new Map(),
    onsets: new Map(),
    rootMotion: new Map(),
    directionChanges: 0,
    directionComparisons: 0,
    leapResolutions: 0,
    leapComparisons: 0,
    repeatedNotes: 0,
    intervalCount: 0,
    trackCounts: [],
    notesPerBeat: [],
    pitchSpans: [],
  }
}

function mergeTrack(stats, midi, melody) {
  const ppq = midi.header.ppq
  const notes = monophonicOnsets(melody)
  const intervals = []
  notes.forEach((note, index) => {
    const duration = note.durationTicks / ppq
    const onset = ((note.ticks / ppq) % 4 + 4) % 4
    add(stats.durations, nearestBucket(Math.max(0.125, Math.min(4, duration)), durationBuckets))
    add(stats.onsets, Math.round(onset * 4) % 16)
    if (index === 0) return
    const previous = notes[index - 1]
    const semitones = Math.max(-12, Math.min(12, note.midi - previous.midi))
    const gap = Math.max(0.125, Math.min(4, (note.ticks - previous.ticks) / ppq))
    intervals.push(semitones)
    add(stats.intervals, semitones)
    add(stats.gaps, nearestBucket(gap, gapBuckets))
    stats.intervalCount += 1
    if (semitones === 0) stats.repeatedNotes += 1
  })
  for (let index = 1; index < intervals.length; index += 1) {
    const previous = intervals[index - 1]
    const current = intervals[index]
    if (previous !== 0 && current !== 0) {
      stats.directionComparisons += 1
      if (Math.sign(previous) !== Math.sign(current)) stats.directionChanges += 1
    }
    if (Math.abs(previous) >= 5) {
      stats.leapComparisons += 1
      if (Math.sign(previous) !== Math.sign(current) && Math.abs(current) <= 4) stats.leapResolutions += 1
    }
  }

  const nonDrumTracks = midi.tracks.filter((track) => track.channel !== 9 && track.notes.length > 0)
  const totalBeats = Math.max(1, midi.durationTicks / ppq)
  const allNotes = nonDrumTracks.flatMap((track) => track.notes)
  stats.trackCounts.push(nonDrumTracks.length)
  stats.notesPerBeat.push(allNotes.length / totalBeats)
  if (allNotes.length) {
    const pitches = allNotes.map((note) => note.midi)
    stats.pitchSpans.push(Math.max(...pitches) - Math.min(...pitches))
  }

  const measureRoots = []
  const measures = Math.ceil(totalBeats / 4)
  for (let measure = 0; measure < measures; measure += 1) {
    const startTick = measure * 4 * ppq
    const endTick = startTick + 4 * ppq
    const candidates = allNotes.filter((note) => note.ticks >= startTick && note.ticks < endTick)
    if (candidates.length) measureRoots.push(Math.min(...candidates.map((note) => note.midi)) % 12)
  }
  for (let index = 1; index < measureRoots.length; index += 1) {
    add(stats.rootMotion, (measureRoots[index] - measureRoots[index - 1] + 12) % 12)
  }
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
}

function serializeStats(stats) {
  return {
    melodicIntervals: normalize(stats.intervals),
    noteDurationsBeats: normalize(stats.durations),
    onsetGapsBeats: normalize(stats.gaps),
    onsetSixteenths: normalize(stats.onsets),
    harmonicRootMotionSemitones: normalize(stats.rootMotion),
    directionChangeProbability: Number((stats.directionChanges / Math.max(1, stats.directionComparisons)).toFixed(4)),
    leapResolutionProbability: Number((stats.leapResolutions / Math.max(1, stats.leapComparisons)).toFixed(4)),
    repeatedNoteProbability: Number((stats.repeatedNotes / Math.max(1, stats.intervalCount)).toFixed(4)),
    averageTrackCount: Number(average(stats.trackCounts).toFixed(3)),
    averageNotesPerBeat: Number(average(stats.notesPerBeat).toFixed(3)),
    averagePitchSpan: Number(average(stats.pitchSpans).toFixed(3)),
  }
}

async function listMidiFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return listMidiFiles(path)
    return ['.mid', '.midi'].includes(extname(entry.name).toLowerCase()) ? [path] : []
  }))
  return nested.flat().sort()
}

const files = await listMidiFiles(resolve(input))
if (!files.length) throw new Error(`No MIDI files found under ${input}`)
const globalStats = freshStats()
const moodStats = new Map()
const ledger = []
let sourceNotes = 0

for (const path of files) {
  const bytes = await readFile(path)
  const midi = new Midi(bytes)
  const melody = selectMelodyTrack(midi)
  if (!melody) continue
  const mood = classifyMood(basename(path))
  const profile = moodStats.get(mood) ?? freshStats()
  moodStats.set(mood, profile)
  mergeTrack(globalStats, midi, melody)
  mergeTrack(profile, midi, melody)
  sourceNotes += midi.tracks.reduce((sum, track) => sum + track.notes.length, 0)
  ledger.push({
    file: basename(path),
    sha256: createHash('sha256').update(bytes).digest('hex'),
    tracks: midi.tracks.length,
    notes: midi.tracks.reduce((sum, track) => sum + track.notes.length, 0),
    durationSeconds: Number(midi.duration.toFixed(3)),
    moodProfile: mood,
  })
}

const output = {
  schemaVersion: 1,
  kind: 'aggregate-midi-statistics',
  originalityGuard: 'No source note sequence, chord sequence, or rhythm template is retained.',
  sourceId,
  sourceMidiFiles: ledger.length,
  sourceNotes,
  global: serializeStats(globalStats),
  moods: Object.fromEntries([...moodStats.entries()].filter(([, stats]) => stats.trackCounts.length >= 2).map(([mood, stats]) => [mood, serializeStats(stats)])),
  ledger,
}

console.log(JSON.stringify(output, null, 2))
