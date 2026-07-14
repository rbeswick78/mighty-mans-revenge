import { Wasteland } from '@shared/config/palette.js';
import type { PlayerId } from '@shared/types/common.js';
import type { RumbleLeadState } from '@shared/types/game.js';
import type { SerializedPlayerState } from '@shared/types/network.js';
import type { CombatCallout } from './combat-callout.js';

const MAX_CALLOUT_NAME_LENGTH = 12;

type LeadPlayer = Pick<SerializedPlayerState, 'id' | 'nickname'>;

function displayName(player: LeadPlayer | undefined): string {
  return (player?.nickname.trim() || 'THE FIELD').toUpperCase().slice(0, MAX_CALLOUT_NAME_LENGTH);
}

function tiedLeaderNames(
  state: RumbleLeadState,
  playersById: ReadonlyMap<PlayerId, LeadPlayer>,
): string {
  const names = state.leaderIds.map((playerId) => displayName(playersById.get(playerId)));
  if (names.length <= 2) return names.join(' + ');
  return `${names[0]} + ${names[1]} +${names.length - 2}`;
}

/** Pure presentation of one authoritative group-match leader-set change. */
export function rumbleLeadCallout(
  state: RumbleLeadState,
  players: readonly LeadPlayer[],
  localPlayerId: PlayerId,
): CombatCallout | null {
  if (state.leaderIds.length === 0 || players.length < 2) return null;

  const playersById = new Map(players.map((player) => [player.id, player]));
  const localLeads = state.leaderIds.includes(localPlayerId);
  if (state.leaderIds.length === 1) {
    const leaderId = state.leaderIds[0];
    if (leaderId === localPlayerId) {
      return {
        headline: 'YOU TAKE THE LEAD!',
        detail: 'THE FIELD IS CHASING YOU',
        tint: Wasteland.HEALTH_GOOD,
        pulse: true,
      };
    }
    return {
      headline: `${displayName(playersById.get(leaderId))} TAKES THE LEAD!`,
      detail: 'HUNT THEM DOWN',
      tint: Wasteland.HEALTH_DANGER,
      pulse: true,
    };
  }

  if (state.leaderIds.length === players.length) {
    return {
      headline: 'FIELD TIED!',
      detail: 'ANYONE CAN TAKE IT',
      tint: Wasteland.HEALTH_WARNING,
      pulse: true,
    };
  }
  if (localLeads) {
    return {
      headline: 'YOU TIE FOR THE LEAD!',
      detail: 'NO ROOM TO BREATHE',
      tint: Wasteland.HEALTH_WARNING,
      pulse: true,
    };
  }
  return {
    headline: 'LEAD TIED!',
    detail: tiedLeaderNames(state, playersById),
    tint: Wasteland.HEALTH_WARNING,
    pulse: true,
  };
}
