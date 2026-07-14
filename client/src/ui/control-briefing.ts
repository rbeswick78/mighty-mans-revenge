import type { InputMode } from '../input/input-manager.js';

export interface ControlBriefing {
  title: string;
  detail: string;
}

/**
 * Short, device-specific onboarding shown alongside the mode objective during
 * the pre-fight countdown. Firing happens on release on every input surface,
 * which is intentionally called out because it differs from most shooters.
 */
export function controlBriefingFor(
  inputMode: InputMode,
  secondaryActionsEnabled = true,
): ControlBriefing {
  if (inputMode === 'touch') {
    return {
      title: 'HOW TO FIGHT // TOUCH',
      detail: secondaryActionsEnabled
        ? 'LEFT SIDE MOVE  •  HOLD RIGHT SIDE TO AIM\nRELEASE TO FIRE  •  G GRENADE  •  A POWER  •  T TAUNT'
        : 'LEFT SIDE MOVE  •  HOLD RIGHT SIDE TO AIM\nRELEASE TO FIRE  •  T TAUNT',
    };
  }

  if (inputMode === 'gamepad') {
    return {
      title: 'HOW TO FIGHT // GAMEPAD',
      detail: secondaryActionsEnabled
        ? 'LEFT STICK MOVE  •  HOLD RT TO AIM\nRELEASE TO FIRE  •  LS SPRINT  •  LT GRENADE  •  RB POWER'
        : 'LEFT STICK MOVE  •  HOLD RT TO AIM\nRELEASE TO FIRE  •  LS SPRINT  •  X RELOAD  •  Y TAUNT',
    };
  }

  return {
    title: 'HOW TO FIGHT // KEYBOARD + MOUSE',
    detail: secondaryActionsEnabled
      ? 'WASD MOVE  •  HOLD LMB TO AIM  •  RELEASE TO FIRE\nSHIFT SPRINT  •  RMB GRENADE  •  SPACE POWER  •  R RELOAD'
      : 'WASD MOVE  •  HOLD LMB TO AIM  •  RELEASE TO FIRE\nSHIFT SPRINT  •  R RELOAD  •  T TAUNT',
  };
}
