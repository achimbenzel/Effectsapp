/** Central application state (zustand).
 *
 *  The mask lives here as a mutable Uint8Array; drawing mutates it in place
 *  for performance and bumps `maskRev` to notify subscribers. Undo/redo
 *  snapshots are taken per completed stroke / structural change. */

import { create } from 'zustand';
import type { ParamValues, Palette, Zone } from '../types';
import { GENERATORS, getGenerator } from '../generators/registry';
import {
  createMask,
  resampleMask,
  fillEmpty,
  type MirrorMode,
} from '../mask/maskOps';
import {
  DEFAULT_PREPROCESS,
  imageToMask,
  type ImportedImage,
  type PreprocessParams,
} from '../raster/preprocess';
import { randomSeed } from '../core/rng';

export type ToolId = 'brush' | 'erase';
export type ViewMode = 'draw' | 'result';

interface Snapshot {
  G: number;
  mask: Uint8Array;
}

export interface PalettePreset {
  id: string;
  name: string;
  palette: Palette;
}

export const PALETTE_PRESETS: PalettePreset[] = [
  {
    id: 'classic',
    name: 'Classic copper',
    palette: {
      zones: ['#d08a3c', '#6fc2ff', '#ff8da1', '#84e0a8'],
      bg: '#0b2e1f',
      accent: '#e8c06a',
      chip: '#16181d',
      text: '#e8c06a',
    },
  },
  {
    id: 'midnight',
    name: 'Midnight',
    palette: {
      zones: ['#8fa8c4', '#5fc6e8', '#dde9f5', '#7fd4ff'],
      bg: '#0d1b2e',
      accent: '#dde9f5',
      chip: '#10141b',
      text: '#dde9f5',
    },
  },
  {
    id: 'neon',
    name: 'Neon',
    palette: {
      zones: ['#16e0a0', '#6fc2ff', '#ff8da1', '#f0c05a'],
      bg: '#08080c',
      accent: '#b9ffe7',
      chip: '#15151a',
      text: '#b9ffe7',
    },
  },
  {
    id: 'silkscreen',
    name: 'Silkscreen',
    palette: {
      zones: ['#33363b', '#4a5160', '#1c1f26', '#6b7280'],
      bg: '#f1ede4',
      accent: '#15171a',
      chip: '#23262c',
      text: '#f1ede4',
    },
  },
  {
    id: 'candy',
    name: 'Candy',
    palette: {
      zones: ['#ff8da1', '#6fc2ff', '#84e0a8', '#f0c05a'],
      bg: '#161226',
      accent: '#ffd98a',
      chip: '#1d1930',
      text: '#ffd98a',
    },
  },
  {
    id: 'aqua',
    name: 'Frutiger aqua',
    palette: {
      zones: ['#5fc6e8', '#54d6cf', '#5aa6e6', '#7fd4ff'],
      bg: '#071318',
      accent: '#93e6fb',
      chip: '#0f242d',
      text: '#93e6fb',
    },
  },
];

interface AppState {
  // ----- document -----
  G: number;
  mask: Uint8Array;
  maskRev: number;

  // ----- drawing -----
  tool: ToolId;
  zone: Zone;
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
  setZone(z: Zone): void;
  setBrushSize(n: number): void;
  setMirror(m: MirrorMode): void;
  setGrid(G: number): void;
  bumpMask(): void;
  pushUndo(): void;
  undo(): void;
  redo(): void;
  clearMask(): void;
  fillAll(): void;
  setGenerator(id: string): void;
  setParam(key: string, value: ParamValues[string]): void;
  reroll(): void;
  setPalette(p: Partial<Palette>): void;
  setZoneColor(i: number, hex: string): void;
  applyPreset(preset: PalettePreset): void;
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
  G: 64,
  mask: createMask(64),
  maskRev: 0,

  tool: 'brush',
  zone: 1,
  brushSize: 2,
  mirror: 'off',

  undoStack: [],
  redoStack: [],

  generatorId: 'circuit',
  params: defaultParams(),
  seed: randomSeed(),
  palette: PALETTE_PRESETS[0].palette,
  bgOn: true,

  imported: null,
  preprocess: { ...DEFAULT_PREPROCESS },

  viewMode: 'draw',
  toast: null,

  setTool: (tool) => set({ tool }),
  setZone: (zone) => set({ zone, tool: 'brush' }),
  setBrushSize: (brushSize) => set({ brushSize }),
  setMirror: (mirror) => set({ mirror }),

  setGrid: (newG) => {
    const { G, mask } = get();
    if (newG === G) return;
    get().pushUndo();
    set({ G: newG, mask: resampleMask(mask, G, newG), maskRev: get().maskRev + 1 });
  },

  bumpMask: () => set((s) => ({ maskRev: s.maskRev + 1 })),

  pushUndo: () => {
    const { G, mask, undoStack } = get();
    const next = [...undoStack, { G, mask: new Uint8Array(mask) }];
    if (next.length > MAX_UNDO) next.shift();
    set({ undoStack: next, redoStack: [] });
  },

  undo: () => {
    const { undoStack, redoStack, G, mask } = get();
    if (!undoStack.length) return;
    const snap = undoStack[undoStack.length - 1];
    set({
      undoStack: undoStack.slice(0, -1),
      redoStack: [...redoStack, { G, mask: new Uint8Array(mask) }],
      G: snap.G,
      mask: new Uint8Array(snap.mask),
      maskRev: get().maskRev + 1,
    });
  },

  redo: () => {
    const { undoStack, redoStack, G, mask } = get();
    if (!redoStack.length) return;
    const snap = redoStack[redoStack.length - 1];
    set({
      redoStack: redoStack.slice(0, -1),
      undoStack: [...undoStack, { G, mask: new Uint8Array(mask) }],
      G: snap.G,
      mask: new Uint8Array(snap.mask),
      maskRev: get().maskRev + 1,
    });
  },

  clearMask: () => {
    get().pushUndo();
    set({ mask: createMask(get().G), maskRev: get().maskRev + 1 });
  },

  fillAll: () => {
    get().pushUndo();
    const mask = new Uint8Array(get().mask);
    fillEmpty(mask);
    set({ mask, maskRev: get().maskRev + 1 });
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
  setZoneColor: (i, hex) =>
    set((s) => {
      const zones = [...s.palette.zones] as Palette['zones'];
      zones[i] = hex;
      return { palette: { ...s.palette, zones } };
    }),
  applyPreset: (preset) => set({ palette: { ...preset.palette } }),
  setBgOn: (bgOn) => set({ bgOn }),

  setImported: (imported) => set({ imported }),
  setPreprocess: (p) => set((s) => ({ preprocess: { ...s.preprocess, ...p } })),

  applyImportToMask: (pushUndo = true) => {
    const { imported, G, preprocess } = get();
    if (!imported) return;
    if (pushUndo) get().pushUndo();
    set({
      mask: imageToMask(imported, G, preprocess),
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
  return getGenerator(generatorId);
}
