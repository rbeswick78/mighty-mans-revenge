import Phaser from 'phaser';
import type { RawInput } from './types.js';

const JOYSTICK_MAX_RADIUS = 50;
const DEAD_ZONE_RATIO = 0.15;
const DEAD_ZONE = JOYSTICK_MAX_RADIUS * DEAD_ZONE_RATIO;
const BASE_ALPHA = 0.3;
const THUMB_ALPHA = 0.5;
const BASE_RADIUS = 50;
const THUMB_RADIUS = 24;
const GRENADE_BUTTON_SIZE = 40;
const GRENADE_BUTTON_MARGIN = 16;

interface VirtualJoystick {
  active: boolean;
  pointerId: number;
  originX: number;
  originY: number;
  currentX: number;
  currentY: number;
  baseCircle: Phaser.GameObjects.Arc;
  thumbCircle: Phaser.GameObjects.Arc;
}

export class TouchInput {
  private scene: Phaser.Scene;
  private leftJoystick: VirtualJoystick;
  private rightJoystick: VirtualJoystick;
  private grenadeButton: Phaser.GameObjects.Arc;
  private grenadeButtonText: Phaser.GameObjects.Text;
  private grenadePressed = false;
  private sprintActive = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    // Enable multitouch
    scene.input.addPointer(2);

    // Create joystick graphics (hidden until touched)
    this.leftJoystick = this.createJoystick();
    this.rightJoystick = this.createJoystick();

    // Grenade button (top-right area)
    const { width } = scene.scale;
    const btnX = width - GRENADE_BUTTON_MARGIN - GRENADE_BUTTON_SIZE;
    const btnY = GRENADE_BUTTON_MARGIN + GRENADE_BUTTON_SIZE;

    this.grenadeButton = scene.add.circle(btnX, btnY, GRENADE_BUTTON_SIZE, 0xff6600, 0.5);
    this.grenadeButton.setScrollFactor(0);
    this.grenadeButton.setDepth(3000);
    this.grenadeButton.setInteractive();

    this.grenadeButtonText = scene.add.text(btnX, btnY, 'G', {
      fontFamily: 'Courier, monospace',
      fontSize: '18px',
      color: '#ffffff',
      fontStyle: 'bold',
    });
    this.grenadeButtonText.setOrigin(0.5, 0.5);
    this.grenadeButtonText.setScrollFactor(0);
    this.grenadeButtonText.setDepth(3001);

    this.grenadeButton.on('pointerdown', () => {
      this.grenadePressed = true;
    });
    this.grenadeButton.on('pointerup', () => {
      this.grenadePressed = false;
    });

    // Touch event handlers
    scene.input.on('pointerdown', this.onPointerDown, this);
    scene.input.on('pointermove', this.onPointerMove, this);
    scene.input.on('pointerup', this.onPointerUp, this);
  }

  private createJoystick(): VirtualJoystick {
    const base = this.scene.add.circle(0, 0, BASE_RADIUS, 0xffffff, BASE_ALPHA);
    base.setScrollFactor(0);
    base.setDepth(3000);
    base.setVisible(false);

    const thumb = this.scene.add.circle(0, 0, THUMB_RADIUS, 0xffffff, THUMB_ALPHA);
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
    };
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    // Only respond to actual touch events, not mouse clicks. Otherwise
    // desktop users see phantom joystick circles every time they click.
    if (!pointer.wasTouch) return;

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

    // Sprint detection: full extension on left joystick
    if (joystick === this.leftJoystick) {
      if (dist >= JOYSTICK_MAX_RADIUS * 0.95) {
        this.sprintActive = true;
      } else {
        this.sprintActive = false;
      }
    }
  }

  private onPointerUp(pointer: Phaser.Input.Pointer): void {
    if (this.leftJoystick.active && this.leftJoystick.pointerId === pointer.id) {
      this.deactivateJoystick(this.leftJoystick);
      this.sprintActive = false;
    }
    if (this.rightJoystick.active && this.rightJoystick.pointerId === pointer.id) {
      this.deactivateJoystick(this.rightJoystick);
    }
  }

  private deactivateJoystick(joystick: VirtualJoystick): void {
    joystick.active = false;
    joystick.pointerId = -1;
    joystick.baseCircle.setVisible(false);
    joystick.thumbCircle.setVisible(false);
  }

  private getJoystickVector(joystick: VirtualJoystick): { x: number; y: number } {
    if (!joystick.active) return { x: 0, y: 0 };

    const dx = joystick.currentX - joystick.originX;
    const dy = joystick.currentY - joystick.originY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < DEAD_ZONE) return { x: 0, y: 0 };

    // Normalize and scale (remove dead zone from range)
    const effectiveDist = (dist - DEAD_ZONE) / (JOYSTICK_MAX_RADIUS - DEAD_ZONE);
    const clampedDist = Math.min(1, effectiveDist);
    const angle = Math.atan2(dy, dx);

    return {
      x: Math.cos(angle) * clampedDist,
      y: Math.sin(angle) * clampedDist,
    };
  }

  getInput(): RawInput {
    const moveVec = this.getJoystickVector(this.leftJoystick);
    const aimVec = this.getJoystickVector(this.rightJoystick);

    // Aim angle from right joystick direction
    let aimAngle = 0;
    if (aimVec.x !== 0 || aimVec.y !== 0) {
      aimAngle = Math.atan2(aimVec.y, aimVec.x);
    }

    // Auto-fire when right joystick is active and outside dead zone
    const shooting = this.rightJoystick.active && (aimVec.x !== 0 || aimVec.y !== 0);

    return {
      moveX: moveVec.x,
      moveY: moveVec.y,
      aimAngle,
      shooting,
      throwGrenade: this.grenadePressed,
      sprint: this.sprintActive,
      reload: false, // Auto-reload on mobile; no explicit button
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
