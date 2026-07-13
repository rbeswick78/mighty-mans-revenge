import type {
  RadiationStormState,
  ScrapstormState,
  WastelandWarpState,
} from '@shared/types/game.js';
import type { MutatorId } from '@shared/config/game.js';
import { eventDisplayName } from '@shared/utils/event-modifiers.js';

/** Persistent active-mutator copy, including the authoritative warp clock. */
export function activeMutatorLabel(
  active: readonly MutatorId[],
  warp: WastelandWarpState | null,
  radiationStorm: RadiationStormState | null = null,
  scrapstorm: ScrapstormState | null = null,
): string | null {
  const visible = active.filter(
    (mutator) =>
      (mutator !== 'radiation_storm' || radiationStorm !== null) &&
      (mutator !== 'scrapstorm' || scrapstorm !== null),
  );
  if (visible.length === 0) return null;
  return visible.map((mutator) => {
    if (mutator === 'wasteland_warp' && warp) {
      return `WASTELAND WARP · ${Math.max(1, Math.ceil(warp.secondsUntilSwap))}S`;
    }
    if (
      mutator === 'radiation_storm' &&
      radiationStorm &&
      radiationStorm.shrinkSecondsRemaining > 0
    ) {
      return `RADIATION STORM · ${Math.ceil(radiationStorm.shrinkSecondsRemaining)}S`;
    }
    if (
      mutator === 'scrapstorm' &&
      scrapstorm &&
      scrapstorm.secondsUntilImpact !== null
    ) {
      return `SCRAPSTORM · ${Math.max(1, Math.ceil(scrapstorm.secondsUntilImpact))}S`;
    }
    return eventDisplayName(mutator);
  }).join(' + ');
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
