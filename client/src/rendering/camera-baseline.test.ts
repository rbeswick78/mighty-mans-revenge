import { describe, expect, it } from 'vitest';

import { CameraController, type CameraPort } from './camera-controller.js';
import { worldPoint } from './gameplay-coordinate-space.js';

interface FakeCamera extends CameraPort {
  scrollX: number;
  scrollY: number;
  zoom: number;
  rotation: number;
}

function fakeCamera(width = 960, height = 720): FakeCamera {
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

describe('camera composition repairs', () => {
  it('RFG-001 keeps sustained base follow when recoil is idle', () => {
    const camera = fakeCamera();
    const controller = new CameraController(camera, {
      left: 0,
      top: 0,
      width: 1920,
      height: 1008,
    });
    controller.setTarget({ kind: 'local-player', position: worldPoint(800, 504) });

    controller.update(16);

    expect(controller.getState().base).toEqual({ scrollX: 320, scrollY: 144, zoom: 1 });
    expect({ scrollX: camera.scrollX, scrollY: camera.scrollY }).toEqual({
      scrollX: 320,
      scrollY: 144,
    });
  });

  it('RFG-002 keeps a sustained base zoom when the pulse is idle', () => {
    const camera = fakeCamera();
    const controller = new CameraController(camera, {
      left: 0,
      top: 0,
      width: 1920,
      height: 1440,
    });
    controller.setBaseZoom(0.9);
    controller.setTarget({ kind: 'local-player', position: worldPoint(960, 720) });

    controller.update(16);

    expect(controller.getState().base.zoom).toBe(0.9);
    expect(controller.getState().transient.zoomMultiplier).toBe(1);
    expect(camera.zoom).toBe(0.9);
  });
});
