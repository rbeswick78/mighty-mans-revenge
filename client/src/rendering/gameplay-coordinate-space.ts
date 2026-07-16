import type Phaser from 'phaser';

import type { Vec2 } from '@shared/types/common.js';

export interface ScreenPoint extends Vec2 {
  readonly space: 'screen';
}

export interface WorldPoint extends Vec2 {
  readonly space: 'world';
}

export interface WorldBounds {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

interface CameraWorldPointReader {
  getWorldPoint(screenX: number, screenY: number): Vec2;
}

interface CoordinateDomainObject {
  setScrollFactor(x: number, y?: number): unknown;
}

interface PositionableObject {
  setPosition(x: number, y: number): unknown;
}

export function screenPoint(x: number, y: number): ScreenPoint {
  return { space: 'screen', x, y };
}

export function worldPoint(x: number, y: number): WorldPoint {
  return { space: 'world', x, y };
}

export function worldPointFrom(point: Vec2): WorldPoint {
  return worldPoint(point.x, point.y);
}

export function declareScreenSpace<T extends CoordinateDomainObject>(object: T): T {
  object.setScrollFactor(0);
  return object;
}

export function declareWorldSpace<T extends CoordinateDomainObject>(object: T): T {
  object.setScrollFactor(1);
  return object;
}

export function placeOnScreen<T extends CoordinateDomainObject & PositionableObject>(
  object: T,
  point: ScreenPoint,
): T {
  declareScreenSpace(object);
  object.setPosition(point.x, point.y);
  return object;
}

export function placeInWorld<T extends CoordinateDomainObject & PositionableObject>(
  object: T,
  point: WorldPoint,
): T {
  declareWorldSpace(object);
  object.setPosition(point.x, point.y);
  return object;
}

/**
 * The single gameplay boundary between logical screen coordinates and
 * authoritative/rendered world coordinates. It delegates screen-to-world to
 * Phaser's live camera matrix, then inverts that same affine mapping for the
 * reverse path so zoom, rotation, viewport offsets, and future scrolling stay
 * symmetrical without duplicating camera math.
 */
export class GameplayCoordinateSpace {
  constructor(
    private readonly camera: CameraWorldPointReader,
    readonly worldBounds: WorldBounds,
  ) {}

  screenToWorld(point: ScreenPoint): WorldPoint {
    return worldPointFrom(this.camera.getWorldPoint(point.x, point.y));
  }

  worldToScreen(point: WorldPoint): ScreenPoint {
    const origin = this.camera.getWorldPoint(0, 0);
    const xAxis = this.camera.getWorldPoint(1, 0);
    const yAxis = this.camera.getWorldPoint(0, 1);
    const a = xAxis.x - origin.x;
    const b = yAxis.x - origin.x;
    const c = xAxis.y - origin.y;
    const d = yAxis.y - origin.y;
    const determinant = a * d - b * c;
    if (!Number.isFinite(determinant) || Math.abs(determinant) < Number.EPSILON) {
      throw new Error('Gameplay camera transform is not invertible');
    }

    const dx = point.x - origin.x;
    const dy = point.y - origin.y;
    return screenPoint((d * dx - b * dy) / determinant, (-c * dx + a * dy) / determinant);
  }

  screenDeltaToWorld(delta: ScreenPoint): WorldPoint {
    const origin = this.screenToWorld(screenPoint(0, 0));
    const end = this.screenToWorld(delta);
    return worldPoint(end.x - origin.x, end.y - origin.y);
  }

  aimAngle(player: WorldPoint, target: ScreenPoint): number {
    const targetWorld = this.screenToWorld(target);
    return Math.atan2(targetWorld.y - player.y, targetWorld.x - player.x);
  }

  screenDirectionAngle(direction: ScreenPoint): number {
    const worldDirection = this.screenDeltaToWorld(direction);
    return Math.atan2(worldDirection.y, worldDirection.x);
  }

  containsWorldPoint(point: WorldPoint): boolean {
    return (
      point.x >= this.worldBounds.left &&
      point.x < this.worldBounds.left + this.worldBounds.width &&
      point.y >= this.worldBounds.top &&
      point.y < this.worldBounds.top + this.worldBounds.height
    );
  }

  containsWorldYAtScreenPoint(point: ScreenPoint): boolean {
    const world = this.screenToWorld(point);
    return (
      world.y >= this.worldBounds.top && world.y < this.worldBounds.top + this.worldBounds.height
    );
  }

  visibleWorldBounds(screenWidth: number, screenHeight: number): WorldBounds {
    const corners = [
      this.screenToWorld(screenPoint(0, 0)),
      this.screenToWorld(screenPoint(screenWidth, 0)),
      this.screenToWorld(screenPoint(0, screenHeight)),
      this.screenToWorld(screenPoint(screenWidth, screenHeight)),
    ];
    const xs = corners.map((point) => point.x);
    const ys = corners.map((point) => point.y);
    const left = Math.min(...xs);
    const top = Math.min(...ys);
    return Object.freeze({
      left,
      top,
      width: Math.max(...xs) - left,
      height: Math.max(...ys) - top,
    });
  }

  placeOnScreen<T extends CoordinateDomainObject & PositionableObject>(
    object: T,
    point: ScreenPoint,
  ): T {
    return placeOnScreen(object, point);
  }

  placeInWorld<T extends CoordinateDomainObject & PositionableObject>(
    object: T,
    point: WorldPoint,
  ): T {
    return placeInWorld(object, point);
  }
}

export function createGameplayCoordinateSpace(
  camera: Phaser.Cameras.Scene2D.Camera,
  worldBounds: WorldBounds,
): GameplayCoordinateSpace {
  return new GameplayCoordinateSpace(camera, worldBounds);
}
