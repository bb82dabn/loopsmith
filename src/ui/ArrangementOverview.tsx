import { useEffect, useRef } from 'react'
import type { Composition } from '../music/types'

const colors = ['#a970ff', '#5c8ee6', '#47b4a2', '#8ea760', '#d19a3f', '#d16f42', '#bc4d78', '#7892c8']

interface ArrangementOverviewProps {
  composition: Composition
  playheadSeconds: number
  zoom: number
  onSeek: (seconds: number) => void
}

export function ArrangementOverview({ composition, playheadSeconds, zoom, onSeek }: ArrangementOverviewProps) {
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
      const width = bounds.width
      const height = bounds.height
      const laneHeight = height / Math.max(1, composition.tracks.length)
      context.fillStyle = '#0c141e'
      context.fillRect(0, 0, width, height)

      composition.sections.forEach((section, index) => {
        context.fillStyle = index % 2 === 0 ? '#101b27' : '#131f2c'
        const x = (section.startMeasure / composition.measures) * width
        context.fillRect(x, 0, (section.measures / composition.measures) * width, height)
      })

      for (let measure = 0; measure <= composition.measures; measure += 1) {
        const x = (measure / composition.measures) * width
        context.strokeStyle = measure % 4 === 0 ? '#415065' : '#263545'
        context.lineWidth = measure % 4 === 0 ? 1 : 0.5
        context.beginPath()
        context.moveTo(x, 0)
        context.lineTo(x, height)
        context.stroke()
      }

      composition.tracks.forEach((track, trackIndex) => {
        const top = laneHeight * trackIndex
        context.strokeStyle = '#263442'
        context.beginPath()
        context.moveTo(0, top)
        context.lineTo(width, top)
        context.stroke()
        context.globalAlpha = track.mute ? 0.2 : 1
        context.fillStyle = colors[trackIndex % colors.length]
        track.notes.forEach((note) => {
          const x = (note.startBeats / composition.totalBeats) * width
          const noteWidth = Math.max(2, (note.durationBeats / composition.totalBeats) * width)
          const pitchPosition = (note.midi % 24) / 24
          const y = top + laneHeight - 5 - pitchPosition * Math.max(5, laneHeight - 10)
          context.fillRect(x, y, noteWidth, Math.max(2, Math.min(4, laneHeight * 0.16)))
        })
        context.globalAlpha = 1
      })

      const playheadX = (playheadSeconds / composition.durationSeconds) * width
      context.strokeStyle = '#b881ff'
      context.lineWidth = 1.5
      context.beginPath()
      context.moveTo(playheadX, 0)
      context.lineTo(playheadX, height)
      context.stroke()
    }
    draw()
    const observer = new ResizeObserver(draw)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [composition, playheadSeconds, zoom])

  return (
    <canvas
      ref={canvasRef}
      className="editor-canvas arrangement-overview"
      style={{ width: `${zoom * 100}%` }}
      aria-label={`Arrangement overview with ${composition.tracks.length} tracks and ${composition.measures} measures`}
      onPointerDown={(event) => {
        const bounds = event.currentTarget.getBoundingClientRect()
        onSeek(((event.clientX - bounds.left) / bounds.width) * composition.durationSeconds)
      }}
    />
  )
}
