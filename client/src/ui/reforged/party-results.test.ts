import { describe, expect, it } from 'vitest';
import type { PartyState } from '@shared/game';
import { GameModeType } from '@shared/types/game.js';
import { partyResultsPresentation } from './party-results.js';

const state = (): PartyState => ({
  partyId: 'party-results-123',
  code: 'ABCDE',
  joinPath: '/?party=ABCDE',
  format: 'duel',
  formatCapacity: 2,
  capacity: 1,
  leaderId: 'p1',
  version: 8,
  lifecycle: 'results',
  matchId: 'match-results-123',
  members: [
    { playerId: 'p1', nickname: 'Alpha', fighterId: 'mighty_man', joinedAt: 1, ready: false },
  ],
  slots: [
    {
      index: 0,
      status: 'occupied',
      member: {
        playerId: 'p1',
        nickname: 'Alpha',
        fighterId: 'mighty_man',
        joinedAt: 1,
        ready: false,
      },
    },
  ],
  participants: [
    {
      playerId: 'p1',
      nickname: 'Alpha',
      fighterId: 'mighty_man',
      source: 'human',
      ready: false,
    },
    {
      playerId: 'bot:1',
      nickname: 'Rusty',
      fighterId: 'bruce',
      source: 'standard_bot',
      ready: true,
    },
  ],
  rematch: {
    status: 'waiting',
    previousArena: {
      mode: GameModeType.DEATHMATCH,
      mapName: 'Wasteland Outpost',
      rotationEndsAt: 100,
    },
    currentArena: {
      mode: GameModeType.DEATHMATCH,
      mapName: 'Scrapyard',
      rotationEndsAt: 200,
    },
    arenaChanged: true,
    eligiblePlayerIds: ['p1'],
    requestedPlayerIds: [],
    serverTime: 101,
    expiresAt: 60_101,
  },
  intent: {
    intentId: 'intent-results-123',
    format: 'duel',
    composition: { humanCount: 1, botCount: 1 },
    mode: GameModeType.DEATHMATCH,
    fighterId: 'mighty_man',
    scheduledArena: {
      mode: GameModeType.DEATHMATCH,
      mapName: 'Wasteland Outpost',
      rotationEndsAt: 100,
    },
  },
});

describe('partyResultsPresentation', () => {
  it('renders exact human/bot sources and the server-owned schedule boundary', () => {
    expect(partyResultsPresentation(state(), 'match-results-123', 'p1')).toEqual({
      partyLines: [
        'PARTY ABCDE  /  DUEL',
        'ALPHA  /  HUMAN  /  MIGHTY MAN  /  WAITING',
        'RUSTY  /  SCRAPPER BOT  /  BRUCE  /  READY',
      ],
      scheduleLines: [
        'MODE  /  DEATHMATCH',
        'PLAYED  /  WASTELAND OUTPOST',
        'NEW ACTIVE ARENA  /  SCRAPYARD',
      ],
      canRequestRematch: true,
      localRequested: false,
      statusText: '0 / 1 HUMANS READY',
    });
  });

  it('fails closed for recreation with an unrelated result', () => {
    expect(partyResultsPresentation(state(), 'other-match', 'p1')).toBeNull();
  });
});
