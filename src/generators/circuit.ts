/** Circuit generator — evolution of "Circuit Sketcher REV-D".
 *
 *  The proven core is kept: 45°-constrained stochastic trace growth inside
 *  the painted mask, with occupancy so traces never cross. Design changes
 *  vs the reference implementation:
 *
 *   - the router works on its own square-cell grid, downsampled from the
 *     document mask (supports any canvas aspect ratio)
 *   - ICs and discrete parts are placed procedurally in roomy interior
 *     regions
 *   - pads/vias go through a circle registry with real distance checks:
 *     the reference only guaranteed one *cell* per circle, so adjacent
 *     endpoints could still overlap visually (ring outer edge = r + half
 *     stroke ≈ 0.58·S per side > half a cell apart). Every circle now
 *     reserves its true outer radius plus a clearance gap; colliding pads
 *     demote to smaller vias or are skipped, keeping the layout clean. */

import type { GeneratorDef, GeneratorContext, ParamValues, SvgDoc } from '../types';
import { lighten, darken, luminance } from '../core/color';
import { distanceField, downsampleMask } from '../core/fields';

const DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1],
];

interface Path {
  pts: [number, number][];
  pinStart: boolean;
  prepend?: [number, number];
}

const SCALE_TO_G: Record<string, number> = { fine: 128, medium: 96, coarse: 64 };

/** Registry of placed circles with true-radius collision checks. */
class CircleRegistry {
  private xs: number[] = [];
  private ys: number[] = [];
  private rs: number[] = [];
  private buckets = new Map<number, number[]>();
  constructor(
    private cell: number,
    private gap: number,
  ) {}

  private key(bx: number, by: number): number {
    return by * 65536 + bx;
  }

  /** Would a circle at (x, y) with radius r overlap anything? */
  collides(x: number, y: number, r: number): boolean {
    const b = this.cell;
    const bx = Math.floor(x / b);
    const by = Math.floor(y / b);
    const reach = Math.ceil((r + this.gap) / b) + 1;
    for (let oy = -reach; oy <= reach; oy++) {
      for (let ox = -reach; ox <= reach; ox++) {
        const list = this.buckets.get(this.key(bx + ox, by + oy));
        if (!list) continue;
        for (const i of list) {
          const min = r + this.rs[i] + this.gap;
          if ((this.xs[i] - x) ** 2 + (this.ys[i] - y) ** 2 < min * min) return true;
        }
      }
    }
    return false;
  }

  add(x: number, y: number, r: number): void {
    const i = this.xs.length;
    this.xs.push(x);
    this.ys.push(y);
    this.rs.push(r);
    const k = this.key(Math.floor(x / this.cell), Math.floor(y / this.cell));
    const list = this.buckets.get(k);
    if (list) list.push(i);
    else this.buckets.set(k, [i]);
  }
}

/** Carve procedural component zones (2 = chip, 3 = parts) into the route
 *  mask, using the distance field to find regions with enough room. */
function placeComponents(
  route: Uint8Array,
  GW: number,
  GH: number,
  chips: number,
  parts: number,
  rnd: () => number,
): void {
  if (chips <= 0 && parts <= 0) return;
  const dist = distanceField(route, GW, GH);

  const candidates: number[] = [];
  for (let i = 0; i < route.length; i++) if (dist[i] >= 4.5) candidates.push(i);

  const clearAround = (cx: number, cy: number, r: number): boolean => {
    for (let y = cy - r; y <= cy + r; y++)
      for (let x = cx - r; x <= cx + r; x++) {
        if (x < 0 || y < 0 || x >= GW || y >= GH) return false;
        if (route[y * GW + x] !== 1) return false;
      }
    return true;
  };

  let placedChips = 0;
  for (let a = 0; a < chips * 40 && placedChips < chips && candidates.length; a++) {
    const ci = candidates[(rnd() * candidates.length) | 0];
    const cx = ci % GW;
    const cy = (ci / GW) | 0;
    const w = 2 + ((rnd() * 2) | 0);
    const h = 2 + ((rnd() * 2) | 0);
    if (!clearAround(cx, cy, Math.max(w, h) + 1)) continue;
    for (let y = cy - h; y <= cy + h; y++)
      for (let x = cx - w; x <= cx + w; x++) route[y * GW + x] = 2;
    placedChips++;
  }

  const partCandidates: number[] = [];
  for (let i = 0; i < route.length; i++) if (route[i] === 1 && dist[i] >= 2.5) partCandidates.push(i);
  let placedParts = 0;
  for (let a = 0; a < parts * 30 && placedParts < parts && partCandidates.length; a++) {
    const ci = partCandidates[(rnd() * partCandidates.length) | 0];
    const cx = ci % GW;
    const cy = (ci / GW) | 0;
    if (!clearAround(cx, cy, 2)) continue;
    for (let y = cy - 1; y <= cy + 1; y++)
      for (let x = cx - 1; x <= cx + 1; x++) route[y * GW + x] = 3;
    placedParts++;
  }
}

function generate(ctx: GeneratorContext, p: ParamValues): SvgDoc {
  const { mask: srcMask, GW: srcGW, GH: srcGH, W, H, rnd, palette } = ctx;
  const f = (n: number) => (Math.round(n * 100) / 100).toString();

  // ----- route grid (square cells, long side = scale preset) -----
  const longG = SCALE_TO_G[p.traceScale as string] ?? 96;
  const S = Math.max(W, H) / longG;
  const G = Math.max(2, Math.round(W / S)); // columns
  const GH = Math.max(2, Math.round(H / S)); // rows
  const c = (v: number) => v * S + S / 2;
  const cy2 = (v: number) => v * S + S / 2;
  const mask = downsampleMask(srcMask, srcGW, srcGH, G, GH);
  // "Tech parts" off → pure traces + pads/vias: no ICs, no components
  const techParts = p.techParts as boolean;
  placeComponents(
    mask,
    G,
    GH,
    techParts ? Math.round(p.chips as number) : 0,
    techParts ? Math.round(p.parts as number) : 0,
    rnd,
  );

  const chipBody = luminance(palette.bg) > 128 ? darken(palette.bg, 0.78) : lighten(palette.bg, 0.07);
  const COL = {
    trace: palette.primary,
    pad: palette.secondary,
    chip: chipBody,
    text: palette.secondary,
  };

  const straightness = (p.straightness as number) / 100;
  const clearanceOn = p.clearance as boolean;
  const branchProb = (p.branching as number) / 100;
  const lenBase = p.traceLength as number;
  const densityMul = (p.density as number) / 100;
  const padsFilled = (p.padStyle as string) === 'filled';
  const flowOn = p.flow as boolean;
  const showLabels = p.labels as boolean;
  const showFrame = p.frame as boolean;
  const strokeW = S * 0.34 * ((p.strokeWidth as number) / 100);

  // ----- circle geometry: true outer radii incl. ring stroke -----
  const padR = S * (padsFilled ? 0.58 : 0.41);
  const viaR = S * (padsFilled ? 0.36 : 0.25);
  const padOuter = padsFilled ? padR : padR + strokeW / 2;
  const viaOuter = padsFilled ? viaR : viaR + strokeW * 0.65 * 0.5;
  const circles = new CircleRegistry(S * 2, S * 0.18);

  const idx = (x: number, y: number) => y * G + x;
  const routable = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < G && y < GH && mask[idx(x, y)] === 1;

  let area = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i] === 1) area++;

  const occ = new Uint8Array(G * GH);
  const block = new Uint8Array(G * GH);
  const free = (x: number, y: number) =>
    routable(x, y) && occ[idx(x, y)] === 0 && block[idx(x, y)] === 0;

  function canStep(x: number, y: number, d: number): boolean {
    const nx = x + DIRS[d][0];
    const ny = y + DIRS[d][1];
    if (!free(nx, ny)) return false;
    if (d % 2 === 1) {
      const a = !routable(nx, y) || occ[idx(nx, y)];
      const b = !routable(x, ny) || occ[idx(x, ny)];
      if (a && b) return false;
    }
    return true;
  }

  function growPath(sx: number, sy: number, d0: number, forceStraight: number): [number, number][] {
    let d = d0;
    let x = sx;
    let y = sy;
    const pts: [number, number][] = [[x, y]];
    occ[idx(x, y)] = 1;
    const maxLen = Math.max(4, (lenBase * 0.5 + rnd() * lenBase) | 0);
    for (let step = 0; step < maxLen; step++) {
      const straightFirst = step < forceStraight || rnd() < straightness;
      const tryD = straightFirst
        ? [d, (d + 1) % 8, (d + 7) % 8]
        : rnd() < 0.5
          ? [(d + 1) % 8, d, (d + 7) % 8]
          : [(d + 7) % 8, d, (d + 1) % 8];
      let moved = false;
      for (const nd of tryD) {
        if (canStep(x, y, nd)) {
          d = nd;
          x += DIRS[d][0];
          y += DIRS[d][1];
          occ[idx(x, y)] = 1;
          pts.push([x, y]);
          moved = true;
          break;
        }
      }
      if (!moved) break;
    }
    return pts;
  }

  const undo = (pts: [number, number][]) => {
    for (const [px, py] of pts) occ[idx(px, py)] = 0;
  };

  const commit = (pts: [number, number][]) => {
    if (!clearanceOn) return;
    for (let i = 1; i < pts.length - 1; i++) {
      const [px, py] = pts[i];
      for (const [dx, dy] of DIRS) {
        const nx = px + dx;
        const ny = py + dy;
        if (nx < 0 || ny < 0 || nx >= G || ny >= GH) continue;
        if (occ[idx(nx, ny)] === 0) block[idx(nx, ny)] = 1;
      }
    }
  };

  // ----- chips: connected components of zone-2 cells -----
  interface Chip { x0: number; y0: number; x1: number; y1: number; hPins: number[]; vPins: number[] }
  const chips: Chip[] = [];
  {
    const seen = new Uint8Array(G * GH);
    for (let y = 0; y < GH; y++) {
      for (let x = 0; x < G; x++) {
        if (mask[idx(x, y)] !== 2 || seen[idx(x, y)]) continue;
        let x0 = x, x1 = x, y0 = y, y1 = y;
        const stack: [number, number][] = [[x, y]];
        seen[idx(x, y)] = 1;
        while (stack.length) {
          const [cx, cyv] = stack.pop()!;
          x0 = Math.min(x0, cx); x1 = Math.max(x1, cx);
          y0 = Math.min(y0, cyv); y1 = Math.max(y1, cyv);
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
            const nx = cx + dx;
            const ny = cyv + dy;
            if (nx < 0 || ny < 0 || nx >= G || ny >= GH) continue;
            if (mask[idx(nx, ny)] === 2 && !seen[idx(nx, ny)]) {
              seen[idx(nx, ny)] = 1;
              stack.push([nx, ny]);
            }
          }
        }
        chips.push({ x0, y0, x1, y1, hPins: [], vPins: [] });
      }
    }
  }

  const paths: Path[] = [];
  const pins: [number, number, number, number][] = [];

  const pinPositions = (a0: number, a1: number): number[] => {
    const a = a0 + 1;
    const b = a1 - 1;
    if (b < a) return [Math.floor((a0 + a1) / 2)];
    const out: number[] = [];
    for (let q = a; q <= b; q += 2) out.push(q);
    return out;
  };
  const pinW = S * 0.42;
  for (const ch of chips) {
    ch.hPins = pinPositions(ch.x0, ch.x1);
    ch.vPins = pinPositions(ch.y0, ch.y1);
    const sides = [
      { dir: 6, cells: ch.hPins.map((px) => [px, ch.y0 - 1] as const), edge: () => ch.y0 * S },
      { dir: 2, cells: ch.hPins.map((px) => [px, ch.y1 + 1] as const), edge: () => (ch.y1 + 1) * S },
      { dir: 4, cells: ch.vPins.map((py) => [ch.x0 - 1, py] as const), edge: () => ch.x0 * S },
      { dir: 0, cells: ch.vPins.map((py) => [ch.x1 + 1, py] as const), edge: () => (ch.x1 + 1) * S },
    ];
    for (const side of sides) {
      for (const [px, py] of side.cells) {
        if (!free(px, py)) continue;
        const pts = growPath(px, py, side.dir, 2);
        if (pts.length < 3) {
          undo(pts);
          continue;
        }
        paths.push({ pts, pinStart: true });
        commit(pts);
        const cx = c(px);
        const cyv = cy2(py);
        if (side.dir === 6) pins.push([cx - pinW / 2, cyv, pinW, side.edge() - cyv]);
        if (side.dir === 2) pins.push([cx - pinW / 2, side.edge(), pinW, cyv - side.edge()]);
        if (side.dir === 4) pins.push([cx, cyv - pinW / 2, side.edge() - cx, pinW]);
        if (side.dir === 0) pins.push([side.edge(), cyv - pinW / 2, cx - side.edge(), pinW]);
      }
    }
  }

  // ----- discrete parts in zone-3 cells -----
  interface Part { x: number; y: number; dx: number; dy: number; type: 'res' | 'cap' | 'led' }
  const parts: Part[] = [];
  {
    const partCells: [number, number][] = [];
    for (let y = 0; y < GH; y++)
      for (let x = 0; x < G; x++) if (mask[idx(x, y)] === 3) partCells.push([x, y]);
    const usedP = new Uint8Array(G * GH);
    const partAt = (x: number, y: number) =>
      x >= 0 && y >= 0 && x < G && y < GH && mask[idx(x, y)] === 3 && !usedP[idx(x, y)];
    const TYPES = ['res', 'cap', 'led'] as const;
    const tries = partCells.length * 2;
    for (let a = 0; a < tries && partCells.length; a++) {
      const [x, y] = partCells[(rnd() * partCells.length) | 0];
      const orients: [number, number][] = rnd() < 0.5 ? [[1, 0], [0, 1]] : [[0, 1], [1, 0]];
      for (const [dx, dy] of orients) {
        if (!partAt(x, y) || !partAt(x - dx, y - dy) || !partAt(x + dx, y + dy)) continue;
        for (let oy = -1; oy <= 1; oy++) {
          for (let ox = -1; ox <= 1; ox++) {
            const ux = x + ox;
            const uy = y + oy;
            if (ux >= 0 && uy >= 0 && ux < G && uy < GH) usedP[idx(ux, uy)] = 1;
          }
        }
        parts.push({ x, y, dx, dy, type: TYPES[(rnd() * 3) | 0] });
        break;
      }
    }
    for (const part of parts) {
      for (const s of [-1, 1]) {
        const endX = part.x + part.dx * s;
        const endY = part.y + part.dy * s;
        const bx = part.x + part.dx * 2 * s;
        const by = part.y + part.dy * 2 * s;
        const dir = DIRS.findIndex((dd) => dd[0] === part.dx * s && dd[1] === part.dy * s);
        if (free(bx, by)) {
          const pts = growPath(bx, by, dir, 1);
          if (pts.length >= 3) {
            paths.push({ pts, pinStart: true, prepend: [endX, endY] });
            commit(pts);
          } else undo(pts);
        }
      }
    }
  }

  // ----- free traces -----
  const cells: [number, number][] = [];
  for (let y = 0; y < GH; y++) for (let x = 0; x < G; x++) if (routable(x, y)) cells.push([x, y]);
  const attempts = Math.min(2200, Math.round(area * 3 * densityMul));
  for (let a = 0; a < attempts && cells.length; a++) {
    const [sx, sy] = cells[(rnd() * cells.length) | 0];
    if (!free(sx, sy)) continue;
    const pts = growPath(sx, sy, (rnd() * 8) | 0, 0);
    if (pts.length < 4) {
      undo(pts);
      continue;
    }
    paths.push({ pts, pinStart: false });
    commit(pts);

    if (branchProb > 0 && pts.length >= 6 && rnd() < branchProb) {
      const [mx, my] = pts[2 + ((rnd() * (pts.length - 4)) | 0)];
      for (const [dx, dy] of DIRS) {
        const bx2 = mx + dx;
        const by2 = my + dy;
        if (!free(bx2, by2)) continue;
        const bdir = DIRS.findIndex((dd) => dd[0] === dx && dd[1] === dy);
        const bpts = growPath(bx2, by2, bdir, 1);
        if (bpts.length >= 3) {
          bpts.unshift([mx, my]);
          paths.push({ pts: bpts, pinStart: true });
          commit(bpts);
        } else undo(bpts);
        break;
      }
    }
  }

  // ---------- build SVG ----------
  const simplify = (pts: [number, number][]): [number, number][] => {
    const o: [number, number][] = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) {
      const [ax, ay] = o[o.length - 1];
      const [bx, by] = pts[i];
      const [cx2, cyv2] = pts[i + 1];
      if ((bx - ax) * (cyv2 - by) !== (by - ay) * (cx2 - bx)) o.push(pts[i]);
    }
    o.push(pts[pts.length - 1]);
    return o;
  };

  let traceSvg = '';
  let padSvg = '';
  let viaSvg = '';
  let flowSvg = '';

  const padMarkup = (x: number, y: number) =>
    `<circle class="padring" cx="${f(c(x))}" cy="${f(cy2(y))}" r="${f(padR)}"/>`;
  const viaMarkup = (x: number, y: number) =>
    `<circle class="viaring" cx="${f(c(x))}" cy="${f(cy2(y))}" r="${f(viaR)}"/>`;

  /** Register a circle unconditionally (component pads own their spot). */
  const forcePad = (x: number, y: number) => {
    circles.add(c(x), cy2(y), padOuter);
    padSvg += padMarkup(x, y);
  };

  /** Try pad → via → nothing, with true-radius collision checks. */
  const tryEndCircle = (x: number, y: number, preferPad: boolean) => {
    const ux = c(x);
    const uy = cy2(y);
    if (preferPad && !circles.collides(ux, uy, padOuter)) {
      circles.add(ux, uy, padOuter);
      padSvg += padMarkup(x, y);
      return;
    }
    if (!circles.collides(ux, uy, viaOuter)) {
      circles.add(ux, uy, viaOuter);
      viaSvg += viaMarkup(x, y);
    }
  };

  // component pads first: they own their locations
  for (const part of parts) {
    forcePad(part.x - part.dx, part.y - part.dy);
    forcePad(part.x + part.dx, part.y + part.dy);
  }

  for (const { pts, pinStart, prepend } of paths) {
    const sp = simplify(pts);
    let dStr = prepend
      ? `M${f(c(prepend[0]))} ${f(cy2(prepend[1]))}L${f(c(sp[0][0]))} ${f(cy2(sp[0][1]))}`
      : `M${f(c(sp[0][0]))} ${f(cy2(sp[0][1]))}`;
    for (let i = 1; i < sp.length; i++) dStr += `L${f(c(sp[i][0]))} ${f(cy2(sp[i][1]))}`;
    traceSvg += `<path class="trace" d="${dStr}"/>`;
    if (flowOn)
      flowSvg += `<path class="flow" d="${dStr}" style="animation-delay:-${(rnd() * 1.6).toFixed(2)}s"/>`;

    const [ex, ey] = pts[0];
    const [fx2, fy2] = pts[pts.length - 1];
    if (!pinStart) tryEndCircle(ex, ey, true);
    tryEndCircle(fx2, fy2, rnd() < 0.5);
  }

  // scatter a few free-standing vias (distance-checked like everything else)
  let scattered = 0;
  for (let a = 0; a < 220 && scattered < paths.length / 3; a++) {
    if (!cells.length) break;
    const [vx, vy] = cells[(rnd() * cells.length) | 0];
    if (!free(vx, vy)) continue;
    const ux = c(vx);
    const uy = cy2(vy);
    if (circles.collides(ux, uy, viaOuter)) continue;
    occ[idx(vx, vy)] = 1;
    circles.add(ux, uy, viaOuter);
    viaSvg += viaMarkup(vx, vy);
    scattered++;
  }

  // ----- part artwork -----
  let partSvg = '';
  for (const part of parts) {
    const cx = c(part.x);
    const cyv = cy2(part.y);
    let a = `<g${part.dy ? ` transform="rotate(90 ${f(cx)} ${f(cyv)})"` : ''}>`;
    const lead = (x1: number, x2: number) =>
      `<line x1="${f(x1)}" y1="${f(cyv)}" x2="${f(x2)}" y2="${f(cyv)}" stroke="${COL.trace}" stroke-width="${f(strokeW)}"/>`;
    if (part.type === 'res') {
      a += lead(cx - S, cx + S);
      a += `<rect x="${f(cx - S * 0.8)}" y="${f(cyv - S * 0.42)}" width="${f(S * 1.6)}" height="${f(S * 0.84)}" rx="2" fill="${lighten(COL.chip, 0.3)}" stroke="${lighten(COL.chip, 0.55)}" stroke-width="0.7"/>`;
      for (const off of [-0.38, 0, 0.38])
        a += `<line x1="${f(cx + S * off)}" y1="${f(cyv - S * 0.42)}" x2="${f(cx + S * off)}" y2="${f(cyv + S * 0.42)}" stroke="${COL.text}" stroke-width="1" opacity="0.85"/>`;
    } else if (part.type === 'cap') {
      a += lead(cx - S, cx - S * 0.3) + lead(cx + S * 0.3, cx + S);
      a += `<line x1="${f(cx - S * 0.16)}" y1="${f(cyv - S * 0.6)}" x2="${f(cx - S * 0.16)}" y2="${f(cyv + S * 0.6)}" stroke="${COL.pad}" stroke-width="1.8"/>`;
      a += `<line x1="${f(cx + S * 0.16)}" y1="${f(cyv - S * 0.6)}" x2="${f(cx + S * 0.16)}" y2="${f(cyv + S * 0.6)}" stroke="${COL.pad}" stroke-width="1.8"/>`;
    } else {
      a += lead(cx - S, cx + S);
      a += `<circle class="ledglow" cx="${f(cx)}" cy="${f(cyv)}" r="${f(S * 1.05)}" fill="${lighten(COL.trace, 0.5)}"/>`;
      a += `<circle cx="${f(cx)}" cy="${f(cyv)}" r="${f(S * 0.55)}" fill="${lighten(COL.trace, 0.45)}" stroke="${COL.pad}" stroke-width="0.8"/>`;
      a += `<circle cx="${f(cx - S * 0.15)}" cy="${f(cyv - S * 0.15)}" r="${f(S * 0.16)}" fill="#ffffff" fill-opacity="0.85"/>`;
    }
    partSvg += a + '</g>';
  }

  // ----- chip package artwork -----
  let chipSvg = '';
  chips.forEach((ch, i) => {
    const x = ch.x0 * S;
    const y = ch.y0 * S;
    const w = (ch.x1 - ch.x0 + 1) * S;
    const h = (ch.y1 - ch.y0 + 1) * S;
    const inset = Math.min(S * 0.55, w / 4, h / 4);
    const bx = x + inset;
    const by = y + inset;
    const bw = w - 2 * inset;
    const bh = h - 2 * inset;

    let legs = '';
    for (const px of ch.hPins) {
      const lx = px * S + S / 2 - pinW / 2;
      legs += `<rect x="${f(lx)}" y="${f(y)}" width="${f(pinW)}" height="${f(inset + 1)}" rx="0.8"/>`;
      legs += `<rect x="${f(lx)}" y="${f(by + bh - 1)}" width="${f(pinW)}" height="${f(inset + 1)}" rx="0.8"/>`;
    }
    for (const py of ch.vPins) {
      const ly = py * S + S / 2 - pinW / 2;
      legs += `<rect x="${f(x)}" y="${f(ly)}" width="${f(inset + 1)}" height="${f(pinW)}" rx="0.8"/>`;
      legs += `<rect x="${f(bx + bw - 1)}" y="${f(ly)}" width="${f(inset + 1)}" height="${f(pinW)}" rx="0.8"/>`;
    }
    chipSvg += `<g fill="${COL.pad}">${legs}</g>`;
    chipSvg += `<rect x="${f(bx)}" y="${f(by)}" width="${f(bw)}" height="${f(bh)}" rx="2.5" fill="${COL.chip}" stroke="${lighten(COL.chip, 0.35)}" stroke-width="0.9"/>`;
    chipSvg += `<line x1="${f(bx + 2.5)}" y1="${f(by + 2)}" x2="${f(bx + bw - 2.5)}" y2="${f(by + 2)}" stroke="${lighten(COL.chip, 0.5)}" stroke-width="0.7" opacity="0.8"/>`;
    const dotIn = Math.min(S * 0.55, bw / 5, bh / 5) + 1.5;
    chipSvg += `<circle cx="${f(bx + dotIn)}" cy="${f(by + dotIn)}" r="${f(Math.min(S * 0.18, bh / 8))}" fill="${COL.text}" fill-opacity="0.85"/>`;
    if (showLabels && bw >= S * 3 && bh >= S * 1.6) {
      chipSvg += `<text x="${f(bx + bw / 2)}" y="${f(by + bh / 2 + 3)}" text-anchor="middle" font-family="monospace" font-size="${f(Math.min(9, bh / 3))}" fill="${COL.text}">IC${i + 1}</text>`;
    }
  });

  let pinSvg = '';
  for (const [px, py, pw, ph] of pins) {
    pinSvg += `<rect x="${f(px)}" y="${f(py)}" width="${f(pw)}" height="${f(ph)}" fill="${COL.pad}"/>`;
  }

  const fid = (x: number, y: number) =>
    `<circle cx="${x}" cy="${y}" r="8" fill="none" stroke="${COL.pad}" stroke-width="1.6" opacity="0.5"/>` +
    `<circle cx="${x}" cy="${y}" r="2.4" fill="${COL.pad}" opacity="0.5"/>`;
  const decoration = showFrame
    ? `<rect x="10" y="10" width="${W - 20}" height="${H - 20}" fill="none" stroke="${COL.pad}" stroke-width="1.4" opacity="0.28"/>` +
      `${fid(28, 28)}${fid(W - 28, 28)}${fid(28, H - 28)}${fid(W - 28, H - 28)}` +
      `<text x="${W - 24}" y="${H - 22}" text-anchor="end" font-family="monospace" font-size="14" fill="${COL.pad}" opacity="0.5">GRIDFORGE REV-E</text>`
    : '';

  const css = `
    path.trace { stroke:${COL.trace}; stroke-width:${f(strokeW)}; stroke-linecap:round; stroke-linejoin:round; fill:none; }
    ${padsFilled
      ? `g.pads circle { fill:${COL.pad}; stroke:none; }`
      : `g.pads circle { fill:none; stroke:${COL.pad}; }
    g.pads circle.padring { stroke-width:${f(strokeW)}; }
    g.pads circle.viaring { stroke-width:${f(strokeW * 0.65)}; }`}
    path.flow {
      stroke:${lighten(COL.trace, 0.65)}; stroke-width:${f(S * 0.16)};
      stroke-linecap:round; stroke-linejoin:round; fill:none;
      stroke-dasharray:3 13;
      animation: flowMove 1.6s linear infinite;
    }
    @keyframes flowMove { to { stroke-dashoffset: -16; } }
    circle.ledglow { opacity:0.25; ${flowOn ? 'animation: ledPulse 1.6s ease-in-out infinite;' : ''} }
    @keyframes ledPulse { 0%,100% { opacity:0.14; } 50% { opacity:0.5; } }`;

  const body = `${decoration}<g>${traceSvg}</g><g>${flowSvg}</g><g class="pads">${viaSvg}${padSvg}</g>${partSvg}${pinSvg}${chipSvg}`;

  return { width: W, height: H, body, css };
}

export const circuitGenerator: GeneratorDef = {
  id: 'circuit',
  name: 'Circuit',
  tagline: 'PCB trace growth',
  defaults: {
    traceScale: 'medium',
    density: 100,
    traceLength: 22,
    straightness: 62,
    branching: 25,
    techParts: true,
    chips: 2,
    parts: 6,
    clearance: false,
    strokeWidth: 100,
    padStyle: 'rings',
    flow: true,
    labels: true,
    frame: true,
  },
  controls: [
    {
      kind: 'select',
      key: 'traceScale',
      label: 'Trace scale',
      options: [
        { value: 'fine', label: 'Fine' },
        { value: 'medium', label: 'Medium' },
        { value: 'coarse', label: 'Coarse' },
      ],
    },
    { kind: 'slider', key: 'density', label: 'Density', min: 20, max: 200, unit: '%' },
    { kind: 'slider', key: 'traceLength', label: 'Trace length', min: 6, max: 60 },
    { kind: 'slider', key: 'straightness', label: 'Straightness', min: 20, max: 95, unit: '%' },
    { kind: 'slider', key: 'branching', label: 'Branching', min: 0, max: 100, unit: '%' },
    { kind: 'toggle', key: 'techParts', label: 'Tech parts (ICs & co.)' },
    { kind: 'slider', key: 'chips', label: 'IC chips', min: 0, max: 8 },
    { kind: 'slider', key: 'parts', label: 'Components', min: 0, max: 20 },
    { kind: 'slider', key: 'strokeWidth', label: 'Stroke width', min: 40, max: 200, unit: '%' },
    {
      kind: 'select',
      key: 'padStyle',
      label: 'Pads & vias',
      options: [
        { value: 'rings', label: 'Rings (drilled)' },
        { value: 'filled', label: 'Filled discs' },
      ],
    },
    { kind: 'toggle', key: 'clearance', label: 'Trace clearance' },
    { kind: 'toggle', key: 'flow', label: 'Current flow' },
    { kind: 'toggle', key: 'labels', label: 'Chip labels' },
    { kind: 'toggle', key: 'frame', label: 'Board frame' },
  ],
  generate,
};
