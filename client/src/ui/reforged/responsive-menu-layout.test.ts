import { describe, expect, it } from 'vitest';
import {
  MENU_LOGICAL_HEIGHT,
  MENU_LOGICAL_WIDTH,
  calculateMenuSafeArea,
} from './responsive-menu-layout.js';

describe('calculateMenuSafeArea', () => {
  it('keeps the modern menu on a fixed logical 16:9 surface', () => {
    expect(MENU_LOGICAL_WIDTH / MENU_LOGICAL_HEIGHT).toBe(16 / 9);
    expect(
      calculateMenuSafeArea(
        { left: 0, top: 0, width: 1280, height: 720 },
        { width: 1280, height: 720 },
      ),
    ).toEqual({
      left: 32,
      top: 32,
      right: 1248,
      bottom: 688,
      width: 1216,
      height: 656,
    });
  });

  it('does not double-count safe insets already absorbed by letterboxing', () => {
    const area = calculateMenuSafeArea(
      { left: 75.5, top: 0, width: 693, height: 390 },
      { width: 844, height: 390 },
      { top: 0, right: 47, bottom: 0, left: 47 },
    );

    expect(area.left).toBe(32);
    expect(area.right).toBe(1248);
  });

  it('converts viewport intrusions into logical padding on an edge-to-edge canvas', () => {
    const area = calculateMenuSafeArea(
      { left: 0, top: 0, width: 1280, height: 720 },
      { width: 1280, height: 720 },
      { top: 10, right: 20, bottom: 30, left: 50 },
    );

    expect(area).toMatchObject({ left: 82, top: 42, right: 1228, bottom: 658 });
  });
});
