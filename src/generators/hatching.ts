/** Hatching generator — angled parallel line fills clipped to the shape.
 *
 *  Lines are marched across the document at an arbitrary angle and clipped
 *  against the ink mask by sampling, producing clean engraving-style fills.
 *  Cross-hatch adds a second pass rotated 90°. */

import type { GeneratorDef, GeneratorContext, ParamValues, SvgDoc } from '../types';
import { zoneAt } from './sampling';

function hatchPass(
  ctx: GeneratorContext,
  angleDeg: number,
  spacing: number,
  jitter: number,
  rnd: () => number,
): string {
  const { mask, GW, GH, S, W, H } = ctx;
  const f = (n: number) => (Math.round(n * 100) / 100).toString();
  const rad = (angleDeg * Math.PI) / 180;
  const dx = Math.cos(rad);
  const dy = Math.sin(rad);
  const nx = -dy;
  const ny = dx;
  const cx = W / 2;
  const cy = H / 2;
  const L = Math.hypot(W, H) / 2 + spacing; // half-diagonal reach
  const step = S * 0.5; // sampling resolution along each line

  let d = '';
  for (let off = -L; off <= L; off += spacing) {
    const j = jitter > 0 ? (rnd() - 0.5) * spacing * jitter : 0;
    const bx = cx + nx * (off + j);
    const by = cy + ny * (off + j);
    let runStart: [number, number] | null = null;
    let prev: [number, number] | null = null;
    for (let t = -L; t <= L + step; t += step) {
      const x = bx + dx * t;
      const y = by + dy * t;
      const inside =
        t <= L && x >= 0 && y >= 0 && x < W && y < H && zoneAt(mask, GW, GH, S, x, y) !== 0;
      if (inside && !runStart) runStart = [x, y];
      if (!inside && runStart && prev) {
        if (Math.hypot(prev[0] - runStart[0], prev[1] - runStart[1]) >= S) {
          d += `M${f(runStart[0])} ${f(runStart[1])}L${f(prev[0])} ${f(prev[1])}`;
        }
        runStart = null;
      }
      prev = [x, y];
    }
  }
  return d;
}

function generate(ctx: GeneratorContext, p: ParamValues): SvgDoc {
  const { W, H, rnd, palette } = ctx;
  const f = (n: number) => (Math.round(n * 100) / 100).toString();

  const spacing = p.spacing as number;
  const angle = p.angle as number;
  const jitter = (p.jitter as number) / 100;
  const strokeW = p.strokeWidth as number;
  const cross = p.crosshatch as boolean;
  const cap = (p.roundCaps as boolean) ? 'round' : 'butt';

  let body = '';
  const d1 = hatchPass(ctx, angle, spacing, jitter, rnd);
  if (d1)
    body += `<path d="${d1}" fill="none" stroke="${palette.primary}" stroke-width="${f(strokeW)}" stroke-linecap="${cap}"/>`;
  if (cross) {
    const d2 = hatchPass(ctx, angle + 90, spacing, jitter, rnd);
    if (d2)
      body += `<path d="${d2}" fill="none" stroke="${palette.primary}" stroke-width="${f(strokeW)}" stroke-linecap="${cap}" opacity="0.85"/>`;
  }
  return { width: W, height: H, body };
}

export const hatchingGenerator: GeneratorDef = {
  id: 'hatching',
  name: 'Hatching',
  tagline: 'Engraved line fills',
  defaults: {
    spacing: 10,
    angle: 45,
    jitter: 0,
    strokeWidth: 2.2,
    crosshatch: false,
    roundCaps: true,
  },
  controls: [
    { kind: 'slider', key: 'spacing', label: 'Line spacing', min: 3, max: 40, step: 0.5 },
    { kind: 'slider', key: 'angle', label: 'Angle', min: 0, max: 180, unit: '°' },
    { kind: 'slider', key: 'jitter', label: 'Jitter', min: 0, max: 100, unit: '%' },
    { kind: 'slider', key: 'strokeWidth', label: 'Stroke width', min: 0.6, max: 8, step: 0.2 },
    { kind: 'toggle', key: 'crosshatch', label: 'Cross-hatch' },
    { kind: 'toggle', key: 'roundCaps', label: 'Round caps' },
  ],
  generate,
};
