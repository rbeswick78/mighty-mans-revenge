import { describe, expect, it } from 'vitest';

import { getBattleRoyaleMap } from '../maps/registry.js';
import {
  battleRoyaleSafeZoneStateAt,
  createBattleRoyaleSafeZonePlan,
  isOutsideBattleRoyaleSafeZone,
} from './battle-royale-safe-zone.js';

describe('Battle Royale safe-zone geometry', () => {
  it('creates stable, map-bounded, strictly nested target circles', () => {
    const map = getBattleRoyaleMap();
    const first = createBattleRoyaleSafeZonePlan('stable-match', map);
    const second = createBattleRoyaleSafeZonePlan('stable-match', map);
    expect(first).toEqual(second);

    const targets = [first.segments[0].from, ...first.segments.map(({ to }) => to)].filter(
      (candidate, index, all) =>
        index === 0 ||
        candidate.radius !== all[index - 1].radius ||
        candidate.center.x !== all[index - 1].center.x ||
        candidate.center.y !== all[index - 1].center.y,
    );
    const width = map.width * map.tileSize;
    const height = map.height * map.tileSize;
    for (let index = 1; index < targets.length; index += 1) {
      const parent = targets[index - 1];
      const child = targets[index];
      expect(child.radius).toBeLessThan(parent.radius);
      expect(
        Math.hypot(child.center.x - parent.center.x, child.center.y - parent.center.y),
      ).toBeLessThanOrEqual(parent.radius - child.radius + 1e-9);
      expect(child.center.x - child.radius).toBeGreaterThanOrEqual(0);
      expect(child.center.x + child.radius).toBeLessThanOrEqual(width);
      expect(child.center.y - child.radius).toBeGreaterThanOrEqual(0);
      expect(child.center.y + child.radius).toBeLessThanOrEqual(height);
    }
  });

  it('samples exact preview, closing, hold, and final boundaries', () => {
    const plan = createBattleRoyaleSafeZonePlan('phase-match', getBattleRoyaleMap());
    expect(battleRoyaleSafeZoneStateAt(plan, 0)).toMatchObject({
      phaseIndex: 0,
      phase: 'preview',
      damagePerPulse: 0,
      phaseSecondsRemaining: 12,
    });
    const closing = battleRoyaleSafeZoneStateAt(plan, 12);
    expect(closing).toMatchObject({ phaseIndex: 1, phase: 'closing', damagePerPulse: 2 });
    expect(closing.radius).toBe(plan.segments[1].from.radius);
    const hold = battleRoyaleSafeZoneStateAt(plan, 32);
    expect(hold).toMatchObject({ phaseIndex: 2, phase: 'hold', damagePerPulse: 3 });
    expect(hold.radius).toBe(plan.segments[2].from.radius);
    const final = battleRoyaleSafeZoneStateAt(plan, plan.totalDurationSeconds);
    expect(final).toMatchObject({
      phaseIndex: 7,
      phase: 'final',
      radius: 0,
      nextCenter: null,
      nextRadius: null,
      phaseSecondsRemaining: 0,
    });
  });

  it('shrinks monotonically throughout closing phases and classifies the boundary', () => {
    const plan = createBattleRoyaleSafeZonePlan('monotonic-match', getBattleRoyaleMap());
    let previous = Number.POSITIVE_INFINITY;
    for (let elapsed = 0; elapsed <= plan.totalDurationSeconds; elapsed += 0.25) {
      const state = battleRoyaleSafeZoneStateAt(plan, elapsed);
      expect(state.radius).toBeLessThanOrEqual(previous + 1e-9);
      previous = state.radius;
    }
    const state = battleRoyaleSafeZoneStateAt(plan, 40);
    expect(
      isOutsideBattleRoyaleSafeZone({ x: state.center.x + state.radius, y: state.center.y }, state),
    ).toBe(false);
    expect(
      isOutsideBattleRoyaleSafeZone(
        { x: state.center.x + state.radius + 0.001, y: state.center.y },
        state,
      ),
    ).toBe(true);
  });
});
