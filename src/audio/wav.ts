import type { PcmAudio } from '../music/types'

export function encodeWav(audio: PcmAudio): Uint8Array {
  const [left, right] = audio.channels
  const frameCount = Math.min(left.length, right.length)
  const bytesPerSample = 2
  const channelCount = 2
  const dataSize = frameCount * channelCount * bytesPerSample
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)
  const writeAscii = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index))
  }
  writeAscii(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeAscii(8, 'WAVE')
  writeAscii(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, channelCount, true)
  view.setUint32(24, audio.sampleRate, true)
  view.setUint32(28, audio.sampleRate * channelCount * bytesPerSample, true)
  view.setUint16(32, channelCount * bytesPerSample, true)
  view.setUint16(34, 16, true)
  writeAscii(36, 'data')
  view.setUint32(40, dataSize, true)
  let offset = 44
  for (let index = 0; index < frameCount; index += 1) {
    view.setInt16(offset, Math.round(Math.max(-1, Math.min(1, left[index])) * 32767), true)
    view.setInt16(offset + 2, Math.round(Math.max(-1, Math.min(1, right[index])) * 32767), true)
    offset += 4
  }
  return new Uint8Array(buffer)
}
