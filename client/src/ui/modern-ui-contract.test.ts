import { describe, expect, it } from 'vitest';

import {
  MODERN_UI_MIN_TOUCH_TARGET,
  contrastRatio,
  modernUiButtonFrame,
  modernUiCardFrame,
  modernUiIconFrame,
  modernUiPanelFrame,
  modernUiTabFrame,
  modernUiTreatment,
  normalizeModernUiImportMetadata,
} from './modern-ui-contract.js';

const validMetadata = {
  schemaVersion: 1,
  atlas: {
    id: 'modern-ui.core',
    image: 'modern-ui.core.png',
    width: 1024,
    height: 256,
    format: 'RGBA8888',
    padding: 3,
    extrude: 2,
    premultipliedAlpha: false,
  },
  frames: Object.fromEntries(
    [
      ...(['panel', 'hud', 'results', 'tactical'] as const).map(modernUiPanelFrame),
      ...(['idle', 'focus', 'selected', 'pressed', 'disabled'] as const).map(modernUiTabFrame),
      ...(['idle', 'focus', 'selected', 'pressed', 'disabled'] as const).map(modernUiCardFrame),
      ...(['primary', 'secondary', 'danger'] as const).flatMap((variant) =>
        (['idle', 'focus', 'pressed', 'disabled'] as const).map((state) =>
          modernUiButtonFrame(variant, state),
        ),
      ),
      ...(
        [
          'play',
          'fighters',
          'challenges',
          'records',
          'settings',
          'party',
          'queue',
          'minimap',
          'hud',
          'results',
          'health',
          'armor',
          'ammo',
          'objective',
          'focus',
          'warning',
        ] as const
      ).map(modernUiIconFrame),
    ].map((name, index) => [
      name,
      {
        assetId: name.startsWith('ui.icon') ? 'ui.icon.language' : 'ui.chrome.states',
        frameIndex: index,
        x: 1,
        y: 1,
        width: name.startsWith('ui.icon') ? 32 : 64,
        height: name.startsWith('ui.icon') ? 32 : 64,
        rotated: false,
        trimmed: false,
      },
    ]),
  ),
  integrity: { textureSha256: 'a'.repeat(64) },
};

describe('modern UI contract', () => {
  it('maps every chrome and icon state to deterministic atlas frames', () => {
    expect(modernUiPanelFrame('results')).toBe('ui.chrome.states/002');
    expect(modernUiTabFrame('focus')).toBe('ui.chrome.states/005');
    expect(modernUiCardFrame('disabled')).toBe('ui.chrome.states/013');
    expect(modernUiButtonFrame('primary', 'pressed')).toBe('ui.chrome.states/020');
    expect(modernUiButtonFrame('danger', 'idle')).toBe('ui.chrome.states/022');
    expect(modernUiIconFrame('party')).toBe('ui.icon.language/005');
    expect(modernUiIconFrame('results')).toBe('ui.icon.language/009');
  });

  it('accepts only complete runtime-safe import metadata', () => {
    expect(normalizeModernUiImportMetadata(validMetadata)).not.toBeNull();
    expect(
      normalizeModernUiImportMetadata({
        ...validMetadata,
        atlas: { ...validMetadata.atlas, id: 'wrong' },
      }),
    ).toBeNull();
    const missing = structuredClone(validMetadata);
    delete missing.frames[modernUiIconFrame('warning')];
    expect(normalizeModernUiImportMetadata(missing)).toBeNull();
  });

  it('keeps focus/icons in both quality tiers and preserves readable contrast/touch size', () => {
    expect(modernUiTreatment('reduced')).toMatchObject({
      focusStroke: true,
      icons: true,
      bloom: false,
      secondaryParticles: false,
    });
    expect(modernUiTreatment('full')).toMatchObject({
      focusStroke: true,
      icons: true,
      bloom: false,
      secondaryParticles: false,
    });
    expect(MODERN_UI_MIN_TOUCH_TARGET).toBeGreaterThanOrEqual(48);
    expect(contrastRatio(0xf3f0df, 0x121a26)).toBeGreaterThan(7);
    expect(contrastRatio(0x090d14, 0xff8a3d)).toBeGreaterThan(5);
    expect(contrastRatio(0x9eafbd, 0x36414b)).toBeGreaterThan(4.5);
  });
});
