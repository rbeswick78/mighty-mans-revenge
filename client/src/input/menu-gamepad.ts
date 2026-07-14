import {
  STANDARD_GAMEPAD_BUTTON,
  browserGamepads,
  firstConnectedGamepad,
  type GamepadLike,
  type GamepadProvider,
} from './gamepad-input.js';

export interface MenuGamepadActions {
  connected: boolean;
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  confirm: boolean;
  back: boolean;
  alternate: boolean;
  menu: boolean;
  hasAction: boolean;
}

const AXIS_THRESHOLD = 0.6;
const BUTTON_THRESHOLD = 0.5;

const noActions = (connected: boolean): MenuGamepadActions => ({
  connected,
  left: false,
  right: false,
  up: false,
  down: false,
  confirm: false,
  back: false,
  alternate: false,
  menu: false,
  hasAction: false,
});

function buttonDown(pad: GamepadLike, index: number): boolean {
  const button = pad.buttons[index];
  return !!button && (button.pressed || button.value >= BUTTON_THRESHOLD);
}

/** Edge-triggered D-pad/stick + A/B/X navigation shared by every menu scene. */
export class MenuGamepadInput {
  private readonly provider: GamepadProvider;
  private previous: boolean[] = [];
  private activePadIndex: number | null = null;
  private initialized = false;

  constructor(provider: GamepadProvider = browserGamepads) {
    this.provider = provider;
  }

  poll(): MenuGamepadActions {
    const pad = firstConnectedGamepad(this.provider());
    if (!pad) {
      this.previous = [];
      this.activePadIndex = null;
      this.initialized = false;
      return noActions(false);
    }
    if (this.activePadIndex !== pad.index) {
      this.activePadIndex = pad.index;
      this.previous = [];
      this.initialized = false;
    }

    const current = [
      buttonDown(pad, STANDARD_GAMEPAD_BUTTON.DPAD_LEFT) || (pad.axes[0] ?? 0) < -AXIS_THRESHOLD,
      buttonDown(pad, STANDARD_GAMEPAD_BUTTON.DPAD_RIGHT) || (pad.axes[0] ?? 0) > AXIS_THRESHOLD,
      buttonDown(pad, STANDARD_GAMEPAD_BUTTON.DPAD_UP) || (pad.axes[1] ?? 0) < -AXIS_THRESHOLD,
      buttonDown(pad, STANDARD_GAMEPAD_BUTTON.DPAD_DOWN) || (pad.axes[1] ?? 0) > AXIS_THRESHOLD,
      buttonDown(pad, STANDARD_GAMEPAD_BUTTON.A),
      buttonDown(pad, STANDARD_GAMEPAD_BUTTON.B),
      buttonDown(pad, STANDARD_GAMEPAD_BUTTON.X),
      buttonDown(pad, STANDARD_GAMEPAD_BUTTON.START),
    ];
    if (!this.initialized) {
      this.previous = current;
      this.initialized = true;
      return noActions(true);
    }

    const edge = (index: number): boolean => current[index] && !this.previous[index];
    const actions: MenuGamepadActions = {
      connected: true,
      left: edge(0),
      right: edge(1),
      up: edge(2),
      down: edge(3),
      confirm: edge(4),
      back: edge(5),
      alternate: edge(6),
      menu: edge(7),
      hasAction: false,
    };
    actions.hasAction =
      actions.left ||
      actions.right ||
      actions.up ||
      actions.down ||
      actions.confirm ||
      actions.back ||
      actions.alternate ||
      actions.menu;
    this.previous = current;
    return actions;
  }
}
