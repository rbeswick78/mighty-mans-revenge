import { describe, expect, it } from 'vitest';
import { CHARACTER_IDS, GAME_MODE_ROTATION } from '../config/game.js';
import { GameModeType } from '../types/game.js';
import {
  MATCH_COMPOSITIONS_BY_FORMAT,
  MATCH_FORMATS,
  MATCH_MODES_BY_FORMAT,
  matchIntentQueueKey,
  normalizeMatchIntent,
  normalizeStandardMatchLaunch,
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

describe('standard direct-launch normalization', () => {
  function launch(
    format: (typeof MATCH_FORMATS)[number],
    composition: { humanCount: number; botCount: number },
    mode: (typeof GAME_MODE_ROTATION)[number],
    fighterOffset = 0,
  ): Record<string, unknown> {
    const count = composition.humanCount + composition.botCount;
    const participants = Array.from({ length: count }, (_, index) => ({
      playerId: `player-${index + 1}`,
      nickname: index < composition.humanCount ? `Human ${index + 1}` : `Scrapper ${index + 1}`,
      fighterId: CHARACTER_IDS[(fighterOffset + index) % CHARACTER_IDS.length],
      source: index < composition.humanCount ? 'human' : 'standard_bot',
    }));
    const playerTeams =
      format === 'crew'
        ? Object.fromEntries(
            participants.map((participant, index) => [
              participant.playerId,
              index < 2 ? 'blue' : 'red',
            ]),
          )
        : undefined;
    return {
      format,
      composition,
      scheduledArena: { mode, mapName: ARENAS[0], rotationEndsAt: ROTATION_END },
      participants,
      ...(playerTeams ? { playerTeams } : {}),
    };
  }

  function launchOptions(
    format: (typeof MATCH_FORMATS)[number],
    mode: (typeof GAME_MODE_ROTATION)[number],
    value: Record<string, unknown>,
  ) {
    return {
      localPlayerId: 'player-1',
      expectedMapName: ARENAS[0],
      expectedMode: mode,
      expectedMatchKind: format === 'crew' ? ('duos' as const) : format,
      expectedPlayerTeams: value['playerTeams'] as Record<string, 'blue' | 'red'> | undefined,
      allowedArenaNames: ARENAS,
    };
  }

  it('exhaustively accepts every format/composition/mode and six fighter-lock offsets', () => {
    let combinations = 0;
    for (const format of MATCH_FORMATS) {
      for (const composition of MATCH_COMPOSITIONS_BY_FORMAT[format]) {
        for (const mode of MATCH_MODES_BY_FORMAT[format]) {
          for (let fighterOffset = 0; fighterOffset < CHARACTER_IDS.length; fighterOffset++) {
            const value = launch(format, composition, mode, fighterOffset);
            const normalized = normalizeStandardMatchLaunch(
              value,
              launchOptions(format, mode, value),
            );
            expect(normalized).not.toBeNull();
            expect(normalized?.participants).toHaveLength(
              composition.humanCount + composition.botCount,
            );
            expect(Object.isFrozen(normalized?.participants)).toBe(true);
            combinations++;
          }
        }
      }
    }
    expect(combinations).toBe(624);
  });

  it('fails closed for partial, contradictory, duplicate, source, team, and local-player drift', () => {
    const value = launch('crew', { humanCount: 2, botCount: 2 }, GameModeType.DEATHMATCH);
    const validOptions = launchOptions('crew', GameModeType.DEATHMATCH, value);
    const participants = value['participants'] as Array<Record<string, unknown>>;
    const teams = value['playerTeams'] as Record<string, string>;
    const invalid = [
      null,
      {},
      { ...value, composition: { humanCount: 3, botCount: 1 } },
      {
        ...value,
        scheduledArena: { mode: 'koth', mapName: ARENAS[0], rotationEndsAt: ROTATION_END },
      },
      {
        ...value,
        scheduledArena: { mode: 'deathmatch', mapName: ARENAS[1], rotationEndsAt: ROTATION_END },
      },
      { ...value, participants: participants.slice(1) },
      {
        ...value,
        participants: participants.map((entry, index) =>
          index === 1 ? { ...entry, playerId: 'player-1' } : entry,
        ),
      },
      {
        ...value,
        participants: participants.map((entry, index) =>
          index === 1 ? { ...entry, fighterId: 'mighty_man' } : entry,
        ),
      },
      {
        ...value,
        participants: participants.map((entry, index) =>
          index === 0 ? { ...entry, source: 'standard_bot' } : entry,
        ),
      },
      { ...value, playerTeams: { ...teams, 'player-4': 'blue' } },
      { ...value, playerTeams: { ...teams, 'player-4': undefined } },
    ];
    for (const candidate of invalid) {
      expect(normalizeStandardMatchLaunch(candidate, validOptions)).toBeNull();
    }
    expect(
      normalizeStandardMatchLaunch(value, { ...validOptions, localPlayerId: 'missing-player' }),
    ).toBeNull();
    expect(
      normalizeStandardMatchLaunch(value, {
        ...validOptions,
        expectedPlayerTeams: { ...teams, 'player-4': 'blue' } as Record<string, 'blue' | 'red'>,
      }),
    ).toBeNull();
    expect(
      normalizeStandardMatchLaunch(value, { ...validOptions, expectedMatchKind: 'rumble' }),
    ).toBeNull();
  });
});
