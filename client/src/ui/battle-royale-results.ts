import type { PlayerId } from '@shared/types/common.js';
import type { PlayerStats } from '@shared/types/player.js';
import type { BattleRoyalePlacementStatus, MatchResult } from '@shared/types/game.js';

export interface BattleRoyaleStandingPresentation {
  readonly playerId: PlayerId;
  readonly placement: number;
  readonly status: BattleRoyalePlacementStatus;
  readonly nickname: string;
  readonly stats: PlayerStats | null;
}

export interface BattleRoyaleResultsPresentation {
  readonly standings: readonly BattleRoyaleStandingPresentation[];
  readonly hasAuthoritativePlacements: boolean;
  readonly canLeave: boolean;
  readonly canSpectate: boolean;
}

/**
 * Pure projection of the optional server result. Old-server payloads remain
 * usable but never cause the client to invent placements or a winner.
 */
export function battleRoyaleResultsPresentation(
  result: MatchResult | null,
): BattleRoyaleResultsPresentation | null {
  if (result?.matchKind !== 'battle_royale') return null;
  const stats =
    result.playerStats instanceof Map
      ? result.playerStats
      : new Map(Object.entries(result.playerStats as unknown as Record<string, PlayerStats>));
  const placements = result.battleRoyale?.placements ?? [];
  const standings = placements
    .filter(
      (placement, index) =>
        Number.isSafeInteger(placement.placement) &&
        placement.placement > 0 &&
        placements.findIndex((candidate) => candidate.playerId === placement.playerId) === index,
    )
    .map((placement) => ({
      ...placement,
      nickname: result.playerNicknames?.[placement.playerId] ?? 'FIGHTER',
      stats: stats.get(placement.playerId) ?? null,
    }))
    .sort(
      (left, right) =>
        left.placement - right.placement || left.playerId.localeCompare(right.playerId),
    );
  return {
    standings,
    hasAuthoritativePlacements: result.battleRoyale !== undefined,
    canLeave: result.battleRoyale?.actions.canLeave ?? true,
    canSpectate: result.battleRoyale?.actions.canSpectate ?? false,
  };
}

export function battleRoyaleOutcomeTitle(
  result: MatchResult | null,
  localPlayerId: PlayerId | null,
): string | null {
  const presentation = battleRoyaleResultsPresentation(result);
  if (!presentation) return null;
  const local = presentation.standings.find((standing) => standing.playerId === localPlayerId);
  if (local?.status === 'winner') return 'VICTORY ROYALE';
  if (local?.status === 'drawn') return 'FINAL FIGHTERS DRAW';
  return local ? `PLACED #${local.placement}` : 'BATTLE ROYALE RESULTS';
}
