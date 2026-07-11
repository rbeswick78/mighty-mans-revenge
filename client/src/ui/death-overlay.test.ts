import { describe, expect, it } from 'vitest';
import { deathOverlayLabel } from './death-overlay.js';

describe('deathOverlayLabel', () => {
  it('hides while alive', () => {
    expect(deathOverlayLabel(false, 2.4, false)).toBeNull();
  });

  it('rounds the normal respawn countdown up and clamps at zero', () => {
    expect(deathOverlayLabel(true, 2.01, false)).toBe('YOU DIED\nRESPAWN IN 3');
    expect(deathOverlayLabel(true, -1, false)).toBe('YOU DIED\nRESPAWN IN 0');
  });

  it('shows permanent elimination instead of a fake countdown', () => {
    expect(deathOverlayLabel(true, 3, true)).toBe('ELIMINATED');
  });
});
