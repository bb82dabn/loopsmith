import { Mp3Encoder } from '@breezystack/lamejs'

export const MP3_ENCODER_DELAY = 576
export const MP3_FRAME_SAMPLES = 1152

export type CompensatedPcm = {
  left: Int16Array
  right: Int16Array
  encoderDelay: number
  endPadding: number
  originalSamples: number
}

function floatToInt16(value: number): number {
  return Math.round(Math.max(-1, Math.min(1, value)) * 32767)
}

export function compensateEncoderDelay(left: Float32Array, right: Float32Array): CompensatedPcm {
  const originalSamples = Math.min(left.length, right.length)
  const contentWithDelay = originalSamples + MP3_ENCODER_DELAY
  const encodedSamples = Math.ceil(contentWithDelay / MP3_FRAME_SAMPLES) * MP3_FRAME_SAMPLES
  const endPadding = encodedSamples - contentWithDelay
  const outputLength = MP3_ENCODER_DELAY + originalSamples + endPadding
  const outputLeft = new Int16Array(outputLength)
  const outputRight = new Int16Array(outputLength)
  for (let index = 0; index < outputLength; index += 1) {
    const sourceIndex = (index - MP3_ENCODER_DELAY + originalSamples) % originalSamples
    outputLeft[index] = floatToInt16(left[sourceIndex])
    outputRight[index] = floatToInt16(right[sourceIndex])
  }
  return { left: outputLeft, right: outputRight, encoderDelay: MP3_ENCODER_DELAY, endPadding, originalSamples }
}

function synchsafe(value: number): Uint8Array {
  return new Uint8Array([(value >> 21) & 0x7f, (value >> 14) & 0x7f, (value >> 7) & 0x7f, value & 0x7f])
}

function textFrame(id: string, text: string): Uint8Array {
  const encoded = new TextEncoder().encode(text)
  const frame = new Uint8Array(10 + 1 + encoded.length)
  frame.set(new TextEncoder().encode(id), 0)
  new DataView(frame.buffer).setUint32(4, encoded.length + 1, false)
  frame[10] = 3
  frame.set(encoded, 11)
  return frame
}

function txxxFrame(description: string, value: string): Uint8Array {
  const encoded = new TextEncoder().encode(`${description}\0${value}`)
  const frame = new Uint8Array(10 + 1 + encoded.length)
  frame.set(new TextEncoder().encode('TXXX'), 0)
  new DataView(frame.buffer).setUint32(4, encoded.length + 1, false)
  frame[10] = 3
  frame.set(encoded, 11)
  return frame
}

function makeGaplessId3(originalSamples: number, encoderDelay: number, endPadding: number, sampleRate: number): Uint8Array {
  const hex = (value: number, width: number) => value.toString(16).toUpperCase().padStart(width, '0')
  const smpb = ` 00000000 ${hex(encoderDelay, 8)} ${hex(endPadding, 8)} ${hex(originalSamples, 16)} 00000000 00000000 00000000 00000000 00000000 00000000`
  const frames = [
    txxxFrame('iTunSMPB', smpb),
    txxxFrame('LOOPSTART', '0'),
    txxxFrame('LOOPLENGTH', String(originalSamples)),
    textFrame('TLEN', String(Math.round((originalSamples / sampleRate) * 1000))),
  ]
  const size = frames.reduce((sum, frame) => sum + frame.length, 0)
  const tag = new Uint8Array(10 + size)
  tag.set([0x49, 0x44, 0x33, 4, 0, 0], 0)
  tag.set(synchsafe(size), 6)
  let offset = 10
  frames.forEach((frame) => {
    tag.set(frame, offset)
    offset += frame.length
  })
  return tag
}

export function encodeMp3(
  left: Float32Array,
  right: Float32Array,
  sampleRate: number,
  bitrate: 96 | 128 | 192,
  onProgress?: (progress: number) => void,
): Uint8Array {
  const compensated = compensateEncoderDelay(left, right)
  const encoder = new Mp3Encoder(2, sampleRate, bitrate)
  const chunks: Uint8Array[] = []
  for (let offset = 0; offset < compensated.left.length; offset += MP3_FRAME_SAMPLES) {
    const encoded = encoder.encodeBuffer(
      compensated.left.subarray(offset, offset + MP3_FRAME_SAMPLES),
      compensated.right.subarray(offset, offset + MP3_FRAME_SAMPLES),
    )
    if (encoded.length) chunks.push(encoded)
    if (offset % (MP3_FRAME_SAMPLES * 50) === 0) onProgress?.(offset / compensated.left.length)
  }
  const finalChunk = encoder.flush()
  if (finalChunk.length) chunks.push(finalChunk)
  const id3 = makeGaplessId3(compensated.originalSamples, compensated.encoderDelay, compensated.endPadding, sampleRate)
  const size = chunks.reduce((sum, chunk) => sum + chunk.length, id3.length)
  const output = new Uint8Array(size)
  output.set(id3, 0)
  let cursor = id3.length
  chunks.forEach((chunk) => {
    output.set(chunk, cursor)
    cursor += chunk.length
  })
  onProgress?.(1)
  return output
}
