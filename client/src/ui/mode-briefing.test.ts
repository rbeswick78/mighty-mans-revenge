import { describe, expect, it } from 'vitest';
import { GameModeType } from '@shared/types/game.js';
import { GAME_MODES } from '@shared/config/game.js';
import { modeBriefingPresentation } from './mode-briefing.js';

describe('mode briefing presentation', () => {
  it('projects Battle Royale identity instead of its internal Deathmatch adapter', () => {
    expect(modeBriefingPresentation(GameModeType.DEATHMATCH, 'battle_royale')).toEqual({
      displayName: 'BATTLE ROYALE',
      objective: 'ONE LIFE · LAST FIGHTER STANDING',
    });
  });

  it('preserves every standard mode briefing exactly', () => {
    for (const mode of Object.values(GameModeType)) {
      expect(modeBriefingPresentation(mode, 'duel')).toBe(GAME_MODES[mode]);
      expect(modeBriefingPresentation(mode)).toBe(GAME_MODES[mode]);
    }
  });
});
