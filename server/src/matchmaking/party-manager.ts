import crypto from 'node:crypto';
import {
  PARTY_CAPACITY_BY_FORMAT,
  PARTY_CODE_LENGTH,
  PARTY_EMPTY_EXPIRY_MS,
  normalizePartyCode,
  normalizePartyFighter,
  normalizePartyId,
  normalizePartyRequestId,
  normalizePartyVersion,
  parsePartyJoinTarget,
  partyCodeFromBytes,
  partyJoinPath,
} from '@shared/game';
import type {
  MatchFormat,
  MatchIntent,
  PartyErrorCode,
  PartyMember,
  PartyState,
  PlayerId,
  ServerMessage,
} from '@shared/game';

interface MutableParty {
  partyId: string;
  code: string;
  format: MatchFormat;
  leaderId: PlayerId;
  version: number;
  members: PartyMember[];
  intent: Readonly<MatchIntent>;
  emptyExpiresAt: number | null;
}

export interface PartyManagerOptions {
  readonly sendTo: (playerId: PlayerId, message: ServerMessage) => void;
  readonly normalizeIntent: (value: unknown) => Readonly<MatchIntent> | null;
  readonly canEnterParty?: (playerId: PlayerId) => boolean;
  readonly now?: () => number;
  readonly createPartyId?: () => string;
  readonly createCode?: () => string;
}

const validNickname = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_.-]{2,16}$/.test(value);

export class PartyManager {
  private readonly partiesById = new Map<string, MutableParty>();
  private readonly partyIdByCode = new Map<string, string>();
  private readonly partyIdByPlayer = new Map<PlayerId, string>();
  private readonly seenRequestIds = new Map<PlayerId, Set<string>>();
  private readonly now: () => number;
  private readonly createPartyId: () => string;
  private readonly createCode: () => string;

  constructor(private readonly options: PartyManagerOptions) {
    this.now = options.now ?? Date.now;
    this.createPartyId = options.createPartyId ?? (() => crypto.randomUUID());
    this.createCode =
      options.createCode ??
      (() => partyCodeFromBytes(crypto.randomBytes(PARTY_CODE_LENGTH)) as string);
  }

  create(
    playerId: PlayerId,
    requestIdValue: unknown,
    nicknameValue: unknown,
    formatValue: unknown,
    fighterValue: unknown,
    intentValue: unknown,
  ): boolean {
    const requestId = this.beginRequest(playerId, requestIdValue);
    if (requestId === null) return false;
    this.expireEmptyRooms();
    const fighterId = normalizePartyFighter(fighterValue);
    const intent = this.options.normalizeIntent(intentValue);
    if (
      !validNickname(nicknameValue) ||
      typeof formatValue !== 'string' ||
      !(formatValue in PARTY_CAPACITY_BY_FORMAT) ||
      fighterId === null ||
      intent === null ||
      intent.format !== formatValue ||
      intent.fighterId !== fighterId ||
      intent.composition.humanCount < 2 ||
      intent.composition.humanCount > PARTY_CAPACITY_BY_FORMAT[intent.format]
    ) {
      return this.error(playerId, requestId, 'invalid_intent');
    }
    if (
      this.partyIdByPlayer.has(playerId) ||
      (this.options.canEnterParty && !this.options.canEnterParty(playerId))
    ) {
      return this.error(playerId, requestId, 'already_in_party');
    }

    let code: string | null = null;
    for (let attempt = 0; attempt < 64; attempt += 1) {
      const candidate = normalizePartyCode(this.createCode());
      if (candidate !== null && !this.partyIdByCode.has(candidate)) {
        code = candidate;
        break;
      }
    }
    if (code === null) return this.error(playerId, requestId, 'invalid_request');

    const joinedAt = this.now();
    const party: MutableParty = {
      partyId: this.createPartyId(),
      code,
      format: intent.format,
      leaderId: playerId,
      version: 1,
      members: [Object.freeze({ playerId, nickname: nicknameValue, fighterId, joinedAt })],
      intent,
      emptyExpiresAt: null,
    };
    this.partiesById.set(party.partyId, party);
    this.partyIdByCode.set(code, party.partyId);
    this.partyIdByPlayer.set(playerId, party.partyId);
    this.broadcastState(party);
    return true;
  }

  join(
    playerId: PlayerId,
    requestIdValue: unknown,
    nicknameValue: unknown,
    joinTargetValue: unknown,
    fighterValue: unknown,
  ): boolean {
    const requestId = this.beginRequest(playerId, requestIdValue);
    if (requestId === null) return false;
    this.expireEmptyRooms();
    const code = parsePartyJoinTarget(joinTargetValue);
    const fighterId = normalizePartyFighter(fighterValue);
    if (!validNickname(nicknameValue) || code === null || fighterId === null) {
      return this.error(playerId, requestId, 'invalid_request');
    }
    if (
      this.partyIdByPlayer.has(playerId) ||
      (this.options.canEnterParty && !this.options.canEnterParty(playerId))
    ) {
      return this.error(playerId, requestId, 'already_in_party');
    }
    const party = this.partyForCode(code);
    if (!party || party.members.length === 0) {
      return this.error(playerId, requestId, 'unknown_party');
    }
    if (party.members.length >= party.intent.composition.humanCount) {
      return this.error(playerId, requestId, 'party_full');
    }
    if (party.members.some((member) => member.fighterId === fighterId)) {
      return this.error(playerId, requestId, 'invalid_request');
    }
    party.members.push(
      Object.freeze({ playerId, nickname: nicknameValue, fighterId, joinedAt: this.now() }),
    );
    party.version += 1;
    this.partyIdByPlayer.set(playerId, party.partyId);
    this.broadcastState(party);
    return true;
  }

  leave(
    playerId: PlayerId,
    requestIdValue: unknown,
    partyIdValue: unknown,
    expectedVersionValue: unknown,
  ): boolean {
    const mutation = this.authorizeMutation(
      playerId,
      requestIdValue,
      partyIdValue,
      expectedVersionValue,
    );
    if (!mutation) return false;
    const { party } = mutation;
    if (party.leaderId === playerId) {
      const remaining = party.members.filter((member) => member.playerId !== playerId);
      for (const member of remaining) {
        this.partyIdByPlayer.delete(member.playerId);
        this.send(member.playerId, {
          type: 'server:partyLeft',
          partyId: party.partyId,
          reason: 'closed',
        });
      }
      party.members = [];
      party.version += 1;
      party.emptyExpiresAt = this.now() + PARTY_EMPTY_EXPIRY_MS;
    } else {
      party.members = party.members.filter((member) => member.playerId !== playerId);
      party.version += 1;
      this.broadcastState(party);
    }
    this.partyIdByPlayer.delete(playerId);
    this.send(playerId, { type: 'server:partyLeft', partyId: party.partyId, reason: 'left' });
    return true;
  }

  kick(
    playerId: PlayerId,
    requestIdValue: unknown,
    partyIdValue: unknown,
    expectedVersionValue: unknown,
    memberIdValue: unknown,
  ): boolean {
    const mutation = this.authorizeMutation(
      playerId,
      requestIdValue,
      partyIdValue,
      expectedVersionValue,
      true,
    );
    if (!mutation) return false;
    const { party, requestId } = mutation;
    if (
      typeof memberIdValue !== 'string' ||
      memberIdValue === playerId ||
      !party.members.some((member) => member.playerId === memberIdValue)
    ) {
      return this.error(playerId, requestId, 'not_in_party');
    }
    const memberId = memberIdValue as PlayerId;
    party.members = party.members.filter((member) => member.playerId !== memberId);
    party.version += 1;
    this.partyIdByPlayer.delete(memberId);
    this.send(memberId, { type: 'server:partyLeft', partyId: party.partyId, reason: 'kicked' });
    this.broadcastState(party);
    return true;
  }

  updateIntent(
    playerId: PlayerId,
    requestIdValue: unknown,
    partyIdValue: unknown,
    expectedVersionValue: unknown,
    intentValue: unknown,
  ): boolean {
    const mutation = this.authorizeMutation(
      playerId,
      requestIdValue,
      partyIdValue,
      expectedVersionValue,
      true,
    );
    if (!mutation) return false;
    const { party, requestId } = mutation;
    const intent = this.options.normalizeIntent(intentValue);
    const leader = party.members.find((member) => member.playerId === playerId);
    if (
      intent === null ||
      !leader ||
      intent.format !== party.format ||
      intent.fighterId !== leader.fighterId ||
      intent.composition.humanCount < 2 ||
      intent.composition.humanCount < party.members.length ||
      intent.composition.humanCount > PARTY_CAPACITY_BY_FORMAT[party.format]
    ) {
      return this.error(playerId, requestId, 'invalid_intent');
    }
    party.intent = intent;
    party.version += 1;
    this.broadcastState(party);
    return true;
  }

  updateFighter(
    playerId: PlayerId,
    requestIdValue: unknown,
    partyIdValue: unknown,
    expectedVersionValue: unknown,
    fighterValue: unknown,
  ): boolean {
    const mutation = this.authorizeMutation(
      playerId,
      requestIdValue,
      partyIdValue,
      expectedVersionValue,
    );
    if (!mutation) return false;
    const { party, requestId } = mutation;
    const fighterId = normalizePartyFighter(fighterValue);
    if (
      fighterId === null ||
      party.members.some((member) => member.playerId !== playerId && member.fighterId === fighterId)
    ) {
      return this.error(playerId, requestId, 'invalid_request');
    }
    party.members = party.members.map((member) =>
      member.playerId === playerId ? Object.freeze({ ...member, fighterId }) : member,
    );
    if (party.leaderId === playerId) {
      party.intent = Object.freeze({ ...party.intent, fighterId });
    }
    party.version += 1;
    this.broadcastState(party);
    return true;
  }

  expireEmptyRooms(now = this.now()): number {
    let expired = 0;
    for (const party of this.partiesById.values()) {
      if (party.members.length !== 0 || party.emptyExpiresAt === null || party.emptyExpiresAt > now)
        continue;
      this.partiesById.delete(party.partyId);
      this.partyIdByCode.delete(party.code);
      expired += 1;
    }
    return expired;
  }

  getStateForPlayer(playerId: PlayerId): Readonly<PartyState> | null {
    const partyId = this.partyIdByPlayer.get(playerId);
    const party = partyId ? this.partiesById.get(partyId) : undefined;
    return party ? this.snapshot(party) : null;
  }

  getRoomCount(): number {
    return this.partiesById.size;
  }

  private authorizeMutation(
    playerId: PlayerId,
    requestIdValue: unknown,
    partyIdValue: unknown,
    expectedVersionValue: unknown,
    leaderOnly = false,
  ): { party: MutableParty; requestId: string } | null {
    const requestId = this.beginRequest(playerId, requestIdValue);
    if (requestId === null) return null;
    const partyId = normalizePartyId(partyIdValue);
    const expectedVersion = normalizePartyVersion(expectedVersionValue);
    const ownedPartyId = this.partyIdByPlayer.get(playerId);
    if (partyId === null || expectedVersion === null || ownedPartyId !== partyId) {
      this.error(playerId, requestId, 'not_in_party');
      return null;
    }
    const party = this.partiesById.get(partyId);
    if (!party) {
      this.error(playerId, requestId, 'unknown_party');
      return null;
    }
    if (party.version !== expectedVersion) {
      this.error(playerId, requestId, 'stale_party');
      this.send(playerId, { type: 'server:partyState', state: this.snapshot(party) });
      return null;
    }
    if (leaderOnly && party.leaderId !== playerId) {
      this.error(playerId, requestId, 'not_leader');
      return null;
    }
    return { party, requestId };
  }

  private beginRequest(playerId: PlayerId, value: unknown): string | null {
    const requestId = normalizePartyRequestId(value);
    if (requestId === null) {
      this.error(playerId, undefined, 'invalid_request');
      return null;
    }
    const seen = this.seenRequestIds.get(playerId) ?? new Set<string>();
    this.seenRequestIds.set(playerId, seen);
    if (seen.has(requestId)) {
      this.error(playerId, requestId, 'replayed_request');
      return null;
    }
    seen.add(requestId);
    return requestId;
  }

  private partyForCode(code: string): MutableParty | null {
    const partyId = this.partyIdByCode.get(code);
    return partyId ? (this.partiesById.get(partyId) ?? null) : null;
  }

  private snapshot(party: MutableParty): Readonly<PartyState> {
    return Object.freeze({
      partyId: party.partyId,
      code: party.code,
      joinPath: partyJoinPath(party.code),
      format: party.format,
      formatCapacity: PARTY_CAPACITY_BY_FORMAT[party.format],
      capacity: party.intent.composition.humanCount,
      leaderId: party.leaderId,
      version: party.version,
      members: Object.freeze(party.members.map((member) => Object.freeze({ ...member }))),
      intent: Object.freeze({
        ...party.intent,
        composition: Object.freeze({ ...party.intent.composition }),
        scheduledArena: Object.freeze({ ...party.intent.scheduledArena }),
      }),
    });
  }

  private broadcastState(party: MutableParty): void {
    const state = this.snapshot(party);
    for (const member of party.members) {
      this.send(member.playerId, { type: 'server:partyState', state });
    }
  }

  private error(playerId: PlayerId, requestId: string | undefined, code: PartyErrorCode): false {
    this.send(playerId, { type: 'server:partyError', requestId, code });
    return false;
  }

  private send(playerId: PlayerId, message: ServerMessage): void {
    this.options.sendTo(playerId, message);
  }
}
