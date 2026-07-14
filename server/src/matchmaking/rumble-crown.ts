import type { PlayerId, RumbleCrownResult, RumbleCrownState } from '@shared/game';

interface RumbleCrownEntrant {
  id: PlayerId;
  nickname: string;
}

/**
 * Resolve the social crown without touching score, matchmaking, or lifetime stats.
 * Draws preserve a present holder; a departed holder cannot haunt the next round.
 */
export function resolveRumbleCrown(
  previous: RumbleCrownState | null,
  winnerId: PlayerId | null,
  entrants: readonly RumbleCrownEntrant[],
  connectedPlayerIds: readonly PlayerId[],
): RumbleCrownResult {
  const connected = new Set(connectedPlayerIds);
  const previousPresent = previous !== null && connected.has(previous.holderId);
  const previousHolderId = previous?.holderId ?? null;
  const previousHolderNickname = previous?.holderNickname ?? null;

  if (winnerId === null) {
    return {
      crown: previousPresent ? previous : null,
      outcome: previousPresent ? 'held' : 'unclaimed',
      previousHolderId,
      previousHolderNickname,
    };
  }

  const winner = entrants.find((entrant) => entrant.id === winnerId);
  const holderNickname = winner?.nickname ?? `Player_${winnerId.slice(0, 4)}`;
  if (previousPresent && previous.holderId === winnerId) {
    return {
      crown: { holderId: winnerId, holderNickname, wins: previous.wins + 1 },
      outcome: 'defended',
      previousHolderId,
      previousHolderNickname,
    };
  }

  return {
    crown: { holderId: winnerId, holderNickname, wins: 1 },
    outcome: previousPresent ? 'stolen' : 'claimed',
    previousHolderId,
    previousHolderNickname,
  };
}
