/** Point-placement engines for mark generators.
 *
 *  The original Mark Sketcher scattered points with unbounded jitter and a
 *  "throw extra random points" pass, which produced clumps and overlaps.
 *  This module replaces that with three principled layouts:
 *
 *   - grid    : square lattice, jitter clamped so marks can never collide
 *   - hex     : offset (triangular) lattice, densest regular packing
 *   - poisson : Bridson blue-noise sampling — organic, evenly spaced,
 *               guaranteed minimum distance between any two points
 *
 *  All layouts return points tagged with the mask zone under them, and a
 *  `spacing` value equal to the minimum centre distance actually enforced,
 *  which mark renderers use to derive collision-free mark sizes. */

export interface SamplePoint {
  x: number;
  y: number;
  zone: number;
}

export interface SampleField {
  points: SamplePoint[];
  /** Guaranteed minimum distance between point centres (SVG units). */
  minDist: number;
}

export type LayoutId = 'poisson' | 'grid' | 'hex';

/** Look up the zone at an SVG-space coordinate; 0 when outside the mask. */
export function zoneAt(
  mask: Uint8Array,
  G: number,
  S: number,
  x: number,
  y: number,
): number {
  const cx = (x / S) | 0;
  const cy = (y / S) | 0;
  if (cx < 0 || cy < 0 || cx >= G || cy >= G) return 0;
  return mask[cy * G + cx];
}

interface LayoutArgs {
  mask: Uint8Array;
  G: number;
  S: number;
  size: number;
  /** Desired centre-to-centre pitch in SVG units. */
  pitch: number;
  /** 0..1: fraction of the collision-free slack used for jitter. */
  jitter: number;
  rnd: () => number;
}

/** Square lattice. Jitter is bounded to (pitch - guaranteed)/2 per axis so
 *  the reported minDist stays honest. */
function gridLayout(a: LayoutArgs): SampleField {
  const { mask, G, S, size, pitch, jitter, rnd } = a;
  const points: SamplePoint[] = [];
  // With jitter j (per-axis, ±j), worst-case centre distance is pitch - 2j.
  const j = jitter * pitch * 0.35;
  for (let cy = pitch / 2; cy < size; cy += pitch) {
    for (let cx = pitch / 2; cx < size; cx += pitch) {
      const x = cx + (rnd() - 0.5) * 2 * j;
      const y = cy + (rnd() - 0.5) * 2 * j;
      const zone = zoneAt(mask, G, S, x, y);
      if (zone) points.push({ x, y, zone });
    }
  }
  return { points, minDist: Math.max(1, pitch - 2 * j * Math.SQRT2) };
}

/** Offset hex lattice: row height pitch·√3/2, odd rows shifted half a pitch. */
function hexLayout(a: LayoutArgs): SampleField {
  const { mask, G, S, size, pitch, jitter, rnd } = a;
  const points: SamplePoint[] = [];
  const rowH = pitch * 0.8660254;
  const j = jitter * pitch * 0.3;
  let row = 0;
  for (let cy = pitch / 2; cy < size; cy += rowH, row++) {
    const off = row & 1 ? pitch / 2 : 0;
    for (let cx = pitch / 2; cx < size + pitch / 2; cx += pitch) {
      const x = cx + off + (rnd() - 0.5) * 2 * j;
      const y = cy + (rnd() - 0.5) * 2 * j;
      if (x >= size) continue;
      const zone = zoneAt(mask, G, S, x, y);
      if (zone) points.push({ x, y, zone });
    }
  }
  return { points, minDist: Math.max(1, pitch - 2 * j * Math.SQRT2) };
}

/** Bridson's Poisson-disc sampling constrained to painted mask cells.
 *  Produces blue-noise distributions: organic randomness with a hard
 *  guarantee that no two points are closer than `pitch`. */
function poissonLayout(a: LayoutArgs): SampleField {
  const { mask, G, S, size, pitch, rnd } = a;
  const r = Math.max(2, pitch);
  const cell = r / Math.SQRT2;
  const gw = Math.ceil(size / cell);
  const grid = new Int32Array(gw * gw).fill(-1);
  const points: SamplePoint[] = [];
  const active: number[] = [];
  const K = 24; // candidate attempts per active point

  const gi = (x: number, y: number) =>
    Math.min(gw - 1, (x / cell) | 0) + Math.min(gw - 1, (y / cell) | 0) * gw;

  const farEnough = (x: number, y: number): boolean => {
    const gx = Math.min(gw - 1, (x / cell) | 0);
    const gy = Math.min(gw - 1, (y / cell) | 0);
    for (let oy = -2; oy <= 2; oy++) {
      for (let ox = -2; ox <= 2; ox++) {
        const nx = gx + ox;
        const ny = gy + oy;
        if (nx < 0 || ny < 0 || nx >= gw || ny >= gw) continue;
        const idx = grid[ny * gw + nx];
        if (idx < 0) continue;
        const p = points[idx];
        if ((p.x - x) ** 2 + (p.y - y) ** 2 < r * r) return false;
      }
    }
    return true;
  };

  const tryAdd = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= size || y >= size) return false;
    const zone = zoneAt(mask, G, S, x, y);
    if (!zone) return false;
    if (!farEnough(x, y)) return false;
    points.push({ x, y, zone });
    grid[gi(x, y)] = points.length - 1;
    active.push(points.length - 1);
    return true;
  };

  // Seed each connected region: try random painted cells until one sticks,
  // then keep the front growing. Multiple seeds cover disjoint islands.
  const painted: number[] = [];
  for (let i = 0; i < mask.length; i++) if (mask[i]) painted.push(i);
  if (!painted.length) return { points, minDist: r };

  let seedTries = 0;
  const maxSeedTries = Math.min(4000, painted.length * 4);

  const seedOne = (): boolean => {
    while (seedTries < maxSeedTries) {
      seedTries++;
      const ci = painted[(rnd() * painted.length) | 0];
      const x = (ci % G) * S + rnd() * S;
      const y = ((ci / G) | 0) * S + rnd() * S;
      if (tryAdd(x, y)) return true;
    }
    return false;
  };

  if (!seedOne()) return { points, minDist: r };

  for (;;) {
    while (active.length) {
      const ai = (rnd() * active.length) | 0;
      const p = points[active[ai]];
      let placed = false;
      for (let k = 0; k < K; k++) {
        const ang = rnd() * Math.PI * 2;
        const rad = r * (1 + rnd());
        if (tryAdd(p.x + Math.cos(ang) * rad, p.y + Math.sin(ang) * rad)) {
          placed = true;
          break;
        }
      }
      if (!placed) {
        active[ai] = active[active.length - 1];
        active.pop();
      }
    }
    // reseed for unreached islands
    if (!seedOne()) break;
  }

  return { points, minDist: r };
}

export function sampleLayout(layout: LayoutId, args: LayoutArgs): SampleField {
  switch (layout) {
    case 'grid':
      return gridLayout(args);
    case 'hex':
      return hexLayout(args);
    case 'poisson':
      return poissonLayout(args);
  }
}
