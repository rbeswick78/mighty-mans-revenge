import Phaser from 'phaser';
import type { FinalMinuteEvent } from '@shared/types/network.js';

const FLASH_ALPHA = 0.45;
const FLASH_DURATION_MS = 1000;
const EVENT_FLASH_DEPTH = 1900;

/** Per-event flash color, picked for high contrast against the wasteland palette. */
const EVENT_COLORS: Record<FinalMinuteEvent, number> = {
  super_speed: 0xfff200,    // electric yellow
  grenades_only: 0xff8a00,  // detonator orange
  infinite_ammo: 0x39c5ff,  // cool blue
  low_health: 0xff2e3a,     // alarm red
};

/**
 * Full-screen tinted flash that fires when a final-minute event activates.
 * Modeled on HealFlash — a screen-sized rect tweens its alpha to 0 and
 * destroys itself, producing a single dramatic blink without lingering UI.
 */
export class EventFlash {
  private scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  trigger(event: FinalMinuteEvent): void {
    const cam = this.scene.cameras.main;
    const flash = this.scene.add.rectangle(
      0,
      0,
      cam.width,
      cam.height,
      EVENT_COLORS[event],
      FLASH_ALPHA,
    );
    flash.setOrigin(0, 0);
    flash.setScrollFactor(0);
    flash.setDepth(EVENT_FLASH_DEPTH);
    this.scene.tweens.add({
      targets: flash,
      alpha: 0,
      duration: FLASH_DURATION_MS,
      onComplete: () => flash.destroy(),
    });
  }
}
