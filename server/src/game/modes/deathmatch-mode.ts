import { GameModeType } from '@shared/game';
import type { PlayerId, MatchResult, KillWeapon } from '@shared/game';
import { computeAwards } from '../awards.js';
import type { GameMode, MatchContext } from './game-mode.js';

export class DeathmatchMode implements GameMode {
  onStart(_match: MatchContext): void {
    // No special setup for deathmatch
  }

  onTick(_match: MatchContext, _dt: number): void {
    // Deathmatch has no per-tick mode-specific logic
  }

  onKill(match: MatchContext, killerId: PlayerId, _victimId: PlayerId, _weapon: KillWeapon): void {
    const player = match.players.get(killerId);
    if (player) {
      player.score++;
    }
  }

  isMatchOver(match: MatchContext): boolean {
    const killTarget = match.getKillTarget();

    const teams = match.getTeamIds?.() ?? [];
    if (teams.length > 0 && match.getTeamScore) {
      return (
        teams.some((teamId) => match.getTeamScore!(teamId) >= killTarget) || match.matchTimer <= 0
      );
    }

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
    const playerStats = match.stats.getAllStats();

    return {
      matchId: match.matchId,
      winnerId,
      playerStats,
      duration: match.getElapsedSeconds(),
      gameMode: GameModeType.DEATHMATCH,
      awards: computeAwards(playerStats, (id) => match.players.get(id)?.nickname ?? 'UNKNOWN'),
      // Attached by the matchmaking manager once the persistent store has
      // folded this match in — the mode has no access to lifetime records.
      rivalry: null,
      rivalrySet: null,
      isPractice: false,
      // Also the matchmaking manager's job — modes know nothing about the
      // map/mode rotation.
      nextMapName: null,
      nextGameMode: null,
      wentToOvertime: match.isOvertime,
    };
  }

  determineWinner(match: MatchContext): PlayerId | null {
    const teams = match.getTeamIds?.() ?? [];
    if (teams.length > 0 && match.getTeamScore && match.getTeamId) {
      const rankedTeams = teams
        .map((teamId) => ({ teamId, score: match.getTeamScore!(teamId) }))
        .sort((left, right) => right.score - left.score);
      if (rankedTeams.length > 1 && rankedTeams[0].score === rankedTeams[1].score) return null;
      return (
        [...match.players.values()].find(
          (player) => match.getTeamId!(player.id) === rankedTeams[0].teamId,
        )?.id ?? null
      );
    }

    const players = Array.from(match.players.values());
    if (players.length === 0) return null;

    // Sort by score descending, then by fewer deaths.
    players.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.deaths !== b.deaths) return a.deaths - b.deaths;
      return 0;
    });

    const top = players[0];
    const second = players[1];

    // Equal score AND equal deaths is a genuine tie — report it as one so
    // the match flows into sudden-death overtime (and, if overtime also
    // resolves nothing, ends as a true draw).
    if (second && top.score === second.score && top.deaths === second.deaths) {
      return null;
    }

    return top.id;
  }
}
