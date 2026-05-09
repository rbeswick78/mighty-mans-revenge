import { describe, it, expect } from 'vitest';
import { CHARACTERS, CHARACTER_IDS, type CharacterId } from './game.js';
import { DIRECTIONS } from '../types/character.js';

describe('CHARACTERS registry', () => {
  it('contains at least mighty_man and bruce', () => {
    expect(Object.keys(CHARACTERS).length).toBeGreaterThanOrEqual(2);
    expect(CHARACTERS).toHaveProperty('mighty_man');
    expect(CHARACTERS).toHaveProperty('bruce');
  });

  it('every entry has the required string fields', () => {
    for (const [key, def] of Object.entries(CHARACTERS)) {
      expect(typeof def.id).toBe('string');
      expect(typeof def.displayName).toBe('string');
      expect(typeof def.spritePrefix).toBe('string');
      expect(typeof def.assetFolder).toBe('string');
      expect(typeof def.assetBaseName).toBe('string');

      expect(def.id.length).toBeGreaterThan(0);
      expect(def.displayName.length).toBeGreaterThan(0);
      expect(def.spritePrefix.length).toBeGreaterThan(0);
      expect(def.assetFolder.length).toBeGreaterThan(0);
      expect(def.assetBaseName.length).toBeGreaterThan(0);

      // The entry's id must match its key in the registry.
      expect(def.id).toBe(key);
    }
  });

  it('every entry has idleFrames and runFrames for all four directions with positive dimensions', () => {
    for (const def of Object.values(CHARACTERS)) {
      expect(def.idleFrames).toBeDefined();
      expect(def.runFrames).toBeDefined();

      for (const dir of DIRECTIONS) {
        const idle = def.idleFrames[dir];
        const run = def.runFrames[dir];

        expect(idle, `${def.id} missing idle frame for ${dir}`).toBeDefined();
        expect(run, `${def.id} missing run frame for ${dir}`).toBeDefined();

        expect(idle.w).toBeGreaterThan(0);
        expect(idle.h).toBeGreaterThan(0);
        expect(run.w).toBeGreaterThan(0);
        expect(run.h).toBeGreaterThan(0);
      }
    }
  });

  it('CHARACTER_IDS contains exactly the keys of CHARACTERS', () => {
    const keys = Object.keys(CHARACTERS) as CharacterId[];
    expect([...CHARACTER_IDS].sort()).toEqual([...keys].sort());
    expect(CHARACTER_IDS.length).toBe(keys.length);
  });

  it('every entry declares a hasGun boolean', () => {
    for (const def of Object.values(CHARACTERS)) {
      expect(typeof def.hasGun).toBe('boolean');
    }
  });

  it('CHARACTERS is frozen', () => {
    expect(Object.isFrozen(CHARACTERS)).toBe(true);
  });
});
