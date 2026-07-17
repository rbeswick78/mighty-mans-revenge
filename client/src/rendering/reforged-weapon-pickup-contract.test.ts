import { describe, expect, it } from 'vitest';
import { PickupType } from '@shared/types/pickup.js';
import runtimeImport from '../../public/assets/reforged/weapon-pickup-art/weapon-pickup-art.core.json';
import {
  REFORGED_FUTURE_GUN_ART_IDS,
  REFORGED_GUN_ART_IDS,
  liveReforgedGunArtId,
  normalizeReforgedWeaponPickupImportMetadata,
  reforgedGunAnimationKey,
  reforgedGunFrameIndices,
  reforgedGunPresentationFrame,
  reforgedPickupFrame,
  reforgedRarityFrame,
  reforgedSupplyFrame,
  reforgedWeaponPickupQualityTreatment,
  shouldUseReforgedGunArt,
} from './reforged-weapon-pickup-contract.js';

describe('Reforged weapon and pickup contract', () => {
  it('accepts only the exact runtime-safe 158-frame import', () => {
    expect(normalizeReforgedWeaponPickupImportMetadata(runtimeImport)).not.toBeNull();
    expect(
      normalizeReforgedWeaponPickupImportMetadata({ ...runtimeImport, frames: {} }),
    ).toBeNull();
    expect(
      normalizeReforgedWeaponPickupImportMetadata({
        ...runtimeImport,
        atlas: { ...runtimeImport.atlas, width: 2048 },
      }),
    ).toBeNull();
  });

  it('registers deterministic held, firing, dry, ground, HUD, ammo, and container frames', () => {
    expect(reforgedGunFrameIndices('hold', 'down')).toEqual([0, 1]);
    expect(reforgedGunFrameIndices('shoot', 'side-left')).toEqual([14, 15]);
    expect(reforgedGunFrameIndices('dry', 'up')).toEqual([17]);
    expect(reforgedGunFrameIndices('racking', 'side')).toEqual([4, 5]);
    expect(reforgedGunAnimationKey('shotgun', 'shoot', 'side')).toBe(
      'reforged-weapon-shotgun-side-shoot',
    );
    expect(reforgedGunPresentationFrame('rifle', 'ground')).toBe('weapon.rifle.core/020');
    expect(reforgedGunPresentationFrame('launcher', 'container')).toBe('weapon.launcher.core/023');
  });

  it('keeps future gun art mechanically dormant and bat/punch on fallback', () => {
    expect(REFORGED_GUN_ART_IDS).toEqual([
      'rifle',
      'pistol',
      'shotgun',
      'smg',
      'sniper-rifle',
      'launcher',
    ]);
    expect(REFORGED_FUTURE_GUN_ART_IDS).toEqual(['smg', 'sniper-rifle', 'launcher']);
    expect(liveReforgedGunArtId('rifle')).toBe('rifle');
    expect(liveReforgedGunArtId('bat')).toBeNull();
    expect(liveReforgedGunArtId('punch')).toBeNull();
    expect(shouldUseReforgedGunArt('shotgun', true, true)).toBe(true);
    expect(shouldUseReforgedGunArt('pistol', false, true)).toBe(false);
    expect(shouldUseReforgedGunArt('rifle', true, false)).toBe(false);
  });

  it('maps only authoritative current pickup types and preserves bat fallback', () => {
    expect(reforgedPickupFrame(PickupType.GUN_AMMO)).toBe('pickup.sustain.core/000');
    expect(reforgedPickupFrame(PickupType.GRENADE)).toBe('pickup.sustain.core/001');
    expect(reforgedPickupFrame(PickupType.BANDAGE)).toBe('pickup.sustain.core/002');
    expect(reforgedPickupFrame(PickupType.ARMOR)).toBe('pickup.sustain.core/003');
    expect(reforgedPickupFrame(PickupType.OVERCHARGE)).toBe('pickup.sustain.core/004');
    expect(reforgedPickupFrame(PickupType.WEAPON_PISTOL)).toBe('weapon.pistol.core/020');
    expect(reforgedPickupFrame(PickupType.WEAPON_SHOTGUN)).toBe('weapon.shotgun.core/020');
    expect(reforgedPickupFrame(PickupType.WEAPON_BAT)).toBeNull();
    expect(reforgedSupplyFrame('supply')).toBe('pickup.sustain.core/005');
    expect(reforgedSupplyFrame('container')).toBe('pickup.sustain.core/006');
  });

  it('locks grayscale-readable rarity shape order without adding mechanics', () => {
    expect(
      ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythical'].map((rarity) =>
        reforgedRarityFrame(rarity as Parameters<typeof reforgedRarityFrame>[0]),
      ),
    ).toEqual([
      'rarity.presentation.core/000',
      'rarity.presentation.core/001',
      'rarity.presentation.core/002',
      'rarity.presentation.core/003',
      'rarity.presentation.core/004',
      'rarity.presentation.core/005',
    ]);
  });

  it('retains essential presentation in full and reduced quality', () => {
    expect(reforgedWeaponPickupQualityTreatment('reduced')).toMatchObject({
      badge: true,
      rim: true,
      mainSilhouette: true,
      pickupIdentity: true,
      timing: true,
      boundedFacets: false,
      softLight: false,
      secondaryMotion: false,
      bloom: false,
      extraParticles: false,
    });
    expect(reforgedWeaponPickupQualityTreatment('full')).toMatchObject({
      boundedFacets: true,
      softLight: true,
      secondaryMotion: true,
      bloom: false,
      extraParticles: false,
    });
  });
});
