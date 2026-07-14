import { describe, expect, it } from 'vitest';
import { audioToggleLabel } from './audio-toggle.js';

describe('audioToggleLabel', () => {
  it('names both persisted sound states and the keyboard shortcut', () => {
    expect(audioToggleLabel(false)).toBe('AUDIO ON  ·  F2');
    expect(audioToggleLabel(true)).toBe('AUDIO OFF  ·  F2');
  });
});
