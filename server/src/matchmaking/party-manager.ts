import crypto from 'node:crypto';
import {
  PARTY_CAPACITY_BY_FORMAT,
  PARTY_BOT_FILL_WAIT_MS,
  PARTY_CODE_LENGTH,
  PARTY_EMPTY_EXPIRY_MS,
  PARTY_REMATCH_TIMEOUT_MS,
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
  PartyLifecycle,
  PartyMember,
  PartyParticipant,
  PartyRematchState,
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
  lifecycle: PartyLifecycle;
  matchId: string | null;
  emptyExpiresAt: number | null;
  botFillWait: {
    monotonicStartedAt: number;
    wallStartedAt: number;
    available: boolean;
  } | null;
  participants: readonly PartyParticipant[] | null;
  rematch: Readonly<PartyRematchState> | null;
}

export interface PartyLaunchResult {
  readonly matchId: string;
  readonly participants: readonly PartyParticipant[];
}

export interface PartyManagerOptions {
  readonly sendTo: (playerId: PlayerId, message: ServerMessage) => void;
  readonly normalizeIntent: (value: unknown) => Readonly<MatchIntent> | null;
  readonly canEnterParty?: (playerId: PlayerId) => boolean;
  readonly now?: () => number;
  readonly monotonicNow?: () => number;
  readonly createPartyId?: () => string;
  readonly createCode?: () => string;
  /** Enters the existing generalized match-intent authority once every slot is ready. */
  readonly queueParty?: (state: Readonly<PartyState>) => Readonly<PartyLaunchResult> | null;
  /** Revalidates and launches a Results consensus through generalized intent authority. */
  readonly rematchParty?: (state: Readonly<PartyState>) => Readonly<PartyLaunchResult> | null;
  /** Refreshes the selected mode onto the current server-owned arena schedule. */
  readonly refreshRematchIntent?: (intent: Readonly<MatchIntent>) => Readonly<MatchIntent> | null;
}

const validNickname = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_.-]{2,16}$/.test(value);

export class PartyManager {
  private readonly partiesById = new Map<string, MutableParty>();
  private readonly partyIdByCode = new Map<string, string>();
  private readonly partyIdByPlayer = new Map<PlayerId, string>();
  private readonly seenRequestIds = new Map<PlayerId, Set<string>>();
  private readonly now: () => number;
  private readonly monotonicNow: () => number;
  private readonly createPartyId: () => string;
  private readonly createCode: () => string;

  constructor(private readonly options: PartyManagerOptions) {
    this.now = options.now ?? Date.now;
    this.monotonicNow = options.monotonicNow ?? this.now;
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
      members: [
        Object.freeze({ playerId, nickname: nicknameValue, fighterId, joinedAt, ready: false }),
      ],
      intent,
      lifecycle: 'assembling',
      matchId: null,
      emptyExpiresAt: null,
      botFillWait: null,
      participants: null,
      rematch: null,
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
    if (
      (party.lifecycle !== 'assembling' && party.lifecycle !== 'queued') ||
      party.members.length >= party.intent.composition.humanCount
    ) {
      return this.error(playerId, requestId, 'party_full');
    }
    if (party.members.some((member) => member.fighterId === fighterId)) {
      return this.error(playerId, requestId, 'invalid_request');
    }
    party.members.push(
      Object.freeze({
        playerId,
        nickname: nicknameValue,
        fighterId,
        joinedAt: this.now(),
        ready: false,
      }),
    );
    this.resetReadiness(party);
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
    if (party.lifecycle === 'match' || party.lifecycle === 'results') {
      return this.error(playerId, mutation.requestId, 'invalid_request');
    }
    this.removeMember(party, playerId);
    party.version += 1;
    if (party.members.length === 0) party.emptyExpiresAt = this.now() + PARTY_EMPTY_EXPIRY_MS;
    else this.broadcastState(party);
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
    if (party.lifecycle === 'match' || party.lifecycle === 'results') {
      return this.error(playerId, requestId, 'invalid_request');
    }
    if (
      typeof memberIdValue !== 'string' ||
      memberIdValue === playerId ||
      !party.members.some((member) => member.playerId === memberIdValue)
    ) {
      return this.error(playerId, requestId, 'not_in_party');
    }
    const memberId = memberIdValue as PlayerId;
    this.removeMember(party, memberId);
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
    if (party.lifecycle === 'match' || party.lifecycle === 'results') {
      return this.error(playerId, requestId, 'invalid_request');
    }
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
    this.resetReadiness(party);
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
    if (party.lifecycle === 'match' || party.lifecycle === 'results') {
      return this.error(playerId, requestId, 'invalid_request');
    }
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
    this.resetReadiness(party);
    party.version += 1;
    this.broadcastState(party);
    return true;
  }

  setReady(
    playerId: PlayerId,
    requestIdValue: unknown,
    partyIdValue: unknown,
    expectedVersionValue: unknown,
    readyValue: unknown,
  ): boolean {
    const mutation = this.authorizeMutation(
      playerId,
      requestIdValue,
      partyIdValue,
      expectedVersionValue,
    );
    if (!mutation) return false;
    const { party, requestId } = mutation;
    if (
      typeof readyValue !== 'boolean' ||
      (party.lifecycle !== 'assembling' && party.lifecycle !== 'queued')
    ) {
      return this.error(playerId, requestId, 'invalid_request');
    }
    const member = party.members.find((entry) => entry.playerId === playerId);
    if (!member) return this.error(playerId, requestId, 'not_in_party');
    if (member.ready === readyValue) {
      this.send(playerId, { type: 'server:partyState', state: this.snapshot(party) });
      return true;
    }
    party.members = party.members.map((entry) =>
      entry.playerId === playerId ? Object.freeze({ ...entry, ready: readyValue }) : entry,
    );
    party.lifecycle = party.members.every((entry) => entry.ready) ? 'queued' : 'assembling';
    party.matchId = null;
    if (
      party.lifecycle === 'queued' &&
      party.members.length < party.intent.composition.humanCount
    ) {
      this.startBotFillWait(party);
    } else {
      party.botFillWait = null;
    }
    party.version += 1;
    this.broadcastState(party);

    if (
      party.lifecycle === 'queued' &&
      party.members.length === party.intent.composition.humanCount
    ) {
      const launch = this.options.queueParty?.(this.snapshot(party)) ?? null;
      if (launch === null) {
        this.resetReadiness(party);
        party.version += 1;
        this.error(playerId, requestId, 'invalid_intent');
        this.broadcastState(party);
        return false;
      }
      party.lifecycle = 'match';
      party.matchId = launch.matchId;
      party.participants = launch.participants;
      party.rematch = null;
      party.version += 1;
      this.broadcastState(party);
    }
    return true;
  }

  confirmBotFill(
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
      true,
    );
    if (!mutation) return false;
    const { party, requestId } = mutation;
    const wait = party.botFillWait;
    const openSlotCount = party.intent.composition.humanCount - party.members.length;
    if (
      party.lifecycle !== 'queued' ||
      !party.members.every((member) => member.ready) ||
      openSlotCount < 1 ||
      wait === null ||
      !wait.available
    ) {
      return this.error(playerId, requestId, 'invalid_request');
    }

    const originalIntent = party.intent;
    const confirmedIntent = this.options.normalizeIntent({
      ...originalIntent,
      composition: {
        humanCount: party.members.length,
        botCount: originalIntent.composition.botCount + openSlotCount,
      },
    });
    if (confirmedIntent === null) {
      this.resetReadiness(party);
      party.version += 1;
      this.error(playerId, requestId, 'invalid_intent');
      this.broadcastState(party);
      return false;
    }

    party.intent = confirmedIntent;
    party.botFillWait = null;
    const launch = this.options.queueParty?.(this.snapshot(party)) ?? null;
    if (launch === null) {
      party.intent = originalIntent;
      this.resetReadiness(party);
      party.version += 1;
      this.error(playerId, requestId, 'invalid_intent');
      this.broadcastState(party);
      return false;
    }
    party.lifecycle = 'match';
    party.matchId = launch.matchId;
    party.participants = launch.participants;
    party.rematch = null;
    party.version += 1;
    this.broadcastState(party);
    return true;
  }

  cancelQueue(
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
    const { party, requestId } = mutation;
    if (party.lifecycle !== 'queued') {
      return this.error(playerId, requestId, 'invalid_request');
    }
    this.resetReadiness(party);
    party.version += 1;
    this.broadcastState(party);
    return true;
  }

  requestRematch(
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
    const { party, requestId } = mutation;
    if (party.lifecycle !== 'results' || party.rematch === null || party.matchId === null) {
      return this.error(playerId, requestId, 'invalid_request');
    }
    if (this.refreshResultsSchedule(party)) {
      party.version += 1;
      this.error(playerId, requestId, 'stale_party');
      this.broadcastState(party);
      return false;
    }
    if (
      party.rematch.status === 'unavailable' ||
      !party.rematch.eligiblePlayerIds.includes(playerId)
    ) {
      this.send(playerId, { type: 'server:partyState', state: this.snapshot(party) });
      return party.rematch.requestedPlayerIds.includes(playerId);
    }

    party.members = party.members.map((member) =>
      member.playerId === playerId ? Object.freeze({ ...member, ready: true }) : member,
    );
    this.rebuildRematchProjection(party);
    party.version += 1;
    this.broadcastState(party);
    if (!party.members.every((member) => member.ready)) return true;

    const launch = this.options.rematchParty?.(this.snapshot(party)) ?? null;
    if (launch === null) {
      party.members = party.members.map((member) =>
        member.ready ? Object.freeze({ ...member, ready: false }) : member,
      );
      party.rematch = Object.freeze({
        ...party.rematch,
        status: 'unavailable',
        eligiblePlayerIds: Object.freeze([]),
        requestedPlayerIds: Object.freeze([]),
        unavailableReason: 'match_unavailable',
      });
      party.participants = this.projectParticipantReadiness(party);
      party.version += 1;
      this.error(playerId, requestId, 'invalid_intent');
      this.broadcastState(party);
      return false;
    }
    party.intent = Object.freeze({
      ...party.intent,
      intentId: crypto.randomUUID(),
      scheduledArena: Object.freeze({ ...party.rematch.currentArena }),
    });
    party.lifecycle = 'match';
    party.matchId = launch.matchId;
    party.participants = launch.participants;
    party.rematch = null;
    party.version += 1;
    this.broadcastState(party);
    return true;
  }

  /** Transport cleanup is server-authored and never needs a client request id. */
  disconnect(playerId: PlayerId): boolean {
    const partyId = this.partyIdByPlayer.get(playerId);
    const party = partyId ? this.partiesById.get(partyId) : undefined;
    if (!party) {
      this.seenRequestIds.delete(playerId);
      return false;
    }
    this.removeMember(party, playerId);
    party.version += 1;
    if (party.members.length === 0) party.emptyExpiresAt = this.now() + PARTY_EMPTY_EXPIRY_MS;
    else this.broadcastState(party);
    this.seenRequestIds.delete(playerId);
    return true;
  }

  markLifecycle(
    partyIdValue: unknown,
    lifecycle: 'match' | 'results' | 'assembling',
    matchId?: string,
  ): boolean {
    const partyId = normalizePartyId(partyIdValue);
    const party = partyId ? this.partiesById.get(partyId) : undefined;
    if (!party) return false;
    const normalizedMatchId = lifecycle === 'assembling' ? null : normalizePartyId(matchId);
    if (lifecycle !== 'assembling' && normalizedMatchId === null) return false;
    if (party.lifecycle === lifecycle && party.matchId === normalizedMatchId) return true;
    if (
      lifecycle !== 'assembling' &&
      (party.members.length !== party.intent.composition.humanCount ||
        !party.members.every((member) => member.ready))
    ) {
      return false;
    }
    party.lifecycle = lifecycle;
    party.matchId = normalizedMatchId;
    if (lifecycle === 'assembling') {
      this.resetReadiness(party);
    } else if (lifecycle === 'results') {
      party.members = party.members.map((member) =>
        member.ready ? Object.freeze({ ...member, ready: false }) : member,
      );
      const currentIntent = this.options.refreshRematchIntent?.(party.intent) ?? null;
      const serverTime = this.now();
      party.rematch = Object.freeze({
        status: currentIntent === null ? ('unavailable' as const) : ('waiting' as const),
        previousArena: Object.freeze({ ...party.intent.scheduledArena }),
        currentArena: Object.freeze({
          ...(currentIntent?.scheduledArena ?? party.intent.scheduledArena),
        }),
        arenaChanged:
          currentIntent !== null &&
          (currentIntent.scheduledArena.mapName !== party.intent.scheduledArena.mapName ||
            currentIntent.scheduledArena.rotationEndsAt !==
              party.intent.scheduledArena.rotationEndsAt),
        eligiblePlayerIds: Object.freeze(
          currentIntent === null ? [] : party.members.map((member) => member.playerId),
        ),
        requestedPlayerIds: Object.freeze([]),
        serverTime,
        expiresAt: serverTime + PARTY_REMATCH_TIMEOUT_MS,
        ...(currentIntent === null ? { unavailableReason: 'schedule_unavailable' as const } : {}),
      });
      party.participants = this.projectParticipantReadiness(party);
    }
    party.version += 1;
    this.broadcastState(party);
    return true;
  }

  /** Advances only server-owned monotonic offer edges; it never fills automatically. */
  tick(monotonicNow = this.monotonicNow()): number {
    let offered = 0;
    for (const party of this.partiesById.values()) {
      if (party.lifecycle === 'results' && this.refreshResultsSchedule(party)) {
        party.version += 1;
        this.broadcastState(party);
      }
      const wait = party.botFillWait;
      if (
        wait === null ||
        wait.available ||
        party.lifecycle !== 'queued' ||
        monotonicNow - wait.monotonicStartedAt < PARTY_BOT_FILL_WAIT_MS
      ) {
        continue;
      }
      wait.available = true;
      party.version += 1;
      this.broadcastState(party);
      offered += 1;
    }
    return offered;
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
    const members = party.members.map((member) => Object.freeze({ ...member }));
    const slots = Array.from({ length: party.intent.composition.humanCount }, (_, index) =>
      members[index]
        ? Object.freeze({ index, status: 'occupied' as const, member: members[index] })
        : Object.freeze({ index, status: 'open' as const }),
    );
    return Object.freeze({
      partyId: party.partyId,
      code: party.code,
      joinPath: partyJoinPath(party.code),
      format: party.format,
      formatCapacity: PARTY_CAPACITY_BY_FORMAT[party.format],
      capacity: party.intent.composition.humanCount,
      leaderId: party.leaderId,
      version: party.version,
      lifecycle: party.lifecycle,
      ...(party.matchId === null ? {} : { matchId: party.matchId }),
      members: Object.freeze(members),
      slots: Object.freeze(slots),
      ...(party.botFillWait === null
        ? {}
        : {
            botFillOffer: Object.freeze({
              status: party.botFillWait.available ? ('available' as const) : ('waiting' as const),
              waitStartedAt: party.botFillWait.wallStartedAt,
              eligibleAt: party.botFillWait.wallStartedAt + PARTY_BOT_FILL_WAIT_MS,
              serverTime: this.now(),
              openSlotCount: party.intent.composition.humanCount - party.members.length,
            }),
          }),
      ...(party.participants === null
        ? {}
        : {
            participants: Object.freeze(
              party.participants.map((participant) => Object.freeze({ ...participant })),
            ),
          }),
      ...(party.rematch === null
        ? {}
        : {
            rematch: Object.freeze({
              ...party.rematch,
              previousArena: Object.freeze({ ...party.rematch.previousArena }),
              currentArena: Object.freeze({ ...party.rematch.currentArena }),
              eligiblePlayerIds: Object.freeze([...party.rematch.eligiblePlayerIds]),
              requestedPlayerIds: Object.freeze([...party.rematch.requestedPlayerIds]),
            }),
          }),
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

  private resetReadiness(party: MutableParty): void {
    party.members = party.members.map((member) =>
      member.ready ? Object.freeze({ ...member, ready: false }) : member,
    );
    party.lifecycle = 'assembling';
    party.matchId = null;
    party.botFillWait = null;
    party.participants = null;
    party.rematch = null;
  }

  private startBotFillWait(party: MutableParty): void {
    if (party.botFillWait !== null) return;
    party.botFillWait = {
      monotonicStartedAt: this.monotonicNow(),
      wallStartedAt: this.now(),
      available: false,
    };
  }

  private refreshResultsSchedule(party: MutableParty): boolean {
    if (party.lifecycle !== 'results' || party.rematch === null) return false;
    const currentIntent = this.options.refreshRematchIntent?.(party.intent) ?? null;
    const prior = party.rematch;
    if (currentIntent === null) {
      if (prior.status === 'unavailable' && prior.unavailableReason === 'schedule_unavailable') {
        return false;
      }
      party.members = party.members.map((member) =>
        member.ready ? Object.freeze({ ...member, ready: false }) : member,
      );
      party.rematch = Object.freeze({
        ...prior,
        status: 'unavailable',
        eligiblePlayerIds: Object.freeze([]),
        requestedPlayerIds: Object.freeze([]),
        serverTime: this.now(),
        unavailableReason: 'schedule_unavailable',
      });
      party.participants = this.projectParticipantReadiness(party);
      return true;
    }
    const arena = currentIntent.scheduledArena;
    if (
      prior.currentArena.mapName === arena.mapName &&
      prior.currentArena.rotationEndsAt === arena.rotationEndsAt &&
      prior.status !== 'unavailable'
    ) {
      return false;
    }
    party.members = party.members.map((member) =>
      member.ready ? Object.freeze({ ...member, ready: false }) : member,
    );
    party.rematch = Object.freeze({
      ...prior,
      status: 'waiting',
      currentArena: Object.freeze({ ...arena }),
      arenaChanged:
        prior.previousArena.mapName !== arena.mapName ||
        prior.previousArena.rotationEndsAt !== arena.rotationEndsAt,
      eligiblePlayerIds: Object.freeze(party.members.map((member) => member.playerId)),
      requestedPlayerIds: Object.freeze([]),
      serverTime: this.now(),
      unavailableReason: undefined,
    });
    party.participants = this.projectParticipantReadiness(party);
    return true;
  }

  private rebuildRematchProjection(party: MutableParty): void {
    if (party.rematch === null) return;
    const requestedPlayerIds = party.members
      .filter((member) => member.ready)
      .map((member) => member.playerId);
    const eligiblePlayerIds = party.members
      .filter((member) => !member.ready)
      .map((member) => member.playerId);
    party.rematch = Object.freeze({
      ...party.rematch,
      status: eligiblePlayerIds.length === 0 ? 'ready' : 'waiting',
      eligiblePlayerIds: Object.freeze(eligiblePlayerIds),
      requestedPlayerIds: Object.freeze(requestedPlayerIds),
      serverTime: this.now(),
      unavailableReason: undefined,
    });
    party.participants = this.projectParticipantReadiness(party);
  }

  private projectParticipantReadiness(party: MutableParty): readonly PartyParticipant[] | null {
    if (party.participants === null) return null;
    return Object.freeze(
      party.participants.map((participant) => {
        if (participant.source === 'standard_bot') return participant;
        const member = party.members.find((entry) => entry.playerId === participant.playerId);
        return Object.freeze({ ...participant, ready: member?.ready ?? false });
      }),
    );
  }

  private removeMember(party: MutableParty, playerId: PlayerId): void {
    party.members = party.members.filter((member) => member.playerId !== playerId);
    this.partyIdByPlayer.delete(playerId);
    this.resetReadiness(party);
    if (party.members.length > 0 && party.leaderId === playerId) {
      party.leaderId = [...party.members].sort(
        (left, right) =>
          left.joinedAt - right.joinedAt || left.playerId.localeCompare(right.playerId),
      )[0]!.playerId;
      const leader = party.members.find((member) => member.playerId === party.leaderId)!;
      party.intent = Object.freeze({ ...party.intent, fighterId: leader.fighterId });
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
