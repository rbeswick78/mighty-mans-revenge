import Phaser from 'phaser';
import type { PlayerState } from '@shared/types/player.js';
import { CHARACTERS, type CharacterId } from '@shared/config/game.js';
import { Wasteland, cssHex, healthColor } from '@shared/config/palette.js';
import { bucketAimAngle, type Direction4 } from './sprite-direction.js';

const SPRITE_SCALE = 3;

const HEALTH_BAR_WIDTH = 36;
const HEALTH_BAR_HEIGHT = 4;
const HEALTH_BAR_OFFSET_Y = -32;
const NICKNAME_OFFSET_Y = -42;

/**
 * Frost Wizard tint — vertical gradient via Phaser's per-corner setTint.
 * White at the head, saturated ice-blue at the feet, so he reads
 * unambiguously as a frost-themed character instead of a slightly cooler
 * Mighty Man (a flat tint mostly just darkens the existing palette).
 */
const FROST_WIZARD_TINT_TOP = 0xffffff;
const FROST_WIZARD_TINT_BOTTOM = 0x4aa3ff;
/** Tint applied to any player while their frozenTimer > 0 — flat saturated cyan, unmistakable. */
const FROZEN_TARGET_TINT = 0x6fcfff;
/** Wand colors: dark shaft + glowing cyan tip. */
const WAND_SHAFT_COLOR = 0x2e222f;
const WAND_TIP_COLOR = 0xaaddff;
/** Frost mist beneath the wizard's feet — always on. */
const FROST_MIST_COLOR = 0xcfeaff;
/** Cyan crystal sparkle around frozen targets. */
const FROZEN_CRYSTAL_COLOR = 0xeaf6ff;
const FROZEN_CRYSTAL_OUTLINE = 0x6fa9c8;
/**
 * Local-space pixel offsets and rotation for the wand by 4-way direction.
 * The wand graphic is drawn horizontally pointing right from local origin
 * (handle at 0,0), so rotation pivots around the held-hand point.
 *   - rot = -π/4: tip swings up-right (held in the right hand)
 *   - rot = -3π/4: tip swings up-left (held in the left hand, mirrored)
 * Per-direction we put it on the visible "near" hand and angle it
 * outward and up, like a held wand — small, off-center, never centered
 * on the body like a two-handed gun.
 */
const WAND_DIR_OFFSETS: Record<
  Direction4,
  { x: number; y: number; rot: number }
> = {
  down: { x: -3, y: 1, rot: (-3 * Math.PI) / 4 },
  up: { x: 3, y: 1, rot: -Math.PI / 4 },
  side: { x: 4, y: 1, rot: -Math.PI / 4 },
  'side-left': { x: -4, y: 1, rot: (-3 * Math.PI) / 4 },
};

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
  /**
   * Held weapon overlay. Null for characters whose CharacterDef.hasGun is
   * false (e.g. Bruce, whose zombie sprite already shows his hands and
   * doesn't need a gun layered on top). Bullet trails still fire — only
   * the on-character gun visual is suppressed.
   */
  private gunSprite: Phaser.GameObjects.Sprite | null;
  private readonly hasGun: boolean;
  private healthBarBg: Phaser.GameObjects.Rectangle;
  private healthBarFg: Phaser.GameObjects.Rectangle;
  private nicknameText: Phaser.GameObjects.Text;
  private scene: Phaser.Scene;
  private invulnerableTween: Phaser.Tweens.Tween | null = null;
  private sprintParticles: Phaser.GameObjects.Particles.ParticleEmitter | null = null;

  /**
   * Sprite-sheet/animation key prefix for this character. Sourced from
   * `CHARACTERS[characterId].spritePrefix` in /shared so the character
   * registry stays the single source of truth.
   */
  private readonly texturePrefix: string;
  private currentDirection: Direction4 = 'down';
  private currentAnimState: AnimState = 'idle';
  private currentGunState: GunState = 'hold';
  private gunShootTimer: Phaser.Time.TimerEvent | null = null;
  private hasLastPos = false;
  private lastX = 0;
  private lastY = 0;
  /** Frost Wizard cosmetic ID — gates wand/mist + base tint. */
  private readonly characterId: CharacterId;
  /** Drawn wand graphic (Frost Wizard only). Replaces the gun overlay. */
  private wandGraphics: Phaser.GameObjects.Graphics | null = null;
  /** Always-on cyan mist puddle under the Frost Wizard's feet. */
  private frostMistGraphics: Phaser.GameObjects.Graphics | null = null;
  /** Orbiting crystal sparkles, drawn per-frame while frozenTimer > 0. */
  private frozenCrystalGraphics: Phaser.GameObjects.Graphics | null = null;
  /** Last frozen-state edge so we only flip tint on transitions. */
  private wasFrozen = false;

  constructor(scene: Phaser.Scene, characterId: CharacterId) {
    this.scene = scene;
    const def = CHARACTERS[characterId];
    this.characterId = characterId;
    this.texturePrefix = def.spritePrefix;
    this.hasGun = def.hasGun;

    this.sprite = scene.add.sprite(0, 0, this.animKey('down', 'idle'), 0);
    this.sprite.setOrigin(0.5, 0.5);
    this.sprite.setScale(SPRITE_SCALE);
    this.sprite.play(this.animKey('down', 'idle'));
    // Frost Wizard reuses Mighty Man's sprite sheets — a vertical
    // white-to-ice-blue gradient via per-corner tint is the primary
    // differentiator (flat tint barely shifts the palette). A frozen
    // player overrides this with FROZEN_TARGET_TINT while their freeze
    // is active (handled in update()).
    if (this.characterId === 'frost_wizard') {
      this.applyFrostWizardTint();
    }

    // Gun overlay: shared across characters (not character-specific art).
    // Layered on top of the no-hands character sprite so the asset-pack's
    // centered weapon falls into the held-hand position. Skipped entirely
    // for hands-on-sprite characters like Bruce.
    if (this.hasGun) {
      const gun = scene.add.sprite(0, 0, this.gunKey('down', 'hold'), 0);
      gun.setOrigin(0.5, 0.5);
      gun.setScale(SPRITE_SCALE);
      gun.play(this.gunKey('down', 'hold'));
      this.gunSprite = gun;
    } else {
      this.gunSprite = null;
    }

    // Frost Wizard cosmetics: an always-on mist puddle under the feet and a
    // drawn wand that takes the gun overlay's role. Both are local-space
    // graphics inside the container, so they follow the player automatically.
    if (this.characterId === 'frost_wizard') {
      // Mist puddle — soft elliptical wash sitting at the feet. Drawn once
      // and never rebuilt; only its alpha could change later if we want
      // pulsing, which we intentionally don't (always-on, not telegraphed).
      const mist = scene.add.graphics();
      mist.fillStyle(FROST_MIST_COLOR, 0.18);
      mist.fillEllipse(0, 12, 30, 10);
      mist.fillStyle(FROST_MIST_COLOR, 0.32);
      mist.fillEllipse(0, 12, 18, 6);
      this.frostMistGraphics = mist;

      // Small one-handed wand. Drawn horizontally from local origin (0,0
      // is the held-hand point) so per-direction setRotation pivots cleanly
      // at the grip, with the tip swinging out diagonally. Roughly half the
      // sprite's width — reads as a stick, not a rifle.
      const wand = scene.add.graphics();
      wand.fillStyle(WAND_SHAFT_COLOR, 1);
      wand.fillRect(0, 0, 5, 1);
      wand.fillStyle(WAND_TIP_COLOR, 1);
      wand.fillRect(4, -1, 2, 2);
      wand.setScale(SPRITE_SCALE);
      this.wandGraphics = wand;
    }

    // Frozen-target sparkle layer — empty until update() draws crystals on
    // a frame where state.frozenTimer > 0. Lives on every player so any
    // character can be frozen (not just Frost Wizard).
    this.frozenCrystalGraphics = scene.add.graphics();
    this.frozenCrystalGraphics.setVisible(false);

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

    const children: Phaser.GameObjects.GameObject[] = [];
    // Mist sits under the body so the sprite paints over the puddle's center.
    if (this.frostMistGraphics) children.push(this.frostMistGraphics);
    children.push(this.sprite);
    if (this.gunSprite) children.push(this.gunSprite);
    if (this.wandGraphics) children.push(this.wandGraphics);
    if (this.frozenCrystalGraphics) children.push(this.frozenCrystalGraphics);
    children.push(this.healthBarBg, this.healthBarFg, this.nicknameText);
    this.container = scene.add.container(0, 0, children);
    // Position the wand for the initial 'down' direction.
    if (this.wandGraphics) this.applyWandTransform('down');
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
    this.updateFrozenVfx(state.frozenTimer);
  }

  /**
   * Sync sprite tint and crystal sparkles to the player's frozen state.
   * Tint flips on the leading edge so we don't fight Phaser's tint cache
   * every frame, but the crystals are redrawn every frame so they orbit.
   */
  private updateFrozenVfx(frozenTimer: number): void {
    const isFrozen = frozenTimer > 0;
    if (isFrozen !== this.wasFrozen) {
      if (isFrozen) {
        this.sprite.setTint(FROZEN_TARGET_TINT);
      } else if (this.characterId === 'frost_wizard') {
        this.applyFrostWizardTint();
      } else {
        this.sprite.clearTint();
      }
      this.wasFrozen = isFrozen;
    }

    const crystals = this.frozenCrystalGraphics;
    if (!crystals) return;
    if (!isFrozen) {
      if (crystals.visible) crystals.setVisible(false);
      return;
    }

    // Six tiny diamonds orbiting at shoulder height. Period ~1.6s gives a
    // gentle, readable rotation that doesn't strobe at 60 fps.
    const tNow = this.scene.time.now / 1000;
    crystals.setVisible(true);
    crystals.clear();
    const radiusX = 14;
    const radiusY = 6;
    const yCenter = -6;
    for (let i = 0; i < 6; i++) {
      const phase = tNow * 2 * Math.PI * 0.6 + (i * Math.PI * 2) / 6;
      const x = Math.cos(phase) * radiusX;
      const y = yCenter + Math.sin(phase) * radiusY;
      crystals.fillStyle(FROZEN_CRYSTAL_COLOR, 0.95);
      crystals.fillTriangle(x, y - 2, x + 1.5, y, x, y + 2);
      crystals.fillTriangle(x, y - 2, x - 1.5, y, x, y + 2);
      crystals.lineStyle(1, FROZEN_CRYSTAL_OUTLINE, 0.85);
      crystals.strokeTriangle(x, y - 2, x + 1.5, y, x, y + 2);
      crystals.strokeTriangle(x, y - 2, x - 1.5, y, x, y + 2);
    }
  }

  private applyWandTransform(direction: Direction4): void {
    if (!this.wandGraphics) return;
    const o = WAND_DIR_OFFSETS[direction];
    this.wandGraphics.setPosition(o.x, o.y);
    this.wandGraphics.setRotation(o.rot);
  }

  /**
   * Apply the white→ice-blue vertical gradient tint to the body sprite.
   * Phaser's setTint(topLeft, topRight, bottomLeft, bottomRight) interpolates
   * across the quad on the GPU — no per-pixel work. Cheaper than recoloring
   * frames and dramatically more visible than a flat tint.
   */
  private applyFrostWizardTint(): void {
    this.sprite.setTint(
      FROST_WIZARD_TINT_TOP,
      FROST_WIZARD_TINT_TOP,
      FROST_WIZARD_TINT_BOTTOM,
      FROST_WIZARD_TINT_BOTTOM,
    );
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
      if (this.gunSprite) this.playCurrentGunAnim();
      if (this.wandGraphics) this.applyWandTransform(direction);
    }
  }

  /**
   * Trigger the gun's 3-frame shoot animation. Routed from
   * GameScene.onBulletTrail by shooterId. Each new shot restarts the
   * shoot anim (no stacking); after GUN_SHOOT_DURATION_MS we revert to
   * the looping hold anim. No-op for characters without a rendered gun.
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

  /** Whether this character renders a held gun (and matching muzzle flash). */
  rendersGun(): boolean {
    return this.gunSprite !== null;
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
    // Container.destroy disposes children, so wand/mist/crystal graphics
    // are torn down with the container — no extra cleanup needed.
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
