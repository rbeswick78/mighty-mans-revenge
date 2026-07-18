# Reforged Asset Pipeline

Batch 26 establishes the production-art contract used by later Reforged visual
batches. It does not add production art, replace a live asset, or change a
runtime loader. The four approved Batch 25 sheets remain documentation-only
visual authority under `docs/reforged/style-bible/`.

## Folder contract

| Path                             | Contract                                                                                                                                                       |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/reforged/style-bible/`     | Approved golden direction and its Batch 25 lineage. Never feed these sheets to the runtime atlas.                                                              |
| `art/reforged/references/`       | Cropped or annotated per-asset production references approved in later batches. Reference files are never runtime imports.                                     |
| `art/reforged/sources/`          | Canonical, cleaned PNG exports and one manifest beside each atlas set. Editable application files may be retained only when project-owned and redistributable. |
| `art/reforged/provenance/`       | Generated build reports and human attribution notes. This tree may contain license/source URLs and must stay outside `client/public`.                          |
| `art/reforged/source-archives/`  | Local-only third-party archives. The directory is ignored and may never be copied into runtime output.                                                         |
| `client/public/assets/reforged/` | Later-batch generated PNG atlases and runtime-safe import JSON only. Batch 26 intentionally creates no files here.                                             |
| `tools/reforged-assets/`         | Dependency-free deterministic packer, validators, and synthetic fixtures.                                                                                      |

Each atlas set lives in one lower-kebab-case directory below
`art/reforged/sources/`. Its manifest and every source path are relative to that
directory; traversal and absolute paths fail validation. The matching later-
batch production reference may live under the same relative directory in
`art/reforged/references/`, but a reference is never an implicit build input.

## Canonical source rules

- Use non-interlaced 8-bit RGB or RGBA PNG. The packer emits canonical RGBA8888
  with deterministic zlib level-9 compression and strips source metadata by
  decoding pixels rather than copying PNG chunks.
- Use lower-kebab-case directory/file names and lower-kebab dot-separated asset
  IDs such as `fighter.mighty-man.idle.down`.
- Declare exact sheet width/height and an exact rectangular frame grid. Frame
  count must divide evenly by columns; unused cells, implicit trimming,
  rotation, and heuristic frame discovery are prohibited.
- Keep transparent pixels transparent. Do not bake biome backgrounds, bloom,
  camera treatment, collision, or objective state into a sprite unless the
  owning later-batch contract explicitly requires it.
- Clean silhouettes, anti-aliased edges, palette/value hierarchy, layer seams,
  frame registration, and state consistency against the style bible before a
  source enters a manifest. Automated checks cannot approve visual identity.
- Rook layers and Jack axe/no-axe sets require identical registered frame grids
  within their paired production manifests. Fighter batches own those concrete
  sets; Batch 26 supplies the enforceable dimension/frame vocabulary only.

## Manifest contract

The committed fixture at
`tools/reforged-assets/fixtures/manifest.valid.json` is the smallest complete
schema example. A manifest contains:

- `schemaVersion: 1`;
- one atlas ID, power-of-two maximum width/height, 1-8px padding, 1-4px edge
  extrusion, and compressed/decoded byte ceilings;
- unique asset IDs and PNG paths;
- exact source dimensions and frame width/height/count/columns; and
- complete provenance for every asset.

Provenance always requires origin, creator, license, attribution, and a durable
source reference. AI-assisted entries additionally require provider,
generation ID, and an in-repo prompt document. Third-party entries additionally
require an HTTP(S) source URL and literal
`curated-runtime-output-only` redistribution. Source archives are not accepted
as asset paths.

The generated provenance report records the manifest hash, source PNG hashes,
texture hash, and complete provenance. The tool rejects a provenance output
inside `client/public`. Runtime import JSON deliberately contains only atlas,
frame, dimension, and texture-integrity data; it omits local paths, license
text, source URLs, and generation lineage.

## Deterministic atlas contract

1. Validate and sort assets by ID, then frame index.
2. Decode source pixels and verify PNG checksums, format, dimensions, frame
   grids, compressed source ceilings, and total decoded memory.
3. Pack frames left-to-right in deterministic shelves without trim or rotation.
4. Extrude edge pixels before transparent padding so FIT scaling and future
   mipmaps cannot sample a neighboring frame.
5. Round the used atlas extent to powers of two within the declared maximum.
6. Encode RGBA8888 with fixed compression and emit stable-key JSON.
7. Fail before acceptance when the compressed atlas exceeds its declared byte
   ceiling.

Repeated builds from byte-identical source and manifest input must produce
byte-identical atlas PNG, import JSON, provenance JSON, and SHA-256 values.

## Commands

Validate one production manifest without writing output:

```powershell
corepack pnpm assets:validate --manifest art/reforged/sources/<set>/manifest.json
```

Build a later-batch set. Runtime output and provenance are intentionally
separate:

```powershell
corepack pnpm assets:build --manifest art/reforged/sources/<set>/manifest.json --out client/public/assets/reforged/<set> --provenance art/reforged/provenance/<set>.json
```

Run the focused deterministic Batch 26 validators:

```powershell
corepack pnpm test:assets
```

The focused suite creates tiny RGB values as canonical PNGs only in the system
temporary directory. It proves naming, source confinement, dimensions, frame
counts, metadata separation, deterministic packing, compression ceilings,
provenance completeness, and stable failure codes without adding production
art or generated runtime content.

## Compression and acceptance boundaries

Byte ceilings are set per atlas manifest from the owning later batch and are
reviewed with its real content. Raising a limit merely to silence a failure is
not acceptance evidence. Split a set by loading lifecycle or remove redundant
alpha/detail first. Do not use lossy texture conversion until a separate
browser-support and visual-quality contract explicitly authorizes it.

Every later visual batch must run its focused pipeline validation, review the
generated import/provenance diff, verify source and texture hashes, and inspect
the atlas at gameplay/mobile scale. Loader/runtime integration then follows the
roadmap's applicable typecheck, lint, build, browser, fallback, and visual tier.

## Batch 27 modern UI disposition

`art/reforged/sources/modern-ui/manifest.json` is the first production manifest.
Its durable original geometry source is
`tools/reforged-assets/create-modern-ui-sources.mjs`; it emits exactly two
canonical PNG sheets containing 32 chrome states and 16 semantic icons. The
Batch 26 packer emits one 1024x256 `modern-ui.core` atlas and runtime import JSON
under `client/public/assets/reforged/modern-ui/`, while the complete report stays
under `art/reforged/provenance/modern-ui/`.

The client validates the import schema and required frames before registering
named Phaser frames. Literal server-owned `modernArt` selects those frames only
on the owning UI surfaces; missing assets or a false/absent capability preserve
procedural compatibility chrome. Both full and reduced cosmetic tiers keep the
same essential frame/icon/focus treatment. The set contains no raster text,
source archive, license detail, golden pixel, fighter, weapon, pickup, biome,
combat effect, or map art.

## Batch 28 fighter art I disposition

`art/reforged/sources/fighter-art-i/manifest.json` packs the first fighter
production set. Its durable geometry source is
`tools/reforged-assets/create-fighter-art-i-sources.mjs`; the source was cleaned
against three original AI-assisted production references whose complete prompts
and generation IDs remain under `art/reforged/references/fighter-art-i/`.
Neither the references nor any Batch 25 golden enter the build.

The three canonical 64px-frame sheets contain complete directional idle,
movement, attack, ability, and damage grids plus the live death-variant cycles:
100 frames for Mighty Man, 88 for Bruce, and 100 for Frost Wizard. The unchanged
Batch 26 tool sorts those assets and all 288 frames deterministically into one
2048x1024 `fighter-art-i.core` RGBA8888 atlas with 3px padding and 2px
extrusion. Runtime output stays under
`client/public/assets/reforged/fighter-art-i/`; source hashes, license,
attribution, and generation lineage stay under
`art/reforged/provenance/fighter-art-i/`.

Boot validates and registers the runtime-safe frame grid. Literal server-owned
`modernArt` selects authored bodies only for Mighty Man's rifle identity,
Bruce's no-gun identity, and Frost Wizard's wand identity. Incompatible held
states retain the complete legacy body/overlay path, as do false, absent,
old-server, missing-atlas, and non-Batch-28 roster paths. Authored body states
and ability cues are essential in both quality tiers; reduced quality may drop
only secondary particles. Batch 28 does not place fighter pixels in the modern
UI atlas and does not authorize legacy removal or the Boot-through-Results
cutover owned by Batch 33.

## Batch 29 fighter art II disposition

`art/reforged/sources/fighter-art-ii/manifest.json` is a separate loading and
lineage boundary for Bubba, Jack, and Rook. Its durable deterministic cleanup
source is `tools/reforged-assets/create-fighter-art-ii-sources.mjs`, informed by
three original AI-assisted production references and complete prompt/generation
records under `art/reforged/references/fighter-art-ii/`. Neither those references
nor any Batch 25 golden enters a runtime build.

Five canonical four-column 64px sheets contain 404 frames: 88 Bubba, 88 Jack
axe-absent, 76 Jack axe-present, 76 Rook body, and 76 Rook helmet. The living
grids share exact directional idle, movement, attack, ability, and damage index
ranges. Death ranges retain each live variant cycle. Jack's two complete bodies
never synthesize a partial weapon layer, and Rook's body and helmet use identical
frame registration and synchronized animation keys.

The unchanged Batch 26 packer sorts the five assets and all frames into one
2048x2048 `fighter-art-ii.core` RGBA8888 atlas with 3px padding and 2px
extrusion. Runtime PNG/import JSON stays under
`client/public/assets/reforged/fighter-art-ii/`; hashes, license, attribution,
prompts, and generation lineage stay in
`art/reforged/provenance/fighter-art-ii/`. Boot validates the exact 404-frame
schema before registration. Literal server-owned `modernArt` selects these
bodies only where carried-object truth is complete; the missing-atlas,
capability-off, old-server, other-roster, and Rook non-rifle paths retain legacy
assets. Full and reduced quality keep authored bodies, ability cues, and Rook's
synchronized layer; only secondary particles may reduce.

## Batch 30 weapon and pickup disposition

`art/reforged/sources/weapon-pickup-art/manifest.json` is the isolated loading
and lineage boundary for production weapons, sustain pickups, containers, and
rarity presentation. One original AI-assisted reference is retained with its
complete prompt, generation ID, dimensions, and hash under
`art/reforged/references/weapon-pickup-art/`; deterministic project geometry in
`tools/reforged-assets/create-weapon-pickup-art-sources.mjs` is the sole source
of canonical production pixels. Neither the reference nor a Batch 25 golden is
packed into runtime output.

Six canonical four-column 64px gun sheets each contain 24 frames: directional
held and firing pairs, four dry facings, and ground, HUD, ammo, and container
presentation. Separate sustain and rarity sheets contain eight and six frames.
The unchanged Batch 26 packer sorts all eight assets and 158 frames into one
1024x1024 `weapon-pickup-art.core` RGBA8888 atlas with 3px padding, 2px
extrusion, exact grids, no trim or rotation, and the established byte limits.
Runtime PNG/import JSON stays under
`client/public/assets/reforged/weapon-pickup-art/`; license, prompt, generation,
source, and hash lineage stays under
`art/reforged/provenance/weapon-pickup-art/`.

Boot validates the exact schema before registering named Phaser frames. Literal
server-owned `modernArt` selects only current live rifle/pistol/shotgun, sustain
pickup, and HUD/ammo presentation. Bat/punch and every false, absent,
old-server, missing-atlas path stay legacy. SMG, sniper, launcher, rarity, and
container frames are registered production inputs but remain mechanically
dormant until their owning later batches.

## Batch 31 biome environment disposition

`art/reforged/sources/biome-environment-art/manifest.json` is the separate
loading and lineage boundary for the four environment families. One original
AI-assisted visual-development reference is retained with its complete prompt,
generation ID, dimensions, hash, and inspection record under
`art/reforged/references/biome-environment-art/`; deterministic project geometry
in `tools/reforged-assets/create-biome-environment-art-sources.mjs` is the sole
source of canonical production pixels. Neither the reference nor a Batch 25
golden enters runtime output.

Four canonical five-column 64px sheets each contain 20 frames: three seam-safe
ground variants; horizontal, vertical, and corner family transitions; paired
intact/damaged full wall, low cover, two props, and landmark; three separate
southeast shadows; and one navigation anchor. The unchanged Batch 26 packer
sorts all 80 frames into one 1024x512 `biome-environment-art.core` RGBA8888
atlas with 3px padding, 2px extrusion, no trim or rotation, and the established
byte limits. Runtime PNG/import JSON stays under
`client/public/assets/reforged/biome-environment-art/`; license, prompt,
generation, source, and hash lineage stays under
`art/reforged/provenance/biome-environment-art/`.

Boot validates/registers the exact schema. The atlas remains dormant for live
maps; only the literal `modernArt` verification preview may instantiate it.
Current map JSON, legacy tiles/decorations, collision/destruction authority,
and all completed atlases remain unchanged until Batch 33 owns coherent cutover.

## Batch 32 combat-feedback disposition

`art/reforged/sources/combat-feedback-art/manifest.json` is the separate loading
and lineage boundary for the complete feedback family. One original
AI-assisted visual-development reference is retained with its complete prompt,
generation ID, dimensions, hash, and full/mobile/grayscale/gameplay inspection
record under `art/reforged/references/combat-feedback-art/`; deterministic
project geometry in
`tools/reforged-assets/create-combat-feedback-art-sources.mjs` is the sole
source of canonical production pixels. Neither the reference nor a Batch 25
golden enters runtime output.

One canonical eight-column 512x768 sheet contains 96 exact 64px frames: 16
directional muzzle frames, 12 scenery impacts, 12 confirmed-player impacts,
eight explosions, four healing, four armor, 18 fighter-release, six rarity,
eight zone, and eight elimination frames. The unchanged Batch 26 packer emits
one 1024x512 `combat-feedback-art.core` RGBA8888 atlas with 3px padding, 2px
extrusion, no trim or rotation, and the established byte limits. Runtime
PNG/import JSON stays under
`client/public/assets/reforged/combat-feedback-art/`; complete license, prompt,
generation, source, and hash lineage stays under
`art/reforged/provenance/combat-feedback-art/`.

Boot validates/registers the exact schema. Literal server-owned `modernArt`
plus atlas availability permits the pooled renderer for existing live event
families, while rarity and zone remain verification-preview-only. False,
absent, old-server, missing-atlas, and every completed-atlas path stay
unchanged. Batch 33 owns coherent cutover and any verified fallback retirement.

## Batch 33 cutover disposition

Batch 33 produces no pixels and changes no manifest, canonical sheet, packed
PNG, runtime import JSON, or provenance report. Runtime selection treats the
existing 48-, 288-, 404-, 158-, 80-, and 96-frame atlases as one atomic system:
literal server-owned `modernArt` plus compatible registration of all six is
required before any modern scene owner activates. One missing or incompatible
atlas leaves every scene on its registered legacy/procedural path. The current-
map environment projection and pooled event feedback consume only named frames
already emitted by the Batch 26 pipeline. Animated gates/caches and all other
incompatible states retain their existing assets; no legacy file is removed or
stops loading. Batch 25 goldens and complete source/license/generation lineage
remain non-runtime references.

## Batch 42 runtime-consumer disposition

Batch 42 creates no pixel or pipeline output. It consumes existing named Batch
30 SMG, sniper-rifle, and launcher frames for server-authored weapon IDs and
uses bounded procedural geometry for authoritative launcher positions. Rarity
labels/shapes/colors are code-native presentation values. No manifest, source
grid, packed PNG, runtime import JSON, hash, provenance report, padding,
extrusion, registration, fallback, or byte budget changes.

Weapon instances do not authorize asset loading or capability exposure.
Existing atomic `modernArt` availability remains the only modern atlas gate;
legacy presentation stays registered, and Batch 43 or later owns inventory,
drops, containers, auras, and zone consumers.

## Scope boundary

Batch 26 owns this contract and tooling; Batch 27 owns the completed modern UI
production set; Batch 28 owns the completed Mighty Man, Bruce, and Frost Wizard
set; Batch 29 owns the completed Bubba, Jack, and Rook set; Batch 30 owns the
completed weapon/pickup production set; Batch 31 owns the completed biome
environment set; Batch 32 owns the completed combat-feedback production set;
Batch 33 owns the completed coherent live cutover. No pipeline output
can enable `modernArt`, retire a fallback, or authorize deployment.
