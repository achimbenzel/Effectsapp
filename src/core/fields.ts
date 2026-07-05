/** Scalar-field helpers shared by generators. */

/** 3-4-chamfer distance transform: for every painted cell, the approximate
 *  distance (in cell units) to the nearest unpainted cell. 0 outside. */
export function distanceField(mask: Uint8Array, G: number): Float32Array {
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

/** Majority-downsample a binary mask to a coarser grid. A coarse cell turns
 *  on when at least `threshold` of its source cells are painted. */
export function downsampleMask(
  mask: Uint8Array,
  G: number,
  outG: number,
  threshold = 0.35,
): Uint8Array {
  const out = new Uint8Array(outG * outG);
  const f = G / outG;
  for (let ry = 0; ry < outG; ry++) {
    const y0 = Math.floor(ry * f);
    const y1 = Math.min(G, Math.ceil((ry + 1) * f));
    for (let rx = 0; rx < outG; rx++) {
      const x0 = Math.floor(rx * f);
      const x1 = Math.min(G, Math.ceil((rx + 1) * f));
      let n = 0;
      let total = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          total++;
          if (mask[y * G + x]) n++;
        }
      }
      if (total && n / total >= threshold) out[ry * outG + rx] = 1;
    }
  }
  return out;
}
