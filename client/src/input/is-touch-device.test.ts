import { afterEach, describe, expect, it, vi } from 'vitest';
import { isTouchDevice } from './is-touch-device.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('isTouchDevice', () => {
  it('returns true when window.ontouchstart is defined', () => {
    vi.stubGlobal('window', { ontouchstart: null } as unknown as Window);
    vi.stubGlobal('navigator', { maxTouchPoints: 0 } as unknown as Navigator);

    expect(isTouchDevice()).toBe(true);
  });

  it('returns true when navigator.maxTouchPoints > 0', () => {
    vi.stubGlobal('window', {} as unknown as Window);
    vi.stubGlobal('navigator', { maxTouchPoints: 5 } as unknown as Navigator);

    expect(isTouchDevice()).toBe(true);
  });

  it('returns false when neither signal is present', () => {
    vi.stubGlobal('window', {} as unknown as Window);
    vi.stubGlobal('navigator', { maxTouchPoints: 0 } as unknown as Navigator);

    expect(isTouchDevice()).toBe(false);
  });
});
