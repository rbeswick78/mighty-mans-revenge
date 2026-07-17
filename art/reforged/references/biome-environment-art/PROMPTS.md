# Biome environment production reference

Batch 31 used one original OpenAI built-in image-generation result as a
visual-development input. The unaltered 1536x1024 PNG is retained beside this
document as `biome-environment-production-reference.png` with SHA-256
`916762c20ab4c9dee516bb8a8930304e8b768b2a5a638f3512f66df30cb9f4f2`.
Generation ID: `exec-bad498a8-bd8f-4c89-a4c7-266d172a9fe3`.

The reference is not a runtime input. Deterministic project geometry in
`tools/reforged-assets/create-biome-environment-art-sources.mjs` is the sole
source of canonical production pixels. No Batch 25 golden, third-party image,
source archive, logo, trademark, or generated-image cache enters runtime.

## Prompt

```text
Use case: stylized-concept
Asset type: original visual-development production reference for a browser game biome environment kit; reference only, not runtime pixels
Primary request: Create one original production-minded reference sheet for a coherent modular top-down environment kit spanning exactly four biome families: wasteland, overgrown, industrial, and irradiated. Each equal quadrant must show a small seam-tiled 48px-grid terrain patch, full-collision wall modules, lower/lighter low-cover modules, intact and damaged presentation counterparts, compact props, one landmark with preserved negative space, short consistent southeast graphic shadows, and family-to-family transition pieces at the shared inner borders.
Style/medium: browser-efficient stylized-comic 2D game concept art; bold controlled ink, two or three matte value bands, restrained dry-brush wear, chunky reusable modular forms, clean top-down/three-quarter game camera near 60 degrees; not pixel art, photorealistic, or 3D.
Composition/framing: landscape reference board with four equal labeled-by-layout but text-free quadrants and clear gutters; show modular pieces isolated as well as assembled; no horizon scenes. Wasteland: tobacco dust, sun-baked masonry, bone dust, scrap, warm rust. Overgrown: damp green concrete, vines, oxidized teal, reclaimed suburb mass. Industrial: red oxide, steel, hazard amber, hard modular geometry. Irradiated: charcoal/black-glass ground, sick mineral green, restrained violet contamination, bounded danger accents.
Gameplay readability: quiet low-contrast walkable ground; unmistakable darkest/heaviest full collision; medium-contour visibly lower low cover; restrained decoration; compact high-contrast cyan or amber navigation anchors; silhouettes must survive grayscale, mobile width, and gameplay scale; hue is never the only carrier of meaning.
Constraints: exactly four biome families; identical modular drawing/collision language; seamless edge continuity; exact square-cell registration implied; matching intact/damaged pairs; stable prop footprints; landmark negative space; compatible transition seams; bounded emissive accents with no bloom-dependent readability; no fighters required; no text, logos, trademarks, watermark, UI, weapons, loot, containers, hazards, map layouts, objectives beyond neutral navigation-anchor examples, production sprite sheets, or atlas output. Do not imitate or include named franchises or third-party art.
```

## Inspection

The reference was inspected at full size and reduced to mobile-width and
gameplay-scale views. All four families remain distinct; full walls retain the
heaviest mass; low cover remains lower and lighter; quiet ground does not form
false collision; intact/damaged pairs share footprints; southeast shadows stay
presentation-only; cyan/amber anchors and landmark openings survive grayscale.
The deterministic source sheets and packed atlas receive separate seam-tile,
registration, palette, footprint, and grayscale checks.
