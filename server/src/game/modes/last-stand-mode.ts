import { GameModeType, LAST_STAND } from '@shared/game';
import type {
  KillWeapon,
  MatchResult,
  PlayerId,
  PlayerState,
} from '@shared/game';
import { computeAwards } from '../awards.js';
import type { GameMode, MatchContext } from './game-mode.js';

/**
 * Stock-lives elimination. PlayerState.score is lives remaining, so every
 * existing snapshot, scoreboard, bot, result transition, and spectator sees
 * the authoritative stock without another wire field.
 */
export class LastStandMode implements GameMode {
  onStart(match: MatchContext): void {
    for (const player of match.players.values()) {
      player.score = LAST_STAND.STARTING_LIVES;
    }
  }

  onTick(_match: MatchContext, _dt: number): void {
    // The mode is event-driven; the shared Match owns combat and timers.
  }

  onKill(
    match: MatchContext,
    _killerId: PlayerId,
    victimId: PlayerId,
    _weapon: KillWeapon,
  ): void {
    // Overtime is already first-kill-wins. Preserve regulation stocks so a
    // timeout draw remains a true draw if nobody lands that kill.
    if (match.isOvertime) return;
    const victim = match.players.get(victimId);
    if (victim) victim.score = Math.max(0, victim.score - 1);
  }

  canRespawn(_match: MatchContext, player: PlayerState): boolean {
    return player.score > 0;
  }

  isMatchOver(match: MatchContext): boolean {
    if (match.matchTimer <= 0) return true;
    if (match.players.size <= 1) return false;
    let contenders = 0;
    for (const player of match.players.values()) {
      if (player.score > 0) contenders++;
    }
    return contenders <= 1;
  }

  determineWinner(match: MatchContext): PlayerId | null {
    const players = [...match.players.values()].sort((a, b) => b.score - a.score);
    if (players.length === 0) return null;
    const top = players[0];
    const second = players[1];
    if (second && top.score === second.score) return null;
    return top.id;
  }

  getResults(match: MatchContext): MatchResult {
    const playerStats = match.stats.getAllStats();
    return {
      matchId: match.matchId,
      winnerId: this.determineWinner(match),
      playerStats,
      duration: match.getElapsedSeconds(),
      gameMode: GameModeType.LAST_STAND,
      awards: computeAwards(
        playerStats,
        (id) => match.players.get(id)?.nickname ?? 'UNKNOWN',
      ),
      rivalry: null,
      rivalrySet: null,
      isPractice: false,
      nextMapName: null,
      nextGameMode: null,
      wentToOvertime: match.isOvertime,
    };
  }
}
