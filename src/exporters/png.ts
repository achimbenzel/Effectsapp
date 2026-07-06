/** PNG export: rasterise the (animation-stripped) SVG at a chosen output
 *  resolution onto a canvas. The long side gets `longPx` pixels; the short
 *  side follows the document aspect. Transparency is preserved when no
 *  background is requested. */

import { downloadBlob } from './svg';

/** Remove CSS animations so the raster snapshot is the finished state. */
function stripAnimations(svg: string): string {
  return svg
    .replace(/animation:[^;}"]*[;]?/g, '')
    .replace(/animation-delay:[^;}"]*[;]?/g, '')
    .replace(/stroke-dashoffset:\s*\d+[;]?/g, '');
}

export async function exportPng(svg: string, longPx: number, filename: string): Promise<void> {
  const clean = stripAnimations(svg);
  const url = URL.createObjectURL(new Blob([clean], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Could not rasterise SVG'));
      img.src = url;
    });
    const ar = (img.width || 1) / (img.height || 1);
    const w = ar >= 1 ? longPx : Math.max(1, Math.round(longPx * ar));
    const h = ar >= 1 ? Math.max(1, Math.round(longPx / ar)) : longPx;
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const cx = cv.getContext('2d')!;
    cx.imageSmoothingEnabled = true;
    cx.imageSmoothingQuality = 'high';
    cx.drawImage(img, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) => cv.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('PNG encoding failed');
    downloadBlob(blob, filename);
  } finally {
    URL.revokeObjectURL(url);
  }
}
