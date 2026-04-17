import Phaser from 'phaser';
import type { Vec2 } from '@shared/types/common.js';
import type { PlayerInput } from '@shared/types/player.js';
import { isTouchDevice } from './is-touch-device.js';
import { KeyboardMouseInput } from './keyboard-mouse-input.js';
import { TouchInput } from './touch-input.js';
import type { RawInput } from './types.js';

type InputMode = 'keyboard' | 'touch';

const INPUT_BUFFER_SIZE = 128;

export class InputManager {
  private keyboardMouseInput: KeyboardMouseInput;
  private touchInput: TouchInput;
  private activeMode: InputMode;
  private sequenceNumber = 0;
  private inputBuffer: PlayerInput[] = [];
  private lastAcknowledged = -1;

  constructor(scene: Phaser.Scene) {
    this.keyboardMouseInput = new KeyboardMouseInput(scene);
    this.touchInput = new TouchInput(scene);

    this.activeMode = isTouchDevice() ? 'touch' : 'keyboard';

    if (scene.input.keyboard) {
      scene.input.keyboard.on('keydown', () => {
        this.activeMode = 'keyboard';
      });
    }
  }

  update(playerWorldPos: Vec2, currentTick: number): PlayerInput {
    let raw: RawInput;

    if (this.activeMode === 'touch') {
      raw = this.touchInput.getInput();
    } else {
      raw = this.keyboardMouseInput.getInput(playerWorldPos);
    }

    this.sequenceNumber++;

    const input: PlayerInput = {
      sequenceNumber: this.sequenceNumber,
      moveX: raw.moveX,
      moveY: raw.moveY,
      aimAngle: raw.aimAngle,
      shooting: raw.shooting,
      throwGrenade: raw.throwGrenade,
      sprint: raw.sprint,
      reload: raw.reload,
      tick: currentTick,
    };

    this.inputBuffer.push(input);

    // Keep buffer bounded
    if (this.inputBuffer.length > INPUT_BUFFER_SIZE) {
      this.inputBuffer.splice(0, this.inputBuffer.length - INPUT_BUFFER_SIZE);
    }

    return input;
  }

  getUnacknowledgedInputs(lastAck: number): PlayerInput[] {
    return this.inputBuffer.filter((input) => input.sequenceNumber > lastAck);
  }

  acknowledgeInput(sequenceNumber: number): void {
    this.lastAcknowledged = sequenceNumber;
    // Remove all inputs up to and including the acknowledged one
    const idx = this.inputBuffer.findIndex(
      (input) => input.sequenceNumber > sequenceNumber,
    );
    if (idx > 0) {
      this.inputBuffer.splice(0, idx);
    } else if (idx === -1 && this.inputBuffer.length > 0) {
      // All inputs acknowledged
      this.inputBuffer = [];
    }
  }

  getLastAcknowledged(): number {
    return this.lastAcknowledged;
  }

  getActiveMode(): InputMode {
    return this.activeMode;
  }

  destroy(): void {
    this.keyboardMouseInput.destroy();
    this.touchInput.destroy();
    this.inputBuffer = [];
  }
}
