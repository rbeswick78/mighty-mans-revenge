import { describe, expect, it } from 'vitest';
import { Wasteland } from '@shared/config/palette.js';
import { confirmedTagCallout, confirmedTagPresentation } from './confirmed-tag.js';

describe('confirmedTagPresentation', () => {
  it('marks your own tag as a green denial', () => {
    expect(confirmedTagPresentation(true)).toEqual({
      label: 'DENY',
      color: Wasteland.HEALTH_GOOD,
    });
  });

  it('marks enemy tags as gold confirmations', () => {
    expect(confirmedTagPresentation(false)).toEqual({
      label: 'CONFIRM',
      color: Wasteland.TEXT_RELOAD_WARNING,
    });
  });

  it('projects local and enemy confirmation callouts', () => {
    const event = {
      tagId: 'tag-1',
      collectorId: 'local',
      ownerId: 'enemy',
      confirmed: true,
    };
    expect(confirmedTagCallout(event, 'local')).toMatchObject({
      headline: 'KILL CONFIRMED!',
      detail: '+1 POINT',
    });
    expect(confirmedTagCallout(event, 'enemy')).toMatchObject({
      headline: 'ENEMY CONFIRMED',
      detail: '+1 POINT',
    });
  });

  it('projects local and enemy denial callouts', () => {
    const event = {
      tagId: 'tag-1',
      collectorId: 'local',
      ownerId: 'local',
      confirmed: false,
    };
    expect(confirmedTagCallout(event, 'local')).toMatchObject({
      headline: 'TAG DENIED!',
      detail: 'POINT PREVENTED',
    });
    expect(confirmedTagCallout(event, 'enemy')).toMatchObject({
      headline: 'ENEMY DENIED',
      detail: 'POINT PREVENTED',
    });
  });
});
