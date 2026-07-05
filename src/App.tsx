import { useEffect } from 'react';
import { TopBar } from './components/TopBar';
import { CanvasToolbar } from './components/CanvasToolbar';
import { Viewport } from './components/Viewport';
import { Sidebar } from './components/Sidebar';
import { useStore } from './state/store';
import { useGeneratedSvg } from './hooks/useGeneratedSvg';
import { saveProject } from './state/project';

/** Global keyboard shortcuts. */
function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t.isContentEditable)
        return;
      const s = useStore.getState();
      const mod = e.ctrlKey || e.metaKey;

      if (mod && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        s.undo();
        return;
      }
      if ((mod && e.shiftKey && e.key.toLowerCase() === 'z') || (mod && e.key.toLowerCase() === 'y')) {
        e.preventDefault();
        s.redo();
        return;
      }
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveProject();
        s.showToast('Project saved');
        return;
      }
      if (mod) return;

      switch (e.key.toLowerCase()) {
        case 'b':
          s.setTool('brush');
          s.setViewMode('draw');
          break;
        case 'e':
          s.setTool('erase');
          s.setViewMode('draw');
          break;
        case '[':
          s.setBrushSize(Math.max(1, s.brushSize - 1));
          break;
        case ']':
          s.setBrushSize(Math.min(16, s.brushSize + 1));
          break;
        case 'r':
          s.reroll();
          break;
        case 'v':
          s.setViewMode(s.viewMode === 'draw' ? 'preview' : 'draw');
          break;
        case 'f':
          window.dispatchEvent(new Event('gf:fit'));
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

export default function App() {
  useShortcuts();
  const toast = useStore((s) => s.toast);
  const generated = useGeneratedSvg();

  return (
    <div className="app">
      <TopBar />
      <div className="app-main">
        <div className="canvas-col">
          <CanvasToolbar busy={generated.busy} />
          <Viewport generated={generated} />
        </div>
        <Sidebar />
      </div>
      {toast ? <div className={`toast${toast.error ? ' error' : ''}`}>{toast.text}</div> : null}
    </div>
  );
}
