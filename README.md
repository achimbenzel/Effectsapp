# Gridforge Studio

A desktop-grade creative web tool: draw or import a shape, then grow procedural vector
artwork inside it — PCB-style circuit traces, blue-noise mark fields, topographic
contours or engraved hatching — and export it as crisp SVG or PNG.

Built with **TypeScript + React + Vite**, styled in a dark Frutiger-Aero design language
(glass surfaces, aqua glow, mono labels).

## Run

```bash
npm install
npm run dev        # development server
npm run build      # type-checked production build
npm run preview    # serve the production build
```

## Workflow

1. **Draw** — paint on the high-resolution ink canvas (brush, eraser, mirror modes,
   undo/redo). Drawing tools live in the toolbar above the canvas and appear only in
   Draw mode.
2. **Import** — drop a PNG/JPG/SVG anywhere, or use the sidebar. Image-processing
   controls (threshold, brightness, contrast, blur, edge detect, invert, denoise)
   re-extract the shape live; flat backgrounds are removed automatically.
3. **Generate** — pick a generator and tune it; the preview re-renders in real time and
   stays vector-crisp at any zoom. `R` re-rolls the seed.
4. **Export** — vector SVG, or PNG at 512–4096 px, with padding and transparent
   background. Projects can be saved/reopened as `.gridforge.json` files.

### Generators

| Generator | Idea |
| --- | --- |
| **Circuit** | 45° trace growth with procedural IC/part placement, clearance, branching |
| **Marks** | Poisson-disc / grid / hex mark fields with collision-free sizing & edge fade |
| **Contours** | Topographic iso-lines from a distance field, Chaikin-smoothed |
| **Hatching** | Angled engraving-style line fills, optional cross-hatch |

### Theme system

One three-colour theme drives everything: **background**, **primary** (geometry) and
**secondary** (accents). Curated presets: Monochrome (default), Technical Green,
Blueprint, Amber Terminal, Cyber Blue, Copper PCB, Black on White.

### Shortcuts

| Key | Action |
| --- | --- |
| `B` / `E` | brush / eraser |
| `[` / `]` | brush size |
| `Ctrl+Z` / `Ctrl+Shift+Z` | undo / redo |
| `Ctrl+S` | save project |
| `R` | re-roll seed |
| `V` | toggle draw / preview |
| `F` | fit to screen |
| `Space`+drag / wheel | pan / zoom |

## Architecture

```
src/
  types.ts               shared types (GeneratorDef, SvgDoc, ControlSpec…)
  core/                  seeded RNG, colour utilities, scalar fields
  mask/                  ink-mask operations (paint, resample, despeckle)
  raster/                image import + preprocessing pipeline
  generators/
    registry.ts          add new generators here
    circuit.ts           trace growth + procedural components
    marks.ts             mark fields (Poisson-disc / grid / hex layouts)
    contours.ts          marching-squares iso-lines over a distance field
    hatching.ts          angled line fills clipped to the shape
    sampling.ts          point-placement engines with min-distance guarantees
    markShapes.ts        dot/ring/square/diamond/triangle/cross/x/asterisk/line
  exporters/             SVG wrapper + PNG rasteriser
  state/                 zustand store + project save/open
  hooks/                 debounced live generation
  components/            topbar, canvas toolbar, viewport (zoom/pan/draw), sidebar
```

**Rendering**: the document is a fixed 256×256 ink mask; each generator picks its own
working resolution from it (the circuit router downsamples, marks sample it directly).
The preview lays the SVG out at its zoomed pixel size — no CSS-scale rasterisation —
so zooming stays sharp like professional design software.

**Adding a generator**: implement `GeneratorDef` (a pure
`generate(ctx, params) → SvgDoc` plus declarative control specs) and register it in
`generators/registry.ts`. The sidebar UI, parameter store, live preview and both export
paths pick it up automatically.
