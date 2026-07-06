/** Image import pipeline: source bitmap → greyscale field → ink mask.
 *
 *  Two extraction modes:
 *
 *  - "shape": binary threshold — for logos, line art, silhouettes.
 *  - "tone":  the processed luminance is Floyd–Steinberg dithered into the
 *             mask, so ink *density* encodes brightness. Alongside the mask
 *             a smooth tone field (darkness 0..1) and a colour field are
 *             kept, letting generators scale marks by image value and pick
 *             up the source colours — the imported image stays recognisable.
 *  - "auto":  picks tone when the image has meaningful mid-tones.
 *
 *  Background handling: images with real transparency use their alpha as
 *  the silhouette; opaque images can drop a flat background automatically
 *  (dominant border colour) so scans/screenshots don't flood the mask. */

import { despeckle } from '../mask/maskOps';

export type ImportMode = 'auto' | 'shape' | 'tone';

export interface PreprocessParams {
  mode: ImportMode;
  brightness: number; // -100..100
  contrast: number; // -100..100
  blur: number; // 0..4 box-blur radius (cells)
  edgeDetect: boolean; // Sobel magnitude instead of luminance
  threshold: number; // 0..255 cut point (shape mode)
  invert: boolean;
  autoBackground: boolean; // drop flat border-colour background
  denoise: number; // 0..3 despeckle passes (shape mode)
}

export const DEFAULT_PREPROCESS: PreprocessParams = {
  mode: 'auto',
  brightness: 0,
  contrast: 0,
  blur: 0,
  edgeDetect: false,
  threshold: 140,
  invert: false,
  autoBackground: true,
  denoise: 1,
};

export interface ImportedImage {
  bitmap: ImageBitmap;
  name: string;
  width: number;
  height: number;
}

export interface ExtractResult {
  mask: Uint8Array;
  /** Ink darkness 0..1 per cell (tone mode only). */
  tone: Float32Array | null;
  /** RGB triplets per cell (tone mode only). */
  colors: Uint8Array | null;
  /** Which mode actually ran (resolves 'auto'). */
  resolvedMode: 'shape' | 'tone';
}

/** Decode a File (PNG/JPG/SVG) into an ImageBitmap. SVG files are given an
 *  explicit raster size so vector art imports crisply. */
export async function decodeImageFile(file: File): Promise<ImportedImage> {
  const isSvg = file.type === 'image/svg+xml' || /\.svg$/i.test(file.name);
  if (isSvg) {
    const text = await file.text();
    const url = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' }));
    try {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Could not decode SVG'));
        img.src = url;
      });
      const R = 1024;
      const cv = document.createElement('canvas');
      const ar = (img.width || 1) / (img.height || 1);
      cv.width = ar >= 1 ? R : Math.max(1, Math.round(R * ar));
      cv.height = ar >= 1 ? Math.max(1, Math.round(R / ar)) : R;
      const cx = cv.getContext('2d')!;
      cx.drawImage(img, 0, 0, cv.width, cv.height);
      const bitmap = await createImageBitmap(cv);
      return { bitmap, name: file.name, width: bitmap.width, height: bitmap.height };
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  const bitmap = await createImageBitmap(file);
  return { bitmap, name: file.name, width: bitmap.width, height: bitmap.height };
}

/** Fit-draw the bitmap centred onto a GW×GH grid and return its RGBA data. */
function rasterize(bitmap: ImageBitmap, GW: number, GH: number): ImageData {
  const cv = document.createElement('canvas');
  cv.width = GW;
  cv.height = GH;
  const cx = cv.getContext('2d', { willReadFrequently: true })!;
  const sc = Math.min(GW / bitmap.width, GH / bitmap.height);
  const w = bitmap.width * sc;
  const h = bitmap.height * sc;
  cx.imageSmoothingQuality = 'high';
  cx.drawImage(bitmap, (GW - w) / 2, (GH - h) / 2, w, h);
  return cx.getImageData(0, 0, GW, GH);
}

/** Does the drawn region contain meaningful transparency? */
function hasAlpha(data: Uint8ClampedArray): boolean {
  for (let i = 3; i < data.length; i += 4) if (data[i] > 10 && data[i] < 245) return true;
  let sawOpaque = false;
  let sawClear = false;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] >= 245) sawOpaque = true;
    else if (data[i] <= 10) sawClear = true;
    if (sawOpaque && sawClear) return true;
  }
  return false;
}

/** Estimate the dominant border colour (background candidate). */
function borderColor(img: ImageData): [number, number, number] {
  const { width: W, height: H, data } = img;
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  const add = (x: number, y: number) => {
    const o = (y * W + x) * 4;
    if (data[o + 3] < 128) return;
    r += data[o];
    g += data[o + 1];
    b += data[o + 2];
    n++;
  };
  for (let x = 0; x < W; x++) {
    add(x, 0);
    add(x, H - 1);
  }
  for (let y = 1; y < H - 1; y++) {
    add(0, y);
    add(W - 1, y);
  }
  if (!n) return [255, 255, 255];
  return [r / n, g / n, b / n];
}

function boxBlur(src: Float32Array, W: number, H: number, radius: number): Float32Array {
  if (radius <= 0) return src;
  const tmp = new Float32Array(W * H);
  const out = new Float32Array(W * H);
  const win = radius * 2 + 1;
  for (let y = 0; y < H; y++) {
    let acc = 0;
    for (let x = -radius; x <= radius; x++) acc += src[y * W + Math.max(0, Math.min(W - 1, x))];
    for (let x = 0; x < W; x++) {
      tmp[y * W + x] = acc / win;
      const drop = Math.max(0, Math.min(W - 1, x - radius));
      const addI = Math.max(0, Math.min(W - 1, x + radius + 1));
      acc += src[y * W + addI] - src[y * W + drop];
    }
  }
  for (let x = 0; x < W; x++) {
    let acc = 0;
    for (let y = -radius; y <= radius; y++) acc += tmp[Math.max(0, Math.min(H - 1, y)) * W + x];
    for (let y = 0; y < H; y++) {
      out[y * W + x] = acc / win;
      const drop = Math.max(0, Math.min(H - 1, y - radius));
      const addI = Math.max(0, Math.min(H - 1, y + radius + 1));
      acc += tmp[addI * W + x] - tmp[drop * W + x];
    }
  }
  return out;
}

function sobel(src: Float32Array, W: number, H: number): Float32Array {
  const out = new Float32Array(W * H);
  const at = (x: number, y: number) =>
    src[Math.max(0, Math.min(H - 1, y)) * W + Math.max(0, Math.min(W - 1, x))];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const gx =
        -at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1) +
        at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1);
      const gy =
        -at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1) +
        at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1);
      out[y * W + x] = Math.min(255, Math.hypot(gx, gy));
    }
  }
  return out;
}

/** Serpentine Floyd–Steinberg dither of a darkness field (0..1) → binary. */
function ditherFS(darkness: Float32Array, W: number, H: number): Uint8Array {
  const buf = Float32Array.from(darkness);
  const out = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    const ltr = (y & 1) === 0;
    for (let i = 0; i < W; i++) {
      const x = ltr ? i : W - 1 - i;
      const idx = y * W + x;
      const old = buf[idx];
      const nv = old >= 0.5 ? 1 : 0;
      out[idx] = nv;
      const err = old - nv;
      const push = (dx: number, dy: number, wgt: number) => {
        const nx = x + (ltr ? dx : -dx);
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) return;
        buf[ny * W + nx] += err * wgt;
      };
      push(1, 0, 7 / 16);
      push(-1, 1, 3 / 16);
      push(0, 1, 5 / 16);
      push(1, 1, 1 / 16);
    }
  }
  return out;
}

/** Full pipeline: imported bitmap → mask (+ tone/colour fields in tone mode). */
export function extractFromImage(
  image: ImportedImage,
  GW: number,
  GH: number,
  p: PreprocessParams,
): ExtractResult {
  const img = rasterize(image.bitmap, GW, GH);
  const d = img.data;
  const N = GW * GH;
  const alphaMode = hasAlpha(d);
  const [br, bg2, bb] = alphaMode ? [0, 0, 0] : borderColor(img);

  // luminance + validity field
  let lum: Float32Array = new Float32Array(N);
  const valid = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const o = i * 4;
    const a = d[o + 3];
    lum[i] = 0.299 * d[o] + 0.587 * d[o + 1] + 0.114 * d[o + 2];
    if (alphaMode) {
      valid[i] = a > 128 ? 1 : 0;
    } else {
      valid[i] = 1;
      if (p.autoBackground) {
        const dist = Math.hypot(d[o] - br, d[o + 1] - bg2, d[o + 2] - bb);
        if (dist < 28) valid[i] = 0;
      }
    }
  }

  // resolve auto mode: tonal when a meaningful share of valid cells are
  // mid-tones (neither near-black nor near-white)
  let resolvedMode: 'shape' | 'tone' = p.mode === 'tone' ? 'tone' : 'shape';
  if (p.mode === 'auto') {
    let mid = 0;
    let total = 0;
    for (let i = 0; i < N; i++) {
      if (!valid[i]) continue;
      total++;
      if (lum[i] > 55 && lum[i] < 205) mid++;
    }
    resolvedMode = total > 0 && mid / total > 0.18 ? 'tone' : 'shape';
  }

  // brightness / contrast
  const bAdd = (p.brightness / 100) * 128;
  const cFac = Math.tan(((p.contrast / 100) * 0.99 * Math.PI) / 4 + Math.PI / 4);
  if (p.brightness !== 0 || p.contrast !== 0) {
    for (let i = 0; i < N; i++) lum[i] = (lum[i] - 128 + bAdd) * cFac + 128;
  }

  if (p.blur > 0) lum = boxBlur(lum, GW, GH, Math.round(p.blur));
  if (p.edgeDetect) {
    const e = sobel(lum, GW, GH);
    for (let i = 0; i < N; i++) lum[i] = 255 - e[i];
  }

  if (resolvedMode === 'tone') {
    // darkness field (1 = full ink), clamped, invalid cells transparent
    const tone = new Float32Array(N);
    const colors = new Uint8Array(N * 3);
    for (let i = 0; i < N; i++) {
      let t = 1 - Math.max(0, Math.min(255, lum[i])) / 255;
      if (p.invert) t = 1 - t;
      tone[i] = valid[i] ? t : 0;
      colors[i * 3] = d[i * 4];
      colors[i * 3 + 1] = d[i * 4 + 1];
      colors[i * 3 + 2] = d[i * 4 + 2];
    }
    const mask = ditherFS(tone, GW, GH);
    for (let i = 0; i < N; i++) if (!valid[i]) mask[i] = 0;
    return { mask, tone, colors, resolvedMode };
  }

  // shape mode: alpha silhouettes ink the whole silhouette
  let mask: Uint8Array = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (!valid[i]) continue;
    let on = alphaMode ? true : lum[i] < p.threshold;
    if (p.invert && !alphaMode) on = !on;
    if (on) mask[i] = 1;
  }
  for (let k = 0; k < p.denoise; k++) mask = despeckle(mask, GW, GH, 2);
  return { mask, tone: null, colors: null, resolvedMode };
}
