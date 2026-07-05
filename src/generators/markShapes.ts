/** Vector mark primitives. Every shape draws centred on (x, y) inside a
 *  radius-r footprint so layouts can guarantee collision-free placement.
 *  All emitters return plain SVG markup (class="mark" enables entry fade). */

export type MarkShapeId =
  | 'dot'
  | 'ring'
  | 'square'
  | 'diamond'
  | 'triangle'
  | 'cross'
  | 'x'
  | 'asterisk'
  | 'line';

export interface MarkStyle {
  /** Stroke thickness as a fraction of r (stroked shapes). */
  thickness: number;
  /** Stroke line cap. */
  roundCaps: boolean;
  /** Hollow (stroked outline) variant for filled shapes. */
  hollow: boolean;
}

const f = (n: number) => (Math.round(n * 100) / 100).toString();

function rot(ang: number, x: number, y: number): string {
  return ang ? ` transform="rotate(${f(ang)} ${f(x)} ${f(y)})"` : '';
}

function strokeGroup(
  x: number,
  y: number,
  r: number,
  fill: string,
  ang: number,
  style: MarkStyle,
  lines: [number, number, number, number][],
): string {
  const sw = Math.max(0.6, r * 2 * style.thickness);
  const cap = style.roundCaps ? 'round' : 'butt';
  const body = lines
    .map(
      ([ax, ay, bx, by]) =>
        `<line x1="${f(x + ax)}" y1="${f(y + ay)}" x2="${f(x + bx)}" y2="${f(y + by)}"/>`,
    )
    .join('');
  return `<g class="mark"${rot(ang, x, y)} stroke="${fill}" stroke-width="${f(sw)}" stroke-linecap="${cap}">${body}</g>`;
}

function fillAttrs(fill: string, r: number, style: MarkStyle): string {
  if (!style.hollow) return ` fill="${fill}"`;
  const sw = Math.max(0.6, r * 2 * style.thickness * 0.75);
  return ` fill="none" stroke="${fill}" stroke-width="${f(sw)}"`;
}

export function renderMark(
  shape: MarkShapeId,
  x: number,
  y: number,
  r: number,
  fill: string,
  ang: number,
  style: MarkStyle,
): string {
  switch (shape) {
    case 'dot': {
      if (style.hollow) {
        const sw = Math.max(0.6, r * 2 * style.thickness * 0.75);
        const rr = Math.max(0.4, r - sw / 2);
        return `<circle class="mark" cx="${f(x)}" cy="${f(y)}" r="${f(rr)}" fill="none" stroke="${fill}" stroke-width="${f(sw)}"/>`;
      }
      return `<circle class="mark" cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${fill}"/>`;
    }
    case 'ring': {
      const sw = Math.max(0.6, r * 2 * style.thickness);
      const rr = Math.max(0.4, r - sw / 2);
      return `<circle class="mark" cx="${f(x)}" cy="${f(y)}" r="${f(rr)}" fill="none" stroke="${fill}" stroke-width="${f(sw)}"/>`;
    }
    case 'square': {
      const s = r * 1.6; // inscribe within the r-footprint with a little air
      return `<rect class="mark"${rot(ang, x, y)} x="${f(x - s / 2)}" y="${f(y - s / 2)}" width="${f(s)}" height="${f(s)}" rx="${f(s * 0.1)}"${fillAttrs(fill, r, style)}/>`;
    }
    case 'diamond': {
      const d = r;
      const pts = `${f(x)},${f(y - d)} ${f(x + d)},${f(y)} ${f(x)},${f(y + d)} ${f(x - d)},${f(y)}`;
      return `<polygon class="mark"${rot(ang, x, y)} points="${pts}"${fillAttrs(fill, r, style)}/>`;
    }
    case 'triangle': {
      const a = -Math.PI / 2;
      const p = (i: number) =>
        `${f(x + Math.cos(a + (i * 2 * Math.PI) / 3) * r)},${f(y + Math.sin(a + (i * 2 * Math.PI) / 3) * r)}`;
      return `<polygon class="mark"${rot(ang, x, y)} points="${p(0)} ${p(1)} ${p(2)}"${fillAttrs(fill, r, style)}/>`;
    }
    case 'cross':
      return strokeGroup(x, y, r, fill, ang, style, [
        [-r, 0, r, 0],
        [0, -r, 0, r],
      ]);
    case 'x': {
      const d = r * 0.7071;
      return strokeGroup(x, y, r, fill, ang, style, [
        [-d, -d, d, d],
        [-d, d, d, -d],
      ]);
    }
    case 'asterisk': {
      const lines: [number, number, number, number][] = [];
      for (const deg of [0, 60, 120]) {
        const rad = (deg * Math.PI) / 180;
        const cx = Math.cos(rad) * r;
        const cy = Math.sin(rad) * r;
        lines.push([-cx, -cy, cx, cy]);
      }
      return strokeGroup(x, y, r, fill, ang, style, lines);
    }
    case 'line':
      return strokeGroup(x, y, r, fill, ang, style, [[-r, 0, r, 0]]);
  }
}

export const MARK_SHAPE_OPTIONS: { value: MarkShapeId; label: string }[] = [
  { value: 'dot', label: 'Dots' },
  { value: 'ring', label: 'Rings' },
  { value: 'square', label: 'Squares' },
  { value: 'diamond', label: 'Diamonds' },
  { value: 'triangle', label: 'Triangles' },
  { value: 'cross', label: 'Crosses' },
  { value: 'x', label: 'X marks' },
  { value: 'asterisk', label: 'Asterisks' },
  { value: 'line', label: 'Lines' },
];
