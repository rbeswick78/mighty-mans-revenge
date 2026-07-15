import type { PlayerId } from '@shared/types/common.js';
import type { MatchResult } from '@shared/types/game.js';
import type { ArenaWins } from '@shared/types/map.js';
import type { DraftPlayer } from '@shared/types/network.js';

/** Retain only the local player's existing server-authored draft snapshot. */
export function localArenaWinsFromDraft(
  players: readonly DraftPlayer[],
  localPlayerId: PlayerId | null,
): ArenaWins | null {
  if (localPlayerId === null) return null;
  const arenaWins = players.find((player) => player.id === localPlayerId)?.arenaWins;
  return arenaWins ? { ...arenaWins } : null;
}

/** Merge the authoritative just-finished arena total into the retained snapshot. */
export function mergeArenaWinsFromResult(
  previous: Readonly<ArenaWins> | null,
  result: MatchResult,
  localPlayerId: PlayerId | null,
): ArenaWins | null {
  if (localPlayerId === null) return previous ? { ...previous } : null;
  const mastery = result.arenaMastery?.[localPlayerId];
  if (!mastery) return previous ? { ...previous } : null;
  return { ...(previous ?? {}), [mastery.mapName]: mastery.wins };
}
