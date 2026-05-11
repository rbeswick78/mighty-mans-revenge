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
  private lastRawInput: RawInput | null = null;

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

  /**
   * Sample input for one server tick. `hasActiveGrenade` controls whether
   * RMB / the grenade button is in throw-aim mode or detonate mode.
   * `localFrozen` mirrors the server's freeze gate: when true, every
   * actionable field is zeroed before the input ships, so client
   * prediction agrees with the server-authoritative lockout (no phantom
   * muzzle flashes, grenade arcs, or movement during the freeze). Aim
   * angle is preserved so the cosmetic rotation still tracks the cursor.
   */
  update(
    playerWorldPos: Vec2,
    currentTick: number,
    hasActiveGrenade: boolean,
    localFrozen: boolean = false,
  ): PlayerInput {
    let raw: RawInput;

    if (this.activeMode === 'touch') {
      raw = this.touchInput.getInput(hasActiveGrenade);
    } else {
      raw = this.keyboardMouseInput.getInput(playerWorldPos, hasActiveGrenade);
    }

    this.lastRawInput = raw;
    this.sequenceNumber++;

    const input: PlayerInput = localFrozen
      ? {
          sequenceNumber: this.sequenceNumber,
          moveX: 0,
          moveY: 0,
          aimAngle: raw.aimAngle,
          aimingGun: false,
          firePressed: false,
          aimingGrenade: false,
          throwPressed: false,
          detonatePressed: false,
          sprint: false,
          reload: false,
          abilityPressed: false,
          tick: currentTick,
        }
      : {
          sequenceNumber: this.sequenceNumber,
          moveX: raw.moveX,
          moveY: raw.moveY,
          aimAngle: raw.aimAngle,
          aimingGun: raw.aimingGun,
          firePressed: raw.firePressed,
          aimingGrenade: raw.aimingGrenade,
          throwPressed: raw.throwPressed,
          detonatePressed: raw.detonatePressed,
          sprint: raw.sprint,
          reload: raw.reload,
          abilityPressed: raw.abilityPressed,
          tick: currentTick,
        };

    this.inputBuffer.push(input);

    if (this.inputBuffer.length > INPUT_BUFFER_SIZE) {
      this.inputBuffer.splice(0, this.inputBuffer.length - INPUT_BUFFER_SIZE);
    }

    return input;
  }

  /**
   * Most recent raw input snapshot — used by the scene to drive the aim
   * line each render frame (in between server-tick samples).
   */
  getLastRawInput(): RawInput | null {
    return this.lastRawInput;
  }

  getUnacknowledgedInputs(lastAck: number): PlayerInput[] {
    return this.inputBuffer.filter((input) => input.sequenceNumber > lastAck);
  }

  acknowledgeInput(sequenceNumber: number): void {
    this.lastAcknowledged = sequenceNumber;
    const idx = this.inputBuffer.findIndex(
      (input) => input.sequenceNumber > sequenceNumber,
    );
    if (idx > 0) {
      this.inputBuffer.splice(0, idx);
    } else if (idx === -1 && this.inputBuffer.length > 0) {
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
