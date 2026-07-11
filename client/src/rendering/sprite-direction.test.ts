import { describe, expect, it } from 'vitest';
import { bucketAimAngle, deathDirectionForAim } from './sprite-direction.js';

describe('sprite direction', () => {
  it('buckets cardinal aim into the matching four-way sheet', () => {
    expect(bucketAimAngle(0)).toBe('side');
    expect(bucketAimAngle(Math.PI / 2)).toBe('down');
    expect(bucketAimAngle(-Math.PI / 2)).toBe('up');
    expect(bucketAimAngle(Math.PI)).toBe('side-left');
  });

  it('projects every aim angle onto a horizontal death facing', () => {
    expect(deathDirectionForAim(0)).toBe('side');
    expect(deathDirectionForAim(Math.PI / 2)).toBe('side');
    expect(deathDirectionForAim(-Math.PI / 2)).toBe('side');
    expect(deathDirectionForAim(Math.PI)).toBe('side-left');
    expect(deathDirectionForAim(-Math.PI + 0.01)).toBe('side-left');
  });
});
