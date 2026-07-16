# Modern UI production reference

Batch 27 translates the approved
`docs/reforged/style-bible/golden/ui-weapons-rarity-language.png` direction into
one compact project-owned UI atlas. The golden remains an immutable
documentation reference and is not copied, cropped, sampled, or packed.

The production set keeps only the visual grammar needed by current client UI:

- soot-navy chamfered panel, HUD, Results, and tactical-map frames;
- tab, card, secondary, amber-primary, and red-danger state families;
- strong teal focus, amber active/pressed treatment, and visibly distinct
  disabled treatment;
- Play, Fighters, Challenges, Records, Settings, party, queue, minimap, HUD,
  Results, vitality, ammo, objective, focus, and warning icons; and
- clean condensed system typography selected in client code, with no raster
  labels and no shop, currency, upgrade, purchase, or unlock-economy language.

`tools/reforged-assets/create-modern-ui-sources.mjs` is the durable original
geometry source. It generates the two canonical PNG sheets deterministically;
the Batch 26 packer remains the only path from those sheets to runtime output.
The UI set contains no fighter, weapon, pickup, biome, combat-effect, or map art.
