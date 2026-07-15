import { describe, expect, it } from 'vitest';
import { GameModeType } from '@shared/types/game.js';
import {
  REFORGED_CHALLENGE_STORAGE_KEYS,
  advanceReforgedChallengePreferences,
  persistReforgedChallengePreference,
  readReforgedChallengePreferences,
  reforgedChallengeStartRequest,
  type ReforgedChallengePreferences,
} from './challenge-menu.js';

class MemoryStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

const configured: ReforgedChallengePreferences = {
  difficulty: 'warlord',
  mode: GameModeType.KOTH,
  rival: 'bruce',
  mutator: 'blackout',
};

describe('Reforged challenge menu compatibility', () => {
  it('reads the established Lobby keys and preserves safe normalization', () => {
    const storage = new MemoryStorage();
    storage.setItem(REFORGED_CHALLENGE_STORAGE_KEYS.difficulty, 'warlord');
    storage.setItem(REFORGED_CHALLENGE_STORAGE_KEYS.mode, GameModeType.GUN_GAME);
    storage.setItem(REFORGED_CHALLENGE_STORAGE_KEYS.rival, 'bruce');
    storage.setItem(REFORGED_CHALLENGE_STORAGE_KEYS.mutator, 'weapon_roulette');

    expect(readReforgedChallengePreferences(storage)).toEqual({
      difficulty: 'warlord',
      mode: GameModeType.GUN_GAME,
      rival: 'bruce',
      mutator: null,
    });

    storage.setItem(REFORGED_CHALLENGE_STORAGE_KEYS.difficulty, 'impossible');
    storage.setItem(REFORGED_CHALLENGE_STORAGE_KEYS.mode, 'invented');
    storage.setItem(REFORGED_CHALLENGE_STORAGE_KEYS.rival, 'invented');
    storage.setItem(REFORGED_CHALLENGE_STORAGE_KEYS.mutator, 'invented');
    expect(readReforgedChallengePreferences(storage)).toEqual({
      difficulty: 'scrapper',
      mode: null,
      rival: null,
      mutator: null,
    });
  });

  it('cycles and writes only existing preference keys', () => {
    const storage = new MemoryStorage();
    const nextDifficulty = advanceReforgedChallengePreferences(configured, 'difficulty');
    persistReforgedChallengePreference(storage, configured, nextDifficulty, 'difficulty');
    expect(storage.values).toEqual(
      new Map([[REFORGED_CHALLENGE_STORAGE_KEYS.difficulty, 'rookie']]),
    );

    const randomRival = { ...configured, rival: null } as const;
    persistReforgedChallengePreference(storage, configured, randomRival, 'rival');
    expect(storage.getItem(REFORGED_CHALLENGE_STORAGE_KEYS.rival)).toBeNull();

    const loadoutOwner = { ...configured, mutator: 'weapon_roulette' as const };
    storage.setItem(REFORGED_CHALLENGE_STORAGE_KEYS.mutator, loadoutOwner.mutator);
    const gunGame = advanceReforgedChallengePreferences(loadoutOwner, 'mode');
    persistReforgedChallengePreference(storage, loadoutOwner, gunGame, 'mode');
    expect(gunGame).toMatchObject({ mode: GameModeType.GUN_GAME, mutator: null });
    expect(storage.getItem(REFORGED_CHALLENGE_STORAGE_KEYS.mode)).toBe(GameModeType.GUN_GAME);
    expect(storage.getItem(REFORGED_CHALLENGE_STORAGE_KEYS.mutator)).toBeNull();
  });

  it('keeps Spar and Scrap Pit customization while Gauntlet and Daily stay fixed', () => {
    expect(reforgedChallengeStartRequest('sparring', configured)).toEqual({
      kind: 'sparring',
      difficulty: 'warlord',
      gameMode: GameModeType.KOTH,
      opponentCharacterId: 'bruce',
      mutatorId: 'blackout',
    });
    expect(reforgedChallengeStartRequest('rusty_rumble', configured)).toEqual({
      kind: 'rusty_rumble',
      difficulty: 'warlord',
      gameMode: GameModeType.KOTH,
      opponentCharacterId: 'bruce',
      mutatorId: 'blackout',
    });
    expect(reforgedChallengeStartRequest('gauntlet', configured)).toEqual({
      kind: 'gauntlet',
      difficulty: 'warlord',
    });
    expect(reforgedChallengeStartRequest('daily', configured)).toEqual({
      kind: 'daily',
      difficulty: 'warlord',
    });
  });
});
