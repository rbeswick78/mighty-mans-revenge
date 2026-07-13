import type { BountyHuntState, PlayerId } from '@shared/game';

/** Compact mode-band copy derived only from the authoritative marked id. */
export function bountyHuntStatus(
  state: BountyHuntState | null,
  localPlayerId: PlayerId | null,
  targetNickname: string | null,
): string {
  if (!state?.targetId) return '';
  if (state.targetId === localPlayerId) return 'YOU ARE WANTED · YOUR KILLS ×2';
  return `HUNT ${(targetNickname ?? 'THE BOUNTY').toUpperCase()} · WORTH 3`;
}
