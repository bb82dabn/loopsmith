export function hashString(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export class SeededRandom {
  private state: number

  constructor(seed: string) {
    this.state = hashString(seed) || 0x9e3779b9
  }

  next(): number {
    let value = (this.state += 0x6d2b79f5)
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }

  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)]
  }

  chance(probability: number): boolean {
    return this.next() < probability
  }

  shuffle<T>(items: readonly T[]): T[] {
    const result = [...items]
    for (let index = result.length - 1; index > 0; index -= 1) {
      const swapIndex = this.int(0, index)
      ;[result[index], result[swapIndex]] = [result[swapIndex], result[index]]
    }
    return result
  }
}
