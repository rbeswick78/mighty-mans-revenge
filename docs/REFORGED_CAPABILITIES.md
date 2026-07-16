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
