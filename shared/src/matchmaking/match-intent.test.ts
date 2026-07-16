import { describe, expect, it } from 'vitest';
import { CHARACTER_IDS, GAME_MODE_ROTATION } from '../config/game.js';
import {
  MATCH_COMPOSITIONS_BY_FORMAT,
  MATCH_FORMATS,
  MATCH_MODES_BY_FORMAT,
  matchIntentQueueKey,
  normalizeMatchIntent,
} from './match-intent.js';

const SERVER_TIME = 1_000_000;
const ROTATION_END = 1_100_000;
const ARENAS = Object.freeze(['Arena A', 'Arena B']);

function intent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    intentId: 'intent_12345678',
    format: 'duel',
    composition: { humanCount: 2, botCount: 0 },
    mode: 'deathmatch',
    fighterId: 'mighty_man',
    scheduledArena: {
      mode: 'deathmatch',
      mapName: ARENAS[0],
      rotationEndsAt: ROTATION_END,
    },
    ...overrides,
  };
}

const options = { serverTime: SERVER_TIME, allowedArenaNames: ARENAS } as const;

describe('general match intent normalization', () => {
  it('exhaustively accepts all 624 legal format/composition/mode/fighter products', () => {
    let combinations = 0;
    for (const format of MATCH_FORMATS) {
      for (const composition of MATCH_COMPOSITIONS_BY_FORMAT[format]) {
        for (const mode of MATCH_MODES_BY_FORMAT[format]) {
          for (const fighterId of CHARACTER_IDS) {
            const normalized = normalizeMatchIntent(
              intent({
                intentId: `intent_${combinations.toString().padStart(8, '0')}`,
                format,
                composition,
                mode,
                fighterId,
                scheduledArena: { mode, mapName: ARENAS[0], rotationEndsAt: ROTATION_END },
              }),
              options,
            );
            expect(normalized).not.toBeNull();
            expect(Object.isFrozen(normalized)).toBe(true);
            expect(Object.isFrozen(normalized?.composition)).toBe(true);
            expect(Object.isFrozen(normalized?.scheduledArena)).toBe(true);
            combinations++;
          }
        }
      }
    }
    expect(combinations).toBe(624);
  });

  it.each([
    null,
    {},
    intent({ intentId: 'short' }),
    intent({ intentId: 'intent with spaces' }),
    intent({ format: 'battle_royale' }),
    intent({ composition: { humanCount: 0, botCount: 2 } }),
    intent({ composition: { humanCount: 1.5, botCount: 0.5 } }),
    intent({ mode: 'unknown' }),
    intent({ format: 'crew', mode: 'gun_game' }),
    intent({ fighterId: 'unknown' }),
    intent({ scheduledArena: null }),
    intent({ scheduledArena: { mode: 'koth', mapName: ARENAS[0], rotationEndsAt: ROTATION_END } }),
    intent({
      scheduledArena: { mode: 'deathmatch', mapName: 'Unknown', rotationEndsAt: ROTATION_END },
    }),
    intent({
      scheduledArena: { mode: 'deathmatch', mapName: ARENAS[0], rotationEndsAt: SERVER_TIME },
    }),
  ])('rejects malformed, stale, unknown, or incompatible input %#', (value) => {
    expect(normalizeMatchIntent(value, options)).toBeNull();
  });

  it('uses only compatibility and server schedule identity in the queue key', () => {
    const first = normalizeMatchIntent(intent(), options)!;
    const second = normalizeMatchIntent(
      intent({ intentId: 'intent_87654321', fighterId: CHARACTER_IDS[1] }),
      options,
    )!;
    expect(matchIntentQueueKey(second)).toBe(matchIntentQueueKey(first));
    expect(GAME_MODE_ROTATION).toContain(first.mode);
  });
});
