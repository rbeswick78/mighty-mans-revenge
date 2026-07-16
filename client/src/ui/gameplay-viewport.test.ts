import { describe, expect, it, vi } from 'vitest';

import {
  GAMEPLAY_LOGICAL_HEIGHT,
  GAMEPLAY_LOGICAL_WIDTH,
  calculateGameplayOverlaySafeArea,
  gameplayViewportForCapabilities,
  useGameplayLogicalSize,
} from './gameplay-viewport.js';

describe('gameplay viewport contract', () => {
  it('fails closed to the exact established 960x720 surface', () => {
    for (const capabilities of [
      undefined,
      null,
      {},
      { largeWorlds: false },
      { largeWorlds: 'true' },
      { largeWorlds: 1 },
    ]) {
      expect(gameplayViewportForCapabilities(capabilities)).toEqual({
        mode: 'legacy',
        logicalWidth: 960,
        logicalHeight: 720,
        worldBounds: { left: 0, top: 0, width: 960, height: 576 },
      });
    }
  });

  it('uses a fixed logical 16:9 surface only for literal largeWorlds true', () => {
    const viewport = gameplayViewportForCapabilities({ largeWorlds: true });

    expect(GAMEPLAY_LOGICAL_WIDTH / GAMEPLAY_LOGICAL_HEIGHT).toBe(16 / 9);
    expect(viewport).toEqual({
      mode: 'large-world',
      logicalWidth: 1280,
      logicalHeight: 720,
      worldBounds: { left: 0, top: 0, width: 960, height: 576 },
    });
  });

  it('keeps desktop and mobile-landscape logical visibility identical', () => {
    const desktop = gameplayViewportForCapabilities({ largeWorlds: true });
    const mobile = gameplayViewportForCapabilities({
      newShell: false,
      schedules: false,
      largeWorlds: true,
      modernArt: false,
      battleRoyale: false,
    });

    expect(mobile).toBe(desktop);
    expect(mobile.logicalWidth).toBe(1280);
    expect(mobile.logicalHeight).toBe(720);
  });

  it('absorbs mobile side insets in FIT letterboxing without widening the safe area', () => {
    const desktop = calculateGameplayOverlaySafeArea(
      { left: 0, top: 0, width: 1280, height: 720 },
      { width: 1280, height: 720 },
    );
    const mobile = calculateGameplayOverlaySafeArea(
      { left: 75.5, top: 0, width: 693, height: 390 },
      { width: 844, height: 390 },
      { top: 0, right: 47, bottom: 0, left: 47 },
    );

    expect(desktop).toEqual({
      left: 32,
      top: 32,
      right: 1248,
      bottom: 688,
      width: 1216,
      height: 656,
    });
    expect(mobile).toEqual(desktop);
  });

  it('converts edge-to-edge browser intrusions into logical overlay bounds', () => {
    expect(
      calculateGameplayOverlaySafeArea(
        { left: 0, top: 0, width: 1280, height: 720 },
        { width: 1280, height: 720 },
        { top: 10, right: 20, bottom: 30, left: 50 },
      ),
    ).toMatchObject({ left: 82, top: 42, right: 1228, bottom: 658 });
  });

  it('changes game size only when the selected contract differs', () => {
    const setGameSize = vi.fn();
    const legacyScale = { width: 960, height: 720, setGameSize };
    const wideScale = { width: 1280, height: 720, setGameSize };

    useGameplayLogicalSize(legacyScale as never, undefined);
    useGameplayLogicalSize(wideScale as never, { largeWorlds: true });
    expect(setGameSize).not.toHaveBeenCalled();

    useGameplayLogicalSize(legacyScale as never, { largeWorlds: true });
    expect(setGameSize).toHaveBeenCalledOnce();
    expect(setGameSize).toHaveBeenCalledWith(1280, 720);
  });
});
