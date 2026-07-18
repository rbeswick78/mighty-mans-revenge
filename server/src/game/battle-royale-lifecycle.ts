import type {
  BattleRoyalePlacement,
  BattleRoyaleResult,
  BattleRoyaleTerminalReason,
  PlayerId,
  PlayerState,
} from '@shared/game';

export type BattleRoyaleEliminationCause = 'combat' | 'departure';

interface EliminationEvent {
  readonly playerId: PlayerId;
  readonly cause: BattleRoyaleEliminationCause;
  readonly sequence: number;
  readonly simulationStep: number;
}

export interface BattleRoyaleResolution extends BattleRoyaleResult {
  readonly winnerId: PlayerId | null;
}

/**
 * Server-only one-life ledger. It records authoritative elimination edges and
 * derives placements only from immutable entrant identity plus event order.
 */
export class BattleRoyaleLifecycle {
  private readonly entrantIds: readonly PlayerId[];
  private readonly eliminations = new Map<PlayerId, EliminationEvent>();
  private nextSequence = 0;

  constructor(entrantIds: readonly PlayerId[]) {
    if (new Set(entrantIds).size !== entrantIds.length) {
      throw new Error('Battle Royale entrants must be unique');
    }
    this.entrantIds = Object.freeze([...entrantIds]);
  }

  recordElimination(
    playerId: PlayerId,
    cause: BattleRoyaleEliminationCause,
    simulationStep: number,
  ): boolean {
    if (!this.entrantIds.includes(playerId) || this.eliminations.has(playerId)) return false;
    this.nextSequence += 1;
    this.eliminations.set(playerId, {
      playerId,
      cause,
      sequence: this.nextSequence,
      simulationStep,
    });
    return true;
  }

  isEliminated(playerId: PlayerId): boolean {
    return this.eliminations.has(playerId);
  }

  resolve(players: ReadonlyMap<PlayerId, PlayerState>): BattleRoyaleResolution | null {
    const livingIds = this.entrantIds.filter((playerId) => {
      const player = players.get(playerId);
      return player !== undefined && !player.isDead && !this.eliminations.has(playerId);
    });
    if (this.entrantIds.length > 1 && livingIds.length > 1) return null;
    if (this.entrantIds.length === 0) return null;

    const orderedEliminations = [...this.eliminations.values()].sort(
      (left, right) =>
        left.sequence - right.sequence || left.playerId.localeCompare(right.playerId),
    );
    const winnerId = livingIds.length === 1 ? livingIds[0] : null;
    const finalEvent = orderedEliminations.at(-1);
    const finalCombatCohort =
      winnerId === null && finalEvent?.cause === 'combat'
        ? orderedEliminations.filter(
            (event) =>
              event.cause === 'combat' && event.simulationStep === finalEvent.simulationStep,
          )
        : [];
    const tiedFirstIds = new Set(
      finalCombatCohort.length >= 2 ? finalCombatCohort.map((event) => event.playerId) : [],
    );
    const terminalReason = this.terminalReason(winnerId, orderedEliminations, tiedFirstIds.size);

    const placements: BattleRoyalePlacement[] = [];
    if (winnerId !== null) {
      placements.push({ playerId: winnerId, placement: 1, status: 'winner' });
    }
    orderedEliminations.forEach((event, index) => {
      placements.push({
        playerId: event.playerId,
        placement: tiedFirstIds.has(event.playerId) ? 1 : this.entrantIds.length - index,
        status: tiedFirstIds.has(event.playerId)
          ? 'drawn'
          : event.cause === 'departure'
            ? 'departed'
            : 'eliminated',
      });
    });
    placements.sort(
      (left, right) =>
        left.placement - right.placement || left.playerId.localeCompare(right.playerId),
    );

    return {
      winnerId,
      placements,
      terminalReason,
      actions: { canLeave: true, canSpectate: false },
    };
  }

  private terminalReason(
    winnerId: PlayerId | null,
    eliminations: readonly EliminationEvent[],
    tiedFirstCount: number,
  ): BattleRoyaleTerminalReason {
    if (winnerId !== null) return 'last_survivor';
    if (eliminations.length > 0 && eliminations.every((event) => event.cause === 'departure')) {
      return 'all_departed';
    }
    if (tiedFirstCount >= 2) return 'mutual_elimination';
    return 'no_survivor';
  }
}
