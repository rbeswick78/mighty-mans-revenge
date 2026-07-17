import { describe, expect, it } from 'vitest';

import { GameModeType } from '@shared/types/game.js';
import { getMap } from '@shared/maps/registry.js';
import { createCollisionGrid } from '@shared/utils/collision.js';

import {
  calculateGameplayOverlaySafeArea,
  gameplayViewportForCapabilities,
} from './gameplay-viewport.js';
import { hudRectsOverlap, responsiveCombatHudLayout } from './responsive-combat-hud.js';
import {
  createMinimapDynamicProjection,
  createMinimapStaticProjection,
  minimapLayoutForGameplay,
  projectWorldPointToMinimap,
  type MinimapDynamicInput,
} from './minimap-foundation.js';
import { worldBoundsForMap } from '../rendering/dynamic-world-rendering.js';

const viewport = gameplayViewportForCapabilities({ largeWorlds: true });
const safeArea = calculateGameplayOverlaySafeArea(
  { left: 0, top: 0, width: 1280, height: 720 },
  { width: 1280, height: 720 },
);
const hud = responsiveCombatHudLayout(viewport, safeArea);
const map = getMap('Scrapyard');
const worldBounds = worldBoundsForMap(map);
const layout = minimapLayoutForGameplay(viewport, hud, worldBounds)!;

const players = [
  { id: 'local', position: { x: 144, y: 144 }, isDead: false },
  { id: 'ally-b', position: { x: 240, y: 192 }, isDead: true },
  { id: 'rival', position: { x: 720, y: 384 }, isDead: false },
  { id: 'ally-a', position: { x: 336, y: 240 }, isDead: false },
] as const;

function dynamicInput(overrides: Partial<MinimapDynamicInput> = {}): MinimapDynamicInput {
  return {
    gameMode: GameModeType.DEATHMATCH,
    players,
    localPlayerId: 'local',
    koth: null,
    confirmedTags: [],
    coreRun: null,
    bountyHunt: null,
    ...overrides,
  };
}

describe('minimap foundation', () => {
  it('fails closed on legacy gameplay and uses one desktop/mobile logical layout', () => {
    const legacyViewport = gameplayViewportForCapabilities({ largeWorlds: false });
    const legacyHud = responsiveCombatHudLayout(legacyViewport, null);
    expect(minimapLayoutForGameplay(legacyViewport, legacyHud, worldBounds)).toBeNull();

    const mobileSafe = calculateGameplayOverlaySafeArea(
      { left: 75.5, top: 0, width: 693, height: 390 },
      { width: 844, height: 390 },
      { top: 0, right: 47, bottom: 0, left: 47 },
    );
    const mobileHud = responsiveCombatHudLayout(viewport, mobileSafe);
    expect(minimapLayoutForGameplay(viewport, mobileHud, worldBounds)).toEqual(layout);
  });

  it('coexists with the complete safe-area HUD priority model', () => {
    expect(layout.panel.x).toBeGreaterThanOrEqual(hud.safeArea.left);
    expect(layout.panel.y).toBeGreaterThanOrEqual(hud.killFeed.y + 5 * 24);
    expect(layout.panel.x + layout.panel.width).toBeLessThanOrEqual(hud.safeArea.right);
    expect(layout.panel.y + layout.panel.height).toBeLessThan(hud.touchActions.taunt.y - 40);
    expect(hudRectsOverlap(layout.panel, hud.menu.launcher)).toBe(false);
    expect(hudRectsOverlap(layout.panel, hud.contract)).toBe(false);
    expect(hudRectsOverlap(layout.panel, hud.vitalsPanel)).toBe(false);
  });

  it('projects actual map bounds and every solid independently of camera culling', () => {
    const grid = createCollisionGrid(map);
    const projection = createMinimapStaticProjection(map, grid, layout);
    const expectedSolids = grid.solid.flat().filter(Boolean).length;

    expect(projection.worldBounds).toEqual({ left: 0, top: 0, width: 960, height: 576 });
    expect(projection.solids).toHaveLength(expectedSolids);
    expect(projection.solids.some(({ col, row }) => col === 0 && row === 0)).toBe(true);
    expect(projection.solids.some(({ col, row }) => col === 19 && row === 11)).toBe(true);
    expect(projection.landmarks).toHaveLength(map.decorations?.length ?? 0);
  });

  it('projects all six 40x24 successor documents from their authored world bounds', () => {
    for (const name of [
      'Wasteland Outpost',
      'Overgrown Suburb',
      'Scrapyard',
      'Collapsed Overpass',
      'Checkpoint Zero',
      'Rusted Refinery',
    ]) {
      const successor = getMap(name, { largeWorlds: true });
      const successorBounds = worldBoundsForMap(successor);
      const successorLayout = minimapLayoutForGameplay(viewport, hud, successorBounds)!;
      const projection = createMinimapStaticProjection(
        successor,
        createCollisionGrid(successor),
        successorLayout,
      );

      expect(projection.worldBounds, name).toEqual({
        left: 0,
        top: 0,
        width: 1920,
        height: 1152,
      });
      expect(projection.solids, name).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ col: 0, row: 0 }),
          expect.objectContaining({ col: 39, row: 23 }),
        ]),
      );
      expect(projection.landmarks, name).toHaveLength(successor.decorations?.length ?? 0);
    }
  });

  it('removes destroyed solids and their authored landmark without changing map truth', () => {
    const grid = createCollisionGrid(map);
    const before = createMinimapStaticProjection(map, grid, layout);
    grid.solid[5][7] = false;
    const after = createMinimapStaticProjection(map, grid, layout);

    expect(after.worldBounds).toEqual(before.worldBounds);
    expect(after.solids).toHaveLength(before.solids.length - 1);
    expect(after.landmarks).toHaveLength(before.landmarks.length - 1);
    expect(after.landmarks.some(({ kind }) => kind === 'gate')).toBe(true);
  });

  it('projects and clamps world points from the actual origin and dimensions', () => {
    expect(projectWorldPointToMinimap(worldBounds, layout.map, { x: 0, y: 0 })).toEqual({
      x: layout.map.x,
      y: layout.map.y,
    });
    expect(projectWorldPointToMinimap(worldBounds, layout.map, { x: 960, y: 576 })).toEqual({
      x: layout.map.x + layout.map.width,
      y: layout.map.y + layout.map.height,
    });
    expect(projectWorldPointToMinimap(worldBounds, layout.map, { x: -40, y: 900 })).toEqual({
      x: layout.map.x,
      y: layout.map.y + layout.map.height,
    });
  });

  it('projects current and warned KOTH zones only in KOTH', () => {
    const koth = {
      hill: { x: 9, y: 5 },
      nextHill: { x: 7, y: 2 },
      occupantId: 'local',
      contested: false,
      captureFraction: 0.5,
    };
    const active = createMinimapDynamicProjection(
      map,
      layout,
      dynamicInput({ gameMode: GameModeType.KOTH, koth }),
    );
    const wrongMode = createMinimapDynamicProjection(map, layout, dynamicInput({ koth }));

    expect(active.objectives.map(({ kind }) => kind)).toEqual(['koth', 'next-koth']);
    expect(active.objectives.every(({ rect }) => rect !== undefined)).toBe(true);
    expect(wrongMode.objectives).toEqual([]);
  });

  it('projects every live Kill Confirmed tag and no stale tags in other modes', () => {
    const confirmedTags = [
      { id: 'tag-a', ownerId: 'local', position: { x: 96, y: 96 }, expiresInSeconds: 10 },
      { id: 'tag-b', ownerId: 'rival', position: { x: 800, y: 480 }, expiresInSeconds: 8 },
    ];
    const active = createMinimapDynamicProjection(
      map,
      layout,
      dynamicInput({ gameMode: GameModeType.KILL_CONFIRMED, confirmedTags }),
    );
    const wrongMode = createMinimapDynamicProjection(map, layout, dynamicInput({ confirmedTags }));

    expect(active.objectives.map(({ kind, ownerId }) => ({ kind, ownerId }))).toEqual([
      { kind: 'tag', ownerId: 'local' },
      { kind: 'tag', ownerId: 'rival' },
    ]);
    expect(wrongMode.objectives).toEqual([]);
  });

  it('projects Core Run and Bounty Hunt only from their live snapshot truth', () => {
    const core = createMinimapDynamicProjection(
      map,
      layout,
      dynamicInput({
        gameMode: GameModeType.CORE_RUN,
        coreRun: {
          position: { x: 480, y: 288 },
          carrierId: 'ally-a',
          returnInSeconds: null,
          carryFraction: 0.2,
        },
      }),
    );
    const bounty = createMinimapDynamicProjection(
      map,
      layout,
      dynamicInput({
        gameMode: GameModeType.BOUNTY_HUNT,
        bountyHunt: { targetId: 'rival' },
      }),
    );
    const missingTarget = createMinimapDynamicProjection(
      map,
      layout,
      dynamicInput({
        gameMode: GameModeType.BOUNTY_HUNT,
        players: players.filter(({ id }) => id !== 'rival'),
        bountyHunt: { targetId: 'rival' },
      }),
    );

    expect(core.objectives.map(({ kind }) => kind)).toEqual(['core']);
    expect(bounty.objectives.map(({ kind, playerId }) => ({ kind, playerId }))).toEqual([
      { kind: 'bounty', playerId: 'rival' },
    ]);
    expect(missingTarget.objectives).toEqual([]);
  });

  it('shows the local fighter and every exact Crew ally without inferring rivals', () => {
    const projection = createMinimapDynamicProjection(
      map,
      layout,
      dynamicInput({
        playerTeams: {
          local: 'blue',
          'ally-a': 'blue',
          'ally-b': 'blue',
          rival: 'red',
        },
      }),
    );

    expect(
      projection.players.map(({ kind, playerId, isDead }) => ({
        kind,
        playerId,
        isDead,
      })),
    ).toEqual([
      { kind: 'local', playerId: 'local', isDead: false },
      { kind: 'ally', playerId: 'ally-a', isDead: false },
      { kind: 'ally', playerId: 'ally-b', isDead: true },
    ]);
    expect(projection.players.some(({ playerId }) => playerId === 'rival')).toBe(false);
  });

  it('keeps N-player rivals hidden when no authoritative team assignment exists', () => {
    const projection = createMinimapDynamicProjection(map, layout, dynamicInput());
    expect(projection.players.map(({ kind, playerId }) => ({ kind, playerId }))).toEqual([
      { kind: 'local', playerId: 'local' },
    ]);
  });
});
