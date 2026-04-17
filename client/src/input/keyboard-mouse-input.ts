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
  private canvas: HTMLCanvasElement;
  private onCanvasMouseDown: (e: MouseEvent) => void;
  /** Rising-edge flag for right-click grenade throw, cleared on read. */
  private rightClickPending = false;

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

    // Use the dedicated mouse pointer, not activePointer.
    this.pointer = scene.input.mousePointer ?? scene.input.activePointer;

    // Phaser's event system isn't reliably firing pointerdown for right-click
    // in this environment (see phaserjs/phaser#6194). The browser always
    // fires `mousedown` on the canvas with e.button === 2 for right-click,
    // so we listen there directly. Context menu suppression is handled
    // globally via the game config (see main.ts).
    this.canvas = scene.game.canvas;
    this.onCanvasMouseDown = (e: MouseEvent) => {
      if (e.button === 2) {
        this.rightClickPending = true;
      }
    };
    this.canvas.addEventListener('mousedown', this.onCanvasMouseDown);
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

    // Consume the right-click rising-edge flag. Server also does rising
    // edge detection for grenade, but draining it here avoids sending
    // throwGrenade=true on multiple consecutive ticks for one click.
    const rightClickFired = this.rightClickPending;
    this.rightClickPending = false;

    const throwGrenade = rightClickFired || this.keys.G.isDown;

    return {
      moveX,
      moveY,
      aimAngle,
      shooting: this.pointer.leftButtonDown(),
      throwGrenade,
      sprint: this.keys.SHIFT.isDown,
      reload: Phaser.Input.Keyboard.JustDown(this.keys.R),
    };
  }

  destroy(): void {
    this.canvas.removeEventListener('mousedown', this.onCanvasMouseDown);
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
