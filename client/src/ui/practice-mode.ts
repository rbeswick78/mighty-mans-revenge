import { GAME_MODE_ROTATION, gameModeDisplayName } from '@shared/config/game.js';
import type { GameModeType } from '@shared/types/game.js';

export type PracticeModePreference = GameModeType | null;

/** Invalid or legacy storage values preserve the original random behavior. */
export function normalizePracticeModePreference(
  stored: string | null,
): PracticeModePreference {
  return GAME_MODE_ROTATION.includes(stored as GameModeType)
    ? (stored as GameModeType)
    : null;
}

/** Cycle RANDOM -> every shared mode -> RANDOM in authoritative rotation order. */
export function nextPracticeModePreference(
  current: PracticeModePreference,
): PracticeModePreference {
  if (current === null) return GAME_MODE_ROTATION[0];
  const index = GAME_MODE_ROTATION.indexOf(current);
  return index >= 0 && index < GAME_MODE_ROTATION.length - 1
    ? GAME_MODE_ROTATION[index + 1]
    : null;
}

export function practiceModePreferenceLabel(mode: PracticeModePreference): string {
  return `SPAR MODE: ${mode === null ? 'RANDOM' : gameModeDisplayName(mode)}`;
}
