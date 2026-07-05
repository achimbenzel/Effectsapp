/** Toolbar directly above the canvas. Mode tabs are always visible;
 *  drawing-specific tools (brush, eraser, size, mirror, fill, clear)
 *  appear only while Draw mode is active. */

import { useStore } from '../state/store';
import { IconBrush, IconEraser, IconFill, IconTrash } from './icons';

export function CanvasToolbar({ busy }: { busy: boolean }) {
  const viewMode = useStore((s) => s.viewMode);
  const setViewMode = useStore((s) => s.setViewMode);
  const tool = useStore((s) => s.tool);
  const setTool = useStore((s) => s.setTool);
  const brushSize = useStore((s) => s.brushSize);
  const setBrushSize = useStore((s) => s.setBrushSize);
  const mirror = useStore((s) => s.mirror);
  const setMirror = useStore((s) => s.setMirror);
  const fillAll = useStore((s) => s.fillAll);
  const clearMask = useStore((s) => s.clearMask);

  const draw = viewMode === 'draw';

  return (
    <div className="canvasbar">
      <div className="vp-chipgroup">
        <button className={`vp-chip${draw ? ' active' : ''}`} onClick={() => setViewMode('draw')}>
          Draw
        </button>
        <button
          className={`vp-chip${!draw ? ' active' : ''}`}
          onClick={() => setViewMode('preview')}
        >
          Preview
        </button>
      </div>

      {draw ? (
        <>
          <span className="cb-sep" />
          <div className="topbar-group">
            <button
              className={`iconbtn${tool === 'brush' ? ' active' : ''}`}
              title="Brush (B)"
              onClick={() => setTool('brush')}
            >
              <IconBrush />
            </button>
            <button
              className={`iconbtn${tool === 'erase' ? ' active' : ''}`}
              title="Eraser (E)"
              onClick={() => setTool('erase')}
            >
              <IconEraser />
            </button>
          </div>

          <span className="cb-sep" />

          <div className="cb-field">
            <span className="cb-label">Size</span>
            <input
              className="cb-slider"
              type="range"
              min={1}
              max={16}
              value={brushSize}
              onChange={(e) => setBrushSize(parseInt(e.target.value, 10))}
              title="Brush size ( [ / ] )"
            />
            <span className="cb-value">{brushSize}</span>
          </div>

          <span className="cb-sep" />

          <div className="cb-field">
            <span className="cb-label">Mirror</span>
            <div className="vp-chipgroup vp-chipgroup--flat">
              {(['off', 'h', 'v', '4'] as const).map((m) => (
                <button
                  key={m}
                  className={`vp-chip${mirror === m ? ' active' : ''}`}
                  onClick={() => setMirror(m)}
                >
                  {m === 'off' ? 'Off' : m === '4' ? '4-way' : m.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <span className="cb-sep" />

          <div className="topbar-group">
            <button className="iconbtn" title="Fill canvas" onClick={fillAll}>
              <IconFill />
            </button>
            <button className="iconbtn" title="Clear drawing" onClick={clearMask}>
              <IconTrash />
            </button>
          </div>
        </>
      ) : null}

      <span className="topbar-spacer" />
      <span className={`vp-workdot${busy ? ' on' : ''}`} title="Generating…" />
    </div>
  );
}
