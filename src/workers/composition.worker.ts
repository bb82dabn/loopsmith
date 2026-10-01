/// <reference lib="webworker" />
import { generateComposition } from '../music/generator'
import type { GenerationRequest, GenerationResponse } from '../music/types'

self.onmessage = (event: MessageEvent<GenerationRequest>) => {
  const request = event.data
  try {
    const composition = generateComposition(request.settings, request.previous, request.regenerateTrackId)
    self.postMessage({ type: 'generated', jobId: request.jobId, composition } satisfies GenerationResponse)
  } catch (error) {
    self.postMessage({ type: 'error', jobId: request.jobId, message: error instanceof Error ? error.message : 'Composition failed.' } satisfies GenerationResponse)
  }
}

export {}
