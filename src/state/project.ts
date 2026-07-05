/** Project file save/open (.gridforge.json). Stores everything needed to
 *  reproduce the document: mask, generator, parameters, theme and seed. */

import { useStore, MASK_G, type ProjectData } from './store';
import { resampleMask } from '../mask/maskOps';
import { downloadBlob } from '../exporters/svg';
import type { ParamValues, Palette } from '../types';

const FORMAT = 'gridforge-project';
const VERSION = 2;

interface ProjectFile {
  format: typeof FORMAT;
  version: number;
  G: number;
  mask: string; // base64
  generatorId: string;
  params: Record<string, ParamValues>;
  palette: Palette;
  bgOn: boolean;
  seed: number;
}

function encodeMask(mask: Uint8Array): string {
  let s = '';
  for (let i = 0; i < mask.length; i += 0x8000) {
    s += String.fromCharCode(...mask.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

function decodeMask(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function saveProject(): void {
  const s = useStore.getState();
  const file: ProjectFile = {
    format: FORMAT,
    version: VERSION,
    G: MASK_G,
    mask: encodeMask(s.mask),
    generatorId: s.generatorId,
    params: s.params,
    palette: s.palette,
    bgOn: s.bgOn,
    seed: s.seed,
  };
  const blob = new Blob([JSON.stringify(file)], { type: 'application/json' });
  downloadBlob(blob, `gridforge-${Date.now().toString(36)}.gridforge.json`);
}

export async function openProject(file: File): Promise<void> {
  const text = await file.text();
  const data = JSON.parse(text) as ProjectFile;
  if (data.format !== FORMAT) throw new Error('Not a Gridforge project file');
  let mask = decodeMask(data.mask);
  const G = data.G || MASK_G;
  if (G !== MASK_G) mask = resampleMask(mask, G, MASK_G);
  if (mask.length !== MASK_G * MASK_G) throw new Error('Corrupt project mask');

  // merge saved params over current defaults so new parameters keep working
  const s = useStore.getState();
  const params: Record<string, ParamValues> = { ...s.params };
  for (const [gid, p] of Object.entries(data.params ?? {})) {
    params[gid] = { ...params[gid], ...p };
  }

  const project: ProjectData = {
    mask,
    generatorId: data.generatorId ?? 'circuit',
    params,
    palette: data.palette ?? s.palette,
    bgOn: data.bgOn ?? true,
    seed: data.seed ?? s.seed,
  };
  s.loadProject(project);
}
