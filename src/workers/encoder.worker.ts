/// <reference lib="webworker" />
import { encodeMp3 } from '../audio/mp3'
import type { EncodeRequest, EncodeResponse } from '../music/types'

self.onmessage = (event: MessageEvent<EncodeRequest>) => {
  const { jobId, left, right, sampleRate, bitrate } = event.data
  try {
    const bytes = encodeMp3(new Float32Array(left), new Float32Array(right), sampleRate, bitrate, (progress) => {
      self.postMessage({ type: 'progress', jobId, progress } satisfies EncodeResponse)
    })
    self.postMessage({ type: 'encoded', jobId, bytes: bytes.buffer } satisfies EncodeResponse, { transfer: [bytes.buffer] })
  } catch (error) {
    self.postMessage({ type: 'error', jobId, message: error instanceof Error ? error.message : 'MP3 encoding failed.' } satisfies EncodeResponse)
  }
}

export {}
