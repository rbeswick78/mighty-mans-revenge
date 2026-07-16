import { describe, expect, it } from 'vitest';

import {
  calculateGameplayOverlaySafeArea,
  gameplayViewportForCapabilities,
} from './gameplay-viewport.js';
import { hudRectsOverlap, responsiveCombatHudLayout } from './responsive-combat-hud.js';

const largeWorld = gameplayViewportForCapabilities({ largeWorlds: true });

describe('responsive combat HUD layout', () => {
  it('preserves the exact established 960x720 fallback geometry', () => {
    const layout = responsiveCombatHudLayout(
      gameplayViewportForCapabilities({ largeWorlds: false }),
      null,
    );

    expect(layout).toMatchObject({
      mode: 'legacy',
      logicalWidth: 960,
      logicalHeight: 720,
      vitalsPanel: { x: 0, y: 576, width: 960, height: 144 },
      healthBar: { x: 16, y: 592, width: 200, height: 20 },
      staminaBar: { x: 16, y: 618, width: 200, height: 16 },
      ammo: { x: 16, y: 646 },
      grenades: { x: 16, y: 670 },
      ability: { x: 252, y: 610 },
      score: { x: 480, y: 590 },
      modeStatus: { x: 480, y: 620 },
      timer: { x: 480, y: 644 },
      killFeed: { x: 944, y: 592 },
      menu: { launcher: { x: 816, y: 14, width: 128, height: 42 } },
      touchActions: {
        taunt: { x: 808, y: 116 },
        grenade: { x: 904, y: 116 },
        ability: { x: 904, y: 208 },
      },
    });
  });

  it('uses one 1280x720 logical model for desktop and mobile FIT surfaces', () => {
    const desktopSafe = calculateGameplayOverlaySafeArea(
      { left: 0, top: 0, width: 1280, height: 720 },
      { width: 1280, height: 720 },
    );
    const mobileSafe = calculateGameplayOverlaySafeArea(
      { left: 0, top: 0, width: 844, height: 474.75 },
      { width: 844, height: 474.75 },
    );

    expect(responsiveCombatHudLayout(largeWorld, desktopSafe)).toEqual(
      responsiveCombatHudLayout(largeWorld, mobileSafe),
    );
    expect(responsiveCombatHudLayout(largeWorld, desktopSafe)).toMatchObject({
      mode: 'large-world',
      logicalWidth: 1280,
      logicalHeight: 720,
      safeArea: { left: 32, top: 32, right: 1248, bottom: 688 },
    });
  });

  it('moves every combat resource and status anchor inside the safe area', () => {
    const safeArea = Object.freeze({
      left: 96,
      top: 48,
      right: 1184,
      bottom: 672,
      width: 1088,
      height: 624,
    });
    const layout = responsiveCombatHudLayout(largeWorld, safeArea);
    const points = [
      layout.healthBar,
      layout.staminaBar,
      layout.ammo,
      layout.grenades,
      layout.specialWeapon,
      layout.ability,
      layout.score,
      layout.modeStatus,
      layout.timer,
      layout.activeEvent,
      layout.killFeed,
      layout.contract,
      layout.countdown,
      layout.death,
      layout.callouts.combat,
      layout.callouts.contract,
      layout.callouts.event,
      layout.menu.launcher,
      layout.touchActions.taunt,
      layout.touchActions.grenade,
      layout.touchActions.ability,
    ];

    for (const value of points) {
      expect(value.x).toBeGreaterThanOrEqual(safeArea.left);
      expect(value.x).toBeLessThanOrEqual(safeArea.right);
      expect(value.y).toBeGreaterThanOrEqual(safeArea.top);
      expect(value.y).toBeLessThanOrEqual(safeArea.bottom);
    }
  });

  it('keeps priority regions and simultaneous callout lanes distinct', () => {
    const safeArea = calculateGameplayOverlaySafeArea(
      { left: 0, top: 0, width: 1280, height: 720 },
      { width: 1280, height: 720 },
    );
    const layout = responsiveCombatHudLayout(largeWorld, safeArea);
    const touchRegion = {
      x: layout.touchActions.taunt.x - 40,
      y: layout.touchActions.taunt.y - 40,
      width: layout.safeArea.right - layout.touchActions.taunt.x + 40,
      height: 80,
    };

    expect(hudRectsOverlap(layout.vitalsPanel, touchRegion)).toBe(false);
    expect(hudRectsOverlap(layout.contract, layout.menu.launcher)).toBe(false);
    expect([
      layout.callouts.combat.y,
      layout.callouts.contract.y,
      layout.callouts.event.y,
      layout.countdown.y,
    ]).toEqual([170, 235, 300, 360]);
  });

  it('changes overlay positions without changing logical world visibility', () => {
    const base = responsiveCombatHudLayout(largeWorld, {
      left: 32,
      top: 32,
      right: 1248,
      bottom: 688,
      width: 1216,
      height: 656,
    });
    const inset = responsiveCombatHudLayout(largeWorld, {
      left: 120,
      top: 64,
      right: 1160,
      bottom: 656,
      width: 1040,
      height: 592,
    });

    expect(inset.contract.x).toBeGreaterThan(base.contract.x);
    expect(inset.menu.launcher.x).toBeLessThan(base.menu.launcher.x);
    expect(inset.touchActions.ability.y).toBeLessThan(base.touchActions.ability.y);
    expect(inset.logicalWidth).toBe(base.logicalWidth);
    expect(inset.logicalHeight).toBe(base.logicalHeight);
    expect(largeWorld.worldBounds).toEqual({ left: 0, top: 0, width: 960, height: 576 });
  });
});
