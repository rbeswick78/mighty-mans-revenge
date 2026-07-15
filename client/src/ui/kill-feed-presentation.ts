import type { PlayerId } from '@shared/types/common.js';
import type { KillFeedEntry, KillWeapon } from '@shared/types/game.js';

export type KillFeedTone = 'local-kill' | 'local-death' | 'neutral';

export interface KillFeedPresentation {
  label: string;
  tone: KillFeedTone;
}

const KILL_WEAPON_LABELS = Object.freeze({
  gun: 'RIFLE',
  grenade: 'GRENADE',
  fire: 'FIRE',
  shotgun: 'SHOTGUN',
  axe: 'AXE',
  pistol: 'PISTOL',
  punch: 'FISTS',
  bat: 'BAT',
  barrel: 'BARREL',
} satisfies Readonly<Record<KillWeapon, string>>);

const MAX_FIGHTER_LABEL_LENGTH = 10;

function fighterLabel(
  playerId: PlayerId,
  playerNames: ReadonlyMap<PlayerId, string>,
  localPlayerId: PlayerId,
): string {
  if (playerId === localPlayerId) return 'YOU';

  const normalized = (playerNames.get(playerId) ?? 'FIGHTER')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
  return (normalized || 'FIGHTER').slice(0, MAX_FIGHTER_LABEL_LENGTH);
}

/**
 * Project one authoritative kill event into a compact, HUD-safe line.
 * Names are presentation-only and may be absent after a disconnect, so the
 * formatter owns a bounded fallback instead of reconstructing game state.
 */
export function killFeedPresentation(
  entry: KillFeedEntry,
  playerNames: ReadonlyMap<PlayerId, string>,
  localPlayerId: PlayerId,
): KillFeedPresentation {
  const killer = fighterLabel(entry.killerId, playerNames, localPlayerId);
  const victim = fighterLabel(entry.victimId, playerNames, localPlayerId);
  const weapon = KILL_WEAPON_LABELS[entry.weapon];
  const isSuicide = entry.killerId === entry.victimId;

  return {
    label: isSuicide ? `${killer} [${weapon}] SELF` : `${killer} [${weapon}] ${victim}`,
    tone:
      entry.victimId === localPlayerId
        ? 'local-death'
        : entry.killerId === localPlayerId
          ? 'local-kill'
          : 'neutral',
  };
}
