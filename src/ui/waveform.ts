export interface WaveformPeak {
  min: number
  max: number
}

export function buildWaveformPeaks(
  channels: [Float32Array, Float32Array],
  requestedColumns: number,
): WaveformPeak[] {
  const sampleCount = Math.min(channels[0].length, channels[1].length)
  const columns = Math.max(1, Math.floor(requestedColumns))
  if (sampleCount === 0) return Array.from({ length: columns }, () => ({ min: 0, max: 0 }))

  return Array.from({ length: columns }, (_, column) => {
    const start = Math.floor((column / columns) * sampleCount)
    const end = Math.max(start + 1, Math.floor(((column + 1) / columns) * sampleCount))
    let min = 1
    let max = -1
    for (let sample = start; sample < Math.min(end, sampleCount); sample += 1) {
      const left = channels[0][sample]
      const right = channels[1][sample]
      min = Math.min(min, left, right)
      max = Math.max(max, left, right)
    }
    return { min: Number.isFinite(min) ? min : 0, max: Number.isFinite(max) ? max : 0 }
  })
}
