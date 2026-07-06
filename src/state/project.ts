/** Project file save/open (.gridforge.json). Stores everything needed to
 *  reproduce the document: mask, tone/colour fields, canvas format,
 *  generator, parameters, theme and seed. */

import { useStore, type ProjectData } from './store';
import { downloadBlob } from '../exporters/svg';
import type { ParamValues, Palette } from '../types';

const FORMAT = 'gridforge-project';
const VERSION = 3;

interface ProjectFile {
  format: typeof FORMAT;
  version: number;
  GW: number;
  GH: number;
  mask: string; // base64
  tone?: string; // base64 (0..255 quantised)
  colors?: string; // base64 rgb triplets
  canvasPresetId?: string;
  generatorId: string;
  params: Record<string, ParamValues>;
  palette: Palette;
  bgOn: boolean;
  seed: number;
}

function encodeBytes(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

function decodeBytes(b64: string): Uint8Array {
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
    GW: s.GW,
    GH: s.GH,
    mask: encodeBytes(s.mask),
    canvasPresetId: s.canvasPresetId,
    generatorId: s.generatorId,
    params: s.params,
    palette: s.palette,
    bgOn: s.bgOn,
    seed: s.seed,
  };
  if (s.tone) {
    const q = new Uint8Array(s.tone.length);
    for (let i = 0; i < s.tone.length; i++) q[i] = Math.round(s.tone[i] * 255);
    file.tone = encodeBytes(q);
  }
  if (s.colors) file.colors = encodeBytes(s.colors);
  const blob = new Blob([JSON.stringify(file)], { type: 'application/json' });
  downloadBlob(blob, `gridforge-${Date.now().toString(36)}.gridforge.json`);
}

export async function openProject(file: File): Promise<void> {
  const text = await file.text();
  const data = JSON.parse(text) as ProjectFile;
  if (data.format !== FORMAT) throw new Error('Not a Gridforge project file');
  const GW = data.GW || 256;
  const GH = data.GH || 256;
  const mask = decodeBytes(data.mask);
  if (mask.length !== GW * GH) throw new Error('Corrupt project mask');

  let tone: Float32Array | null = null;
  if (data.tone) {
    const q = decodeBytes(data.tone);
    if (q.length === GW * GH) {
      tone = new Float32Array(q.length);
      for (let i = 0; i < q.length; i++) tone[i] = q[i] / 255;
    }
  }
  let colors: Uint8Array | null = null;
  if (data.colors) {
    const c = decodeBytes(data.colors);
    if (c.length === GW * GH * 3) colors = c;
  }

  // merge saved params over current defaults so new parameters keep working
  const s = useStore.getState();
  const params: Record<string, ParamValues> = { ...s.params };
  for (const [gid, p] of Object.entries(data.params ?? {})) {
    params[gid] = { ...params[gid], ...p };
  }

  const project: ProjectData = {
    GW,
    GH,
    mask,
    tone,
    colors,
    canvasPresetId: data.canvasPresetId ?? 'custom',
    generatorId: data.generatorId ?? 'circuit',
    params,
    palette: data.palette ?? s.palette,
    bgOn: data.bgOn ?? true,
    seed: data.seed ?? s.seed,
  };
  s.loadProject(project);
}
