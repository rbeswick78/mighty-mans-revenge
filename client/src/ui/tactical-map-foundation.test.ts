import { describe, expect, it } from 'vitest';

import { gameplayViewportForCapabilities } from './gameplay-viewport.js';
import { responsiveCombatHudLayout } from './responsive-combat-hud.js';
import { tacticalMapLayoutForGameplay } from './tactical-map-foundation.js';

describe('tactical map layout', () => {
  it('fits the BR map inside the safe area at its authored aspect', () => {
    const viewport = gameplayViewportForCapabilities({ battleRoyale: true }, true);
    const hud = responsiveCombatHudLayout(viewport, null);
    const world = { left: 0, top: 0, width: 2688, height: 1632 } as const;
    const layout = tacticalMapLayoutForGameplay(hud, world);
    expect(layout.panel.x).toBeGreaterThanOrEqual(hud.safeArea.left);
    expect(layout.panel.y).toBeGreaterThanOrEqual(hud.safeArea.top);
    expect(layout.panel.x + layout.panel.width).toBeLessThanOrEqual(hud.safeArea.right);
    expect(layout.panel.y + layout.panel.height).toBeLessThanOrEqual(hud.safeArea.bottom);
    expect(layout.map.width / layout.map.height).toBeCloseTo(world.width / world.height, 8);
  });
});
