# Reforged Standard-Arena Authoring Contract

Batch 34 defines the shared, deterministic contract for 40x24 standard arenas.
Batches 35-36 apply it to Wasteland Outpost, Overgrown Suburb, Scrapyard, and
Collapsed Overpass behind the existing literal server-owned `largeWorlds`
opt-in. The six current 20x12 maps remain the registry/default/fallback
documents; runtime simulation, collision, destruction, navigation, camera, HUD,
matchmaking, mode, and bot behavior still consume the established shared
contracts.

## Compatibility profiles

`validateMapDocument()` is the shared loading boundary used by authoring tools
and available to both client and server packages.

| Profile          | Contract                                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------------ |
| `compatible`     | Accepts the established `MapData` schema. An absent `authoring` block is valid, preserving all six old maps. |
| `standard-40x24` | Requires exactly 40x24 tiles at 48px and the complete version-1 `authoring` block below.                     |

If an authoring block is present under either profile, it is validated fully.
The public runtime registry remains the six established typed legacy imports.
An additive variant resolver can return a strict successor only when its caller
passes the literal server-owned `largeWorlds: true` selection; absent/false and
unowned names return the existing registry object.

Validation returns ordered issues with a stable code, JSON-style path, and
actionable message. Human-readable errors use this exact shape:

```text
[SPAWN_SEPARATION] $.authoring.spawnSafety.minimumPathDistanceTiles: spawns "spawn-a" and "spawn-b" have path distance 7, below declared 8
```

The tool exits `0` only when every requested file passes and otherwise exits
`1` after reporting all deterministic schema issues. Command/target mistakes
exit `2`.

## Version 1 schema

The established runtime fields remain authoritative:

- `name`, `width`, `height`, `tileSize`, and `tiles`;
- `spawnPoints`, `pickupSpawns`, `decorations`, and `kothHills`;
- decoration `hazard` and `interaction` values already consumed by shared and
  server destruction utilities.

The additive `authoring` block contains review and projection facts only:

| Field             | Required contract                                                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `schemaVersion`   | Literal `1`.                                                                                                                          |
| `profile`         | Literal `standard-40x24`.                                                                                                             |
| `regions`         | Lower-kebab IDs and in-bounds tile rectangles forming one complete, non-overlapping partition of the grid.                            |
| `landmarks`       | Unique IDs, one declared region, an in-bounds footprint, and `major`, `minor`, or `hidden` minimap visibility.                        |
| `minimap`         | `orthographic-top-left`, exact full-grid bounds, and the complete visible-landmark ID inventory.                                      |
| `connectivity`    | Literal single-component requirement plus named region links. A link may name an established shootable gate joining opposite regions. |
| `objectives`      | Exact KOTH 2x2 footprints matching `kothHills` plus exactly one 2x2 Core Run footprint at the existing geometric center.              |
| `spawnSafety`     | Complete stable spawn-ID inventory, an authored minimum path distance, and a declared 1-4 safe-egress-direction floor.                |
| `pickupPlacement` | Complete stable pickup-ID inventory.                                                                                                  |
| `gates`           | Complete shootable-gate decoration inventory and the two regions each gate bridges.                                                   |
| `hazards`         | Complete existing `explosive_barrel` decoration inventory and each barrel's region. No new hazard kind is introduced.                 |
| `symmetryReview`  | Rotational/horizontal/vertical proof with optional exception rectangles, or an asymmetric rationale that explicitly checks all three. |

Spawn, pickup, and relevant decoration IDs are optional on legacy maps but
required by the strict authoring profile. IDs are authoring identities; the
existing server does not use them to choose a spawn, pickup, hazard, route, or
match outcome.

Horizontal symmetry means reflection across the horizontal axis (tile `y`
changes); vertical symmetry means reflection across the vertical axis (tile
`x` changes). Rotational symmetry is a 180-degree tile transform. A declared
symmetric review verifies tiles, spawn positions, typed pickup positions, and
decoration footprints/roles. Exception rectangles identify deliberately
reviewed tile differences; they do not create runtime rules. An asymmetric
review must name all three transforms in `checkedTransforms` and explain why
the layout remains intentionally asymmetric.

## Deterministic validation

The strict profile checks all of the following without randomness or client
state:

1. document types, exact dimensions, row/column shape, tile values, borders,
   bounds, and the established base `validateMap()` rules;
2. complete region coverage with no overlap;
3. unique landmark identities, bounded footprints, declared-region contact,
   and complete minimap projection metadata;
4. one connected walkable component, a connected declared region-link graph,
   and each declared direct/gated link;
5. walkable/reachable KOTH and Core Run footprints, with exact agreement
   between `objectives` and `kothHills`;
6. at least four unique identified spawns, declared pairwise path separation,
   and declared orthogonal safe egress;
7. identified unique pickup placement, primary-component reachability, and no
   spawn/pickup cell overlap;
8. exact metadata inventories for one-cell interior shootable gates and the
   existing one-cell low-cover explosive barrels; and
9. the declared symmetry or explicit asymmetry review.

The declared separation and egress values are map-review facts, not shared
movement/combat balance constants. Batch 38 still owns cross-map pacing, mode,
and bot rebalance. The authoring validator proves that a map satisfies what its
file declares; it does not tune movement speed, stamina, damage, pickup economy,
objective timers, bot decisions, or regulation length.

## Tooling

Build shared and validate all current maps through the compatible profile:

```powershell
corepack pnpm maps:validate
```

Validate one successor arena before runtime selection:

```powershell
corepack pnpm --filter @shared/game build
node tools/reforged-maps/map-authoring.mjs validate --profile standard-40x24 shared/maps/<successor>.json
```

Run the focused schema and CLI fixtures:

```powershell
node_modules\.bin\vitest.cmd run shared/src/utils/map-authoring-validator.test.ts
corepack pnpm test:maps
```

Directory inputs are scanned recursively for JSON in stable path order. The
focused positive fixture is a complete deterministic 40x24 rotational arena;
negative fixtures cover document shape, dimensions/rows/tiles, region gaps and
overlaps, landmark footprints/identity, minimap metadata, connectivity,
objectives, spawn separation/egress, pickup reachability/duplication,
gate/hazard drift, and symmetry/asymmetry review. A separate CLI fixture proves
old-schema directory compatibility, strict-profile rejection, and JSON parse
failure behavior.

## Runtime consumption boundary

- Shared/server collision and destruction continue to consume `tiles`,
  `decorations`, `hazard`, and `interaction` exactly as before.
- Server spawn and pickup managers continue to consume the established arrays;
  authoring IDs and review metadata do not affect selection or timing.
- The client dynamic renderer, camera, HUD, and current minimap continue to use
  actual map dimensions, collision, decorations, and snapshots. They do not
  infer regions, objectives, teams, or visibility from authoring metadata.
- Wasteland Outpost, Overgrown Suburb, Scrapyard, and Collapsed Overpass have
  separately named source files but retain their exact public names. The
  authoritative server resolves their 40x24 variants only from its advertised
  `largeWorlds` capability; the client consumes that same normalized handshake
  choice with no viewport, name, local-config, or art inference and no second
  wire/map-selection surface.
- The six legacy documents remain 20x12 at tile size 48, world size 960x576,
  origin `(0, 0)`, and the same registry order/names. Checkpoint Zero and Rusted
  Refinery have no successor variant yet.
- All capabilities remain strict server-owned opt-ins and default false. This
  resolver cannot schedule, expose, default-match, or deploy an arena.

## Batch 35 authored successors

`wasteland-outpost.standard-40x24.json` preserves the badlands/command-post
identity with west/east watchtowers, open supply roads, two gate shortcuts,
paired barrel/cache pressure, three KOTH sites, and the center Core Run anchor.
Its rotationally paired structure deliberately keeps an asymmetric pickup
economy, recorded honestly in the transform review.

`overgrown-suburb.standard-40x24.json` preserves ruined rowhomes, cul-de-sacs,
park/greenway lanes, parked-car cover, two gate shortcuts, and paired
barrel/cache pressure. Unequal home footprints preserve the organic suburb
identity while the explicit horizontal/vertical/rotational review documents
comparable routes, flanks, pickup access, and escape options.

Both documents declare four quadrant spawns, ten reachable pickups, three
legal KOTH anchors, the geometric-center Core Run anchor, complete minimap
metadata, one connected walkable component, two shootable gates, and two
existing explosive barrels. Their tiles and established runtime arrays are the
only gameplay truth; region/landmark/review metadata remains declarative.

## Batch 36 authored successors

`scrapyard.standard-40x24.json` preserves compressed-car lanes, container and
salvage stacks, fenced sort lanes, and the central crusher/processing-yard
identity. Its two shootable gates create optional north/south yard shortcuts,
while paired barrels, caches, cars, and containers provide meaningful shared
destructible-cover and hazard choices.

`collapsed-overpass.standard-40x24.json` preserves divided concrete approaches,
broken road decks, north/south underpass channels, heavy central supports, and
stranded-vehicle cover. Four shootable gates join the approaches to both
underpass flanks without adding a map-specific collision or navigation rule.

Both documents declare four quadrant spawns, ten reachable pickups, three
legal KOTH anchors, the geometric-center Core Run anchor, complete minimap
metadata, one connected walkable component, existing explosive-barrel hazards,
and an explicit asymmetric review of horizontal, vertical, and rotational
transforms. Their tiles and established runtime arrays are the only gameplay
truth; region/landmark/review metadata remains declarative.

## Scope boundary

Batch 34 owns the schema, validator, fixtures, and CLI. Batch 35 owns the first
two successor layouts and minimal resolver; Batch 36 owns only Scrapyard and
Collapsed Overpass in that resolver; Batch 37 owns Checkpoint Zero and Rusted
Refinery. Batch 38 owns mode/bot rebalance; Batch 39 owns the Reforged Arena
release gate and any production exposure. Tactical-map gameplay,
Battle Royale regions, containers, loot, rarity, safe zones, spectating, new
hazards, and production deployment remain outside this contract.
