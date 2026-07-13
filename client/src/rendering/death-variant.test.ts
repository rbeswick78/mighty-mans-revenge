import { describe, expect, it } from 'vitest';
import { CHARACTERS } from '@shared/config/game.js';
import { deathVariantPrefix } from './death-variant.js';

describe('deathVariantPrefix', () => {
  it('cycles Mighty Man through the base and two alternate collapses', () => {
    expect(deathVariantPrefix(CHARACTERS.mighty_man, false, 1)).toBe('mighty_man');
    expect(deathVariantPrefix(CHARACTERS.mighty_man, false, 2)).toBe(
      'mighty_man_death2',
    );
    expect(deathVariantPrefix(CHARACTERS.mighty_man, false, 3)).toBe(
      'mighty_man_death3',
    );
    expect(deathVariantPrefix(CHARACTERS.mighty_man, false, 4)).toBe('mighty_man');
  });

  it('uses each zombie body set only when that complete strip exists', () => {
    expect(deathVariantPrefix(CHARACTERS.bruce, false, 2)).toBe('bruce_death2');
    expect(deathVariantPrefix(CHARACTERS.bubba, false, 2)).toBe('bubba_death2');
    expect(deathVariantPrefix(CHARACTERS.jack, false, 2)).toBe('jack');
    expect(deathVariantPrefix(CHARACTERS.jack, true, 2)).toBe('jack-noaxe_death2');
  });

  it('keeps Rook on the synchronized body-and-helmet death set', () => {
    expect(deathVariantPrefix(CHARACTERS.rook, false, 1)).toBe('mighty_man');
    expect(deathVariantPrefix(CHARACTERS.rook, false, 99)).toBe('mighty_man');
  });

  it('normalizes invalid counts to the base collapse', () => {
    expect(deathVariantPrefix(CHARACTERS.mighty_man, false, 0)).toBe('mighty_man');
    expect(deathVariantPrefix(CHARACTERS.mighty_man, false, Number.NaN)).toBe(
      'mighty_man',
    );
  });
});
