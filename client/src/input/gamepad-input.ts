import type { RawInput } from './types.js';

export const STANDARD_GAMEPAD_BUTTON = Object.freeze({
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  LEFT_BUMPER: 4,
  RIGHT_BUMPER: 5,
  LEFT_TRIGGER: 6,
  RIGHT_TRIGGER: 7,
  BACK: 8,
  START: 9,
  LEFT_STICK: 10,
  RIGHT_STICK: 11,
  DPAD_UP: 12,
  DPAD_DOWN: 13,
  DPAD_LEFT: 14,
  DPAD_RIGHT: 15,
} as const);

export interface GamepadButtonLike {
  readonly pressed: boolean;
  readonly value: number;
}

export interface GamepadLike {
  readonly id: string;
  readonly index: number;
  readonly connected: boolean;
  readonly mapping: string;
  readonly axes: readonly number[];
  readonly buttons: readonly GamepadButtonLike[];
}

export type GamepadProvider = () => readonly (GamepadLike | null)[];

export interface GamepadGameplaySample {
  connected: boolean;
  hasIntent: boolean;
  raw: RawInput;
}

interface GamepadHaptics {
  playEffect?: (
    type: 'dual-rumble',
    params: {
      startDelay: number;
      duration: number;
      weakMagnitude: number;
      strongMagnitude: number;
    },
  ) => Promise<unknown>;
  pulse?: (value: number, duration: number) => Promise<unknown>;
}

const STICK_DEAD_ZONE = 0.2;
const INTENT_DEAD_ZONE = 0.3;
const BUTTON_THRESHOLD = 0.5;

const neutralInput = (aimAngle: number): RawInput => ({
  moveX: 0,
  moveY: 0,
  aimAngle,
  aimingGun: false,
  firePressed: false,
  aimingGrenade: false,
  throwPressed: false,
  detonatePressed: false,
  sprint: false,
  reload: false,
  abilityPressed: false,
  tauntPressed: false,
});

/** Browser provider kept behind a seam so controller sampling stays deterministic in tests. */
export function browserGamepads(): readonly (GamepadLike | null)[] {
  if (
    typeof navigator === 'undefined' ||
    typeof navigator.getGamepads !== 'function'
  ) {
    return [];
  }
  return navigator.getGamepads();
}

export function firstConnectedGamepad(
  gamepads: readonly (GamepadLike | null)[],
): GamepadLike | null {
  return gamepads.find((pad) => pad?.connected && pad.mapping === 'standard') ?? null;
}

/** Circular dead zone with rescaling, preserving full range and diagonal direction. */
export function gamepadStick(
  x: number,
  y: number,
  deadZone: number = STICK_DEAD_ZONE,
): { x: number; y: number; magnitude: number } {
  const magnitude = Math.min(1, Math.hypot(x, y));
  if (magnitude <= deadZone) return { x: 0, y: 0, magnitude: 0 };
  const scaledMagnitude = (magnitude - deadZone) / (1 - deadZone);
  return {
    x: (x / magnitude) * scaledMagnitude,
    y: (y / magnitude) * scaledMagnitude,
    magnitude: scaledMagnitude,
  };
}

function buttonDown(pad: GamepadLike, index: number): boolean {
  const button = pad.buttons[index];
  return !!button && (button.pressed || button.value >= BUTTON_THRESHOLD);
}

/**
 * Standard-layout twin-stick controls. Sampling is tick-based like the other
 * input adapters, so release edges survive exactly one network input.
 */
export class GamepadInput {
  private readonly provider: GamepadProvider;
  private previousButtons: boolean[] = [];
  private activePadIndex: number | null = null;
  private initialized = false;
  private lastAimAngle = 0;
  private grenadePressStartedWhileLive = false;

  constructor(provider: GamepadProvider = browserGamepads) {
    this.provider = provider;
  }

  poll(hasActiveGrenade: boolean): GamepadGameplaySample {
    const pad = firstConnectedGamepad(this.provider());
    if (!pad) {
      this.reset();
      return {
        connected: false,
        hasIntent: false,
        raw: neutralInput(this.lastAimAngle),
      };
    }

    if (this.activePadIndex !== pad.index) {
      this.activePadIndex = pad.index;
      this.previousButtons = [];
      this.initialized = false;
      this.grenadePressStartedWhileLive = false;
    }

    const currentButtons = pad.buttons.map((_, index) => buttonDown(pad, index));
    const wasInitialized = this.initialized;
    const pressed = (index: number): boolean =>
      wasInitialized && !!currentButtons[index] && !this.previousButtons[index];
    const released = (index: number): boolean =>
      wasInitialized && !currentButtons[index] && !!this.previousButtons[index];

    const move = gamepadStick(pad.axes[0] ?? 0, pad.axes[1] ?? 0);
    const aim = gamepadStick(pad.axes[2] ?? 0, pad.axes[3] ?? 0);
    if (aim.magnitude > 0) {
      this.lastAimAngle = Math.atan2(aim.y, aim.x);
    }

    const lt = STANDARD_GAMEPAD_BUTTON.LEFT_TRIGGER;
    const rt = STANDARD_GAMEPAD_BUTTON.RIGHT_TRIGGER;
    if (!wasInitialized && currentButtons[lt]) {
      this.grenadePressStartedWhileLive = hasActiveGrenade;
    } else if (pressed(lt)) {
      this.grenadePressStartedWhileLive = hasActiveGrenade;
    }

    const ltReleased = released(lt);
    const rtReleased = released(rt);
    const anyButtonDown = currentButtons.some(Boolean);
    const hasIntent =
      move.magnitude >= INTENT_DEAD_ZONE ||
      aim.magnitude >= INTENT_DEAD_ZONE ||
      anyButtonDown ||
      ltReleased ||
      rtReleased;

    const raw: RawInput = {
      moveX: move.x,
      moveY: move.y,
      aimAngle: this.lastAimAngle,
      aimingGun: !!currentButtons[rt],
      firePressed: rtReleased,
      aimingGrenade: !!currentButtons[lt] && !hasActiveGrenade,
      throwPressed: ltReleased && !this.grenadePressStartedWhileLive,
      detonatePressed: pressed(lt) && hasActiveGrenade,
      sprint:
        !!currentButtons[STANDARD_GAMEPAD_BUTTON.LEFT_BUMPER] ||
        !!currentButtons[STANDARD_GAMEPAD_BUTTON.LEFT_STICK],
      reload: pressed(STANDARD_GAMEPAD_BUTTON.X),
      abilityPressed: pressed(STANDARD_GAMEPAD_BUTTON.RIGHT_BUMPER),
      tauntPressed: pressed(STANDARD_GAMEPAD_BUTTON.Y),
    };

    this.previousButtons = currentButtons;
    this.initialized = true;
    return { connected: true, hasIntent, raw };
  }

  rumble(strength: number, durationMs: number): void {
    const pad = firstConnectedGamepad(this.provider());
    if (!pad) return;
    const haptics = (pad as GamepadLike & {
      vibrationActuator?: GamepadHaptics;
      hapticActuators?: readonly GamepadHaptics[];
    }).vibrationActuator ?? (pad as GamepadLike & {
      hapticActuators?: readonly GamepadHaptics[];
    }).hapticActuators?.[0];
    if (!haptics) return;

    const magnitude = Math.max(0, Math.min(1, strength));
    const duration = Math.max(0, Math.round(durationMs));
    const effect = haptics.playEffect?.('dual-rumble', {
      startDelay: 0,
      duration,
      weakMagnitude: magnitude * 0.65,
      strongMagnitude: magnitude,
    }) ?? haptics.pulse?.(magnitude, duration);
    void effect?.catch(() => {
      // Haptics are optional and may be rejected by browser/device policy.
    });
  }

  private reset(): void {
    this.previousButtons = [];
    this.activePadIndex = null;
    this.initialized = false;
    this.grenadePressStartedWhileLive = false;
  }
}
