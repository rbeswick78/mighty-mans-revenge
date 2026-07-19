import { GAME_MODES } from '@shared/config/game.js';
import type { GameModeType, MatchKind } from '@shared/types/game.js';

export interface ModeBriefingPresentation {
  readonly displayName: string;
  readonly objective: string;
}

const BATTLE_ROYALE_BRIEFING = Object.freeze({
  displayName: 'BATTLE ROYALE',
  objective: 'ONE LIFE · LAST FIGHTER STANDING',
});

/** Format identity outranks the internal standard-mode simulation adapter. */
export function modeBriefingPresentation(
  mode: GameModeType,
  matchKind?: MatchKind,
): ModeBriefingPresentation {
  return matchKind === 'battle_royale' ? BATTLE_ROYALE_BRIEFING : GAME_MODES[mode];
}
