/** Center workspace: zoom/pan stage containing the drawing document and the
 *  generated result. Left-drag draws (draw mode) or pans (result mode);
 *  space/middle-drag always pans; wheel zooms around the cursor. */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '../state/store';
import { useGeneratedSvg } from '../hooks/useGeneratedSvg';
import { stampLine, maskToImageData, isEmpty } from '../mask/maskOps';
import { parseHex } from '../core/color';
import { decodeImageFile } from '../raster/preprocess';
import { IconFit, IconZoomIn, IconZoomOut, IconLogo, IconEraser } from './icons';

const DOC = 512; // document edge in stage pixels at scale 1

interface View {
  scale: number;
  tx: number;
  ty: number;
}

export function Viewport() {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [view, setView] = useState<View>({ scale: 1, tx: 0, ty: 0 });
  const [dragover, setDragover] = useState(false);
  const [panning, setPanning] = useState(false);

  const spaceRef = useRef(false);
  const strokeRef = useRef<{ last: { x: number; y: number } | null; active: boolean }>({
    last: null,
    active: false,
  });
  const panRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);

  const viewMode = useStore((s) => s.viewMode);
  const setViewMode = useStore((s) => s.setViewMode);
  const G = useStore((s) => s.G);
  const maskRev = useStore((s) => s.maskRev);
  const zones = useStore((s) => s.palette.zones);
  const zone = useStore((s) => s.zone);
  const setZone = useStore((s) => s.setZone);
  const tool = useStore((s) => s.tool);
  const setTool = useStore((s) => s.setTool);
  const bgOn = useStore((s) => s.bgOn);

  const generated = useGeneratedSvg();

  // ---------- fit & zoom ----------
  const fit = useCallback(() => {
    const el = rootRef.current;
    if (!el) return;
    const w = el.clientWidth;
    const h = el.clientHeight;
    const scale = Math.max(0.05, Math.min((w - 96) / DOC, (h - 96) / DOC));
    setView({ scale, tx: (w - DOC * scale) / 2, ty: (h - DOC * scale) / 2 });
  }, []);

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
    cv.width = s.G;
    cv.height = s.G;
    const zoneRgb = s.palette.zones.map((z) => parseHex(z) ?? [255, 255, 255]) as [
      number,
      number,
      number,
    ][];
    const ctx = cv.getContext('2d')!;
    ctx.putImageData(maskToImageData(s.mask, s.G, zoneRgb), 0, 0);
  }, [maskRev, G, zones]);

  // ---------- pointer: draw & pan ----------
  const cellOf = (e: React.PointerEvent): { x: number; y: number } | null => {
    const el = rootRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const dx = (e.clientX - r.left - view.tx) / view.scale;
    const dy = (e.clientY - r.top - view.ty) / view.scale;
    const x = Math.floor((dx / DOC) * G);
    const y = Math.floor((dy / DOC) * G);
    if (x < 0 || y < 0 || x >= G || y >= G) return null;
    return { x, y };
  };

  const paintAt = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    const s = useStore.getState();
    stampLine(
      s.mask,
      s.G,
      from.x,
      from.y,
      to.x,
      to.y,
      s.brushSize,
      s.tool === 'erase' ? 0 : s.zone,
      s.mirror,
    );
    s.bumpMask();
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const el = rootRef.current;
    if (!el) return;
    const wantPan =
      e.button === 1 || spaceRef.current || (e.button === 0 && viewMode === 'result');
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

  const endPointer = () => {
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
      s.setImported(img);
      s.applyImportToMask();
      s.setViewMode('draw');
      s.showToast(`Imported ${file.name}`);
    } catch (err) {
      s.showToast(err instanceof Error ? err.message : 'Import failed', true);
    }
  };

  const maskEmpty = isEmpty(useStore.getState().mask);
  const pct = Math.round(view.scale * 100);
  const showResult = viewMode === 'result';

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
      style={{ cursor: panning ? 'grabbing' : showResult ? 'grab' : 'crosshair' }}
    >
      <div
        className="vp-stage"
        style={{ transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})` }}
      >
        <div
          className={`vp-doc ${showResult ? (bgOn ? '' : 'vp-doc--checker') : 'vp-doc--grid'}`}
          style={{ width: DOC, height: DOC }}
        >
          <canvas
            ref={canvasRef}
            className="pixelated"
            style={{ display: showResult ? 'none' : 'block' }}
          />
          {showResult && generated.svg ? (
            <div className="vp-svgwrap" dangerouslySetInnerHTML={{ __html: generated.svg }} />
          ) : null}
        </div>
      </div>

      {/* mode + zone chips */}
      <div className="viewport-toolbar">
        <div className="vp-chipgroup">
          <button
            className={`vp-chip${!showResult ? ' active' : ''}`}
            onClick={() => setViewMode('draw')}
          >
            Draw
          </button>
          <button
            className={`vp-chip${showResult ? ' active' : ''}`}
            onClick={() => setViewMode('result')}
          >
            Result
          </button>
          <span className={`vp-workdot${generated.busy ? ' on' : ''}`} />
        </div>
        {!showResult ? (
          <div className="vp-chipgroup">
            {[1, 2, 3, 4].map((z) => (
              <button
                key={z}
                className={`vp-chip vp-zonechip${tool === 'brush' && zone === z ? ' active' : ''}`}
                onClick={() => setZone(z as 1 | 2 | 3 | 4)}
                title={`Pen ${z} (key ${z})`}
              >
                <span className="dotswatch" style={{ background: zones[z - 1] }} />
                {z}
              </button>
            ))}
            <button
              className={`vp-chip vp-chip--icon${tool === 'erase' ? ' active' : ''}`}
              onClick={() => setTool('erase')}
              title="Eraser (E)"
            >
              <IconEraser size={12} />
            </button>
          </div>
        ) : null}
      </div>

      {/* zoom cluster */}
      <div className="viewport-toolbar viewport-toolbar--bottom">
        <div className="vp-chipgroup">
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

      {showResult && generated.empty && maskEmpty ? (
        <div className="vp-empty">
          <div className="vp-empty-inner">
            <span className="vp-empty-logo">
              <IconLogo size={40} />
            </span>
            <div className="vp-empty-title">Nothing to render yet</div>
            <p>
              Switch to draw mode and paint a shape,
              <br />
              or drop a PNG / JPG / SVG anywhere
            </p>
          </div>
        </div>
      ) : null}

      <div className="viewport-hint">
        {showResult ? 'drag to pan · wheel to zoom' : 'draw · space+drag to pan · wheel to zoom'}
      </div>
    </div>
  );
}
