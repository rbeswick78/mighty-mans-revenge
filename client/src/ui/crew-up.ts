import { BOT } from '@shared/config/game.js';
import type { PlayerId } from '@shared/types/common.js';
import type { TeamId } from '@shared/types/game.js';

interface CrewUpMatchData {
  opponents: ReadonlyArray<{ id: PlayerId; nickname: string }>;
  playerTeams?: Readonly<Record<PlayerId, TeamId>>;
}

/** Name the server-authored ally and distinguish a real friend from Rusty's fallback. */
export function crewUpBriefingLabel(
  matchData: CrewUpMatchData,
  localPlayerId: PlayerId | null,
): string | null {
  if (!localPlayerId || !matchData.playerTeams) return null;
  const localTeam = matchData.playerTeams[localPlayerId];
  if (!localTeam) return null;
  const ally = matchData.opponents.find(
    (opponent) => matchData.playerTeams?.[opponent.id] === localTeam,
  );
  if (!ally) return null;
  const nickname = ally.nickname.trim().toUpperCase() || 'ALLY';
  return ally.id.startsWith(BOT.PLAYER_ID_PREFIX)
    ? `ALLY: ${nickname} // RUSTY FILLED IN`
    : `HUMAN ALLY: ${nickname} // CREWED UP`;
}
