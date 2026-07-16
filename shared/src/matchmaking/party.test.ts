import { describe, expect, it } from 'vitest';
import {
  PARTY_CODE_ALPHABET,
  PARTY_CODE_LENGTH,
  normalizePartyCode,
  normalizePartyRequestId,
  normalizePartyVersion,
  isPartyState,
  parsePartyJoinTarget,
  partyCodeFromBytes,
  partyJoinPath,
} from './party.js';

describe('party code and link compatibility boundary', () => {
  it('normalizes every allowed character case-insensitively', () => {
    for (const character of PARTY_CODE_ALPHABET) {
      const code = character.repeat(PARTY_CODE_LENGTH);
      expect(normalizePartyCode(code.toLowerCase())).toBe(code);
      expect(parsePartyJoinTarget(` https://example.test/?party=${code.toLowerCase()} `)).toBe(
        code,
      );
    }
  });

  it.each([
    null,
    undefined,
    '',
    'ABCD',
    'ABCDEF',
    'ABCI2',
    'ABCO0',
    'ABCL1',
    'ABCUU!',
    'javascript:alert(1)',
    'ftp://example.test/?party=ABCDE',
    'https://example.test/?party=ABCDE&party=FGHJK',
    'https://example.test/?party=ABCD',
    'https://example.test/no-query',
  ])('rejects malformed or ambiguous target %j', (value) => {
    expect(parsePartyJoinTarget(value)).toBeNull();
  });

  it('builds an origin-relative share path and ignores URL origin/path authority', () => {
    expect(partyJoinPath('abcde')).toBe('/?party=ABCDE');
    expect(parsePartyJoinTarget('https://evil.invalid/arbitrary/path?party=abcde#ignored')).toBe(
      'ABCDE',
    );
  });

  it('maps bytes deterministically without emitting ambiguous characters', () => {
    const bytes = Uint8Array.from([0, 31, 32, 63, 255]);
    const code = partyCodeFromBytes(bytes);
    expect(code).toHaveLength(PARTY_CODE_LENGTH);
    expect([...code!].every((character) => PARTY_CODE_ALPHABET.includes(character))).toBe(true);
    expect(partyCodeFromBytes(Uint8Array.from([1, 2, 3, 4]))).toBeNull();
  });

  it('fails closed on malformed request ids and versions', () => {
    expect(normalizePartyRequestId('request_123')).toBe('request_123');
    expect(normalizePartyRequestId('short')).toBeNull();
    expect(normalizePartyRequestId('request with spaces')).toBeNull();
    expect(normalizePartyVersion(1)).toBe(1);
    expect(normalizePartyVersion(0)).toBeNull();
    expect(normalizePartyVersion(1.5)).toBeNull();
  });

  it('accepts only complete internally consistent authoritative projections', () => {
    const state = {
      partyId: 'party_12345678',
      code: 'ABCDE',
      joinPath: '/?party=ABCDE',
      format: 'duel',
      formatCapacity: 2,
      capacity: 2,
      leaderId: 'leader',
      version: 1,
      lifecycle: 'assembling',
      members: [
        {
          playerId: 'leader',
          nickname: 'Alpha',
          fighterId: 'mighty_man',
          joinedAt: 1,
          ready: false,
        },
      ],
      slots: [
        {
          index: 0,
          status: 'occupied',
          member: {
            playerId: 'leader',
            nickname: 'Alpha',
            fighterId: 'mighty_man',
            joinedAt: 1,
            ready: false,
          },
        },
        { index: 1, status: 'open' },
      ],
      intent: {
        intentId: 'intent_12345678',
        format: 'duel',
        composition: { humanCount: 2, botCount: 0 },
        mode: 'deathmatch',
        fighterId: 'mighty_man',
        scheduledArena: {
          mode: 'deathmatch',
          mapName: 'Wasteland Outpost',
          rotationEndsAt: 2,
        },
      },
    };
    expect(isPartyState(state)).toBe(true);
    const waiting = {
      ...state,
      version: 2,
      lifecycle: 'queued',
      members: [{ ...state.members[0], ready: true }],
      slots: [
        { index: 0, status: 'occupied', member: { ...state.members[0], ready: true } },
        { index: 1, status: 'open' },
      ],
      botFillOffer: {
        status: 'waiting',
        waitStartedAt: 1_000,
        eligibleAt: 16_000,
        serverTime: 1_000,
        openSlotCount: 1,
      },
    };
    expect(isPartyState(waiting)).toBe(true);
    expect(
      isPartyState({
        ...waiting,
        botFillOffer: { ...waiting.botFillOffer, openSlotCount: 2 },
      }),
    ).toBe(false);
    expect(
      isPartyState({
        ...waiting,
        botFillOffer: { ...waiting.botFillOffer, eligibleAt: 15_999 },
      }),
    ).toBe(false);
    expect(isPartyState({ ...state, joinPath: '/?party=FGHJK' })).toBe(false);
    expect(isPartyState({ ...state, leaderId: 'missing' })).toBe(false);
    expect(
      isPartyState({
        ...state,
        members: [
          ...state.members,
          {
            playerId: 'member',
            nickname: 'Bravo',
            fighterId: 'mighty_man',
            joinedAt: 2,
            ready: false,
          },
        ],
      }),
    ).toBe(false);
    expect(
      isPartyState({
        ...state,
        intent: { ...state.intent, composition: { humanCount: 1, botCount: 1 } },
      }),
    ).toBe(false);

    const results = {
      ...state,
      capacity: 1,
      lifecycle: 'results',
      matchId: 'match_12345678',
      members: [state.members[0]],
      slots: [state.slots[0]],
      participants: [
        {
          playerId: 'leader',
          nickname: 'Alpha',
          fighterId: 'mighty_man',
          source: 'human',
          ready: false,
        },
        {
          playerId: 'bot:standard',
          nickname: 'Rusty',
          fighterId: 'bruce',
          source: 'standard_bot',
          ready: true,
        },
      ],
      rematch: {
        status: 'waiting',
        previousArena: state.intent.scheduledArena,
        currentArena: {
          ...state.intent.scheduledArena,
          mapName: 'Scrapyard',
          rotationEndsAt: 300_000,
        },
        arenaChanged: true,
        eligiblePlayerIds: ['leader'],
        requestedPlayerIds: [],
        serverTime: 2,
        expiresAt: 60_002,
      },
      intent: { ...state.intent, composition: { humanCount: 1, botCount: 1 } },
    };
    expect(isPartyState(results)).toBe(true);
    expect(
      isPartyState({
        ...results,
        participants: results.participants.map((participant) => ({
          ...participant,
          source: 'human',
        })),
      }),
    ).toBe(false);
    expect(isPartyState({ ...results, rematch: { ...results.rematch, arenaChanged: false } })).toBe(
      false,
    );
    expect(
      isPartyState({
        ...results,
        rematch: { ...results.rematch, eligiblePlayerIds: [], requestedPlayerIds: [] },
      }),
    ).toBe(false);
    expect(
      isPartyState({
        ...results,
        lifecycle: 'match',
        rematch: undefined,
        members: [{ ...results.members[0], ready: true }],
        slots: [
          {
            index: 0,
            status: 'occupied',
            member: { ...results.members[0], ready: true },
          },
        ],
        participants: results.participants.map((participant) => ({
          ...participant,
          ready: true,
        })),
      }),
    ).toBe(true);
    expect(isPartyState({ ...state, rematch: results.rematch })).toBe(false);
  });
});
