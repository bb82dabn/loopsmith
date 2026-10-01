/// <reference lib="webworker" />
import { renderComposition } from '../audio/synthesis'
import type { RenderRequest, RenderResponse } from '../music/types'

self.onmessage = (event: MessageEvent<RenderRequest>) => {
  const request = event.data
  try {
    const audio = renderComposition(request.composition, request.sampleRate ?? 44100, (progress, label) => {
      self.postMessage({ type: 'progress', jobId: request.jobId, progress, label } satisfies RenderResponse)
    })
    const left = audio.channels[0].buffer
    const right = audio.channels[1].buffer
    self.postMessage(
      { type: 'rendered', jobId: request.jobId, sampleRate: audio.sampleRate, left, right, durationSeconds: audio.durationSeconds, loopMetrics: audio.loopMetrics } satisfies RenderResponse,
      { transfer: [left, right] },
    )
  } catch (error) {
    self.postMessage({ type: 'error', jobId: request.jobId, message: error instanceof Error ? error.message : 'Audio rendering failed.' } satisfies RenderResponse)
  }
}

export {}
