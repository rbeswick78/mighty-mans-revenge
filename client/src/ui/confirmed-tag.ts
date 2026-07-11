import { Wasteland } from '@shared/config/palette.js';
import type { PlayerId } from '@shared/types/common.js';
import type { KillConfirmedCollection } from '@shared/types/game.js';

export interface ConfirmedTagPresentation {
  label: 'DENY' | 'CONFIRM';
  color: number;
}

/** Local-player-relative copy/color for a Kill Confirmed tag. */
export function confirmedTagPresentation(ownTag: boolean): ConfirmedTagPresentation {
  return ownTag
    ? { label: 'DENY', color: Wasteland.HEALTH_GOOD }
    : { label: 'CONFIRM', color: Wasteland.TEXT_RELOAD_WARNING };
}

export function confirmedTagCallout(
  event: KillConfirmedCollection,
  localId: PlayerId,
): { headline: string; detail: string; color: number } {
  const localAction = event.collectorId === localId;
  return {
    headline: event.confirmed
      ? localAction
        ? 'KILL CONFIRMED!'
        : 'ENEMY CONFIRMED'
      : localAction
        ? 'TAG DENIED!'
        : 'ENEMY DENIED',
    detail: event.confirmed ? '+1 POINT' : 'POINT PREVENTED',
    color: event.confirmed
      ? Wasteland.TEXT_RELOAD_WARNING
      : Wasteland.HEALTH_GOOD,
  };
}
