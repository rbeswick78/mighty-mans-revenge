import { describe, expect, it } from 'vitest';
import type { RawInput } from './types.js';
import { withoutSecondaryActions } from './combat-input.js';

describe('withoutSecondaryActions', () => {
  it('blocks grenade, reload, and ability actions without touching primary play', () => {
    const raw: RawInput = {
      moveX: 0.75,
      moveY: -0.25,
      aimAngle: 1.2,
      aimingGun: true,
      firePressed: true,
      aimingGrenade: true,
      throwPressed: true,
      detonatePressed: true,
      sprint: true,
      reload: true,
      abilityPressed: true,
      tauntPressed: true,
    };

    expect(withoutSecondaryActions(raw)).toEqual({
      ...raw,
      aimingGrenade: false,
      throwPressed: false,
      detonatePressed: false,
      reload: false,
      abilityPressed: false,
      tauntPressed: true,
    });
  });
});
