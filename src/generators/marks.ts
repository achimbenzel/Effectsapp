/** Mark field generator — blue-noise / lattice mark placement.
 *
 *  Quality guarantees:
 *   - Poisson-disc layout enforces a hard minimum distance between marks
 *   - mark radius is derived from that enforced spacing → no collisions
 *   - edge fade shrinks marks toward silhouette boundaries
 *
 *  Image-reactive rendering: when the import pipeline produced a tonal
 *  field (dithered colour/greyscale images), mark size follows image
 *  darkness — dark areas render bold, light areas fine — and marks can
 *  take their colour from the source image, so the picture stays
 *  recognisable in the generated field. */

import type { GeneratorDef, GeneratorContext, ParamValues, SvgDoc } from '../types';
import { distanceField } from '../core/fields';
import { toHex } from '../core/color';
import { sampleLayout, type LayoutId } from './sampling';
import { renderMark, MARK_SHAPE_OPTIONS, type MarkShapeId, type MarkStyle } from './markShapes';

function generate(ctx: GeneratorContext, p: ParamValues): SvgDoc {
  const { mask, GW, GH, S, W, H, rnd, palette, tone, colors } = ctx;

  const layout = p.layout as LayoutId;
  const pitch = p.spacing as number; // document units
  const field = sampleLayout(layout, {
    mask,
    GW,
    GH,
    S,
    W,
    H,
    pitch,
    jitter: (p.jitter as number) / 100,
    rnd,
  });

  // Collision-free radius budget from the layout's enforced spacing.
  const overlapAllowed = p.allowOverlap as boolean;
  const budget = overlapAllowed ? pitch * 0.75 : field.minDist * 0.5 * 0.94;
  const baseR = Math.max(0.35, budget * ((p.size as number) / 100));

  const vary = (p.sizeVariance as number) / 100;
  const edgeFade = (p.edgeFade as number) / 100;
  const baseRot = p.rotation as number;
  const randRot = p.randomRotation as boolean;
  const accentMix = (p.accentMix as number) / 100;
  const toneSize = (p.toneSize as number) / 100;
  const useImageColors = p.imageColors as boolean;

  const style: MarkStyle = {
    thickness: (p.thickness as number) / 100,
    roundCaps: p.roundCaps as boolean,
    hollow: p.hollow as boolean,
  };
  const shape = p.shape as MarkShapeId;

  // Edge fade over a dithered (tonal) mask would shrink everything, so it
  // only applies to solid shape masks.
  const dist = edgeFade > 0 && !tone ? distanceField(mask, GW, GH) : null;
  const fadeRange = Math.max(1, (pitch / S) * 1.5); // cells

  const cellOf = (x: number, y: number) =>
    Math.min(GH - 1, (y / S) | 0) * GW + Math.min(GW - 1, (x / S) | 0);

  let body = '';
  let count = 0;
  for (const pt of field.points) {
    let r = baseR;
    if (vary > 0) r *= 1 - vary * rnd();
    const ci = cellOf(pt.x, pt.y);
    if (tone && toneSize > 0) {
      // scale by image darkness: light → small, dark → full size
      const t = tone[ci];
      r *= 1 - toneSize * (1 - t);
    }
    if (dist) {
      const t = Math.min(1, dist[ci] / fadeRange);
      r *= 1 - edgeFade * (1 - t);
    }
    if (r < 0.3) continue;
    const ang = baseRot + (randRot ? rnd() * 360 : 0);
    let fill: string;
    if (useImageColors && colors) {
      fill = toHex(colors[ci * 3], colors[ci * 3 + 1], colors[ci * 3 + 2]);
    } else {
      fill = accentMix > 0 && rnd() < accentMix ? palette.secondary : palette.primary;
    }
    body += renderMark(shape, pt.x, pt.y, r, fill, ang, style);
    count++;
    if (count > 90000) break; // hard safety valve
  }

  return { width: W, height: H, body: `<g>${body}</g>` };
}

export const marksGenerator: GeneratorDef = {
  id: 'marks',
  name: 'Marks',
  tagline: 'Blue-noise mark fields',
  defaults: {
    layout: 'poisson',
    shape: 'cross',
    spacing: 14,
    size: 72,
    sizeVariance: 0,
    jitter: 0,
    edgeFade: 35,
    toneSize: 65,
    imageColors: true,
    rotation: 0,
    randomRotation: false,
    thickness: 24,
    accentMix: 0,
    roundCaps: false,
    hollow: false,
    allowOverlap: false,
  },
  controls: [
    {
      kind: 'select',
      key: 'shape',
      label: 'Mark shape',
      options: MARK_SHAPE_OPTIONS,
    },
    {
      kind: 'select',
      key: 'layout',
      label: 'Layout',
      options: [
        { value: 'poisson', label: 'Organic (blue noise)' },
        { value: 'grid', label: 'Grid' },
        { value: 'hex', label: 'Hex' },
      ],
    },
    { kind: 'slider', key: 'spacing', label: 'Spacing', min: 3, max: 64, step: 0.5 },
    { kind: 'slider', key: 'size', label: 'Mark size', min: 10, max: 100, unit: '%' },
    { kind: 'slider', key: 'toneSize', label: 'Tone → size', min: 0, max: 100, unit: '%' },
    { kind: 'toggle', key: 'imageColors', label: 'Image colors' },
    { kind: 'slider', key: 'sizeVariance', label: 'Size variance', min: 0, max: 100, unit: '%' },
    { kind: 'slider', key: 'jitter', label: 'Jitter', min: 0, max: 100, unit: '%' },
    { kind: 'slider', key: 'edgeFade', label: 'Edge fade', min: 0, max: 100, unit: '%' },
    { kind: 'slider', key: 'thickness', label: 'Stroke weight', min: 6, max: 60, unit: '%' },
    { kind: 'slider', key: 'rotation', label: 'Rotation', min: 0, max: 90, unit: '°' },
    { kind: 'slider', key: 'accentMix', label: 'Accent mix', min: 0, max: 100, unit: '%' },
    { kind: 'toggle', key: 'randomRotation', label: 'Random rotation' },
    { kind: 'toggle', key: 'roundCaps', label: 'Round caps' },
    { kind: 'toggle', key: 'hollow', label: 'Hollow shapes' },
    { kind: 'toggle', key: 'allowOverlap', label: 'Allow overlap' },
  ],
  generate,
};
