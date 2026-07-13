import { CHARACTERS, CHARACTER_IDS } from '@shared/config/game.js';
import type { CharacterId } from '@shared/config/game.js';

export type PracticeRivalPreference = CharacterId | null;

/** Invalid or legacy storage values preserve the original random rival behavior. */
export function normalizePracticeRivalPreference(
  stored: string | null,
): PracticeRivalPreference {
  return CHARACTER_IDS.includes(stored as CharacterId) ? (stored as CharacterId) : null;
}

/** Cycle RANDOM -> every roster fighter -> RANDOM in shared roster order. */
export function nextPracticeRivalPreference(
  current: PracticeRivalPreference,
): PracticeRivalPreference {
  if (current === null) return CHARACTER_IDS[0];
  const index = CHARACTER_IDS.indexOf(current);
  return index >= 0 && index < CHARACTER_IDS.length - 1 ? CHARACTER_IDS[index + 1] : null;
}

export function practiceRivalPreferenceLabel(rival: PracticeRivalPreference): string {
  return `RIVAL: ${rival === null ? 'RANDOM' : CHARACTERS[rival].displayName.toUpperCase()}`;
}
