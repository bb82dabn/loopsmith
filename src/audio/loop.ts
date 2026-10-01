import type { LoopMetrics } from '../music/types'

export function makeSeamlessLoop(left: Float32Array, right: Float32Array, sampleRate: number, milliseconds = 6): void {
  const window = Math.max(16, Math.min(Math.floor((sampleRate * milliseconds) / 1000), Math.floor(left.length / 4)))
  for (const channel of [left, right]) {
    for (let offset = 0; offset < window; offset += 1) {
      const startIndex = offset
      const endIndex = channel.length - 1 - offset
      const phase = (offset / window) * Math.PI * 0.5
      const transparentGain = Math.sin(phase) ** 2
      channel[startIndex] *= transparentGain
      channel[endIndex] *= transparentGain
    }
  }
}

export function measureLoopBoundary(left: Float32Array, right: Float32Array, windowSamples = 256): LoopMetrics {
  if (left.length !== right.length) {
    throw new RangeError('Loop boundary channels must have equal lengths')
  }
  if (left.length < 2) {
    throw new RangeError('Loop boundary channels must contain at least two samples')
  }
  if (!Number.isFinite(windowSamples) || windowSamples < 2) {
    throw new RangeError('Loop boundary window must be finite and at least two samples')
  }

  const window = Math.min(Math.floor(windowSamples), left.length)
  let peak = 0
  let energy = 0
  let count = 0
  for (const channel of [left, right]) {
    const seamJump = Math.abs(channel[0] - channel[channel.length - 1])
    peak = Math.max(peak, seamJump)
    energy += seamJump * seamJump
    count += 1
    for (let index = 1; index < window; index += 1) {
      const beforeSlope = channel[channel.length - index] - channel[channel.length - index - 1]
      const afterSlope = channel[index] - channel[index - 1]
      const weightedMismatch = (beforeSlope - afterSlope) / index
      peak = Math.max(peak, Math.abs(weightedMismatch))
      energy += weightedMismatch * weightedMismatch
      count += 1
    }
  }
  return {
    peakDiscontinuity: peak,
    rmsDiscontinuity: Math.sqrt(energy / count),
    windowSamples: window,
  }
}

export function addCircularDelay(channel: Float32Array, sampleRate: number, delaySeconds: number, amount: number): void {
  const source = channel.slice()
  const delay = Math.max(1, Math.round(sampleRate * delaySeconds))
  const secondDelay = Math.min(channel.length - 1, Math.round(delay * 1.71))
  for (let index = 0; index < channel.length; index += 1) {
    const first = source[(index - delay + source.length) % source.length]
    const second = source[(index - secondDelay + source.length) % source.length]
    channel[index] += first * amount + second * amount * 0.42
  }
}
