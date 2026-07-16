import { CHARACTERS, gameModeDisplayName } from '@shared/config/game.js';
import type { PartyState, PlayerId } from '@shared/game';

export interface PartyResultsPresentation {
  readonly partyLines: readonly string[];
  readonly scheduleLines: readonly string[];
  readonly canRequestRematch: boolean;
  readonly localRequested: boolean;
  readonly statusText: string;
}

/** Pure projection of complete server-owned Results/rematch state. */
export function partyResultsPresentation(
  state: Readonly<PartyState> | null,
  matchId: string | undefined,
  localPlayerId: PlayerId | null,
): Readonly<PartyResultsPresentation> | null {
  if (
    !state ||
    state.lifecycle !== 'results' ||
    state.matchId !== matchId ||
    !state.participants ||
    !state.rematch ||
    localPlayerId === null
  ) {
    return null;
  }
  const partyLines = [
    `PARTY ${state.code}  /  ${state.format.toUpperCase()}`,
    ...state.participants.map((participant) => {
      const source = participant.source === 'human' ? 'HUMAN' : 'SCRAPPER BOT';
      const readiness = participant.ready ? 'READY' : 'WAITING';
      return `${participant.nickname.toUpperCase()}  /  ${source}  /  ${CHARACTERS[participant.fighterId].displayName.toUpperCase()}  /  ${readiness}`;
    }),
  ];
  const rematch = state.rematch;
  const scheduleLines = [
    `MODE  /  ${gameModeDisplayName(state.intent.mode).toUpperCase()}`,
    `PLAYED  /  ${rematch.previousArena.mapName.toUpperCase()}`,
    `${rematch.arenaChanged ? 'NEW ACTIVE ARENA' : 'ACTIVE SLOT RETAINED'}  /  ${rematch.currentArena.mapName.toUpperCase()}`,
  ];
  const canRequestRematch = rematch.eligiblePlayerIds.includes(localPlayerId);
  const localRequested = rematch.requestedPlayerIds.includes(localPlayerId);
  const statusText =
    rematch.status === 'unavailable'
      ? 'REMATCH UNAVAILABLE'
      : rematch.status === 'ready'
        ? 'CONSENSUS COMPLETE'
        : `${rematch.requestedPlayerIds.length} / ${state.members.length} HUMANS READY`;
  return Object.freeze({
    partyLines: Object.freeze(partyLines),
    scheduleLines: Object.freeze(scheduleLines),
    canRequestRematch,
    localRequested,
    statusText,
  });
}
