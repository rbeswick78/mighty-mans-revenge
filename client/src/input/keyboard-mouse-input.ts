import Phaser from 'phaser';
import type { Vec2 } from '@shared/types/common.js';
import type { RawInput } from './types.js';

/**
 * Mouse buttons we care about. We listen on the canvas directly because
 * Phaser's pointer events for non-left buttons aren't reliable in this
 * environment (see phaserjs/phaser#6194).
 */
export class KeyboardMouseInput {
  private scene: Phaser.Scene;
  private keys: {
    W: Phaser.Input.Keyboard.Key;
    A: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
    SHIFT: Phaser.Input.Keyboard.Key;
    R: Phaser.Input.Keyboard.Key;
  };
  private pointer: Phaser.Input.Pointer;
  private canvas: HTMLCanvasElement;
  private onCanvasMouseDown: (e: MouseEvent) => void;
  private onCanvasMouseUp: (e: MouseEvent) => void;
  private onWindowBlur: () => void;

  private lmbDown = false;
  private rmbDown = false;
  /** Set on the frame the corresponding button is released; cleared on read. */
  private lmbReleasedFlag = false;
  private rmbReleasedFlag = false;
  /** Set on the frame the corresponding button is pressed; cleared on read. */
  private rmbPressedFlag = false;
  /** True if a live grenade existed at the moment RMB was pressed. */
  private rmbPressedWhileLive = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    if (!scene.input.keyboard) {
      throw new Error('Keyboard plugin not available');
    }

    this.keys = {
      W: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      A: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      S: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      D: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      SHIFT: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT),
      R: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R),
    };

    this.pointer = scene.input.mousePointer ?? scene.input.activePointer;

    this.canvas = scene.game.canvas;

    this.onCanvasMouseDown = (e: MouseEvent) => {
      if (e.button === 0) {
        this.lmbDown = true;
      } else if (e.button === 2) {
        if (!this.rmbDown) this.rmbPressedFlag = true;
        this.rmbDown = true;
      }
    };
    this.onCanvasMouseUp = (e: MouseEvent) => {
      if (e.button === 0) {
        if (this.lmbDown) this.lmbReleasedFlag = true;
        this.lmbDown = false;
      } else if (e.button === 2) {
        if (this.rmbDown) this.rmbReleasedFlag = true;
        this.rmbDown = false;
      }
    };
    // If the window loses focus mid-click, mouseup may never reach the canvas.
    // Treat blur as a release of any held buttons so we don't get stuck aiming.
    this.onWindowBlur = () => {
      if (this.lmbDown) {
        this.lmbReleasedFlag = true;
        this.lmbDown = false;
      }
      if (this.rmbDown) {
        this.rmbReleasedFlag = true;
        this.rmbDown = false;
      }
    };

    this.canvas.addEventListener('mousedown', this.onCanvasMouseDown);
    // mouseup must be on window (or document) so a release outside the canvas
    // still gets reported.
    window.addEventListener('mouseup', this.onCanvasMouseUp);
    window.addEventListener('blur', this.onWindowBlur);
  }

  getInput(playerWorldPos: Vec2, hasActiveGrenade: boolean): RawInput {
    let moveX = 0;
    let moveY = 0;

    if (this.keys.A.isDown) moveX -= 1;
    if (this.keys.D.isDown) moveX += 1;
    if (this.keys.W.isDown) moveY -= 1;
    if (this.keys.S.isDown) moveY += 1;

    if (moveX !== 0 && moveY !== 0) {
      const len = Math.sqrt(moveX * moveX + moveY * moveY);
      moveX /= len;
      moveY /= len;
    }

    // Aim angle from player → mouse cursor in world space.
    const worldPoint = this.scene.cameras.main.getWorldPoint(
      this.pointer.x,
      this.pointer.y,
    );
    const aimAngle = Math.atan2(
      worldPoint.y - playerWorldPos.y,
      worldPoint.x - playerWorldPos.x,
    );

    // Drain the edge flags. Reading them once-per-tick guarantees a single
    // edge event reaches the server even if multiple clicks happen between
    // input samples.
    const lmbReleased = this.lmbReleasedFlag;
    this.lmbReleasedFlag = false;
    const rmbReleased = this.rmbReleasedFlag;
    this.rmbReleasedFlag = false;
    const rmbPressed = this.rmbPressedFlag;
    this.rmbPressedFlag = false;

    // On press, lock in whether a grenade was already live. The release is
    // only a "throw" if the press started in aim mode — otherwise the press
    // was a detonate and the matching release would otherwise immediately
    // re-throw because hasActiveGrenade flipped back to false.
    if (rmbPressed) {
      this.rmbPressedWhileLive = hasActiveGrenade;
    }

    const aimingGun = this.lmbDown;
    const firePressed = lmbReleased;

    // RMB has two roles depending on whether a grenade is currently in flight
    // for this player: aim/throw a new one, or detonate the live one.
    const aimingGrenade = this.rmbDown && !hasActiveGrenade;
    const throwPressed = rmbReleased && !this.rmbPressedWhileLive;
    const detonatePressed = rmbPressed && hasActiveGrenade;

    return {
      moveX,
      moveY,
      aimAngle,
      aimingGun,
      firePressed,
      aimingGrenade,
      throwPressed,
      detonatePressed,
      sprint: this.keys.SHIFT.isDown,
      reload: Phaser.Input.Keyboard.JustDown(this.keys.R),
    };
  }

  destroy(): void {
    this.canvas.removeEventListener('mousedown', this.onCanvasMouseDown);
    window.removeEventListener('mouseup', this.onCanvasMouseUp);
    window.removeEventListener('blur', this.onWindowBlur);
    if (this.scene.input.keyboard) {
      this.scene.input.keyboard.removeKey(Phaser.Input.Keyboard.KeyCodes.W);
      this.scene.input.keyboard.removeKey(Phaser.Input.Keyboard.KeyCodes.A);
      this.scene.input.keyboard.removeKey(Phaser.Input.Keyboard.KeyCodes.S);
      this.scene.input.keyboard.removeKey(Phaser.Input.Keyboard.KeyCodes.D);
      this.scene.input.keyboard.removeKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
      this.scene.input.keyboard.removeKey(Phaser.Input.Keyboard.KeyCodes.R);
    }
  }
}
