import { CHARACTER_IDS, type CharacterId } from '../config/game.js';
import type { PlayerId } from '../types/common.js';
import {
  MATCH_COMPOSITIONS_BY_FORMAT,
  MATCH_MODES_BY_FORMAT,
  type MatchIntent,
  type MatchFormat,
} from './match-intent.js';

export const PARTY_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const PARTY_CODE_LENGTH = 5;
export const PARTY_EMPTY_EXPIRY_MS = 60_000;
export const PARTY_CAPACITY_BY_FORMAT: Readonly<Record<MatchFormat, number>> = Object.freeze({
  duel: 2,
  rumble: 4,
  crew: 4,
});

export interface PartyMember {
  readonly playerId: PlayerId;
  readonly nickname: string;
  readonly fighterId: CharacterId;
  readonly joinedAt: number;
}

export interface PartyState {
  readonly partyId: string;
  readonly code: string;
  /** Origin-relative so every compatible client can share its own current origin. */
  readonly joinPath: string;
  readonly format: MatchFormat;
  readonly formatCapacity: number;
  /** Exact human slots owned by the leader's normalized intent. */
  readonly capacity: number;
  readonly leaderId: PlayerId;
  readonly version: number;
  readonly members: readonly PartyMember[];
  readonly intent: Readonly<MatchIntent>;
}

export type PartyErrorCode =
  | 'invalid_request'
  | 'unknown_party'
  | 'party_full'
  | 'already_in_party'
  | 'not_in_party'
  | 'not_leader'
  | 'stale_party'
  | 'replayed_request'
  | 'invalid_intent';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function normalizePartyRequestId(value: unknown): string | null {
  return typeof value === 'string' &&
    value.length >= 8 &&
    value.length <= 64 &&
    /^[A-Za-z0-9_-]+$/.test(value)
    ? value
    : null;
}

export function normalizePartyId(value: unknown): string | null {
  return normalizePartyRequestId(value);
}

export function normalizePartyVersion(value: unknown): number | null {
  return Number.isSafeInteger(value) && (value as number) >= 1 ? (value as number) : null;
}

export function normalizePartyFighter(value: unknown): CharacterId | null {
  return typeof value === 'string' && CHARACTER_IDS.includes(value as CharacterId)
    ? (value as CharacterId)
    : null;
}

/** Accept an exact short code, case-insensitively, without ambiguous aliases. */
export function normalizePartyCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const code = value.trim().toUpperCase();
  return code.length === PARTY_CODE_LENGTH &&
    [...code].every((character) => PARTY_CODE_ALPHABET.includes(character))
    ? code
    : null;
}

/**
 * Parse either a short code or an http(s) share URL whose only authority is
 * the normalized `party` query value. Fragments, paths, and origins never
 * become server-authored state.
 */
export function parsePartyJoinTarget(value: unknown): string | null {
  const direct = normalizePartyCode(value);
  if (direct !== null) return direct;
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    if ([...url.searchParams.keys()].filter((key) => key === 'party').length !== 1) return null;
    return normalizePartyCode(url.searchParams.get('party'));
  } catch {
    return null;
  }
}

export function partyJoinPath(code: string): string {
  const normalized = normalizePartyCode(code);
  if (normalized === null) throw new Error('Invalid party code');
  return `/?party=${normalized}`;
}

/** Deterministically maps caller-provided entropy into the unambiguous code alphabet. */
export function partyCodeFromBytes(bytes: Uint8Array): string | null {
  if (bytes.length < PARTY_CODE_LENGTH) return null;
  return Array.from(bytes.slice(0, PARTY_CODE_LENGTH), (byte) =>
    PARTY_CODE_ALPHABET.charAt(byte % PARTY_CODE_ALPHABET.length),
  ).join('');
}

export function isPartyState(value: unknown): value is PartyState {
  if (!isRecord(value)) return false;
  const members = value['members'];
  const format = value['format'];
  if (
    !(
      normalizePartyId(value['partyId']) !== null &&
      normalizePartyCode(value['code']) !== null &&
      typeof format === 'string' &&
      format in PARTY_CAPACITY_BY_FORMAT &&
      value['formatCapacity'] === PARTY_CAPACITY_BY_FORMAT[format as MatchFormat] &&
      Number.isInteger(value['capacity']) &&
      (value['capacity'] as number) >= 1 &&
      (value['capacity'] as number) <= (value['formatCapacity'] as number) &&
      normalizePartyVersion(value['version']) !== null &&
      typeof value['leaderId'] === 'string' &&
      Array.isArray(members)
    )
  ) {
    return false;
  }
  const code = normalizePartyCode(value['code'])!;
  if (value['joinPath'] !== partyJoinPath(code)) return false;
  const capacity = value['capacity'] as number;
  if (members.length < 1 || members.length > capacity) return false;
  const playerIds = new Set<string>();
  const fighters = new Set<CharacterId>();
  for (const member of members) {
    if (!isRecord(member)) return false;
    const playerId = member['playerId'];
    const nickname = member['nickname'];
    const fighterId = normalizePartyFighter(member['fighterId']);
    const joinedAt = member['joinedAt'];
    if (
      typeof playerId !== 'string' ||
      playerId.length === 0 ||
      typeof nickname !== 'string' ||
      !/^[A-Za-z0-9_.-]{2,16}$/.test(nickname) ||
      fighterId === null ||
      typeof joinedAt !== 'number' ||
      !Number.isFinite(joinedAt) ||
      playerIds.has(playerId) ||
      fighters.has(fighterId)
    ) {
      return false;
    }
    playerIds.add(playerId);
    fighters.add(fighterId);
  }
  if (!playerIds.has(value['leaderId'])) return false;
  const intent = value['intent'];
  if (!isRecord(intent) || intent['format'] !== format) return false;
  const composition = intent['composition'];
  const mode = intent['mode'];
  const scheduledArena = intent['scheduledArena'];
  const leader = members.find(
    (member) => isRecord(member) && member['playerId'] === value['leaderId'],
  );
  if (
    normalizePartyRequestId(intent['intentId']) === null ||
    !isRecord(composition) ||
    composition['humanCount'] !== capacity ||
    !Number.isInteger(composition['botCount']) ||
    !MATCH_COMPOSITIONS_BY_FORMAT[format as MatchFormat].some(
      (entry) =>
        entry.humanCount === composition['humanCount'] &&
        entry.botCount === composition['botCount'],
    ) ||
    typeof mode !== 'string' ||
    !MATCH_MODES_BY_FORMAT[format as MatchFormat].includes(mode as never) ||
    normalizePartyFighter(intent['fighterId']) === null ||
    !leader ||
    intent['fighterId'] !== leader['fighterId'] ||
    !isRecord(scheduledArena) ||
    scheduledArena['mode'] !== mode ||
    typeof scheduledArena['mapName'] !== 'string' ||
    scheduledArena['mapName'].length === 0 ||
    typeof scheduledArena['rotationEndsAt'] !== 'number' ||
    !Number.isFinite(scheduledArena['rotationEndsAt'])
  ) {
    return false;
  }
  return true;
}
