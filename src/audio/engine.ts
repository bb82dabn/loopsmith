import type { PcmAudio } from '../music/types'

export class LoopAudioEngine {
  private context: AudioContext | null = null
  private gain: GainNode | null = null
  private buffer: AudioBuffer | null = null
  private source: AudioBufferSourceNode | null = null
  private auditionSource: AudioBufferSourceNode | null = null
  private startedAt = 0
  private offset = 0
  private playing = false
  private loop = true
  private volume = 0.82

  isSupported(): boolean {
    return typeof window !== 'undefined' && ('AudioContext' in window || 'webkitAudioContext' in window)
  }

  private getContext(): AudioContext {
    if (!this.context) {
      const AudioContextClass = window.AudioContext ?? window.webkitAudioContext
      this.context = new AudioContextClass()
      this.gain = this.context.createGain()
      this.gain.gain.value = this.volume
      this.gain.connect(this.context.destination)
    }
    return this.context
  }

  load(audio: PcmAudio): void {
    const context = this.getContext()
    this.stop()
    const buffer = context.createBuffer(2, audio.channels[0].length, audio.sampleRate)
    buffer.copyToChannel(audio.channels[0], 0)
    buffer.copyToChannel(audio.channels[1], 1)
    this.buffer = buffer
  }

  async play(): Promise<void> {
    if (!this.buffer) throw new Error('Generate audio before starting playback.')
    const context = this.getContext()
    if (context.state === 'suspended') await context.resume()
    if (this.playing) return
    const source = context.createBufferSource()
    source.buffer = this.buffer
    source.loop = this.loop
    source.loopStart = 0
    source.loopEnd = this.buffer.duration
    source.connect(this.gain!)
    this.offset %= this.buffer.duration
    this.startedAt = context.currentTime - this.offset
    source.start(0, this.offset)
    source.onended = () => {
      if (this.source === source && !source.loop) this.playing = false
    }
    this.source = source
    this.playing = true
  }

  async audition(audio: PcmAudio): Promise<void> {
    const context = this.getContext()
    if (context.state === 'suspended') await context.resume()
    this.releaseAuditionSource()
    const buffer = context.createBuffer(2, audio.channels[0].length, audio.sampleRate)
    buffer.copyToChannel(audio.channels[0], 0)
    buffer.copyToChannel(audio.channels[1], 1)
    const source = context.createBufferSource()
    source.buffer = buffer
    source.connect(this.gain!)
    source.onended = () => {
      if (this.auditionSource !== source) return
      source.disconnect()
      this.auditionSource = null
    }
    this.auditionSource = source
    source.start()
  }

  pause(): void {
    if (!this.playing || !this.context || !this.buffer) return
    this.offset = this.currentTime()
    this.releaseSource()
  }

  stop(): void {
    this.releaseSource()
    this.releaseAuditionSource()
    this.offset = 0
  }

  seek(seconds: number): void {
    const wasPlaying = this.playing
    const duration = this.buffer?.duration ?? 0
    this.releaseSource()
    this.offset = Math.max(0, Math.min(duration ? duration - 0.001 : 0, seconds))
    if (wasPlaying) void this.play()
  }

  setLoop(loop: boolean): void {
    this.loop = loop
    if (this.source) this.source.loop = loop
  }

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume))
    if (this.gain && this.context) this.gain.gain.setTargetAtTime(this.volume, this.context.currentTime, 0.01)
  }

  currentTime(): number {
    if (!this.buffer) return 0
    if (!this.playing || !this.context) return this.offset
    const elapsed = this.context.currentTime - this.startedAt
    return this.loop ? elapsed % this.buffer.duration : Math.min(elapsed, this.buffer.duration)
  }

  isPlaying(): boolean {
    return this.playing
  }

  private releaseSource(): void {
    if (this.source) {
      this.source.onended = null
      try { this.source.stop() } catch { this.source.onended = null }
      this.source.disconnect()
      this.source = null
    }
    this.playing = false
  }

  private releaseAuditionSource(): void {
    if (!this.auditionSource) return
    this.auditionSource.onended = null
    try { this.auditionSource.stop() } catch { this.auditionSource.onended = null }
    this.auditionSource.disconnect()
    this.auditionSource = null
  }
}

declare global {
  interface Window {
    webkitAudioContext: typeof AudioContext
  }
}
