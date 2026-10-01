import { useEffect, useMemo, useRef, useState } from 'react'
import type { PcmAudio } from '../music/types'
import { buildWaveformPeaks } from './waveform'

interface WaveformOverviewProps {
  audio: PcmAudio | null
  currentSeconds: number
  durationSeconds: number
  disabled: boolean
  onSeek: (seconds: number) => void
}

export function WaveformOverview({ audio, currentSeconds, durationSeconds, disabled, onSeek }: WaveformOverviewProps) {
  const frameRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [width, setWidth] = useState(320)
  const peaks = useMemo(
    () => audio ? buildWaveformPeaks(audio.channels, Math.min(1200, Math.max(1, Math.round(width)))) : [],
    [audio, width],
  )
  const progress = durationSeconds > 0 ? Math.min(1, Math.max(0, currentSeconds / durationSeconds)) : 0

  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    const updateWidth = () => setWidth(Math.max(1, frame.getBoundingClientRect().width))
    updateWidth()
    const observer = new ResizeObserver(updateWidth)
    observer.observe(frame)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const bounds = canvas.getBoundingClientRect()
    const ratio = window.devicePixelRatio || 1
    canvas.width = Math.max(1, Math.round(bounds.width * ratio))
    canvas.height = Math.max(1, Math.round(bounds.height * ratio))
    const context = canvas.getContext('2d')
    if (!context) return
    context.scale(ratio, ratio)
    const center = bounds.height / 2
    context.clearRect(0, 0, bounds.width, bounds.height)
    context.strokeStyle = '#384556'
    context.lineWidth = 1
    context.beginPath()
    context.moveTo(0, center + 0.5)
    context.lineTo(bounds.width, center + 0.5)
    context.stroke()

    if (peaks.length === 0) {
      context.strokeStyle = '#657185'
      context.setLineDash([2, 4])
      context.beginPath()
      context.moveTo(8, center)
      context.lineTo(Math.max(8, bounds.width - 8), center)
      context.stroke()
      return
    }

    const amplitude = Math.max(3, center - 5)
    context.strokeStyle = '#ad77ff'
    context.lineWidth = Math.max(1, bounds.width / peaks.length)
    context.beginPath()
    peaks.forEach((peak, index) => {
      const x = ((index + 0.5) / peaks.length) * bounds.width
      context.moveTo(x, center + peak.min * amplitude)
      context.lineTo(x, center + peak.max * amplitude)
    })
    context.stroke()
  }, [peaks])

  return (
    <div ref={frameRef} className={disabled ? 'waveform-overview disabled' : 'waveform-overview'}>
      <canvas ref={canvasRef} aria-hidden="true" />
      <span className="waveform-playhead" style={{ left: `${progress * 100}%` }} aria-hidden="true" />
      <input
        aria-label="Playback position"
        type="range"
        min="0"
        max={Math.max(0.01, durationSeconds)}
        step="0.01"
        value={Math.min(currentSeconds, Math.max(0.01, durationSeconds))}
        disabled={disabled}
        onChange={(event) => onSeek(Number(event.target.value))}
      />
    </div>
  )
}
