/** Application header: brand, file actions (new / open / save / export)
 *  and history. Tool-specific controls live in the canvas toolbar. */

import { useRef } from 'react';
import { useStore } from '../state/store';
import { saveProject, openProject } from '../state/project';
import { generateCurrent } from '../hooks/useGeneratedSvg';
import { downloadSvg } from '../exporters/svg';
import {
  IconUndo,
  IconRedo,
  IconNew,
  IconOpen,
  IconSave,
  IconExport,
  IconLogo,
} from './icons';

export function TopBar() {
  const openRef = useRef<HTMLInputElement>(null);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const canUndo = useStore((s) => s.undoStack.length > 0);
  const canRedo = useStore((s) => s.redoStack.length > 0);
  const newDocument = useStore((s) => s.newDocument);
  const showToast = useStore((s) => s.showToast);

  const onNew = () => {
    if (useStore.getState().undoStack.length > 0 || !useStore.getState().mask.every((v) => !v)) {
      if (!window.confirm('Start a new file? Unsaved changes will be lost.')) return;
    }
    newDocument();
    showToast('New file');
  };

  const onOpen = async (file: File) => {
    try {
      await openProject(file);
      showToast(`Opened ${file.name}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not open file', true);
    }
  };

  const onExport = () => {
    const s = useStore.getState();
    const out = generateCurrent();
    if (!out) {
      showToast('Nothing to export yet — draw or import first', true);
      return;
    }
    downloadSvg(out.svg, `gridforge-${s.generatorId}-${s.seed.toString(16)}.svg`);
    showToast('SVG exported');
  };

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
        <button className="iconbtn" title="New file" onClick={onNew}>
          <IconNew />
        </button>
        <button className="iconbtn" title="Open project… (Ctrl+O)" onClick={() => openRef.current?.click()}>
          <IconOpen />
        </button>
        <button className="iconbtn" title="Save project (Ctrl+S)" onClick={() => saveProject()}>
          <IconSave />
        </button>
        <input
          ref={openRef}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onOpen(f);
            e.target.value = '';
          }}
        />
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

      <span className="topbar-spacer" />

      <button className="btn btn--sm btn--teal" onClick={onExport} title="Export SVG">
        <IconExport size={12} />
        Export
      </button>
    </header>
  );
}
