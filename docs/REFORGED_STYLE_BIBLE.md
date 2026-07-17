# Mighty Man's Revenge: Reforged Style Bible

Batch 25 freezes the golden visual references for the Reforged program. It
defines what later asset work must preserve; it does not provide runtime art,
atlases, import metadata, map content, or a visual cutover.

## Golden reference set

| Reference                                                                                                            | Purpose                                                               | Status                                    |
| -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------- |
| [`fighters-identity-silhouettes.png`](./reforged/style-bible/golden/fighters-identity-silhouettes.png)               | Six-fighter identity, mass, silhouette, accent, and top-down scale    | Approved                                  |
| [`biome-environment-families.png`](./reforged/style-bible/golden/biome-environment-families.png)                     | Wasteland, overgrown, industrial, and irradiated environment families | Approved                                  |
| [`ui-weapons-rarity-language.png`](./reforged/style-bible/golden/ui-weapons-rarity-language.png)                     | UI chrome, six-gun silhouettes, rarity color/shape hierarchy          | Approved after one narrow text correction |
| [`rendering-lighting-motion-principles.png`](./reforged/style-bible/golden/rendering-lighting-motion-principles.png) | Line weight, value hierarchy, lighting, motion, and quality tiers     | Approved                                  |

The images are concept references, not literal layouts or production sprites.
If an image contains illustrative numbers, map shapes, fighter poses, or HUD
arrangements, the checked-in game contracts remain authoritative. The written
rules in this document override incidental reference-sheet details.

Generation lineage, exact acceptance evidence, hashes, and the one rejected
candidate are recorded in
[`PROVENANCE.md`](./reforged/style-bible/PROVENANCE.md).

## North star

Reforged is a browser-efficient stylized-comic 2D shooter: bold silhouettes,
controlled ink, two or three matte value bands, restrained dry-brush wear, and
compact emissive accents. It modernizes the established roster and world rather
than replacing them with unrelated military, fantasy, horror, or sci-fi
archetypes.

At gameplay scale, the reading order is:

1. living fighter, attack, and immediate danger;
2. objective, teammate, and interactable state;
3. low cover and full collision;
4. walkable ground and decorative atmosphere.

No texture, lighting effect, rarity aura, biome color, or cinematic flourish may
reverse that order. Hue is reinforcement, never the only carrier of gameplay
meaning.

## Fighter identity locks

All six fighters must remain recognizable in solid black silhouette and in a
48-72 CSS-pixel top-down presentation. Production art may refine clothing and
materials, but it may not exchange the locked mass, carried-object, posture, or
accent cues below.

| Fighter      | Locked silhouette and material identity                                                                                                                    | Accent and ability cue                                        |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Mighty Man   | Balanced lean human rifleman; square, steady stance; dark utility jacket; compact amber scarf; pale bone face guard/goggles; practical long-gun silhouette | Cyan x-ray rib/optic motif; composed rather than supernatural |
| Bruce        | Compact stocky undead fire-breather; hunched torso, heavy hands, broad jaw; torn dark workwear; no carried gun                                             | Ember-orange throat/chest and short forward flame cone        |
| Frost Wizard | Fast, fragile human caster; slim long-limbed mass; angular hood and layered winter wraps; short wand; no gun                                               | Cyan/indigo frost, low foot mist, sharp ice shapes            |
| Bubba        | Tallest and widest undead tank; massive shoulders, forearms, and planted feet; patched industrial overalls and scrap plating; no gun                       | Steel-blue Iron Hide plates and shield glint                  |
| Jack         | Wiry asymmetric undead skirmisher; narrow frame, rust-red work coat, long-handled axe; axe-present and axe-absent bodies must both read as Jack            | Rust-red arc and compact thrown-axe trail                     |
| Rook         | Compact forward-leaning human flanker; green full scavenger helmet with round lenses and short ridge; light tactical coat; rifle carried close             | Oxidized-teal paired chevrons and low dash streak             |

Relative mass is part of identity: Bubba is largest, Bruce is compact and
stocky, Frost Wizard and Jack are narrow, Mighty Man is balanced, and Rook is
compact and forward-driven. Rook's helmet and Jack's axe-state distinction must
survive every idle, movement, attack, damage, and death set authored later.

### Gameplay-scale construction

- Heavy outer contour: 5-7% of a 48px body height, rounded only where material
  demands it.
- Medium material boundary: about half the outer contour.
- Fine surface line: reference/portrait scale only; omit below 72px unless it
  carries identity.
- Use one dominant dark mass, one body/local-color mass, and one compact accent
  at the smallest size.
- Faces, fingers, fabric weave, scratches, and small fasteners may disappear;
  helmet, hood, axe, wand, shoulder mass, rifle, and posture may not.
- Avoid black fill merging a carried weapon into the torso. Preserve a sliver
  of negative space or a clear angle break.

## Environment and collision language

The four environment families share modular 48px construction, heavy full-wall
contours, medium low-cover contours, quiet ground, and short graphic shadows.
They differ through material families and one controlled accent, not through
different collision rules.

| Family     | Materials and palette                                                                                                             | Required landmark behavior                                                      |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Wasteland  | Tobacco earth, cracked concrete, bone dust, rusted road barriers, sandbag/scrap cover; amber warmth with cyan objective contrast  | Open sun-bleached lanes and clear rust/bone structures                          |
| Overgrown  | Faded suburban asphalt/concrete, moss, vines, pale grass, collapsed fences and cars; greens stay darker and quieter than fighters | Vegetation frames routes but never hides cover edges or objectives              |
| Industrial | Oxidized steel, corrugated red/charcoal roofs, pipes, containers, reinforced barriers, gates, barrels; amber hazard accents       | Tall factory/checkpoint masses and unmistakable interactable gates              |
| Irradiated | Black glass, sulfur dust, chartreuse fissures, cyan containment lights, restrained magenta radiation traces                       | Contamination reads atmospherically without disguising walkability or collision |

### Gameplay information hierarchy

| Role                      | Shape/value rule                                                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Walkable ground           | Lowest contrast and detail; broad matte value fields; texture never forms false walls or targets                                      |
| Low cover                 | Medium contour; visible top face or waist-high profile; lighter than full collision; stable footprint                                 |
| Full collision            | Darkest and heaviest contour; tall value mass; no ambiguous transparent edge                                                          |
| Destructible/interactable | Collision class remains primary; add one restrained diagonal mark, hinge, latch, or hazard plate                                      |
| Objective                 | Compact cyan or amber geometric ring/core; readable in grayscale; glow never exceeds the owning footprint enough to hide nearby edges |
| Decoration                | Lowest priority; may overlap ground but never obscure a collider, objective, pickup, or fighter                                       |
| Shadow                    | Short, soft-edged graphic mass; presentation only; never looks like a solid tile                                                      |

Do not outline every ground tile. Repeated modular seams should be sparse and
irregular enough to avoid visual vibration during camera motion.

## Color system

The current Reforged tokens and Resurrect-64 heritage remain the palette
foundation. Later production work may quantize or tune exact values, but must
preserve these semantic roles and value relationships.

| Role              | Reference color | Use                                                         |
| ----------------- | --------------- | ----------------------------------------------------------- |
| Canvas            | `#090d14`       | Outside world, deepest UI field                             |
| Surface           | `#121a26`       | Primary UI panels and dark structural masses                |
| Raised surface    | `#1b2938`       | Cards, selected layers, full-collision separation           |
| Border            | `#32485d`       | Secondary UI/material boundary                              |
| Bone text         | `#f3f0df`       | Primary readable copy and neutral highlights                |
| Muted text        | `#9eafbd`       | Secondary copy; never critical state                        |
| Focus/information | `#72d6c9`       | Focus, safe information, map/objective structure            |
| Primary action    | `#ff8a3d`       | Main action, warm combat emphasis                           |
| Active action     | `#ffb15c`       | Hover/active and positive warm highlight                    |
| Danger            | `#e83b3b`       | Immediate danger, destructive confirmation, Mythical accent |
| Defense           | `#4d9be6`       | Armor, steel-blue protection, Rare rarity                   |
| Recovery          | `#91db69`       | Health/recovery and Uncommon rarity                         |
| Arcane            | `#a884f3`       | Epic rarity and controlled arcane/radiation accents         |

Large surfaces use muted versions; saturated colors occupy compact accents.
Critical text and symbols must meet readable light/dark contrast and must remain
distinguishable in a grayscale check.

## UI language

The UI is modern comic-industrial rather than retro pixel chrome. It uses soot
navy fields, bone text, restrained steel borders, small chamfers, oxidized-teal
focus, amber primary actions, and red only for danger/leave confirmation.

- The locked tabs are Play, Fighters, Challenges, Records, and Settings.
- There is no shop, currency, upgrade economy, dismantling, purchase, or
  monetization language.
- Focus adds a strong teal outer/inner line and may not depend on bloom.
- Pressed/active uses amber fill with dark text; disabled uses reduced contrast
  without becoming invisible.
- Touch targets retain the established safe-area and minimum-target contracts;
  visual ornament stays inside the interactive bounds.
- Cards use one dominant title, one compact state line, and short scan groups.
  Dense paragraphs do not belong in combat.
- HUD frames must reserve gameplay visibility and preserve the Batch 22/23
  safe-area, kill-feed, minimap, menu, and touch priorities.
- The golden HUD fragment demonstrates language only. Its sample numbers,
  objective arrangement, and scene are non-authoritative.

## Six-gun visual language

All guns share rugged improvised industrial materials: matte dark receivers,
wrapped or worn grips, muted steel edges, and one small functional accent. They
must remain separable in side profile, top-down hold, and ground-pickup form.

| Gun          | Silhouette lock                                                    |
| ------------ | ------------------------------------------------------------------ |
| Rifle        | Balanced long receiver and barrel; familiar middle-length baseline |
| Pistol       | Smallest, compact one-handed block with short barrel               |
| Shotgun      | Thick barrel/pump mass and broader front half                      |
| SMG          | Short boxy receiver, compact stock, deep magazine mass             |
| Sniper rifle | Longest narrow barrel with clear scope and rear stock              |
| Launcher     | Broad tube, largest bore, heavy rear mass                          |

Do not distinguish guns through color alone. A dry, dropped, held, or rarity-
treated gun must retain the same base silhouette.

## Rarity language

Rarity changes Battle Royale damage only and follows the locked order and
colors. Never repaint the whole weapon. Use a compact badge, rim/accent, and a
shape-coded aura that survives grayscale and reduced effects.

| Tier      | Color            | Shape/effect                        |
| --------- | ---------------- | ----------------------------------- |
| Common    | Grey `#9babb2`   | No aura; neutral badge/rim          |
| Uncommon  | Green `#91db69`  | One short underline                 |
| Rare      | Blue `#4d9be6`   | Two clean orbit ticks               |
| Epic      | Purple `#a884f3` | Four restrained faceted pulse marks |
| Legendary | Orange `#f79617` | Three crown-like rays               |
| Mythical  | Red `#e83b3b`    | Narrow double-chevron halo          |

Full quality may animate secondary facets and soft light. Reduced quality keeps
the badge, rim, main shape, timing, and pickup silhouette while removing bloom,
secondary particles, and extra trails.

## Lighting

- Neutral daylight is the material-color reference.
- Warm sunset may shift ambient values but preserves cyan objectives and local
  fighter accents.
- Industrial interiors use cool shadow and controlled practical lights; full
  collision remains darker than walkable floor.
- Blackout preserves the established local light pool, pickup/muzzle/explosion
  reveals, objective clarity, and hidden-rival rules. It never adds remote light.
- Irradiated lighting uses chartreuse/magenta contamination as edge atmosphere,
  not a full-screen tint that erases teams, collision, or warnings.
- Emissive bloom is optional cosmetics. The underlying symbol and silhouette
  must read with bloom removed.

## Line and material rendering

- Use a three-step line system: heavy silhouette, medium structural/material
  break, fine wear/detail.
- Use at most three value bands on gameplay sprites: shadow, local/mid, highlight.
- Dry-brush texture belongs on large reference or environment surfaces. It may
  not create subpixel shimmer on moving sprites.
- Metals separate through value, edge wear, and sparse cool highlights; cloth
  uses broader matte planes; undead skin stays muted and non-gory.
- Anti-aliasing must remain clean against both light and dark biomes. Do not
  depend on hairline strokes below one rendered CSS pixel.

## Motion principles

Motion is grounded and snappy, with one readable action beat and a controlled
settle. Timing guidance is reference-scale and may be expressed as frames at the
final production rate.

| Motion         | Guidance                                                                                                           |
| -------------- | ------------------------------------------------------------------------------------------------------------------ |
| Idle           | 12-16-frame restrained breathing loop; silhouette and weapon aim stay stable                                       |
| Run            | Two-frame anticipation/weight transfer, decisive stride, two-frame settle cadence; no excessive bounce             |
| Rifle recoil   | One anticipation frame, one decisive recoil frame, two-frame settle; muzzle direction remains true                 |
| Hit reaction   | One impact frame plus compact directional recoil; never steals input or implies a different authoritative position |
| Ability        | 80-120ms anticipation, one clear release shape, 120-220ms recovery; effect begins from the readable pose           |
| Death/collapse | One loss-of-balance beat, decisive collapse, held final silhouette; preserve current lifecycle authority           |
| UI             | Existing 80ms activation and 180ms fade baseline; focus remains visible throughout transitions                     |

Directional smears are short accents, not replacement bodies. Motion may not
move hitboxes, aim, camera authority, snapshots, or input timing. Camera kick,
shake, zoom, and roll remain the separately composed Batch 20 layers.

## Full and reduced cosmetic tiers

Both tiers preserve timing, hit point, silhouette, objective warning, rarity
shape, and gameplay telegraph.

Reduced quality may drop secondary sparks, smoke, bloom, debris, light shafts,
extra particles, and long trails. It may not remove a muzzle event, confirmed
impact point, explosion radius cue, objective state, rarity badge/shape, ability
release, zone boundary, or elimination cue.

## Browser and mobile feasibility

- Target source art should support deterministic atlas packing later, but Batch
  25 defines no atlas or import pipeline.
- Prefer opaque or alpha-tested masses over large stacked translucent layers.
- Avoid full-screen high-frequency texture, excessive additive bloom, and long-
  lived particle overdraw.
- Maintain clean silhouettes under FIT scaling at desktop and 844x390 mobile
  landscape. Equal logical world visibility remains unchanged.
- Keep gameplay sprites readable at 48-72 CSS pixels and pickups at 24-48 CSS
  pixels; UI icons must retain their primary shape at 16-24 CSS pixels.
- Use mip-safe padding and integer-friendly source dimensions in Batch 26;
  this document does not establish those pipeline rules.
- Every effect must define a reduced-tier form before production approval.

## Batch 25 acceptance criteria

The golden set is accepted only when all conditions below are met.

- **Identity consistency:** all six fighters preserve the locked mass, posture,
  carried-object, human/undead, and ability-accent cues; Jack and Rook retain
  their state/layer identities.
- **Gameplay-scale readability:** silhouettes, guns, objectives, collision
  classes, and rarity shapes remain distinct in 768x512 mobile-width and
  384x256 reduced reference previews without requiring fine detail.
- **Palette and line hierarchy:** outer contour, structural line, quiet ground,
  high-mass collision, fighter, objective, and danger values follow the written
  order and remain useful in grayscale.
- **Biome differentiation:** all four families are immediately distinct while
  sharing one modular drawing system and collision language.
- **UI and rarity contrast:** the five-tab/no-economy contract is respected;
  focus/pressed/disabled and all six rarities use value/shape as well as hue.
- **Lighting behavior:** daylight, sunset, interior, Blackout, and irradiated
  treatments preserve local color, collision, objective, and fighter clarity.
- **Motion guidance:** anticipation/action/settle and full/reduced effect rules
  are explicit and do not imply gameplay, input, or camera authority changes.
- **Originality:** no named franchise, real-world weapon brand, logo, trademark,
  or third-party reference image is used in the approved generation path.
- **Provenance:** every candidate has its generation method, prompt lineage,
  dimensions, SHA-256, disposition, and reference-image use recorded in-repo.
- **Browser/mobile feasibility:** the direction is implementable with compact
  cel-shaded sprites, modular environment pieces, bounded alpha/effects, and the
  existing full/reduced quality model.

## Deferred to later batches

Batch 25 does not authorize production sprites, atlas/source tooling, import
metadata, compression, live UI replacement, fighter animation sheets, weapon or
pickup production art, biome tiles, combat-effect cutover, map authoring,
balance changes, capability exposure, or deployment. Those remain owned by
Batches 26-39 in roadmap order.

## Batch 28 production mapping

The first fighter production atlas applies this bible to Mighty Man, Bruce, and
Frost Wizard only. All use registered 64x64 cells, one dominant body mass,
transparent negative space, heavy outer contours, at most three body-value
bands, and short authored action accents. Mighty Man retains the balanced human
rifleman mass with bone face guard, amber scarf, steel rifle, and cyan x-ray
release; Bruce remains compact, stocky, undead, and gunless with ember breath;
Frost Wizard remains a slim human hood/wrap/wand silhouette with cyan/indigo
frost. Horizontal aim is carried in the art rather than sprite rotation.

The complete directional idle, move, attack, ability, damage, and live death-
variant sets are presentation-only. They do not move hitboxes, change attack or
ability timing, infer server state, or alter death/respawn authority. Authored
body recognition and ability cues remain in full and reduced tiers; only
existing secondary particles may reduce. Incompatible held-object states and
all non-Batch-28 fighters stay on registered legacy fallbacks until their owning
batches and the Batch 33 coherent cutover are verified.

## Batch 29 production mapping

The second fighter atlas applies the same registered 64x64-cell grammar to
Bubba, Jack, and Rook. Bubba is the roster's tallest and widest undead tank:
planted feet, patched industrial overalls, scrap-plated shoulders, empty hands,
and a restrained steel-blue Iron Hide plane. Jack remains a wiry asymmetric
undead worker in a rust-red coat; his long-handled axe creates deliberate
negative space, and his separately complete axe-absent body uses rust-red
throw/return marks without leaking a partial carried weapon. Rook remains a
compact, forward-leaning human rifleman with a close-carried rifle. His separate
green full helmet, round lenses, and short ridge are registered to the same
state grid as his body; paired oxidized-teal chevrons and a low streak carry the
dash cue.

Four-direction idle, move, attack, ability, damage, and exact live death cycles
remain presentation-only. They preserve one dominant body mass, aim/facing,
carried-object or no-gun truth, and 48–72 CSS-pixel recognition without moving
hitboxes or altering combat, ability, death, or respawn timing. Authored bodies,
ability cues, and Rook's body/helmet synchronization remain essential in full
and reduced quality. All incompatible states retain registered legacy
fallbacks until Batch 33 owns a coherent verified cutover.

## Batch 30 production mapping

The weapon/pickup atlas applies the same compact 64x64-cell grammar to six gun
identities and current sustain pickups. Rifle is the balanced middle-length
baseline; pistol is the smallest one-handed block; shotgun concentrates mass in
its thick pump and front; SMG stays short with a deep magazine; sniper is the
longest narrow scoped shape; launcher is the broadest tube with the heaviest
rear. Directional held, firing, dry, ground, HUD, ammo, and container frames
reuse those base masses instead of inventing presentation-specific weapons.

Gun ammo, grenade, bandage, armor, and overcharge retain distinct value and
shape identities at gameplay and mobile scale. Common uses only the compact
neutral badge/rim; Uncommon adds one underline; Rare uses two orbit ticks; Epic
uses four facets; Legendary uses three crown rays; Mythical uses a narrow
double-chevron halo. Those overlays remain readable in grayscale and never
repaint the whole gun. Full quality may retain bounded facets, soft light, and
secondary motion; reduced quality retains badge, rim, silhouette, timing, and
pickup identity without bloom or extra particles.

All Batch 30 art is presentation-only. It does not add gun/pickup types,
weapon instances, inventory, containers, loot, rarity damage, ammo behavior,
spawn timing, melee mechanics, or authority. Live use is limited to existing
rifle/pistol/shotgun and sustain-pickup paths behind literal server-owned
`modernArt`; bat/punch and fallback behavior stay complete. SMG, sniper,
launcher, rarity, and container art remains dormant until later owning batches.
