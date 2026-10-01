import { measureLoopBoundary } from './loop'
import type { LoopMetrics } from '../music/types'

export interface Mp3Verification {
  decodedDuration: number
  selectedOffsetSamples: number
  metrics: LoopMetrics
}

export async function verifyEncodedMp3(bytes: Uint8Array, expectedSamples: number): Promise<Mp3Verification> {
  const AudioContextClass = window.AudioContext ?? window.webkitAudioContext
  if (!AudioContextClass) throw new Error('This browser cannot decode MP3 audio for verification.')
  const context = new AudioContextClass()
  try {
    const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    const decoded = await context.decodeAudioData(copy)
    if (decoded.numberOfChannels < 1 || decoded.length < expectedSamples) throw new Error('The encoded MP3 decoded to an unexpected length.')
    const leftSource = decoded.getChannelData(0)
    const rightSource = decoded.getChannelData(Math.min(1, decoded.numberOfChannels - 1))
    const maximumOffset = decoded.length - expectedSamples
    const candidates = [...new Set([0, Math.min(576, maximumOffset), maximumOffset])]
    let best: Mp3Verification | null = null
    candidates.forEach((offset) => {
      const left = leftSource.subarray(offset, offset + expectedSamples)
      const right = rightSource.subarray(offset, offset + expectedSamples)
      const metrics = measureLoopBoundary(left, right)
      if (!best || metrics.rmsDiscontinuity < best.metrics.rmsDiscontinuity) {
        best = { decodedDuration: decoded.duration, selectedOffsetSamples: offset, metrics }
      }
    })
    return best!
  } finally {
    await context.close()
  }
}
