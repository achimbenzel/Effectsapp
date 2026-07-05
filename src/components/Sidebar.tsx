/** Right-hand settings sidebar. Generator parameters are rendered from the
 *  active generator's declarative control specs, so new generators show up
 *  here with zero UI work. */

import { useRef } from 'react';
import { useStore, useActiveGenerator, PALETTE_PRESETS } from '../state/store';
import { GENERATORS } from '../generators/registry';
import { decodeImageFile } from '../raster/preprocess';
import { generateCurrent } from '../hooks/useGeneratedSvg';
import { downloadSvg } from '../exporters/svg';
import { exportPng } from '../exporters/png';
import { Slider } from './controls/Slider';
import { Select } from './controls/Select';
import { Toggle } from './controls/Toggle';
import { Seg } from './controls/Seg';
import { ColorField } from './controls/ColorField';
import { IconDice } from './icons';
import type { ControlSpec } from '../types';
import { useState } from 'react';

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

export function Sidebar() {
  const fileRef = useRef<HTMLInputElement>(null);

  const generatorId = useStore((s) => s.generatorId);
  const setGenerator = useStore((s) => s.setGenerator);
  const gen = useActiveGenerator();
  const seed = useStore((s) => s.seed);
  const reroll = useStore((s) => s.reroll);

  const brushSize = useStore((s) => s.brushSize);
  const setBrushSize = useStore((s) => s.setBrushSize);
  const mirror = useStore((s) => s.mirror);
  const setMirror = useStore((s) => s.setMirror);
  const G = useStore((s) => s.G);
  const setGrid = useStore((s) => s.setGrid);
  const fillAll = useStore((s) => s.fillAll);
  const clearMask = useStore((s) => s.clearMask);

  const imported = useStore((s) => s.imported);
  const preprocess = useStore((s) => s.preprocess);
  const setPreprocess = useStore((s) => s.setPreprocess);
  const applyImportToMask = useStore((s) => s.applyImportToMask);
  const setImported = useStore((s) => s.setImported);

  const palette = useStore((s) => s.palette);
  const setPalette = useStore((s) => s.setPalette);
  const setZoneColor = useStore((s) => s.setZoneColor);
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
      setViewMode('draw');
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
      {/* ---------- GENERATOR ---------- */}
      <section className="side-section">
        <h2 className="side-heading">
          <span className="heading-dot" />
          Generator
        </h2>
        <div className="side-rows">
          <Select
            value={generatorId}
            options={GENERATORS.map((g) => ({ value: g.id, label: `${g.name} — ${g.tagline}` }))}
            onChange={setGenerator}
          />
          <div className="inline-field">
            <span className="side-note">Seed {seed.toString(16).padStart(8, '0')}</span>
            <button className="btn btn--sm btn--teal" onClick={reroll}>
              <IconDice size={12} />
              Re-roll
            </button>
          </div>
          <GeneratorControls />
        </div>
      </section>

      {/* ---------- DRAWING ---------- */}
      <section className="side-section">
        <h2 className="side-heading">
          <span className="heading-dot heading-dot--teal" />
          Drawing
        </h2>
        <div className="side-rows">
          <Slider label="Brush size" min={1} max={8} value={brushSize} onChange={setBrushSize} />
          <Seg
            label="Mirror"
            value={mirror}
            options={[
              { value: 'off', label: 'Off' },
              { value: 'h', label: 'H' },
              { value: 'v', label: 'V' },
              { value: '4', label: '4-way' },
            ]}
            onChange={setMirror}
          />
          <Seg
            label="Grid resolution"
            value={String(G) as '64' | '128' | '256'}
            options={[
              { value: '64', label: '64' },
              { value: '128', label: '128' },
              { value: '256', label: '256' },
            ]}
            onChange={(v) => setGrid(parseInt(v, 10))}
          />
          <div className="export-btns">
            <button className="btn btn--sm" onClick={fillAll}>
              Fill all
            </button>
            <button className="btn btn--sm" onClick={clearMask}>
              Clear
            </button>
          </div>
          <p className="side-note">
            Pens 1–4 paint zones: {gen.zoneLabels.join(' · ')}
          </p>
        </div>
      </section>

      {/* ---------- IMPORT ---------- */}
      <section className="side-section">
        <h2 className="side-heading">
          <span className="heading-dot heading-dot--coral" />
          Import
        </h2>
        <div className="side-rows">
          <div className="import-btns">
            <button className="btn btn--sm" onClick={() => fileRef.current?.click()}>
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
            <p className="side-note">Drop a file anywhere on the canvas, or use the button above. Flat backgrounds are removed automatically.</p>
          )}
        </div>
      </section>

      {/* ---------- COLORS ---------- */}
      <section className="side-section">
        <h2 className="side-heading">
          <span className="heading-dot" />
          Colors
        </h2>
        <div className="side-rows">
          {gen.zoneLabels.map((label, i) => (
            <ColorField
              key={i}
              label={label}
              value={palette.zones[i]}
              onChange={(hex) => setZoneColor(i, hex)}
            />
          ))}
          <ColorField
            label="Accent (pads)"
            value={palette.accent}
            onChange={(hex) => setPalette({ accent: hex })}
          />
          <ColorField
            label="Background"
            value={palette.bg}
            onChange={(hex) => setPalette({ bg: hex })}
          />
          <Toggle label="Show background" checked={bgOn} onChange={setBgOn} />
          <div className="control">
            <div className="control-head">
              <span className="control-label">Presets</span>
            </div>
            <div className="colorchip-row">
              {PALETTE_PRESETS.map((p) => (
                <button
                  key={p.id}
                  className="colorchip-preset"
                  title={p.name}
                  onClick={() => applyPreset(p)}
                >
                  {p.palette.zones.map((z, i) => (
                    <span key={i} style={{ background: z }} />
                  ))}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ---------- EXPORT ---------- */}
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
          <Slider label="Padding" min={0} max={64} value={exportPad} onChange={setExportPad} />
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
