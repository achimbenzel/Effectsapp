/** Right-hand settings sidebar, ordered as a workflow:
 *  Import → Generator → Settings → Theme → Export.
 *  Generator parameters render from the active generator's declarative
 *  control specs, so new generators need zero sidebar work. */

import { useRef, useState } from 'react';
import {
  useStore,
  useActiveGenerator,
  THEME_PRESETS,
  CANVAS_PRESETS,
  aspectToCells,
} from '../state/store';
import { GENERATORS } from '../generators/registry';
import { decodeImageFile } from '../raster/preprocess';
import { generateCurrent } from '../hooks/useGeneratedSvg';
import { downloadSvg } from '../exporters/svg';
import { exportPng } from '../exporters/png';
import { Slider } from './controls/Slider';
import { Select } from './controls/Select';
import { Toggle } from './controls/Toggle';
import { ColorField } from './controls/ColorField';
import { IconDice, IconImport } from './icons';
import type { ControlSpec } from '../types';

function GeneratorControls() {
  const gen = useActiveGenerator();
  const params = useStore((s) => s.params[s.generatorId]);
  const setParam = useStore((s) => s.setParam);

  const render = (c: ControlSpec) => {
    switch (c.kind) {
      case 'slider':
        return (
          <Slider
            key={c.key}
            label={c.label}
            min={c.min}
            max={c.max}
            step={c.step}
            unit={c.unit}
            value={params[c.key] as number}
            onChange={(v) => setParam(c.key, v)}
          />
        );
      case 'toggle':
        return (
          <Toggle
            key={c.key}
            label={c.label}
            checked={params[c.key] as boolean}
            onChange={(v) => setParam(c.key, v)}
          />
        );
      case 'select':
        return (
          <Select
            key={c.key}
            label={c.label}
            value={params[c.key] as string}
            options={c.options}
            onChange={(v) => setParam(c.key, v)}
          />
        );
    }
  };

  return <>{gen.controls.map(render)}</>;
}

/** Canvas format picker: aspect presets + custom width/height. */
function CanvasSection() {
  const canvasPresetId = useStore((s) => s.canvasPresetId);
  const setCanvas = useStore((s) => s.setCanvas);
  const GW = useStore((s) => s.GW);
  const GH = useStore((s) => s.GH);
  const [customW, setCustomW] = useState('1600');
  const [customH, setCustomH] = useState('1200');

  const applyCustom = (wStr: string, hStr: string) => {
    const w = parseFloat(wStr);
    const h = parseFloat(hStr);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return;
    const ar = Math.max(0.15, Math.min(6, w / h));
    const cells = aspectToCells(ar);
    setCanvas('custom', cells.GW, cells.GH);
  };

  return (
    <section className="side-section">
      <h2 className="side-heading">
        <span className="heading-dot heading-dot--teal" />
        Canvas
      </h2>
      <div className="side-rows">
        <Select
          value={canvasPresetId}
          options={CANVAS_PRESETS.map((cp) => ({ value: cp.id, label: cp.label }))}
          onChange={(id) => {
            const preset = CANVAS_PRESETS.find((cp) => cp.id === id);
            if (!preset) return;
            if (preset.aspect === null) {
              applyCustom(customW, customH);
            } else {
              const cells = aspectToCells(preset.aspect);
              setCanvas(id, cells.GW, cells.GH);
            }
          }}
        />
        {canvasPresetId === 'custom' ? (
          <div className="inline-field">
            <span className="control-label">W × H</span>
            <div className="custom-size">
              <input
                className="colorfield-hexinput"
                value={customW}
                inputMode="numeric"
                onChange={(e) => setCustomW(e.target.value)}
                onBlur={() => applyCustom(customW, customH)}
                onKeyDown={(e) => e.key === 'Enter' && applyCustom(customW, customH)}
                aria-label="Custom width"
              />
              <span className="control-label">×</span>
              <input
                className="colorfield-hexinput"
                value={customH}
                inputMode="numeric"
                onChange={(e) => setCustomH(e.target.value)}
                onBlur={() => applyCustom(customW, customH)}
                onKeyDown={(e) => e.key === 'Enter' && applyCustom(customW, customH)}
                aria-label="Custom height"
              />
            </div>
          </div>
        ) : null}
        <p className="side-note">
          {GW * 4} × {GH * 4} units · drawing is refitted on change
        </p>
      </div>
    </section>
  );
}

export function Sidebar() {
  const fileRef = useRef<HTMLInputElement>(null);

  const generatorId = useStore((s) => s.generatorId);
  const setGenerator = useStore((s) => s.setGenerator);
  const seed = useStore((s) => s.seed);
  const reroll = useStore((s) => s.reroll);

  const imported = useStore((s) => s.imported);
  const preprocess = useStore((s) => s.preprocess);
  const setPreprocess = useStore((s) => s.setPreprocess);
  const applyImportToMask = useStore((s) => s.applyImportToMask);
  const setImported = useStore((s) => s.setImported);

  const palette = useStore((s) => s.palette);
  const setPalette = useStore((s) => s.setPalette);
  const applyPreset = useStore((s) => s.applyPreset);
  const bgOn = useStore((s) => s.bgOn);
  const setBgOn = useStore((s) => s.setBgOn);
  const showToast = useStore((s) => s.showToast);
  const setViewMode = useStore((s) => s.setViewMode);

  const [exportSize, setExportSize] = useState('2048');
  const [exportPad, setExportPad] = useState(0);
  const [exportTransparent, setExportTransparent] = useState(false);

  const tweak = (patch: Parameters<typeof setPreprocess>[0]) => {
    setPreprocess(patch);
    // live re-extract without flooding the undo stack
    requestAnimationFrame(() => applyImportToMask(false));
  };

  const onImportFile = async (file: File) => {
    try {
      const img = await decodeImageFile(file);
      setImported(img);
      applyImportToMask(true);
      setViewMode('preview');
      showToast(`Imported ${file.name}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Import failed', true);
    }
  };

  const doExport = (kind: 'svg' | 'png') => {
    const out = generateCurrent({
      background: exportTransparent ? null : palette.bg,
      padding: exportPad,
    });
    if (!out) {
      showToast('Nothing to export yet — draw or import first', true);
      return;
    }
    const name = `gridforge-${generatorId}-${seed.toString(16)}`;
    if (kind === 'svg') {
      downloadSvg(out.svg, `${name}.svg`);
      showToast('SVG exported');
    } else {
      exportPng(out.svg, parseInt(exportSize, 10), `${name}.png`)
        .then(() => showToast(`PNG exported at ${exportSize}px`))
        .catch((e) => showToast(e.message, true));
    }
  };

  return (
    <aside className="sidebar">
      {/* ---------- 0 · CANVAS ---------- */}
      <CanvasSection />

      {/* ---------- 1 · IMPORT ---------- */}
      <section className="side-section">
        <h2 className="side-heading">
          <span className="heading-dot heading-dot--coral" />
          Import
        </h2>
        <div className="side-rows">
          <div className="import-btns">
            <button className="btn btn--sm" onClick={() => fileRef.current?.click()}>
              <IconImport size={12} />
              {imported ? 'Replace image…' : 'Import PNG / JPG / SVG…'}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/svg+xml,.svg"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onImportFile(f);
                e.target.value = '';
              }}
            />
          </div>
          {imported ? (
            <>
              <p className="import-meta">
                <b>{imported.name}</b>
                <br />
                {imported.width} × {imported.height}px
              </p>
              <p className="side-note">Image processing</p>
              <Select
                label="Extraction"
                value={preprocess.mode}
                options={[
                  { value: 'auto', label: 'Auto (detect)' },
                  { value: 'shape', label: 'Shape — threshold' },
                  { value: 'tone', label: 'Tone — dithered image' },
                ]}
                onChange={(v) => tweak({ mode: v as 'auto' | 'shape' | 'tone' })}
              />
              <Slider
                label="Threshold"
                min={0}
                max={255}
                value={preprocess.threshold}
                onChange={(v) => tweak({ threshold: v })}
              />
              <Slider
                label="Brightness"
                min={-100}
                max={100}
                value={preprocess.brightness}
                onChange={(v) => tweak({ brightness: v })}
              />
              <Slider
                label="Contrast"
                min={-100}
                max={100}
                value={preprocess.contrast}
                onChange={(v) => tweak({ contrast: v })}
              />
              <Slider
                label="Blur"
                min={0}
                max={4}
                value={preprocess.blur}
                onChange={(v) => tweak({ blur: v })}
              />
              <Slider
                label="Noise reduction"
                min={0}
                max={3}
                value={preprocess.denoise}
                onChange={(v) => tweak({ denoise: v })}
              />
              <Toggle
                label="Edge detect"
                checked={preprocess.edgeDetect}
                onChange={(v) => tweak({ edgeDetect: v })}
              />
              <Toggle
                label="Invert"
                checked={preprocess.invert}
                onChange={(v) => tweak({ invert: v })}
              />
              <Toggle
                label="Drop flat background"
                checked={preprocess.autoBackground}
                onChange={(v) => tweak({ autoBackground: v })}
              />
            </>
          ) : (
            <p className="side-note">
              Drop a file anywhere on the canvas, or use the button above. Flat backgrounds are
              removed automatically.
            </p>
          )}
        </div>
      </section>

      {/* ---------- 2 · GENERATOR ---------- */}
      <section className="side-section">
        <h2 className="side-heading">
          <span className="heading-dot" />
          Generator
        </h2>
        <div className="side-rows">
          <Select
            value={generatorId}
            options={GENERATORS.map((g) => ({ value: g.id, label: `${g.name} — ${g.tagline}` }))}
            onChange={(id) => {
              setGenerator(id);
              setViewMode('preview');
            }}
          />
          <div className="inline-field">
            <span className="side-note">Seed {seed.toString(16).padStart(8, '0')}</span>
            <button
              className="btn btn--sm"
              onClick={() => {
                reroll();
                setViewMode('preview');
              }}
              title="New random seed (R)"
            >
              <IconDice size={12} />
              Re-roll
            </button>
          </div>
        </div>
      </section>

      {/* ---------- 3 · SETTINGS ---------- */}
      <section className="side-section">
        <h2 className="side-heading">
          <span className="heading-dot heading-dot--teal" />
          Settings
        </h2>
        <div className="side-rows">
          <GeneratorControls />
        </div>
      </section>

      {/* ---------- 4 · THEME ---------- */}
      <section className="side-section">
        <h2 className="side-heading">
          <span className="heading-dot" />
          Theme
        </h2>
        <div className="side-rows">
          <div className="theme-list">
            {THEME_PRESETS.map((t) => {
              const active =
                t.palette.bg === palette.bg &&
                t.palette.primary === palette.primary &&
                t.palette.secondary === palette.secondary;
              return (
                <button
                  key={t.id}
                  className={`theme-card${active ? ' selected' : ''}`}
                  onClick={() => applyPreset(t)}
                >
                  <span className="theme-swatches" style={{ background: t.palette.bg }}>
                    <i style={{ background: t.palette.primary }} />
                    <i style={{ background: t.palette.secondary }} />
                  </span>
                  <span className="theme-name">{t.name}</span>
                </button>
              );
            })}
          </div>
          <ColorField
            label="Background"
            value={palette.bg}
            onChange={(hex) => setPalette({ bg: hex })}
          />
          <ColorField
            label="Primary"
            value={palette.primary}
            onChange={(hex) => setPalette({ primary: hex })}
          />
          <ColorField
            label="Secondary"
            value={palette.secondary}
            onChange={(hex) => setPalette({ secondary: hex })}
          />
          <Toggle label="Show background" checked={bgOn} onChange={setBgOn} />
        </div>
      </section>

      {/* ---------- 5 · EXPORT ---------- */}
      <section className="side-section">
        <h2 className="side-heading">
          <span className="heading-dot heading-dot--teal" />
          Export
        </h2>
        <div className="side-rows">
          <Select
            label="PNG resolution"
            value={exportSize}
            options={[
              { value: '512', label: '512 px' },
              { value: '1024', label: '1024 px' },
              { value: '2048', label: '2048 px' },
              { value: '4096', label: '4096 px' },
            ]}
            onChange={setExportSize}
          />
          <Slider label="Padding" min={0} max={128} value={exportPad} onChange={setExportPad} />
          <Toggle
            label="Transparent background"
            checked={exportTransparent}
            onChange={setExportTransparent}
          />
          <div className="export-btns">
            <button className="btn btn--sm btn--teal" onClick={() => doExport('svg')}>
              SVG
            </button>
            <button className="btn btn--sm btn--cyan" onClick={() => doExport('png')}>
              PNG
            </button>
          </div>
          <p className="side-note">SVG exports stay fully vectorised.</p>
        </div>
      </section>
    </aside>
  );
}
