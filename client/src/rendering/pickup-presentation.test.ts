import { describe, expect, it } from 'vitest';
import { MUTATORS } from '@shared/config/game.js';
import { PickupType, type PickupState } from '@shared/types/pickup.js';
import { pickupPresentation } from './pickup-presentation.js';

function pickup(overrides: Partial<PickupState> = {}): PickupState {
  return {
    id: 'pickup-1',
    type: PickupType.BANDAGE,
    position: { x: 120, y: 120 },
    isActive: true,
    respawnTimer: 0,
    ...overrides,
  };
}

describe('pickupPresentation', () => {
  it('leaves authored and permanent cache pickups visually neutral', () => {
    expect(pickupPresentation(pickup(), 500)).toEqual({
      scale: 1,
      tint: null,
      alpha: 1,
    });
  });

  it('gives Scavenger Rush supplies a cyan accelerating urgency pulse', () => {
    const fresh = pickupPresentation(
      pickup({
        isScavengerRushDrop: true,
        expiresInSeconds: MUTATORS.SCAVENGER_RUSH_DROP_LIFETIME_SECONDS,
      }),
      240,
    );
    const urgent = pickupPresentation(
      pickup({ isScavengerRushDrop: true, expiresInSeconds: 0 }),
      240,
    );

    expect(fresh.tint).toBe(0x5ce1e6);
    expect(urgent.tint).toBe(0x5ce1e6);
    expect(urgent.alpha).toBeGreaterThan(fresh.alpha);
    expect(urgent.scale).not.toBe(fresh.scale);
  });

  it('preserves corpse-weapon gold if malformed flags overlap', () => {
    expect(
      pickupPresentation(
        pickup({
          isDroppedWeapon: true,
          isScavengerRushDrop: true,
          expiresInSeconds: 1,
        }),
        100,
      ).tint,
    ).toBe(0xffd166);
  });
});
