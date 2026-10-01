import { useEffect, useRef } from 'react'
import type { Composition, NoteEvent, Track } from '../music/types'
import type { GridDivision } from '../music/noteEditing'

interface PianoRollProps {
  composition: Composition
  track: Track
  playheadSeconds: number
  gridDivision: GridDivision
  zoom: number
  selectedNoteId: string | null
  onSelectNote: (note: NoteEvent) => void
  onClearSelection: () => void
  onSeek: (seconds: number) => void
}

interface PianoRollLayout {
  width: number
  height: number
  keyWidth: number
  rulerHeight: number
  timelineWidth: number
  minimumMidi: number
  maximumMidi: number
  rowHeight: number
}

interface NoteRectangle {
  note: NoteEvent
  x: number
  y: number
  width: number
  height: number
}

function noteName(midi: number): string {
  const names = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']
  return `${names[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`
}

function isBlackKey(midi: number): boolean {
  return [1, 3, 6, 8, 10].includes(((midi % 12) + 12) % 12)
}

function createLayout(width: number, height: number, track: Track): PianoRollLayout {
  const keyWidth = 50
  const rulerHeight = 24
  const timelineWidth = Math.max(1, width - keyWidth)
  const noteMidis = track.notes.map((note) => note.midi + track.octave * 12)
  let minimumMidi = noteMidis.length ? Math.min(...noteMidis) - 2 : 48
  let maximumMidi = noteMidis.length ? Math.max(...noteMidis) + 2 : 66
  if (maximumMidi - minimumMidi < 18) {
    const padding = Math.ceil((18 - (maximumMidi - minimumMidi)) / 2)
    minimumMidi -= padding
    maximumMidi += padding
  }
  minimumMidi = Math.max(12, minimumMidi)
  maximumMidi = Math.min(120, maximumMidi)
  const pitchCount = Math.max(1, maximumMidi - minimumMidi + 1)
  return { width, height, keyWidth, rulerHeight, timelineWidth, minimumMidi, maximumMidi, rowHeight: (height - rulerHeight) / pitchCount }
}

function noteRectangles(layout: PianoRollLayout, composition: Composition, track: Track): NoteRectangle[] {
  return track.notes.map((note) => {
    const midi = note.midi + track.octave * 12
    return {
      note,
      x: layout.keyWidth + (note.startBeats / composition.totalBeats) * layout.timelineWidth,
      y: layout.rulerHeight + (layout.maximumMidi - midi) * layout.rowHeight + 1,
      width: Math.max(3, (note.durationBeats / composition.totalBeats) * layout.timelineWidth - 1),
      height: Math.max(2, layout.rowHeight - 2),
    }
  })
}

export function PianoRoll({ composition, track, playheadSeconds, gridDivision, zoom, selectedNoteId, onSelectNote, onClearSelection, onSeek }: PianoRollProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const draw = () => {
      const bounds = canvas.getBoundingClientRect()
      const ratio = window.devicePixelRatio || 1
      canvas.width = Math.max(1, Math.round(bounds.width * ratio))
      canvas.height = Math.max(1, Math.round(bounds.height * ratio))
      const context = canvas.getContext('2d')
      if (!context) return
      context.scale(ratio, ratio)
      const layout = createLayout(bounds.width, bounds.height, track)

      context.fillStyle = '#0c141e'
      context.fillRect(0, 0, layout.width, layout.height)
      context.fillStyle = '#111c28'
      context.fillRect(0, 0, layout.keyWidth, layout.height)
      context.fillStyle = '#0f1924'
      context.fillRect(layout.keyWidth, 0, layout.timelineWidth, layout.rulerHeight)

      for (let midi = layout.minimumMidi; midi <= layout.maximumMidi; midi += 1) {
        const row = layout.maximumMidi - midi
        const y = layout.rulerHeight + row * layout.rowHeight
        context.fillStyle = isBlackKey(midi) ? '#101a25' : '#14202c'
        context.fillRect(layout.keyWidth, y, layout.timelineWidth, layout.rowHeight)
        context.strokeStyle = '#233242'
        context.lineWidth = 0.5
        context.beginPath()
        context.moveTo(0, y)
        context.lineTo(layout.width, y)
        context.stroke()
        context.fillStyle = isBlackKey(midi) ? '#1d2a37' : '#d7dde7'
        context.fillRect(0, y + 0.5, isBlackKey(midi) ? layout.keyWidth * 0.68 : layout.keyWidth, Math.max(1, layout.rowHeight - 1))
        if (midi % 12 === 0 && layout.rowHeight >= 8) {
          context.fillStyle = '#697789'
          context.font = '9px ui-monospace, SFMono-Regular, Menlo, monospace'
          context.textBaseline = 'middle'
          context.fillText(noteName(midi), 29, y + layout.rowHeight / 2)
        }
      }

      for (let beat = 0; beat <= composition.totalBeats + 0.001; beat += gridDivision) {
        const x = layout.keyWidth + (beat / composition.totalBeats) * layout.timelineWidth
        const measureBoundary = Math.abs(beat % composition.beatsPerMeasure) < 0.001
        const beatBoundary = Math.abs(beat % 1) < 0.001
        context.strokeStyle = measureBoundary ? '#4a5a70' : beatBoundary ? '#314154' : '#243344'
        context.lineWidth = measureBoundary ? 1 : 0.5
        context.beginPath()
        context.moveTo(x, layout.rulerHeight)
        context.lineTo(x, layout.height)
        context.stroke()
      }

      for (let measure = 0; measure <= composition.measures; measure += 1) {
        const x = layout.keyWidth + (measure / composition.measures) * layout.timelineWidth
        context.fillStyle = '#8995a5'
        context.font = '9px ui-monospace, SFMono-Regular, Menlo, monospace'
        context.textBaseline = 'middle'
        context.fillText(String(measure + 1), x + 5, layout.rulerHeight / 2)
      }

      context.globalAlpha = track.mute ? 0.25 : 1
      noteRectangles(layout, composition, track).forEach((rectangle) => {
        context.fillStyle = '#a970ff'
        context.fillRect(rectangle.x, rectangle.y, rectangle.width, rectangle.height)
        context.fillStyle = 'rgba(255,255,255,.18)'
        context.fillRect(rectangle.x, rectangle.y, rectangle.width, 1)
        if (rectangle.note.id === selectedNoteId) {
          context.strokeStyle = '#f5d8ff'
          context.lineWidth = 2
          context.strokeRect(rectangle.x - 1, rectangle.y - 1, rectangle.width + 2, rectangle.height + 2)
        }
      })
      context.globalAlpha = 1

      const playheadX = layout.keyWidth + (playheadSeconds / Math.max(0.01, composition.durationSeconds)) * layout.timelineWidth
      context.strokeStyle = '#c18aff'
      context.lineWidth = 1.5
      context.beginPath()
      context.moveTo(playheadX, 0)
      context.lineTo(playheadX, layout.height)
      context.stroke()
      context.fillStyle = '#c18aff'
      context.beginPath()
      context.moveTo(playheadX - 5, 0)
      context.lineTo(playheadX + 5, 0)
      context.lineTo(playheadX, 7)
      context.closePath()
      context.fill()
    }

    draw()
    const observer = new ResizeObserver(draw)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [composition, gridDivision, playheadSeconds, selectedNoteId, track, zoom])

  return (
    <canvas
      ref={canvasRef}
      className="editor-canvas piano-roll"
      style={{ width: `${zoom * 100}%` }}
      aria-label={`Piano roll for ${track.name} with ${track.notes.length} notes`}
      onPointerDown={(event) => {
        const bounds = event.currentTarget.getBoundingClientRect()
        const layout = createLayout(bounds.width, bounds.height, track)
        const x = event.clientX - bounds.left
        const y = event.clientY - bounds.top
        const selected = noteRectangles(layout, composition, track).reverse().find((rectangle) => (
          x >= rectangle.x && x <= rectangle.x + rectangle.width && y >= rectangle.y && y <= rectangle.y + rectangle.height
        ))
        if (selected) {
          onSelectNote(selected.note)
          return
        }
        onClearSelection()
        const fraction = Math.min(1, Math.max(0, (x - layout.keyWidth) / layout.timelineWidth))
        onSeek(fraction * composition.durationSeconds)
      }}
    />
  )
}
