/** Pure operations on the zone mask (Uint8Array, row-major G×G).
 *  The mask is the single source of truth that every generator consumes:
 *  drawing paints into it, image import rasterises into it. */

import type { Zone } from '../types';

export type MirrorMode = 'off' | 'h' | 'v' | '4';

export function createMask(G: number): Uint8Array {
  return new Uint8Array(G * G);
}

/** Nearest-neighbour rescale used when switching grid resolution. */
export function resampleMask(mask: Uint8Array, oldG: number, newG: number): Uint8Array {
  const out = new Uint8Array(newG * newG);
  for (let y = 0; y < newG; y++) {
    const oy = Math.min(oldG - 1, Math.floor((y * oldG) / newG));
    for (let x = 0; x < newG; x++) {
      const ox = Math.min(oldG - 1, Math.floor((x * oldG) / newG));
      out[y * newG + x] = mask[oy * oldG + ox];
    }
  }
  return out;
}

/** Paint a square brush stamp (with optional mirroring) at cell (x, y). */
export function stamp(
  mask: Uint8Array,
  G: number,
  x: number,
  y: number,
  brush: number,
  value: Zone,
  mirror: MirrorMode,
): void {
  const o = Math.floor(brush / 2);
  const put = (cx: number, cy: number) => {
    if (cx < 0 || cy < 0 || cx >= G || cy >= G) return;
    mask[cy * G + cx] = value;
  };
  for (let dy = 0; dy < brush; dy++) {
    for (let dx = 0; dx < brush; dx++) {
      const cx = x + dx - o;
      const cy = y + dy - o;
      put(cx, cy);
      if (mirror === 'h' || mirror === '4') put(G - 1 - cx, cy);
      if (mirror === 'v' || mirror === '4') put(cx, G - 1 - cy);
      if (mirror === '4') put(G - 1 - cx, G - 1 - cy);
    }
  }
}

/** Bresenham stroke between two cells so fast pointer moves stay solid. */
export function stampLine(
  mask: Uint8Array,
  G: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  brush: number,
  value: Zone,
  mirror: MirrorMode,
): void {
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    stamp(mask, G, x0, y0, brush, value, mirror);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

/** Fill every empty cell with zone 1 (used by "fill all"). */
export function fillEmpty(mask: Uint8Array): void {
  for (let i = 0; i < mask.length; i++) if (mask[i] === 0) mask[i] = 1;
}

export function isEmpty(mask: Uint8Array): boolean {
  for (let i = 0; i < mask.length; i++) if (mask[i] !== 0) return false;
  return true;
}

/** Count of painted cells. */
export function coverage(mask: Uint8Array): number {
  let n = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i] !== 0) n++;
  return n;
}

/** Remove isolated specks: a painted cell with fewer than `minNeighbors`
 *  painted 8-neighbours is cleared. One pass; call repeatedly if needed. */
export function despeckle(mask: Uint8Array, G: number, minNeighbors = 1): Uint8Array {
  const out = new Uint8Array(mask);
  for (let y = 0; y < G; y++) {
    for (let x = 0; x < G; x++) {
      const v = mask[y * G + x];
      if (!v) continue;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= G || ny >= G) continue;
          if (mask[ny * G + nx]) n++;
        }
      }
      if (n < minNeighbors) out[y * G + x] = 0;
    }
  }
  return out;
}

/** Render the mask into an ImageData for the drawing canvas preview. */
export function maskToImageData(
  mask: Uint8Array,
  G: number,
  zoneColors: [number, number, number][],
): ImageData {
  const img = new ImageData(G, G);
  const d = img.data;
  for (let i = 0; i < mask.length; i++) {
    const v = mask[i];
    if (!v) continue;
    const [r, g, b] = zoneColors[(v - 1) % zoneColors.length];
    const o = i * 4;
    d[o] = r;
    d[o + 1] = g;
    d[o + 2] = b;
    d[o + 3] = 255;
  }
  return img;
}
