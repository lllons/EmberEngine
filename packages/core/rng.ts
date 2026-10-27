/**
 * @ember/core/rng — deterministic pseudo-random numbers.
 *
 * Owner: this file owns all randomness in the engine. Simulations never call
 * `Math.random()`; every stochastic system takes a `Rng` so runs are reproducible.
 */

export interface Rng {
  /** Raw 32-bit unsigned value. */
  next(): number;
  /** Float in [min, max). */
  float(min?: number, max?: number): number;
  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number;
  /** True with probability `p` (clamped to [0, 1]). */
  chance(p: number): boolean;
  /** Uniform pick; returns `undefined` for an empty array. */
  pick<T>(items: readonly T[]): T | undefined;
  /** New array, Fisher-Yates shuffled. */
  shuffle<T>(items: readonly T[]): T[];
  /** Current internal state, for save/replay. */
  state(): number;
  /** Forks a child generator; advancing the child never affects the parent. */
  fork(): Rng;
}

/** mulberry32: small, fast, well-distributed, and identical across hosts. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createRng(seed: number | string = 1): Rng {
  let state = typeof seed === "string" ? hashSeed(seed) : seed >>> 0;
  const step = mulberry32(state);

  const rng: Rng = {
    next(): number {
      state = (state + 1) >>> 0;
      return Math.floor(step() * 4294967296) >>> 0;
    },
    float(min = 0, max = 1): number {
      return min + step() * (max - min);
    },
    int(min: number, max: number): number {
      if (max < min) [min, max] = [max, min];
      return min + Math.floor(step() * (max - min + 1));
    },
    chance(p: number): boolean {
      if (p <= 0) return false;
      if (p >= 1) return true;
      return step() < p;
    },
    pick<T>(items: readonly T[]): T | undefined {
      if (items.length === 0) return undefined;
      return items[Math.floor(step() * items.length) % items.length];
    },
    shuffle<T>(items: readonly T[]): T[] {
      const copy = [...items];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(step() * (i + 1));
        const tmp = copy[i];
        copy[i] = copy[j];
        copy[j] = tmp;
      }
      return copy;
    },
    state(): number {
      return state;
    },
    fork(): Rng {
      return createRng((state * 2654435761) >>> 0);
    },
  };
  return rng;
}

/** FNV-1a over the string's UTF-16 code units — stable across hosts and versions. */
export function hashSeed(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}
