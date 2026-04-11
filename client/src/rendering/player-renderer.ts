import Phaser from 'phaser';
import type { PlayerState } from '@shared/types/player.js';

const HEALTH_BAR_WIDTH = 32;
const HEALTH_BAR_HEIGHT = 4;
const HEALTH_BAR_OFFSET_Y = -20;
const NICKNAME_OFFSET_Y = -28;

function healthColor(ratio: number): number {
  if (ratio > 0.6) return 0x00ff00;
  if (ratio > 0.3) return 0xffff00;
  return 0xff0000;
}

export class PlayerRenderer {
  private container: Phaser.GameObjects.Container;
  private sprite: Phaser.GameObjects.Sprite;
  private healthBarBg: Phaser.GameObjects.Rectangle;
  private healthBarFg: Phaser.GameObjects.Rectangle;
  private nicknameText: Phaser.GameObjects.Text;
  private scene: Phaser.Scene;
  private invulnerableTween: Phaser.Tweens.Tween | null = null;
  private sprintParticles: Phaser.GameObjects.Particles.ParticleEmitter | null = null;

  constructor(scene: Phaser.Scene, isLocalPlayer: boolean) {
    this.scene = scene;

    const textureKey = isLocalPlayer ? 'player' : 'enemy';

    this.sprite = scene.add.sprite(0, 0, textureKey);
    this.sprite.setOrigin(0.5, 0.5);

    this.healthBarBg = scene.add.rectangle(
      0,
      HEALTH_BAR_OFFSET_Y,
      HEALTH_BAR_WIDTH,
      HEALTH_BAR_HEIGHT,
      0x333333,
    );
    this.healthBarBg.setOrigin(0.5, 0.5);

    this.healthBarFg = scene.add.rectangle(
      0,
      HEALTH_BAR_OFFSET_Y,
      HEALTH_BAR_WIDTH,
      HEALTH_BAR_HEIGHT,
      0x00ff00,
    );
    this.healthBarFg.setOrigin(0.5, 0.5);

    this.nicknameText = scene.add.text(0, NICKNAME_OFFSET_Y, '', {
      fontFamily: 'Courier, monospace',
      fontSize: '10px',
      color: '#ffffff',
      align: 'center',
    });
    this.nicknameText.setOrigin(0.5, 0.5);

    this.container = scene.add.container(0, 0, [
      this.sprite,
      this.healthBarBg,
      this.healthBarFg,
      this.nicknameText,
    ]);
  }

  update(state: PlayerState): void {
    this.setPosition(state.position.x, state.position.y);
    this.setAimAngle(state.aimAngle);
    this.updateHealthBar(state.health, state.maxHealth);
    this.nicknameText.setText(state.nickname);
    this.container.setVisible(!state.isDead);

    if (state.invulnerableTimer > 0) {
      this.setInvulnerable(true);
    } else {
      this.setInvulnerable(false);
    }

    this.setSprintEffect(state.isSprinting);
  }

  setPosition(x: number, y: number): void {
    this.container.setPosition(x, y);
  }

  setAimAngle(angle: number): void {
    this.sprite.setRotation(angle);
  }

  updateHealthBar(health: number, maxHealth: number): void {
    const ratio = Math.max(0, Math.min(1, health / maxHealth));
    const width = HEALTH_BAR_WIDTH * ratio;
    this.healthBarFg.setSize(width, HEALTH_BAR_HEIGHT);
    this.healthBarFg.setX(-(HEALTH_BAR_WIDTH - width) / 2);
    this.healthBarFg.setFillStyle(healthColor(ratio));
  }

  playDeathAnimation(): void {
    this.scene.tweens.add({
      targets: this.sprite,
      tint: { from: 0xffffff, to: 0xff0000 },
      duration: 200,
      yoyo: true,
      onComplete: () => {
        this.scene.tweens.add({
          targets: this.container,
          alpha: 0,
          duration: 300,
          onComplete: () => {
            this.container.setVisible(false);
          },
        });
      },
    });
  }

  playRespawnAnimation(): void {
    this.container.setVisible(true);
    this.container.setAlpha(0);
    this.scene.tweens.add({
      targets: this.container,
      alpha: 1,
      duration: 500,
      ease: 'Sine.easeInOut',
    });
  }

  setInvulnerable(active: boolean): void {
    if (active && !this.invulnerableTween) {
      this.invulnerableTween = this.scene.tweens.add({
        targets: this.container,
        alpha: { from: 0.3, to: 1 },
        duration: 150,
        yoyo: true,
        repeat: -1,
      });
    } else if (!active && this.invulnerableTween) {
      this.invulnerableTween.stop();
      this.invulnerableTween = null;
      this.container.setAlpha(1);
    }
  }

  setSprintEffect(active: boolean): void {
    if (active && !this.sprintParticles) {
      this.sprintParticles = this.scene.add.particles(0, 0, 'particle', {
        speed: { min: 10, max: 30 },
        scale: { start: 0.5, end: 0 },
        lifespan: 300,
        alpha: { start: 0.5, end: 0 },
        frequency: 50,
        follow: this.container,
      });
    } else if (!active && this.sprintParticles) {
      const emitter = this.sprintParticles;
      emitter.stop();
      this.scene.time.delayedCall(500, () => {
        emitter.destroy();
      });
      this.sprintParticles = null;
    }
  }

  getContainer(): Phaser.GameObjects.Container {
    return this.container;
  }

  destroy(): void {
    if (this.invulnerableTween) {
      this.invulnerableTween.stop();
      this.invulnerableTween = null;
    }
    if (this.sprintParticles) {
      this.sprintParticles.destroy();
      this.sprintParticles = null;
    }
    this.container.destroy();
  }
}
