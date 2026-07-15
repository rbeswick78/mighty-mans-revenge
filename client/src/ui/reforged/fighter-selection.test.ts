import { CHARACTER_IDS } from '@shared/config/game.js';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FIGHTER_SELECTION,
  FIGHTER_SELECTION_STORAGE_KEY,
  normalizeFighterSelection,
  persistFighterSelection,
  readFighterSelection,
  type FighterSelectionStorage,
} from './fighter-selection.js';

function memoryStorage(initial: string | null = null): FighterSelectionStorage & {
  value: string | null;
} {
  return {
    value: initial,
    getItem(key) {
      expect(key).toBe(FIGHTER_SELECTION_STORAGE_KEY);
      return this.value;
    },
    setItem(key, value) {
      expect(key).toBe(FIGHTER_SELECTION_STORAGE_KEY);
      this.value = value;
    },
  };
}

describe('Reforged fighter selection', () => {
  it('accepts every registered fighter and defaults missing or stale values safely', () => {
    for (const fighterId of CHARACTER_IDS)
      expect(normalizeFighterSelection(fighterId)).toBe(fighterId);
    for (const value of [null, undefined, '', 'intruder', 4, {}, ['jack']]) {
      expect(normalizeFighterSelection(value)).toBe(DEFAULT_FIGHTER_SELECTION);
    }
  });

  it('reads and persists only normalized registry values', () => {
    const storage = memoryStorage('jack');
    expect(readFighterSelection(storage)).toBe('jack');
    expect(persistFighterSelection(storage, 'rook')).toBe('rook');
    expect(storage.value).toBe('rook');
    expect(persistFighterSelection(storage, 'removed-fighter')).toBe(DEFAULT_FIGHTER_SELECTION);
    expect(storage.value).toBe(DEFAULT_FIGHTER_SELECTION);
  });
});
