import { describe, expect, it } from 'vitest';
import runtimeImport from '../../public/assets/reforged/fighter-art-ii/fighter-art-ii.core.json';
import {
  REFORGED_FIGHTER_ART_II_IDS,
  expectedReforgedFighterArtIIFrameCount,
  normalizeReforgedFighterArtIIImportMetadata,
  reforgedFighterArtIIAnimationKey,
  reforgedFighterArtIIAssetForCharacter,
  reforgedFighterArtIIDeathFrameIndices,
  reforgedFighterArtIIFrameName,
  reforgedFighterArtIILivingFrameIndices,
  reforgedFighterArtIIQualityTreatment,
  shouldUseReforgedFighterArtIIBody,
  type ReforgedFighterArtIIAsset,
} from './reforged-fighter-art-ii-contract.js';

describe('Reforged Fighter Art II contract', () => {
  it('accepts the committed runtime-safe import and rejects incomplete metadata', () => {
    expect(normalizeReforgedFighterArtIIImportMetadata(runtimeImport)).not.toBeNull();
    expect(
      normalizeReforgedFighterArtIIImportMetadata({ ...runtimeImport, frames: {} }),
    ).toBeNull();
    expect(
      normalizeReforgedFighterArtIIImportMetadata({
        ...runtimeImport,
        atlas: { ...runtimeImport.atlas, height: 1024 },
      }),
    ).toBeNull();
    expect(
      normalizeReforgedFighterArtIIImportMetadata({
        ...runtimeImport,
        assets: { ...runtimeImport.assets, 'fighter.unowned.core': { frameCount: 1 } },
      }),
    ).toBeNull();
  });

  it('maps every directional living state to the same exact registered grid', () => {
    const seen = new Set<number>();
    for (const state of ['idle', 'move', 'attack', 'ability', 'damage'] as const) {
      for (const direction of ['down', 'up', 'side', 'side-left'] as const) {
        const frames = reforgedFighterArtIILivingFrameIndices(state, direction);
        expect(frames).toHaveLength(state === 'idle' || state === 'damage' ? 2 : 4);
        for (const frame of frames) {
          expect(seen.has(frame)).toBe(false);
          seen.add(frame);
        }
      }
    }
    expect([...seen]).toEqual(Array.from({ length: 64 }, (_, index) => index));
  });

  it('preserves exact Bubba, Jack, and Rook death cycles and facings', () => {
    expect(reforgedFighterArtIIDeathFrameIndices('bubba', 'side-left', 2)).toEqual([
      82, 83, 84, 85, 86, 87,
    ]);
    expect(reforgedFighterArtIIDeathFrameIndices('jack-axe-present', 'side', 9)).toEqual([
      64, 65, 66, 67, 68, 69,
    ]);
    expect(reforgedFighterArtIIDeathFrameIndices('jack-axe-absent', 'side', 3)).toEqual([
      64, 65, 66, 67, 68, 69,
    ]);
    expect(reforgedFighterArtIIDeathFrameIndices('rook-body', 'side-left', 2)).toEqual([
      70, 71, 72, 73, 74, 75,
    ]);
    expect(reforgedFighterArtIIDeathFrameIndices('rook-helmet', 'side-left', 2)).toEqual([
      70, 71, 72, 73, 74, 75,
    ]);
  });

  it('keeps Jack state truth and Rook body/helmet grids synchronized', () => {
    expect(reforgedFighterArtIIAssetForCharacter('jack', false)).toBe('jack-axe-present');
    expect(reforgedFighterArtIIAssetForCharacter('jack', true)).toBe('jack-axe-absent');
    expect(reforgedFighterArtIIAssetForCharacter('rook', false, 'body')).toBe('rook-body');
    expect(reforgedFighterArtIIAssetForCharacter('rook', false, 'helmet')).toBe('rook-helmet');
    const rookAbilityFrames = reforgedFighterArtIILivingFrameIndices('ability', 'side');
    expect(
      rookAbilityFrames.map((frame) => reforgedFighterArtIIFrameName('rook-body', frame)),
    ).toEqual(
      rookAbilityFrames.map((frame) => `fighter.rook.body/${String(frame).padStart(3, '0')}`),
    );
    expect(
      rookAbilityFrames.map((frame) => reforgedFighterArtIIFrameName('rook-helmet', frame)),
    ).toEqual(
      rookAbilityFrames.map((frame) => `fighter.rook.helmet/${String(frame).padStart(3, '0')}`),
    );
    expect(reforgedFighterArtIIFrameName('rook-body', 75)).toBe('fighter.rook.body/075');
    expect(reforgedFighterArtIIFrameName('rook-helmet', 75)).toBe('fighter.rook.helmet/075');
    expect(reforgedFighterArtIIAnimationKey('rook-body', 'death', 'side', 8)).toContain('-v1');
    expect(reforgedFighterArtIIAnimationKey('jack-axe-absent', 'death', 'side', 2)).toContain(
      '-v2',
    );
  });

  it('declares exact source totals for only the Batch 29 roster and layers', () => {
    expect(REFORGED_FIGHTER_ART_II_IDS).toEqual(['bubba', 'jack', 'rook']);
    expect(
      (
        [
          'bubba',
          'jack-axe-absent',
          'jack-axe-present',
          'rook-body',
          'rook-helmet',
        ] as ReforgedFighterArtIIAsset[]
      ).map(expectedReforgedFighterArtIIFrameCount),
    ).toEqual([88, 88, 76, 76, 76]);
  });

  it('selects bodies only when capability, atlas, and carried-object truth agree', () => {
    expect(shouldUseReforgedFighterArtIIBody('bubba', 'rifle', true, true)).toBe(true);
    expect(shouldUseReforgedFighterArtIIBody('jack', 'rifle', true, true)).toBe(true);
    expect(shouldUseReforgedFighterArtIIBody('rook', 'rifle', true, true)).toBe(true);
    expect(shouldUseReforgedFighterArtIIBody('rook', 'pistol', true, true)).toBe(false);
    expect(shouldUseReforgedFighterArtIIBody('rook', 'bat', true, true)).toBe(false);
    expect(shouldUseReforgedFighterArtIIBody('mighty_man', 'rifle', true, true)).toBe(false);
    expect(shouldUseReforgedFighterArtIIBody('bubba', 'rifle', false, true)).toBe(false);
    expect(shouldUseReforgedFighterArtIIBody('jack', 'rifle', true, false)).toBe(false);
  });

  it('keeps authored body, ability, and synchronized layers essential in both tiers', () => {
    expect(reforgedFighterArtIIQualityTreatment('full')).toEqual({
      authoredBodyStates: true,
      authoredAbilityCue: true,
      synchronizedLayers: true,
      secondaryParticles: true,
    });
    expect(reforgedFighterArtIIQualityTreatment('reduced')).toEqual({
      authoredBodyStates: true,
      authoredAbilityCue: true,
      synchronizedLayers: true,
      secondaryParticles: false,
    });
  });
});
