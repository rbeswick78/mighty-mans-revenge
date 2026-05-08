import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MAP_NAME,
  MAP_REGISTRY,
  getMap,
  listMapNames,
} from './registry.js';
import { validateMap } from '../utils/map-validator.js';

describe('MAP_REGISTRY', () => {
  it('contains the default map', () => {
    expect(MAP_REGISTRY.has(DEFAULT_MAP_NAME)).toBe(true);
  });

  it('getMap returns the default map by name', () => {
    const m = getMap(DEFAULT_MAP_NAME);
    expect(m.name).toBe(DEFAULT_MAP_NAME);
    expect(m.tiles.length).toBe(m.height);
  });

  it('getMap throws for an unknown name', () => {
    expect(() => getMap('does-not-exist')).toThrow(/Unknown map/);
  });

  it('listMapNames includes the default map', () => {
    expect(listMapNames()).toContain(DEFAULT_MAP_NAME);
  });

  it('every registered map passes validateMap', () => {
    for (const m of MAP_REGISTRY.values()) {
      const r = validateMap(m);
      expect(r.valid, `invalid map "${m.name}": ${r.errors.join('; ')}`).toBe(
        true,
      );
    }
  });
});
