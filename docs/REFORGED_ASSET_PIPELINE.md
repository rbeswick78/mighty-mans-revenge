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

## Scope boundary

Batch 26 owns this contract and tooling only. Batch 27 owns modern UI production
assets. Batches 28-32 own fighter, weapon/pickup, biome, and combat-feedback
production sets. Batch 33 owns coherent live cutover. No pipeline output can
enable `modernArt`, change fallback behavior, or authorize deployment.
