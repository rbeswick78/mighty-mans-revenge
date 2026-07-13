import { CORE_RUN } from '@shared/config/game.js';
import type { PlayerId } from '@shared/types/common.js';
import type { CoreRunState } from '@shared/types/game.js';

/** Compact mode-band copy derived only from persistent authoritative state. */
export function coreRunStatus(
  state: CoreRunState | null,
  localPlayerId: PlayerId | null,
): string {
  if (!state) return '';
  if (state.carrierId === localPlayerId && localPlayerId !== null) {
    return `YOU HAVE THE CORE · FIRST TO ${CORE_RUN.SCORE_TARGET}`;
  }
  if (state.carrierId !== null) return 'RIVAL HAS THE CORE · HUNT THEM';
  if (state.returnInSeconds !== null) {
    return `CORE DROPPED · RETURNS ${Math.max(1, Math.ceil(state.returnInSeconds))}S`;
  }
  return 'CORE LOOSE · CLAIM IT';
}
