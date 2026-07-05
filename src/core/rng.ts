/** Deterministic PRNG utilities. Every stochastic feature in the app is
 *  seeded so results are reproducible and "re-roll" is a first-class action. */

/** Mulberry32 — fast, high-quality-enough 32-bit PRNG. */
export function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Random 31-bit seed. */
export function randomSeed(): number {
  return (Math.random() * 2 ** 31) | 0;
}

/** Pick a uniformly random element (rnd is a [0,1) source). */
export function pick<T>(rnd: () => number, arr: readonly T[]): T {
  return arr[(rnd() * arr.length) | 0];
}

/** Uniform value in [lo, hi). */
export function range(rnd: () => number, lo: number, hi: number): number {
  return lo + rnd() * (hi - lo);
}
