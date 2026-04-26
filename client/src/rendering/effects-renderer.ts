import Phaser from 'phaser';
import type { Vec2 } from '@shared/types/common.js';

const AIM_LINE_COLOR = 0xffffff;
const AIM_LINE_ALPHA = 0.6;

export class EffectsRenderer {
  private scene: Phaser.Scene;
  /** Persistent aim graphic; recreated each frame while aiming, cleared otherwise. */
  private aimGraphic: Phaser.GameObjects.Graphics | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /** Draw a single straight white line from origin to end (bullet aim). */
  showBulletAim(originX: number, originY: number, endX: number, endY: number): void {
    const g = this.ensureAimGraphic();
    g.clear();
    g.lineStyle(1, AIM_LINE_COLOR, AIM_LINE_ALPHA);
    g.beginPath();
    g.moveTo(originX, originY);
    g.lineTo(endX, endY);
    g.strokePath();
  }

  /** Draw a white polyline along the predicted grenade trajectory. */
  showGrenadeAim(points: Vec2[]): void {
    if (points.length < 2) {
      this.clearAim();
      return;
    }
    const g = this.ensureAimGraphic();
    g.clear();
    g.lineStyle(1, AIM_LINE_COLOR, AIM_LINE_ALPHA);
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
    const line = this.scene.add.line(0, 0, startX, startY, endX, endY, 0xffff00, 0.8);
    line.setOrigin(0, 0);
    line.setLineWidth(1);

    this.scene.tweens.add({
      targets: line,
      alpha: 0,
      duration: 100,
      onComplete: () => {
        line.destroy();
      },
    });
  }

  showMuzzleFlash(x: number, y: number, _angle: number): void {
    const flash = this.scene.add.circle(x, y, 6, 0xffffaa, 1);
    flash.setAlpha(1);

    this.scene.tweens.add({
      targets: flash,
      alpha: 0,
      scaleX: 1.5,
      scaleY: 1.5,
      duration: 80,
      onComplete: () => {
        flash.destroy();
      },
    });
  }

  showExplosion(x: number, y: number): void {
    // Expanding circle
    const circle = this.scene.add.circle(x, y, 8, 0xff6600, 0.8);
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
    const flash = this.scene.add.circle(x, y, 4, 0xffffcc, 1);
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

    // Particle burst
    if (this.scene.textures.exists('particle')) {
      const emitter = this.scene.add.particles(x, y, 'particle', {
        speed: { min: 50, max: 200 },
        scale: { start: 1, end: 0 },
        lifespan: 400,
        alpha: { start: 1, end: 0 },
        tint: [0xff6600, 0xff3300, 0xffcc00],
        quantity: 12,
        emitting: false,
      });
      emitter.explode(12);
      this.scene.time.delayedCall(500, () => {
        emitter.destroy();
      });
    }

    // Screen shake
    this.scene.cameras.main.shake(200, 0.01);
  }

  showHitEffect(x: number, y: number): void {
    const flash = this.scene.add.circle(x, y, 5, 0xff0000, 0.9);
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
        tint: 0xff0000,
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
      color: '#ff4444',
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
    const flash = this.scene.add.circle(x, y, 8, 0x00ffff, 0.8);
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
        tint: [0x00ffff, 0xffffff],
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
