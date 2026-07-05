/** Mark field generator — blue-noise / lattice mark placement.
 *
 *  Spacing is expressed in absolute document units (document = 1024 units),
 *  so marks scale down to very fine detail independent of any grid setting.
 *  The 256-cell ink mask preserves small image features that the marks can
 *  follow precisely.
 *
 *  Quality guarantees:
 *   - Poisson-disc layout enforces a hard minimum distance between marks
 *   - mark radius is derived from that enforced spacing → no collisions
 *   - a chamfer distance transform lets marks shrink toward silhouette
 *     edges (edge fade) for clean boundaries */

import type { GeneratorDef, GeneratorContext, ParamValues, SvgDoc } from '../types';
import { distanceField } from '../core/fields';
import { sampleLayout, type LayoutId } from './sampling';
import { renderMark, MARK_SHAPE_OPTIONS, type MarkShapeId, type MarkStyle } from './markShapes';

function generate(ctx: GeneratorContext, p: ParamValues): SvgDoc {
  const { mask, G, S, size, rnd, palette } = ctx;

  const layout = p.layout as LayoutId;
  const pitch = p.spacing as number; // document units
  const field = sampleLayout(layout, {
    mask,
    G,
    S,
    size,
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

  const style: MarkStyle = {
    thickness: (p.thickness as number) / 100,
    roundCaps: p.roundCaps as boolean,
    hollow: p.hollow as boolean,
  };
  const shape = p.shape as MarkShapeId;

  const dist = edgeFade > 0 ? distanceField(mask, G) : null;
  const fadeRange = Math.max(1, (pitch / S) * 1.5); // cells

  let body = '';
  let count = 0;
  for (const pt of field.points) {
    let r = baseR;
    if (vary > 0) r *= 1 - vary * rnd(); // vary downward: keeps the no-overlap guarantee
    if (dist) {
      const ci = Math.min(G - 1, (pt.y / S) | 0) * G + Math.min(G - 1, (pt.x / S) | 0);
      const t = Math.min(1, dist[ci] / fadeRange);
      r *= 1 - edgeFade * (1 - t);
    }
    if (r < 0.3) continue;
    const ang = baseRot + (randRot ? rnd() * 360 : 0);
    const fill = accentMix > 0 && rnd() < accentMix ? palette.secondary : palette.primary;
    body += renderMark(shape, pt.x, pt.y, r, fill, ang, style);
    count++;
    if (count > 80000) break; // hard safety valve
  }

  return { size, body: `<g>${body}</g>` };
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
