/** Small colour helpers shared by generators and export. */

/** Parse #rgb / #rrggbb to [r,g,b]; returns null when invalid. */
export function parseHex(hex: string): [number, number, number] | null {
  const m = hex.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.replace(/./g, (c) => c + c);
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function toHex(r: number, g: number, b: number): string {
  const c = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v)))
      .toString(16)
      .padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Normalise user input to #rrggbb, or null when unparseable. */
export function normalizeHex(hex: string): string | null {
  const rgb = parseHex(hex);
  return rgb ? toHex(...rgb) : null;
}

/** Mix a colour toward white by t (0..1). */
export function lighten(hex: string, t: number): string {
  const rgb = parseHex(hex) ?? [0, 0, 0];
  return toHex(
    rgb[0] + (255 - rgb[0]) * t,
    rgb[1] + (255 - rgb[1]) * t,
    rgb[2] + (255 - rgb[2]) * t,
  );
}

/** Mix a colour toward black by t (0..1). */
export function darken(hex: string, t: number): string {
  const rgb = parseHex(hex) ?? [0, 0, 0];
  return toHex(rgb[0] * (1 - t), rgb[1] * (1 - t), rgb[2] * (1 - t));
}

/** Relative luminance 0..255 of a hex colour. */
export function luminance(hex: string): number {
  const rgb = parseHex(hex) ?? [0, 0, 0];
  return 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
}
