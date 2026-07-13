import type { WastelandWarpState } from '@shared/types/game.js';
import type { MutatorId } from '@shared/config/game.js';
import { eventDisplayName } from '@shared/utils/event-modifiers.js';

/** Persistent active-mutator copy, including the authoritative warp clock. */
export function activeMutatorLabel(
  active: readonly MutatorId[],
  warp: WastelandWarpState | null,
): string | null {
  if (active.length === 0) return null;
  return active.map((mutator) =>
    mutator === 'wasteland_warp' && warp
      ? `WASTELAND WARP · ${Math.max(1, Math.ceil(warp.secondsUntilSwap))}S`
      : eventDisplayName(mutator),
  ).join(' + ');
}

/** Ignore the first snapshot; celebrate only a later authoritative edge. */
export function didWastelandWarp(
  previousSequence: number | undefined,
  state: WastelandWarpState | null,
): boolean {
  return previousSequence !== undefined &&
    state !== null &&
    state.sequence !== previousSequence;
}
