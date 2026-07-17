import { describe, expect, it } from 'vitest';
import runtimeImport from '../../public/assets/reforged/biome-environment-art/biome-environment-art.core.json';
import {
  REFORGED_BIOME_FAMILIES,
  REFORGED_BIOME_TRANSITIONS,
  REFORGED_ENVIRONMENT_FRAME_ROLES,
  normalizeReforgedEnvironmentImportMetadata,
  reforgedEnvironmentFrame,
  reforgedBiomeFamilyForTheme,
  reforgedEnvironmentDecorationRole,
  reforgedEnvironmentDamagedRole,
  reforgedEnvironmentTileRole,
  reforgedEnvironmentQualityTreatment,
  shouldPresentReforgedEnvironmentKit,
} from './reforged-environment-contract.js';

describe('Reforged biome environment contract', () => {
  it('accepts only the exact runtime-safe 80-frame isolated import', () => {
    expect(normalizeReforgedEnvironmentImportMetadata(runtimeImport)).not.toBeNull();
    expect(normalizeReforgedEnvironmentImportMetadata({ ...runtimeImport, frames: {} })).toBeNull();
    expect(
      normalizeReforgedEnvironmentImportMetadata({
        ...runtimeImport,
        atlas: { ...runtimeImport.atlas, width: 2048 },
      }),
    ).toBeNull();
  });

  it('locks all four families and exact terrain/collision/damage/prop/landmark/shadow roles', () => {
    expect(REFORGED_BIOME_FAMILIES).toEqual(['wasteland', 'overgrown', 'industrial', 'irradiated']);
    expect(REFORGED_ENVIRONMENT_FRAME_ROLES).toEqual({
      'ground-a': 0,
      'ground-b': 1,
      'ground-c': 2,
      'transition-horizontal': 3,
      'transition-vertical': 4,
      'transition-corner': 5,
      'wall-intact': 6,
      'wall-damaged': 7,
      'low-cover-intact': 8,
      'low-cover-damaged': 9,
      'prop-a-intact': 10,
      'prop-a-damaged': 11,
      'prop-b-intact': 12,
      'prop-b-damaged': 13,
      'landmark-intact': 14,
      'landmark-damaged': 15,
      'shadow-wall': 16,
      'shadow-low-cover': 17,
      'shadow-prop': 18,
      'navigation-anchor': 19,
    });
    expect(reforgedEnvironmentFrame('wasteland', 'ground-a')).toBe(
      'environment.wasteland.core/000',
    );
    expect(reforgedEnvironmentFrame('irradiated', 'navigation-anchor')).toBe(
      'environment.irradiated.core/019',
    );
  });

  it('keeps transition pairings deterministic and complete', () => {
    expect(REFORGED_BIOME_TRANSITIONS).toEqual({
      wasteland: 'overgrown',
      overgrown: 'industrial',
      industrial: 'irradiated',
      irradiated: 'wasteland',
    });
  });

  it('keeps the kit dormant for live maps and gates only the verification preview', () => {
    expect(shouldPresentReforgedEnvironmentKit('verification-preview', true, true)).toBe(true);
    expect(shouldPresentReforgedEnvironmentKit('verification-preview', false, true)).toBe(false);
    expect(shouldPresentReforgedEnvironmentKit('verification-preview', true, false)).toBe(false);
    expect(shouldPresentReforgedEnvironmentKit('live-map', true, true)).toBe(true);
  });

  it('projects current map themes, collision classes, and compatible decorations only', () => {
    expect(reforgedBiomeFamilyForTheme(undefined)).toBe('wasteland');
    expect(reforgedBiomeFamilyForTheme('suburb')).toBe('overgrown');
    expect(reforgedBiomeFamilyForTheme('refinery')).toBe('industrial');
    expect(reforgedBiomeFamilyForTheme('future-theme')).toBe('wasteland');
    expect(reforgedEnvironmentTileRole(1, 1, 1)).toBe('wall-intact');
    expect(reforgedEnvironmentTileRole(2, 1, 1)).toBe('low-cover-intact');
    expect(
      reforgedEnvironmentDecorationRole({
        x: 0,
        y: 0,
        w: 1,
        h: 1,
        texture: 'deco_barrel_red',
        hazard: 'explosive_barrel',
      }),
    ).toBe('prop-b-intact');
    expect(
      reforgedEnvironmentDecorationRole({
        x: 0,
        y: 0,
        w: 1,
        h: 1,
        texture: 'tiles_wire_fence_closing',
        interaction: 'shootable_gate',
      }),
    ).toBeNull();
    expect(reforgedEnvironmentDamagedRole('landmark-intact')).toBe('landmark-damaged');
  });

  it('retains gameplay-readable essentials in full and reduced quality', () => {
    expect(reforgedEnvironmentQualityTreatment('reduced')).toEqual({
      groundHierarchy: true,
      collisionSilhouette: true,
      damagedPairing: true,
      landmarkNegativeSpace: true,
      transitionEdges: true,
      shadowDirection: true,
      navigationAnchor: true,
      secondaryWear: false,
      decorativeFlecks: false,
      bloom: false,
      additiveAtmosphere: false,
    });
    expect(reforgedEnvironmentQualityTreatment('full')).toMatchObject({
      groundHierarchy: true,
      collisionSilhouette: true,
      secondaryWear: true,
      decorativeFlecks: true,
      bloom: false,
      additiveAtmosphere: false,
    });
  });
});
