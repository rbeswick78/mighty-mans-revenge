import Phaser from 'phaser';
import type { PlayerState } from '@shared/types/player.js';
import { CHARACTERS, MUTATORS, type CharacterId, type WeaponId } from '@shared/config/game.js';
import type { CharacterDef } from '@shared/types/character.js';
import { Wasteland, cssHex, healthColor } from '@shared/config/palette.js';
import {
  bucketAimAngle,
  deathDirectionForAim,
  type DeathDirection,
  type Direction4,
} from './sprite-direction.js';
import {
  weaponOverlayKey,
  weaponRendersOverlay,
  type GunOverlayState,
} from './weapon-overlay-key.js';
import { batHeldRotation, batSwingRotations } from './bat-presentation.js';
import { deathVariantPrefix } from './death-variant.js';
import { armorPresentation } from '../ui/armor-presentation.js';
import { declareWorldSpace } from './gameplay-coordinate-space.js';

const SPRITE_SCALE = 3;

const HEALTH_BAR_WIDTH = 36;
const HEALTH_BAR_HEIGHT = 4;
const HEALTH_BAR_OFFSET_Y = -32;
const ARMOR_BAR_HEIGHT = 2;
const ARMOR_BAR_OFFSET_Y = -37;
const NICKNAME_OFFSET_Y = -42;
const BOUNTY_MARKER_OFFSET_Y = -56;
const BOUNTY_MARKER_COLOR = '#ffd166';
const CROWN_MARKER_OFFSET_Y = -68;
const CROWN_MARKER_COLOR = '#ffe08a';
const TEAMMATE_MARKER_OFFSET_Y = -56;
const TEAMMATE_MARKER_COLOR = '#76f7c4';

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
const WAND_DIR_OFFSETS: Record<Direction4, { x: number; y: number; rot: number }> = {
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
/**
 * Shotgun pump animation shown after each shot. Together with the shoot
 * anim this fills the weapon's 0.6 s fireCooldown (125 + 475 ms).
 */
const SHOTGUN_RACK_DURATION_MS = 475;
/**
 * How long a punch swing owns the body sprite before the idle/run loop
 * resumes. Matches ATTACK_SWING_SECONDS in boot-scene.ts — attack anims
 * are frame-rate-normalized so every character's swing plays in this
 * window regardless of sheet frame count.
 */
const ATTACK_SWING_DURATION_MS = 350;
const BAT_SWING_DURATION_MS = 310;

type AnimState = 'idle' | 'run';

export class PlayerRenderer {
  private container: Phaser.GameObjects.Container;
  private sprite: Phaser.GameObjects.Sprite;
  /** Optional animated cosmetic synchronized to the body (Rook's helmet). */
  private bodyOverlaySprite: Phaser.GameObjects.Sprite | null;
  private readonly characterDef: CharacterDef;
  /**
   * Held weapon overlay. Null for characters whose CharacterDef.hasGun is
   * false (e.g. Bruce, whose zombie sprite already shows his hands and
   * doesn't need a gun layered on top). Bullet trails still fire — only
   * the on-character gun visual is suppressed.
   */
  private gunSprite: Phaser.GameObjects.Sprite | null;
  /** Universal handle-pivoted bat sprite; available to every fighter. */
  private batSprite: Phaser.GameObjects.Image;
  private batSwingTween: Phaser.Tweens.Tween | null = null;
  private lastAimAngle = 0;
  private readonly hasGun: boolean;
  private healthBarBg: Phaser.GameObjects.Rectangle;
  private healthBarFg: Phaser.GameObjects.Rectangle;
  private armorBarBg: Phaser.GameObjects.Rectangle;
  private armorBarFg: Phaser.GameObjects.Rectangle;
  private hasArmor = false;
  private nicknameText: Phaser.GameObjects.Text;
  private bountyMarkerText: Phaser.GameObjects.Text;
  private bountyMarked = false;
  private crownMarkerText: Phaser.GameObjects.Text;
  private crownMarked = false;
  private teammateMarkerText: Phaser.GameObjects.Text;
  private teammateMarked = false;
  private scene: Phaser.Scene;
  private invulnerableTween: Phaser.Tweens.Tween | null = null;
  private sprintParticles: Phaser.GameObjects.Particles.ParticleEmitter | null = null;

  /**
   * Sprite-sheet/animation key prefix for this character. Sourced from
   * `CHARACTERS[characterId].spritePrefix` in /shared so the character
   * registry stays the single source of truth.
   */
  private readonly texturePrefix: string;
  /**
   * Alt-body anim prefix (CharacterDef.altBody — Jack's no-axe sheets),
   * or null for the rest of the roster. Swapped in while isAxeless.
   */
  private readonly altBodyPrefix: string | null;
  /**
   * True while the character should render its alt body — Jack's thrown
   * axe is in flight or regrowing (abilityCooldownSeconds > 0). Driven
   * per-frame by ClientPlayerManager; always false without an altBody.
   */
  private isAxeless = false;
  private currentDirection: Direction4 = 'down';
  private deathDirection: DeathDirection = 'side';
  /** Body prefix selected for the current authoritative death edge. */
  private currentDeathPrefix: string;
  private isDead = false;
  private currentAnimState: AnimState = 'idle';
  private currentGunState: GunOverlayState = 'hold';
  /** Weapon driving the held overlay — see weaponOverlayKey for the key map. */
  private currentWeaponId: WeaponId = 'rifle';
  private gunShootTimer: Phaser.Time.TimerEvent | null = null;
  /**
   * True while the body sprite is playing its one-shot punch swing. While
   * set, playCurrentAnim routes to the attack anim so idle/run flips can't
   * clobber the swing; a direction change re-plays it in the new facing.
   */
  private isAttacking = false;
  private attackTimer: Phaser.Time.TimerEvent | null = null;
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
  /** Extra sprite scale while the big_heads mutator is active (1 otherwise). */
  private renderScaleMultiplier = 1;

  constructor(scene: Phaser.Scene, characterId: CharacterId) {
    this.scene = scene;
    // Annotated as CharacterDef so optional fields (altBody) are visible —
    // the frozen registry literal narrows each entry to its own shape.
    const def: CharacterDef = CHARACTERS[characterId];
    this.characterDef = def;
    this.characterId = characterId;
    this.texturePrefix = def.spritePrefix;
    this.altBodyPrefix = def.altBody?.spritePrefix ?? null;
    this.currentDeathPrefix = def.spritePrefix;
    this.hasGun = def.hasGun;

    this.sprite = scene.add.sprite(0, 0, this.animKey('down', 'idle'), 0);
    this.sprite.setOrigin(0.5, 0.5);
    this.sprite.setScale(SPRITE_SCALE);
    this.sprite.play(this.animKey('down', 'idle'));

    if (def.bodyOverlay) {
      const overlayKey = `${def.bodyOverlay.spritePrefix}_down_idle`;
      this.bodyOverlaySprite = scene.add.sprite(0, 0, overlayKey, 0);
      this.bodyOverlaySprite.setOrigin(0.5, 0.5);
      this.bodyOverlaySprite.setScale(SPRITE_SCALE);
      this.bodyOverlaySprite.play(overlayKey);
      this.applyBodyOverlayTransform('down', 'idle');
    } else {
      this.bodyOverlaySprite = null;
    }
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

    this.batSprite = scene.add.image(0, 0, 'pickup_bat');
    this.batSprite.setOrigin(0.86, 0.86);
    this.batSprite.setScale(SPRITE_SCALE);
    this.batSprite.setRotation(batHeldRotation(0));
    this.batSprite.setVisible(false);

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

    this.armorBarBg = scene.add.rectangle(
      0,
      ARMOR_BAR_OFFSET_Y,
      HEALTH_BAR_WIDTH,
      ARMOR_BAR_HEIGHT,
      Wasteland.HEALTH_BAR_BG,
    );
    this.armorBarBg.setOrigin(0.5, 0.5).setVisible(false);

    this.armorBarFg = scene.add.rectangle(
      0,
      ARMOR_BAR_OFFSET_Y,
      HEALTH_BAR_WIDTH,
      ARMOR_BAR_HEIGHT,
      Wasteland.ARMOR_FILL,
    );
    this.armorBarFg.setOrigin(0.5, 0.5).setVisible(false);

    this.nicknameText = scene.add.text(0, NICKNAME_OFFSET_Y, '', {
      fontFamily: 'Courier, monospace',
      fontSize: '10px',
      color: cssHex(Wasteland.TEXT_NICKNAME),
      align: 'center',
    });
    this.nicknameText.setOrigin(0.5, 0.5);

    this.bountyMarkerText = scene.add.text(0, BOUNTY_MARKER_OFFSET_Y, '[ BOUNTY ]', {
      fontFamily: 'Courier, monospace',
      fontSize: '9px',
      color: BOUNTY_MARKER_COLOR,
      stroke: '#2b1b0e',
      strokeThickness: 3,
      align: 'center',
    });
    this.bountyMarkerText.setOrigin(0.5, 0.5);
    this.bountyMarkerText.setVisible(false);

    this.crownMarkerText = scene.add.text(0, CROWN_MARKER_OFFSET_Y, '[ CROWN ]', {
      fontFamily: 'Courier, monospace',
      fontSize: '9px',
      color: CROWN_MARKER_COLOR,
      stroke: '#2b1b0e',
      strokeThickness: 3,
      align: 'center',
    });
    this.crownMarkerText.setOrigin(0.5, 0.5);
    this.crownMarkerText.setVisible(false);

    this.teammateMarkerText = scene.add.text(0, TEAMMATE_MARKER_OFFSET_Y, '[ ALLY ]', {
      fontFamily: 'Courier, monospace',
      fontSize: '9px',
      color: TEAMMATE_MARKER_COLOR,
      stroke: '#153027',
      strokeThickness: 3,
      align: 'center',
    });
    this.teammateMarkerText.setOrigin(0.5, 0.5).setVisible(false);

    const children: Phaser.GameObjects.GameObject[] = [];
    // Mist sits under the body so the sprite paints over the puddle's center.
    if (this.frostMistGraphics) children.push(this.frostMistGraphics);
    children.push(this.sprite);
    if (this.gunSprite) children.push(this.gunSprite);
    if (this.bodyOverlaySprite) children.push(this.bodyOverlaySprite);
    children.push(this.batSprite);
    if (this.wandGraphics) children.push(this.wandGraphics);
    if (this.frozenCrystalGraphics) children.push(this.frozenCrystalGraphics);
    children.push(
      this.healthBarBg,
      this.healthBarFg,
      this.armorBarBg,
      this.armorBarFg,
      this.nicknameText,
      this.bountyMarkerText,
      this.crownMarkerText,
      this.teammateMarkerText,
    );
    this.container = scene.add.container(0, 0, children);
    // The fighter container owns its objective/social markers and particles;
    // the whole hierarchy is explicitly world-space.
    declareWorldSpace(this.container);
    // Position the wand for the initial 'down' direction.
    if (this.wandGraphics) this.applyWandTransform('down');
  }

  update(state: PlayerState): void {
    this.setPosition(state.position.x, state.position.y);
    this.setAimAngle(state.aimAngle);
    this.setWeapon(state.weaponId);
    this.updateHealthBar(state.health, state.maxHealth, state.armor);
    this.nicknameText.setText(state.nickname);
    this.updateLifeState(state.isDead);

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
        this.bodyOverlaySprite?.setTint(FROZEN_TARGET_TINT);
      } else if (this.characterId === 'frost_wizard') {
        this.applyFrostWizardTint();
      } else {
        this.sprite.clearTint();
        this.bodyOverlaySprite?.clearTint();
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
    this.lastAimAngle = angle;
    if (!this.batSwingTween) this.batSprite.setRotation(batHeldRotation(angle));
    this.deathDirection = deathDirectionForAim(angle);
    const direction = bucketAimAngle(angle);
    if (direction !== this.currentDirection) {
      this.currentDirection = direction;
      if (!this.isDead) {
        this.playCurrentAnim();
        if (this.gunSprite) this.playCurrentGunAnim();
        if (this.wandGraphics) this.applyWandTransform(direction);
      }
    }
  }

  /**
   * Swap the held-weapon overlay when the server says the equipped weapon
   * changed (shotgun picked up / spent, Gun Game rung advance). Cancels any
   * in-flight shoot/rack chain so we never play a shotgun anim with rifle
   * sheets or vice versa. Fists have no overlay art — the punch is a
   * body-level attack anim — so 'punch' hides the gun sprite entirely.
   */
  setWeapon(weaponId: WeaponId): void {
    if (weaponId === this.currentWeaponId) return;
    this.currentWeaponId = weaponId;
    this.batSwingTween?.stop();
    this.batSwingTween = null;
    this.batSprite.setRotation(batHeldRotation(this.lastAimAngle));
    this.batSprite.setVisible(!this.isDead && weaponId === 'bat');
    this.wandGraphics?.setVisible(!this.isDead && weaponId !== 'bat');
    this.gunShootTimer?.remove(false);
    this.gunShootTimer = null;
    this.currentGunState = 'hold';
    if (!this.gunSprite) return;
    if (this.isDead) {
      this.gunSprite.setVisible(false);
      return;
    }
    const rendersOverlay = weaponRendersOverlay(weaponId);
    this.gunSprite.setVisible(rendersOverlay);
    if (rendersOverlay) {
      this.playCurrentGunAnim();
    }
  }

  /**
   * Trigger the weapon's 3-frame shoot animation. Routed from
   * GameScene.onBulletTrail by shooterId. Each new shot restarts the
   * shoot anim (no stacking). The rifle and pistol revert straight to the
   * looping hold anim; the shotgun chains its pump-racking anim first,
   * filling the server's 0.6 s fire cooldown. No-op for characters without
   * a rendered gun and while fists are equipped (punches never produce
   * bullet trails, but guard anyway).
   */
  playShootAnimation(): void {
    if (this.isDead || !this.gunSprite || !weaponRendersOverlay(this.currentWeaponId)) return;
    this.currentGunState = 'shoot';
    this.playCurrentGunAnim();
    this.gunShootTimer?.remove(false);
    this.gunShootTimer = this.scene.time.delayedCall(GUN_SHOOT_DURATION_MS, () => {
      if (this.currentWeaponId === 'shotgun') {
        this.currentGunState = 'racking';
        this.playCurrentGunAnim();
        this.gunShootTimer = this.scene.time.delayedCall(SHOTGUN_RACK_DURATION_MS, () => {
          this.currentGunState = 'hold';
          this.playCurrentGunAnim();
          this.gunShootTimer = null;
        });
      } else {
        this.currentGunState = 'hold';
        this.playCurrentGunAnim();
        this.gunShootTimer = null;
      }
    });
  }

  /**
   * Play the character's one-shot punch swing on the body sprite (unlike
   * gun overlays, attacks are body-level states — the sheets redraw the
   * whole character). Routed from GameScene's punchSwung handler for local
   * AND remote players. The swing owns the body anim for
   * ATTACK_SWING_DURATION_MS, then the idle/run loop resumes; the timer
   * always fires, so a death mid-swing can't strand the sprite on the last
   * attack frame (the container is hidden while dead anyway), and respawn
   * force-ends any leftover swing via playRespawnAnimation.
   */
  playAttackAnimation(): void {
    if (this.isDead) return;
    this.attackTimer?.remove(false);
    this.isAttacking = true;
    // ignoreIfPlaying = false: a rapid re-swing restarts the animation.
    this.sprite.play(this.attackKey(this.currentDirection), false);
    if (this.bodyOverlaySprite) {
      this.bodyOverlaySprite.play(this.bodyOverlayAttackKey(this.currentDirection), false);
      this.applyBodyOverlayTransform(this.currentDirection, 'attack');
    }
    this.attackTimer = this.scene.time.delayedCall(ATTACK_SWING_DURATION_MS, () => {
      this.attackTimer = null;
      this.isAttacking = false;
      this.playCurrentAnim();
    });
  }

  /** Sweep the held bat around the server-authored aim direction. */
  playMeleeSwing(weaponId: 'punch' | 'bat', aimAngle: number): void {
    if (weaponId !== 'bat' || this.isDead || this.currentWeaponId !== 'bat') return;
    const swing = batSwingRotations(aimAngle);
    this.batSwingTween?.stop();
    this.batSprite.setRotation(swing.from);
    this.batSwingTween = this.scene.tweens.add({
      targets: this.batSprite,
      rotation: swing.to,
      duration: BAT_SWING_DURATION_MS,
      ease: 'Quad.easeInOut',
      onComplete: () => {
        this.batSwingTween = null;
        this.batSprite.setRotation(batHeldRotation(this.lastAimAngle));
      },
    });
  }

  /** Cancel an in-flight punch swing and restore the idle/run loop. */
  private endAttackAnimation(): void {
    this.attackTimer?.remove(false);
    this.attackTimer = null;
    if (this.isAttacking) {
      this.isAttacking = false;
      this.playCurrentAnim();
    }
  }

  /**
   * Swap the body sheets to the alt-body set (Jack's no-axe body) and
   * back. Driven per-frame from ClientPlayerManager off the broadcast
   * abilityCooldownSeconds — the axe is axeless exactly while it's in
   * flight or regrowing, for local AND remote players alike. No-op for
   * characters without a CharacterDef.altBody. Attack anims played while
   * axeless resolve to the alt prefix too (see attackKey).
   */
  setAxeless(axeless: boolean): void {
    if (!this.altBodyPrefix || axeless === this.isAxeless) return;
    this.isAxeless = axeless;
    if (this.isDead) return;
    // Re-resolve the current body anim under the new prefix (the key
    // changes, so play() actually restarts even with ignoreIfPlaying).
    this.playCurrentAnim();
  }

  /** Whether this character renders a held gun (and matching muzzle flash). */
  rendersGun(): boolean {
    return this.gunSprite !== null;
  }

  /**
   * The character this renderer was constructed for. Everything visual
   * (sheets, tint, wand, gun overlay) is fixed at construction, so a
   * state whose characterId differs means the renderer must be rebuilt —
   * ClientPlayerManager checks this every update.
   */
  getCharacterId(): CharacterId {
    return this.characterId;
  }

  /**
   * Toggle the big_heads render scale. Scales only the body/weapon art —
   * the health bar and nickname stay put, and the matching hitbox scale
   * lives server-side (hit validation) plus the aim-line preview.
   */
  setBigHeads(active: boolean): void {
    const multiplier = active ? MUTATORS.BIG_HEADS_RENDER_SCALE : 1;
    if (multiplier === this.renderScaleMultiplier) return;
    this.renderScaleMultiplier = multiplier;
    const scale = SPRITE_SCALE * multiplier;
    this.sprite.setScale(scale);
    this.gunSprite?.setScale(scale);
    this.batSprite.setScale(scale);
    this.bodyOverlaySprite?.setScale(scale);
    this.wandGraphics?.setScale(scale);
    this.applyCurrentBodyOverlayTransform();
  }

  updateHealthBar(health: number, maxHealth: number, armor: number = 0): void {
    const ratio = Math.max(0, Math.min(1, health / maxHealth));
    const width = HEALTH_BAR_WIDTH * ratio;
    this.healthBarFg.setSize(width, HEALTH_BAR_HEIGHT);
    this.healthBarFg.setX(-(HEALTH_BAR_WIDTH - width) / 2);
    this.healthBarFg.setFillStyle(healthColor(ratio));
    const shield = armorPresentation(health, armor);
    const armorWidth = HEALTH_BAR_WIDTH * shield.ratio;
    this.hasArmor = shield.visible;
    this.armorBarBg.setVisible(shield.visible && !this.isDead);
    this.armorBarFg
      .setVisible(shield.visible && !this.isDead)
      .setSize(armorWidth, ARMOR_BAR_HEIGHT)
      .setX(-(HEALTH_BAR_WIDTH - armorWidth) / 2);
  }

  /**
   * Apply an authoritative alive/dead edge exactly once. Deaths play their
   * character sheet and hold the final corpse frame for the respawn window;
   * repeated snapshots cannot restart or hide the animation.
   */
  updateLifeState(dead: boolean, deathCount = 1): void {
    if (dead === this.isDead) return;
    this.isDead = dead;
    if (dead) {
      this.currentDeathPrefix = deathVariantPrefix(this.characterDef, this.isAxeless, deathCount);
      this.playDeathAnimation();
    } else {
      this.playRespawnAnimation();
    }
  }

  private playDeathAnimation(): void {
    this.endAttackAnimation();
    this.gunShootTimer?.remove(false);
    this.gunShootTimer = null;
    this.currentGunState = 'hold';
    this.setInvulnerable(false);
    this.setSprintEffect(false);
    this.container.setVisible(true);
    this.container.setAlpha(1);
    this.setAliveVisualsVisible(false);
    this.sprite.play(this.deathKey(), false);
    if (this.bodyOverlaySprite) {
      this.bodyOverlaySprite.play(this.bodyOverlayDeathKey(), false);
      this.applyBodyOverlayTransform(this.deathDirection, 'death');
    }
  }

  private playRespawnAnimation(): void {
    // A death mid-swing must not carry the attack state into the new life.
    this.endAttackAnimation();
    this.container.setVisible(true);
    this.container.setAlpha(1);
    this.setAliveVisualsVisible(true);
    if (this.characterId === 'frost_wizard') {
      this.applyFrostWizardTint();
    } else {
      this.sprite.clearTint();
      this.bodyOverlaySprite?.clearTint();
    }
    this.applyWandTransform(this.currentDirection);
    this.playCurrentAnim();
    this.playCurrentGunAnim();
  }

  private setAliveVisualsVisible(alive: boolean): void {
    this.gunSprite?.setVisible(alive && weaponRendersOverlay(this.currentWeaponId));
    this.batSprite.setVisible(alive && this.currentWeaponId === 'bat');
    this.wandGraphics?.setVisible(alive && this.currentWeaponId !== 'bat');
    this.frostMistGraphics?.setVisible(alive);
    if (!alive) this.frozenCrystalGraphics?.setVisible(false);
    this.healthBarBg.setVisible(alive);
    this.healthBarFg.setVisible(alive);
    this.armorBarBg.setVisible(alive && this.hasArmor);
    this.armorBarFg.setVisible(alive && this.hasArmor);
    this.nicknameText.setVisible(alive);
    this.bountyMarkerText.setVisible(alive && this.bountyMarked);
    this.crownMarkerText.setVisible(alive && this.crownMarked);
    this.teammateMarkerText.setVisible(alive && this.teammateMarked);
  }

  /** Mint world marker for the local player's server-authored teammate. */
  setTeammateMarked(active: boolean): void {
    this.teammateMarked = active;
    this.teammateMarkerText.setVisible(active && !this.isDead);
  }

  /** Gold, pulsing world marker driven by the authoritative Bounty Hunt id. */
  setBountyMarked(active: boolean): void {
    this.bountyMarked = active;
    this.bountyMarkerText.setVisible(active && !this.isDead);
    if (active) {
      const pulse = 1 + Math.sin(this.scene.time.now * 0.008) * 0.08;
      this.bountyMarkerText.setScale(pulse);
      this.bountyMarkerText.setAlpha(0.82 + Math.sin(this.scene.time.now * 0.012) * 0.18);
    } else {
      this.bountyMarkerText.setScale(1).setAlpha(1);
    }
  }

  /** Crown marker is social-only and driven by the rematch-chain match payload. */
  setCrownMarked(wins: number | null): void {
    this.crownMarked = wins !== null;
    this.crownMarkerText.setText(wins !== null && wins > 1 ? `[ CROWN x${wins} ]` : '[ CROWN ]');
    this.crownMarkerText.setVisible(this.crownMarked && !this.isDead);
    if (this.crownMarked) {
      const pulse = 1 + Math.sin(this.scene.time.now * 0.006) * 0.06;
      this.crownMarkerText.setScale(pulse);
    } else {
      this.crownMarkerText.setScale(1);
    }
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
      declareWorldSpace(this.sprintParticles);
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
    this.attackTimer?.remove(false);
    this.attackTimer = null;
    this.batSwingTween?.stop();
    this.batSwingTween = null;
    // Container.destroy disposes children, so wand/mist/crystal graphics
    // are torn down with the container — no extra cleanup needed.
    this.container.destroy();
  }

  private playCurrentAnim(): void {
    if (this.isDead) return;
    // While a punch swing plays, the body stays on the attack anim:
    // idle↔run flips resolve to the same attack key (ignored below), and a
    // direction change resolves to a different attack key so the swing
    // re-plays in the new facing instead of snapping back to idle.
    const key = this.isAttacking
      ? this.attackKey(this.currentDirection)
      : this.animKey(this.currentDirection, this.currentAnimState);
    // ignoreIfPlaying = true means re-calling with the same key is a no-op.
    this.sprite.play(key, true);
    if (this.bodyOverlaySprite) {
      const overlayKey = this.isAttacking
        ? this.bodyOverlayAttackKey(this.currentDirection)
        : this.bodyOverlayAnimKey(this.currentDirection, this.currentAnimState);
      this.bodyOverlaySprite.play(overlayKey, true);
      this.applyBodyOverlayTransform(
        this.currentDirection,
        this.isAttacking ? 'attack' : this.currentAnimState,
      );
    }
  }

  private playCurrentGunAnim(): void {
    if (this.isDead || !this.gunSprite || !weaponRendersOverlay(this.currentWeaponId)) return;
    const key = this.gunKey(this.currentDirection, this.currentGunState);
    // ignoreIfPlaying = false: shooting again restarts the shoot anim.
    this.gunSprite.play(key, this.currentGunState === 'hold');
  }

  /** Body anim prefix — the alt-body set while axeless, base otherwise. */
  private bodyPrefix(): string {
    return this.isAxeless && this.altBodyPrefix !== null ? this.altBodyPrefix : this.texturePrefix;
  }

  private animKey(direction: Direction4, state: AnimState): string {
    return `${this.bodyPrefix()}_${direction}_${state}`;
  }

  private attackKey(direction: Direction4): string {
    return `${this.bodyPrefix()}_${direction}_attack`;
  }

  private deathKey(): string {
    return `${this.currentDeathPrefix}_${this.deathDirection}_death`;
  }

  private bodyOverlayAnimKey(direction: Direction4, state: AnimState): string {
    return `${this.characterDef.bodyOverlay!.spritePrefix}_${direction}_${state}`;
  }

  private bodyOverlayAttackKey(direction: Direction4): string {
    return `${this.characterDef.bodyOverlay!.spritePrefix}_${direction}_attack`;
  }

  private bodyOverlayDeathKey(): string {
    return `${this.characterDef.bodyOverlay!.spritePrefix}_${this.deathDirection}_death`;
  }

  /** Top-align a tightly cropped overlay frame with its body frame. */
  private applyBodyOverlayTransform(
    direction: Direction4,
    state: AnimState | 'attack' | 'death',
  ): void {
    const overlay = this.characterDef.bodyOverlay;
    if (!overlay || !this.bodyOverlaySprite) return;

    const bodyHeight =
      state === 'death'
        ? this.characterDef.deathFrames[direction as DeathDirection].h
        : state === 'attack'
          ? this.characterDef.attackFrames[direction].h
          : state === 'run'
            ? this.characterDef.runFrames[direction].h
            : this.characterDef.idleFrames[direction].h;
    const overlayHeight =
      state === 'death'
        ? overlay.deathFrames[direction as DeathDirection].h
        : state === 'attack'
          ? overlay.attackFrames[direction].h
          : state === 'run'
            ? overlay.runFrames[direction].h
            : overlay.idleFrames[direction].h;
    const scale = SPRITE_SCALE * this.renderScaleMultiplier;
    this.bodyOverlaySprite.setPosition(0, ((overlayHeight - bodyHeight) / 2) * scale);
  }

  private applyCurrentBodyOverlayTransform(): void {
    if (this.isDead) {
      this.applyBodyOverlayTransform(this.deathDirection, 'death');
      return;
    }
    this.applyBodyOverlayTransform(
      this.currentDirection,
      this.isAttacking ? 'attack' : this.currentAnimState,
    );
  }

  private gunKey(direction: Direction4, state: GunOverlayState): string {
    return weaponOverlayKey(this.currentWeaponId, direction, state);
  }
}
