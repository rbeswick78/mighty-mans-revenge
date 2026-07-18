import type {
  BattleRoyalePlacement,
  BattleRoyaleResult,
  BattleRoyaleSpectatorState,
  BattleRoyaleTerminalReason,
  PlayerId,
  PlayerState,
} from '@shared/game';

export type BattleRoyaleEliminationCause = 'combat' | 'zone' | 'departure';

interface EliminationEvent {
  readonly playerId: PlayerId;
  readonly cause: BattleRoyaleEliminationCause;
  readonly sequence: number;
  readonly simulationStep: number;
  readonly eliminatedBy: PlayerId | null;
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
    eliminatedBy: PlayerId | null = null,
  ): boolean {
    if (!this.entrantIds.includes(playerId) || this.eliminations.has(playerId)) return false;
    this.nextSequence += 1;
    this.eliminations.set(playerId, {
      playerId,
      cause,
      sequence: this.nextSequence,
      simulationStep,
      eliminatedBy,
    });
    return true;
  }

  isEliminated(playerId: PlayerId): boolean {
    return this.eliminations.has(playerId);
  }

  /** Opponent-only terminal credits; self, zone, and departure edges grant none. */
  eliminationCredits(): ReadonlyMap<PlayerId, number> {
    const credits = new Map<PlayerId, number>(this.entrantIds.map((playerId) => [playerId, 0]));
    for (const event of this.eliminations.values()) {
      if (
        event.cause !== 'combat' ||
        event.eliminatedBy === null ||
        event.eliminatedBy === event.playerId ||
        !credits.has(event.eliminatedBy)
      ) {
        continue;
      }
      credits.set(event.eliminatedBy, (credits.get(event.eliminatedBy) ?? 0) + 1);
    }
    return credits;
  }

  /** Deterministic live projection; never accepts a client-selected target. */
  spectatorState(players: ReadonlyMap<PlayerId, PlayerState>): BattleRoyaleSpectatorState {
    const livingPlayerIds = this.entrantIds
      .filter((playerId) => {
        const player = players.get(playerId);
        return player !== undefined && !player.isDead && !this.eliminations.has(playerId);
      })
      .sort((left, right) => left.localeCompare(right));
    const resolved = this.resolve(players);
    const finalById = new Map(
      resolved?.placements.map((standing) => [standing.playerId, standing]),
    );
    const standings = this.entrantIds
      .map((playerId) => {
        const final = finalById.get(playerId);
        const elimination = this.eliminations.get(playerId);
        if (final) {
          return {
            ...final,
            eliminatedBy: elimination?.eliminatedBy ?? null,
            eliminationCause: elimination?.cause ?? null,
          };
        }
        if (!elimination) {
          return {
            playerId,
            placement: livingPlayerIds.length,
            status: 'alive' as const,
            eliminatedBy: null,
            eliminationCause: null,
          };
        }
        return {
          playerId,
          placement: this.entrantIds.length - elimination.sequence + 1,
          status:
            elimination.cause === 'departure' ? ('departed' as const) : ('eliminated' as const),
          eliminatedBy: elimination.eliminatedBy,
          eliminationCause: elimination.cause,
        };
      })
      .sort(
        (left, right) =>
          left.placement - right.placement || left.playerId.localeCompare(right.playerId),
      );
    return { livingPlayerIds, aliveCount: livingPlayerIds.length, standings };
  }

  /** Results projection for an eliminated fighter who leaves live spectating. */
  spectatorExitResult(players: ReadonlyMap<PlayerId, PlayerState>): BattleRoyaleResult {
    const live = this.spectatorState(players);
    return {
      placements: live.standings.map(({ playerId, placement, status }) => ({
        playerId,
        placement,
        status,
      })),
      terminalReason: 'left_early',
      actions: { canLeave: true, canSpectate: false },
    };
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
    const finalLethalCohort =
      winnerId === null && finalEvent !== undefined && finalEvent.cause !== 'departure'
        ? orderedEliminations.filter(
            (event) =>
              event.cause !== 'departure' && event.simulationStep === finalEvent.simulationStep,
          )
        : [];
    const tiedFirstIds = new Set(
      finalLethalCohort.length >= 2 ? finalLethalCohort.map((event) => event.playerId) : [],
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
