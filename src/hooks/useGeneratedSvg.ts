/** Debounced live generation. Re-runs the active generator whenever the
 *  mask, params, palette or seed change, keeping the preview real-time
 *  without regenerating on every pointer-move mid-stroke. */

import { useEffect, useRef, useState } from 'react';
import { useStore, MASK_G } from '../state/store';
import { getGenerator } from '../generators/registry';
import { mulberry32 } from '../core/rng';
import { isEmpty } from '../mask/maskOps';
import { wrapSvg } from '../exporters/svg';

/** Document edge length in SVG units. */
export const DOC_SIZE = 1024;
const DEBOUNCE_MS = 90;

export interface GeneratedResult {
  /** Preview SVG (respects the background toggle). */
  svg: string | null;
  busy: boolean;
  empty: boolean;
}

/** Build the current document once — shared by preview and export. */
export function generateCurrent(opts?: { background?: string | null; padding?: number }): {
  svg: string;
  size: number;
} | null {
  const s = useStore.getState();
  if (isEmpty(s.mask)) return null;
  const gen = getGenerator(s.generatorId);
  const doc = gen.generate(
    {
      mask: s.mask,
      G: MASK_G,
      S: DOC_SIZE / MASK_G,
      size: DOC_SIZE,
      rnd: mulberry32(s.seed),
      palette: s.palette,
    },
    s.params[s.generatorId],
  );
  const svg = wrapSvg(doc, {
    background: opts?.background !== undefined ? opts.background : s.bgOn ? s.palette.bg : null,
    padding: opts?.padding ?? 0,
  });
  return { svg, size: doc.size };
}

export function useGeneratedSvg(): GeneratedResult {
  const maskRev = useStore((s) => s.maskRev);
  const generatorId = useStore((s) => s.generatorId);
  const params = useStore((s) => s.params[s.generatorId]);
  const seed = useStore((s) => s.seed);
  const palette = useStore((s) => s.palette);
  const bgOn = useStore((s) => s.bgOn);

  const [result, setResult] = useState<GeneratedResult>({
    svg: null,
    busy: false,
    empty: true,
  });
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    setResult((r) => (r.busy ? r : { ...r, busy: true }));
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const out = generateCurrent();
      setResult({
        svg: out?.svg ?? null,
        busy: false,
        empty: out === null,
      });
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer.current);
  }, [maskRev, generatorId, params, seed, palette, bgOn]);

  return result;
}
