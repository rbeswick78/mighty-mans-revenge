import { describe, expect, it } from 'vitest';
import { Wasteland } from '@shared/config/palette.js';
import { rumbleLeadCallout } from './rumble-lead.js';

const players = [
  { id: 'local', nickname: 'Road Dog' },
  { id: 'rival-a', nickname: 'Dust Queen' },
  { id: 'rival-b', nickname: 'Long Named Wastelander' },
  { id: 'rival-c', nickname: 'Nomad' },
];

describe('rumbleLeadCallout', () => {
  it('celebrates a sole local lead', () => {
    expect(rumbleLeadCallout({ leaderIds: ['local'], sequence: 1 }, players, 'local')).toEqual({
      headline: 'YOU TAKE THE LEAD!',
      detail: 'THE FIELD IS CHASING YOU',
      tint: Wasteland.HEALTH_GOOD,
      pulse: true,
    });
  });

  it('turns a rival takeover into a named target', () => {
    expect(
      rumbleLeadCallout({ leaderIds: ['rival-a'], sequence: 2 }, players, 'local'),
    ).toMatchObject({
      headline: 'DUST QUEEN TAKES THE LEAD!',
      detail: 'HUNT THEM DOWN',
      tint: Wasteland.HEALTH_DANGER,
    });
  });

  it('distinguishes local, field-wide, and rival-only ties', () => {
    expect(
      rumbleLeadCallout({ leaderIds: ['local', 'rival-a'], sequence: 3 }, players, 'local'),
    ).toMatchObject({
      headline: 'YOU TIE FOR THE LEAD!',
      detail: 'NO ROOM TO BREATHE',
    });

    expect(
      rumbleLeadCallout(
        { leaderIds: players.map((player) => player.id), sequence: 4 },
        players,
        'local',
      ),
    ).toMatchObject({
      headline: 'FIELD TIED!',
      detail: 'ANYONE CAN TAKE IT',
    });

    expect(
      rumbleLeadCallout(
        { leaderIds: ['rival-a', 'rival-b', 'rival-c'], sequence: 5 },
        players,
        'local',
      ),
    ).toMatchObject({
      headline: 'LEAD TIED!',
      detail: 'DUST QUEEN + LONG NAMED W +1',
    });
  });

  it('ignores malformed empty or one-player snapshots', () => {
    expect(rumbleLeadCallout({ leaderIds: [], sequence: 1 }, players, 'local')).toBeNull();
    expect(
      rumbleLeadCallout(
        { leaderIds: ['local'], sequence: 1 },
        [{ id: 'local', nickname: 'Road Dog' }],
        'local',
      ),
    ).toBeNull();
  });
});
