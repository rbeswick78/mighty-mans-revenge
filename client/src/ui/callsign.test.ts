import { describe, expect, it } from 'vitest';
import {
  CALLSIGN_STORAGE_KEY,
  isCallsignReady,
  persistCallsign,
  readCallsign,
  sanitizeCallsignInput,
} from './callsign.js';

class MemoryStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe('callsign preference', () => {
  it('reuses the established key and does not rewrite a stored value while reading it', () => {
    const storage = new MemoryStorage();
    storage.values.set(CALLSIGN_STORAGE_KEY, 'Stored Callsign');

    expect(CALLSIGN_STORAGE_KEY).toBe('mmr_nickname');
    expect(readCallsign(storage)).toBe('Stored Callsign');
    expect(storage.values.get(CALLSIGN_STORAGE_KEY)).toBe('Stored Callsign');
  });

  it('matches the legacy input allowlist and length cap when the player edits', () => {
    expect(sanitizeCallsignInput(' Mighty!_Man-2.0?xxxxxxxx ')).toBe('Mighty_Man-2.0xx');
    expect(persistCallsign(new MemoryStorage(), 'A B')).toBe('AB');
  });

  it('keeps the established two-character readiness boundary', () => {
    expect(isCallsignReady('')).toBe(false);
    expect(isCallsignReady('A')).toBe(false);
    expect(isCallsignReady('AB')).toBe(true);
  });
});
