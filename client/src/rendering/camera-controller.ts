import type Phaser from 'phaser';

import type { WorldBounds, WorldPoint } from './gameplay-coordinate-space.js';

const KICK_DURATION_MS = 100;
const KICK_PEAK_PIXELS = 4;
const ZOOM_PULSE_DURATION_MS = 200;
const ZOOM_PULSE_PEAK = 1.04;
const ZOOM_PULSE_ATTACK_T = 0.15;
const ROLL_DURATION_MS = 250;
const ROLL_PEAK_RADIANS = (2.5 * Math.PI) / 180;
const SHAKE_OSCILLATIONS = 7;

/** Local-player HP loss in a single tick at or above this rolls the camera. */
export const ROLL_DAMAGE_THRESHOLD = 20;

export type CameraTargetKind = 'local-player' | 'respawn' | 'spectator';

export interface CameraTarget {
  readonly kind: CameraTargetKind;
  readonly position: WorldPoint;
}

export interface CameraCompositionState {
  readonly target: CameraTarget | null;
  readonly base: {
    readonly scrollX: number;
    readonly scrollY: number;
    readonly zoom: number;
  };
  readonly transient: {
    readonly kickX: number;
    readonly kickY: number;
    readonly shakeX: number;
    readonly shakeY: number;
    readonly zoomMultiplier: number;
    readonly roll: number;
  };
  readonly composed: {
    readonly scrollX: number;
    readonly scrollY: number;
    readonly zoom: number;
    readonly rotation: number;
  };
}

export interface CameraEffectsSink {
  triggerShake(durationMs: number, intensity: number): void;
}

export interface CameraPort {
  readonly width: number;
  readonly height: number;
  setScroll(x: number, y: number): unknown;
  setZoom(zoom: number): unknown;
  setRotation(rotation: number): unknown;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function easeOutRemaining(elapsedMs: number, durationMs: number): number {
  if (elapsedMs >= durationMs) return 0;
  const remaining = 1 - elapsedMs / durationMs;
  return remaining * remaining;
}

/**
 * The single owner of gameplay camera state.
 *
 * Base follow/clamping is calculated only from world-space targets. Recoil,
 * shake, zoom, and roll are sampled as independent transient layers and are
 * composed once per frame, so an idle or expiring effect can never reset the
 * sustained base scroll or zoom.
 */
export class CameraController implements CameraEffectsSink {
  private worldBounds: WorldBounds;
  private target: CameraTarget | null = null;
  private baseZoom = 1;
  private baseScrollX = 0;
  private baseScrollY = 0;

  private kickElapsedMs = KICK_DURATION_MS;
  private kickDirectionX = 0;
  private kickDirectionY = 0;
  private zoomElapsedMs = ZOOM_PULSE_DURATION_MS;
  private rollElapsedMs = ROLL_DURATION_MS;
  private rollPeak = 0;
  private shakeElapsedMs = 0;
  private shakeDurationMs = 0;
  private shakeIntensity = 0;

  private state: CameraCompositionState;

  constructor(
    private readonly camera: CameraPort,
    worldBounds: WorldBounds,
    private readonly random: () => number = Math.random,
  ) {
    this.worldBounds = { ...worldBounds };
    this.state = this.composeState(0, 0, 0, 0, 1, 0);
  }

  setWorldBounds(worldBounds: WorldBounds): void {
    this.worldBounds = { ...worldBounds };
  }

  setTarget(target: CameraTarget): void {
    this.target = {
      kind: target.kind,
      position: { ...target.position },
    };
  }

  clearTarget(): void {
    this.target = null;
  }

  setBaseZoom(zoom: number): void {
    if (!Number.isFinite(zoom) || zoom <= 0) {
      throw new Error('Gameplay camera base zoom must be finite and greater than zero');
    }
    this.baseZoom = zoom;
  }

  triggerKick(reverseAngle: number): void {
    this.kickDirectionX = Math.cos(reverseAngle);
    this.kickDirectionY = Math.sin(reverseAngle);
    this.kickElapsedMs = 0;
  }

  triggerShake(durationMs: number, intensity: number): void {
    if (!Number.isFinite(durationMs) || !Number.isFinite(intensity)) return;
    this.shakeDurationMs = Math.max(0, durationMs);
    this.shakeIntensity = Math.max(0, intensity);
    this.shakeElapsedMs = 0;
  }

  triggerZoomPulse(): void {
    this.zoomElapsedMs = 0;
  }

  triggerRoll(sign?: -1 | 1): void {
    const resolvedSign = sign ?? (this.random() < 0.5 ? -1 : 1);
    this.rollPeak = resolvedSign * ROLL_PEAK_RADIANS;
    this.rollElapsedMs = 0;
  }

  update(deltaMs: number): void {
    const safeDeltaMs = Number.isFinite(deltaMs) ? Math.max(0, deltaMs) : 0;
    this.updateBase();

    this.kickElapsedMs = Math.min(KICK_DURATION_MS, this.kickElapsedMs + safeDeltaMs);
    const kickRemaining = easeOutRemaining(this.kickElapsedMs, KICK_DURATION_MS);
    const kickMagnitude = KICK_PEAK_PIXELS * kickRemaining;
    const kickX = this.kickDirectionX * kickMagnitude;
    const kickY = this.kickDirectionY * kickMagnitude;

    this.zoomElapsedMs = Math.min(ZOOM_PULSE_DURATION_MS, this.zoomElapsedMs + safeDeltaMs);
    const zoomMultiplier = this.zoomMultiplier();

    this.rollElapsedMs = Math.min(ROLL_DURATION_MS, this.rollElapsedMs + safeDeltaMs);
    const roll = this.rollPeak * easeOutRemaining(this.rollElapsedMs, ROLL_DURATION_MS);

    const shake = this.shakeOffset(safeDeltaMs);
    this.state = this.composeState(kickX, kickY, shake.x, shake.y, zoomMultiplier, roll);

    this.camera.setZoom(this.state.composed.zoom);
    this.camera.setScroll(this.state.composed.scrollX, this.state.composed.scrollY);
    this.camera.setRotation(this.state.composed.rotation);
  }

  getState(): CameraCompositionState {
    return this.state;
  }

  reset(): void {
    this.target = null;
    this.baseZoom = 1;
    this.baseScrollX = this.worldBounds.left;
    this.baseScrollY = this.worldBounds.top;
    this.kickElapsedMs = KICK_DURATION_MS;
    this.kickDirectionX = 0;
    this.kickDirectionY = 0;
    this.zoomElapsedMs = ZOOM_PULSE_DURATION_MS;
    this.rollElapsedMs = ROLL_DURATION_MS;
    this.rollPeak = 0;
    this.shakeElapsedMs = 0;
    this.shakeDurationMs = 0;
    this.shakeIntensity = 0;
    this.state = this.composeState(0, 0, 0, 0, 1, 0);
    this.camera.setZoom(1);
    this.camera.setScroll(this.baseScrollX, this.baseScrollY);
    this.camera.setRotation(0);
  }

  private updateBase(): void {
    const halfWidth = this.camera.width / 2;
    const halfHeight = this.camera.height / 2;
    const halfVisibleWidth = halfWidth / this.baseZoom;
    const halfVisibleHeight = halfHeight / this.baseZoom;
    const minScrollX = this.worldBounds.left - halfWidth + halfVisibleWidth;
    const minScrollY = this.worldBounds.top - halfHeight + halfVisibleHeight;
    const maxScrollX =
      this.worldBounds.left + this.worldBounds.width - halfWidth - halfVisibleWidth;
    const maxScrollY =
      this.worldBounds.top + this.worldBounds.height - halfHeight - halfVisibleHeight;

    if (!this.target) {
      this.baseScrollX =
        maxScrollX < minScrollX ? minScrollX : clamp(this.baseScrollX, minScrollX, maxScrollX);
      this.baseScrollY =
        maxScrollY < minScrollY ? minScrollY : clamp(this.baseScrollY, minScrollY, maxScrollY);
      return;
    }

    this.baseScrollX =
      maxScrollX < minScrollX
        ? minScrollX
        : clamp(this.target.position.x - halfWidth, minScrollX, maxScrollX);
    this.baseScrollY =
      maxScrollY < minScrollY
        ? minScrollY
        : clamp(this.target.position.y - halfHeight, minScrollY, maxScrollY);
  }

  private zoomMultiplier(): number {
    if (this.zoomElapsedMs >= ZOOM_PULSE_DURATION_MS) return 1;
    const t = this.zoomElapsedMs / ZOOM_PULSE_DURATION_MS;
    const pulse =
      t < ZOOM_PULSE_ATTACK_T
        ? t / ZOOM_PULSE_ATTACK_T
        : easeOutRemaining(t - ZOOM_PULSE_ATTACK_T, 1 - ZOOM_PULSE_ATTACK_T);
    return 1 + (ZOOM_PULSE_PEAK - 1) * pulse;
  }

  private shakeOffset(deltaMs: number): { x: number; y: number } {
    if (this.shakeDurationMs <= 0 || this.shakeElapsedMs >= this.shakeDurationMs) {
      return { x: 0, y: 0 };
    }

    this.shakeElapsedMs = Math.min(this.shakeDurationMs, this.shakeElapsedMs + deltaMs);
    if (this.shakeElapsedMs >= this.shakeDurationMs) return { x: 0, y: 0 };
    const t = this.shakeElapsedMs / this.shakeDurationMs;
    const remaining = (1 - t) * (1 - t);
    const phase = t * Math.PI * 2 * SHAKE_OSCILLATIONS;
    return {
      x: (Math.sin(phase) * this.camera.width * this.shakeIntensity * remaining) / this.baseZoom,
      y:
        (Math.cos(phase * 1.37) * this.camera.height * this.shakeIntensity * remaining) /
        this.baseZoom,
    };
  }

  private composeState(
    kickX: number,
    kickY: number,
    shakeX: number,
    shakeY: number,
    zoomMultiplier: number,
    roll: number,
  ): CameraCompositionState {
    const target = this.target
      ? { kind: this.target.kind, position: { ...this.target.position } }
      : null;
    return {
      target,
      base: { scrollX: this.baseScrollX, scrollY: this.baseScrollY, zoom: this.baseZoom },
      transient: { kickX, kickY, shakeX, shakeY, zoomMultiplier, roll },
      composed: {
        scrollX: this.baseScrollX + kickX + shakeX,
        scrollY: this.baseScrollY + kickY + shakeY,
        zoom: this.baseZoom * zoomMultiplier,
        rotation: roll,
      },
    };
  }
}

export function createCameraController(
  camera: Phaser.Cameras.Scene2D.Camera,
  worldBounds: WorldBounds,
): CameraController {
  return new CameraController(camera, worldBounds);
}
