export interface MenuFocusTarget {
  isDisabled(): boolean;
  setFocused(focused: boolean): unknown;
  activate(): boolean;
}

/** Linear, wrapping focus behavior shared by Reforged menu surfaces. */
export class MenuFocusNavigator<T extends MenuFocusTarget> {
  private focusIndex: number | null = null;

  constructor(private readonly targets: readonly T[]) {}

  getFocusedIndex(): number | null {
    return this.focusIndex;
  }

  clear(): void {
    this.focusIndex = null;
    this.sync();
  }

  focus(index: number): boolean {
    if (!Number.isInteger(index) || index < 0 || index >= this.targets.length) return false;
    if (this.targets[index]?.isDisabled()) return false;
    this.focusIndex = index;
    this.sync();
    return true;
  }

  move(direction: -1 | 1): boolean {
    if (this.targets.length === 0) return false;
    if (this.focusIndex === null) {
      const start = direction > 0 ? 0 : this.targets.length - 1;
      return this.findEnabledFrom(start, direction, false);
    }
    return this.findEnabledFrom(this.focusIndex, direction, true);
  }

  activateFocused(): boolean {
    if (this.focusIndex === null) return false;
    return this.targets[this.focusIndex]?.activate() ?? false;
  }

  private findEnabledFrom(start: number, direction: -1 | 1, advanceFirst: boolean): boolean {
    for (let offset = advanceFirst ? 1 : 0; offset < this.targets.length + 1; offset++) {
      const index = (start + direction * offset + this.targets.length * 2) % this.targets.length;
      if (!this.targets[index]?.isDisabled()) return this.focus(index);
    }
    return false;
  }

  private sync(): void {
    this.targets.forEach((target, index) => target.setFocused(index === this.focusIndex));
  }
}
