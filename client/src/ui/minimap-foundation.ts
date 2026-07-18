import { KOTH } from '@shared/config/game.js';
import {
  GameModeType,
  type BountyHuntState,
  type CoreRunState,
  type KillConfirmedTagState,
  type TeamId,
  type BattleRoyaleSafeZoneState,
} from '@shared/types/game.js';
import type { PlayerId } from '@shared/types/common.js';
import type {
  BattleRoyaleBiome,
  CollisionGrid,
  MapData,
  MapDecoration,
} from '@shared/types/map.js';
import type { KothHudState } from '@shared/types/network.js';

import { worldBoundsForMap } from '../rendering/dynamic-world-rendering.js';
import type { WorldBounds } from '../rendering/gameplay-coordinate-space.js';
import type { GameplayViewportContract } from './gameplay-viewport.js';
import type { HudPoint, HudRect, ResponsiveCombatHudLayout } from './responsive-combat-hud.js';

const MINIMAP_MAX_PANEL_WIDTH = 216;
const MINIMAP_PANEL_PADDING = 8;
const MINIMAP_TITLE_HEIGHT = 18;
const MINIMAP_KILL_FEED_ROWS = 5;
const MINIMAP_KILL_FEED_ROW_HEIGHT = 24;
const MINIMAP_HUD_GAP = 12;
const MINIMAP_TOUCH_CLEARANCE = 56;

export type MinimapLandmarkKind = 'prop' | 'hazard' | 'gate' | 'cache';
export type MinimapObjectiveKind = 'koth' | 'next-koth' | 'tag' | 'core' | 'bounty';

export interface MinimapLayout {
  readonly panel: HudRect;
  readonly map: HudRect;
  readonly title: HudPoint;
}

export interface MinimapSolidProjection extends HudRect {
  readonly col: number;
  readonly row: number;
}

export interface MinimapLandmarkProjection extends HudRect {
  readonly kind: MinimapLandmarkKind;
  readonly texture: string;
  readonly label?: string;
}

export interface MinimapRegionProjection {
  readonly id: string;
  readonly displayName: string;
  readonly biome: BattleRoyaleBiome;
  readonly areas: readonly HudRect[];
  readonly label: HudPoint;
}

export interface MinimapContainerProjection extends HudRect {
  readonly id: string;
  readonly col: number;
  readonly row: number;
}

export interface MinimapStaticProjection {
  readonly worldBounds: WorldBounds;
  readonly regions: readonly MinimapRegionProjection[];
  readonly containers: readonly MinimapContainerProjection[];
  readonly solids: readonly MinimapSolidProjection[];
  readonly landmarks: readonly MinimapLandmarkProjection[];
}

export interface MinimapObjectiveProjection {
  readonly kind: MinimapObjectiveKind;
  readonly point?: HudPoint;
  readonly rect?: HudRect;
  readonly playerId?: PlayerId;
  readonly ownerId?: PlayerId;
}

export interface MinimapPlayerProjection {
  readonly kind: 'local' | 'ally';
  readonly playerId: PlayerId;
  readonly point: HudPoint;
  readonly isDead: boolean;
}

export interface MinimapDynamicProjection {
  readonly objectives: readonly MinimapObjectiveProjection[];
  readonly players: readonly MinimapPlayerProjection[];
  readonly safeZone: MinimapSafeZoneProjection | null;
}

export interface MinimapSafeZoneCircleProjection {
  readonly center: HudPoint;
  readonly radius: number;
}

export interface MinimapSafeZoneProjection {
  readonly current: MinimapSafeZoneCircleProjection;
  readonly next: MinimapSafeZoneCircleProjection | null;
  readonly phase: BattleRoyaleSafeZoneState['phase'];
}

export interface MinimapPlayerState {
  readonly id: PlayerId;
  readonly position: Readonly<{ x: number; y: number }>;
  readonly isDead: boolean;
}

export interface MinimapDynamicInput {
  readonly gameMode: GameModeType | null;
  readonly players: readonly MinimapPlayerState[];
  readonly localPlayerId: PlayerId | null;
  readonly playerTeams?: Readonly<Record<PlayerId, TeamId>>;
  readonly koth: KothHudState | null;
  readonly confirmedTags: readonly KillConfirmedTagState[];
  readonly coreRun: CoreRunState | null;
  readonly bountyHunt: BountyHuntState | null;
  readonly battleRoyaleSafeZone?: BattleRoyaleSafeZoneState | null;
}

function point(x: number, y: number): HudPoint {
  return Object.freeze({ x, y });
}

function rect(x: number, y: number, width: number, height: number): HudRect {
  return Object.freeze({ x, y, width, height });
}

/**
 * Safe-area placement owned by Batch 23. It reserves the complete five-row
 * kill-feed region, the confirmed match-menu launcher, and the touch action
 * cluster without changing Batch 22's combat-HUD model.
 */
export function minimapLayoutForGameplay(
  viewport: GameplayViewportContract,
  hud: ResponsiveCombatHudLayout,
  worldBounds: WorldBounds,
): MinimapLayout | null {
  if (viewport.mode !== 'large-world') return null;

  const safe = hud.safeArea;
  const top = Math.max(
    safe.top,
    hud.menu.launcher.y + hud.menu.launcher.height + MINIMAP_HUD_GAP,
    hud.killFeed.y + MINIMAP_KILL_FEED_ROWS * MINIMAP_KILL_FEED_ROW_HEIGHT + MINIMAP_HUD_GAP,
  );
  const maxBottom = Math.min(safe.bottom, hud.touchActions.taunt.y - MINIMAP_TOUCH_CLEARANCE);
  const aspect = worldBounds.width / worldBounds.height;
  const preferredMapWidth = Math.min(
    MINIMAP_MAX_PANEL_WIDTH - MINIMAP_PANEL_PADDING * 2,
    Math.max(120, safe.width * 0.17),
  );
  const availableMapHeight = Math.max(
    48,
    maxBottom - top - MINIMAP_TITLE_HEIGHT - MINIMAP_PANEL_PADDING * 2,
  );
  const mapWidth = Math.min(preferredMapWidth, availableMapHeight * aspect);
  const mapHeight = mapWidth / aspect;
  const panelWidth = mapWidth + MINIMAP_PANEL_PADDING * 2;
  const panelHeight = mapHeight + MINIMAP_TITLE_HEIGHT + MINIMAP_PANEL_PADDING * 2;
  const panel = rect(safe.right - panelWidth, top, panelWidth, panelHeight);
  const map = rect(
    panel.x + MINIMAP_PANEL_PADDING,
    panel.y + MINIMAP_PANEL_PADDING + MINIMAP_TITLE_HEIGHT,
    mapWidth,
    mapHeight,
  );

  return Object.freeze({
    panel,
    map,
    title: point(panel.x + MINIMAP_PANEL_PADDING, panel.y + MINIMAP_PANEL_PADDING),
  });
}

export function projectWorldPointToMinimap(
  worldBounds: WorldBounds,
  mapRect: HudRect,
  worldPoint: Readonly<{ x: number; y: number }>,
): HudPoint {
  const right = worldBounds.left + worldBounds.width;
  const bottom = worldBounds.top + worldBounds.height;
  const x = Math.min(right, Math.max(worldBounds.left, worldPoint.x));
  const y = Math.min(bottom, Math.max(worldBounds.top, worldPoint.y));
  return point(
    mapRect.x + ((x - worldBounds.left) / worldBounds.width) * mapRect.width,
    mapRect.y + ((y - worldBounds.top) / worldBounds.height) * mapRect.height,
  );
}

function projectWorldRectToMinimap(
  worldBounds: WorldBounds,
  mapRect: HudRect,
  worldRect: HudRect,
): HudRect {
  const start = projectWorldPointToMinimap(worldBounds, mapRect, worldRect);
  const end = projectWorldPointToMinimap(worldBounds, mapRect, {
    x: worldRect.x + worldRect.width,
    y: worldRect.y + worldRect.height,
  });
  return rect(start.x, start.y, end.x - start.x, end.y - start.y);
}

function landmarkKind(decoration: MapDecoration): MinimapLandmarkKind {
  if (decoration.hazard === 'explosive_barrel') return 'hazard';
  if (decoration.interaction === 'shootable_gate') return 'gate';
  if (decoration.interaction === 'scavenger_cache') return 'cache';
  return 'prop';
}

function landmarkStillExists(decoration: MapDecoration, collisionGrid: CollisionGrid): boolean {
  for (let row = decoration.y; row < decoration.y + decoration.h; row++) {
    for (let col = decoration.x; col < decoration.x + decoration.w; col++) {
      if (collisionGrid.solid[row]?.[col] === true) return true;
    }
  }
  return false;
}

/** Static map truth. The mutable collision grid is intentionally independent
 * of camera/chunk visibility and therefore reflects authoritative destruction. */
export function createMinimapStaticProjection(
  mapData: MapData,
  collisionGrid: CollisionGrid,
  layout: MinimapLayout,
): MinimapStaticProjection {
  const worldBounds = worldBoundsForMap(mapData);
  const regions =
    mapData.battleRoyale?.regions.map((region) =>
      Object.freeze({
        id: region.id,
        displayName: region.displayName,
        biome: region.biome,
        areas: Object.freeze(
          region.areas.map((area) =>
            projectWorldRectToMinimap(worldBounds, layout.map, {
              x: area.x * mapData.tileSize,
              y: area.y * mapData.tileSize,
              width: area.w * mapData.tileSize,
              height: area.h * mapData.tileSize,
            }),
          ),
        ),
        label: projectWorldPointToMinimap(worldBounds, layout.map, {
          x: (region.label.x + 0.5) * mapData.tileSize,
          y: (region.label.y + 0.5) * mapData.tileSize,
        }),
      }),
    ) ?? [];
  const solids: MinimapSolidProjection[] = [];
  for (let row = 0; row < mapData.height; row++) {
    for (let col = 0; col < mapData.width; col++) {
      if (collisionGrid.solid[row]?.[col] !== true) continue;
      const projected = projectWorldRectToMinimap(worldBounds, layout.map, {
        x: col * mapData.tileSize,
        y: row * mapData.tileSize,
        width: mapData.tileSize,
        height: mapData.tileSize,
      });
      solids.push(Object.freeze({ ...projected, col, row }));
    }
  }

  const containers =
    mapData.battleRoyale?.containerSpawns
      .filter(({ x, y }) => collisionGrid.solid[y]?.[x] === true)
      .map((container) => {
        const projected = projectWorldRectToMinimap(worldBounds, layout.map, {
          x: container.x * mapData.tileSize,
          y: container.y * mapData.tileSize,
          width: mapData.tileSize,
          height: mapData.tileSize,
        });
        return Object.freeze({
          ...projected,
          id: container.id,
          col: container.x,
          row: container.y,
        });
      }) ?? [];

  const landmarks = (mapData.decorations ?? [])
    .filter((decoration) => landmarkStillExists(decoration, collisionGrid))
    .map((decoration) => {
      const projected = projectWorldRectToMinimap(worldBounds, layout.map, {
        x: decoration.x * mapData.tileSize,
        y: decoration.y * mapData.tileSize,
        width: decoration.w * mapData.tileSize,
        height: decoration.h * mapData.tileSize,
      });
      return Object.freeze({
        ...projected,
        kind: landmarkKind(decoration),
        texture: decoration.texture,
        label: mapData.battleRoyale?.landmarks.find(({ id }) => id === decoration.id)?.displayName,
      });
    });

  return Object.freeze({
    worldBounds,
    regions: Object.freeze(regions),
    containers: Object.freeze(containers),
    solids: Object.freeze(solids),
    landmarks: Object.freeze(landmarks),
  });
}

function objectivePoint(
  kind: MinimapObjectiveKind,
  worldBounds: WorldBounds,
  layout: MinimapLayout,
  position: Readonly<{ x: number; y: number }>,
  extra: Pick<MinimapObjectiveProjection, 'playerId' | 'ownerId'> = {},
): MinimapObjectiveProjection {
  return Object.freeze({
    kind,
    point: projectWorldPointToMinimap(worldBounds, layout.map, position),
    ...extra,
  });
}

/**
 * Live snapshot projection. Generic rivals are deliberately absent. Allies
 * require an exact server-authored team match, while a Bounty target appears
 * only as the mode objective.
 */
export function createMinimapDynamicProjection(
  mapData: Pick<MapData, 'width' | 'height' | 'tileSize'>,
  layout: MinimapLayout,
  input: MinimapDynamicInput,
): MinimapDynamicProjection {
  const worldBounds = worldBoundsForMap(mapData);
  const objectives: MinimapObjectiveProjection[] = [];
  const zone = input.battleRoyaleSafeZone;
  const radiusScale = layout.map.width / worldBounds.width;
  const safeZone: MinimapSafeZoneProjection | null = zone
    ? Object.freeze({
        current: Object.freeze({
          center: projectWorldPointToMinimap(worldBounds, layout.map, zone.center),
          radius: zone.radius * radiusScale,
        }),
        next:
          zone.nextCenter && zone.nextRadius !== null
            ? Object.freeze({
                center: projectWorldPointToMinimap(worldBounds, layout.map, zone.nextCenter),
                radius: zone.nextRadius * radiusScale,
              })
            : null,
        phase: zone.phase,
      })
    : null;

  if (input.gameMode === GameModeType.KOTH && input.koth) {
    objectives.push(
      Object.freeze({
        kind: 'koth',
        rect: projectWorldRectToMinimap(worldBounds, layout.map, {
          x: input.koth.hill.x * mapData.tileSize,
          y: input.koth.hill.y * mapData.tileSize,
          width: KOTH.HILL_SIZE_TILES * mapData.tileSize,
          height: KOTH.HILL_SIZE_TILES * mapData.tileSize,
        }),
      }),
    );
    if (input.koth.nextHill) {
      objectives.push(
        Object.freeze({
          kind: 'next-koth',
          rect: projectWorldRectToMinimap(worldBounds, layout.map, {
            x: input.koth.nextHill.x * mapData.tileSize,
            y: input.koth.nextHill.y * mapData.tileSize,
            width: KOTH.HILL_SIZE_TILES * mapData.tileSize,
            height: KOTH.HILL_SIZE_TILES * mapData.tileSize,
          }),
        }),
      );
    }
  } else if (input.gameMode === GameModeType.KILL_CONFIRMED) {
    for (const tag of input.confirmedTags) {
      objectives.push(
        objectivePoint('tag', worldBounds, layout, tag.position, { ownerId: tag.ownerId }),
      );
    }
  } else if (input.gameMode === GameModeType.CORE_RUN && input.coreRun) {
    objectives.push(objectivePoint('core', worldBounds, layout, input.coreRun.position));
  } else if (input.gameMode === GameModeType.BOUNTY_HUNT && input.bountyHunt?.targetId) {
    const target = input.players.find((player) => player.id === input.bountyHunt?.targetId);
    if (target) {
      objectives.push(
        objectivePoint('bounty', worldBounds, layout, target.position, {
          playerId: target.id,
        }),
      );
    }
  }

  const players: MinimapPlayerProjection[] = [];
  const local = input.players.find((player) => player.id === input.localPlayerId);
  if (local) {
    players.push(
      Object.freeze({
        kind: 'local',
        playerId: local.id,
        point: projectWorldPointToMinimap(worldBounds, layout.map, local.position),
        isDead: local.isDead,
      }),
    );
    const localTeam = input.playerTeams?.[local.id];
    if (localTeam) {
      const allies = input.players
        .filter((player) => player.id !== local.id && input.playerTeams?.[player.id] === localTeam)
        .sort((left, right) => left.id.localeCompare(right.id));
      for (const ally of allies) {
        players.push(
          Object.freeze({
            kind: 'ally',
            playerId: ally.id,
            point: projectWorldPointToMinimap(worldBounds, layout.map, ally.position),
            isDead: ally.isDead,
          }),
        );
      }
    }
  }

  return Object.freeze({
    objectives: Object.freeze(objectives),
    players: Object.freeze(players),
    safeZone,
  });
}
