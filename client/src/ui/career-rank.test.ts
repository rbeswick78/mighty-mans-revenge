import { describe, expect, it } from 'vitest';
import { careerRankPresentation } from './career-rank.js';

describe('careerRankPresentation', () => {
  it('shows current and next-rank progress after an ordinary match', () => {
    expect(careerRankPresentation(5, false, false)).toEqual({
      text: 'RANK: SCAVENGER  5/8 TO ROAD DOG',
      promoted: false,
    });
  });

  it('celebrates an exact threshold crossed by this match', () => {
    expect(careerRankPresentation(15, true, false)).toEqual({
      text: 'RANK UP! MARAUDER',
      promoted: true,
    });
  });

  it('does not claim a promotion when the player was already at that rank', () => {
    expect(careerRankPresentation(16, true, false)).toEqual({
      text: 'RANK: MARAUDER  16/25 TO WASTELAND VETERAN',
      promoted: false,
    });
  });

  it('shows open-ended clears at the top rank', () => {
    expect(careerRankPresentation(47, true, false)).toEqual({
      text: 'RANK: LEGEND OF THE WASTE  47 CLEARS',
      promoted: false,
    });
  });

  it('renders nothing for Practice or old payloads with no career total', () => {
    expect(careerRankPresentation(3, true, true)).toBeNull();
    expect(careerRankPresentation(undefined, true, false)).toBeNull();
  });
});
