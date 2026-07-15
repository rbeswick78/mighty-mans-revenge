import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';

import { CameraKick } from './camera-kick.js';
import { ZoomPulse } from './zoom-pulse.js';

interface FakeCameraState {
  scrollX: number;
  scrollY: number;
  zoom: number;
  setScroll: (x: number, y: number) => void;
  setZoom: (zoom: number) => void;
}

function fakeCamera(overrides: Partial<FakeCameraState> = {}): FakeCameraState {
  const camera: FakeCameraState = {
    scrollX: 0,
    scrollY: 0,
    zoom: 1,
    setScroll(x, y) {
      camera.scrollX = x;
      camera.scrollY = y;
    },
    setZoom(zoom) {
      camera.zoom = zoom;
    },
    ...overrides,
  };
  return camera;
}

describe('camera baseline limitations', () => {
  it('reproduces recoil clearing a sustained base-camera scroll', () => {
    const state = fakeCamera({ scrollX: 320, scrollY: 144 });
    const camera = state as unknown as Phaser.Cameras.Scene2D.Camera;

    new CameraKick().update(16, camera);

    expect({ scrollX: state.scrollX, scrollY: state.scrollY }).toEqual({
      scrollX: 0,
      scrollY: 0,
    });
  });

  it('reproduces the zoom pulse clearing a sustained base-camera zoom', () => {
    const state = fakeCamera({ zoom: 0.9 });
    const camera = state as unknown as Phaser.Cameras.Scene2D.Camera;

    new ZoomPulse().update(16, camera);

    expect(state.zoom).toBe(1);
  });
});
