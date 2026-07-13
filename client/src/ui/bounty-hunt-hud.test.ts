import { describe, expect, it } from 'vitest';
import { bountyHuntStatus } from './bounty-hunt-hud.js';

describe('bountyHuntStatus', () => {
  it('hides outside Bounty Hunt and during overtime retirement', () => {
    expect(bountyHuntStatus(null, 'local', 'Rival')).toBe('');
    expect(bountyHuntStatus({ targetId: null }, 'local', 'Rival')).toBe('');
  });

  it('warns the marked local fighter about their double-value kills', () => {
    expect(bountyHuntStatus({ targetId: 'local' }, 'local', 'Rival')).toBe(
      'YOU ARE WANTED · YOUR KILLS ×2',
    );
  });

  it('names a rival bounty and its three-point value', () => {
    expect(bountyHuntStatus({ targetId: 'rival' }, 'local', 'Road Dog')).toBe(
      'HUNT ROAD DOG · WORTH 3',
    );
  });
});
