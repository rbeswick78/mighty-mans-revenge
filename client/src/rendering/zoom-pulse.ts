import Phaser from 'phaser';

/**
 * Transient zoom punch on grenade detonation: 1.0 → peak → 1.0 over a few
 * hundred ms. Snap-up attack, ease-out decay — the camera "feels" the blast
 * then settles back.
 *
 * Critical: this MUST stay transient and decay to exactly 1.0. Many other
 * modules (lighting RT, decal RTs, particle math) assume the camera has no
 * sustained transform; a permanent zoom would silently break their alignment.
 */

const ZOOM_PULSE_DURATION_MS = 200;
const ZOOM_PULSE_PEAK = 1.04;
// Fraction of duration spent ramping UP to peak. The remainder eases back.
// Short attack + long decay reads as a punch, not a wobble.
const ZOOM_PULSE_ATTACK_T = 0.15;

export class ZoomPulse {
  private elapsedMs = ZOOM_PULSE_DURATION_MS;

  trigger(): void {
    this.elapsedMs = 0;
  }

  update(deltaMs: number, camera: Phaser.Cameras.Scene2D.Camera): void {
    if (this.elapsedMs >= ZOOM_PULSE_DURATION_MS) {
      if (camera.zoom !== 1) {
        camera.setZoom(1);
      }
      return;
    }
    this.elapsedMs = Math.min(ZOOM_PULSE_DURATION_MS, this.elapsedMs + deltaMs);
    const t = this.elapsedMs / ZOOM_PULSE_DURATION_MS;
    let pulse: number;
    if (t < ZOOM_PULSE_ATTACK_T) {
      pulse = t / ZOOM_PULSE_ATTACK_T;
    } else {
      const decayT = (t - ZOOM_PULSE_ATTACK_T) / (1 - ZOOM_PULSE_ATTACK_T);
      const remaining = 1 - decayT;
      pulse = remaining * remaining;
    }
    camera.setZoom(1 + (ZOOM_PULSE_PEAK - 1) * pulse);
  }

  reset(camera: Phaser.Cameras.Scene2D.Camera): void {
    this.elapsedMs = ZOOM_PULSE_DURATION_MS;
    camera.setZoom(1);
  }
}
