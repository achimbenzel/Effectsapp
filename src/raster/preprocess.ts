/** Image import pipeline: source bitmap → greyscale field → zone mask.
 *
 *  The pipeline works on a float luminance buffer at mask resolution so the
 *  individual stages stay cheap and composable:
 *
 *    fit → [brightness/contrast] → [blur] → [edge detect] →
 *    threshold (+invert) → [despeckle] → mask
 *
 *  Background handling: images with real transparency use their alpha as
 *  the silhouette; opaque images can drop a flat background automatically
 *  (dominant border colour) so scans/screenshots don't flood the mask. */

import { despeckle } from '../mask/maskOps';

export interface PreprocessParams {
  brightness: number; // -100..100
  contrast: number; // -100..100
  blur: number; // 0..4 box-blur radius (cells)
  edgeDetect: boolean; // Sobel magnitude instead of luminance
  threshold: number; // 0..255 cut point
  invert: boolean;
  autoBackground: boolean; // drop flat border-colour background
  denoise: number; // 0..3 despeckle passes
}

export const DEFAULT_PREPROCESS: PreprocessParams = {
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
      // Rasterise at a generous fixed size; the mask grid resamples anyway.
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

/** Fit-draw the bitmap centred onto a G×G grid and return its RGBA data. */
function rasterize(bitmap: ImageBitmap, G: number): ImageData {
  const cv = document.createElement('canvas');
  cv.width = G;
  cv.height = G;
  const cx = cv.getContext('2d', { willReadFrequently: true })!;
  const sc = Math.min(G / bitmap.width, G / bitmap.height);
  const w = bitmap.width * sc;
  const h = bitmap.height * sc;
  cx.imageSmoothingQuality = 'high';
  cx.drawImage(bitmap, (G - w) / 2, (G - h) / 2, w, h);
  return cx.getImageData(0, 0, G, G);
}

/** Does the drawn region contain meaningful transparency? */
function hasAlpha(data: Uint8ClampedArray): boolean {
  for (let i = 3; i < data.length; i += 4) if (data[i] > 10 && data[i] < 245) return true;
  // fully-transparent padding around a fully-opaque image also counts
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

function boxBlur(src: Float32Array, G: number, radius: number): Float32Array {
  if (radius <= 0) return src;
  const tmp = new Float32Array(G * G);
  const out = new Float32Array(G * G);
  const win = radius * 2 + 1;
  // horizontal
  for (let y = 0; y < G; y++) {
    let acc = 0;
    for (let x = -radius; x <= radius; x++) acc += src[y * G + Math.max(0, Math.min(G - 1, x))];
    for (let x = 0; x < G; x++) {
      tmp[y * G + x] = acc / win;
      const drop = Math.max(0, Math.min(G - 1, x - radius));
      const addI = Math.max(0, Math.min(G - 1, x + radius + 1));
      acc += src[y * G + addI] - src[y * G + drop];
    }
  }
  // vertical
  for (let x = 0; x < G; x++) {
    let acc = 0;
    for (let y = -radius; y <= radius; y++) acc += tmp[Math.max(0, Math.min(G - 1, y)) * G + x];
    for (let y = 0; y < G; y++) {
      out[y * G + x] = acc / win;
      const drop = Math.max(0, Math.min(G - 1, y - radius));
      const addI = Math.max(0, Math.min(G - 1, y + radius + 1));
      acc += tmp[addI * G + x] - tmp[drop * G + x];
    }
  }
  return out;
}

function sobel(src: Float32Array, G: number): Float32Array {
  const out = new Float32Array(G * G);
  const at = (x: number, y: number) =>
    src[Math.max(0, Math.min(G - 1, y)) * G + Math.max(0, Math.min(G - 1, x))];
  for (let y = 0; y < G; y++) {
    for (let x = 0; x < G; x++) {
      const gx =
        -at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1) +
        at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1);
      const gy =
        -at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1) +
        at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1);
      out[y * G + x] = Math.min(255, Math.hypot(gx, gy));
    }
  }
  return out;
}

/** Full pipeline: imported bitmap → zone mask (all artwork lands in zone 1). */
export function imageToMask(image: ImportedImage, G: number, p: PreprocessParams): Uint8Array {
  const img = rasterize(image.bitmap, G);
  const d = img.data;
  const N = G * G;
  const alphaMode = hasAlpha(d);
  const [br, bg2, bb] = alphaMode ? [0, 0, 0] : borderColor(img);

  // luminance + validity field
  let lum: Float32Array = new Float32Array(N);
  const valid = new Uint8Array(N); // cell participates (not transparent / not background)
  for (let i = 0; i < N; i++) {
    const o = i * 4;
    const a = d[o + 3];
    const l = 0.299 * d[o] + 0.587 * d[o + 1] + 0.114 * d[o + 2];
    lum[i] = l;
    if (alphaMode) {
      valid[i] = a > 128 ? 1 : 0;
      // For alpha silhouettes the shape itself is the artwork: force full ink
      // so threshold keeps sensible behaviour on e.g. white logos.
      if (a > 128) lum[i] = 0;
    } else {
      valid[i] = 1;
      if (p.autoBackground) {
        const dist = Math.hypot(d[o] - br, d[o + 1] - bg2, d[o + 2] - bb);
        if (dist < 28) valid[i] = 0;
      }
    }
  }

  // brightness / contrast
  const bAdd = (p.brightness / 100) * 128;
  const cFac = Math.tan(((p.contrast / 100) * 0.99 * Math.PI) / 4 + Math.PI / 4);
  if (p.brightness !== 0 || p.contrast !== 0) {
    for (let i = 0; i < N; i++) {
      lum[i] = (lum[i] - 128 + bAdd) * cFac + 128;
    }
  }

  if (p.blur > 0) lum = boxBlur(lum, G, Math.round(p.blur));
  if (p.edgeDetect) {
    // edges are bright → keep them "inked" by inverting into the dark-is-on space
    const e = sobel(lum, G);
    for (let i = 0; i < N; i++) lum[i] = 255 - e[i];
  }

  let mask: Uint8Array = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (!valid[i]) continue;
    let on = lum[i] < p.threshold; // dark-on-light artwork by default
    if (p.invert) on = !on;
    if (on) mask[i] = 1;
  }

  for (let k = 0; k < p.denoise; k++) mask = despeckle(mask, G, 2);
  return mask;
}
