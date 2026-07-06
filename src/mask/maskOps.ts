/** Pure operations on the ink mask (Uint8Array, row-major GW×GH).
 *  The mask is the single source of truth that every generator consumes:
 *  drawing paints into it, image import rasterises into it. */

import type { Zone } from '../types';

export type MirrorMode = 'off' | 'h' | 'v' | '4';

export function createMask(GW: number, GH: number): Uint8Array {
  return new Uint8Array(GW * GH);
}

/** Nearest-neighbour rescale used when the canvas format changes. */
export function resampleMask(
  mask: Uint8Array,
  w0: number,
  h0: number,
  w1: number,
  h1: number,
): Uint8Array {
  const out = new Uint8Array(w1 * h1);
  for (let y = 0; y < h1; y++) {
    const oy = Math.min(h0 - 1, Math.floor((y * h0) / h1));
    for (let x = 0; x < w1; x++) {
      const ox = Math.min(w0 - 1, Math.floor((x * w0) / w1));
      out[y * w1 + x] = mask[oy * w0 + ox];
    }
  }
  return out;
}

/** Paint a square brush stamp (with optional mirroring) at cell (x, y). */
export function stamp(
  mask: Uint8Array,
  GW: number,
  GH: number,
  x: number,
  y: number,
  brush: number,
  value: Zone,
  mirror: MirrorMode,
): void {
  const o = Math.floor(brush / 2);
  const put = (cx: number, cy: number) => {
    if (cx < 0 || cy < 0 || cx >= GW || cy >= GH) return;
    mask[cy * GW + cx] = value;
  };
  for (let dy = 0; dy < brush; dy++) {
    for (let dx = 0; dx < brush; dx++) {
      const cx = x + dx - o;
      const cy = y + dy - o;
      put(cx, cy);
      if (mirror === 'h' || mirror === '4') put(GW - 1 - cx, cy);
      if (mirror === 'v' || mirror === '4') put(cx, GH - 1 - cy);
      if (mirror === '4') put(GW - 1 - cx, GH - 1 - cy);
    }
  }
}

/** Bresenham stroke between two cells so fast pointer moves stay solid. */
export function stampLine(
  mask: Uint8Array,
  GW: number,
  GH: number,
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
    stamp(mask, GW, GH, x0, y0, brush, value, mirror);
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

/** Remove isolated specks: a painted cell with fewer than `minNeighbors`
 *  painted 8-neighbours is cleared. One pass; call repeatedly if needed. */
export function despeckle(
  mask: Uint8Array,
  GW: number,
  GH: number,
  minNeighbors = 1,
): Uint8Array {
  const out = new Uint8Array(mask);
  for (let y = 0; y < GH; y++) {
    for (let x = 0; x < GW; x++) {
      const v = mask[y * GW + x];
      if (!v) continue;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
          if (mask[ny * GW + nx]) n++;
        }
      }
      if (n < minNeighbors) out[y * GW + x] = 0;
    }
  }
  return out;
}

/** Render the mask into an ImageData for the drawing canvas preview.
 *  When a colour field exists, cells take their sampled image colour. */
export function maskToImageData(
  mask: Uint8Array,
  GW: number,
  GH: number,
  ink: [number, number, number],
  colors: Uint8Array | null = null,
): ImageData {
  const img = new ImageData(GW, GH);
  const d = img.data;
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    const o = i * 4;
    if (colors) {
      d[o] = colors[i * 3];
      d[o + 1] = colors[i * 3 + 1];
      d[o + 2] = colors[i * 3 + 2];
    } else {
      d[o] = ink[0];
      d[o + 1] = ink[1];
      d[o + 2] = ink[2];
    }
    d[o + 3] = 255;
  }
  return img;
}
