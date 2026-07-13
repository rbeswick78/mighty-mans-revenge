import { describe, expect, it } from 'vitest';
import type { CoreRunState } from '@shared/types/game.js';
import { coreRunStatus } from './core-run-hud.js';

const loose: CoreRunState = {
  position: { x: 100, y: 100 },
  carrierId: null,
  returnInSeconds: null,
  carryFraction: 0,
};

describe('coreRunStatus', () => {
  it('covers loose, local carrier, rival carrier, drop, and inactive states', () => {
    expect(coreRunStatus(null, 'local')).toBe('');
    expect(coreRunStatus(loose, 'local')).toBe('CORE LOOSE · CLAIM IT');
    expect(coreRunStatus({ ...loose, carrierId: 'local' }, 'local')).toContain(
      'YOU HAVE THE CORE',
    );
    expect(coreRunStatus({ ...loose, carrierId: 'rival' }, 'local')).toBe(
      'RIVAL HAS THE CORE · HUNT THEM',
    );
    expect(
      coreRunStatus({ ...loose, returnInSeconds: 4.1 }, 'local'),
    ).toBe('CORE DROPPED · RETURNS 5S');
  });
});
