import { describe, expect, it, vi } from 'vitest';
import {
  GamepadInput,
  STANDARD_GAMEPAD_BUTTON,
  firstConnectedGamepad,
  gamepadStick,
  type GamepadButtonLike,
  type GamepadLike,
} from './gamepad-input.js';

interface MutablePad extends GamepadLike {
  axes: number[];
  buttons: GamepadButtonLike[];
}

function makePad(): MutablePad {
  return {
    id: 'Test Standard Pad',
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

describe('gamepadStick', () => {
  it('removes drift, rescales range, and preserves diagonals', () => {
    expect(gamepadStick(0.1, -0.1)).toEqual({ x: 0, y: 0, magnitude: 0 });
    expect(gamepadStick(1, 0)).toEqual({ x: 1, y: 0, magnitude: 1 });
    const diagonal = gamepadStick(0.5, 0.5);
    expect(diagonal.x).toBeCloseTo(diagonal.y);
    expect(diagonal.magnitude).toBeGreaterThan(0);
    expect(diagonal.magnitude).toBeLessThan(1);
  });
});

describe('firstConnectedGamepad', () => {
  it('ignores empty, disconnected, and non-standard slots', () => {
    const disconnected = { ...makePad(), connected: false };
    const nonStandard = { ...makePad(), mapping: '' };
    const connected = { ...makePad(), index: 2 };
    expect(firstConnectedGamepad([null, disconnected, nonStandard, connected])).toBe(
      connected,
    );
  });
});

describe('GamepadInput', () => {
  it('maps twin sticks and fires once when the right trigger releases', () => {
    const pad = makePad();
    const input = new GamepadInput(() => [pad]);
    input.poll(false); // Prime edges.

    pad.axes = [1, 0, 0, -1];
    setButton(pad, STANDARD_GAMEPAD_BUTTON.RIGHT_TRIGGER, true);
    const aiming = input.poll(false);
    expect(aiming.hasIntent).toBe(true);
    expect(aiming.raw.moveX).toBe(1);
    expect(aiming.raw.moveY).toBe(0);
    expect(aiming.raw.aimAngle).toBeCloseTo(-Math.PI / 2);
    expect(aiming.raw.aimingGun).toBe(true);
    expect(aiming.raw.firePressed).toBe(false);

    setButton(pad, STANDARD_GAMEPAD_BUTTON.RIGHT_TRIGGER, false);
    pad.axes = [0, 0, 0, 0];
    const released = input.poll(false);
    expect(released.hasIntent).toBe(true);
    expect(released.raw.aimAngle).toBeCloseTo(-Math.PI / 2);
    expect(released.raw.firePressed).toBe(true);
    expect(input.poll(false).raw.firePressed).toBe(false);
  });

  it('throws on a fresh left-trigger release and detonates on a live press', () => {
    const pad = makePad();
    const input = new GamepadInput(() => [pad]);
    input.poll(false);

    setButton(pad, STANDARD_GAMEPAD_BUTTON.LEFT_TRIGGER, true);
    expect(input.poll(false).raw).toMatchObject({
      aimingGrenade: true,
      throwPressed: false,
      detonatePressed: false,
    });
    setButton(pad, STANDARD_GAMEPAD_BUTTON.LEFT_TRIGGER, false);
    expect(input.poll(false).raw).toMatchObject({
      aimingGrenade: false,
      throwPressed: true,
      detonatePressed: false,
    });

    setButton(pad, STANDARD_GAMEPAD_BUTTON.LEFT_TRIGGER, true);
    expect(input.poll(true).raw).toMatchObject({
      aimingGrenade: false,
      throwPressed: false,
      detonatePressed: true,
    });
    setButton(pad, STANDARD_GAMEPAD_BUTTON.LEFT_TRIGGER, false);
    expect(input.poll(false).raw.throwPressed).toBe(false);
  });

  it('maps sprint, reload, and ability without repeating pressed edges', () => {
    const pad = makePad();
    const input = new GamepadInput(() => [pad]);
    input.poll(false);
    setButton(pad, STANDARD_GAMEPAD_BUTTON.LEFT_BUMPER, true);
    setButton(pad, STANDARD_GAMEPAD_BUTTON.X, true);
    setButton(pad, STANDARD_GAMEPAD_BUTTON.RIGHT_BUMPER, true);

    expect(input.poll(false).raw).toMatchObject({
      sprint: true,
      reload: true,
      abilityPressed: true,
    });
    expect(input.poll(false).raw).toMatchObject({
      sprint: true,
      reload: false,
      abilityPressed: false,
    });
  });

  it('falls back to a neutral disconnected sample', () => {
    let pad: MutablePad | null = makePad();
    const input = new GamepadInput(() => [pad]);
    input.poll(false);
    pad = null;
    expect(input.poll(false)).toMatchObject({
      connected: false,
      hasIntent: false,
      raw: { moveX: 0, moveY: 0, aimingGun: false },
    });
  });

  it('uses optional dual-rumble haptics and clamps magnitudes', async () => {
    const playEffect = vi.fn().mockResolvedValue(undefined);
    const pad = Object.assign(makePad(), {
      vibrationActuator: { playEffect },
    });
    const input = new GamepadInput(() => [pad]);
    input.rumble(2, 44.6);
    await Promise.resolve();
    expect(playEffect).toHaveBeenCalledWith('dual-rumble', {
      startDelay: 0,
      duration: 45,
      weakMagnitude: 0.65,
      strongMagnitude: 1,
    });
  });
});
