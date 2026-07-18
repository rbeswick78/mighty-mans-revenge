import Phaser from 'phaser';
import type { RawInput } from './types.js';
import { isTouchDevice } from './is-touch-device.js';
import { Wasteland, cssHex } from '@shared/config/palette.js';
import { TOUCH_ACTION_TOP_PX } from '../ui/layout.js';
import {
  type GameplayCoordinateSpace,
  placeOnScreen,
  screenPoint,
} from '../rendering/gameplay-coordinate-space.js';
import {
  TAUNT_BUTTON_LABEL,
  abilityButtonLabel,
  grenadeButtonLabel,
  type TouchAbilityState,
} from './touch-action-presentation.js';
import type { ResponsiveCombatHudLayout } from '../ui/responsive-combat-hud.js';

const JOYSTICK_MAX_RADIUS = 50;
const DEAD_ZONE_RATIO = 0.15;
const DEAD_ZONE = JOYSTICK_MAX_RADIUS * DEAD_ZONE_RATIO;
const BASE_ALPHA = 0.3;
const THUMB_ALPHA = 0.5;
const BASE_RADIUS = 50;
const THUMB_RADIUS = 24;
const GRENADE_BUTTON_SIZE = 40;
const GRENADE_BUTTON_MARGIN = 16;
const ABILITY_BUTTON_SIZE = 40;
const TAUNT_BUTTON_SIZE = 40;
const RELOAD_BUTTON_SIZE = 40;
const TAUNT_BUTTON_GAP = 16;
/** Vertical gap between the grenade button (above) and the ability button. */
const ABILITY_BUTTON_GAP = 12;

const GRENADE_AIM_COLOR = Wasteland.GRENADE_AIM;
const GRENADE_DETONATE_COLOR = Wasteland.GRENADE_DETONATE;
const GRENADE_AIM_ALPHA = 0.5;
const GRENADE_DETONATE_ALPHA = 0.85;
/** Cyan-ish ready color for the ability button (matches the x-ray VFX hue). */
const ABILITY_READY_COLOR = 0x4ad8e8;
const ABILITY_DIM_COLOR = 0x55667a;
const ABILITY_BUTTON_ALPHA = 0.55;

const ACTION_BUTTON_TEXT_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: 'Courier, monospace',
  fontSize: '11px',
  color: cssHex(Wasteland.TEXT_PRIMARY),
  fontStyle: 'bold',
  align: 'center',
  stroke: '#000000',
  strokeThickness: 2,
  lineSpacing: -2,
};

interface VirtualJoystick {
  active: boolean;
  pointerId: number;
  originX: number;
  originY: number;
  currentX: number;
  currentY: number;
  baseCircle: Phaser.GameObjects.Arc;
  thumbCircle: Phaser.GameObjects.Arc;
  /** Last aim angle while the joystick was pulled out of the dead zone. */
  lastAimAngle: number;
  /** Whether the joystick was outside the dead zone in the previous sample. */
  wasOutOfDeadZone: boolean;
}

export class TouchInput {
  private scene: Phaser.Scene;
  private leftJoystick: VirtualJoystick;
  private rightJoystick: VirtualJoystick;
  private grenadeButton: Phaser.GameObjects.Arc;
  private grenadeButtonText: Phaser.GameObjects.Text;
  private grenadeButtonDown = false;
  /** Set on the frame the grenade button is pressed; cleared on read. */
  private grenadeButtonPressedFlag = false;
  /** Set on the frame the grenade button is released; cleared on read. */
  private grenadeButtonReleasedFlag = false;
  /** True if a live grenade existed at the moment the button was pressed. */
  private grenadeButtonPressedWhileLive = false;
  /** Character ability button (spacebar equivalent) — sits below the grenade button. */
  private abilityButton: Phaser.GameObjects.Arc;
  private abilityButtonText: Phaser.GameObjects.Text;
  /** Set on the frame the ability button is pressed; cleared on read. */
  private abilityButtonPressedFlag = false;
  /** Presentation-only battle cry button, kept available in every mode. */
  private tauntButton: Phaser.GameObjects.Arc;
  private tauntButtonText: Phaser.GameObjects.Text;
  private tauntButtonPressedFlag = false;
  /** Battle Royale-only contextual reload/swap action. */
  private reloadButton: Phaser.GameObjects.Arc;
  private reloadButtonText: Phaser.GameObjects.Text;
  private reloadButtonPressedFlag = false;
  private battleRoyaleReloadContext = false;
  /** False when the current mode disables grenades and character abilities. */
  private secondaryActionsEnabled = true;
  /** Visible during COUNTDOWN, but unable to buffer combat input until FIGHT. */
  private gameplayEnabled = false;
  /** Set on the frame the right joystick is released or dropped into deadzone. */
  private rightStickReleasedFlag = false;
  private sprintActive = false;
  private readonly isTouch: boolean;
  private actionLayout: ResponsiveCombatHudLayout['touchActions'] | null = null;

  constructor(
    scene: Phaser.Scene,
    private readonly coordinates: GameplayCoordinateSpace,
    secondaryActionsEnabled = true,
    actionLayout?: ResponsiveCombatHudLayout['touchActions'],
  ) {
    this.scene = scene;
    this.isTouch = isTouchDevice();
    this.secondaryActionsEnabled = secondaryActionsEnabled;

    scene.input.addPointer(2);

    this.leftJoystick = this.createJoystick();
    this.rightJoystick = this.createJoystick();

    const { width } = scene.scale;
    const btnX = width - GRENADE_BUTTON_MARGIN - GRENADE_BUTTON_SIZE;
    const btnY = TOUCH_ACTION_TOP_PX + GRENADE_BUTTON_SIZE;

    this.grenadeButton = scene.add.circle(
      btnX,
      btnY,
      GRENADE_BUTTON_SIZE,
      GRENADE_AIM_COLOR,
      GRENADE_AIM_ALPHA,
    );
    placeOnScreen(this.grenadeButton, screenPoint(btnX, btnY));
    this.grenadeButton.setDepth(3000);
    this.grenadeButton.setVisible(false);

    this.grenadeButtonText = scene.add.text(
      btnX,
      btnY,
      grenadeButtonLabel(false),
      ACTION_BUTTON_TEXT_STYLE,
    );
    this.grenadeButtonText.setOrigin(0.5, 0.5);
    placeOnScreen(this.grenadeButtonText, screenPoint(btnX, btnY));
    this.grenadeButtonText.setDepth(3001);
    this.grenadeButtonText.setVisible(false);

    this.grenadeButton.on('pointerdown', () => {
      if (!this.gameplayEnabled) return;
      if (!this.grenadeButtonDown) this.grenadeButtonPressedFlag = true;
      this.grenadeButtonDown = true;
    });
    this.grenadeButton.on('pointerup', () => {
      if (!this.gameplayEnabled) return;
      if (this.grenadeButtonDown) this.grenadeButtonReleasedFlag = true;
      this.grenadeButtonDown = false;
    });
    this.grenadeButton.on('pointerout', () => {
      if (!this.gameplayEnabled) return;
      // If the touch slides off the button, treat it as a release so we don't
      // get stuck in aim mode.
      if (this.grenadeButtonDown) this.grenadeButtonReleasedFlag = true;
      this.grenadeButtonDown = false;
    });

    // Ability button — sits directly below the grenade button.
    const abilityX = btnX;
    const abilityY = btnY + GRENADE_BUTTON_SIZE + ABILITY_BUTTON_GAP + ABILITY_BUTTON_SIZE;

    this.abilityButton = scene.add.circle(
      abilityX,
      abilityY,
      ABILITY_BUTTON_SIZE,
      ABILITY_READY_COLOR,
      ABILITY_BUTTON_ALPHA,
    );
    placeOnScreen(this.abilityButton, screenPoint(abilityX, abilityY));
    this.abilityButton.setDepth(3000);
    this.abilityButton.setVisible(false);

    this.abilityButtonText = scene.add.text(
      abilityX,
      abilityY,
      abilityButtonLabel('ready'),
      ACTION_BUTTON_TEXT_STYLE,
    );
    this.abilityButtonText.setOrigin(0.5, 0.5);
    placeOnScreen(this.abilityButtonText, screenPoint(abilityX, abilityY));
    this.abilityButtonText.setDepth(3001);
    this.abilityButtonText.setVisible(false);

    this.abilityButton.on('pointerdown', () => {
      if (!this.gameplayEnabled) return;
      this.abilityButtonPressedFlag = true;
    });

    // A smaller third button beside the combat cluster stays clear of the
    // right virtual stick's usual lower-right thumb area.
    const tauntX = btnX - GRENADE_BUTTON_SIZE - TAUNT_BUTTON_GAP - TAUNT_BUTTON_SIZE;
    const tauntY = btnY;
    this.tauntButton = scene.add.circle(
      tauntX,
      tauntY,
      TAUNT_BUTTON_SIZE,
      Wasteland.TEXT_LOADING,
      0.65,
    );
    placeOnScreen(this.tauntButton, screenPoint(tauntX, tauntY));
    this.tauntButton.setDepth(3000).setVisible(false);

    this.tauntButtonText = scene.add.text(
      tauntX,
      tauntY,
      TAUNT_BUTTON_LABEL,
      ACTION_BUTTON_TEXT_STYLE,
    );
    this.tauntButtonText.setOrigin(0.5).setDepth(3001).setVisible(false);
    placeOnScreen(this.tauntButtonText, screenPoint(tauntX, tauntY));
    this.tauntButton.on('pointerdown', () => {
      if (!this.gameplayEnabled) return;
      this.tauntButtonPressedFlag = true;
    });

    const reloadX = tauntX;
    const reloadY = abilityY;
    this.reloadButton = scene.add.circle(
      reloadX,
      reloadY,
      RELOAD_BUTTON_SIZE,
      Wasteland.TEXT_LOADING,
      0.65,
    );
    placeOnScreen(this.reloadButton, screenPoint(reloadX, reloadY));
    this.reloadButton.setDepth(3000).setVisible(false);
    this.reloadButtonText = scene.add.text(reloadX, reloadY, 'RELOAD', ACTION_BUTTON_TEXT_STYLE);
    this.reloadButtonText.setOrigin(0.5).setDepth(3001).setVisible(false);
    placeOnScreen(this.reloadButtonText, screenPoint(reloadX, reloadY));
    this.reloadButton.on('pointerdown', () => {
      if (!this.gameplayEnabled || !this.battleRoyaleReloadContext) return;
      this.reloadButtonPressedFlag = true;
    });

    if (actionLayout) this.setLayout(actionLayout);

    scene.input.on('pointerdown', this.onPointerDown, this);
    scene.input.on('pointermove', this.onPointerMove, this);
    scene.input.on('pointerup', this.onPointerUp, this);

    // Show the action cluster during COUNTDOWN instead of waiting for the
    // player's first gameplay touch. The pre-fight control card explains the
    // named buttons, and the larger taunt target now clears a 40px canvas-space
    // radius like the other actions. Dynamic joysticks still appear only where
    // the player places their thumbs.
    if (this.isTouch) this.showTouchUI();
  }

  setLayout(layout: ResponsiveCombatHudLayout['touchActions']): void {
    this.actionLayout = layout;
    this.tauntButton.setPosition(layout.taunt.x, layout.taunt.y);
    this.tauntButtonText.setPosition(layout.taunt.x, layout.taunt.y);
    this.grenadeButton.setPosition(layout.grenade.x, layout.grenade.y);
    this.grenadeButtonText.setPosition(layout.grenade.x, layout.grenade.y);
    this.abilityButton.setPosition(layout.ability.x, layout.ability.y);
    this.abilityButtonText.setPosition(layout.ability.x, layout.ability.y);
    this.reloadButton.setPosition(layout.reload.x, layout.reload.y);
    this.reloadButtonText.setPosition(layout.reload.x, layout.reload.y);
  }

  getLayoutState(): ResponsiveCombatHudLayout['touchActions'] | null {
    return this.actionLayout;
  }

  private showTouchUI(): void {
    if (!this.tauntButton.visible) {
      this.tauntButton.setVisible(true).setInteractive();
      this.tauntButtonText.setVisible(true);
    }
    this.syncReloadButtonVisibility();
    if (this.grenadeButton.visible) return;
    if (this.secondaryActionsEnabled) {
      this.grenadeButton.setVisible(true);
      this.grenadeButtonText.setVisible(true);
      this.grenadeButton.setInteractive();
      this.abilityButton.setVisible(true);
      this.abilityButtonText.setVisible(true);
      this.abilityButton.setInteractive();
    }
  }

  /** Keep the contextual action absent from every established format. */
  setBattleRoyaleReloadContext(enabled: boolean): void {
    this.battleRoyaleReloadContext = enabled;
    if (!enabled) this.reloadButtonPressedFlag = false;
    this.syncReloadButtonVisibility();
  }

  private syncReloadButtonVisibility(): void {
    const visible = this.isTouch && this.battleRoyaleReloadContext;
    this.reloadButton.setVisible(visible);
    this.reloadButtonText.setVisible(visible);
    if (visible) this.reloadButton.setInteractive();
    else this.reloadButton.disableInteractive();
  }

  setSecondaryActionsEnabled(enabled: boolean): void {
    if (this.secondaryActionsEnabled === enabled) return;
    this.secondaryActionsEnabled = enabled;
    if (enabled) return;

    this.grenadeButtonDown = false;
    this.grenadeButtonPressedFlag = false;
    this.grenadeButtonReleasedFlag = false;
    this.grenadeButtonPressedWhileLive = false;
    this.abilityButtonPressedFlag = false;
    this.grenadeButton.setVisible(false).disableInteractive();
    this.grenadeButtonText.setVisible(false);
    this.abilityButton.setVisible(false).disableInteractive();
    this.abilityButtonText.setVisible(false);
  }

  setGameplayEnabled(enabled: boolean): void {
    this.gameplayEnabled = enabled;
    if (enabled) return;

    this.grenadeButtonDown = false;
    this.grenadeButtonPressedFlag = false;
    this.grenadeButtonReleasedFlag = false;
    this.grenadeButtonPressedWhileLive = false;
    this.abilityButtonPressedFlag = false;
    this.tauntButtonPressedFlag = false;
    this.reloadButtonPressedFlag = false;
    this.rightStickReleasedFlag = false;
    this.sprintActive = false;
    this.deactivateJoystick(this.leftJoystick);
    this.deactivateJoystick(this.rightJoystick);
  }

  private createJoystick(): VirtualJoystick {
    const base = this.scene.add.circle(0, 0, BASE_RADIUS, Wasteland.JOYSTICK, BASE_ALPHA);
    placeOnScreen(base, screenPoint(0, 0));
    base.setDepth(3000);
    base.setVisible(false);

    const thumb = this.scene.add.circle(0, 0, THUMB_RADIUS, Wasteland.JOYSTICK, THUMB_ALPHA);
    placeOnScreen(thumb, screenPoint(0, 0));
    thumb.setDepth(3001);
    thumb.setVisible(false);

    return {
      active: false,
      pointerId: -1,
      originX: 0,
      originY: 0,
      currentX: 0,
      currentY: 0,
      baseCircle: base,
      thumbCircle: thumb,
      lastAimAngle: 0,
      wasOutOfDeadZone: false,
    };
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    if (!this.isTouch) return;
    if (!this.gameplayEnabled) return;
    if (!this.coordinates.containsWorldYAtScreenPoint(screenPoint(pointer.x, pointer.y))) return;

    this.showTouchUI();

    const halfWidth = this.scene.scale.width / 2;

    if (pointer.x < halfWidth && !this.leftJoystick.active) {
      this.activateJoystick(this.leftJoystick, pointer);
    } else if (pointer.x >= halfWidth && !this.rightJoystick.active) {
      this.activateJoystick(this.rightJoystick, pointer);
    }
  }

  private activateJoystick(joystick: VirtualJoystick, pointer: Phaser.Input.Pointer): void {
    joystick.active = true;
    joystick.pointerId = pointer.id;
    joystick.originX = pointer.x;
    joystick.originY = pointer.y;
    joystick.currentX = pointer.x;
    joystick.currentY = pointer.y;
    joystick.wasOutOfDeadZone = false;

    joystick.baseCircle.setPosition(pointer.x, pointer.y);
    joystick.thumbCircle.setPosition(pointer.x, pointer.y);
    joystick.baseCircle.setVisible(true);
    joystick.thumbCircle.setVisible(true);
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    this.updateJoystickIfMatches(this.leftJoystick, pointer);
    this.updateJoystickIfMatches(this.rightJoystick, pointer);
  }

  private updateJoystickIfMatches(joystick: VirtualJoystick, pointer: Phaser.Input.Pointer): void {
    if (!joystick.active || joystick.pointerId !== pointer.id) return;

    const dx = pointer.x - joystick.originX;
    const dy = pointer.y - joystick.originY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    let clampedX = dx;
    let clampedY = dy;

    if (dist > JOYSTICK_MAX_RADIUS) {
      clampedX = (dx / dist) * JOYSTICK_MAX_RADIUS;
      clampedY = (dy / dist) * JOYSTICK_MAX_RADIUS;
    }

    joystick.currentX = joystick.originX + clampedX;
    joystick.currentY = joystick.originY + clampedY;
    joystick.thumbCircle.setPosition(joystick.currentX, joystick.currentY);

    if (joystick === this.leftJoystick) {
      this.sprintActive = dist >= JOYSTICK_MAX_RADIUS * 0.95;
    }
  }

  private onPointerUp(pointer: Phaser.Input.Pointer): void {
    if (this.leftJoystick.active && this.leftJoystick.pointerId === pointer.id) {
      this.deactivateJoystick(this.leftJoystick);
      this.sprintActive = false;
    }
    if (this.rightJoystick.active && this.rightJoystick.pointerId === pointer.id) {
      // Releasing the stick fires the burst (if it was outside the dead zone).
      if (this.rightJoystick.wasOutOfDeadZone) {
        this.rightStickReleasedFlag = true;
      }
      this.deactivateJoystick(this.rightJoystick);
    }
  }

  private deactivateJoystick(joystick: VirtualJoystick): void {
    joystick.active = false;
    joystick.pointerId = -1;
    joystick.wasOutOfDeadZone = false;
    joystick.baseCircle.setVisible(false);
    joystick.thumbCircle.setVisible(false);
  }

  private getJoystickVector(joystick: VirtualJoystick): { x: number; y: number } {
    if (!joystick.active) return { x: 0, y: 0 };

    const dx = joystick.currentX - joystick.originX;
    const dy = joystick.currentY - joystick.originY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < DEAD_ZONE) return { x: 0, y: 0 };

    const effectiveDist = (dist - DEAD_ZONE) / (JOYSTICK_MAX_RADIUS - DEAD_ZONE);
    const clampedDist = Math.min(1, effectiveDist);
    const angle = Math.atan2(dy, dx);

    return {
      x: Math.cos(angle) * clampedDist,
      y: Math.sin(angle) * clampedDist,
    };
  }

  /** Re-color the grenade button based on detonate vs aim mode. */
  private syncGrenadeButtonAppearance(hasActiveGrenade: boolean): void {
    if (hasActiveGrenade) {
      this.grenadeButton.setFillStyle(GRENADE_DETONATE_COLOR, GRENADE_DETONATE_ALPHA);
      this.grenadeButtonText.setText(grenadeButtonLabel(true));
    } else {
      this.grenadeButton.setFillStyle(GRENADE_AIM_COLOR, GRENADE_AIM_ALPHA);
      this.grenadeButtonText.setText(grenadeButtonLabel(false));
    }
  }

  getInput(hasActiveGrenade: boolean): RawInput {
    this.syncGrenadeButtonAppearance(hasActiveGrenade);

    const moveVec = this.getJoystickVector(this.leftJoystick);
    const aimVec = this.getJoystickVector(this.rightJoystick);

    // Track right-stick aim. While it's outside the dead zone, capture the
    // angle (so the burst fires in that direction on release).
    const rightOutOfDeadZone = aimVec.x !== 0 || aimVec.y !== 0;
    if (rightOutOfDeadZone) {
      this.rightJoystick.lastAimAngle = this.coordinates.screenDirectionAngle(
        screenPoint(aimVec.x, aimVec.y),
      );
      this.rightJoystick.wasOutOfDeadZone = true;
    } else if (this.rightJoystick.wasOutOfDeadZone && this.rightJoystick.active) {
      // The thumb returned inside the dead zone without lifting — treat that
      // as a release so the burst still fires.
      this.rightStickReleasedFlag = true;
      this.rightJoystick.wasOutOfDeadZone = false;
    }

    // Drain edge flags.
    const stickReleased = this.rightStickReleasedFlag;
    this.rightStickReleasedFlag = false;
    const grenadePressed = this.grenadeButtonPressedFlag;
    this.grenadeButtonPressedFlag = false;
    const grenadeReleased = this.grenadeButtonReleasedFlag;
    this.grenadeButtonReleasedFlag = false;

    // On press, remember whether a grenade was already live. The release is
    // only a "throw" if the press started in aim mode.
    if (grenadePressed) {
      this.grenadeButtonPressedWhileLive = hasActiveGrenade;
    }

    const aimingGun = this.rightJoystick.active && rightOutOfDeadZone;
    const firePressed = stickReleased;
    const aimAngle = this.rightJoystick.lastAimAngle;

    const aimingGrenade = this.grenadeButtonDown && !hasActiveGrenade;
    // Throw fires on release only if the press started before any grenade
    // existed (otherwise the press was a detonate, and release does nothing).
    const throwPressed = grenadeReleased && !this.grenadeButtonPressedWhileLive;
    // Detonate fires on press only if a grenade was already live.
    const detonatePressed = grenadePressed && hasActiveGrenade;

    const abilityPressed = this.abilityButtonPressedFlag;
    this.abilityButtonPressedFlag = false;
    const tauntPressed = this.tauntButtonPressedFlag;
    this.tauntButtonPressedFlag = false;
    const reloadPressed = this.reloadButtonPressedFlag;
    this.reloadButtonPressedFlag = false;

    return {
      moveX: moveVec.x,
      moveY: moveVec.y,
      aimAngle,
      aimingGun,
      firePressed,
      aimingGrenade,
      throwPressed,
      detonatePressed,
      sprint: this.sprintActive,
      reload: reloadPressed,
      abilityPressed,
      tauntPressed,
    };
  }

  /**
   * Tint the ability button based on cooldown / active state. Called by the
   * scene each frame from the local player's snapshot. Visible-state only —
   * input still goes through regardless of color so the server has final say.
   */
  setAbilityButtonState(state: TouchAbilityState): void {
    this.abilityButtonText.setText(abilityButtonLabel(state));
    if (state === 'ready') {
      this.abilityButton.setFillStyle(ABILITY_READY_COLOR, ABILITY_BUTTON_ALPHA);
    } else if (state === 'active') {
      this.abilityButton.setFillStyle(ABILITY_READY_COLOR, 0.85);
    } else {
      this.abilityButton.setFillStyle(ABILITY_DIM_COLOR, ABILITY_BUTTON_ALPHA);
    }
  }

  destroy(): void {
    this.scene.input.off('pointerdown', this.onPointerDown, this);
    this.scene.input.off('pointermove', this.onPointerMove, this);
    this.scene.input.off('pointerup', this.onPointerUp, this);

    this.leftJoystick.baseCircle.destroy();
    this.leftJoystick.thumbCircle.destroy();
    this.rightJoystick.baseCircle.destroy();
    this.rightJoystick.thumbCircle.destroy();
    this.grenadeButton.destroy();
    this.grenadeButtonText.destroy();
    this.abilityButton.destroy();
    this.abilityButtonText.destroy();
    this.tauntButton.destroy();
    this.tauntButtonText.destroy();
    this.reloadButton.destroy();
    this.reloadButtonText.destroy();
  }
}
