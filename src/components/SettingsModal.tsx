/** Settings dialog: UI chrome theme selection + custom CSS loading.
 *  Both persist to localStorage and apply live to the whole app. */

import { useEffect, useRef, useState } from 'react';
import {
  UI_THEMES,
  getUiTheme,
  applyUiTheme,
  getCustomCss,
  applyCustomCss,
} from '../themes/uiThemes';
import { useStore } from '../state/store';
import { IconClose } from './icons';

export function SettingsModal({ onClose }: { onClose(): void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [theme, setTheme] = useState(getUiTheme());
  const [customName, setCustomName] = useState<string | null>(
    getCustomCss() !== null ? 'custom.css' : null,
  );
  const [error, setError] = useState<string | null>(null);
  const showToast = useStore((s) => s.showToast);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const pickTheme = (id: string) => {
    setTheme(id);
    applyUiTheme(id);
  };

  const loadCss = async (file: File) => {
    try {
      const text = await file.text();
      if (!text.trim()) throw new Error('The file is empty');
      applyCustomCss(text);
      setCustomName(file.name);
      setError(null);
      showToast(`Applied ${file.name}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read the CSS file');
    }
  };

  return (
    <div className="overlay" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-panel" role="dialog" aria-label="Settings">
        <div className="modal-head">
          <h2>Settings</h2>
          <button className="iconbtn" onClick={onClose} title="Close (Esc)">
            <IconClose />
          </button>
        </div>
        <div className="modal-body">
          <div className="modal-subhead">UI theme</div>
          <div className="style-grid">
            {UI_THEMES.map((t) => (
              <button
                key={t.id}
                className={`style-card${theme === t.id ? ' selected' : ''}`}
                onClick={() => pickTheme(t.id)}
              >
                <span className="style-card-head">{t.name}</span>
                <span className="style-card-desc">{t.description}</span>
              </button>
            ))}
          </div>

          <div className="customcss">
            <div className="modal-subhead">Custom CSS</div>
            <p className="modal-note">
              Load your own stylesheet to restyle the interface. It works like the bundled theme
              files: override the design tokens (<code>--paper</code>, <code>--ink</code>,{' '}
              <code>--accent</code>, …) or any component class. Applied on top of the selected
              theme and remembered across sessions.
            </p>
            <div className="customcss-actions">
              <button className="btn btn--sm" onClick={() => fileRef.current?.click()}>
                {customName ? 'Replace CSS…' : 'Load CSS file…'}
              </button>
              {customName ? (
                <button
                  className="btn btn--sm"
                  onClick={() => {
                    applyCustomCss(null);
                    setCustomName(null);
                    showToast('Custom CSS removed');
                  }}
                >
                  Remove
                </button>
              ) : null}
              <span className="side-note customcss-status">
                {customName ? `Active: ${customName}` : 'No custom CSS loaded'}
              </span>
            </div>
            {error ? <p className="side-note customcss-error">{error}</p> : null}
            <input
              ref={fileRef}
              type="file"
              accept=".css,text/css"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) loadCss(f);
                e.target.value = '';
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
