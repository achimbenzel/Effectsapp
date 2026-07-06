/** Point-placement engines for mark generators.
 *
 *   - grid    : square lattice, jitter clamped so marks can never collide
 *   - hex     : offset (triangular) lattice, densest regular packing
 *   - poisson : Bridson blue-noise sampling — organic, evenly spaced,
 *               guaranteed minimum distance between any two points
 *
 *  All layouts return points tagged with the mask value under them, and a
 *  `minDist` equal to the minimum centre distance actually enforced, which
 *  mark renderers use to derive collision-free mark sizes. */

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

/** Look up the mask value at an SVG-space coordinate; 0 when outside. */
export function zoneAt(
  mask: Uint8Array,
  GW: number,
  GH: number,
  S: number,
  x: number,
  y: number,
): number {
  const cx = (x / S) | 0;
  const cy = (y / S) | 0;
  if (cx < 0 || cy < 0 || cx >= GW || cy >= GH) return 0;
  return mask[cy * GW + cx];
}

interface LayoutArgs {
  mask: Uint8Array;
  GW: number;
  GH: number;
  S: number;
  W: number;
  H: number;
  /** Desired centre-to-centre pitch in SVG units. */
  pitch: number;
  /** 0..1: fraction of the collision-free slack used for jitter. */
  jitter: number;
  rnd: () => number;
}

/** Square lattice. Jitter is bounded so the reported minDist stays honest. */
function gridLayout(a: LayoutArgs): SampleField {
  const { mask, GW, GH, S, W, H, pitch, jitter, rnd } = a;
  const points: SamplePoint[] = [];
  const j = jitter * pitch * 0.35;
  for (let cy = pitch / 2; cy < H; cy += pitch) {
    for (let cx = pitch / 2; cx < W; cx += pitch) {
      const x = cx + (rnd() - 0.5) * 2 * j;
      const y = cy + (rnd() - 0.5) * 2 * j;
      const zone = zoneAt(mask, GW, GH, S, x, y);
      if (zone) points.push({ x, y, zone });
    }
  }
  return { points, minDist: Math.max(1, pitch - 2 * j * Math.SQRT2) };
}

/** Offset hex lattice: row height pitch·√3/2, odd rows shifted half a pitch. */
function hexLayout(a: LayoutArgs): SampleField {
  const { mask, GW, GH, S, W, H, pitch, jitter, rnd } = a;
  const points: SamplePoint[] = [];
  const rowH = pitch * 0.8660254;
  const j = jitter * pitch * 0.3;
  let row = 0;
  for (let cy = pitch / 2; cy < H; cy += rowH, row++) {
    const off = row & 1 ? pitch / 2 : 0;
    for (let cx = pitch / 2; cx < W + pitch / 2; cx += pitch) {
      const x = cx + off + (rnd() - 0.5) * 2 * j;
      const y = cy + (rnd() - 0.5) * 2 * j;
      if (x >= W) continue;
      const zone = zoneAt(mask, GW, GH, S, x, y);
      if (zone) points.push({ x, y, zone });
    }
  }
  return { points, minDist: Math.max(1, pitch - 2 * j * Math.SQRT2) };
}

/** Bridson's Poisson-disc sampling constrained to painted mask cells. */
function poissonLayout(a: LayoutArgs): SampleField {
  const { mask, GW, GH, S, W, H, pitch, rnd } = a;
  const r = Math.max(2, pitch);
  const cell = r / Math.SQRT2;
  const gw = Math.ceil(W / cell);
  const gh = Math.ceil(H / cell);
  const grid = new Int32Array(gw * gh).fill(-1);
  const points: SamplePoint[] = [];
  const active: number[] = [];
  const K = 24;

  const gi = (x: number, y: number) =>
    Math.min(gw - 1, (x / cell) | 0) + Math.min(gh - 1, (y / cell) | 0) * gw;

  const farEnough = (x: number, y: number): boolean => {
    const gx = Math.min(gw - 1, (x / cell) | 0);
    const gy = Math.min(gh - 1, (y / cell) | 0);
    for (let oy = -2; oy <= 2; oy++) {
      for (let ox = -2; ox <= 2; ox++) {
        const nx = gx + ox;
        const ny = gy + oy;
        if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
        const idx = grid[ny * gw + nx];
        if (idx < 0) continue;
        const p = points[idx];
        if ((p.x - x) ** 2 + (p.y - y) ** 2 < r * r) return false;
      }
    }
    return true;
  };

  const tryAdd = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= W || y >= H) return false;
    const zone = zoneAt(mask, GW, GH, S, x, y);
    if (!zone) return false;
    if (!farEnough(x, y)) return false;
    points.push({ x, y, zone });
    grid[gi(x, y)] = points.length - 1;
    active.push(points.length - 1);
    return true;
  };

  const painted: number[] = [];
  for (let i = 0; i < mask.length; i++) if (mask[i]) painted.push(i);
  if (!painted.length) return { points, minDist: r };

  let seedTries = 0;
  const maxSeedTries = Math.min(6000, painted.length * 4);

  const seedOne = (): boolean => {
    while (seedTries < maxSeedTries) {
      seedTries++;
      const ci = painted[(rnd() * painted.length) | 0];
      const x = (ci % GW) * S + rnd() * S;
      const y = ((ci / GW) | 0) * S + rnd() * S;
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
