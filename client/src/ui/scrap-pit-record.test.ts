import { describe, expect, it } from 'vitest';
import {
  EMPTY_SCRAP_PIT_RECORD,
  normalizeScrapPitRecord,
  scrapPitButtonLabel,
  scrapPitRecordResultLabel,
  scrapPitRecordUpdate,
  type ScrapPitRecord,
} from './scrap-pit-record.js';

function record(overrides: Partial<ScrapPitRecord> = {}): ScrapPitRecord {
  return { ...EMPTY_SCRAP_PIT_RECORD, ...overrides };
}

describe('Scrap Pit records', () => {
  it('normalizes malformed and impossible local progress', () => {
    expect(normalizeScrapPitRecord('{nope')).toEqual(EMPTY_SCRAP_PIT_RECORD);
    expect(
      normalizeScrapPitRecord(
        JSON.stringify({
          rounds: 4.9,
          wins: 20,
          currentStreak: 9,
          bestStreak: -3,
          lastMatchId: 42,
        }),
      ),
    ).toEqual({
      rounds: 4,
      wins: 4,
      currentStreak: 4,
      bestStreak: 4,
      lastMatchId: null,
    });
  });

  it('builds win runs from authoritative winners and celebrates records', () => {
    const first = scrapPitRecordUpdate({ matchId: 'pit-1', winnerId: 'local' }, 'local', record());
    expect(first).toMatchObject({ outcome: 'win', isNewBest: true, counted: true });
    expect(first?.record).toEqual({
      rounds: 1,
      wins: 1,
      currentStreak: 1,
      bestStreak: 1,
      lastMatchId: 'pit-1',
    });
    expect(scrapPitRecordResultLabel(first)).toBe('PIT RECORD: 1W / 1  //  FIRST WIN  //  RUN 1');

    const second = scrapPitRecordUpdate(
      { matchId: 'pit-2', winnerId: 'local' },
      'local',
      first!.record,
    );
    expect(scrapPitRecordResultLabel(second)).toBe('PIT RECORD: 2W / 2  //  2-WIN RUN - NEW BEST');
    expect(scrapPitButtonLabel(second!.record)).toBe('SCRAP PIT\n2W · BEST 2');
  });

  it('lets a draw hold a run and reports when a loss ends it', () => {
    const prior = record({ rounds: 5, wins: 3, currentStreak: 3, bestStreak: 3 });
    const draw = scrapPitRecordUpdate({ matchId: 'pit-draw', winnerId: null }, 'local', prior);
    expect(draw?.record.currentStreak).toBe(3);
    expect(scrapPitRecordResultLabel(draw)).toBe('PIT RECORD: 3W / 6  //  RUN 3 HOLDS  //  BEST 3');

    const loss = scrapPitRecordUpdate(
      { matchId: 'pit-loss', winnerId: 'rival' },
      'local',
      draw!.record,
    );
    expect(loss?.record.currentStreak).toBe(0);
    expect(scrapPitRecordResultLabel(loss)).toBe(
      'PIT RECORD: 3W / 7  //  3-WIN RUN ENDED  //  BEST 3',
    );
  });

  it('counts a match once and ignores results without a local identity', () => {
    const prior = record({
      rounds: 8,
      wins: 4,
      currentStreak: 2,
      bestStreak: 3,
      lastMatchId: 'pit-repeat',
    });
    const duplicate = scrapPitRecordUpdate(
      { matchId: 'pit-repeat', winnerId: 'local' },
      'local',
      prior,
    );
    expect(duplicate).toMatchObject({ counted: false, record: prior });
    expect(scrapPitRecordResultLabel(duplicate)).toBe('PIT RECORD: 4W / 8  //  BEST RUN 3');
    expect(scrapPitRecordUpdate({ matchId: 'pit-new', winnerId: 'local' }, null, prior)).toBeNull();
    expect(scrapPitButtonLabel(record())).toBe('SCRAP PIT\nNO WINS YET');
  });
});
