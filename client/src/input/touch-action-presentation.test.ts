import { describe, expect, it } from 'vitest';

import {
  TAUNT_BUTTON_LABEL,
  abilityButtonLabel,
  grenadeButtonLabel,
  touchAbilityState,
} from './touch-action-presentation.js';

describe('touch action presentation', () => {
  it('uses action names instead of keyboard-mnemonic letters', () => {
    expect(TAUNT_BUTTON_LABEL).toBe('TAUNT');
    expect(grenadeButtonLabel(false)).toBe('GRENADE');
    expect(grenadeButtonLabel(true)).toBe('DETONATE');
  });

  it('makes every ability button state explicit', () => {
    expect(abilityButtonLabel('ready')).toBe('ABILITY\nREADY');
    expect(abilityButtonLabel('active')).toBe('ABILITY\nACTIVE');
    expect(abilityButtonLabel('cooldown')).toBe('ABILITY\nCOOLDOWN');
  });

  it('derives active, cooldown, and safe ready states from snapshot timers', () => {
    expect(touchAbilityState(1, 20)).toBe('active');
    expect(touchAbilityState(0, 0.01)).toBe('cooldown');
    expect(touchAbilityState(0, 0)).toBe('ready');
    expect(touchAbilityState(Number.NaN, Number.POSITIVE_INFINITY)).toBe('ready');
  });
});
