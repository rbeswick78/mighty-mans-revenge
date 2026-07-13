import { describe, expect, it } from 'vitest';
import { PICKUP } from '@shared/config/game.js';
import { armorPresentation } from './armor-presentation.js';

describe('armorPresentation', () => {
  it('hides an empty shield and keeps the health-only label', () => {
    expect(armorPresentation(76.2, 0)).toEqual({
      visible: false,
      ratio: 0,
      healthLabel: '77',
    });
  });

  it('shows the shield separately and caps malformed values visually', () => {
    expect(armorPresentation(41.1, 12.2)).toEqual({
      visible: true,
      ratio: 12.2 / PICKUP.ARMOR_MAX,
      healthLabel: '42 +13',
    });
    expect(armorPresentation(100, PICKUP.ARMOR_MAX + 5).ratio).toBe(1);
  });
});
