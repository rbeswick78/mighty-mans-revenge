import { describe, expect, it } from 'vitest';
import { MenuFocusNavigator, type MenuFocusTarget } from './focus-navigation.js';

class Target implements MenuFocusTarget {
  focused = false;
  activations = 0;

  constructor(private readonly disabled = false) {}

  isDisabled(): boolean {
    return this.disabled;
  }

  setFocused(focused: boolean): void {
    this.focused = focused;
  }

  activate(): boolean {
    if (this.disabled) return false;
    this.activations++;
    return true;
  }
}

describe('MenuFocusNavigator', () => {
  it('starts at the directional edge, wraps, and activates the focused target', () => {
    const targets = [new Target(), new Target(), new Target()];
    const navigation = new MenuFocusNavigator(targets);

    expect(navigation.move(1)).toBe(true);
    expect(navigation.getFocusedIndex()).toBe(0);
    expect(navigation.move(-1)).toBe(true);
    expect(navigation.getFocusedIndex()).toBe(2);
    expect(navigation.activateFocused()).toBe(true);
    expect(targets[2]?.activations).toBe(1);
  });

  it('skips disabled targets in either direction', () => {
    const targets = [new Target(), new Target(true), new Target()];
    const navigation = new MenuFocusNavigator(targets);

    navigation.focus(0);
    navigation.move(1);
    expect(navigation.getFocusedIndex()).toBe(2);
    navigation.move(-1);
    expect(navigation.getFocusedIndex()).toBe(0);
    expect(targets[1]?.focused).toBe(false);
  });

  it('clears visible focus when pointer or touch takes over', () => {
    const targets = [new Target(), new Target()];
    const navigation = new MenuFocusNavigator(targets);

    navigation.focus(1);
    navigation.clear();
    expect(navigation.getFocusedIndex()).toBeNull();
    expect(targets.every((target) => !target.focused)).toBe(true);
    expect(navigation.activateFocused()).toBe(false);
  });
});
