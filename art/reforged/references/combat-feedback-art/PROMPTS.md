# Combat-feedback production reference

Batch 32 used one original OpenAI built-in image-generation result as a
visual-development input. The unaltered 1536x1024 PNG is retained beside this
document as `combat-feedback-production-reference.png`. Generation ID:
`exec-acedef78-2adb-45cf-9953-e6a9a1d2051b`.
SHA-256: `09ddc3878df4673f46b2bde1072b716491265315ea216dfb6c02ebe81dd2c40b`.

The reference is not a runtime input. Deterministic project geometry in
`tools/reforged-assets/create-combat-feedback-art-sources.mjs` is the sole
source of canonical production pixels. No Batch 25 golden, third-party image,
source archive, logo, trademark, or generated-image cache enters runtime.

## Prompt

```text
Use case: original AI-assisted production concept reference for a top-down 2D multiplayer arena game's modern combat-feedback art pipeline. Create one landscape visual-development board on a dark neutral background, with clearly separated clusters of effects but absolutely no text, labels, logos, UI chrome, sprite-sheet grid, atlas layout, game characters, weapons, or environment scenes. Show a coherent high-contrast graphic-novel/arcade effect language using an ink-black outline, warm cream cores, restrained cyan, amber, coral-red, mint-green, steel-blue, violet, and gold accents. Include visual motifs for: four-direction muzzle bursts; directional scenery impacts with dust/chips; clearly distinct confirmed-player impacts with a bright decisive contact star and short directional streak; a circular explosion with a legible fixed-radius ring plus bounded smoke/debris; healing as a mint pulse/cross-like restorative sparkle without medical branding; armor as a steel-blue shield pulse; six distinct fighter ability-release motifs (gold heroic shock burst, coral fire fan, cyan frost crystal, amber heavy ground shock, violet axe-arc release, steel-blue defensive brace); six progressively richer rarity badge/shape motifs that do not imply gameplay stats; a zone boundary/warning ring; and a clean elimination cue with a collapsing silhouette-like burst. Preserve unmistakable impact points, travel direction, radius/boundary, warning hierarchy, short timing, and readable silhouettes. Effects must remain readable at tiny gameplay scale and in grayscale; use bounded particles only, minimal glow, no bloom-dependent details, no photorealism, no gradients that erase edges, no copyrighted character likenesses. This is a visual reference only, not a ready-to-use runtime asset or sprite sheet.
```

## Inspection

The reference was inspected at full size, mobile width, grayscale, and
gameplay scale. Directional contact points, explosion radius, restorative and
armor identities, fighter-release silhouettes, rarity shapes, zone warning,
and elimination sequence remain separable without bloom. The canonical source
sheet and packed atlas receive separate exact-grid, timing, registration,
palette, grayscale, bounded-overdraw, and runtime-metadata checks.
