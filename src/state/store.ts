/** Central application state (zustand).
 *
 *  Document model: an ink mask (Uint8Array) at ~4 SVG units per cell, plus
 *  optional tone/colour fields captured from tonal image imports. The
 *  canvas supports arbitrary aspect ratios; the long side is always
 *  DOC_LONG units / MASK_LONG cells. Drawing mutates the mask in place and
 *  bumps `maskRev`; undo/redo snapshots are taken per completed stroke or
 *  structural change. */

import { create } from 'zustand';
import type { ParamValues, Palette } from '../types';
import { GENERATORS } from '../generators/registry';
import { createMask, fillEmpty, resampleMask, type MirrorMode } from '../mask/maskOps';
import {
  DEFAULT_PREPROCESS,
  extractFromImage,
  type ImportedImage,
  type PreprocessParams,
} from '../raster/preprocess';
import { randomSeed } from '../core/rng';

export type ToolId = 'brush' | 'erase';
export type ViewMode = 'draw' | 'preview';

/** Document long side in SVG units / mask cells. */
export const DOC_LONG = 1024;
export const MASK_LONG = 256;
/** SVG units per mask cell. */
export const CELL = DOC_LONG / MASK_LONG;

export interface CanvasPreset {
  id: string;
  label: string;
  /** aspect = width / height; null = custom */
  aspect: number | null;
}

export const CANVAS_PRESETS: CanvasPreset[] = [
  { id: '1:1', label: 'Square 1:1', aspect: 1 },
  { id: '4:5', label: 'Portrait 4:5', aspect: 4 / 5 },
  { id: '16:9', label: 'Wide 16:9', aspect: 16 / 9 },
  { id: '9:16', label: 'Story 9:16', aspect: 9 / 16 },
  { id: 'a4p', label: 'A4 portrait', aspect: 1 / Math.SQRT2 },
  { id: 'a4l', label: 'A4 landscape', aspect: Math.SQRT2 },
  { id: 'custom', label: 'Custom…', aspect: null },
];

/** Convert an aspect ratio into cell dimensions (long side = MASK_LONG). */
export function aspectToCells(aspect: number): { GW: number; GH: number } {
  if (aspect >= 1) {
    return { GW: MASK_LONG, GH: Math.max(16, Math.round(MASK_LONG / aspect)) };
  }
  return { GW: Math.max(16, Math.round(MASK_LONG * aspect)), GH: MASK_LONG };
}

interface Snapshot {
  GW: number;
  GH: number;
  mask: Uint8Array;
  tone: Float32Array | null;
  colors: Uint8Array | null;
}

export interface ThemePreset {
  id: string;
  name: string;
  palette: Palette;
}

/** Professionally curated themes: background / geometry / accent. */
export const THEME_PRESETS: ThemePreset[] = [
  { id: 'mono', name: 'Monochrome', palette: { bg: '#0b0b0d', primary: '#f4f5f7', secondary: '#8f97a3' } },
  { id: 'technical', name: 'Technical Green', palette: { bg: '#0b2e1f', primary: '#5fd39a', secondary: '#c9f3de' } },
  { id: 'blueprint', name: 'Blueprint', palette: { bg: '#0d2e5c', primary: '#dce9f8', secondary: '#7fb0e8' } },
  { id: 'amber', name: 'Amber Terminal', palette: { bg: '#120c02', primary: '#ffb02e', secondary: '#ffd98a' } },
  { id: 'cyber', name: 'Cyber Blue', palette: { bg: '#060913', primary: '#5fc6e8', secondary: '#8fe3ff' } },
  { id: 'copper', name: 'Copper PCB', palette: { bg: '#0b2e1f', primary: '#d08a3c', secondary: '#e8c06a' } },
  { id: 'paper', name: 'Black on White', palette: { bg: '#f4f1ea', primary: '#1c1e22', secondary: '#5a6170' } },
];

export interface ProjectData {
  GW: number;
  GH: number;
  mask: Uint8Array;
  tone: Float32Array | null;
  colors: Uint8Array | null;
  canvasPresetId: string;
  generatorId: string;
  params: Record<string, ParamValues>;
  palette: Palette;
  bgOn: boolean;
  seed: number;
}

interface AppState {
  // ----- document -----
  GW: number;
  GH: number;
  canvasPresetId: string;
  mask: Uint8Array;
  /** Ink darkness 0..1 per cell (tonal imports only). */
  tone: Float32Array | null;
  /** RGB per cell (tonal imports only). */
  colors: Uint8Array | null;
  maskRev: number;

  // ----- drawing -----
  tool: ToolId;
  brushSize: number;
  mirror: MirrorMode;

  // ----- history -----
  undoStack: Snapshot[];
  redoStack: Snapshot[];

  // ----- generation -----
  generatorId: string;
  params: Record<string, ParamValues>;
  seed: number;
  palette: Palette;
  bgOn: boolean;

  // ----- import -----
  imported: ImportedImage | null;
  preprocess: PreprocessParams;

  // ----- view / ui -----
  viewMode: ViewMode;
  toast: { text: string; error?: boolean } | null;

  // ----- actions -----
  setTool(t: ToolId): void;
  setBrushSize(n: number): void;
  setMirror(m: MirrorMode): void;
  bumpMask(): void;
  pushUndo(): void;
  undo(): void;
  redo(): void;
  clearMask(): void;
  fillAll(): void;
  newDocument(): void;
  loadProject(data: ProjectData): void;
  setCanvas(presetId: string, GW: number, GH: number): void;
  setGenerator(id: string): void;
  setParam(key: string, value: ParamValues[string]): void;
  reroll(): void;
  setPalette(p: Partial<Palette>): void;
  applyPreset(preset: ThemePreset): void;
  setBgOn(on: boolean): void;
  setImported(img: ImportedImage | null): void;
  /** Import an image: the canvas aspect snaps to the image ratio, then the
   *  mask/tone/colour fields are extracted in one atomic update. */
  importImage(img: ImportedImage): void;
  setPreprocess(p: Partial<PreprocessParams>): void;
  applyImportToMask(pushUndo?: boolean): void;
  setViewMode(m: ViewMode): void;
  showToast(text: string, error?: boolean): void;
}

const MAX_UNDO = 50;

const defaultParams = (): Record<string, ParamValues> => {
  const out: Record<string, ParamValues> = {};
  for (const g of GENERATORS) out[g.id] = { ...g.defaults };
  return out;
};

const takeSnapshot = (s: Pick<AppState, 'GW' | 'GH' | 'mask' | 'tone' | 'colors'>): Snapshot => ({
  GW: s.GW,
  GH: s.GH,
  mask: new Uint8Array(s.mask),
  tone: s.tone ? Float32Array.from(s.tone) : null,
  colors: s.colors ? Uint8Array.from(s.colors) : null,
});

export const useStore = create<AppState>((set, get) => ({
  GW: MASK_LONG,
  GH: MASK_LONG,
  canvasPresetId: '1:1',
  mask: createMask(MASK_LONG, MASK_LONG),
  tone: null,
  colors: null,
  maskRev: 0,

  tool: 'brush',
  brushSize: 6,
  mirror: 'off',

  undoStack: [],
  redoStack: [],

  generatorId: 'circuit',
  params: defaultParams(),
  seed: randomSeed(),
  palette: THEME_PRESETS[0].palette,
  bgOn: true,

  imported: null,
  preprocess: { ...DEFAULT_PREPROCESS },

  viewMode: 'draw',
  toast: null,

  setTool: (tool) => set({ tool }),
  setBrushSize: (brushSize) => set({ brushSize }),
  setMirror: (mirror) => set({ mirror }),

  bumpMask: () => set((s) => ({ maskRev: s.maskRev + 1 })),

  pushUndo: () => {
    const s = get();
    const next = [...s.undoStack, takeSnapshot(s)];
    if (next.length > MAX_UNDO) next.shift();
    set({ undoStack: next, redoStack: [] });
  },

  undo: () => {
    const s = get();
    if (!s.undoStack.length) return;
    const snap = s.undoStack[s.undoStack.length - 1];
    set({
      undoStack: s.undoStack.slice(0, -1),
      redoStack: [...s.redoStack, takeSnapshot(s)],
      GW: snap.GW,
      GH: snap.GH,
      mask: new Uint8Array(snap.mask),
      tone: snap.tone ? Float32Array.from(snap.tone) : null,
      colors: snap.colors ? Uint8Array.from(snap.colors) : null,
      maskRev: s.maskRev + 1,
    });
  },

  redo: () => {
    const s = get();
    if (!s.redoStack.length) return;
    const snap = s.redoStack[s.redoStack.length - 1];
    set({
      redoStack: s.redoStack.slice(0, -1),
      undoStack: [...s.undoStack, takeSnapshot(s)],
      GW: snap.GW,
      GH: snap.GH,
      mask: new Uint8Array(snap.mask),
      tone: snap.tone ? Float32Array.from(snap.tone) : null,
      colors: snap.colors ? Uint8Array.from(snap.colors) : null,
      maskRev: s.maskRev + 1,
    });
  },

  clearMask: () => {
    get().pushUndo();
    const { GW, GH } = get();
    set({ mask: createMask(GW, GH), tone: null, colors: null, maskRev: get().maskRev + 1 });
  },

  fillAll: () => {
    get().pushUndo();
    const mask = new Uint8Array(get().mask);
    fillEmpty(mask);
    set({ mask, maskRev: get().maskRev + 1 });
  },

  newDocument: () =>
    set((s) => ({
      GW: MASK_LONG,
      GH: MASK_LONG,
      canvasPresetId: '1:1',
      mask: createMask(MASK_LONG, MASK_LONG),
      tone: null,
      colors: null,
      maskRev: s.maskRev + 1,
      undoStack: [],
      redoStack: [],
      params: defaultParams(),
      seed: randomSeed(),
      imported: null,
      preprocess: { ...DEFAULT_PREPROCESS },
      viewMode: 'draw',
    })),

  loadProject: (data) =>
    set((s) => ({
      GW: data.GW,
      GH: data.GH,
      canvasPresetId: data.canvasPresetId,
      mask: data.mask,
      tone: data.tone,
      colors: data.colors,
      maskRev: s.maskRev + 1,
      undoStack: [],
      redoStack: [],
      generatorId: data.generatorId,
      params: data.params,
      palette: data.palette,
      bgOn: data.bgOn,
      seed: data.seed,
      imported: null,
      viewMode: 'preview',
    })),

  setCanvas: (presetId, GW, GH) => {
    const s = get();
    if (GW === s.GW && GH === s.GH) {
      set({ canvasPresetId: presetId });
      return;
    }
    s.pushUndo();
    if (s.imported) {
      // re-extract the import so the image re-fits the new frame
      const r = extractFromImage(s.imported, GW, GH, s.preprocess);
      set({
        canvasPresetId: presetId,
        GW,
        GH,
        mask: r.mask,
        tone: r.tone,
        colors: r.colors,
        maskRev: s.maskRev + 1,
      });
    } else {
      set({
        canvasPresetId: presetId,
        GW,
        GH,
        mask: resampleMask(s.mask, s.GW, s.GH, GW, GH),
        tone: null,
        colors: null,
        maskRev: s.maskRev + 1,
      });
    }
  },

  setGenerator: (generatorId) => set({ generatorId }),

  setParam: (key, value) => {
    const { generatorId, params } = get();
    set({
      params: {
        ...params,
        [generatorId]: { ...params[generatorId], [key]: value },
      },
    });
  },

  reroll: () => set({ seed: randomSeed() }),

  setPalette: (p) => set((s) => ({ palette: { ...s.palette, ...p } })),
  applyPreset: (preset) => set({ palette: { ...preset.palette } }),
  setBgOn: (bgOn) => set({ bgOn }),

  setImported: (imported) => set({ imported }),

  importImage: (img) => {
    const s = get();
    s.pushUndo();
    const ar = Math.max(0.15, Math.min(6, img.width / Math.max(1, img.height)));
    const preset = CANVAS_PRESETS.find((cp) => cp.aspect !== null && Math.abs(cp.aspect - ar) < 0.01);
    const { GW, GH } = aspectToCells(ar);
    const r = extractFromImage(img, GW, GH, s.preprocess);
    set({
      imported: img,
      canvasPresetId: preset?.id ?? 'custom',
      GW,
      GH,
      mask: r.mask,
      tone: r.tone,
      colors: r.colors,
      maskRev: s.maskRev + 1,
      viewMode: 'preview',
    });
  },
  setPreprocess: (p) => set((s) => ({ preprocess: { ...s.preprocess, ...p } })),

  applyImportToMask: (pushUndo = true) => {
    const s = get();
    if (!s.imported) return;
    if (pushUndo) s.pushUndo();
    const r = extractFromImage(s.imported, s.GW, s.GH, s.preprocess);
    set({
      mask: r.mask,
      tone: r.tone,
      colors: r.colors,
      maskRev: get().maskRev + 1,
    });
  },

  setViewMode: (viewMode) => set({ viewMode }),

  showToast: (text, error) => {
    set({ toast: { text, error } });
    window.setTimeout(() => {
      if (get().toast?.text === text) set({ toast: null });
    }, 2600);
  },
}));

export function useActiveGenerator() {
  const generatorId = useStore((s) => s.generatorId);
  return GENERATORS.find((g) => g.id === generatorId) ?? GENERATORS[0];
}
