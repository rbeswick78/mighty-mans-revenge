import { describe, expect, it } from 'vitest';
import { controlBriefingFor } from './control-briefing.js';

describe('controlBriefingFor', () => {
  it('teaches the desktop release-to-fire model and secondary actions', () => {
    expect(controlBriefingFor('keyboard')).toEqual({
      title: 'HOW TO FIGHT // KEYBOARD + MOUSE',
      detail:
        'WASD MOVE  •  HOLD LMB TO AIM  •  RELEASE TO FIRE\n' +
        'SHIFT SPRINT  •  RMB GRENADE  •  SPACE POWER  •  R RELOAD',
    });
  });

  it('maps the same release model to touch and gamepad language', () => {
    expect(controlBriefingFor('touch').detail).toContain('HOLD RIGHT SIDE TO AIM');
    expect(controlBriefingFor('touch').detail).toContain('RELEASE TO FIRE');
    expect(controlBriefingFor('gamepad').detail).toContain('HOLD RT TO AIM');
    expect(controlBriefingFor('gamepad').detail).toContain('RELEASE TO FIRE');
  });

  it('does not advertise disabled grenade or power actions', () => {
    for (const mode of ['keyboard', 'touch', 'gamepad'] as const) {
      const briefing = controlBriefingFor(mode, false);
      expect(briefing.detail).not.toContain('GRENADE');
      expect(briefing.detail).not.toContain('POWER');
    }
  });
});
