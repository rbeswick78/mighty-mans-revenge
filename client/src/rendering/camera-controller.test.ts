import { describe, expect, it } from 'vitest';

import { CameraController, type CameraPort, type CameraTargetKind } from './camera-controller.js';
import { worldPoint } from './gameplay-coordinate-space.js';

interface FakeCamera extends CameraPort {
  scrollX: number;
  scrollY: number;
  zoom: number;
  rotation: number;
}

function fakeCamera(width = 1280, height = 720): FakeCamera {
  const camera: FakeCamera = {
    width,
    height,
    scrollX: 0,
    scrollY: 0,
    zoom: 1,
    rotation: 0,
    setScroll(x, y) {
      camera.scrollX = x;
      camera.scrollY = y;
    },
    setZoom(zoom) {
      camera.zoom = zoom;
    },
    setRotation(rotation) {
      camera.rotation = rotation;
    },
  };
  return camera;
}

const LARGE_WORLD = { left: 0, top: 0, width: 2560, height: 1440 } as const;

describe('camera controller', () => {
  it('follows the exact local-player target at the center of an unclamped world', () => {
    const camera = fakeCamera();
    const controller = new CameraController(camera, LARGE_WORLD);
    controller.setTarget({ kind: 'local-player', position: worldPoint(1280, 720) });

    controller.update(16);

    expect(controller.getState().base).toEqual({ scrollX: 640, scrollY: 360, zoom: 1 });
    expect({ scrollX: camera.scrollX, scrollY: camera.scrollY }).toEqual({
      scrollX: 640,
      scrollY: 360,
    });
  });

  it.each([
    ['top-left', 0, 0, 0, 0],
    ['top', 1280, 0, 640, 0],
    ['top-right', 2560, 0, 1280, 0],
    ['right', 2560, 720, 1280, 360],
    ['bottom-right', 2560, 1440, 1280, 720],
    ['bottom', 1280, 1440, 640, 720],
    ['bottom-left', 0, 1440, 0, 720],
    ['left', 0, 720, 0, 360],
  ])('clamps the %s edge/corner', (_label, targetX, targetY, scrollX, scrollY) => {
    const camera = fakeCamera();
    const controller = new CameraController(camera, LARGE_WORLD);
    controller.setTarget({ kind: 'local-player', position: worldPoint(targetX, targetY) });

    controller.update(16);

    expect(controller.getState().base).toEqual({ scrollX, scrollY, zoom: 1 });
  });

  it('anchors worlds smaller than the logical viewport at their origin', () => {
    const camera = fakeCamera();
    const controller = new CameraController(camera, {
      left: 0,
      top: 0,
      width: 960,
      height: 576,
    });
    controller.setTarget({ kind: 'local-player', position: worldPoint(900, 520) });

    controller.update(16);

    expect(controller.getState().base).toEqual({ scrollX: 0, scrollY: 0, zoom: 1 });
  });

  it('keeps exact center follow and world-view clamps at a non-identity base zoom', () => {
    const camera = fakeCamera();
    const controller = new CameraController(camera, LARGE_WORLD);
    controller.setBaseZoom(1.25);
    controller.setTarget({ kind: 'local-player', position: worldPoint(1500, 900) });

    controller.update(0);
    expect(controller.getState().base).toEqual({ scrollX: 860, scrollY: 540, zoom: 1.25 });

    controller.setTarget({ kind: 'local-player', position: worldPoint(0, 0) });
    controller.update(0);
    expect(controller.getState().base).toEqual({ scrollX: -128, scrollY: -72, zoom: 1.25 });

    controller.setTarget({ kind: 'local-player', position: worldPoint(2560, 1440) });
    controller.update(0);
    expect(controller.getState().base).toEqual({ scrollX: 1408, scrollY: 792, zoom: 1.25 });
  });

  it('changes cleanly among local-player, respawn, and spectator targets', () => {
    const camera = fakeCamera();
    const controller = new CameraController(camera, LARGE_WORLD);
    const targets: ReadonlyArray<readonly [CameraTargetKind, number, number, number, number]> = [
      ['local-player', 1000, 500, 360, 140],
      ['respawn', 100, 80, 0, 0],
      ['local-player', 1800, 900, 1160, 540],
      ['spectator', 2500, 1400, 1280, 720],
    ];

    for (const [kind, x, y, scrollX, scrollY] of targets) {
      controller.setTarget({ kind, position: worldPoint(x, y) });
      controller.update(16);
      expect(controller.getState().target?.kind).toBe(kind);
      expect(controller.getState().base).toMatchObject({ scrollX, scrollY });
    }
  });

  it('composes kick, shake, zoom, and roll without changing the base layer', () => {
    const camera = fakeCamera();
    const controller = new CameraController(camera, LARGE_WORLD, () => 0.9);
    controller.setTarget({ kind: 'local-player', position: worldPoint(1280, 720) });
    controller.update(0);
    controller.triggerKick(0);
    controller.triggerShake(200, 0.01);
    controller.triggerZoomPulse();
    controller.triggerRoll(1);

    controller.update(16);
    const active = controller.getState();

    expect(active.base).toEqual({ scrollX: 640, scrollY: 360, zoom: 1 });
    expect(active.transient.kickX).toBeGreaterThan(0);
    expect(Math.abs(active.transient.shakeX) + Math.abs(active.transient.shakeY)).toBeGreaterThan(
      0,
    );
    expect(active.transient.zoomMultiplier).toBeGreaterThan(1);
    expect(active.transient.roll).toBeGreaterThan(0);
    expect(active.composed.scrollX).toBeCloseTo(
      active.base.scrollX + active.transient.kickX + active.transient.shakeX,
    );
    expect(active.composed.scrollY).toBeCloseTo(
      active.base.scrollY + active.transient.kickY + active.transient.shakeY,
    );
    expect(active.composed.zoom).toBeCloseTo(active.base.zoom * active.transient.zoomMultiplier);

    controller.update(1_000);
    expect(controller.getState()).toMatchObject({
      base: { scrollX: 640, scrollY: 360, zoom: 1 },
      transient: {
        kickX: 0,
        kickY: 0,
        shakeX: 0,
        shakeY: 0,
        zoomMultiplier: 1,
        roll: 0,
      },
      composed: { scrollX: 640, scrollY: 360, zoom: 1, rotation: 0 },
    });
  });

  it('keeps equal logical visibility for desktop and mobile FIT surfaces', () => {
    const desktop = new CameraController(fakeCamera(1280, 720), LARGE_WORLD);
    const mobile = new CameraController(fakeCamera(1280, 720), LARGE_WORLD);
    const target = { kind: 'local-player', position: worldPoint(1900, 920) } as const;
    desktop.setTarget(target);
    mobile.setTarget(target);

    desktop.update(16);
    mobile.update(16);

    expect(mobile.getState()).toEqual(desktop.getState());
  });

  it('restores identity camera state for Results and recovery cleanup', () => {
    const camera = fakeCamera();
    const controller = new CameraController(camera, LARGE_WORLD);
    controller.setBaseZoom(0.9);
    controller.setTarget({ kind: 'spectator', position: worldPoint(2200, 1200) });
    controller.triggerKick(Math.PI);
    controller.triggerShake(450, 0.012);
    controller.triggerZoomPulse();
    controller.triggerRoll(-1);
    controller.update(16);

    controller.reset();

    expect(controller.getState()).toMatchObject({
      target: null,
      base: { scrollX: 0, scrollY: 0, zoom: 1 },
      composed: { scrollX: 0, scrollY: 0, zoom: 1, rotation: 0 },
    });
    expect(camera).toMatchObject({ scrollX: 0, scrollY: 0, zoom: 1, rotation: 0 });
  });
});
