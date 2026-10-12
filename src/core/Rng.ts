/** Deterministic seeded PRNG (mulberry32) with helpers. */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0 || 0x9e3779b9;
  }

  next(): number {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  int(min: number, maxInclusive: number): number {
    return Math.floor(this.range(min, maxInclusive + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  sign(): number {
    return this.next() < 0.5 ? -1 : 1;
  }

  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  weighted<T>(items: readonly { item: T; w: number }[]): T {
    let total = 0;
    for (const it of items) total += it.w;
    let r = this.next() * total;
    for (const it of items) {
      r -= it.w;
      if (r <= 0) return it.item;
    }
    return items[items.length - 1].item;
  }

  static hash(...values: number[]): number {
    let h = 2166136261 >>> 0;
    for (const v of values) {
      h ^= v | 0;
      h = Math.imul(h, 16777619);
      h ^= h >>> 13;
      h = Math.imul(h, 0x5bd1e995);
      h ^= h >>> 15;
    }
    return h >>> 0;
  }
}
