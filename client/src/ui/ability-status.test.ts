import { describe, expect, it } from 'vitest';

import { CHARACTER_IDS } from '@shared/config/game.js';

import { abilityStatusPresentation } from './ability-status.js';

describe('abilityStatusPresentation', () => {
  it('names every fighter ability in roster order', () => {
    expect(CHARACTER_IDS.map((id) => abilityStatusPresentation(id, 0, 0).name)).toEqual([
      'X-RAY VISION',
      'FIRE BREATH',
      'FROST LOCK',
      'IRON HIDE',
      'AXE THROW',
      'BREACH DASH',
    ]);
  });

  it('makes ready, active, and cooldown states explicit', () => {
    expect(abilityStatusPresentation('mighty_man', 0, 0)).toEqual({
      name: 'X-RAY VISION',
      state: 'READY',
      tone: 'ready',
    });
    expect(abilityStatusPresentation('bruce', 1.01, 44)).toEqual({
      name: 'FIRE BREATH',
      state: 'ACTIVE 2S',
      tone: 'active',
    });
    expect(abilityStatusPresentation('rook', 0, 6.01)).toEqual({
      name: 'BREACH DASH',
      state: 'READY IN 7S',
      tone: 'cooldown',
    });
  });

  it('normalizes malformed timers without inventing a blocked state', () => {
    expect(abilityStatusPresentation('jack', Number.NaN, Number.POSITIVE_INFINITY)).toEqual({
      name: 'AXE THROW',
      state: 'READY',
      tone: 'ready',
    });
    expect(abilityStatusPresentation('bubba', -1, -2).state).toBe('READY');
  });
});
