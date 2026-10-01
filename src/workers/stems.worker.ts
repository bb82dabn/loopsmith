/// <reference lib="webworker" />
import { createStemBundle } from '../audio/stems'
import { renderCompositionStems } from '../audio/synthesis'
import type { StemExportRequest, StemExportResponse } from '../music/types'

self.onmessage = (event: MessageEvent<StemExportRequest>) => {
  const request = event.data
  try {
    const rendered = renderCompositionStems(request.composition, request.sampleRate ?? 44100, (progress, label, trackId) => {
      self.postMessage({ type: 'progress', jobId: request.jobId, progress: progress * 0.85, label, trackId } satisfies StemExportResponse)
    })
    self.postMessage({ type: 'progress', jobId: request.jobId, progress: 0.9, label: 'Packaging WAV stem bundle' } satisfies StemExportResponse)
    const { bytes } = createStemBundle(request.composition, rendered)
    const buffer = bytes.buffer
    self.postMessage(
      { type: 'exported-stems', jobId: request.jobId, compositionId: request.composition.id, bytes: buffer, stemCount: rendered.stems.length } satisfies StemExportResponse,
      { transfer: [buffer] },
    )
  } catch (error) {
    self.postMessage({ type: 'error', jobId: request.jobId, message: error instanceof Error ? error.message : 'WAV stem export failed.' } satisfies StemExportResponse)
  }
}

export {}
