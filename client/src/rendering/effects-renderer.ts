import Phaser from 'phaser';
import type { Vec2 } from '@shared/types/common.js';
import { Wasteland, cssHex } from '@shared/config/palette.js';
import { bucketAimAngle } from './sprite-direction.js';
import { declareWorldSpace, worldPoint } from './gameplay-coordinate-space.js';

const AIM_LINE_ALPHA = 0.6;
const AIM_LINE_THICKNESS = 2;
/** Match PlayerRenderer's SPRITE_SCALE so the muzzle flash size lines up with the gun. */
const MUZZLE_FLASH_SCALE = 3;
const PLAYER_HIT_SPLASH_SCALE = 3;
const PLAYER_HIT_SPLASH_DEPTH = 31;
const PLAYER_HIT_SPLASH_KEYS = ['hit_splash_1', 'hit_splash_2'] as const;

/** Bullet head sprite scale (matches PlayerRenderer's SPRITE_SCALE for visual coherence). */
const BULLET_SCALE = 3;
/** Constant travel time per shot. The arrival callback synchronizes world
 *  impact feedback with the bullet head; past ~250ms starts to feel laggy. */
const BULLET_TRAVEL_MS = 200;
/** Comet-tail particle config. */
const BULLET_TAIL_LIFESPAN_MS = 140;
const BULLET_TAIL_FREQUENCY_MS = 8;
const BULLET_TAIL_ALPHA_START = 0.7;
const BULLET_TAIL_SCALE_START = 0.7;
const DASH_COLOR = 0x70e6ff;

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
      this.aimGraphic = declareWorldSpace(this.scene.add.graphics());
      // Render below players (depth 10) so the line doesn't obscure them.
      this.aimGraphic.setDepth(5);
    }
    return this.aimGraphic;
  }

  showBulletTrail(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    onArrive?: () => void,
  ): void {
    const angle = Math.atan2(endY - startY, endX - startX);

    // Bullet head — tiny 2×1 sprite, rotated to direction of travel.
    const start = worldPoint(startX, startY);
    const end = worldPoint(endX, endY);
    const bullet = declareWorldSpace(this.scene.add.image(start.x, start.y, 'bullet'));
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
      declareWorldSpace(tail);
    }

    this.scene.tweens.add({
      targets: bullet,
      x: end.x,
      y: end.y,
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
        onArrive?.();
      },
    });
  }

  showMuzzleFlash(x: number, y: number, angle: number): void {
    const direction = bucketAimAngle(angle);
    const key = `fire_${direction}`;
    const point = worldPoint(x, y);
    const flash = declareWorldSpace(this.scene.add.sprite(point.x, point.y, key, 0));
    flash.setOrigin(0.5, 0.5);
    flash.setScale(MUZZLE_FLASH_SCALE);
    flash.play(key);
    flash.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      flash.destroy();
    });
  }

  showExplosion(x: number, y: number): void {
    // Expanding ring
    const point = worldPoint(x, y);
    const circle = declareWorldSpace(
      this.scene.add.circle(point.x, point.y, 8, Wasteland.EXPLOSION_RING, 0.8),
    );
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
    const flash = declareWorldSpace(
      this.scene.add.circle(point.x, point.y, 4, Wasteland.EXPLOSION_FLASH, 1),
    );
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

  /** Fast under-player streak and arrival ring for Rook's predicted dash. */
  showDash(start: Vec2, end: Vec2): void {
    const streak = declareWorldSpace(this.scene.add.graphics());
    streak.setDepth(9);
    streak.lineStyle(12, DASH_COLOR, 0.14);
    streak.beginPath();
    streak.moveTo(start.x, start.y);
    streak.lineTo(end.x, end.y);
    streak.strokePath();
    streak.lineStyle(3, DASH_COLOR, 0.7);
    streak.beginPath();
    streak.moveTo(start.x, start.y);
    streak.lineTo(end.x, end.y);
    streak.strokePath();

    const arrival = declareWorldSpace(this.scene.add.circle(end.x, end.y, 9, DASH_COLOR, 0.18));
    arrival.setDepth(9);
    arrival.setStrokeStyle(2, DASH_COLOR, 0.8);

    this.scene.tweens.add({
      targets: streak,
      alpha: 0,
      duration: 220,
      ease: 'Quad.easeOut',
      onComplete: () => streak.destroy(),
    });
    this.scene.tweens.add({
      targets: arrival,
      scaleX: 2.4,
      scaleY: 2.4,
      alpha: 0,
      duration: 260,
      ease: 'Quad.easeOut',
      onComplete: () => arrival.destroy(),
    });
    this.scene.cameras.main.shake(80, 0.002);
  }

  /**
   * Play an authoritative fighter-hit splash. `variantSeed` comes from the
   * server timestamp, so every client chooses the same cosmetic variation.
   */
  showPlayerHit(x: number, y: number, bulletAngle: number, variantSeed: number): void {
    const index = Math.abs(Math.trunc(variantSeed)) % PLAYER_HIT_SPLASH_KEYS.length;
    const key = PLAYER_HIT_SPLASH_KEYS[index];
    const point = worldPoint(x, y);
    const splash = declareWorldSpace(this.scene.add.sprite(point.x, point.y, key, 0));
    splash.setOrigin(0.5, 0.5);
    splash.setScale(PLAYER_HIT_SPLASH_SCALE);
    splash.setRotation(bulletAngle);
    splash.setDepth(PLAYER_HIT_SPLASH_DEPTH);
    splash.play(key);
    splash.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      splash.destroy();
    });

    // A tiny debris burst gives the six-pixel sheet enough presence at the
    // game's 3x sprite scale without obscuring the target.
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
      declareWorldSpace(emitter);
      emitter.setDepth(PLAYER_HIT_SPLASH_DEPTH);
      emitter.explode(5);
      this.scene.time.delayedCall(300, () => {
        emitter.destroy();
      });
    }
  }

  showDamageNumber(x: number, y: number, damage: number): void {
    const point = worldPoint(x, y);
    const text = declareWorldSpace(
      this.scene.add.text(point.x, point.y, `-${damage}`, {
        fontFamily: 'Courier, monospace',
        fontSize: '14px',
        color: cssHex(Wasteland.TEXT_DAMAGE),
        fontStyle: 'bold',
      }),
    );
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
    const point = worldPoint(x, y);
    const flash = declareWorldSpace(
      this.scene.add.circle(point.x, point.y, 8, Wasteland.PICKUP_FLASH, 0.8),
    );
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
      declareWorldSpace(emitter);
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
