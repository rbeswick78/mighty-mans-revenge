import { describe, expect, it } from 'vitest';
import {
  REFORGED_SETTINGS_SECTIONS,
  buildReforgedSettingsSection,
  nextAudioVolumeStep,
  type ReforgedSettingsRuntimeSnapshot,
} from './settings-model.js';

function snapshot(
  overrides: Partial<ReforgedSettingsRuntimeSnapshot> = {},
): ReforgedSettingsRuntimeSnapshot {
  return {
    callsign: 'Batch9',
    muted: false,
    masterVolume: 1,
    sfxVolume: 0.75,
    musicVolume: 0.5,
    fullscreenActive: false,
    connectionState: 'connected',
    ...overrides,
  };
}

describe('Reforged Settings presentation', () => {
  it('owns only the six established settings categories', () => {
    expect(REFORGED_SETTINGS_SECTIONS.map((section) => section.id)).toEqual([
      'profile',
      'audio',
      'controls',
      'graphics',
      'display',
      'signal',
    ]);
  });

  it('keeps controls and current graphics semantics read-only', () => {
    expect(buildReforgedSettingsSection('controls', snapshot())).toMatchObject({
      authority: 'READ ONLY / NO MODE TOGGLE',
    });
    expect(buildReforgedSettingsSection('graphics', snapshot()).columns.flat()).toEqual(
      expect.arrayContaining(['FULL CURRENT EFFECTS', 'QUALITY SEMANTICS UNCHANGED']),
    );
  });

  it('projects existing audio values without mutating them and advances only on an action', () => {
    expect(buildReforgedSettingsSection('audio', snapshot()).columns.flat()).toEqual(
      expect.arrayContaining(['MASTER / 100%', 'SFX / 75%', 'MUSIC / 50%']),
    );
    expect(nextAudioVolumeStep(0.5)).toBe(0.75);
    expect(nextAudioVolumeStep(1)).toBe(0);
    expect(nextAudioVolumeStep(0.33)).toBe(0.5);
  });

  it('uses the established connection projection and recovery rules', () => {
    expect(
      buildReforgedSettingsSection('signal', snapshot({ connectionState: 'reconnecting' })),
    ).toMatchObject({
      heading: 'WASTELAND SIGNAL / SIGNAL LOST // AUTO-RETRYING',
      authority: 'AUTHORITATIVE TRANSPORT STATE',
    });
    expect(buildReforgedSettingsSection('signal', snapshot()).columns.flat()).toContain(
      'RETRY USES THE EXISTING TRANSPORT ACTION',
    );
  });
});
