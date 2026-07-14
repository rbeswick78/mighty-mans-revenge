import type { PlayerId } from '@shared/types/common.js';
import type { RumbleCrownResult, RumbleCrownState } from '@shared/types/game.js';

export function rumbleCrownBriefingLabel(crown: RumbleCrownState | undefined): string | null {
  if (!crown) return null;
  const reign = crown.wins === 1 ? 'NEW CHAMPION' : `${crown.wins}-WIN REIGN`;
  return `CROWN: ${crown.holderNickname.toUpperCase()} · ${reign}`;
}

export interface RumbleCrownResultPresentation {
  text: string;
  localOwnsCrown: boolean;
}

export function rumbleCrownResultPresentation(
  result: RumbleCrownResult | undefined,
  localPlayerId: PlayerId | null,
): RumbleCrownResultPresentation | null {
  if (!result) return null;
  const holder = result.crown?.holderNickname.toUpperCase() ?? 'NO ONE';
  const localOwnsCrown = result.crown?.holderId === localPlayerId;
  let text: string;
  switch (result.outcome) {
    case 'claimed':
      text = `${holder} CLAIMS THE CROWN`;
      break;
    case 'defended':
      text = `${holder} DEFENDS · ${result.crown?.wins ?? 1}-WIN REIGN`;
      break;
    case 'stolen':
      text = `${holder} STEALS THE CROWN FROM ${(
        result.previousHolderNickname ?? 'THE CHAMPION'
      ).toUpperCase()}`;
      break;
    case 'held':
      text = `DRAW · ${holder} KEEPS THE CROWN`;
      break;
    case 'unclaimed':
      text = 'DRAW · THE CROWN REMAINS UNCLAIMED';
      break;
  }
  return { text, localOwnsCrown };
}
