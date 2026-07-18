import { describe, expect, it } from 'vitest';

import type { BattleRoyaleSpectatorState } from '@shared/types/game.js';
import {
  battleRoyaleSpectatorPresentation,
  cycleBattleRoyaleSpectatorTarget,
} from './battle-royale-spectator.js';

const state: BattleRoyaleSpectatorState = {
  livingPlayerIds: ['alpha', 'bravo', 'charlie'],
  aliveCount: 3,
  standings: [
    {
      playerId: 'local',
      placement: 4,
      status: 'eliminated',
      eliminatedBy: 'bravo',
      eliminationCause: 'combat',
    },
    ...['alpha', 'bravo', 'charlie'].map((playerId) => ({
      playerId,
      placement: 3,
      status: 'alive' as const,
      eliminatedBy: null,
      eliminationCause: null,
    })),
  ],
};

describe('Battle Royale spectator projection', () => {
  it('cycles deterministically and repairs stale targets from server order', () => {
    expect(cycleBattleRoyaleSpectatorTarget(state.livingPlayerIds, null, 1)).toBe('alpha');
    expect(cycleBattleRoyaleSpectatorTarget(state.livingPlayerIds, null, -1)).toBe('charlie');
    expect(cycleBattleRoyaleSpectatorTarget(state.livingPlayerIds, 'bravo', 1)).toBe('charlie');
    expect(cycleBattleRoyaleSpectatorTarget(state.livingPlayerIds, 'alpha', -1)).toBe('charlie');
    expect(cycleBattleRoyaleSpectatorTarget([], 'alpha', 1)).toBeNull();
  });

  it('shows authoritative placement, alive count, target, and opponent context', () => {
    expect(
      battleRoyaleSpectatorPresentation(state, 'local', 'bravo', {
        bravo: 'Brawler',
      }),
    ).toEqual({
      active: true,
      placementLabel: 'PLACED #4',
      aliveLabel: '3 ALIVE',
      targetId: 'bravo',
      targetLabel: 'WATCHING BRAWLER',
      killerLabel: 'ELIMINATED BY BRAWLER',
    });
  });

  it.each([
    ['zone', null, 'CLAIMED BY THE ZONE'],
    ['combat', 'local', 'SELF-ELIMINATED'],
    ['combat', null, 'ELIMINATED IN COMBAT'],
    [null, null, 'ELIMINATION CONFIRMED'],
  ] as const)('uses deterministic %s fallback context', (cause, killer, expected) => {
    const contextual: BattleRoyaleSpectatorState = {
      ...state,
      standings: state.standings.map((standing) =>
        standing.playerId === 'local'
          ? { ...standing, eliminationCause: cause, eliminatedBy: killer }
          : standing,
      ),
    };
    expect(battleRoyaleSpectatorPresentation(contextual, 'local', null).killerLabel).toBe(expected);
  });

  it('stays inactive for a living local fighter and tolerates an old server', () => {
    expect(battleRoyaleSpectatorPresentation(state, 'alpha', 'bravo').active).toBe(false);
    expect(battleRoyaleSpectatorPresentation(null, 'local', 'bravo').active).toBe(false);
  });
});
