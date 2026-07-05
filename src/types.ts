/** Shared types used across mask, generators, rendering and export. */

/** Cell value inside the pixel mask: 0 = empty, 1 = inked. Generators may
 *  internally derive richer zones (e.g. circuit component placement). */
export type Zone = 0 | 1 | 2 | 3 | 4;

/** A fully generated vector document, ready to be wrapped in an <svg> root. */
export interface SvgDoc {
  /** Document size in SVG user units (square). */
  size: number;
  /** Inner markup (no <svg> root, no background rect). */
  body: string;
  /** Optional <style> content scoped to the document. */
  css?: string;
}

/** Three-colour theme shared by all generators.
 *  primary   → geometry (lines, marks, traces)
 *  secondary → accents (pads, highlights, labels)
 *  bg        → paper / board colour */
export interface Palette {
  bg: string;
  primary: string;
  secondary: string;
}

/** Read-only context handed to a generator run. */
export interface GeneratorContext {
  /** Ink mask, row-major, length G*G. */
  mask: Uint8Array;
  /** Mask grid dimension. */
  G: number;
  /** SVG units per mask cell. */
  S: number;
  /** Document size in SVG units (G*S). */
  size: number;
  /** Seeded PRNG in [0,1). */
  rnd: () => number;
  palette: Palette;
}

/** Declarative sidebar control definitions — generators describe their
 *  parameters as data and the sidebar renders them automatically. */
export type ControlSpec =
  | {
      kind: 'slider';
      key: string;
      label: string;
      min: number;
      max: number;
      step?: number;
      unit?: string;
    }
  | { kind: 'toggle'; key: string; label: string }
  | {
      kind: 'select';
      key: string;
      label: string;
      options: { value: string; label: string }[];
    };

export type ParamValues = Record<string, number | boolean | string>;

/** A pluggable generator. Add new render modes by implementing this and
 *  registering the instance in generators/registry.ts. */
export interface GeneratorDef {
  id: string;
  name: string;
  /** Short subtitle shown in the generator picker. */
  tagline: string;
  defaults: ParamValues;
  controls: ControlSpec[];
  generate(ctx: GeneratorContext, params: ParamValues): SvgDoc;
}
