import { describe, expect, it } from 'vitest';

import type { ServerCapabilities } from '@shared/types/network.js';
import { GameModeType } from '@shared/types/game.js';

import type { MatchData } from '../../services/game-service.js';
import { matchFoundDestination } from './standard-match-route.js';

const disabled: ServerCapabilities = {
  newShell: false,
  schedules: false,
  largeWorlds: false,
  modernArt: false,
  battleRoyale: false,
};
const enabled: ServerCapabilities = { ...disabled, newShell: true, schedules: true };
const battleRoyaleEnabled: ServerCapabilities = { ...enabled, battleRoyale: true };
const base: MatchData = {
  matchId: 'match-route-16',
  opponents: [{ id: 'bot-1', nickname: 'Scrapper 1' }],
  mapName: 'Wasteland Outpost',
  gameMode: GameModeType.DEATHMATCH,
  matchKind: 'duel',
  characterWins: {
    mighty_man: 0,
    bruce: 0,
    frost_wizard: 0,
    bubba: 0,
    jack: 0,
    rook: 0,
  },
};
const direct = {
  format: 'duel',
  composition: { humanCount: 1, botCount: 1 },
  scheduledArena: {
    mode: GameModeType.DEATHMATCH,
    mapName: 'Wasteland Outpost',
    rotationEndsAt: 2_000,
  },
  participants: [
    {
      playerId: 'local',
      nickname: 'Alpha',
      fighterId: 'mighty_man',
      source: 'human',
    },
    {
      playerId: 'bot-1',
      nickname: 'Scrapper 1',
      fighterId: 'bruce',
      source: 'standard_bot',
    },
  ],
} as const;

describe('matchFoundDestination', () => {
  it('routes only a validated capability-owned standard contract directly to gameplay', () => {
    expect(
      matchFoundDestination(enabled, {
        ...base,
        standardLaunchStatus: 'valid',
        standardMatch: direct,
      }),
    ).toBe('game');
  });

  it.each([
    ['malformed contract', enabled, { ...base, standardLaunchStatus: 'invalid' }],
    [
      'capability drift',
      disabled,
      { ...base, standardLaunchStatus: 'valid', standardMatch: direct },
    ],
    [
      'partial capability',
      { ...enabled, schedules: false },
      { ...base, standardLaunchStatus: 'valid', standardMatch: direct },
    ],
  ] as const)('rejects %s without opening a phantom setup scene', (_name, caps, match) => {
    expect(matchFoundDestination(caps, match)).toBe('reject');
  });

  it('retains challenge, old-server, and capability-off legacy Character Select routing', () => {
    expect(
      matchFoundDestination(enabled, { ...base, matchKind: 'practice', practiceKind: 'sparring' }),
    ).toBe('character-select');
    expect(matchFoundDestination(enabled, { ...base, standardLaunchStatus: 'absent' })).toBe(
      'character-select',
    );
    expect(matchFoundDestination(disabled, base)).toBe('character-select');
    expect(matchFoundDestination({ ...disabled, schedules: true }, base)).toBe('character-select');
  });

  it('rejects a direct-launch projection attached to Practice', () => {
    expect(
      matchFoundDestination(enabled, {
        ...base,
        matchKind: 'practice',
        practiceKind: 'gauntlet',
        standardLaunchStatus: 'valid',
        standardMatch: direct,
      }),
    ).toBe('reject');
  });

  it('routes only a complete capability-owned Battle Royale projection to gameplay', () => {
    const battleRoyale = {
      ...base,
      opponents: Array.from({ length: 7 }, (_, index) => ({
        id: `fighter-${index}`,
        nickname: `Fighter ${index}`,
      })),
      matchKind: 'battle_royale' as const,
      standardLaunchStatus: 'absent' as const,
      battleRoyaleLaunchStatus: 'valid' as const,
      battleRoyale: { participantCount: 8, humanCount: 3, botCount: 5 },
    };
    expect(matchFoundDestination(battleRoyaleEnabled, battleRoyale)).toBe('game');
    expect(matchFoundDestination(enabled, battleRoyale)).toBe('reject');
    expect(
      matchFoundDestination(battleRoyaleEnabled, {
        ...battleRoyale,
        battleRoyaleLaunchStatus: 'invalid',
      }),
    ).toBe('reject');
    expect(
      matchFoundDestination(battleRoyaleEnabled, {
        ...battleRoyale,
        battleRoyaleLaunchStatus: 'absent',
        battleRoyale: undefined,
      }),
    ).toBe('reject');
  });
});
