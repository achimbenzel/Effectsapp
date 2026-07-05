/** Central application state (zustand).
 *
 *  The mask lives here as a mutable Uint8Array; drawing mutates it in place
 *  for performance and bumps `maskRev` to notify subscribers. Undo/redo
 *  snapshots are taken per completed stroke / structural change.
 *
 *  The document works on a fixed high-resolution 256×256 ink mask — fine
 *  enough for detailed imports; generators choose their own working
 *  resolution from it (e.g. the circuit router downsamples). */

import { create } from 'zustand';
import type { ParamValues, Palette } from '../types';
import { GENERATORS } from '../generators/registry';
import { createMask, fillEmpty, type MirrorMode } from '../mask/maskOps';
import {
  DEFAULT_PREPROCESS,
  imageToMask,
  type ImportedImage,
  type PreprocessParams,
} from '../raster/preprocess';
import { randomSeed } from '../core/rng';

export type ToolId = 'brush' | 'erase';
export type ViewMode = 'draw' | 'preview';

/** Fixed mask resolution. */
export const MASK_G = 256;

interface Snapshot {
  mask: Uint8Array;
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
  mask: Uint8Array;
  generatorId: string;
  params: Record<string, ParamValues>;
  palette: Palette;
  bgOn: boolean;
  seed: number;
}

interface AppState {
  // ----- document -----
  mask: Uint8Array;
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
  setGenerator(id: string): void;
  setParam(key: string, value: ParamValues[string]): void;
  reroll(): void;
  setPalette(p: Partial<Palette>): void;
  applyPreset(preset: ThemePreset): void;
  setBgOn(on: boolean): void;
  setImported(img: ImportedImage | null): void;
  setPreprocess(p: Partial<PreprocessParams>): void;
  applyImportToMask(pushUndo?: boolean): void;
  setViewMode(m: ViewMode): void;
  showToast(text: string, error?: boolean): void;
}

const MAX_UNDO = 60;

const defaultParams = (): Record<string, ParamValues> => {
  const out: Record<string, ParamValues> = {};
  for (const g of GENERATORS) out[g.id] = { ...g.defaults };
  return out;
};

export const useStore = create<AppState>((set, get) => ({
  mask: createMask(MASK_G),
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
    const { mask, undoStack } = get();
    const next = [...undoStack, { mask: new Uint8Array(mask) }];
    if (next.length > MAX_UNDO) next.shift();
    set({ undoStack: next, redoStack: [] });
  },

  undo: () => {
    const { undoStack, redoStack, mask } = get();
    if (!undoStack.length) return;
    const snap = undoStack[undoStack.length - 1];
    set({
      undoStack: undoStack.slice(0, -1),
      redoStack: [...redoStack, { mask: new Uint8Array(mask) }],
      mask: new Uint8Array(snap.mask),
      maskRev: get().maskRev + 1,
    });
  },

  redo: () => {
    const { undoStack, redoStack, mask } = get();
    if (!redoStack.length) return;
    const snap = redoStack[redoStack.length - 1];
    set({
      redoStack: redoStack.slice(0, -1),
      undoStack: [...undoStack, { mask: new Uint8Array(mask) }],
      mask: new Uint8Array(snap.mask),
      maskRev: get().maskRev + 1,
    });
  },

  clearMask: () => {
    get().pushUndo();
    set({ mask: createMask(MASK_G), maskRev: get().maskRev + 1 });
  },

  fillAll: () => {
    get().pushUndo();
    const mask = new Uint8Array(get().mask);
    fillEmpty(mask);
    set({ mask, maskRev: get().maskRev + 1 });
  },

  newDocument: () =>
    set({
      mask: createMask(MASK_G),
      maskRev: get().maskRev + 1,
      undoStack: [],
      redoStack: [],
      params: defaultParams(),
      seed: randomSeed(),
      imported: null,
      preprocess: { ...DEFAULT_PREPROCESS },
      viewMode: 'draw',
    }),

  loadProject: (data) =>
    set({
      mask: data.mask,
      maskRev: get().maskRev + 1,
      undoStack: [],
      redoStack: [],
      generatorId: data.generatorId,
      params: data.params,
      palette: data.palette,
      bgOn: data.bgOn,
      seed: data.seed,
      imported: null,
      viewMode: 'preview',
    }),

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
  setPreprocess: (p) => set((s) => ({ preprocess: { ...s.preprocess, ...p } })),

  applyImportToMask: (pushUndo = true) => {
    const { imported, preprocess } = get();
    if (!imported) return;
    if (pushUndo) get().pushUndo();
    set({
      mask: imageToMask(imported, MASK_G, preprocess),
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
