import { GRENADE } from '@shared/config/game.js';
import { describe, expect, it } from 'vitest';
import runtimeImport from '../../public/assets/reforged/combat-feedback-art/combat-feedback-art.core.json';
import {
  REFORGED_ARMOR_FRAMES,
  REFORGED_COMBAT_FEEDBACK_DIRECTIONS,
  REFORGED_COMBAT_FEEDBACK_EXPLOSION_RADIUS_PX,
  REFORGED_COMBAT_FEEDBACK_FAMILIES,
  REFORGED_COMBAT_FEEDBACK_FIGHTERS,
  REFORGED_COMBAT_FEEDBACK_POOL_CAPACITY,
  REFORGED_COMBAT_FEEDBACK_RARITIES,
  REFORGED_COMBAT_FEEDBACK_TIMING_MS,
  REFORGED_EXPLOSION_FRAMES,
  REFORGED_HEALING_FRAMES,
  REFORGED_ZONE_FRAMES,
  normalizeReforgedCombatFeedbackImportMetadata,
  reforgedAbilityFrames,
  reforgedAbilityReleaseRotation,
  reforgedCombatFeedbackDirection,
  reforgedCombatFeedbackQualityTreatment,
  reforgedEliminationFrames,
  reforgedFeedbackAnimationFrame,
  reforgedImpactFrames,
  reforgedMuzzleFrames,
  reforgedRarityFrame,
  selectReforgedFeedbackPoolSlot,
  shouldPresentReforgedCombatFeedback,
  shouldReleaseReforgedAbilityFeedback,
} from './reforged-combat-feedback-contract.js';

describe('Reforged combat-feedback contract', () => {
  it('accepts only the exact runtime-safe 96-frame isolated import', () => {
    expect(normalizeReforgedCombatFeedbackImportMetadata(runtimeImport)).not.toBeNull();
    expect(
      normalizeReforgedCombatFeedbackImportMetadata({ ...runtimeImport, frames: {} }),
    ).toBeNull();
    expect(
      normalizeReforgedCombatFeedbackImportMetadata({
        ...runtimeImport,
        atlas: { ...runtimeImport.atlas, width: 2048 },
      }),
    ).toBeNull();
  });

  it('covers every established presentation family and all six fighter releases', () => {
    expect(REFORGED_COMBAT_FEEDBACK_FAMILIES).toEqual([
      'muzzle',
      'scenery-impact',
      'player-impact',
      'explosion',
      'healing',
      'armor',
      'ability',
      'rarity',
      'zone',
      'elimination',
    ]);
    expect(REFORGED_COMBAT_FEEDBACK_FIGHTERS).toEqual([
      'mighty_man',
      'bruce',
      'frost_wizard',
      'bubba',
      'jack',
      'rook',
    ]);
    expect(REFORGED_COMBAT_FEEDBACK_RARITIES).toHaveLength(6);
    expect(REFORGED_COMBAT_FEEDBACK_TIMING_MS).toEqual({
      muzzle: 120,
      'scenery-impact': 150,
      'player-impact': 150,
      explosion: 420,
      healing: 360,
      armor: 360,
      ability: 300,
      rarity: 600,
      zone: 800,
      elimination: 260,
    });
  });

  it('locks exact direction, origin family, and timing frame registrations', () => {
    expect(REFORGED_COMBAT_FEEDBACK_DIRECTIONS).toEqual(['side', 'down', 'side-left', 'up']);
    expect(reforgedCombatFeedbackDirection(0)).toBe('side');
    expect(reforgedCombatFeedbackDirection(Math.PI / 2)).toBe('down');
    expect(reforgedCombatFeedbackDirection(Math.PI)).toBe('side-left');
    expect(reforgedCombatFeedbackDirection(-Math.PI / 2)).toBe('up');
    expect(reforgedMuzzleFrames('side')).toEqual([
      'feedback.presentation.core/000',
      'feedback.presentation.core/001',
      'feedback.presentation.core/002',
      'feedback.presentation.core/003',
    ]);
    expect(reforgedImpactFrames('scenery', 'up')).toEqual([
      'feedback.presentation.core/025',
      'feedback.presentation.core/026',
      'feedback.presentation.core/027',
    ]);
    expect(reforgedImpactFrames('player', 'up')).toEqual([
      'feedback.presentation.core/037',
      'feedback.presentation.core/038',
      'feedback.presentation.core/039',
    ]);
    expect(REFORGED_EXPLOSION_FRAMES).toHaveLength(8);
    expect(REFORGED_HEALING_FRAMES).toHaveLength(4);
    expect(REFORGED_ARMOR_FRAMES).toHaveLength(4);
    expect(reforgedAbilityFrames('rook')).toEqual([
      'feedback.presentation.core/071',
      'feedback.presentation.core/072',
      'feedback.presentation.core/073',
    ]);
    expect(reforgedAbilityReleaseRotation('bruce', Math.PI / 3)).toBe(Math.PI / 3);
    expect(reforgedAbilityReleaseRotation('jack', -Math.PI / 2)).toBe(-Math.PI / 2);
    expect(reforgedAbilityReleaseRotation('rook', Math.PI)).toBe(Math.PI);
    expect(reforgedAbilityReleaseRotation('mighty_man', Math.PI)).toBe(0);
    expect(reforgedAbilityReleaseRotation('frost_wizard', Math.PI)).toBe(0);
    expect(reforgedAbilityReleaseRotation('bubba', Math.PI)).toBe(0);
    expect(reforgedRarityFrame('mythic')).toBe('feedback.presentation.core/079');
    expect(REFORGED_ZONE_FRAMES).toHaveLength(8);
    expect(reforgedEliminationFrames('up')).toEqual([
      'feedback.presentation.core/094',
      'feedback.presentation.core/095',
    ]);
  });

  it('uses the unchanged authoritative grenade radius and never infers future live mechanics', () => {
    expect(GRENADE.BLAST_RADIUS / REFORGED_COMBAT_FEEDBACK_EXPLOSION_RADIUS_PX).toBe(3.2);
    for (const family of REFORGED_COMBAT_FEEDBACK_FAMILIES) {
      expect(shouldPresentReforgedCombatFeedback(family, 'verification-preview', true, true)).toBe(
        true,
      );
      expect(
        shouldPresentReforgedCombatFeedback(family, 'live-established-event', false, true),
      ).toBe(false);
      expect(
        shouldPresentReforgedCombatFeedback(family, 'live-established-event', true, false),
      ).toBe(false);
    }
    expect(
      shouldPresentReforgedCombatFeedback('rarity', 'live-established-event', true, true),
    ).toBe(false);
    expect(shouldPresentReforgedCombatFeedback('zone', 'live-established-event', true, true)).toBe(
      false,
    );
    expect(
      shouldPresentReforgedCombatFeedback('player-impact', 'live-established-event', true, true),
    ).toBe(true);
  });

  it('retains every decisive read in reduced quality without bloom', () => {
    expect(reforgedCombatFeedbackQualityTreatment('reduced')).toEqual({
      decisiveEvent: true,
      confirmedImpactPoint: true,
      explosionRadiusCue: true,
      healingArmorIdentity: true,
      abilityRelease: true,
      rarityShape: true,
      zoneBoundary: true,
      eliminationCue: true,
      secondarySparks: false,
      smokeDebrisFacets: false,
      softLight: false,
      shortTrails: false,
      bloomRequired: false,
      poolLimit: 16,
    });
    expect(reforgedCombatFeedbackQualityTreatment('full')).toMatchObject({
      decisiveEvent: true,
      secondarySparks: true,
      smokeDebrisFacets: true,
      softLight: true,
      shortTrails: true,
      bloomRequired: false,
      poolLimit: REFORGED_COMBAT_FEEDBACK_POOL_CAPACITY,
    });
  });

  it('releases each established fighter cue only from authoritative snapshot edges', () => {
    const idle = { active: false, cooling: false };
    const active = { active: true, cooling: true };
    for (const fighter of ['mighty_man', 'bruce', 'bubba'] as const) {
      expect(shouldReleaseReforgedAbilityFeedback(fighter, idle, active, false)).toBe(true);
      expect(shouldReleaseReforgedAbilityFeedback(fighter, active, active, false)).toBe(false);
    }
    for (const fighter of ['frost_wizard', 'jack', 'rook'] as const) {
      expect(shouldReleaseReforgedAbilityFeedback(fighter, idle, active, false)).toBe(true);
      expect(shouldReleaseReforgedAbilityFeedback(fighter, active, active, false)).toBe(false);
    }
    expect(shouldReleaseReforgedAbilityFeedback('bruce', null, active, false)).toBe(false);
    expect(shouldReleaseReforgedAbilityFeedback('rook', idle, active, true)).toBe(false);
  });

  it('reuses a deterministic bounded FIFO pool and clamps animation timing', () => {
    const slots = [
      { active: true, sequence: 8 },
      { active: false, sequence: 0 },
      { active: true, sequence: 2 },
      { active: true, sequence: 4 },
    ];
    expect(selectReforgedFeedbackPoolSlot(slots, 4)).toBe(1);
    expect(
      selectReforgedFeedbackPoolSlot(
        slots.map((slot) => ({ ...slot, active: true })),
        4,
      ),
    ).toBe(1);
    expect(selectReforgedFeedbackPoolSlot(slots, 0)).toBe(-1);
    expect(reforgedFeedbackAnimationFrame(4, 0, 120)).toBe(0);
    expect(reforgedFeedbackAnimationFrame(4, 60, 120)).toBe(2);
    expect(reforgedFeedbackAnimationFrame(4, 120, 120)).toBe(3);
  });
});
