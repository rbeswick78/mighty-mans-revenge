import { describe, expect, it } from 'vitest';
import { menuSceneForCapabilities } from './menu-route.js';

describe('menuSceneForCapabilities', () => {
  it.each([
    ['absent advertisement', undefined],
    ['null advertisement', null],
    ['false flag', { newShell: false }],
    ['partial advertisement', { schedules: true }],
    ['string flag', { newShell: 'true' }],
    ['numeric flag', { newShell: 1 }],
    ['malformed snapshot', 'newShell=true'],
  ])('keeps LobbyScene for %s', (_label, advertised) => {
    expect(menuSceneForCapabilities(advertised)).toBe('LobbyScene');
  });

  it('selects the empty shell only for a literal server true', () => {
    expect(menuSceneForCapabilities({ newShell: true })).toBe('ReforgedShellScene');
  });
});
