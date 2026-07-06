/** Center workspace: zoom/pan stage containing the drawing document and the
 *  generated result. Supports any canvas aspect ratio.
 *
 *  Crisp rendering: the document element is laid out at its zoomed pixel
 *  size (no CSS scale transform), so inline SVG re-renders as true vectors
 *  at every zoom level.
 *
 *  Interaction model:
 *   - draw mode:  left-drag paints, space/middle-drag pans
 *   - preview:    left-drag pans
 *   - wheel zooms around the cursor
 *  All floating controls sit outside the pointer surface (or stop
 *  propagation), so UI clicks can never be swallowed by pan/draw capture. */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '../state/store';
import type { GeneratedResult } from '../hooks/useGeneratedSvg';
import { stampLine, maskToImageData, isEmpty } from '../mask/maskOps';
import { parseHex } from '../core/color';
import { decodeImageFile } from '../raster/preprocess';
import { IconFit, IconZoomIn, IconZoomOut, IconLogo } from './icons';

/** Stage pixels per mask cell at scale 1 (long side = 512 px). */
const CELL_PX = 2;

interface View {
  scale: number;
  tx: number;
  ty: number;
}

export function Viewport({ generated }: { generated: GeneratedResult }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [view, setView] = useState<View>({ scale: 1, tx: 0, ty: 0 });
  /** Scale at which the document was last laid out. During a zoom gesture
   *  the difference to view.scale is bridged with a GPU-composited CSS
   *  transform (cheap), and the expensive vector re-layout happens once
   *  when the gesture settles — keeping heavy SVGs (contours) smooth. */
  const [committedScale, setCommittedScale] = useState(1);
  const commitTimer = useRef<number | undefined>(undefined);
  const [dragover, setDragover] = useState(false);
  const [panning, setPanning] = useState(false);

  const spaceRef = useRef(false);
  const strokeRef = useRef<{ last: { x: number; y: number } | null; active: boolean }>({
    last: null,
    active: false,
  });
  const panRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);

  const viewMode = useStore((s) => s.viewMode);
  const maskRev = useStore((s) => s.maskRev);
  const GW = useStore((s) => s.GW);
  const GH = useStore((s) => s.GH);
  const primary = useStore((s) => s.palette.primary);
  const bgOn = useStore((s) => s.bgOn);
  const maskEmpty = useStore((s) => {
    void s.maskRev; // recompute when the mask changes
    return isEmpty(s.mask);
  });

  const docW = GW * CELL_PX; // stage px at scale 1
  const docH = GH * CELL_PX;

  // ---------- fit & zoom ----------
  const fit = useCallback(() => {
    const el = rootRef.current;
    if (!el) return;
    const w = el.clientWidth;
    const h = el.clientHeight;
    const scale = Math.max(0.05, Math.min((w - 96) / docW, (h - 96) / docH));
    setView({ scale, tx: (w - docW * scale) / 2, ty: (h - docH * scale) / 2 });
    setCommittedScale(scale); // no interim blur on fit
  }, [docW, docH]);

  // commit the layout scale shortly after the zoom gesture settles
  useEffect(() => {
    if (view.scale === committedScale) return;
    window.clearTimeout(commitTimer.current);
    commitTimer.current = window.setTimeout(() => setCommittedScale(view.scale), 160);
    return () => window.clearTimeout(commitTimer.current);
  }, [view.scale, committedScale]);

  useEffect(() => {
    fit();
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => fit());
    ro.observe(el);
    window.addEventListener('gf:fit', fit);
    return () => {
      ro.disconnect();
      window.removeEventListener('gf:fit', fit);
    };
  }, [fit]);

  const zoomAt = useCallback((cx: number, cy: number, factor: number) => {
    setView((v) => {
      const scale = Math.max(0.05, Math.min(24, v.scale * factor));
      const k = scale / v.scale;
      return { scale, tx: cx - (cx - v.tx) * k, ty: cy - (cy - v.ty) * k };
    });
  }, []);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.12 : 1 / 1.12);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  // ---------- space-to-pan ----------
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target instanceof HTMLInputElement)) {
        spaceRef.current = true;
        e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') spaceRef.current = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  // ---------- mask canvas rendering ----------
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const s = useStore.getState();
    cv.width = s.GW;
    cv.height = s.GH;
    const ink = (parseHex(s.palette.primary) ?? [255, 255, 255]) as [number, number, number];
    const ctx = cv.getContext('2d')!;
    ctx.putImageData(maskToImageData(s.mask, s.GW, s.GH, ink, s.colors), 0, 0);
  }, [maskRev, GW, GH, primary]);

  // ---------- pointer: draw & pan ----------
  const cellOf = (e: React.PointerEvent): { x: number; y: number } | null => {
    const el = rootRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const dx = (e.clientX - r.left - view.tx) / view.scale;
    const dy = (e.clientY - r.top - view.ty) / view.scale;
    const x = Math.floor(dx / CELL_PX);
    const y = Math.floor(dy / CELL_PX);
    if (x < 0 || y < 0 || x >= GW || y >= GH) return null;
    return { x, y };
  };

  const paintAt = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    const s = useStore.getState();
    stampLine(
      s.mask,
      s.GW,
      s.GH,
      from.x,
      from.y,
      to.x,
      to.y,
      s.brushSize,
      s.tool === 'erase' ? 0 : 1,
      s.mirror,
    );
    s.bumpMask();
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const el = rootRef.current;
    if (!el) return;
    if ((e.target as HTMLElement).closest('.vp-float')) return;
    const wantPan =
      e.button === 1 || spaceRef.current || (e.button === 0 && viewMode === 'preview');
    if (wantPan) {
      panRef.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty };
      setPanning(true);
      el.setPointerCapture(e.pointerId);
      return;
    }
    if (e.button === 0 && viewMode === 'draw') {
      const c = cellOf(e);
      if (!c) return;
      useStore.getState().pushUndo();
      strokeRef.current = { last: c, active: true };
      paintAt(c, c);
      el.setPointerCapture(e.pointerId);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (panRef.current) {
      const p = panRef.current;
      setView((v) => ({ ...v, tx: p.tx + (e.clientX - p.x), ty: p.ty + (e.clientY - p.y) }));
      return;
    }
    if (strokeRef.current.active) {
      const c = cellOf(e);
      if (!c) return;
      const last = strokeRef.current.last ?? c;
      paintAt(last, c);
      strokeRef.current.last = c;
    }
  };

  const endPointer = (e: React.PointerEvent) => {
    const el = rootRef.current;
    if (el?.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    panRef.current = null;
    setPanning(false);
    strokeRef.current = { last: null, active: false };
  };

  // ---------- drag & drop import ----------
  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragover(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const s = useStore.getState();
    try {
      const img = await decodeImageFile(file);
      s.importImage(img); // canvas ratio snaps to the image automatically
      s.showToast(`Imported ${file.name}`);
    } catch (err) {
      s.showToast(err instanceof Error ? err.message : 'Import failed', true);
    }
  };

  const pct = Math.round(view.scale * 100);
  const preview = viewMode === 'preview';

  return (
    <div
      ref={rootRef}
      className={`viewport${panning ? ' panning' : ''}${dragover ? ' dragover' : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      onDragOver={(e) => {
        e.preventDefault();
        setDragover(true);
      }}
      onDragLeave={() => setDragover(false)}
      onDrop={onDrop}
      style={{ cursor: panning ? 'grabbing' : preview ? 'grab' : 'crosshair' }}
    >
      {/* Document laid out at the committed scale; the live gesture is
          bridged with a GPU transform, then re-laid-out crisp at rest. */}
      <div className="vp-stage" style={{ transform: `translate(${view.tx}px, ${view.ty}px)` }}>
        <div
          className={`vp-doc ${preview ? (bgOn ? '' : 'vp-doc--checker') : 'vp-doc--grid'}`}
          style={{
            width: docW * committedScale,
            height: docH * committedScale,
            transform: `scale(${view.scale / committedScale})`,
            transformOrigin: '0 0',
          }}
        >
          <canvas
            ref={canvasRef}
            className="pixelated"
            style={{ display: preview ? 'none' : 'block' }}
          />
          {preview && generated.svg ? (
            <div className="vp-svgwrap" dangerouslySetInnerHTML={{ __html: generated.svg }} />
          ) : null}
          {preview && maskEmpty ? (
            <div className="vp-docempty">
              <span className="vp-empty-logo">
                <IconLogo size={38} />
              </span>
              <div className="vp-empty-title">Nothing to render yet</div>
              <p>
                Draw a shape, or drop a PNG / JPG / SVG
                <br />
                anywhere on the canvas
              </p>
            </div>
          ) : null}
        </div>
      </div>

      {/* zoom cluster */}
      <div className="viewport-toolbar viewport-toolbar--bottom vp-float">
        <div className="vp-chipgroup" onPointerDown={(e) => e.stopPropagation()}>
          <button
            className="vp-chip vp-chip--icon"
            onClick={() => {
              const el = rootRef.current!;
              zoomAt(el.clientWidth / 2, el.clientHeight / 2, 1 / 1.25);
            }}
            title="Zoom out"
          >
            <IconZoomOut size={12} />
          </button>
          <span className="vp-readout">{pct}%</span>
          <button
            className="vp-chip vp-chip--icon"
            onClick={() => {
              const el = rootRef.current!;
              zoomAt(el.clientWidth / 2, el.clientHeight / 2, 1.25);
            }}
            title="Zoom in"
          >
            <IconZoomIn size={12} />
          </button>
          <button className="vp-chip vp-chip--icon" onClick={fit} title="Fit to screen (F)">
            <IconFit size={12} />
            Fit
          </button>
        </div>
      </div>

      <div className="viewport-hint">
        {preview ? 'drag to pan · wheel to zoom' : 'draw · space+drag to pan · wheel to zoom'}
      </div>
    </div>
  );
}
