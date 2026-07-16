import {
  CHARACTER_IDS,
  CREW_BATTLE_MODES,
  GAME_MODE_ROTATION,
  type CharacterId,
} from '../config/game.js';
import type { GameModeType } from '../types/game.js';
import type { PlayerId } from '../types/common.js';
import type { TeamId } from '../types/game.js';
import type { ScheduledArena } from '../types/network.js';

export const MATCH_FORMATS = Object.freeze(['duel', 'rumble', 'crew'] as const);
export type MatchFormat = (typeof MATCH_FORMATS)[number];

export const MATCH_PARTICIPANT_SOURCES = Object.freeze(['human', 'bot'] as const);
export type MatchParticipantSource = (typeof MATCH_PARTICIPANT_SOURCES)[number];

export interface MatchComposition {
  readonly humanCount: number;
  readonly botCount: number;
}

export interface MatchIntent {
  /** Per-connection idempotency key. Reusing it is a replay, never a new request. */
  readonly intentId: string;
  readonly format: MatchFormat;
  readonly composition: MatchComposition;
  readonly mode: GameModeType;
  readonly fighterId: CharacterId;
  /** Client echo of server schedule truth; authority creates and compares its own lock. */
  readonly scheduledArena: Readonly<ScheduledArena>;
}

export type StandardMatchParticipantSource = 'human' | 'standard_bot';

/** One exact server-owned entrant in a capability-owned direct launch. */
export interface StandardMatchParticipant {
  readonly playerId: PlayerId;
  readonly nickname: string;
  readonly fighterId: CharacterId;
  readonly source: StandardMatchParticipantSource;
}

/**
 * Complete additive proof that a standard match may bypass legacy Draft and
 * Character Select. Absence preserves the legacy/Practice routing contract.
 */
export interface StandardMatchLaunch {
  readonly format: MatchFormat;
  readonly composition: MatchComposition;
  readonly scheduledArena: Readonly<ScheduledArena>;
  readonly participants: readonly StandardMatchParticipant[];
  /** Present only for Crew and must assign every entrant to an exact 2v2 side. */
  readonly playerTeams?: Readonly<Record<PlayerId, TeamId>>;
}

export interface StandardMatchLaunchNormalizationOptions {
  readonly localPlayerId: PlayerId | null;
  readonly expectedMapName: string;
  readonly expectedMode: GameModeType;
  readonly expectedMatchKind: 'duel' | 'rumble' | 'duos';
  readonly expectedPlayerTeams?: Readonly<Record<PlayerId, TeamId>>;
  readonly allowedArenaNames: readonly string[];
}

export interface MatchIntentNormalizationOptions {
  readonly serverTime: number;
  readonly allowedArenaNames: readonly string[];
}

const freezeComposition = (humanCount: number, botCount: number): MatchComposition =>
  Object.freeze({ humanCount, botCount });

export const MATCH_COMPOSITIONS_BY_FORMAT: Readonly<
  Record<MatchFormat, readonly MatchComposition[]>
> = Object.freeze({
  duel: Object.freeze([freezeComposition(1, 1), freezeComposition(2, 0)]),
  rumble: Object.freeze([
    freezeComposition(1, 1),
    freezeComposition(1, 2),
    freezeComposition(1, 3),
    freezeComposition(2, 0),
    freezeComposition(2, 1),
    freezeComposition(2, 2),
    freezeComposition(3, 0),
    freezeComposition(3, 1),
    freezeComposition(4, 0),
  ]),
  crew: Object.freeze([
    freezeComposition(1, 3),
    freezeComposition(2, 2),
    freezeComposition(3, 1),
    freezeComposition(4, 0),
  ]),
});

export const MATCH_MODES_BY_FORMAT: Readonly<Record<MatchFormat, readonly GameModeType[]>> =
  Object.freeze({
    duel: GAME_MODE_ROTATION,
    rumble: GAME_MODE_ROTATION,
    crew: CREW_BATTLE_MODES,
  });

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isMatchFormat(value: unknown): value is MatchFormat {
  return typeof value === 'string' && MATCH_FORMATS.includes(value as MatchFormat);
}

function isGameMode(value: unknown): value is GameModeType {
  return typeof value === 'string' && GAME_MODE_ROTATION.includes(value as GameModeType);
}

function isCharacterId(value: unknown): value is CharacterId {
  return typeof value === 'string' && CHARACTER_IDS.includes(value as CharacterId);
}

function normalizedTeams(
  value: unknown,
  participantIds: readonly PlayerId[],
): Readonly<Record<PlayerId, TeamId>> | null {
  if (!isRecord(value)) return null;
  const keys = Object.keys(value).sort();
  const expected = [...participantIds].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    return null;
  }
  const teams: Record<PlayerId, TeamId> = {};
  for (const playerId of participantIds) {
    const team = value[playerId];
    if (team !== 'blue' && team !== 'red') return null;
    teams[playerId] = team;
  }
  if (
    Object.values(teams).filter((team) => team === 'blue').length !== 2 ||
    Object.values(teams).filter((team) => team === 'red').length !== 2
  ) {
    return null;
  }
  return Object.freeze(teams);
}

function sameTeams(
  left: Readonly<Record<PlayerId, TeamId>> | undefined,
  right: Readonly<Record<PlayerId, TeamId>> | undefined,
): boolean {
  if (left === undefined || right === undefined) return left === right;
  const keys = Object.keys(left).sort();
  const otherKeys = Object.keys(right).sort();
  return (
    keys.length === otherKeys.length &&
    keys.every((key, index) => key === otherKeys[index] && left[key] === right[key])
  );
}

function normalizeComposition(value: unknown, format: MatchFormat): MatchComposition | null {
  if (!isRecord(value)) return null;
  const humanCount = value['humanCount'];
  const botCount = value['botCount'];
  if (!Number.isInteger(humanCount) || !Number.isInteger(botCount)) return null;
  const compatible = MATCH_COMPOSITIONS_BY_FORMAT[format].find(
    (entry) => entry.humanCount === humanCount && entry.botCount === botCount,
  );
  return compatible ? Object.freeze({ ...compatible }) : null;
}

function normalizeScheduledArena(
  value: unknown,
  mode: GameModeType,
  options: MatchIntentNormalizationOptions,
): Readonly<ScheduledArena> | null {
  if (!isRecord(value)) return null;
  const mapName = value['mapName'];
  const rotationEndsAt = value['rotationEndsAt'];
  if (
    value['mode'] !== mode ||
    typeof mapName !== 'string' ||
    !options.allowedArenaNames.includes(mapName) ||
    typeof rotationEndsAt !== 'number' ||
    !Number.isFinite(rotationEndsAt) ||
    !Number.isFinite(options.serverTime) ||
    rotationEndsAt <= options.serverTime
  ) {
    return null;
  }
  return Object.freeze({ mode, mapName, rotationEndsAt: Math.floor(rotationEndsAt) });
}

/**
 * Normalize one untrusted generalized standard-match request. This boundary
 * validates shape and compatibility only; the server must still create and
 * compare its own scheduled-arena lock before queueing the request.
 */
export function normalizeMatchIntent(
  value: unknown,
  options: MatchIntentNormalizationOptions,
): Readonly<MatchIntent> | null {
  if (!isRecord(value)) return null;
  const intentId = value['intentId'];
  const format = value['format'];
  const mode = value['mode'];
  const fighterId = value['fighterId'];
  if (
    typeof intentId !== 'string' ||
    intentId.length < 8 ||
    intentId.length > 64 ||
    !/^[A-Za-z0-9_-]+$/.test(intentId) ||
    !isMatchFormat(format) ||
    !isGameMode(mode) ||
    !isCharacterId(fighterId) ||
    !MATCH_MODES_BY_FORMAT[format].includes(mode)
  ) {
    return null;
  }
  const composition = normalizeComposition(value['composition'], format);
  const scheduledArena = normalizeScheduledArena(value['scheduledArena'], mode, options);
  if (composition === null || scheduledArena === null) return null;

  return Object.freeze({
    intentId,
    format,
    composition,
    mode,
    fighterId,
    scheduledArena,
  });
}

/**
 * Validate the server-owned direct-launch projection against the surrounding
 * matchFound envelope. Any partial, contradictory, duplicate, or invented
 * participant/arena/team state fails closed.
 */
export function normalizeStandardMatchLaunch(
  value: unknown,
  options: StandardMatchLaunchNormalizationOptions,
): Readonly<StandardMatchLaunch> | null {
  if (!isRecord(value) || options.localPlayerId === null) return null;
  const format = value['format'];
  if (!isMatchFormat(format)) return null;
  const expectedKind = format === 'crew' ? 'duos' : format;
  if (expectedKind !== options.expectedMatchKind) return null;

  const composition = normalizeComposition(value['composition'], format);
  const arena = value['scheduledArena'];
  if (!composition || !isRecord(arena)) return null;
  const rotationEndsAt = arena['rotationEndsAt'];
  if (
    arena['mode'] !== options.expectedMode ||
    arena['mapName'] !== options.expectedMapName ||
    !options.allowedArenaNames.includes(options.expectedMapName) ||
    typeof rotationEndsAt !== 'number' ||
    !Number.isSafeInteger(rotationEndsAt) ||
    rotationEndsAt <= 0 ||
    !MATCH_MODES_BY_FORMAT[format].includes(options.expectedMode)
  ) {
    return null;
  }

  const rawParticipants = value['participants'];
  if (
    !Array.isArray(rawParticipants) ||
    rawParticipants.length !== composition.humanCount + composition.botCount
  ) {
    return null;
  }
  const participants: StandardMatchParticipant[] = [];
  const ids = new Set<PlayerId>();
  const fighters = new Set<CharacterId>();
  for (const raw of rawParticipants) {
    if (!isRecord(raw)) return null;
    const playerId = raw['playerId'];
    const nickname = raw['nickname'];
    const fighterId = raw['fighterId'];
    const source = raw['source'];
    if (
      typeof playerId !== 'string' ||
      playerId.length === 0 ||
      playerId.length > 128 ||
      typeof nickname !== 'string' ||
      nickname.length === 0 ||
      nickname.length > 32 ||
      !isCharacterId(fighterId) ||
      (source !== 'human' && source !== 'standard_bot') ||
      ids.has(playerId) ||
      fighters.has(fighterId)
    ) {
      return null;
    }
    ids.add(playerId);
    fighters.add(fighterId);
    participants.push(Object.freeze({ playerId, nickname, fighterId, source }));
  }
  if (
    participants.filter((participant) => participant.source === 'human').length !==
      composition.humanCount ||
    participants.filter((participant) => participant.source === 'standard_bot').length !==
      composition.botCount ||
    !participants.some(
      (participant) =>
        participant.playerId === options.localPlayerId && participant.source === 'human',
    )
  ) {
    return null;
  }

  const participantIds = participants.map((participant) => participant.playerId);
  const playerTeams =
    format === 'crew' ? normalizedTeams(value['playerTeams'], participantIds) : undefined;
  if (
    (format === 'crew' && playerTeams === null) ||
    (format !== 'crew' && value['playerTeams'] !== undefined) ||
    !sameTeams(playerTeams ?? undefined, options.expectedPlayerTeams)
  ) {
    return null;
  }

  return Object.freeze({
    format,
    composition: Object.freeze({ ...composition }),
    scheduledArena: Object.freeze({
      mode: options.expectedMode,
      mapName: options.expectedMapName,
      rotationEndsAt,
    }),
    participants: Object.freeze(participants),
    ...(playerTeams ? { playerTeams } : {}),
  });
}

export function matchIntentQueueKey(intent: Readonly<MatchIntent>): string {
  return [
    intent.format,
    intent.composition.humanCount,
    intent.composition.botCount,
    intent.mode,
    intent.scheduledArena.mapName,
    intent.scheduledArena.rotationEndsAt,
  ].join('|');
}
