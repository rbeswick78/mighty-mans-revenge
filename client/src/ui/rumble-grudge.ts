import type { PlayerId } from '@shared/types/common.js';
import type { RumbleGrudge, RumbleGrudges } from '@shared/types/game.js';

const MAX_GRUDGE_NAME_LENGTH = 16;

function targetName(grudge: RumbleGrudge): string {
  return (grudge.targetNickname.trim() || 'A FIGHTER')
    .toUpperCase()
    .slice(0, MAX_GRUDGE_NAME_LENGTH);
}

/** Personalized result beat for the round that created a Rumble grudge. */
export function rumbleGrudgeResultLabel(
  grudges: RumbleGrudges | undefined,
  localPlayerId: PlayerId | null,
): string | null {
  const grudge = localPlayerId ? grudges?.[localPlayerId] : undefined;
  if (!grudge || grudge.knockouts < 1 || grudge.targetId === localPlayerId) return null;
  return `GRUDGE SET: ${targetName(grudge)} GOT YOU ${grudge.knockouts}X`;
}

/** Personalized pre-fight reminder carried only into a direct Rumble rematch. */
export function rumbleGrudgeBriefingLabel(grudge: RumbleGrudge | undefined): string | null {
  if (!grudge || grudge.knockouts < 1) return null;
  const knockoutLabel = grudge.knockouts === 1 ? '1 KO' : `${grudge.knockouts} KOS`;
  return `GRUDGE: HUNT ${targetName(grudge)} \u00b7 ${knockoutLabel} LAST ROUND`;
}
