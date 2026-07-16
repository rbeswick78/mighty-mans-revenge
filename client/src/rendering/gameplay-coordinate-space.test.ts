import { describe, expect, it } from 'vitest';

import {
  GameplayCoordinateSpace,
  declareScreenSpace,
  declareWorldSpace,
  placeInWorld,
  placeOnScreen,
  screenPoint,
  worldPoint,
} from './gameplay-coordinate-space.js';

const WORLD_BOUNDS = { left: 0, top: 0, width: 960, height: 576 } as const;

function cameraFromAffine(
  origin: { x: number; y: number },
  matrix: readonly [number, number, number, number],
): { getWorldPoint(x: number, y: number): { x: number; y: number } } {
  const [a, b, c, d] = matrix;
  return {
    getWorldPoint(x: number, y: number) {
      return { x: origin.x + a * x + b * y, y: origin.y + c * x + d * y };
    },
  };
}

describe('gameplay coordinate space', () => {
  it('is identity at the Batch 18 camera origin', () => {
    const coordinates = new GameplayCoordinateSpace(
      cameraFromAffine({ x: 0, y: 0 }, [1, 0, 0, 1]),
      WORLD_BOUNDS,
    );

    expect(coordinates.screenToWorld(screenPoint(144, 96))).toEqual(worldPoint(144, 96));
    expect(coordinates.worldToScreen(worldPoint(960, 576))).toEqual(screenPoint(960, 576));
    expect(coordinates.aimAngle(worldPoint(100, 100), screenPoint(140, 130))).toBeCloseTo(
      Math.atan2(30, 40),
    );
  });

  it('round-trips scroll, zoom, rotation, and viewport-offset affine cameras', () => {
    const angle = Math.PI / 6;
    const inverseZoom = 1 / 1.5;
    const coordinates = new GameplayCoordinateSpace(
      cameraFromAffine({ x: 320, y: 144 }, [
        Math.cos(angle) * inverseZoom,
        Math.sin(angle) * inverseZoom,
        -Math.sin(angle) * inverseZoom,
        Math.cos(angle) * inverseZoom,
      ]),
      WORLD_BOUNDS,
    );
    const screen = screenPoint(731.25, 418.5);
    const world = coordinates.screenToWorld(screen);

    expect(coordinates.worldToScreen(world).x).toBeCloseTo(screen.x, 10);
    expect(coordinates.worldToScreen(world).y).toBeCloseTo(screen.y, 10);
    const worldRoundTrip = coordinates.screenToWorld(
      coordinates.worldToScreen(worldPoint(700, 410)),
    );
    expect(worldRoundTrip.x).toBeCloseTo(700, 10);
    expect(worldRoundTrip.y).toBeCloseTo(410, 10);
  });

  it('keeps desktop and mobile equivalent in the shared logical surface', () => {
    const desktop = new GameplayCoordinateSpace(
      cameraFromAffine({ x: 0, y: 0 }, [1, 0, 0, 1]),
      WORLD_BOUNDS,
    );
    const mobile = new GameplayCoordinateSpace(
      cameraFromAffine({ x: 0, y: 0 }, [1, 0, 0, 1]),
      WORLD_BOUNDS,
    );

    expect(desktop.screenToWorld(screenPoint(640, 360))).toEqual(
      mobile.screenToWorld(screenPoint(640, 360)),
    );
    expect(desktop.worldToScreen(worldPoint(480, 288))).toEqual(
      mobile.worldToScreen(worldPoint(480, 288)),
    );
  });

  it('transforms pointer aim and touch direction through the same camera matrix', () => {
    const coordinates = new GameplayCoordinateSpace(
      cameraFromAffine({ x: 100, y: 200 }, [0, 1, -1, 0]),
      WORLD_BOUNDS,
    );

    expect(coordinates.aimAngle(worldPoint(100, 200), screenPoint(0, 40))).toBeCloseTo(0);
    expect(coordinates.screenDirectionAngle(screenPoint(0, 40))).toBeCloseTo(0);
  });

  it('tests fixed-map input against world bounds after conversion', () => {
    const coordinates = new GameplayCoordinateSpace(
      cameraFromAffine({ x: 0, y: 100 }, [1, 0, 0, 1]),
      WORLD_BOUNDS,
    );

    expect(coordinates.containsWorldYAtScreenPoint(screenPoint(100, 475))).toBe(true);
    expect(coordinates.containsWorldYAtScreenPoint(screenPoint(100, 476))).toBe(false);
    expect(coordinates.containsWorldPoint(worldPoint(959.99, 575.99))).toBe(true);
    expect(coordinates.containsWorldPoint(worldPoint(960, 576))).toBe(false);
  });

  it('pins overlays and cursor objects to screen space and declares world objects', () => {
    const object = {
      scrollFactor: [] as number[],
      position: [] as number[],
      setScrollFactor(x: number, y = x) {
        this.scrollFactor = [x, y];
        return this;
      },
      setPosition(x: number, y: number) {
        this.position = [x, y];
        return this;
      },
    };

    declareScreenSpace(object);
    expect(object.scrollFactor).toEqual([0, 0]);
    placeOnScreen(object, screenPoint(640, 360));
    expect(object).toMatchObject({ scrollFactor: [0, 0], position: [640, 360] });
    declareWorldSpace(object);
    expect(object.scrollFactor).toEqual([1, 1]);
    placeInWorld(object, worldPoint(480, 288));
    expect(object).toMatchObject({ scrollFactor: [1, 1], position: [480, 288] });
  });
});
