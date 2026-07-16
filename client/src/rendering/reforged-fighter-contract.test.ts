import { describe, expect, it } from 'vitest';
import runtimeImport from '../../public/assets/reforged/fighter-art-i/fighter-art-i.core.json';
import {
  REFORGED_FIGHTER_IDS,
  expectedReforgedFighterFrameCount,
  normalizeReforgedFighterImportMetadata,
  reforgedFighterQualityTreatment,
  reforgedFighterAnimationKey,
  reforgedFighterDeathFrameIndices,
  reforgedFighterLivingFrameIndices,
  shouldUseReforgedFighterBody,
} from './reforged-fighter-contract.js';

describe('Reforged Fighter Art I contract', () => {
  it('accepts the committed runtime-safe import and rejects incomplete metadata', () => {
    expect(normalizeReforgedFighterImportMetadata(runtimeImport)).not.toBeNull();
    expect(normalizeReforgedFighterImportMetadata({ ...runtimeImport, frames: {} })).toBeNull();
    expect(
      normalizeReforgedFighterImportMetadata({
        ...runtimeImport,
        atlas: { ...runtimeImport.atlas, width: 1024 },
      }),
    ).toBeNull();
    expect(
      normalizeReforgedFighterImportMetadata({
        ...runtimeImport,
        assets: { ...runtimeImport.assets, 'fighter.unowned.core': { frameCount: 1 } },
      }),
    ).toBeNull();
  });

  it('maps every directional living state to disjoint exact frame ranges', () => {
    const seen = new Set<number>();
    for (const state of ['idle', 'move', 'attack', 'ability', 'damage'] as const) {
      for (const direction of ['down', 'up', 'side', 'side-left'] as const) {
        const frames = reforgedFighterLivingFrameIndices(state, direction);
        expect(frames).toHaveLength(state === 'idle' || state === 'damage' ? 2 : 4);
        for (const frame of frames) {
          expect(seen.has(frame)).toBe(false);
          seen.add(frame);
        }
      }
    }
    expect([...seen]).toEqual(Array.from({ length: 64 }, (_, index) => index));
  });

  it('preserves the complete existing death-variant cycles and horizontal facings', () => {
    expect(reforgedFighterDeathFrameIndices('mighty_man', 'side', 1)).toEqual([
      64, 65, 66, 67, 68, 69,
    ]);
    expect(reforgedFighterDeathFrameIndices('mighty_man', 'side-left', 2)).toEqual([
      82, 83, 84, 85, 86, 87,
    ]);
    expect(reforgedFighterDeathFrameIndices('mighty_man', 'side', 4)).toEqual([
      64, 65, 66, 67, 68, 69,
    ]);
    expect(reforgedFighterDeathFrameIndices('bruce', 'side-left', 2)).toEqual([
      82, 83, 84, 85, 86, 87,
    ]);
    expect(reforgedFighterAnimationKey('frost_wizard', 'death', 'side-left', 3)).toContain('v3');
  });

  it('declares exact source frame totals for only the Batch 28 roster', () => {
    expect(REFORGED_FIGHTER_IDS).toEqual(['mighty_man', 'bruce', 'frost_wizard']);
    expect(REFORGED_FIGHTER_IDS.map(expectedReforgedFighterFrameCount)).toEqual([100, 88, 100]);
  });

  it('selects modern bodies only when the capability, atlas, and carried-object truth agree', () => {
    expect(shouldUseReforgedFighterBody('mighty_man', 'rifle', true, true)).toBe(true);
    expect(shouldUseReforgedFighterBody('mighty_man', 'pistol', true, true)).toBe(false);
    expect(shouldUseReforgedFighterBody('mighty_man', 'bat', true, true)).toBe(false);
    expect(shouldUseReforgedFighterBody('bruce', 'rifle', true, true)).toBe(true);
    expect(shouldUseReforgedFighterBody('frost_wizard', 'rifle', true, true)).toBe(true);
    expect(shouldUseReforgedFighterBody('frost_wizard', 'bat', true, true)).toBe(false);
    expect(shouldUseReforgedFighterBody('bubba', 'rifle', true, true)).toBe(false);
    expect(shouldUseReforgedFighterBody('mighty_man', 'rifle', false, true)).toBe(false);
    expect(shouldUseReforgedFighterBody('mighty_man', 'rifle', true, false)).toBe(false);
  });

  it('keeps authored recognition and ability cues essential in full and reduced modes', () => {
    expect(reforgedFighterQualityTreatment('full')).toEqual({
      authoredBodyStates: true,
      authoredAbilityCue: true,
      secondaryParticles: true,
    });
    expect(reforgedFighterQualityTreatment('reduced')).toEqual({
      authoredBodyStates: true,
      authoredAbilityCue: true,
      secondaryParticles: false,
    });
  });
});
