import { describe, expect, it } from 'vitest';

import {
  REFORGED_LIVE_FEEDBACK_EVENTS,
  REFORGED_VISUAL_ATLAS_IDS,
  reforgedFeedbackOwner,
  selectReforgedVisualCutover,
  type ReforgedVisualAtlasAvailability,
} from './reforged-visual-cutover-contract.js';

const completeAvailability = (): ReforgedVisualAtlasAvailability =>
  Object.freeze(
    Object.fromEntries(REFORGED_VISUAL_ATLAS_IDS.map((id) => [id, true])),
  ) as ReforgedVisualAtlasAvailability;

describe('Reforged full-journey visual cutover', () => {
  it('selects one modern owner only for literal capability plus all six atlases', () => {
    expect(selectReforgedVisualCutover(true, completeAvailability())).toMatchObject({
      active: true,
      owner: 'modern-system',
      missingAtlases: [],
    });
    expect(selectReforgedVisualCutover(false, completeAvailability())).toMatchObject({
      active: false,
      owner: 'legacy-fallback',
      missingAtlases: [],
    });
  });

  it.each(REFORGED_VISUAL_ATLAS_IDS)(
    'falls the complete journey back when %s is unavailable',
    (missing) => {
      const availability = { ...completeAvailability(), [missing]: false };
      expect(selectReforgedVisualCutover(true, availability)).toMatchObject({
        active: false,
        owner: 'legacy-fallback',
        missingAtlases: [missing],
      });
    },
  );

  it('reports every unavailable atlas deterministically in loading order', () => {
    const availability = Object.fromEntries(
      REFORGED_VISUAL_ATLAS_IDS.map((id, index) => [id, index % 2 === 0]),
    ) as ReforgedVisualAtlasAvailability;
    expect(selectReforgedVisualCutover(true, availability).missingAtlases).toEqual([
      'fighterArtI',
      'weaponPickup',
      'combatFeedback',
    ]);
  });

  it('assigns established feedback one owner and keeps future art dormant', () => {
    for (const event of REFORGED_LIVE_FEEDBACK_EVENTS) {
      expect(reforgedFeedbackOwner(event, true)).toBe('modern-system');
      expect(reforgedFeedbackOwner(event, false)).toBe('legacy-fallback');
    }
    expect(reforgedFeedbackOwner('bat', true)).toBe('legacy-fallback');
    expect(reforgedFeedbackOwner('punch', true)).toBe('legacy-fallback');
    expect(reforgedFeedbackOwner('future-rarity', true)).toBe('dormant');
    expect(reforgedFeedbackOwner('future-zone', true)).toBe('dormant');
  });
});
