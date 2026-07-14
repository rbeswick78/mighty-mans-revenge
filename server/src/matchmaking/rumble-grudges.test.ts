import { describe, expect, it } from 'vitest';
import type { KillFeedEntry } from '@shared/game';
import { resolveRumbleGrudges } from './rumble-grudges.js';

const fighters = [
  { id: 'a', nickname: 'Alpha' },
  { id: 'b', nickname: 'Bravo' },
  { id: 'c', nickname: 'Cora' },
];

function knockout(killerId: string, victimId: string, timestamp: number): KillFeedEntry {
  return { killerId, victimId, weapon: 'gun', timestamp };
}

describe('resolveRumbleGrudges', () => {
  it("picks each connected fighter's most frequent opponent knockout", () => {
    expect(
      resolveRumbleGrudges(
        [
          knockout('b', 'a', 1),
          knockout('c', 'a', 2),
          knockout('b', 'a', 3),
          knockout('a', 'b', 4),
        ],
        fighters,
        ['a', 'b', 'c'],
      ),
    ).toEqual({
      a: { targetId: 'b', targetNickname: 'Bravo', knockouts: 2 },
      b: { targetId: 'a', targetNickname: 'Alpha', knockouts: 1 },
    });
  });

  it('uses the most recent wound as the deterministic count tie-break', () => {
    expect(
      resolveRumbleGrudges([knockout('b', 'a', 100), knockout('c', 'a', 101)], fighters, [
        'a',
        'b',
        'c',
      ]).a,
    ).toEqual({ targetId: 'c', targetNickname: 'Cora', knockouts: 1 });
  });

  it('ignores suicides, departed fighters, and fighters who took no knockout', () => {
    expect(
      resolveRumbleGrudges(
        [knockout('a', 'a', 1), knockout('c', 'a', 2), knockout('a', 'b', 3)],
        fighters,
        ['a', 'b'],
      ),
    ).toEqual({ b: { targetId: 'a', targetNickname: 'Alpha', knockouts: 1 } });
  });
});
