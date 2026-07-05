# Gridforge Studio

A desktop-grade creative web tool that unifies **Circuit Sketcher** and **Mark Sketcher**
into a single application: draw or import a shape, then grow procedural artwork inside
it — PCB-style circuit traces or blue-noise mark fields — and export it as crisp SVG or PNG.

Built with **TypeScript + React + Vite**, styled in a dark Frutiger-Aero design language
(glass surfaces, aqua glow, mono labels).

## Run

```bash
npm install
npm run dev        # development server
npm run build      # type-checked production build
npm run preview    # serve the production build
```

## Using the app

1. **Draw** — paint zones onto the pixel grid with pens 1–4 (viewport chips or keys `1..4`).
   Mirror modes, adjustable brush, undo/redo. Zone meaning depends on the generator
   (Circuit: traces / chips / parts).
2. **Import** — drop a PNG/JPG/SVG anywhere, or use the sidebar. Preprocessing controls
   (threshold, brightness, contrast, blur, edge detect, invert, denoise) re-extract the
   mask live; flat backgrounds are removed automatically.
3. **Generate** — the result re-renders in real time as you tweak parameters. `R` re-rolls
   the seed. Switch modes with the Draw/Result chips or `V`.
4. **Export** — vector SVG, or PNG at 512–4096 px, with padding and transparent-background
   options.

### Shortcuts

| Key | Action |
| --- | --- |
| `B` / `E` | brush / eraser |
| `1..4` | select pen zone |
| `[` / `]` | brush size |
| `Ctrl+Z` / `Ctrl+Shift+Z` | undo / redo |
| `R` | re-roll seed |
| `V` | toggle draw / result |
| `F` | fit to screen |
| `Space`+drag / wheel | pan / zoom |

## Architecture

```
src/
  types.ts               shared types (GeneratorDef, SvgDoc, ControlSpec…)
  core/                  seeded RNG, colour utilities
  mask/                  zone-mask operations (paint, resample, despeckle)
  raster/                image import + preprocessing pipeline
  generators/
    registry.ts          add new generators here
    circuit.ts           45°-trace growth (clearance, branching, chips, parts)
    marks.ts             mark fields (Poisson-disc / grid / hex layouts)
    sampling.ts          point-placement engines with min-distance guarantees
    markShapes.ts        dot/ring/square/diamond/triangle/cross/x/asterisk/line
  exporters/             SVG wrapper + PNG rasteriser
  state/store.ts         zustand store (document, history, params, palette)
  hooks/                 debounced live generation
  components/            topbar, viewport (zoom/pan/draw), sidebar, controls
```

**Adding a generator**: implement `GeneratorDef` (a pure
`generate(ctx, params) → SvgDoc` plus declarative control specs) and register it in
`generators/registry.ts`. The sidebar UI, parameter store, live preview and both export
paths pick it up automatically.
