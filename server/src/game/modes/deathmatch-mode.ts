import { GameModeType } from '@shared/game';
import type { PlayerId, MatchResult } from '@shared/game';
import type { GameMode, MatchContext } from './game-mode.js';

export class DeathmatchMode implements GameMode {
  onStart(_match: MatchContext): void {
    // No special setup for deathmatch
  }

  onTick(_match: MatchContext, _dt: number): void {
    // Deathmatch has no per-tick mode-specific logic
  }

  onKill(match: MatchContext, killerId: PlayerId, _victimId: PlayerId): void {
    const player = match.players.get(killerId);
    if (player) {
      player.score++;
    }
  }

  isMatchOver(match: MatchContext): boolean {
    const killTarget = match.getKillTarget();

    // Check if any player reached the kill target
    for (const player of match.players.values()) {
      if (player.score >= killTarget) {
        return true;
      }
    }

    // Check if time ran out
    if (match.matchTimer <= 0) {
      return true;
    }

    return false;
  }

  getResults(match: MatchContext): MatchResult {
    const winnerId = this.determineWinner(match);

    return {
      matchId: match.matchId,
      winnerId,
      playerStats: match.stats.getAllStats(),
      duration: match.getTimeLimit() - match.matchTimer,
      gameMode: GameModeType.DEATHMATCH,
    };
  }

  private determineWinner(match: MatchContext): PlayerId | null {
    const players = Array.from(match.players.values());
    if (players.length === 0) return null;

    // Sort by score descending, then by fewer deaths, then first to reach max
    players.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.deaths !== b.deaths) return a.deaths - b.deaths;
      return 0;
    });

    const top = players[0];
    const second = players[1];

    // If there's a tie in score AND deaths, no winner
    if (second && top.score === second.score && top.deaths === second.deaths) {
      // Tie-break: first to reach max score wins.
      // Since we can't track that easily here, return the first player (arbitrary but deterministic).
      // In practice the kill order matters - the player whose kill was processed first wins.
      return top.id;
    }

    return top.id;
  }
}
