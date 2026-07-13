import Phaser from 'phaser';
import type { MutatorId } from '@shared/config/game.js';

const FLASH_ALPHA = 0.45;
const FLASH_DURATION_MS = 1000;
const EVENT_FLASH_DEPTH = 1900;

/** Per-mutator flash color, picked for high contrast against the wasteland palette. */
const EVENT_COLORS: Record<MutatorId, number> = {
  super_speed: 0xfff200,     // electric yellow
  grenades_only: 0xff8a00,   // detonator orange
  infinite_ammo: 0x39c5ff,   // cool blue
  low_health: 0xff2e3a,      // alarm red
  big_heads: 0xff7ae0,       // bubblegum pink
  vampire: 0x9b30d9,         // blood-magic violet
  turbo_grenades: 0x7cff4f,  // radioactive green
  second_wind: 0x4fe3c1,     // revival teal
  blackout: 0x4b527e,        // midnight indigo
  fists_only: 0xffb347,      // bare-knuckle amber
  weapon_roulette: 0x5ce1e6, // arcade cyan
  wasteland_warp: 0xb56cff,   // dimensional violet
  demolition_wave: 0xffb000, // demolition amber
  last_laugh: 0xff3b30,       // armed corpse red
  scavenger_rush: 0x5ce1e6,  // supply-drop cyan
  radiation_storm: 0x8cff2f, // radioactive lime
  scrapstorm: 0xff6b35,      // falling-scrap orange
};

/**
 * Full-screen tinted flash that fires when a mutator activates.
 * Modeled on HealFlash — a screen-sized rect tweens its alpha to 0 and
 * destroys itself, producing a single dramatic blink without lingering UI.
 */
export class EventFlash {
  private scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  trigger(event: MutatorId): void {
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
