import Phaser from 'phaser';
import type { Vec2 } from '@shared/types/common.js';
import type { RawInput } from './types.js';

export class KeyboardMouseInput {
  private scene: Phaser.Scene;
  private keys: {
    W: Phaser.Input.Keyboard.Key;
    A: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
    SHIFT: Phaser.Input.Keyboard.Key;
    R: Phaser.Input.Keyboard.Key;
    G: Phaser.Input.Keyboard.Key;
  };
  private pointer: Phaser.Input.Pointer;

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
      G: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.G),
    };

    this.pointer = scene.input.activePointer;
  }

  getInput(playerWorldPos: Vec2): RawInput {
    let moveX = 0;
    let moveY = 0;

    if (this.keys.A.isDown) moveX -= 1;
    if (this.keys.D.isDown) moveX += 1;
    if (this.keys.W.isDown) moveY -= 1;
    if (this.keys.S.isDown) moveY += 1;

    // Normalize diagonal movement
    if (moveX !== 0 && moveY !== 0) {
      const len = Math.sqrt(moveX * moveX + moveY * moveY);
      moveX /= len;
      moveY /= len;
    }

    // Calculate aim angle from player world position to mouse world position
    const worldPoint = this.scene.cameras.main.getWorldPoint(
      this.pointer.x,
      this.pointer.y,
    );
    const aimAngle = Math.atan2(
      worldPoint.y - playerWorldPos.y,
      worldPoint.x - playerWorldPos.x,
    );

    return {
      moveX,
      moveY,
      aimAngle,
      shooting: this.pointer.leftButtonDown(),
      throwGrenade: this.pointer.rightButtonDown() || this.keys.G.isDown,
      sprint: this.keys.SHIFT.isDown,
      reload: Phaser.Input.Keyboard.JustDown(this.keys.R),
    };
  }

  destroy(): void {
    if (this.scene.input.keyboard) {
      this.scene.input.keyboard.removeKey(Phaser.Input.Keyboard.KeyCodes.W);
      this.scene.input.keyboard.removeKey(Phaser.Input.Keyboard.KeyCodes.A);
      this.scene.input.keyboard.removeKey(Phaser.Input.Keyboard.KeyCodes.S);
      this.scene.input.keyboard.removeKey(Phaser.Input.Keyboard.KeyCodes.D);
      this.scene.input.keyboard.removeKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
      this.scene.input.keyboard.removeKey(Phaser.Input.Keyboard.KeyCodes.R);
      this.scene.input.keyboard.removeKey(Phaser.Input.Keyboard.KeyCodes.G);
    }
  }
}
