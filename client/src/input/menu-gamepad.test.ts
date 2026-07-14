import { describe, expect, it } from 'vitest';
import {
  STANDARD_GAMEPAD_BUTTON,
  type GamepadButtonLike,
  type GamepadLike,
} from './gamepad-input.js';
import { MenuGamepadInput } from './menu-gamepad.js';

interface MutablePad extends GamepadLike {
  axes: number[];
  buttons: GamepadButtonLike[];
}

function makePad(): MutablePad {
  return {
    id: 'Menu Pad',
    index: 0,
    connected: true,
    mapping: 'standard',
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })),
  };
}

function setButton(pad: MutablePad, index: number, down: boolean): void {
  pad.buttons[index] = { pressed: down, value: down ? 1 : 0 };
}

describe('MenuGamepadInput', () => {
  it('primes held buttons so a scene transition cannot double-confirm', () => {
    const pad = makePad();
    setButton(pad, STANDARD_GAMEPAD_BUTTON.A, true);
    const input = new MenuGamepadInput(() => [pad]);
    expect(input.poll()).toMatchObject({ connected: true, confirm: false });
    expect(input.poll().confirm).toBe(false);
    setButton(pad, STANDARD_GAMEPAD_BUTTON.A, false);
    input.poll();
    setButton(pad, STANDARD_GAMEPAD_BUTTON.A, true);
    expect(input.poll()).toMatchObject({ confirm: true, hasAction: true });
  });

  it('maps D-pad, left-stick thresholds, B, X, and Start on edges only', () => {
    const pad = makePad();
    const input = new MenuGamepadInput(() => [pad]);
    input.poll();

    pad.axes = [-0.8, 0, 0, 0];
    expect(input.poll()).toMatchObject({ left: true, hasAction: true });
    expect(input.poll().left).toBe(false);
    pad.axes = [0, 0, 0, 0];
    input.poll();

    setButton(pad, STANDARD_GAMEPAD_BUTTON.DPAD_DOWN, true);
    setButton(pad, STANDARD_GAMEPAD_BUTTON.B, true);
    setButton(pad, STANDARD_GAMEPAD_BUTTON.X, true);
    setButton(pad, STANDARD_GAMEPAD_BUTTON.START, true);
    expect(input.poll()).toMatchObject({
      down: true,
      back: true,
      alternate: true,
      menu: true,
      hasAction: true,
    });
  });

  it('reports disconnects and re-primes a replacement pad', () => {
    let pad: MutablePad | null = makePad();
    const input = new MenuGamepadInput(() => [pad]);
    input.poll();
    pad = null;
    expect(input.poll()).toMatchObject({ connected: false, hasAction: false });
    pad = { ...makePad(), index: 1 };
    setButton(pad, STANDARD_GAMEPAD_BUTTON.A, true);
    expect(input.poll().confirm).toBe(false);
  });
});
