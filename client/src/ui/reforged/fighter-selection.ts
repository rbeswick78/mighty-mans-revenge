import { CHARACTER_IDS, type CharacterId } from '@shared/config/game.js';

export const FIGHTER_SELECTION_STORAGE_KEY = 'mmr_fighter_selection';
export const DEFAULT_FIGHTER_SELECTION: CharacterId = CHARACTER_IDS[0];

export interface FighterSelectionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Device-local preference only; the server still validates and locks fighters. */
export function normalizeFighterSelection(value: unknown): CharacterId {
  return typeof value === 'string' && CHARACTER_IDS.includes(value as CharacterId)
    ? (value as CharacterId)
    : DEFAULT_FIGHTER_SELECTION;
}

export function readFighterSelection(storage: FighterSelectionStorage): CharacterId {
  return normalizeFighterSelection(storage.getItem(FIGHTER_SELECTION_STORAGE_KEY));
}

export function persistFighterSelection(
  storage: FighterSelectionStorage,
  value: unknown,
): CharacterId {
  const fighterId = normalizeFighterSelection(value);
  storage.setItem(FIGHTER_SELECTION_STORAGE_KEY, fighterId);
  return fighterId;
}
