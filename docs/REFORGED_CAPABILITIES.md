# Reforged Server Capabilities

Batch 3 establishes the compatibility boundary for Reforged work. Capabilities
are server-owned feature gates advertised on the existing reliable
`server:welcome` message. They describe what the connected server is ready to
support; they do not move authority to the client or implement the gated
feature.

## Capability registry

| Wire key       | Server flag                | Owned feature                         | Batch 3 default |
| -------------- | -------------------------- | ------------------------------------- | --------------- |
| `newShell`     | `CAPABILITY_NEW_SHELL`     | Five-tab responsive menu shell        | `false`         |
| `schedules`    | `CAPABILITY_SCHEDULES`     | Server-owned scheduled arenas         | `false`         |
| `largeWorlds`  | `CAPABILITY_LARGE_WORLDS`  | Scrolling worlds and large arenas     | `false`         |
| `modernArt`    | `CAPABILITY_MODERN_ART`    | Coherent modern presentation cutover  | `false`         |
| `battleRoyale` | `CAPABILITY_BATTLE_ROYALE` | Battle Royale routes and match family | `false`         |

Flags are strict opt-ins: only the literal environment value `true` advertises
a capability. Unset values, `false`, `1`, case variants, malformed values, and
missing fields remain disabled. Batch 3 does not authorize any production flag
to be enabled.

## Handshake compatibility

`ServerWelcomeMessage.capabilities` is optional and every member is treated as
optional at the compatibility boundary. The client normalizes the untrusted
snapshot into all five booleans and accepts only literal `true`. It resets to
the fully disabled snapshot before a new/reconnecting handshake and on
disconnect.

| Server | Client | Required result                                                                         |
| ------ | ------ | --------------------------------------------------------------------------------------- |
| Old    | Old    | Existing welcome and routes continue unchanged.                                         |
| Old    | New    | Missing capabilities normalize to all false; every existing route remains available.    |
| New    | Old    | The old client reads `type` and `playerId` and ignores the additive capabilities field. |
| New    | New    | The server snapshot is authoritative; absent, partial, or invalid fields fail closed.   |

Disabled capabilities must not hide, redirect, or replace any current route.
The current Lobby, Draft, Character Select, challenge, match, and Results paths
remain the fallback until the owning batch adds a tested gated alternative.

Batch 4 adds the first such alternative only for `newShell`: a menu-only
1280×720 five-tab foundation. The client routes there after the normalized
welcome only when `newShell` is literal `true`; reconnect, disconnect, old
servers, and false/absent/partial/malformed advertisements retain or restore the
complete 960×720 Lobby. The shell contains no activities yet, every production
default remains false, and its logical size does not alter gameplay.

Batch 10 implements the `schedules` contract without exposing it by default.
An enabled server sends the additive reliable `server:lobbyConfig` message on
connect and refreshes each player from authoritative server time once per
whole second. Every accepted snapshot contains all standard modes, one
server-derived registered map per mode, the five-minute rotation deadline,
and optional valid `FORCE_MODE` plus a server-owned queue-entry lock. The
client validates the entire snapshot atomically and may render only the
server-supplied outcome and clock delta. A missing, partial, malformed, stale,
or disconnected snapshot, or a non-literal/disabled `schedules` capability,
fails closed to the fixed Batch 5 Play preview. Older clients ignore the
additive message; newer clients retain that preview against old servers. The
server lock/release boundary is consumed by Batch 11's generalized match
intent, while schedule derivation remains entirely server-owned.

Batch 11 adds the additive `client:submitMatchIntent` compatibility message for
servers that advertise both `newShell` and `schedules`. The payload carries one
explicit Duel, Rumble, or Crew format, an exact compatible human/bot
composition, a format-valid standard mode, the persisted fighter choice, and
an echo of the displayed scheduled arena. The server normalizes every field,
creates its own queue-entry lock, and queues only when that authoritative lock
exactly matches the echo. Exact compatible groups launch with the requested
mode/map and server-owned fighter locks; standard bot slots use the established
Scrapper baseline. Malformed, stale, incompatible, duplicate, replayed,
disconnected, or capability-off requests do not enter a queue or choose random
client-authored replacements. The legacy Duel/Rumble/Crew join messages remain
available for compatibility, and all production capability defaults remain
false.

Batch 12 adds additive create/join/leave/kick/intent/fighter party messages and
complete authoritative `server:partyState`, `server:partyLeft`, and
`server:partyError` projections behind the same enabled `newShell` plus
`schedules` boundary. Old clients ignore those server messages and continue to
use legacy or generalized solo entry. New clients against old, partial, or
capability-off servers retain the established fixed preview or complete Lobby
fallback and never invent party state. Enabled servers normalize codes and
links, callsigns, fighters, formats, exact human capacity, scheduled intent,
party/version ownership, leader actions, and replay ids before mutation. Rooms
are memory-only; Batch 12 fixed leadership to the creator and kept empty codes
reserved for one minute before expiry. No capability default or production
exposure changed.

Batch 13 extends that same enabled boundary with additive, versioned
`client:setPartyReady` and `client:cancelPartyQueue` requests. Complete
`server:partyState` snapshots now carry readiness, explicit occupied/open human
slots, deterministic earliest-member leadership, lifecycle, and optional match
identity. A room may wait while every current member is ready but requested
human slots remain open; it enters Batch 11's existing per-player schedule-lock
and explicit-intent launch only when full. Intent/fighter changes, cancellation,
leave, kick, and disconnect clear readiness. Disconnect removes only that
connection, transfers leadership when necessary, and leaves an authoritative
open slot that a new connection may rejoin by code/link. Party identity remains
server-owned through match, Results, and valid rematches. Stale, replayed,
duplicate, lifecycle-invalid, schedule-drifted, capability-off, and malformed
requests fail closed. Batch 14's 15-second confirmed bot-fill offer is not
present, no human slot changes source automatically, and all production defaults
remain false.

Batch 14 adds the leader-only, versioned `client:confirmPartyBotFill` mutation
behind the same enabled boundary. When all connected party humans are ready and
requested human slots remain open, the server projects a complete waiting offer
and advances it to available from a monotonic 15-second clock. The client does
not calculate availability, and the server never changes participant sources
without confirmation. A valid confirmation revalidates the normalized intent
and current schedule lock, replaces only those still-open requested human slots
with the established standard Scrapper bots, and launches through Batch 11's
existing authority. Cancellation, roster/readiness/intent/fighter mutation,
disconnect, and reconnect remove the offer. Early, unauthorized, malformed,
stale, duplicate, replayed, expired-schedule, old-server, and capability-off
paths fail closed without queue residue. Results/rematch presentation remains
Batch 15 scope, and all production defaults remain false.

Batch 15 adds complete participant and rematch projections to the existing
`server:partyState` contract plus the additive, versioned
`client:requestPartyRematch` mutation behind enabled `newShell` and `schedules`.
During Results, the server publishes the retained party format, human and
confirmed standard-bot entrants, locked fighters, human consensus, prior
queue-entry arena, current scheduled arena, explicit mode, arena-change
decision, eligibility, expiry, and lifecycle/match identity. Clients replace
that projection atomically and never calculate membership, source, readiness,
eligibility, or schedule outcomes. A valid rematch requires fresh unanimous
human requests and revalidation of roster, bot composition, format/mode,
fighter locks, current schedule locks, lifecycle, versions, post-match state,
and live connection mappings before Batch 11's explicit launch path runs.
Schedule drift clears old votes and uses the newly active arena while retaining
the selected mode. Stale, duplicate, replayed, disconnected, invalidated,
timed-out, failed-launch, old-server, and capability-off paths fail closed;
generic rematch messages cannot bypass retained party authority. Practice and
legacy Results remain unchanged, all capability defaults remain false, and
Batch 16 owns standard Draft/Character Select routing retirement.

Batch 16 adds an optional, complete `standardMatch` projection to
`server:matchFound` for capability-owned Duel, Rumble, and Crew launches. The
server emits it only after generalized-intent, party, confirmed bot-fill, or
retained-party rematch authority has revalidated the exact format,
composition, participant sources, locked fighters, explicit mode, scheduled
arena, and Crew teams. A client may bypass Draft and Character Select only
when both `newShell` and `schedules` are enabled and that projection validates
against the outer match envelope and local human identity. Missing projections
from old servers retain the complete legacy route when capabilities are off;
Practice and every challenge route retain their established setup. Partial,
malformed, contradictory, duplicate-participant, source-drifted, team-drifted,
or capability-drifted projections fail closed and return to Lobby without
inventing match state. Legacy scene code and transitional messages remain for
fallback compatibility through Batch 54. All capability defaults remain false
and no production capability changed.

Batch 18 gives `largeWorlds` its first client-owned presentation boundary
without enabling scrolling or large arenas. A literal normalized
`largeWorlds: true` welcome makes `GameScene` use a fixed 1280×720 logical 16:9
FIT surface and exposes a browser-safe-area overlay contract in those same
logical coordinates. Desktop and mobile receive exactly the same logical world
view. Missing, partial, malformed, false, reconnecting, disconnected, and old-
server advertisements retain or restore the established 960×720 gameplay
surface. Results and every compatibility/menu setup scene retain their owning
legacy or Reforged-menu size. Current 960×576 maps, coordinates, camera state,
render targets, HUD geometry, physics, simulation, and wire contracts do not
change in this batch. The capability remains strict, server-owned, and default
false; Batches 19-24 own transforms, camera, dynamic rendering, HUD, minimap,
and the regression gate before any large arena can be exposed.

Batch 19 centralizes the client-only coordinate-domain boundary behind that
same default-false capability without changing capability negotiation or
exposure. Gameplay screen and world points are explicit; pointer aim and touch
direction use the live camera transform; current fixed-map touch admission
checks transformed world Y; cursor/touch/full-screen overlays are screen-pinned;
and objectives, fighter markers, and particles are world-space. At the retained
camera origin and zoom the transform is identity, so old-server, false/absent/
malformed capability, reconnect, and disconnect paths keep exact 960x720
behavior while enabled desktop and mobile keep one 1280x720 logical view.
Camera follow, clamping, transient composition, scrolling, dynamic rendering,
HUD migration, and capability exposure remain later-batch work.

Batch 20 adds one client-only gameplay camera controller behind the same
default-false `largeWorlds` boundary without changing negotiation or exposure.
The controller follows explicit world-space local-player, respawn, and
spectator targets, clamps its base view to every world edge, and keeps worlds
smaller than the logical viewport anchored at their authored origin. Recoil,
shake, zoom, and roll compose as transient layers and cannot overwrite base
scroll or zoom. The Batch 19 coordinate service remains the sole transform for
aim and presentation while camera state changes. Because all current maps stay
960x576 at `(0, 0)`, both enabled 1280x720 gameplay and old-server, false,
absent, malformed, reconnect, and disconnect 960x720 fallback paths retain
base scroll `(0, 0)` today. Dynamic render resources, responsive HUD, minimap,
larger arenas, physics, simulation, wire contracts, production defaults, and
capability exposure remain unchanged.

Batch 21 replaces fixed-playfield rendering resources behind the same
default-false `largeWorlds` boundary without changing negotiation or exposure.
The client derives actual world bounds from the selected registered map,
partitions map and persistent decal presentation into 8x8-tile chunks, culls
those chunks from the live Batch 19 coordinate transform, and sizes lighting
plus storm/X-ray screen resources from the smaller of the actual world and
logical viewport. Authoritative tile-destruction events continue to mutate the
same client prediction grid and now rebuild affected decal masks/resources,
including chunk seams. Pooled cosmetic effects and lights consume automatic
full/reduced quality budgets; no quality decision changes authoritative state.
Current maps remain 960x576 at `(0, 0)`, so capability-off and old-server
960x720 gameplay, enabled desktop/mobile logical visibility, camera clamps,
transitional HUD, physics, simulation, wire contracts, capability defaults,
and production exposure remain unchanged. Batch 22 owns HUD migration.

Batch 22 replaces the transitional combat HUD only when normalized
`largeWorlds` is literal true. One client-owned logical layout consumes Batch
18's safe-area bounds for every combat resource, mode status, timer, kill feed,
contract, briefing, callout lane, touch action, and confirmed match menu without
changing the fixed 1280x720 logical view or deriving gameplay state from screen
coordinates. All existing authoritative snapshots, reliable events, mode
visibility/unit rules, input actions, and leave confirmation remain intact.
False, absent, partial, malformed, reconnecting, disconnected, and old-server
paths retain the exact 960x720 HUD and Lobby behavior. The capability remains
strict, server-owned, and default false; Batch 23 owns minimap work.

Batch 23 adds the capability path's non-interactive minimap without changing
negotiation or exposure. It projects the selected registered map's actual
bounds, the complete mutable collision grid, surviving authored decoration
landmarks, owning-mode KOTH/Kill Confirmed/Core Run/Bounty Hunt snapshot state,
the local gameplay position, and exact server-authored Crew allies. Generic
rivals stay hidden and no team, objective, or visibility rule comes from
callsigns, screen coordinates, camera state, visible chunks, or viewport
resources. Reliable tile destruction refreshes solids and landmarks. The map
overlay consumes the existing logical safe area without widening desktop/mobile
visibility or adding a tactical-map/input action. False, absent, partial,
malformed, reconnecting, disconnected, and old-server paths retain exact
960x720 gameplay and Lobby behavior with no minimap. The capability remains
strict, server-owned, and default false; Batch 24 owns the cumulative camera
regression gate.

Batch 24 completes that cumulative verification gate without changing the
`largeWorlds` handshake, fallback, or exposure state. Full deterministic,
three-project browser, recorder, and visual evidence covers the 1280x720
capability-owned viewport, safe area, sole coordinate transform, sole camera
controller, dynamic resources/quality tiers, responsive HUD, minimap,
Results/rematch/recovery, and the exact 960x720 capability-off/old-server path.
RFG-001 and RFG-002 retain their exact historical regression values. RFG-003
is gate-dispositioned with staged Firefox/WebKit object/input assertions plus
direct non-black Phaser renderer snapshots; Chromium remains the live and
compositor visual reference. All capabilities still require literal server-
owned `true`, default false, and remain unadvertised in production. Batch 24
does not authorize Batch 25 visual work, larger arenas, capability exposure,
or deployment.

Batch 31 adds a registered biome environment atlas without changing the
`modernArt` handshake, fallback, or exposure state. Literal `modernArt: true`
permits the isolated verification preview only; live map rendering still uses
the complete legacy tile, decoration, damage, and procedural paths. False,
absent, malformed, reconnecting, disconnected, and old-server paths never
instantiate environment-kit presentation. No capability default, map/collision
authority, destruction lifecycle, physics, wire contract, production exposure,
or deployment changes. Batch 33 remains the owner of coherent live cutover.

Batch 32 adds a registered combat-feedback atlas and one capability-owned,
preallocated client renderer without changing the `modernArt` handshake,
fallback, or exposure state. Literal `modernArt: true` plus a valid atlas may
add modern cues beside retained legacy presentation for existing muzzle,
scenery/confirmed-player impact, grenade explosion, healing, armor, fighter
ability, and elimination events. Confirmed-player feedback still requires the
existing authoritative hit fields; explosion presentation uses the unchanged
shared grenade radius. Rarity and zone frames are registered for verification
preview only and have no live caller. False, absent, malformed, reconnecting,
disconnected, old-server, and missing-atlas paths never instantiate the new
renderer. No capability default, event authority, gameplay rule, wire
contract, production exposure, or deployment changes. Batch 33 still owns one
coherent live visual cutover and any verified legacy retirement.

Batch 33 makes `modernArt` an atomic six-atlas presentation selection without
changing the handshake, normalization, default, or rollout order. Literal
server-owned `modernArt: true` selects modern UI, both fighter sets, current
weapon/pickup presentation, current-map biome projection, and combat feedback
only when every completed atlas is registered and compatible. A false, absent,
malformed, reconnecting, disconnected, old-server, or single missing-atlas
case selects the complete registered legacy/procedural owner instead of a mixed
journey. Recovery and scene recreation reevaluate the same selector. Current
960x576 maps, collision/destruction, matchmaking/party, snapshots/events,
Results/rematch, persistence, and the 20Hz server remain authoritative and
unchanged. Production still advertises no Reforged capability; Batch 33 does
not authorize exposure or deployment.

Batch 34 adds the shared `standard-40x24` authoring profile without changing
any capability handshake, normalization, default, or rollout step. The six
registered maps remain old-schema-compatible 20x12 arenas and continue to load
through their established runtime path. A future 40x24 document must pass the
versioned regions/landmarks/minimap/connectivity/objective/spawn/pickup/gate/
hazard/symmetry contract before a later batch may register it, but validation
alone cannot advertise `largeWorlds`, add it to schedules or matchmaking, or
change client/server authority. All five capabilities remain literal server-
owned opt-ins and default false; Batch 39 still owns Reforged Arena exposure.

## Server-first rollout and rollback

For each capability, keep this order:

1. Add and deploy the server contract and any server-owned feature support with
   the capability still false. Older clients must continue to work.
2. Add and deploy the capability-aware client path behind the normalized
   server flag. An old server or false flag must keep the established route.
3. Complete the owning batches, release gate, automated verification, and real
   tester sign-off while production remains false.
4. Deploy the final server support before exposure, then change only the server
   environment flag to `true` and restart the server. This makes the server the
   point that authorizes the client path.
5. Smoke the advertised path and health checks. To roll back, set the server
   flag to `false` first; compatible clients immediately return to the retained
   fallback without requiring a client rollback.

Do not advertise a capability merely because partial client code exists. The
roadmap's milestone gates, not the presence of an environment variable, decide
when production exposure is authorized.
