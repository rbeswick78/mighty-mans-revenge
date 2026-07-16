# Reforged Style Bible Provenance

This manifest records every Batch 25 raster candidate. The approved references
were created with the OpenAI built-in image-generation path on 2026-07-16. No
CLI fallback, API key, external style image, franchise reference, or third-party
image input was used.

The prompts were informed only by checked-in game contracts: the six roster
identities, established biome/map families, Reforged design tokens, locked
rarity colors, existing quality tiers, and the roadmap's browser/mobile rules.
The generated files are documentation references and are not loaded by the
client.

## Artifact manifest

| Artifact                                          | Method and lineage                                                                                            | Dimensions | SHA-256                                                            | Disposition                                                             |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ---------: | ------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| `golden/fighters-identity-silhouettes.png`        | Built-in text-to-image; generation `exec-9a55cb96-4fbd-4f75-aede-e905f5dec51b`                                |  1536x1024 | `01d53f462ccc79252065f16ecd4397ef64539e0b1bacea98400faf5f808089ef` | Approved                                                                |
| `golden/biome-environment-families.png`           | Built-in text-to-image; generation `exec-59a70a34-6c21-473c-a6d6-382b8a7117a1`                                |  1536x1024 | `4c39f8c2610a47c8c2c82e81c76723484dec68b619c38f986573e426049cf295` | Approved                                                                |
| `golden/ui-weapons-rarity-language.png`           | Built-in image edit of the original Batch 25 candidate only; edit `exec-d4910819-7f3c-4b15-9fa6-c7789d75300f` |  1536x1024 | `f3eff1913a0c6520fc0fbf0494406e8d7600cc7c26780635b84c7d77566712b4` | Approved after text-only correction                                     |
| `golden/rendering-lighting-motion-principles.png` | Built-in text-to-image; generation `exec-fb6eeda3-ecdf-4d58-bb18-4faf5c88153c`                                |  1536x1024 | `d09ae59f06ed0e84c6d1312653b4a378dd666165d117a3bdea557ebca4df31f4` | Approved                                                                |
| `rejected/ui-weapons-rarity-v0-shop-labels.png`   | Built-in text-to-image; generation `exec-22191f3d-292b-4145-b246-7544a953ab8c`                                |  1536x1024 | `d63025d596345457c41977fcdf494ad58c0367634e6df7fa91526e363a819d0c` | Rejected: generic `SHOP`/economy language violated locked product scope |

The generated-image cache paths under `.codex/generated_images` are execution
artifacts, not project dependencies. The copied in-repo files and hashes above
are the durable source of truth.

## Prompt specifications

### Fighters

```text
Use case: stylized-concept
Asset type: golden visual-development reference sheet for a browser game; fighter identity and silhouette sheet
Primary request: Create one original, production-minded reference sheet for the complete six-fighter roster of Mighty Man's Revenge, shown as modernized recognizable identities for a stylized-comic top-down 2D shooter. Arrange six equal character columns with one large three-quarter full-body hero pose, one solid black silhouette, and two tiny top-down gameplay-scale poses per fighter.

Identity anchors:
1) Mighty Man: balanced human wasteland survivor and rifleman; lean athletic proportions; close-cropped dark hair; pale bone face guard or goggles; compact amber scarf; dark utility jacket; practical rifle silhouette; steady square stance; x-ray cyan accent.
2) Bruce: compact stocky undead fire-breather; ashen violet-grey skin; torn dark work clothes; broad jaw and heavy hands; hunched forward silhouette; no gun; ember-orange throat/chest accent; dangerous but readable rather than gruesome.
3) Frost Wizard: fast fragile human ice caster from the same survivor culture as Mighty Man; slim long-limbed silhouette; layered cyan/indigo winter wraps; angular frost hood; short wand; low icy mist; no gun.
4) Bubba: huge slow undead tank; tallest and widest silhouette; massive shoulders and forearms; patched blue-grey industrial overalls and scrap-metal forearm plates; heavy planted posture; no gun; steel-blue Iron Hide accent.
5) Jack: wiry undead axe skirmisher; narrow angular frame; tattered rust-red work coat; unmistakable long-handled hand axe; asymmetric profile that reads when the axe is absent; muted sickly skin; no gun.
6) Rook: fastest human flanker; compact forward-leaning silhouette; green-tinted full scavenger helmet with round lenses and short ridge; light tactical coat; rifle carried close; paired forward chevrons; teal-green dash accent.

Style/medium: original browser-efficient stylized comic 2D concept art; bold controlled ink contour; simplified cel shading; matte textures; chunky readable shapes; limited detail; subtle dry-brush edge wear; not pixel art, photorealistic, or 3D.
Composition/framing: landscape board on warm off-white paper; six separated columns; consistent ground line and scale; body mass and carried-object identity must differ; tiny top-down poses readable at 48-72 CSS pixels.
Lighting/mood: neutral warm key with restrained cool shadow; no cinematic darkness.
Color palette: soot navy, bone, rust, faded amber, oxidized teal, cold cyan, steel blue, muted toxic green; one unique fighter accent in a shared world palette.
Line hierarchy: strongest outer contour, medium material breaks, minimal fine lines; tiny poses use only contour and one or two color masses.
Constraints: exactly six fighters; no duplicates or extras; no text required; no logos, trademarks, watermark, franchise costumes, or photoreal gore; preserve anchors and relative body masses; reference art only, not a sprite sheet or atlas.
```

### Biome environment families

```text
Use case: stylized-concept
Asset type: golden visual-development reference sheet for a browser game; environment and biome family sheet
Primary request: Create one original, production-minded reference sheet defining four coherent biome families for a stylized-comic top-down 2D arena shooter. Show four equal quadrants, each with a wide three-quarter vignette, a top-down tile/prop cluster, a simplified collision-readability strip for walkable ground, low cover, full collision, destructible/interactable props, and objective space, plus a tiny minimap-like block.

Families:
1) Wasteland: sun-bleached tobacco earth, cracked concrete, bone dust, rusted road barriers, low sandbag/scrap cover, amber heat, cyan objective contrast.
2) Overgrown: faded suburb asphalt/concrete reclaimed by moss, vines, pale grass, collapsed fences and cars; green stays darker and quieter than fighters/objectives.
3) Industrial: scrapyard/refinery/checkpoint language with oxidized steel, corrugated red or charcoal roofs, reinforced barricades, pipes, containers, warning chevrons, readable gates and explosive barrels.
4) Irradiated: contaminated badlands with black glass, sulfur dust, chartreuse fissures, cyan containment lights, magenta traces; atmosphere never disguises collision.

Style/medium: original browser-efficient stylized comic 2D; hand-inked contour, simplified cel-shaded material masses, matte dry-brush texture, chunky reusable modular forms; not pixel art, photorealistic, or 3D.
Composition/framing: landscape neutral-bone board; four separated quadrants; high three-quarter/top-down game camera near 60 degrees; no horizon-dominant scenes.
Gameplay readability: low-contrast low-detail ground; medium-contour low cover; darkest thick-contour full collision; compact cyan/amber objectives; restrained interactable marks; fighters retain highest local contrast.
Lighting/mood: neutral daylight baseline with one alternative swatch per biome; short soft graphic shadows do not imply collision.
Color palette: shared soot navy/bone/rust/oxidized teal base with one biome accent; value separation does not rely on hue.
Constraints: exactly four families; optional anonymous scale silhouettes only; no production tiles, atlas, text requirement, logos, trademarks, or watermark; feasible for later 48px modular tiles and browser/mobile rendering; golden reference, not an asset pack or authored map.
```

### UI, six-gun, and rarity candidate

```text
Use case: stylized-concept
Asset type: golden visual-development reference sheet for a browser game; UI, six-gun, pickup, and rarity visual language
Primary request: Create one original production-minded sheet with three coordinated zones.
A) UI language: restrained 16:9 HUD fragment, menu tab/card/button family, objective badge, minimap frame, health/armor/ammo bars, focus and disabled states; sturdy chamfered scrap-metal geometry, bone labels, soot navy surfaces, thin oxidized-teal focus, amber primary action, strong spacing, minimal ornament, mobile-safe targets; modern rather than retro pixel UI.
B) Six-gun language: side-profile and tiny top-down silhouettes for rifle, pistol, shotgun, SMG, sniper rifle, and launcher; shared rugged improvised industrial family; unmistakable small-scale proportions; one held and one ground silhouette per gun.
C) Rarity language: same compact pickup through Common grey, Uncommon green, Rare blue, Epic purple, Legendary orange, Mythical red; compact badge/rim/aura shape rather than full repaint; common none, uncommon underline, rare orbit ticks, epic facets, legendary three-ray crown, mythical double-chevron halo.
Style/medium: original browser-efficient stylized comic 2D sheet; crisp bold ink, simplified cel shading, flat matte surfaces, controlled texture, clean UI plus illustrated props; not pixel art, photorealistic, or 3D.
Composition/framing: landscape neutral-bone board with gutters and full/tiny examples.
Lighting/mood: neutral studio reference; emissive rarity effects never obscure silhouette or text.
Color hierarchy: soot navy, warm bone, muted steel, cyan/teal information/focus, amber action/objective, red reserved for danger/Mythical; rarity differs by brightness and shape.
Line hierarchy: heavy silhouette, medium boundary, fine detail at large scale only.
Constraints: exactly six guns and six rarity tiers; no extra weapons, brand marks, logos, trademarks, watermark, production atlas, or tiny decorative paragraphs; visual reference only.
```

### UI content-only correction

The candidate above was used as the sole edit input. No third-party image was
introduced.

```text
Use case: precise-object-edit
Primary request: Change only generic UI labels that conflict with the locked product contract. Preserve composition, style, spacing, palette, weapons, rarity treatment, silhouettes, and all other design.
Required tabs: PLAY, FIGHTERS, CHALLENGES, RECORDS, SETTINGS.
Objective: HOLD THE CORE / Control the objective / 0/45.
State buttons: PLAY.
Card title: RIFLE.
Buttons: PLAY, FIGHTERS, RECORDS, LEAVE MATCH.
Constraints: change only labels and directly necessary tiny icons; no shop, currency, monetization, upgrade, dismantle, purchase, or unlock-economy language; no logos, trademarks, or watermark.
```

### Rendering, lighting, and motion

```text
Use case: stylized-concept
Asset type: golden visual-development reference sheet for a browser game; rendering grammar, lighting, line weight, color hierarchy, and motion principles
Primary request: Create one original production-minded landscape sheet with five zones.
1) Line-weight ladder: same rugged fighter/prop at hero, gameplay, and mobile-small scale; heavy contour, medium boundary, omitted fine detail as scale shrinks.
2) Color hierarchy: top-down vignette with quiet ground, medium low cover, dark full collision, compact objective, high-contrast fighter, restrained effects; include grayscale/value proof.
3) Lighting: same vignette in neutral daylight, warm sunset, industrial interior, Blackout/local light, and irradiated storm; preserve local colors, collision, objectives, and silhouettes; short soft shadows are not geometry.
4) Motion: key-pose strips for idle, run, rifle recoil, hit reaction, ability anticipation/release, and death/collapse; readable anticipation, decisive action, two-frame settle, short smears, no elastic weapon aim or camera-authored gameplay.
5) Effect budget: same muzzle, impact, explosion, rarity pulse at full/reduced quality; reduced keeps timing, silhouette, hit point, objective warning, and telegraph while dropping secondary sparks, smoke, bloom, and debris.
Style/medium: original browser-efficient stylized comic 2D development sheet; controlled ink, simplified cel shading, matte color, dry-brush texture only on large surfaces; clean instructional presentation; not pixel art, photorealistic, or 3D.
Composition/framing: neutral-bone landscape board with gutters; mostly top-down three-quarter views and isolated silhouettes.
Color palette: soot navy/bone, rust/amber action, teal/cyan information, steel-blue defense, green life, magenta/chartreuse radiation; red only for danger/Mythical.
Motion direction: grounded comic timing; anticipation 80-120ms, action 1-2 frames, recovery 120-220ms; UI fades/slides never obscure focus.
Constraints: optional simple labels only; no logos, trademarks, watermark, franchise designs, production sprites/atlas, or live UI replacement; feasible for Phaser/WebGL/canvas desktop/mobile and reduced effects.
```

## Inspection record

Every approved 1536x1024 PNG was inspected at original size. Temporary local
previews were then rendered without modifying the goldens at 768x512 (an
844x390-landscape-width proxy after browser chrome/safe margins) and 384x256
(25% gameplay-detail stress view). Those previews were visually inspected and
were not committed.

| Criterion                  | Evidence and result                                                                                                                                                                                 |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fighter identity           | Six large poses, black silhouettes, and top-down pairs remain distinct at both reduced sizes. Mighty Man/Rook separate by helmet/posture; Bruce/Bubba by mass; Frost/Jack by hood-wand/axe. Passed. |
| Gameplay readability       | Fighter, objective, low-cover, full-collision, gun, and pickup silhouettes survive the 384px-wide stress view. Fine reference texture drops away without losing role. Passed.                       |
| Palette and line weight    | Heavy contours and value hierarchy survive reduction; the rendering sheet's grayscale comparison preserves fighters, objectives, and collision. Passed.                                             |
| Biome differentiation      | Tobacco wasteland, green suburb, red/steel industrial, and black-glass irradiated families remain immediately separable at 384px. Passed.                                                           |
| UI/rarity contrast         | Focus, pressed, and disabled states remain distinct at 768px; all six rarity tiers retain a unique value/shape treatment at 384px. Passed after label correction.                                   |
| Lighting                   | Daylight, sunset, interior, Blackout, and irradiated variants retain objective and fighter silhouettes at 384px. Passed.                                                                            |
| Motion                     | Idle/run/recoil/hit/ability/death strips and full/reduced effect pairs remain readable at 768px; written timings remove ambiguity at smaller scale. Passed.                                         |
| Originality                | Text-only generations used no third-party image inputs. The sole edit input was the original Batch 25 candidate. No logos, trademarks, or named franchise designs are present. Passed.              |
| Browser/mobile feasibility | Forms use compact cel-shaded masses, restrained alpha, modular environment pieces, and explicit full/reduced tiers. No runtime asset or configuration was introduced. Passed.                       |

## Rejected and deferred directions

- Rejected: `rejected/ui-weapons-rarity-v0-shop-labels.png`. Its structure,
  weapons, and rarity grammar were useful, but the generic `SHOP`, upgrade, and
  dismantle language contradicted the locked no-monetization/no-economy scope.
  A single content-only edit produced the approved sheet.
- Deferred: photorealistic, painterly, 3D, pixel-art continuation, and high-
  bloom neon directions. They fail the browser-efficient stylized-comic or
  gameplay-scale constraints and did not justify extra candidate generation.
- Deferred: production sprite sheets, atlas-ready tiles, icon exports, and
  effect sequences. Batch 26 and later own source rules and production work.

The five total generated candidates are the minimum set used to establish four
approved goldens and correct one proven contract violation. No bulk production
asset generation occurred.

## Batch 26 pipeline disposition

The approved and rejected Batch 25 sheets remain documentation artifacts in
this manifest. Batch 26 does not move, rewrite, recompress, crop, hash-change,
or feed any of them into an atlas. Later production manifests must reference
their own canonical sources under `art/reforged/sources/` and record complete
per-asset provenance under the contract in
`docs/REFORGED_ASSET_PIPELINE.md`. Generated runtime import metadata excludes
license/source/generation detail; deterministic provenance reports stay under
`art/reforged/provenance/` and third-party source archives stay outside runtime
redistribution.
