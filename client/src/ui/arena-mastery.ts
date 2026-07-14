import { arenaMasteryProgressForWins } from '@shared/config/game.js';
import type { PlayerId } from '@shared/types/common.js';
import type { MatchResult } from '@shared/types/game.js';
import type { DraftPlayer } from '@shared/types/network.js';

function progressLabel(value: number): string {
  const progress = arenaMasteryProgressForWins(value);
  if (progress.next) {
    return `${progress.current.title} ${progress.wins}/${progress.next.minWins}`;
  }
  return `${progress.current.title} ${progress.wins}W`;
}

/** Compact experience comparison rendered inside one map draft card. */
export function arenaMasteryDraftSubtitle(
  players: readonly DraftPlayer[],
  localPlayerId: PlayerId | null,
  mapName: string,
): string | null {
  if (localPlayerId === null) return null;
  const local = players.find((player) => player.id === localPlayerId);
  const rivals = players.filter((player) => player.id !== localPlayerId);
  if (!local?.arenaWins || rivals.length === 0 || rivals.some((player) => !player.arenaWins)) {
    return null;
  }

  const localLabel = progressLabel(local.arenaWins[mapName] ?? 0);
  if (rivals.length === 1) {
    const rivalLabel = progressLabel(rivals[0].arenaWins?.[mapName] ?? 0);
    return `YOU ${localLabel} · RIVAL ${rivalLabel}`;
  }

  const fieldBest = Math.max(...rivals.map((player) => player.arenaWins?.[mapName] ?? 0));
  return `YOU ${localLabel} · FIELD BEST ${fieldBest}W`;
}

export interface ArenaMasteryResultPresentation {
  text: string;
  tierUp: boolean;
}

/** Results-screen story for the local player's just-finished battlefield. */
export function arenaMasteryResultPresentation(
  result: MatchResult | null,
  localPlayerId: PlayerId | null,
): ArenaMasteryResultPresentation | null {
  if (!result || localPlayerId === null) return null;
  const mastery = result.arenaMastery?.[localPlayerId];
  if (!mastery) return null;

  const previous = arenaMasteryProgressForWins(mastery.previousWins);
  const current = arenaMasteryProgressForWins(mastery.wins);
  const tierUp = current.current.id !== previous.current.id;
  const mapName = mastery.mapName.toUpperCase();
  if (tierUp) {
    const unit = current.wins === 1 ? 'WIN' : 'WINS';
    return {
      text: `NEW ${current.current.title} · ${mapName} · ${current.wins} ${unit}`,
      tierUp: true,
    };
  }
  return {
    text: `${mapName} · ${progressLabel(current.wins)}`,
    tierUp: false,
  };
}
