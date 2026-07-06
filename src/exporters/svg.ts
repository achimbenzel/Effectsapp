/** SVG document assembly + export. The generated SvgDoc stays background-
 *  free; the export wrapper decides bg, padding and final size, so exports
 *  remain fully vectorised. */

import type { SvgDoc } from '../types';

export interface WrapOptions {
  background: string | null; // null = transparent
  padding: number; // SVG units around the artwork
}

export function wrapSvg(doc: SvgDoc, opts: WrapOptions): string {
  const totalW = doc.width + opts.padding * 2;
  const totalH = doc.height + opts.padding * 2;
  const bg = opts.background
    ? `<rect x="-${opts.padding}" y="-${opts.padding}" width="${totalW}" height="${totalH}" fill="${opts.background}"/>`
    : '';
  const css = doc.css ? `<style>${doc.css}</style>` : '';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-opts.padding} ${-opts.padding} ${totalW} ${totalH}" width="${totalW}" height="${totalH}">` +
    `${css}${bg}${doc.body}</svg>`
  );
}

export function downloadBlob(blob: Blob, filename: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function downloadSvg(svg: string, filename: string): void {
  downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), filename);
}
