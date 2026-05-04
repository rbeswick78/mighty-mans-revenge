import Phaser from 'phaser';
import { Wasteland } from '@shared/config/palette.js';

const FLASH_ALPHA = 0.4;
const FLASH_DURATION_MS = 1000;

const HEAL_FLASH_DEPTH = 1900;

/**
 * Green full-screen flash for the local player when they get a kill.
 * Fades out over ~1s. Visual feedback for the on-kill heal reward.
 */
export class HealFlash {
  private scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  trigger(): void {
    const cam = this.scene.cameras.main;
    const flash = this.scene.add.rectangle(
      0,
      0,
      cam.width,
      cam.height,
      Wasteland.HEALTH_GOOD,
      FLASH_ALPHA,
    );
    flash.setOrigin(0, 0);
    flash.setScrollFactor(0);
    flash.setDepth(HEAL_FLASH_DEPTH);
    this.scene.tweens.add({
      targets: flash,
      alpha: 0,
      duration: FLASH_DURATION_MS,
      onComplete: () => flash.destroy(),
    });
  }
}
