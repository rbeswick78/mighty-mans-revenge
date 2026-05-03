import Phaser from 'phaser';

/**
 * Transient directional camera offset — "recoil kick" on the local player's
 * shot. Decays back to zero over ~100 ms.
 *
 * Critical: this MUST stay transient. Many other modules (lighting RT, decal
 * RTs, particle math) assume the camera scroll is 0 — i.e. world coords ==
 * screen coords. The kick borrows scroll for a few frames, then returns it
 * to (0, 0). Do not introduce a sustained offset, permanent zoom, or
 * `startFollow` here.
 */

const KICK_DURATION_MS = 100;
const KICK_PEAK_PIXELS = 4;

export class CameraKick {
  private elapsedMs = KICK_DURATION_MS;
  private dirX = 0;
  private dirY = 0;

  /**
   * Trigger a kick along `reverseAngle` (radians). Pass the angle that points
   * AWAY from the bullet's travel direction so the camera nudges back into
   * the shooter, mimicking recoil.
   */
  trigger(reverseAngle: number): void {
    this.dirX = Math.cos(reverseAngle);
    this.dirY = Math.sin(reverseAngle);
    this.elapsedMs = 0;
  }

  update(deltaMs: number, camera: Phaser.Cameras.Scene2D.Camera): void {
    if (this.elapsedMs >= KICK_DURATION_MS) {
      if (camera.scrollX !== 0 || camera.scrollY !== 0) {
        camera.setScroll(0, 0);
      }
      return;
    }
    this.elapsedMs = Math.min(KICK_DURATION_MS, this.elapsedMs + deltaMs);
    const t = this.elapsedMs / KICK_DURATION_MS;
    const remaining = (1 - t) * (1 - t);
    const magnitude = KICK_PEAK_PIXELS * remaining;
    camera.setScroll(this.dirX * magnitude, this.dirY * magnitude);
  }

  reset(camera: Phaser.Cameras.Scene2D.Camera): void {
    this.elapsedMs = KICK_DURATION_MS;
    this.dirX = 0;
    this.dirY = 0;
    camera.setScroll(0, 0);
  }
}
