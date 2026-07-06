/** Scalar-field helpers shared by generators. */

/** 3-4-chamfer distance transform: for every painted cell, the approximate
 *  distance (in cell units) to the nearest unpainted cell. 0 outside. */
export function distanceField(mask: Uint8Array, W: number, H: number): Float32Array {
  const INF = 1e9;
  const d = new Float32Array(W * H);
  for (let i = 0; i < mask.length; i++) d[i] = mask[i] ? INF : 0;
  // forward pass
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (d[i] === 0) continue;
      let m = d[i];
      if (x > 0) m = Math.min(m, d[i - 1] + 3);
      if (y > 0) {
        m = Math.min(m, d[i - W] + 3);
        if (x > 0) m = Math.min(m, d[i - W - 1] + 4);
        if (x < W - 1) m = Math.min(m, d[i - W + 1] + 4);
      }
      d[i] = m;
    }
  }
  // backward pass
  for (let y = H - 1; y >= 0; y--) {
    for (let x = W - 1; x >= 0; x--) {
      const i = y * W + x;
      if (d[i] === 0) continue;
      let m = d[i];
      if (x < W - 1) m = Math.min(m, d[i + 1] + 3);
      if (y < H - 1) {
        m = Math.min(m, d[i + W] + 3);
        if (x < W - 1) m = Math.min(m, d[i + W + 1] + 4);
        if (x > 0) m = Math.min(m, d[i + W - 1] + 4);
      }
      d[i] = m;
    }
  }
  for (let i = 0; i < d.length; i++) d[i] /= 3; // ≈ cell units
  return d;
}

/** Majority-downsample a binary mask to a coarser grid. A coarse cell turns
 *  on when at least `threshold` of its source cells are painted. */
export function downsampleMask(
  mask: Uint8Array,
  W: number,
  H: number,
  outW: number,
  outH: number,
  threshold = 0.35,
): Uint8Array {
  const out = new Uint8Array(outW * outH);
  const fx = W / outW;
  const fy = H / outH;
  for (let ry = 0; ry < outH; ry++) {
    const y0 = Math.floor(ry * fy);
    const y1 = Math.min(H, Math.ceil((ry + 1) * fy));
    for (let rx = 0; rx < outW; rx++) {
      const x0 = Math.floor(rx * fx);
      const x1 = Math.min(W, Math.ceil((rx + 1) * fx));
      let n = 0;
      let total = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          total++;
          if (mask[y * W + x]) n++;
        }
      }
      if (total && n / total >= threshold) out[ry * outW + rx] = 1;
    }
  }
  return out;
}
