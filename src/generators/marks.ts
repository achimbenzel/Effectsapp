/** Mark field generator — the redesigned successor to "Cross Sketcher".
 *
 *  Improvements over the original:
 *   - blue-noise (Poisson-disc) layout with a hard minimum-distance
 *     guarantee, alongside honest grid/hex lattices
 *   - collision-free sizing: mark radius is derived from the layout's
 *     enforced spacing, so marks never overlap (unless allowed)
 *   - edge-aware sizing: a chamfer distance transform of the mask lets
 *     marks shrink gracefully toward the silhouette boundary
 *   - deterministic seeding throughout */

import type { GeneratorDef, GeneratorContext, ParamValues, SvgDoc } from '../types';
import { sampleLayout, type LayoutId } from './sampling';
import { renderMark, MARK_SHAPE_OPTIONS, type MarkShapeId, type MarkStyle } from './markShapes';

/** 3-4-chamfer distance transform (in cell units) of painted mask cells. */
function distanceField(mask: Uint8Array, G: number): Float32Array {
  const INF = 1e9;
  const d = new Float32Array(G * G);
  for (let i = 0; i < mask.length; i++) d[i] = mask[i] ? INF : 0;
  // forward pass
  for (let y = 0; y < G; y++) {
    for (let x = 0; x < G; x++) {
      const i = y * G + x;
      if (d[i] === 0) continue;
      let m = d[i];
      if (x > 0) m = Math.min(m, d[i - 1] + 3);
      if (y > 0) {
        m = Math.min(m, d[i - G] + 3);
        if (x > 0) m = Math.min(m, d[i - G - 1] + 4);
        if (x < G - 1) m = Math.min(m, d[i - G + 1] + 4);
      }
      d[i] = m;
    }
  }
  // backward pass
  for (let y = G - 1; y >= 0; y--) {
    for (let x = G - 1; x >= 0; x--) {
      const i = y * G + x;
      if (d[i] === 0) continue;
      let m = d[i];
      if (x < G - 1) m = Math.min(m, d[i + 1] + 3);
      if (y < G - 1) {
        m = Math.min(m, d[i + G] + 3);
        if (x < G - 1) m = Math.min(m, d[i + G + 1] + 4);
        if (x > 0) m = Math.min(m, d[i + G - 1] + 4);
      }
      d[i] = m;
    }
  }
  for (let i = 0; i < d.length; i++) d[i] /= 3; // ≈ cell units
  return d;
}

function generate(ctx: GeneratorContext, p: ParamValues): SvgDoc {
  const { mask, G, S, size, rnd, palette } = ctx;

  const layout = p.layout as LayoutId;
  const pitch = (p.spacing as number) * S;
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
  const baseR = Math.max(0.5, budget * ((p.size as number) / 100));

  const vary = (p.sizeVariance as number) / 100;
  const edgeFade = (p.edgeFade as number) / 100;
  const baseRot = p.rotation as number;
  const randRot = p.randomRotation as boolean;

  const style: MarkStyle = {
    thickness: (p.thickness as number) / 100,
    roundCaps: p.roundCaps as boolean,
    hollow: p.hollow as boolean,
  };
  const shape = p.shape as MarkShapeId;

  const dist = edgeFade > 0 ? distanceField(mask, G) : null;
  const fadeRange = Math.max(1, (p.spacing as number) * 1.5); // cells

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
    if (r < 0.45) continue;
    const ang = baseRot + (randRot ? rnd() * 360 : 0);
    const fill = palette.zones[(pt.zone - 1) % 4];
    body += renderMark(shape, pt.x, pt.y, r, fill, ang, style);
    count++;
    if (count > 60000) break; // hard safety valve
  }

  return { size, body: `<g>${body}</g>` };
}

export const marksGenerator: GeneratorDef = {
  id: 'marks',
  name: 'Marks',
  tagline: 'Blue-noise mark fields',
  zoneLabels: ['Field 1', 'Field 2', 'Field 3', 'Field 4'],
  defaults: {
    layout: 'poisson',
    shape: 'cross',
    spacing: 5,
    size: 72,
    sizeVariance: 0,
    jitter: 0,
    edgeFade: 0,
    rotation: 0,
    randomRotation: false,
    thickness: 24,
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
    { kind: 'slider', key: 'spacing', label: 'Spacing', min: 2, max: 16, step: 0.5 },
    { kind: 'slider', key: 'size', label: 'Mark size', min: 10, max: 100, unit: '%' },
    { kind: 'slider', key: 'sizeVariance', label: 'Size variance', min: 0, max: 100, unit: '%' },
    { kind: 'slider', key: 'jitter', label: 'Jitter', min: 0, max: 100, unit: '%' },
    { kind: 'slider', key: 'edgeFade', label: 'Edge fade', min: 0, max: 100, unit: '%' },
    { kind: 'slider', key: 'thickness', label: 'Stroke weight', min: 6, max: 60, unit: '%' },
    { kind: 'slider', key: 'rotation', label: 'Rotation', min: 0, max: 90, unit: '°' },
    { kind: 'toggle', key: 'randomRotation', label: 'Random rotation' },
    { kind: 'toggle', key: 'roundCaps', label: 'Round caps' },
    { kind: 'toggle', key: 'hollow', label: 'Hollow shapes' },
    { kind: 'toggle', key: 'allowOverlap', label: 'Allow overlap' },
  ],
  generate,
};
