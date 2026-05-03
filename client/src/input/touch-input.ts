import Phaser from 'phaser';
import type { RawInput } from './types.js';
import { isTouchDevice } from './is-touch-device.js';
import { Wasteland, cssHex } from '@shared/config/palette.js';
import { MAP_HEIGHT_PX } from '../ui/layout.js';

const JOYSTICK_MAX_RADIUS = 50;
const DEAD_ZONE_RATIO = 0.15;
const DEAD_ZONE = JOYSTICK_MAX_RADIUS * DEAD_ZONE_RATIO;
const BASE_ALPHA = 0.3;
const THUMB_ALPHA = 0.5;
const BASE_RADIUS = 50;
const THUMB_RADIUS = 24;
const GRENADE_BUTTON_SIZE = 40;
const GRENADE_BUTTON_MARGIN = 16;

const GRENADE_AIM_COLOR = Wasteland.GRENADE_AIM;
const GRENADE_DETONATE_COLOR = Wasteland.GRENADE_DETONATE;
const GRENADE_AIM_ALPHA = 0.5;
const GRENADE_DETONATE_ALPHA = 0.85;

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
  /** Set on the frame the right joystick is released or dropped into deadzone. */
  private rightStickReleasedFlag = false;
  private sprintActive = false;
  private readonly isTouch: boolean;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.isTouch = isTouchDevice();

    scene.input.addPointer(2);

    this.leftJoystick = this.createJoystick();
    this.rightJoystick = this.createJoystick();

    const { width } = scene.scale;
    const btnX = width - GRENADE_BUTTON_MARGIN - GRENADE_BUTTON_SIZE;
    const btnY = GRENADE_BUTTON_MARGIN + GRENADE_BUTTON_SIZE;

    this.grenadeButton = scene.add.circle(btnX, btnY, GRENADE_BUTTON_SIZE, GRENADE_AIM_COLOR, GRENADE_AIM_ALPHA);
    this.grenadeButton.setScrollFactor(0);
    this.grenadeButton.setDepth(3000);
    this.grenadeButton.setVisible(false);

    this.grenadeButtonText = scene.add.text(btnX, btnY, 'G', {
      fontFamily: 'Courier, monospace',
      fontSize: '18px',
      color: cssHex(Wasteland.TEXT_PRIMARY),
      fontStyle: 'bold',
    });
    this.grenadeButtonText.setOrigin(0.5, 0.5);
    this.grenadeButtonText.setScrollFactor(0);
    this.grenadeButtonText.setDepth(3001);
    this.grenadeButtonText.setVisible(false);

    this.grenadeButton.on('pointerdown', () => {
      if (!this.grenadeButtonDown) this.grenadeButtonPressedFlag = true;
      this.grenadeButtonDown = true;
    });
    this.grenadeButton.on('pointerup', () => {
      if (this.grenadeButtonDown) this.grenadeButtonReleasedFlag = true;
      this.grenadeButtonDown = false;
    });
    this.grenadeButton.on('pointerout', () => {
      // If the touch slides off the button, treat it as a release so we don't
      // get stuck in aim mode.
      if (this.grenadeButtonDown) this.grenadeButtonReleasedFlag = true;
      this.grenadeButtonDown = false;
    });

    scene.input.on('pointerdown', this.onPointerDown, this);
    scene.input.on('pointermove', this.onPointerMove, this);
    scene.input.on('pointerup', this.onPointerUp, this);
  }

  private showTouchUI(): void {
    if (this.grenadeButton.visible) return;
    this.grenadeButton.setVisible(true);
    this.grenadeButtonText.setVisible(true);
    this.grenadeButton.setInteractive();
  }

  private createJoystick(): VirtualJoystick {
    const base = this.scene.add.circle(0, 0, BASE_RADIUS, Wasteland.JOYSTICK, BASE_ALPHA);
    base.setScrollFactor(0);
    base.setDepth(3000);
    base.setVisible(false);

    const thumb = this.scene.add.circle(0, 0, THUMB_RADIUS, Wasteland.JOYSTICK, THUMB_ALPHA);
    thumb.setScrollFactor(0);
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
    if (pointer.y >= MAP_HEIGHT_PX) return;

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

  private updateJoystickIfMatches(
    joystick: VirtualJoystick,
    pointer: Phaser.Input.Pointer,
  ): void {
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
      this.grenadeButtonText.setText('!');
    } else {
      this.grenadeButton.setFillStyle(GRENADE_AIM_COLOR, GRENADE_AIM_ALPHA);
      this.grenadeButtonText.setText('G');
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
      this.rightJoystick.lastAimAngle = Math.atan2(aimVec.y, aimVec.x);
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
      reload: false, // Auto-reload on mobile; no explicit button.
    };
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
  }
}
