import { describe, expect, it } from 'vitest';

import { CHARACTER_IDS } from '@shared/config/game.js';
import { reforgedFighterPreview } from './reforged-fighter-preview.js';

describe('Reforged fighter selection and Results previews', () => {
  it('projects every roster identity from the approved fighter atlases', () => {
    const previews = CHARACTER_IDS.map((id) => reforgedFighterPreview(id, 'down', true));
    expect(previews.every(Boolean)).toBe(true);
    expect(previews.map((preview) => preview?.body.texture)).toEqual([
      'reforged-fighter-art-i',
      'reforged-fighter-art-i',
      'reforged-fighter-art-i',
      'reforged-fighter-art-ii',
      'reforged-fighter-art-ii',
      'reforged-fighter-art-ii',
    ]);
    expect(previews[4]?.body.frame).toContain('fighter.jack.axe-present');
    expect(previews[5]?.overlay?.frame).toContain('fighter.rook.helmet');
  });

  it('retains the complete legacy preview when the atomic cutover is inactive', () => {
    for (const id of CHARACTER_IDS) expect(reforgedFighterPreview(id, 'side', false)).toBeNull();
  });
});
