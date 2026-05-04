import Phaser from 'phaser';
import type { Vec2 } from '@shared/types/common.js';
import { Wasteland, cssHex } from '@shared/config/palette.js';
import { bucketAimAngle } from './sprite-direction.js';

const AIM_LINE_ALPHA = 0.6;
const AIM_LINE_THICKNESS = 2;
/** Match PlayerRenderer's SPRITE_SCALE so the muzzle flash size lines up with the gun. */
const MUZZLE_FLASH_SCALE = 3;

/** Bullet head sprite scale (matches PlayerRenderer's SPRITE_SCALE for visual coherence). */
const BULLET_SCALE = 3;
/** Constant travel time per shot — fast enough that the hit-flash on the
 *  target lands close enough to bullet-arrival to read as coincident.
 *  Bumping past ~250 ms starts to feel like backwards causality. */
const BULLET_TRAVEL_MS = 200;
/** Comet-tail particle config. */
const BULLET_TAIL_LIFESPAN_MS = 140;
const BULLET_TAIL_FREQUENCY_MS = 8;
const BULLET_TAIL_ALPHA_START = 0.7;
const BULLET_TAIL_SCALE_START = 0.7;

export class EffectsRenderer {
  private scene: Phaser.Scene;
  /** Persistent aim graphic; recreated each frame while aiming, cleared otherwise. */
  private aimGraphic: Phaser.GameObjects.Graphics | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /** Draw a single straight line from origin to end (bullet aim). */
  showBulletAim(
    originX: number,
    originY: number,
    endX: number,
    endY: number,
    outOfAmmo = false,
  ): void {
    const g = this.ensureAimGraphic();
    g.clear();
    const color = outOfAmmo ? Wasteland.AIM_LINE_EMPTY : Wasteland.AIM_LINE;
    g.lineStyle(AIM_LINE_THICKNESS, color, AIM_LINE_ALPHA);
    g.beginPath();
    g.moveTo(originX, originY);
    g.lineTo(endX, endY);
    g.strokePath();
  }

  /** Draw a polyline along the predicted grenade trajectory. */
  showGrenadeAim(points: Vec2[], outOfAmmo = false): void {
    if (points.length < 2) {
      this.clearAim();
      return;
    }
    const g = this.ensureAimGraphic();
    g.clear();
    const color = outOfAmmo ? Wasteland.AIM_LINE_EMPTY : Wasteland.AIM_LINE;
    g.lineStyle(AIM_LINE_THICKNESS, color, AIM_LINE_ALPHA);
    g.beginPath();
    g.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      g.lineTo(points[i].x, points[i].y);
    }
    g.strokePath();
  }

  /** Hide the aim line. */
  clearAim(): void {
    if (this.aimGraphic) {
      this.aimGraphic.clear();
    }
  }

  private ensureAimGraphic(): Phaser.GameObjects.Graphics {
    if (!this.aimGraphic) {
      this.aimGraphic = this.scene.add.graphics();
      // Render below players (depth 10) so the line doesn't obscure them.
      this.aimGraphic.setDepth(5);
    }
    return this.aimGraphic;
  }

  showBulletTrail(startX: number, startY: number, endX: number, endY: number): void {
    const angle = Math.atan2(endY - startY, endX - startX);

    // Bullet head — tiny 2×1 sprite, rotated to direction of travel.
    const bullet = this.scene.add.image(startX, startY, 'bullet');
    bullet.setOrigin(0.5, 0.5);
    bullet.setScale(BULLET_SCALE);
    bullet.setRotation(angle);

    // Comet tail — particle emitter follows the bullet, spawning fading
    // dots at its current position each frame. Reads as a trailing streak
    // behind the projectile (no static line — the path is drawn as the
    // bullet moves through it).
    let tail: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
    if (this.scene.textures.exists('particle')) {
      tail = this.scene.add.particles(0, 0, 'particle', {
        follow: bullet,
        speed: 0,
        lifespan: BULLET_TAIL_LIFESPAN_MS,
        frequency: BULLET_TAIL_FREQUENCY_MS,
        scale: { start: BULLET_TAIL_SCALE_START, end: 0 },
        alpha: { start: BULLET_TAIL_ALPHA_START, end: 0 },
        tint: Wasteland.BULLET_TRAIL,
      });
    }

    this.scene.tweens.add({
      targets: bullet,
      x: endX,
      y: endY,
      duration: BULLET_TRAVEL_MS,
      ease: 'Linear',
      onComplete: () => {
        bullet.destroy();
        if (tail) {
          tail.stop();
          // Let the last spawned particles finish their fade, then clean up.
          this.scene.time.delayedCall(BULLET_TAIL_LIFESPAN_MS, () => {
            tail?.destroy();
          });
        }
      },
    });
  }

  showMuzzleFlash(x: number, y: number, angle: number): void {
    const direction = bucketAimAngle(angle);
    const key = `fire_${direction}`;
    const flash = this.scene.add.sprite(x, y, key, 0);
    flash.setOrigin(0.5, 0.5);
    flash.setScale(MUZZLE_FLASH_SCALE);
    flash.play(key);
    flash.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      flash.destroy();
    });
  }

  showExplosion(x: number, y: number): void {
    // Expanding ring
    const circle = this.scene.add.circle(x, y, 8, Wasteland.EXPLOSION_RING, 0.8);
    this.scene.tweens.add({
      targets: circle,
      scaleX: 8,
      scaleY: 8,
      alpha: 0,
      duration: 400,
      ease: 'Quad.easeOut',
      onComplete: () => {
        circle.destroy();
      },
    });

    // Inner bright flash
    const flash = this.scene.add.circle(x, y, 4, Wasteland.EXPLOSION_FLASH, 1);
    this.scene.tweens.add({
      targets: flash,
      scaleX: 4,
      scaleY: 4,
      alpha: 0,
      duration: 200,
      onComplete: () => {
        flash.destroy();
      },
    });

    // Debris particles are owned by ExplosionFx (pooled). Wire from
    // game-scene alongside this call.

    // Screen shake
    this.scene.cameras.main.shake(200, 0.01);
  }

  showHitEffect(x: number, y: number): void {
    const flash = this.scene.add.circle(x, y, 5, Wasteland.HIT_FLASH, 0.9);
    this.scene.tweens.add({
      targets: flash,
      alpha: 0,
      scaleX: 2,
      scaleY: 2,
      duration: 150,
      onComplete: () => {
        flash.destroy();
      },
    });

    // Small particle burst
    if (this.scene.textures.exists('particle')) {
      const emitter = this.scene.add.particles(x, y, 'particle', {
        speed: { min: 20, max: 80 },
        scale: { start: 0.5, end: 0 },
        lifespan: 200,
        alpha: { start: 0.8, end: 0 },
        tint: Wasteland.HIT_PARTICLE,
        quantity: 5,
        emitting: false,
      });
      emitter.explode(5);
      this.scene.time.delayedCall(300, () => {
        emitter.destroy();
      });
    }
  }

  showDamageNumber(x: number, y: number, damage: number): void {
    const text = this.scene.add.text(x, y, `-${damage}`, {
      fontFamily: 'Courier, monospace',
      fontSize: '14px',
      color: cssHex(Wasteland.TEXT_DAMAGE),
      fontStyle: 'bold',
    });
    text.setOrigin(0.5, 0.5);

    this.scene.tweens.add({
      targets: text,
      y: y - 30,
      alpha: 0,
      duration: 800,
      ease: 'Quad.easeOut',
      onComplete: () => {
        text.destroy();
      },
    });
  }

  showPickupEffect(x: number, y: number): void {
    const flash = this.scene.add.circle(x, y, 8, Wasteland.PICKUP_FLASH, 0.8);
    this.scene.tweens.add({
      targets: flash,
      scaleX: 3,
      scaleY: 3,
      alpha: 0,
      duration: 300,
      onComplete: () => {
        flash.destroy();
      },
    });

    // Sparkle particles
    if (this.scene.textures.exists('particle')) {
      const emitter = this.scene.add.particles(x, y, 'particle', {
        speed: { min: 30, max: 100 },
        scale: { start: 0.8, end: 0 },
        lifespan: 400,
        alpha: { start: 1, end: 0 },
        tint: [Wasteland.PICKUP_SPARKLE_A, Wasteland.PICKUP_SPARKLE_B],
        quantity: 8,
        emitting: false,
      });
      emitter.explode(8);
      this.scene.time.delayedCall(500, () => {
        emitter.destroy();
      });
    }
  }

  destroy(): void {
    if (this.aimGraphic) {
      this.aimGraphic.destroy();
      this.aimGraphic = null;
    }
  }
}
