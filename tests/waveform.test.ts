import { describe, expect, it } from 'vitest'
import { buildWaveformPeaks } from '../src/ui/waveform'

describe('waveform peak downsampling', () => {
  it('preserves stereo minima and maxima in each bucket', () => {
    const left = Float32Array.from([-1, 0.25, -0.4, 0.8])
    const right = Float32Array.from([-0.5, 0.5, -0.75, 0.4])

    expect(buildWaveformPeaks([left, right], 2)).toEqual([
      { min: -1, max: 0.5 },
      { min: -0.75, max: 0.800000011920929 },
    ])
  })

  it('returns stable silence buckets for empty audio', () => {
    const empty = new Float32Array()
    expect(buildWaveformPeaks([empty, empty], 3)).toEqual([
      { min: 0, max: 0 },
      { min: 0, max: 0 },
      { min: 0, max: 0 },
    ])
  })

  it('always creates at least one column', () => {
    const samples = Float32Array.from([0.25])
    expect(buildWaveformPeaks([samples, samples], 0)).toHaveLength(1)
  })
})
