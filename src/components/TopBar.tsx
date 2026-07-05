/** Application header: brand, history, mask actions, seed re-roll. */

import { useStore } from '../state/store';
import {
  IconBrush,
  IconEraser,
  IconUndo,
  IconRedo,
  IconTrash,
  IconFill,
  IconDice,
  IconFit,
  IconLogo,
} from './icons';

export function TopBar() {
  const tool = useStore((s) => s.tool);
  const setTool = useStore((s) => s.setTool);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const canUndo = useStore((s) => s.undoStack.length > 0);
  const canRedo = useStore((s) => s.redoStack.length > 0);
  const clearMask = useStore((s) => s.clearMask);
  const fillAll = useStore((s) => s.fillAll);
  const reroll = useStore((s) => s.reroll);
  const setViewMode = useStore((s) => s.setViewMode);

  return (
    <header className="topbar">
      <div className="topbar-brand">
        <span className="topbar-logo">
          <IconLogo size={22} />
        </span>
        GRIDFORGE
        <span className="sub">CIRCUIT + MARK STUDIO</span>
      </div>

      <span className="topbar-sep" />

      <div className="topbar-group">
        <button
          className={`iconbtn${tool === 'brush' ? ' active' : ''}`}
          title="Brush (B)"
          onClick={() => {
            setTool('brush');
            setViewMode('draw');
          }}
        >
          <IconBrush />
        </button>
        <button
          className={`iconbtn${tool === 'erase' ? ' active' : ''}`}
          title="Eraser (E)"
          onClick={() => {
            setTool('erase');
            setViewMode('draw');
          }}
        >
          <IconEraser />
        </button>
      </div>

      <span className="topbar-sep" />

      <div className="topbar-group">
        <button className="iconbtn" title="Undo (Ctrl+Z)" onClick={undo} disabled={!canUndo}>
          <IconUndo />
        </button>
        <button className="iconbtn" title="Redo (Ctrl+Shift+Z)" onClick={redo} disabled={!canRedo}>
          <IconRedo />
        </button>
      </div>

      <span className="topbar-sep" />

      <div className="topbar-group">
        <button className="iconbtn" title="Fill all" onClick={fillAll}>
          <IconFill />
        </button>
        <button className="iconbtn" title="Clear canvas" onClick={clearMask}>
          <IconTrash />
        </button>
        <button
          className="iconbtn"
          title="Fit to screen (F)"
          onClick={() => window.dispatchEvent(new Event('gf:fit'))}
        >
          <IconFit />
        </button>
      </div>

      <span className="topbar-spacer" />

      <button className="btn btn--sm btn--teal" onClick={reroll} title="New random seed (R)">
        <IconDice size={12} />
        Re-roll
      </button>
    </header>
  );
}
