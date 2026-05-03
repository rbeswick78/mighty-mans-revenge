import Phaser from 'phaser';
import type { PlayerState } from '@shared/types/player.js';
import { Wasteland, cssHex, healthColor } from '@shared/config/palette.js';
import { bucketAimAngle, type Direction4 } from './sprite-direction.js';

const SPRITE_SCALE = 3;

const HEALTH_BAR_WIDTH = 36;
const HEALTH_BAR_HEIGHT = 4;
const HEALTH_BAR_OFFSET_Y = -32;
const NICKNAME_OFFSET_Y = -42;

/**
 * If the player moved more than √MOVING_THRESHOLD_SQ pixels between renders,
 * play the run animation. Bigger than reconciliation jitter (sub-pixel
 * corrections) but small enough that even slow movement reads as running.
 */
const MOVING_THRESHOLD_SQ = 1.0;

/**
 * How long to keep the gun in its 3-frame shoot animation before reverting
 * to the looping hold anim. Matches GUN_SHOOT_FPS=24 × 3 frames in
 * boot-scene.ts (~125 ms).
 */
const GUN_SHOOT_DURATION_MS = 125;

type AnimState = 'idle' | 'run';
type GunState = 'hold' | 'shoot';

export class PlayerRenderer {
  private container: Phaser.GameObjects.Container;
  private sprite: Phaser.GameObjects.Sprite;
  /** Held weapon overlay; only present for player-kind renderers (zombies have no gun). */
  private gunSprite: Phaser.GameObjects.Sprite | null = null;
  private healthBarBg: Phaser.GameObjects.Rectangle;
  private healthBarFg: Phaser.GameObjects.Rectangle;
  private nicknameText: Phaser.GameObjects.Text;
  private scene: Phaser.Scene;
  private invulnerableTween: Phaser.Tweens.Tween | null = null;
  private sprintParticles: Phaser.GameObjects.Particles.ParticleEmitter | null = null;

  private readonly texturePrefix: 'player' | 'enemy';
  private currentDirection: Direction4 = 'down';
  private currentAnimState: AnimState = 'idle';
  private currentGunState: GunState = 'hold';
  private gunShootTimer: Phaser.Time.TimerEvent | null = null;
  private hasLastPos = false;
  private lastX = 0;
  private lastY = 0;

  constructor(scene: Phaser.Scene, isLocalPlayer: boolean) {
    this.scene = scene;
    this.texturePrefix = isLocalPlayer ? 'player' : 'enemy';

    this.sprite = scene.add.sprite(0, 0, this.animKey('down', 'idle'), 0);
    this.sprite.setOrigin(0.5, 0.5);
    this.sprite.setScale(SPRITE_SCALE);
    this.sprite.play(this.animKey('down', 'idle'));

    // Gun overlay: only the player kind. Layered on top of the no-hands
    // character sprite so the asset-pack's centered weapon falls into the
    // held-hand position. Zombies don't get one — they wield nothing.
    if (this.texturePrefix === 'player') {
      this.gunSprite = scene.add.sprite(0, 0, this.gunKey('down', 'hold'), 0);
      this.gunSprite.setOrigin(0.5, 0.5);
      this.gunSprite.setScale(SPRITE_SCALE);
      this.gunSprite.play(this.gunKey('down', 'hold'));
    }

    this.healthBarBg = scene.add.rectangle(
      0,
      HEALTH_BAR_OFFSET_Y,
      HEALTH_BAR_WIDTH,
      HEALTH_BAR_HEIGHT,
      Wasteland.HEALTH_BAR_BG,
    );
    this.healthBarBg.setOrigin(0.5, 0.5);

    this.healthBarFg = scene.add.rectangle(
      0,
      HEALTH_BAR_OFFSET_Y,
      HEALTH_BAR_WIDTH,
      HEALTH_BAR_HEIGHT,
      Wasteland.HEALTH_GOOD,
    );
    this.healthBarFg.setOrigin(0.5, 0.5);

    this.nicknameText = scene.add.text(0, NICKNAME_OFFSET_Y, '', {
      fontFamily: 'Courier, monospace',
      fontSize: '10px',
      color: cssHex(Wasteland.TEXT_NICKNAME),
      align: 'center',
    });
    this.nicknameText.setOrigin(0.5, 0.5);

    const children: Phaser.GameObjects.GameObject[] = [this.sprite];
    if (this.gunSprite) children.push(this.gunSprite);
    children.push(this.healthBarBg, this.healthBarFg, this.nicknameText);
    this.container = scene.add.container(0, 0, children);
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
    let isMoving = this.currentAnimState === 'run';
    if (this.hasLastPos) {
      const dx = x - this.lastX;
      const dy = y - this.lastY;
      isMoving = dx * dx + dy * dy > MOVING_THRESHOLD_SQ;
    }
    this.lastX = x;
    this.lastY = y;
    this.hasLastPos = true;
    this.container.setPosition(x, y);

    const desiredState: AnimState = isMoving ? 'run' : 'idle';
    if (desiredState !== this.currentAnimState) {
      this.currentAnimState = desiredState;
      this.playCurrentAnim();
    }
  }

  /**
   * Pick the directional sprite that best matches the aim angle.
   * No free rotation — this asset pack is 4-direction.
   */
  setAimAngle(angle: number): void {
    const direction = bucketAimAngle(angle);
    if (direction !== this.currentDirection) {
      this.currentDirection = direction;
      this.playCurrentAnim();
      this.playCurrentGunAnim();
    }
  }

  /**
   * Trigger the gun's 3-frame shoot animation. Routed from
   * GameScene.onBulletTrail by shooterId. Each new shot restarts the
   * shoot anim (no stacking); after GUN_SHOOT_DURATION_MS we revert to
   * the looping hold anim.
   */
  playShootAnimation(): void {
    if (!this.gunSprite) return;
    this.currentGunState = 'shoot';
    this.playCurrentGunAnim();
    this.gunShootTimer?.remove(false);
    this.gunShootTimer = this.scene.time.delayedCall(GUN_SHOOT_DURATION_MS, () => {
      this.currentGunState = 'hold';
      this.playCurrentGunAnim();
      this.gunShootTimer = null;
    });
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
      tint: { from: 0xffffff, to: Wasteland.DEATH_TINT },
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
    this.gunShootTimer?.remove(false);
    this.gunShootTimer = null;
    this.gunSprite = null;
    this.container.destroy();
  }

  private playCurrentAnim(): void {
    const key = this.animKey(this.currentDirection, this.currentAnimState);
    // ignoreIfPlaying = true means re-calling with the same key is a no-op.
    this.sprite.play(key, true);
  }

  private playCurrentGunAnim(): void {
    if (!this.gunSprite) return;
    const key = this.gunKey(this.currentDirection, this.currentGunState);
    // ignoreIfPlaying = false: shooting again restarts the shoot anim.
    this.gunSprite.play(key, this.currentGunState === 'hold');
  }

  private animKey(direction: Direction4, state: AnimState): string {
    return `${this.texturePrefix}_${direction}_${state}`;
  }

  private gunKey(direction: Direction4, state: GunState): string {
    return `gun_${direction}_${state}`;
  }
}
