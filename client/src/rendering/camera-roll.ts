import Phaser from 'phaser';

/**
 * Transient camera roll on heavy local-player damage. Brief rotation peak
 * then ease back to 0. Trigger sign is randomized per hit so consecutive
 * heavy hits don't always rock in the same direction.
 *
 * Detection lives in `GameScene.update()` — it extends the same
 * `prevLocalHealth` check that drives chromatic aberration. Damage at or
 * above `ROLL_DAMAGE_THRESHOLD` rolls the camera; smaller chip damage is
 * absorbed by the chromatic aberration alone.
 *
 * Critical: this MUST stay transient and decay to exactly 0 rotation.
 * Many other modules (lighting RT, decal RTs, particle math) assume the
 * camera has no sustained transform; a permanent rotation would silently
 * break their alignment.
 */

const ROLL_DURATION_MS = 250;
const ROLL_PEAK_RADIANS = (2.5 * Math.PI) / 180;
/** Local-player HP loss in a single tick at or above this rolls the camera. */
export const ROLL_DAMAGE_THRESHOLD = 20;

export class CameraRoll {
  private elapsedMs = ROLL_DURATION_MS;
  private signedPeak = 0;

  trigger(): void {
    const sign = Math.random() < 0.5 ? -1 : 1;
    this.signedPeak = sign * ROLL_PEAK_RADIANS;
    this.elapsedMs = 0;
  }

  update(deltaMs: number, camera: Phaser.Cameras.Scene2D.Camera): void {
    if (this.elapsedMs >= ROLL_DURATION_MS) {
      if (this.signedPeak !== 0) {
        camera.setRotation(0);
        this.signedPeak = 0;
      }
      return;
    }
    this.elapsedMs = Math.min(ROLL_DURATION_MS, this.elapsedMs + deltaMs);
    const t = this.elapsedMs / ROLL_DURATION_MS;
    const remaining = (1 - t) * (1 - t);
    camera.setRotation(this.signedPeak * remaining);
  }

  reset(camera: Phaser.Cameras.Scene2D.Camera): void {
    this.elapsedMs = ROLL_DURATION_MS;
    this.signedPeak = 0;
    camera.setRotation(0);
  }
}
