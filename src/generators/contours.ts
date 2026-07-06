/** Contour generator — topographic iso-lines of the shape.
 *
 *  A chamfer distance field of the ink mask is contoured with marching
 *  squares at evenly spaced levels, producing concentric vector rings that
 *  read like elevation maps / machined engravings. Chaikin smoothing turns
 *  the cell-aligned polylines into flowing curves while staying vector. */

import type { GeneratorDef, GeneratorContext, ParamValues, SvgDoc } from '../types';
import { distanceField } from '../core/fields';

type Pt = [number, number];

/** Marching squares at threshold t over a GW×GH scalar field (cell centres).
 *  Returns line segments in cell coordinates. */
function marchingSquares(field: Float32Array, GW: number, GH: number, t: number): [Pt, Pt][] {
  const segs: [Pt, Pt][] = [];
  const v = (x: number, y: number) =>
    x < 0 || y < 0 || x >= GW || y >= GH ? 0 : field[y * GW + x];

  // interpolate the crossing point between two corners
  const lerp = (x0: number, y0: number, v0: number, x1: number, y1: number, v1: number): Pt => {
    const d = v1 - v0;
    const f = Math.abs(d) < 1e-9 ? 0.5 : (t - v0) / d;
    return [x0 + (x1 - x0) * f, y0 + (y1 - y0) * f];
  };

  for (let y = -1; y < GH; y++) {
    for (let x = -1; x < GW; x++) {
      const tl = v(x, y);
      const tr = v(x + 1, y);
      const br = v(x + 1, y + 1);
      const bl = v(x, y + 1);
      let idx = 0;
      if (tl >= t) idx |= 8;
      if (tr >= t) idx |= 4;
      if (br >= t) idx |= 2;
      if (bl >= t) idx |= 1;
      if (idx === 0 || idx === 15) continue;

      const top = () => lerp(x, y, tl, x + 1, y, tr);
      const right = () => lerp(x + 1, y, tr, x + 1, y + 1, br);
      const bottom = () => lerp(x, y + 1, bl, x + 1, y + 1, br);
      const left = () => lerp(x, y, tl, x, y + 1, bl);

      switch (idx) {
        case 1: segs.push([left(), bottom()]); break;
        case 2: segs.push([bottom(), right()]); break;
        case 3: segs.push([left(), right()]); break;
        case 4: segs.push([top(), right()]); break;
        case 5: segs.push([left(), top()]); segs.push([bottom(), right()]); break;
        case 6: segs.push([top(), bottom()]); break;
        case 7: segs.push([left(), top()]); break;
        case 8: segs.push([top(), left()]); break;
        case 9: segs.push([top(), bottom()]); break;
        case 10: segs.push([top(), right()]); segs.push([left(), bottom()]); break;
        case 11: segs.push([top(), right()]); break;
        case 12: segs.push([right(), left()]); break;
        case 13: segs.push([right(), bottom()]); break;
        case 14: segs.push([bottom(), left()]); break;
      }
    }
  }
  return segs;
}

/** Join loose segments into polylines by matching endpoints. */
function stitch(segs: [Pt, Pt][]): Pt[][] {
  const key = (p: Pt) => `${Math.round(p[0] * 64)},${Math.round(p[1] * 64)}`;
  const adj = new Map<string, number[]>();
  segs.forEach(([a, b], i) => {
    for (const p of [a, b]) {
      const k = key(p);
      const list = adj.get(k);
      if (list) list.push(i);
      else adj.set(k, [i]);
    }
  });
  const used = new Uint8Array(segs.length);
  const polys: Pt[][] = [];

  const walk = (start: number): Pt[] => {
    const [a, b] = segs[start];
    used[start] = 1;
    const line: Pt[] = [a, b];
    // extend forward from tail, then backward from head
    for (const dir of [1, -1] as const) {
      for (;;) {
        const end = dir === 1 ? line[line.length - 1] : line[0];
        const nexts = (adj.get(key(end)) ?? []).filter((i) => !used[i]);
        if (!nexts.length) break;
        const i = nexts[0];
        used[i] = 1;
        const [p, q] = segs[i];
        const np = key(p) === key(end) ? q : p;
        if (dir === 1) line.push(np);
        else line.unshift(np);
      }
    }
    return line;
  };

  for (let i = 0; i < segs.length; i++) {
    if (!used[i]) polys.push(walk(i));
  }
  return polys;
}

/** Chaikin corner cutting; closed polylines wrap around. */
function chaikin(pts: Pt[], iterations: number, closed: boolean): Pt[] {
  let out = pts;
  for (let k = 0; k < iterations; k++) {
    const next: Pt[] = [];
    const n = out.length;
    if (n < 3) return out;
    const last = closed ? n : n - 1;
    if (!closed) next.push(out[0]);
    for (let i = 0; i < last; i++) {
      const a = out[i];
      const b = out[(i + 1) % n];
      next.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
      next.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    if (!closed) next.push(out[n - 1]);
    out = next;
  }
  return out;
}

function generate(ctx: GeneratorContext, p: ParamValues): SvgDoc {
  const { mask, GW, GH, S, W, H, palette } = ctx;
  const f = (n: number) => (Math.round(n * 100) / 100).toString();

  const dist = distanceField(mask, GW, GH);
  let maxDist = 0;
  for (let i = 0; i < dist.length; i++) if (dist[i] > maxDist) maxDist = dist[i];
  if (maxDist <= 0) return { width: W, height: H, body: '' };

  const stepCells = Math.max(0.75, (p.spacing as number) / S);
  const smoothing = Math.round(p.smoothing as number);
  const strokeW = p.strokeWidth as number;
  const outlineOnly = p.outlineOnly as boolean;

  const levels: number[] = [];
  for (let t = 0.5; t <= maxDist; t += stepCells) {
    levels.push(t);
    if (outlineOnly) break;
  }

  let body = '';
  levels.forEach((t, li) => {
    const polys = stitch(marchingSquares(dist, GW, GH, t));
    let d = '';
    for (const poly of polys) {
      if (poly.length < 3) continue;
      const closed =
        Math.abs(poly[0][0] - poly[poly.length - 1][0]) < 0.02 &&
        Math.abs(poly[0][1] - poly[poly.length - 1][1]) < 0.02;
      const pts = chaikin(closed ? poly.slice(0, -1) : poly, smoothing, closed);
      d += `M${f((pts[0][0] + 0.5) * S)} ${f((pts[0][1] + 0.5) * S)}`;
      for (let i = 1; i < pts.length; i++)
        d += `L${f((pts[i][0] + 0.5) * S)} ${f((pts[i][1] + 0.5) * S)}`;
      if (closed) d += 'Z';
    }
    if (!d) return;
    const isOuter = li === 0;
    const color = isOuter ? palette.secondary : palette.primary;
    const w = isOuter ? strokeW * 1.35 : strokeW;
    body += `<path class="trace" d="${d}" fill="none" stroke="${color}" stroke-width="${f(w)}" stroke-linejoin="round" stroke-linecap="round"/>`;
  });

  return { width: W, height: H, body };
}

export const contoursGenerator: GeneratorDef = {
  id: 'contours',
  name: 'Contours',
  tagline: 'Topographic iso-lines',
  defaults: {
    spacing: 18,
    smoothing: 3,
    strokeWidth: 2.4,
    outlineOnly: false,
  },
  controls: [
    { kind: 'slider', key: 'spacing', label: 'Line spacing', min: 6, max: 64 },
    { kind: 'slider', key: 'smoothing', label: 'Smoothing', min: 0, max: 4 },
    { kind: 'slider', key: 'strokeWidth', label: 'Stroke width', min: 0.6, max: 8, step: 0.2 },
    { kind: 'toggle', key: 'outlineOnly', label: 'Outline only' },
  ],
  generate,
};
