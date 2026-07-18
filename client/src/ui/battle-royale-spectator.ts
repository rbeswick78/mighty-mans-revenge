import type { PlayerId } from '@shared/types/common.js';
import type { BattleRoyaleSpectatorState } from '@shared/types/game.js';

export interface BattleRoyaleSpectatorPresentation {
  readonly active: boolean;
  readonly placementLabel: string;
  readonly aliveLabel: string;
  readonly targetId: PlayerId | null;
  readonly targetLabel: string;
  readonly killerLabel: string;
}

/** Cycle only within the stable server-authored living list. */
export function cycleBattleRoyaleSpectatorTarget(
  livingPlayerIds: readonly PlayerId[],
  currentTargetId: PlayerId | null,
  direction: -1 | 1,
): PlayerId | null {
  if (livingPlayerIds.length === 0) return null;
  const currentIndex = currentTargetId === null ? -1 : livingPlayerIds.indexOf(currentTargetId);
  if (currentIndex < 0) return direction === 1 ? livingPlayerIds[0]! : livingPlayerIds.at(-1)!;
  return livingPlayerIds[
    (currentIndex + direction + livingPlayerIds.length) % livingPlayerIds.length
  ]!;
}

export function battleRoyaleSpectatorPresentation(
  state: BattleRoyaleSpectatorState | null,
  localPlayerId: PlayerId | null,
  selectedTargetId: PlayerId | null,
  nicknames: Readonly<Record<PlayerId, string>> = {},
): BattleRoyaleSpectatorPresentation {
  const standing = state?.standings.find(({ playerId }) => playerId === localPlayerId);
  if (!state || !standing || standing.status === 'alive') {
    return Object.freeze({
      active: false,
      placementLabel: '',
      aliveLabel: '',
      targetId: null,
      targetLabel: '',
      killerLabel: '',
    });
  }
  const targetId = state.livingPlayerIds.includes(selectedTargetId ?? '')
    ? selectedTargetId
    : (state.livingPlayerIds[0] ?? null);
  let killerLabel = '';
  if (standing.status === 'departed' || standing.eliminationCause === 'departure') {
    killerLabel = 'EXITED THE FIGHT';
  } else if (standing.eliminationCause === 'zone') {
    killerLabel = 'CLAIMED BY THE ZONE';
  } else if (standing.eliminationCause === 'combat') {
    if (standing.eliminatedBy === localPlayerId) killerLabel = 'SELF-ELIMINATED';
    else if (standing.eliminatedBy) {
      killerLabel = `ELIMINATED BY ${(nicknames[standing.eliminatedBy] ?? standing.eliminatedBy).toUpperCase()}`;
    } else killerLabel = 'ELIMINATED IN COMBAT';
  } else killerLabel = 'ELIMINATION CONFIRMED';
  return Object.freeze({
    active: true,
    placementLabel: `PLACED #${standing.placement}`,
    aliveLabel: `${state.aliveCount} ALIVE`,
    targetId,
    targetLabel: targetId
      ? `WATCHING ${(nicknames[targetId] ?? targetId).toUpperCase()}`
      : 'NO SURVIVORS',
    killerLabel,
  });
}
