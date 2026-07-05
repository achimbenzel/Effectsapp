/** Generator registry. To add a render mode: implement a GeneratorDef
 *  (see types.ts) and add it to the list below — the sidebar UI, params
 *  store and export pipeline pick it up automatically. */

import type { GeneratorDef } from '../types';
import { circuitGenerator } from './circuit';
import { marksGenerator } from './marks';
import { contoursGenerator } from './contours';
import { hatchingGenerator } from './hatching';

export const GENERATORS: GeneratorDef[] = [
  circuitGenerator,
  marksGenerator,
  contoursGenerator,
  hatchingGenerator,
];

export function getGenerator(id: string): GeneratorDef {
  return GENERATORS.find((g) => g.id === id) ?? GENERATORS[0];
}
