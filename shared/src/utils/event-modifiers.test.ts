import { describe, it, expect } from 'vitest';
import { eventToMovementModifiers, eventDisplayName } from './event-modifiers.js';
import { EVENT } from '../config/game.js';
import type { FinalMinuteEvent } from '../types/network.js';

describe('eventToMovementModifiers', () => {
  it('returns the super-speed modifier set for super_speed', () => {
    expect(eventToMovementModifiers('super_speed')).toEqual({
      speedMultiplier: EVENT.SUPER_SPEED_MULTIPLIER,
      sprintEnabled: false,
      staminaFrozen: true,
    });
  });

  it('returns no modifier for events that do not change movement', () => {
    const passthrough: FinalMinuteEvent[] = ['grenades_only', 'infinite_ammo', 'low_health'];
    for (const event of passthrough) {
      expect(eventToMovementModifiers(event)).toEqual({});
    }
  });

  it('returns no modifier when no event is active', () => {
    expect(eventToMovementModifiers(null)).toEqual({});
  });
});

describe('eventDisplayName', () => {
  it('returns a label for every event in the pool', () => {
    for (const event of EVENT.POOL) {
      const label = eventDisplayName(event);
      expect(label).toBeTruthy();
      expect(label).toBe(label.toUpperCase());
    }
  });
});
