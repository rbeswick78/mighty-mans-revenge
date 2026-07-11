import { describe, expect, it } from 'vitest';
import { TileType } from '@shared/types/map.js';
import { MAP_REGISTRY } from '@shared/maps/registry.js';
import {
  DEFAULT_THEME_ID,
  MAP_THEMES,
  WALL_STYLES,
  getTheme,
  pickRoofFrame,
  pickVariant,
} from './map-themes.js';

const F = TileType.FLOOR;
const W = TileType.WALL;

describe('getTheme', () => {
  it('resolves known theme ids', () => {
    expect(getTheme('suburb')).toBe(MAP_THEMES.suburb);
    expect(getTheme('scrapyard')).toBe(MAP_THEMES.scrapyard);
    expect(getTheme('overpass')).toBe(MAP_THEMES.overpass);
  });

  it('falls back to wasteland for undefined and unknown ids', () => {
    expect(getTheme(undefined)).toBe(MAP_THEMES[DEFAULT_THEME_ID]);
    expect(getTheme('not-a-theme')).toBe(MAP_THEMES[DEFAULT_THEME_ID]);
  });

  it('every registered map resolves to a fully-defined theme', () => {
    for (const m of MAP_REGISTRY.values()) {
      const theme = getTheme(m.theme);
      expect(theme.floorVariants.length).toBeGreaterThan(0);
      expect(theme.coverVariants.length).toBeGreaterThan(0);
      expect(WALL_STYLES[theme.outerWall]).toBeDefined();
      expect(WALL_STYLES[theme.innerWall]).toBeDefined();
    }
  });

  it('the post-launch maps declare non-default themes', () => {
    expect(getTheme('suburb')).not.toBe(getTheme(undefined));
    expect(getTheme('scrapyard')).not.toBe(getTheme(undefined));
    expect(getTheme('overpass')).not.toBe(getTheme(undefined));
    expect(getTheme('suburb').floorTexture).not.toBe(
      getTheme('scrapyard').floorTexture,
    );
    expect(getTheme('overpass').innerWall).toBe('roofDark');
  });
});

describe('pickVariant', () => {
  it('is deterministic per cell', () => {
    const variants = [7, 8, 9];
    expect(pickVariant(variants, 3, 5)).toBe(pickVariant(variants, 3, 5));
  });

  it('always returns a member of the pool', () => {
    const variants = [7, 8, 9];
    for (let r = 0; r < 12; r++) {
      for (let c = 0; c < 20; c++) {
        expect(variants).toContain(pickVariant(variants, r, c));
      }
    }
  });

  it('short-circuits single-variant pools', () => {
    expect(pickVariant([42], 999, 999)).toBe(42);
  });
});

describe('pickRoofFrame', () => {
  // A 3-tall wall column inside a 5x5 floor field: rows 1-3 at col 2.
  const grid = [
    [F, F, F, F, F],
    [F, F, W, F, F],
    [F, F, W, F, F],
    [F, F, W, F, F],
    [F, F, F, F, F],
  ];

  const TOP = [0, 1, 2];
  const FILL = [16, 17, 18, 48, 49, 50];
  const BOTTOM = [64, 65, 66];

  it('caps the top, fills the middle, caps the bottom', () => {
    expect(TOP).toContain(pickRoofFrame(grid, 5, 5, 1, 2, 0));
    expect(FILL).toContain(pickRoofFrame(grid, 5, 5, 2, 2, 0));
    expect(BOTTOM).toContain(pickRoofFrame(grid, 5, 5, 3, 2, 0));
  });

  it('1-thick horizontal runs wear the top cap', () => {
    const run = [
      [F, F, F],
      [W, W, W],
      [F, F, F],
    ];
    expect(TOP).toContain(pickRoofFrame(run, 3, 3, 1, 1, 0));
  });

  it('the red set is the dark frame shifted by the color offset', () => {
    const dark = pickRoofFrame(grid, 5, 5, 2, 2, 0);
    const red = pickRoofFrame(grid, 5, 5, 2, 2, 8);
    expect(red).toBe(dark + 8);
  });

  it('roofDark and roofRed wall styles share a texture but not frames', () => {
    const dark = WALL_STYLES.roofDark;
    const red = WALL_STYLES.roofRed;
    expect(dark.texture).toBe(red.texture);
    expect(red.pick(grid, 5, 5, 2, 2)).toBe(dark.pick(grid, 5, 5, 2, 2) + 8);
  });
});
