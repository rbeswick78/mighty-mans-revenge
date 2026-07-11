import type { MatchResult } from '@shared/types/game.js';
import { gameModeDisplayName } from '@shared/config/game.js';

/** Compact set + lifetime line sized for the results screen's single strip. */
export function formatRivalrySummary(result: MatchResult): string | null {
  const parts: string[] = [];
  const set = result.rivalrySet;
  if (set && set.players.length === 2) {
    const [a, b] = set.players;
    if (set.championId !== null) {
      const champion = set.players.find((player) => player.playerId === set.championId);
      parts.push(
        `SET CHAMPION: ${(champion?.nickname ?? 'UNKNOWN').toUpperCase()}` +
          `  ${a.wins}-${b.wins}`,
      );
    } else {
      parts.push(
        `SET R${set.roundsPlayed}: ${a.nickname.toUpperCase()} ${a.wins}` +
          `-${b.wins} ${b.nickname.toUpperCase()}  (FIRST TO ${set.winsToClinch})`,
      );
    }
  }

  const rivalry = result.rivalry;
  if (rivalry) {
    const draws = rivalry.draws > 0 ? `, ${rivalry.draws}D` : '';
    parts.push(
      `ALL-TIME: ${rivalry.nicknameA.toUpperCase()} ${rivalry.winsA}` +
        `-${rivalry.winsB} ${rivalry.nicknameB.toUpperCase()}${draws}`,
    );
  }
  return parts.length > 0 ? parts.join('  |  ') : null;
}

/** Results-screen promise for how the next draft's first picker is chosen. */
export function nextDraftTeaser(result: MatchResult): string {
  if (result.isPractice && result.nextMapName && result.nextGameMode) {
    return (
      `NEXT: ${gameModeDisplayName(result.nextGameMode)} - ` +
      result.nextMapName.toUpperCase()
    );
  }
  if (result.winnerId === null || !result.rivalrySet) {
    return 'NEXT: COIN TOSS PICKS WHO DRAFTS MAP + MODE';
  }
  const loser = result.rivalrySet.players.find((player) => player.playerId !== result.winnerId);
  if (!loser) return 'NEXT: COIN TOSS PICKS WHO DRAFTS MAP + MODE';
  const prefix = result.rivalrySet.championId !== null ? 'NEW SET: ' : 'NEXT: ';
  return `${prefix}${loser.nickname.toUpperCase()} GETS THE REVENGE PICK`;
}

export function rematchButtonLabel(result: MatchResult | null): string {
  return result?.rivalrySet?.championId != null ? 'NEW SET' : 'NEXT ROUND';
}
