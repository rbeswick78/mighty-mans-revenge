import { describe, expect, it } from 'vitest';
import { battleRoyaleRecordResponse } from './battle-royale-record.js';

const record = {
  matches: 4,
  wins: 1,
  topThreeFinishes: 2,
  eliminations: 9,
  damage: 2400,
  bestPlacement: 1,
} as const;

describe('battleRoyaleRecordResponse', () => {
  it('accepts the requested callsign case-insensitively and clones server truth', () => {
    const result = battleRoyaleRecordResponse(' Alpha ', 'alpha', record);
    expect(result).toEqual({ accepted: true, record });
    if (result.accepted && result.record) expect(result.record).not.toBe(record);
  });

  it('rejects stale and empty identities while accepting an explicit no-record response', () => {
    expect(battleRoyaleRecordResponse('Bravo', 'Alpha', record)).toEqual({ accepted: false });
    expect(battleRoyaleRecordResponse('', '', record)).toEqual({ accepted: false });
    expect(battleRoyaleRecordResponse('Newcomer', 'newcomer', null)).toEqual({
      accepted: true,
      record: null,
    });
  });
});
