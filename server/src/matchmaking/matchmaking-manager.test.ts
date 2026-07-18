import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  MatchPhase,
  MATCH,
  MUTATORS,
  OVERTIME,
  DRAFT,
  RUMBLE,
  BATTLE_ROYALE_QUEUE,
  CREW_BATTLE,
  BOT,
  SCRAP_PIT_RIVALS,
  CHARACTER_IDS,
  listMapNames,
  GameModeType,
  GAME_MODE_ROTATION,
  createEmptyCharacterWins,
  createEmptyArenaWins,
  practiceGauntletChaosBounty,
  dailyChallengeKey,
  type MatchIntent,
  type PartyState,
  type ScheduledArenaLock,
} from '@shared/game';
import type {
  CharacterId,
  MutatorId,
  PlayerId,
  ServerMessage,
  ServerDraftStateMessage,
} from '@shared/game';
import { MatchmakingManager } from './matchmaking-manager.js';
import { getGameMode } from '../game/modes/index.js';
import { PersistentStatsStore } from '../persistence/persistent-stats-store.js';
import type { GameServer } from '../network/server.js';

interface SentMessage {
  playerId: PlayerId;
  message: ServerMessage;
  reliable: boolean;
}

function makeFakeServer(largeWorlds = false, battleRoyale = false) {
  const sent: SentMessage[] = [];
  /** Mutable so tests can decide who the leaderboard rebroadcast reaches. */
  const connected: PlayerId[] = [];
  const fake = {
    sendTo: vi.fn((playerId: PlayerId, message: ServerMessage, opts?: { reliable?: boolean }) => {
      sent.push({ playerId, message, reliable: !!opts?.reliable });
    }),
    getConnectedPlayerIds: vi.fn(() => [...connected]),
    getCapabilities: vi.fn(() => ({ largeWorlds, battleRoyale })),
    playerCount: 2,
  } as unknown as GameServer;
  return { fake, sent, connected };
}

describe('MatchmakingManager Battle Royale queue', () => {
  it('fails closed when the server does not advertise Battle Royale', () => {
    const { fake, sent } = makeFakeServer();
    const manager = new MatchmakingManager(fake);

    expect(manager.handleJoinBattleRoyale('A', 'Alpha', 'mighty_man')).toBe(false);
    expect(manager.getQueueLength()).toBe(0);
    expect(manager.getActiveMatches()).toHaveLength(0);
    expect(sent).toHaveLength(0);
  });

  it('fills one human to exactly eight at the authoritative 15-second deadline', () => {
    const { fake, sent } = makeFakeServer(false, true);
    const manager = new MatchmakingManager(fake);

    expect(manager.handleJoinBattleRoyale('A', 'Alpha', 'rook')).toBe(true);
    expect(sent.at(-1)?.message).toMatchObject({
      type: 'server:matchmakingStatus',
      status: 'queued',
      matchKind: 'battle_royale',
      groupSize: 1,
      maxGroupSize: 8,
      botFillCount: 7,
      launchInMs: 15_000,
    });

    manager.tick(BATTLE_ROYALE_QUEUE.BOT_FILL_DEADLINE_SECONDS - 0.001, 1);
    expect(manager.getActiveMatches()).toHaveLength(0);
    manager.tick(0.001, 2);

    const [match] = manager.getActiveMatches();
    expect(match.players.size).toBe(8);
    expect(match.phase).toBe(MatchPhase.COUNTDOWN);
    expect(match.selectionState.get('A')?.locked).toBe('rook');
    expect([...match.selectionState.values()].every(({ locked }) => locked !== null)).toBe(true);
    const found = sent.find(
      ({ playerId, message }) => playerId === 'A' && message.type === 'server:matchFound',
    );
    expect(found?.message).toMatchObject({
      type: 'server:matchFound',
      mapName: 'Shatterlands',
      matchKind: 'battle_royale',
      battleRoyale: { participantCount: 8, humanCount: 1, botCount: 7 },
    });
    if (!found || found.message.type !== 'server:matchFound') throw new Error('missing matchFound');
    expect(found.message.opponents).toHaveLength(7);
    expect(sent.some(({ message }) => message.type === 'server:characterSelectState')).toBe(false);
  });

  it('launches the eighth human synchronously without bots or standard setup leakage', () => {
    const { fake, sent } = makeFakeServer(false, true);
    const manager = new MatchmakingManager(fake);
    for (let index = 0; index < 8; index += 1) {
      expect(
        manager.handleJoinBattleRoyale(
          `p${index}`,
          `Player${index}`,
          CHARACTER_IDS[index % CHARACTER_IDS.length],
        ),
      ).toBe(true);
    }

    const [match] = manager.getActiveMatches();
    expect(match.players.size).toBe(8);
    expect(manager.getQueueLength()).toBe(0);
    expect(
      [...match.players.keys()].every((playerId) => !playerId.startsWith(BOT.PLAYER_ID_PREFIX)),
    ).toBe(true);
    const found = sent.filter(({ message }) => message.type === 'server:matchFound');
    expect(found).toHaveLength(8);
    expect(
      found.every(
        ({ message }) =>
          message.type === 'server:matchFound' && message.battleRoyale?.botCount === 0,
      ),
    ).toBe(true);
  });

  it('projects authoritative Results without standard rematch or persistence-shaped fields', () => {
    const { fake, sent } = makeFakeServer(false, true);
    const manager = new MatchmakingManager(fake);
    manager.handleJoinBattleRoyale('A', 'Alpha', 'mighty_man');
    manager.tick(BATTLE_ROYALE_QUEUE.BOT_FILL_DEADLINE_SECONDS, 1);
    const [match] = manager.getActiveMatches();
    match.phase = MatchPhase.ACTIVE;
    for (const playerId of match.players.keys()) {
      if (playerId !== 'A') match.onPlayerDisconnect(playerId, true);
    }
    manager.tick(0.05, 2);

    expect(manager.getActiveMatches()).toHaveLength(0);
    const ended = sent.find(
      ({ playerId, message }) => playerId === 'A' && message.type === 'server:matchEnd',
    );
    expect(ended?.message).toMatchObject({
      type: 'server:matchEnd',
      result: {
        matchKind: 'battle_royale',
        winnerId: 'A',
        nextMapName: null,
        nextGameMode: null,
        rivalry: null,
        rivalrySet: null,
        battleRoyale: {
          placements: expect.arrayContaining([
            expect.objectContaining({ playerId: 'A', placement: 1, status: 'winner' }),
          ]),
        },
      },
    });

    manager.handleRematchRequest('A');
    expect(sent.at(-1)?.message).toMatchObject({
      type: 'server:matchmakingStatus',
      status: 'cancelled',
    });
    manager.handleReturnToLobby('A');
    expect(manager.handleJoinBattleRoyale('A', 'Alpha', 'mighty_man')).toBe(true);
  });

  it('serializes BR inventory and loot additively while standard snapshots omit every field', () => {
    const battleRoyale = makeFakeServer(false, true);
    const battleRoyaleManager = new MatchmakingManager(battleRoyale.fake);
    battleRoyaleManager.handleJoinBattleRoyale('A', 'Alpha', 'mighty_man');
    battleRoyaleManager.tick(BATTLE_ROYALE_QUEUE.BOT_FILL_DEADLINE_SECONDS, 1);
    const [battleRoyaleMatch] = battleRoyaleManager.getActiveMatches();
    battleRoyaleMatch.phase = MatchPhase.ACTIVE;
    battleRoyaleMatch.spawnBattleRoyaleDroppedWeapon(
      { instanceId: 'wire-drop', weaponId: 'smg', rarity: 'epic' },
      17,
      { x: 300, y: 300 },
    );
    battleRoyale.sent.length = 0;
    battleRoyaleManager.tick(0.05, 2);
    const battleRoyaleState = battleRoyale.sent.find(
      ({ playerId, message }) => playerId === 'A' && message.type === 'server:gameState',
    );
    if (!battleRoyaleState || battleRoyaleState.message.type !== 'server:gameState') {
      throw new Error('missing Battle Royale gameState');
    }
    expect(battleRoyaleState.message.players.find(({ id }) => id === 'A')).toMatchObject({
      weaponId: 'punch',
      battleRoyaleInventory: { equipped: null, loadedAmmo: 0, reserveAmmo: 0 },
    });
    expect(battleRoyaleState.message.droppedWeapons).toEqual([
      {
        id: 'br-drop:0',
        position: { x: 300, y: 300 },
        weaponInstance: { instanceId: 'wire-drop', weaponId: 'smg', rarity: 'epic' },
        loadedAmmo: 17,
      },
    ]);
    expect(battleRoyaleState.message.battleRoyaleContainers).toHaveLength(16);
    expect(
      battleRoyaleState.message.battleRoyaleContainers?.every(({ status }) => status === 'intact'),
    ).toBe(true);
    expect(battleRoyaleState.message.battleRoyaleSupplyBundles).toEqual([]);

    const standard = makeFakeServer();
    const standardManager = new MatchmakingManager(standard.fake);
    standardManager.handleJoinMatchmaking('A', 'Alpha');
    standardManager.handleJoinMatchmaking('B', 'Bravo');
    walkDraft(standardManager, standard.sent);
    const [standardMatch] = standardManager.getActiveMatches();
    standardMatch.phase = MatchPhase.ACTIVE;
    standard.sent.length = 0;
    standardManager.tick(0.05, 3);
    const standardState = standard.sent.find(
      ({ playerId, message }) => playerId === 'A' && message.type === 'server:gameState',
    );
    if (!standardState || standardState.message.type !== 'server:gameState') {
      throw new Error('missing standard gameState');
    }
    expect(standardState.message.droppedWeapons).toBeUndefined();
    expect(standardState.message.battleRoyaleContainers).toBeUndefined();
    expect(standardState.message.battleRoyaleSupplyBundles).toBeUndefined();
    expect(
      standardState.message.players.every(
        ({ battleRoyaleInventory }) => battleRoyaleInventory === undefined,
      ),
    ).toBe(true);
  });

  it('protects duplicates and preserves the remaining deadline after cancel and disconnect', () => {
    const { fake, sent } = makeFakeServer(false, true);
    const manager = new MatchmakingManager(fake);
    manager.handleJoinBattleRoyale('A', 'Alpha', 'mighty_man');
    manager.handleJoinBattleRoyale('B', 'Bravo', 'bruce');
    manager.tick(5, 1);

    expect(manager.handleJoinBattleRoyale('B', 'Bravo', 'bruce')).toBe(false);
    manager.handleCancelMatchmaking('A');
    const remaining = [...sent]
      .reverse()
      .find(
        ({ playerId, message }) =>
          playerId === 'B' &&
          message.type === 'server:matchmakingStatus' &&
          message.status === 'queued',
      );
    expect(remaining?.message).toMatchObject({
      groupSize: 1,
      botFillCount: 7,
      launchInMs: 10_000,
    });
    manager.handlePlayerDisconnect('B');
    expect(manager.getQueueLength()).toBe(0);

    manager.handleJoinBattleRoyale('C', 'Cora', 'frost_wizard');
    expect(sent.at(-1)?.message).toMatchObject({
      type: 'server:matchmakingStatus',
      groupSize: 1,
      launchInMs: 15_000,
    });
    manager.handleJoinRumble('C', 'Cora');
    expect(manager.getQueueLength()).toBe(1);
  });
});

/**
 * Deterministic rng for draft tests: returns the given values in order,
 * then keeps returning the last one (drafts consume a variable number of
 * rolls; padding with the final value keeps sequences short).
 */
function seededRng(values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

function latestDraftState(sent: SentMessage[]): ServerDraftStateMessage {
  const found = [...sent].reverse().find((s) => s.message.type === 'server:draftState');
  if (!found || found.message.type !== 'server:draftState') {
    throw new Error('no draftState broadcast');
  }
  return found.message;
}

/**
 * Complete a live draft: tick once so the draft broadcasts a snapshot,
 * read who picks first from it, then send both picks (map from the first
 * picker, mode from the second). Keeps every test that just needs "a
 * match" exercising the real draft path instead of a FORCE pin.
 */
function walkDraft(
  mgr: MatchmakingManager,
  sent: SentMessage[],
  picks: { map?: string; mode?: GameModeType } = {},
): void {
  mgr.tick(0.05, 0);
  const snap = latestDraftState(sent);
  if (snap.draftKind === 'rally') {
    for (const player of snap.players) {
      mgr.handleDraftPick(player.id, 'map', picks.map ?? snap.mapOptions[0]);
    }
    mgr.tick(0.05, 0);
    const modeSnap = latestDraftState(sent);
    for (const player of modeSnap.players) {
      mgr.handleDraftPick(player.id, 'mode', picks.mode ?? modeSnap.modeOptions[0]);
    }
    return;
  }
  const first = snap.currentPickerId!;
  const second = snap.secondPickerId ?? snap.players.find((p) => p.id !== first)!.id;
  mgr.handleDraftPick(first, 'map', picks.map ?? snap.mapOptions[0]);
  mgr.handleDraftPick(second, 'mode', picks.mode ?? snap.modeOptions[0]);
}

function generalIntent(
  overrides: Partial<MatchIntent> & Pick<MatchIntent, 'intentId'>,
): Readonly<MatchIntent> {
  return Object.freeze({
    format: 'duel',
    composition: Object.freeze({ humanCount: 1, botCount: 1 }),
    mode: GameModeType.DEATHMATCH,
    fighterId: 'mighty_man',
    scheduledArena: Object.freeze({
      mode: GameModeType.DEATHMATCH,
      mapName: listMapNames()[0],
      rotationEndsAt: 2_000,
    }),
    ...overrides,
  });
}

describe('MatchmakingManager generalized match intent', () => {
  function setup(lockOverride: Partial<ScheduledArenaLock> = {}, largeWorlds = false) {
    const made = makeFakeServer(largeWorlds);
    const locks = new Map<PlayerId, ScheduledArenaLock>();
    const release = vi.fn((playerId: PlayerId) => locks.delete(playerId));
    const manager = new MatchmakingManager(
      made.fake,
      () => 0,
      undefined,
      () => 0,
      () => new Date(1_000),
      {
        lock: (playerId, mode) => {
          const lock = {
            mode,
            mapName: listMapNames()[0],
            rotationEndsAt: 2_000,
            lockedAt: 1_000,
            ...lockOverride,
          } as ScheduledArenaLock;
          locks.set(playerId, lock);
          return lock;
        },
        release,
      },
    );
    return { ...made, manager, locks, release };
  }

  it('launches an explicit Duel with one compatible standard bot and persisted fighter', () => {
    const { manager, sent, release } = setup();
    expect(
      manager.handleSubmitMatchIntent('p1', 'Alpha', generalIntent({ intentId: 'intent_0001' })),
    ).toBe(true);

    const [match] = manager.getActiveMatches();
    expect(match.getMapData().name).toBe(listMapNames()[0]);
    expect([match.getMapData().width, match.getMapData().height]).toEqual([20, 12]);
    expect(match.gameModeType).toBe(GameModeType.DEATHMATCH);
    expect(match.players.size).toBe(2);
    expect(match.selectionState.get('p1')?.locked).toBe('mighty_man');
    expect([...match.selectionState.values()].every(({ locked }) => locked !== null)).toBe(true);
    expect(sent.some(({ message }) => message.type === 'server:draftState')).toBe(false);
    const found = sent.find(
      ({ playerId, message }) => playerId === 'p1' && message.type === 'server:matchFound',
    );
    expect(found?.message).toMatchObject({
      type: 'server:matchFound',
      mapName: listMapNames()[0],
      gameMode: GameModeType.DEATHMATCH,
      matchKind: 'duel',
      standardMatch: {
        format: 'duel',
        composition: { humanCount: 1, botCount: 1 },
        scheduledArena: {
          mode: GameModeType.DEATHMATCH,
          mapName: listMapNames()[0],
          rotationEndsAt: 2_000,
        },
      },
    });
    if (!found || found.message.type !== 'server:matchFound') throw new Error('missing matchFound');
    expect(found.message.standardMatch?.participants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          playerId: 'p1',
          fighterId: 'mighty_man',
          source: 'human',
        }),
        expect.objectContaining({ source: 'standard_bot' }),
      ]),
    );
    manager.tick(0.05, 1);
    expect(match.phase).toBe(MatchPhase.COUNTDOWN);
    expect(sent.some(({ message }) => message.type === 'server:characterSelectState')).toBe(false);
    expect(release).toHaveBeenCalledWith('p1');
  });

  it('uses the server-advertised large-world successor without changing the public map name', () => {
    const { manager, fake } = setup({}, true);
    expect(fake.getCapabilities().largeWorlds).toBe(true);
    expect(
      manager.handleSubmitMatchIntent('p1', 'Alpha', generalIntent({ intentId: 'intent_large_1' })),
    ).toBe(true);

    const [match] = manager.getActiveMatches();
    expect(match.getMapData()).toMatchObject({
      name: 'Wasteland Outpost',
      width: 40,
      height: 24,
      tileSize: 48,
    });
  });

  it('groups exact Rumble humans, fills requested bots, and rejects fighter collisions', () => {
    const { manager, sent } = setup();
    const base = {
      format: 'rumble' as const,
      composition: { humanCount: 2, botCount: 1 },
      mode: GameModeType.KOTH,
      scheduledArena: {
        mode: GameModeType.KOTH,
        mapName: listMapNames()[0],
        rotationEndsAt: 2_000,
      },
    };
    manager.handleSubmitMatchIntent(
      'p1',
      'Alpha',
      generalIntent({ ...base, intentId: 'intent_1001', fighterId: 'mighty_man' }),
    );
    manager.handleSubmitMatchIntent(
      'p2',
      'Bravo',
      generalIntent({ ...base, intentId: 'intent_1002', fighterId: 'mighty_man' }),
    );
    expect(manager.getActiveMatches()).toHaveLength(0);
    expect(sent.at(-1)?.message).toMatchObject({
      type: 'server:matchmakingStatus',
      groupSize: 1,
      maxGroupSize: 2,
    });
    manager.handleSubmitMatchIntent(
      'p3',
      'Cora',
      generalIntent({ ...base, intentId: 'intent_1003', fighterId: 'bruce' }),
    );
    const [match] = manager.getActiveMatches();
    expect(match.players.size).toBe(3);
    expect(match.gameModeType).toBe(GameModeType.KOTH);
    expect(match.selectionState.get('p1')?.locked).toBe('mighty_man');
    expect(match.selectionState.get('p3')?.locked).toBe('bruce');
    expect(match.selectionState.has('p2')).toBe(false);
    const found = sent.find(
      ({ playerId, message }) => playerId === 'p1' && message.type === 'server:matchFound',
    );
    if (!found || found.message.type !== 'server:matchFound') throw new Error('missing matchFound');
    expect(found.message.standardMatch).toMatchObject({
      format: 'rumble',
      composition: { humanCount: 2, botCount: 1 },
    });
    expect(found.message.standardMatch?.participants.map(({ source }) => source).sort()).toEqual([
      'human',
      'human',
      'standard_bot',
    ]);
  });

  it('builds authoritative two-versus-two Crew sides for three humans and one bot', () => {
    const { manager, sent } = setup();
    for (const [index, fighterId] of CHARACTER_IDS.slice(0, 3).entries()) {
      manager.handleSubmitMatchIntent(
        `p${index + 1}`,
        `Human${index + 1}`,
        generalIntent({
          intentId: `crew_000${index + 1}`,
          format: 'crew',
          composition: { humanCount: 3, botCount: 1 },
          mode: GameModeType.CORE_RUN,
          fighterId,
          scheduledArena: {
            mode: GameModeType.CORE_RUN,
            mapName: listMapNames()[0],
            rotationEndsAt: 2_000,
          },
        }),
      );
    }
    const [match] = manager.getActiveMatches();
    expect(match.players.size).toBe(4);
    expect(match.getTeamIds().sort()).toEqual(['blue', 'red']);
    expect([...match.getTeamAssignments().values()].filter((team) => team === 'blue')).toHaveLength(
      2,
    );
    expect([...match.getTeamAssignments().values()].filter((team) => team === 'red')).toHaveLength(
      2,
    );
    const found = sent.find(
      ({ playerId, message }) => playerId === 'p1' && message.type === 'server:matchFound',
    );
    if (!found || found.message.type !== 'server:matchFound') throw new Error('missing matchFound');
    expect(found.message.standardMatch?.format).toBe('crew');
    expect(found.message.standardMatch?.playerTeams).toEqual(found.message.playerTeams);
    expect(Object.values(found.message.standardMatch?.playerTeams ?? {}).sort()).toEqual([
      'blue',
      'blue',
      'red',
      'red',
    ]);
  });

  it('fails closed for lock mismatch, duplicate, replay, cancel, and disconnect paths', () => {
    const mismatch = setup({ mapName: listMapNames()[1] });
    expect(
      mismatch.manager.handleSubmitMatchIntent(
        'p1',
        'Alpha',
        generalIntent({ intentId: 'intent_2001' }),
      ),
    ).toBe(false);
    expect(mismatch.manager.getQueueLength()).toBe(0);
    expect(mismatch.release).toHaveBeenCalledWith('p1');

    const accepted = setup();
    const first = generalIntent({
      intentId: 'intent_2002',
      composition: { humanCount: 2, botCount: 0 },
    });
    expect(accepted.manager.handleSubmitMatchIntent('p1', 'Alpha', first)).toBe(true);
    expect(accepted.manager.handleSubmitMatchIntent('p1', 'Alpha', first)).toBe(false);
    expect(
      accepted.manager.handleSubmitMatchIntent(
        'p1',
        'Alpha',
        generalIntent({
          intentId: 'intent_2003',
          composition: { humanCount: 2, botCount: 0 },
        }),
      ),
    ).toBe(false);
    accepted.manager.handleCancelMatchmaking('p1');
    expect(accepted.manager.getQueueLength()).toBe(0);
    expect(accepted.locks.has('p1')).toBe(false);
    expect(accepted.manager.handleSubmitMatchIntent('p1', 'Alpha', first)).toBe(false);
    accepted.manager.handlePlayerDisconnect('p1');
    expect(accepted.manager.handleSubmitMatchIntent('p1', 'Alpha', first)).toBe(true);
  });

  it.each([
    ['duel', 2, GameModeType.DEATHMATCH],
    ['rumble', 4, GameModeType.KOTH],
    ['crew', 4, GameModeType.CORE_RUN],
  ] as const)(
    'launches one complete ready %s party through generalized authority',
    (format, count, mode) => {
      const { manager, sent, release } = setup();
      const members = Array.from({ length: count }, (_, index) => ({
        playerId: `party-player-${index + 1}` as PlayerId,
        nickname: `Party${index + 1}`,
        fighterId: CHARACTER_IDS[index]!,
        joinedAt: index + 1,
        ready: true,
      }));
      const baseIntent = generalIntent({
        intentId: `party_${format}_intent`,
        format,
        composition: { humanCount: count, botCount: format === 'duel' ? 0 : 4 - count },
        mode,
        scheduledArena: { mode, mapName: listMapNames()[0], rotationEndsAt: 2_000 },
      });
      const state: PartyState = {
        partyId: `party_${format}_12345678`,
        code: 'ABCDE',
        joinPath: '/?party=ABCDE',
        format,
        formatCapacity: format === 'duel' ? 2 : 4,
        capacity: count,
        leaderId: members[0]!.playerId,
        version: 10,
        lifecycle: 'queued',
        members,
        slots: members.map((member, index) => ({ index, status: 'occupied', member })),
        intent: baseIntent,
      };
      const launch = manager.handleSubmitParty(state);
      expect(launch?.matchId).toEqual(expect.any(String));
      expect(launch?.participants).toHaveLength(format === 'duel' ? 2 : 4);
      expect(manager.getActiveMatches()).toHaveLength(1);
      const [match] = manager.getActiveMatches();
      expect(match.players.size).toBe(format === 'duel' ? 2 : 4);
      expect(match.gameModeType).toBe(mode);
      expect(sent.filter(({ message }) => message.type === 'server:matchFound')).toHaveLength(
        count,
      );
      const found = sent.find(
        ({ playerId, message }) =>
          playerId === members[0]!.playerId && message.type === 'server:matchFound',
      );
      if (!found || found.message.type !== 'server:matchFound') {
        throw new Error('missing party matchFound');
      }
      expect(found.message.standardMatch).toMatchObject({
        format,
        composition: { humanCount: count, botCount: format === 'duel' ? 0 : 4 - count },
        scheduledArena: { mode, mapName: listMapNames()[0], rotationEndsAt: 2_000 },
      });
      expect(release).toHaveBeenCalledTimes(count);
    },
  );

  it('projects party Results and rematch lifecycle without client inference', () => {
    const { manager } = setup();
    const transitions: Array<[string, string, string | undefined]> = [];
    manager.setPartyLifecycleListener((partyId, lifecycle, matchId) => {
      transitions.push([partyId, lifecycle, matchId]);
    });
    const members = ['p1', 'p2'].map((playerId, index) => ({
      playerId: playerId as PlayerId,
      nickname: index === 0 ? 'Alpha' : 'Bravo',
      fighterId: CHARACTER_IDS[index]!,
      joinedAt: index + 1,
      ready: true,
    }));
    const state: PartyState = {
      partyId: 'party_lifecycle_123',
      code: 'ABCDE',
      joinPath: '/?party=ABCDE',
      format: 'duel',
      formatCapacity: 2,
      capacity: 2,
      leaderId: 'p1',
      version: 4,
      lifecycle: 'queued',
      members,
      slots: members.map((member, index) => ({ index, status: 'occupied', member })),
      intent: generalIntent({
        intentId: 'party_lifecycle_intent',
        composition: { humanCount: 2, botCount: 0 },
      }),
    };
    const firstLaunch = manager.handleSubmitParty(state)!;
    const firstMatchId = firstLaunch.matchId;
    const [match] = manager.getActiveMatches();
    match.phase = MatchPhase.ENDED;
    manager.tick(0.05, 1);
    expect(transitions.at(-1)).toEqual([state.partyId, 'results', firstMatchId]);
    manager.handleRematchRequest('p1');
    manager.handleRematchRequest('p2');
    expect(manager.getActiveMatches()).toHaveLength(0);
  });

  it.each([
    ['duel', 1, 1, GameModeType.DEATHMATCH],
    ['rumble', 2, 2, GameModeType.KOTH],
    ['crew', 3, 1, GameModeType.CORE_RUN],
  ] as const)(
    'revalidates retained %s humans/bots and launches the current scheduled arena',
    (format, humanCount, botCount, mode) => {
      const lockOverride: Partial<ScheduledArenaLock> = {};
      const { manager, sent } = setup(lockOverride);
      const members = Array.from({ length: humanCount }, (_, index) => ({
        playerId: `rematch-player-${index + 1}` as PlayerId,
        nickname: `Human${index + 1}`,
        fighterId: CHARACTER_IDS[index]!,
        joinedAt: index + 1,
        ready: true,
      }));
      const originalArena = {
        mode,
        mapName: listMapNames()[0],
        rotationEndsAt: 2_000,
      };
      const state: PartyState = {
        partyId: `party_rematch_${format}`,
        code: 'ABCDE',
        joinPath: '/?party=ABCDE',
        format,
        formatCapacity: format === 'duel' ? 2 : 4,
        capacity: humanCount,
        leaderId: members[0]!.playerId,
        version: 7,
        lifecycle: 'queued',
        members,
        slots: members.map((member, index) => ({ index, status: 'occupied', member })),
        intent: generalIntent({
          intentId: `party_rematch_${format}_intent`,
          format,
          composition: { humanCount, botCount },
          mode,
          scheduledArena: originalArena,
        }),
      };
      const firstLaunch = manager.handleSubmitParty(state)!;
      const [completed] = manager.getActiveMatches();
      completed.phase = MatchPhase.ENDED;
      manager.tick(0.05, 1);

      lockOverride.mapName = listMapNames()[1];
      lockOverride.rotationEndsAt = 302_000;
      const resultsState: PartyState = {
        ...state,
        version: 9,
        lifecycle: 'results',
        matchId: firstLaunch.matchId,
        participants: firstLaunch.participants.map((participant) => ({
          ...participant,
          ready: true,
        })),
        members: members.map((member) => ({ ...member, ready: true })),
        slots: members.map((member, index) => ({
          index,
          status: 'occupied',
          member: { ...member, ready: true },
        })),
        rematch: {
          status: 'ready',
          previousArena: originalArena,
          currentArena: {
            mode,
            mapName: listMapNames()[1],
            rotationEndsAt: 302_000,
          },
          arenaChanged: true,
          eligiblePlayerIds: [],
          requestedPlayerIds: members.map((member) => member.playerId),
          serverTime: 2_001,
          expiresAt: 62_001,
        },
      };

      expect(
        manager.handleSubmitPartyRematch({
          ...resultsState,
          format: format === 'duel' ? 'rumble' : 'duel',
        }),
      ).toBeNull();
      expect(
        manager.handleSubmitPartyRematch({
          ...resultsState,
          intent: { ...resultsState.intent, mode: GameModeType.BOUNTY_HUNT },
        }),
      ).toBeNull();
      expect(
        manager.handleSubmitPartyRematch({
          ...resultsState,
          members: resultsState.members.map((member, index) =>
            index === 0 ? { ...member, fighterId: 'rook' } : member,
          ),
        }),
      ).toBeNull();
      expect(
        manager.handleSubmitPartyRematch({
          ...resultsState,
          rematch: {
            ...resultsState.rematch!,
            currentArena: { ...resultsState.rematch!.currentArena, mapName: listMapNames()[2] },
          },
        }),
      ).toBeNull();

      const rematchLaunch = manager.handleSubmitPartyRematch(resultsState)!;
      const [rematch] = manager.getActiveMatches();
      expect(rematch.getMapData().name).toBe(listMapNames()[1]);
      expect(rematch.gameModeType).toBe(mode);
      expect(rematchLaunch.participants.filter((entry) => entry.source === 'human')).toHaveLength(
        humanCount,
      );
      expect(
        rematchLaunch.participants.filter((entry) => entry.source === 'standard_bot'),
      ).toHaveLength(botCount);
      expect(manager.getActiveMatches()).toHaveLength(1);
      const rematchFound = [...sent]
        .reverse()
        .find(
          ({ playerId, message }) =>
            playerId === members[0]!.playerId && message.type === 'server:matchFound',
        );
      if (!rematchFound || rematchFound.message.type !== 'server:matchFound') {
        throw new Error('missing rematch matchFound');
      }
      expect(rematchFound.message.standardMatch).toMatchObject({
        format,
        composition: { humanCount, botCount },
        scheduledArena: {
          mode,
          mapName: listMapNames()[1],
          rotationEndsAt: 302_000,
        },
      });
    },
  );
});

describe('MatchmakingManager rematch flow', () => {
  let mgr: MatchmakingManager;
  let sent: SentMessage[];

  beforeEach(() => {
    const { fake, sent: bucket } = makeFakeServer();
    sent = bucket;
    mgr = new MatchmakingManager(fake);
  });

  function startMatchAndForceEnd(p1: PlayerId, p2: PlayerId): void {
    mgr.handleJoinMatchmaking(p1, 'A');
    mgr.handleJoinMatchmaking(p2, 'B');
    walkDraft(mgr, sent);
    // Find the active match and force it to ENDED so the next tick promotes
    // it into post-match state via onMatchEnded.
    const matches = mgr.getActiveMatches();
    expect(matches).toHaveLength(1);
    matches[0].phase = MatchPhase.ENDED;
    mgr.tick(0.05, 1);
  }

  function endRoundWithWinner(winnerId: PlayerId, tick: number) {
    const match = mgr.getActiveMatches()[0];
    expect(match).toBeDefined();
    match.players.get(winnerId)!.score = 1;
    match.phase = MatchPhase.ENDED;
    mgr.tick(0.05, tick);
    const end = [...sent]
      .reverse()
      .find((entry) => entry.playerId === 'A' && entry.message.type === 'server:matchEnd');
    if (!end || end.message.type !== 'server:matchEnd') {
      throw new Error('missing matchEnd');
    }
    return end.message.result;
  }

  function startRevengeRematch(expectedPicker: PlayerId, tick: number): void {
    sent.length = 0;
    mgr.handleRematchRequest('A');
    mgr.handleRematchRequest('B');
    mgr.tick(0.05, tick);
    const draft = latestDraftState(sent);
    expect(draft.firstPickerId).toBe(expectedPicker);
    expect(draft.firstPickerReason).toBe('revenge');
    const other = draft.players.find((player) => player.id !== expectedPicker)!.id;
    mgr.handleDraftPick(expectedPicker, 'map', draft.mapOptions[0]);
    mgr.handleDraftPick(other, 'mode', draft.modeOptions[0]);
  }

  it('reliably broadcasts an accepted battle cry to every match participant', () => {
    mgr.handleJoinMatchmaking('A', 'Alpha');
    mgr.handleJoinMatchmaking('B', 'Bravo');
    walkDraft(mgr, sent);
    const match = mgr.getActiveMatches()[0];
    match.phase = MatchPhase.ACTIVE;
    sent.length = 0;

    mgr.handleTaunt('A', 'bring_it');
    expect(sent).toEqual([
      {
        playerId: 'A',
        message: { type: 'server:taunt', playerId: 'A', tauntId: 'bring_it' },
        reliable: true,
      },
      {
        playerId: 'B',
        message: { type: 'server:taunt', playerId: 'A', tauntId: 'bring_it' },
        reliable: true,
      },
    ]);

    mgr.handleTaunt('A', 'still_standing');
    expect(sent).toHaveLength(2);
  });

  it('gathers 3-4 fighters into a distinct Rumble and gives everyone a rally vote', () => {
    mgr.handleJoinRumble('A', 'Alpha');
    mgr.handleJoinRumble('B', 'Bravo');
    mgr.handleJoinRumble('C', 'Cora');

    mgr.tick(RUMBLE.LAUNCH_DELAY_SECONDS - 0.1, 0);
    expect(sent.some((entry) => entry.message.type === 'server:draftState')).toBe(false);
    mgr.tick(0.1, 1);

    const draft = latestDraftState(sent);
    expect(draft.players.map((player) => player.id)).toEqual(['A', 'B', 'C']);
    expect(draft.draftKind).toBe('rally');
    expect(draft.currentPickerId).toBeNull();
    expect(draft.rallyCategory).toBe('map');
    expect(draft.rallyVotes).toEqual([]);

    for (const player of draft.players) {
      mgr.handleDraftPick(player.id, 'map', draft.mapOptions[0]);
    }
    mgr.tick(0.05, 2);
    const modeVote = latestDraftState(sent);
    expect(modeVote.mapPick).toBe(draft.mapOptions[0]);
    expect(modeVote.rallyCategory).toBe('mode');
    for (const player of modeVote.players) {
      mgr.handleDraftPick(player.id, 'mode', modeVote.modeOptions[0]);
    }
    const found = sent.find(
      (entry) => entry.playerId === 'A' && entry.message.type === 'server:matchFound',
    );
    expect(found?.message.type === 'server:matchFound' && found.message.matchKind).toBe('rumble');
    expect(mgr.getActiveMatches()[0].players.size).toBe(3);
  });

  it('resolves each rally phase by plurality and ignores duplicate or off-category ballots', () => {
    for (const [id, nickname] of [
      ['A', 'Alpha'],
      ['B', 'Bravo'],
      ['C', 'Cora'],
      ['D', 'Delta'],
    ] as const) {
      mgr.handleJoinRumble(id, nickname);
    }
    mgr.tick(0.05, 0);
    const draft = latestDraftState(sent);
    const [mapA, mapB] = draft.mapOptions;

    mgr.handleDraftPick('A', 'mode', draft.modeOptions[0]);
    mgr.handleDraftPick('A', 'map', mapA);
    mgr.handleDraftPick('A', 'map', mapB);
    mgr.handleDraftPick('B', 'map', mapA);
    mgr.handleDraftPick('C', 'map', mapA);
    mgr.handleDraftPick('D', 'map', mapB);
    mgr.tick(0.05, 1);

    const modeVote = latestDraftState(sent);
    expect(modeVote.mapPick).toBe(mapA);
    expect(modeVote.rallyCategory).toBe('mode');
    expect(modeVote.rallyVotes).toEqual([]);

    const [modeA, modeB] = modeVote.modeOptions;
    mgr.handleDraftPick('A', 'mode', modeB);
    mgr.handleDraftPick('B', 'mode', modeB);
    mgr.handleDraftPick('C', 'mode', modeB);
    mgr.handleDraftPick('D', 'mode', modeA);
    const match = mgr.getActiveMatches()[0];
    expect(match.mapManager.getMapData().name).toBe(mapA);
    expect(match.gameModeType).toBe(modeB);
  });

  it('breaks a submitted-vote tie authoritatively on timeout without inventing AFK ballots', () => {
    const made = makeFakeServer();
    const tied = new MatchmakingManager(made.fake, () => 0, undefined, seededRng([0, 0, 0.99]));
    tied.handleJoinRumble('A', 'Alpha');
    tied.handleJoinRumble('B', 'Bravo');
    tied.handleJoinRumble('C', 'Cora');
    tied.tick(RUMBLE.LAUNCH_DELAY_SECONDS, 0);
    const draft = latestDraftState(made.sent);

    tied.handleDraftPick('A', 'map', draft.mapOptions[0]);
    tied.handleDraftPick('B', 'map', draft.mapOptions[1]);
    tied.tick(draft.pickDeadlineMs / 1000 + 0.01, 1);

    const resolved = latestDraftState(made.sent);
    expect(resolved.mapPick).toBe(draft.mapOptions[1]);
    expect(resolved.rallyCategory).toBe('mode');
    expect(resolved.pickDeadlineMs).toBe(DRAFT.RALLY_VOTE_SECONDS * 1000);
  });

  it('keeps the two-role draft for a two-fighter Rumble', () => {
    mgr.handleJoinRumble('A', 'Alpha');
    mgr.handleJoinRumble('B', 'Bravo');
    mgr.tick(RUMBLE.LAUNCH_DELAY_SECONDS, 0);
    const draft = latestDraftState(sent);

    expect(draft.draftKind).toBe('turn');
    expect(draft.currentPickerId).toBe(draft.firstPickerId);
    expect(draft.secondPickerId).toBeDefined();
    expect(draft.rallyCategory).toBeNull();
  });

  it('does not author a redundant personal grudge for a two-fighter Rumble', () => {
    mgr.handleJoinRumble('A', 'Alpha');
    mgr.handleJoinRumble('B', 'Bravo');
    mgr.tick(RUMBLE.LAUNCH_DELAY_SECONDS, 0);
    walkDraft(mgr, sent);

    const match = mgr.getActiveMatches()[0];
    match.phase = MatchPhase.ACTIVE;
    match.onKill('B', 'A', 'gun');
    match.phase = MatchPhase.ENDED;
    mgr.tick(0.05, 1);

    const end = [...sent]
      .reverse()
      .find((entry) => entry.playerId === 'A' && entry.message.type === 'server:matchEnd');
    expect(end?.message.type === 'server:matchEnd' && end.message.result.rumbleGrudges).toBeFalsy();
  });

  it('carries the Rumble Crown through a direct group rematch and records a defense', () => {
    for (const [id, nickname] of [
      ['A', 'Alpha'],
      ['B', 'Bravo'],
      ['C', 'Cora'],
    ] as const) {
      mgr.handleJoinRumble(id, nickname);
    }
    mgr.tick(RUMBLE.LAUNCH_DELAY_SECONDS, 0);
    walkDraft(mgr, sent);

    let match = mgr.getActiveMatches()[0];
    match.players.get('A')!.score = 3;
    match.phase = MatchPhase.ENDED;
    mgr.tick(0.05, 1);
    const firstEnd = [...sent]
      .reverse()
      .find((entry) => entry.playerId === 'A' && entry.message.type === 'server:matchEnd');
    expect(
      firstEnd?.message.type === 'server:matchEnd' && firstEnd.message.result.rumbleCrown,
    ).toEqual({
      crown: { holderId: 'A', holderNickname: 'Alpha', wins: 1 },
      outcome: 'claimed',
      previousHolderId: null,
      previousHolderNickname: null,
    });

    sent.length = 0;
    mgr.handleRematchRequest('A');
    mgr.handleRematchRequest('B');
    mgr.handleRematchRequest('C');
    walkDraft(mgr, sent);
    const rematchFound = sent.find(
      (entry) => entry.playerId === 'B' && entry.message.type === 'server:matchFound',
    );
    expect(
      rematchFound?.message.type === 'server:matchFound'
        ? rematchFound.message.rumbleCrown
        : undefined,
    ).toEqual({ holderId: 'A', holderNickname: 'Alpha', wins: 1 });

    match = mgr.getActiveMatches()[0];
    match.players.get('A')!.score = 3;
    match.phase = MatchPhase.ENDED;
    mgr.tick(0.05, 2);
    const secondEnd = [...sent]
      .reverse()
      .find((entry) => entry.playerId === 'A' && entry.message.type === 'server:matchEnd');
    expect(
      secondEnd?.message.type === 'server:matchEnd' && secondEnd.message.result.rumbleCrown,
    ).toMatchObject({
      crown: { holderId: 'A', holderNickname: 'Alpha', wins: 2 },
      outcome: 'defended',
    });
  });

  it('authors personal Rumble grudges and carries them into the direct rematch', () => {
    for (const [id, nickname] of [
      ['A', 'Alpha'],
      ['B', 'Bravo'],
      ['C', 'Cora'],
    ] as const) {
      mgr.handleJoinRumble(id, nickname);
    }
    mgr.tick(RUMBLE.LAUNCH_DELAY_SECONDS, 0);
    walkDraft(mgr, sent);

    const match = mgr.getActiveMatches()[0];
    match.phase = MatchPhase.ACTIVE;
    match.onKill('B', 'A', 'gun');
    match.onKill('C', 'A', 'gun');
    match.onKill('B', 'A', 'gun');
    match.onKill('A', 'B', 'gun');
    match.phase = MatchPhase.ENDED;
    mgr.tick(0.05, 1);

    const firstEnd = [...sent]
      .reverse()
      .find((entry) => entry.playerId === 'A' && entry.message.type === 'server:matchEnd');
    expect(
      firstEnd?.message.type === 'server:matchEnd'
        ? firstEnd.message.result.rumbleGrudges
        : undefined,
    ).toEqual({
      A: { targetId: 'B', targetNickname: 'Bravo', knockouts: 2 },
      B: { targetId: 'A', targetNickname: 'Alpha', knockouts: 1 },
    });

    sent.length = 0;
    mgr.handleRematchRequest('A');
    mgr.handleRematchRequest('B');
    mgr.handleRematchRequest('C');
    walkDraft(mgr, sent);

    const foundFor = (playerId: PlayerId) =>
      sent.find(
        (entry) => entry.playerId === playerId && entry.message.type === 'server:matchFound',
      );
    const aFound = foundFor('A');
    const bFound = foundFor('B');
    const cFound = foundFor('C');
    expect(aFound?.message.type === 'server:matchFound' && aFound.message.rumbleGrudge).toEqual({
      targetId: 'B',
      targetNickname: 'Bravo',
      knockouts: 2,
    });
    expect(bFound?.message.type === 'server:matchFound' && bFound.message.rumbleGrudge).toEqual({
      targetId: 'A',
      targetNickname: 'Alpha',
      knockouts: 1,
    });
    expect(cFound?.message.type === 'server:matchFound' && cFound.message.rumbleGrudge).toBeFalsy();
  });

  it('eliminates an active Rumble leaver while the remaining fighters continue', () => {
    for (const [id, nickname] of [
      ['A', 'Alpha'],
      ['B', 'Bravo'],
      ['C', 'Cora'],
    ] as const) {
      mgr.handleJoinRumble(id, nickname);
    }
    mgr.tick(RUMBLE.LAUNCH_DELAY_SECONDS, 0);
    walkDraft(mgr, sent);
    const match = mgr.getActiveMatches()[0];
    match.phase = MatchPhase.ACTIVE;
    sent.length = 0;

    mgr.handlePlayerDisconnect('C');

    expect(match.phase).toBe(MatchPhase.ACTIVE);
    expect(match.players.get('C')).toMatchObject({ isDead: true, health: 0, score: -1 });
    const notices = sent.filter((entry) => entry.message.type === 'server:playerLeft');
    expect(notices.map((entry) => entry.playerId).sort()).toEqual(['A', 'B']);
    mgr.tick(0.05, 1);
    const state = [...sent]
      .reverse()
      .find((entry) => entry.playerId === 'A' && entry.message.type === 'server:gameState');
    expect(
      state?.message.type === 'server:gameState'
        ? state.message.players.map((player) => player.id).sort()
        : [],
    ).toEqual(['A', 'B']);
  });

  it('applies the same elimination contract to an explicit Rumble leave', () => {
    for (const [id, nickname] of [
      ['A', 'Alpha'],
      ['B', 'Bravo'],
      ['C', 'Cora'],
    ] as const) {
      mgr.handleJoinRumble(id, nickname);
    }
    mgr.tick(RUMBLE.LAUNCH_DELAY_SECONDS, 0);
    walkDraft(mgr, sent);
    const match = mgr.getActiveMatches()[0];
    match.phase = MatchPhase.ACTIVE;
    sent.length = 0;

    mgr.handleReturnToLobby('C');

    expect(match.players.get('C')).toMatchObject({ isDead: true, health: 0, score: -1 });
    expect(
      sent
        .filter((entry) => entry.message.type === 'server:playerLeft')
        .map((entry) => entry.playerId)
        .sort(),
    ).toEqual(['A', 'B']);
    mgr.tick(0.05, 1);
    expect(match.phase).toBe(MatchPhase.ACTIVE);
  });

  it('scores a first-to-three set, gives the loser revenge picks, then resets after a clinch', () => {
    mgr.handleJoinMatchmaking('A', 'Alpha');
    mgr.handleJoinMatchmaking('B', 'Bravo');
    walkDraft(mgr, sent);

    const first = endRoundWithWinner('A', 1);
    expect(first.rivalrySet).toEqual({
      winsToClinch: 3,
      roundsPlayed: 1,
      players: [
        { playerId: 'A', nickname: 'Alpha', wins: 1 },
        { playerId: 'B', nickname: 'Bravo', wins: 0 },
      ],
      championId: null,
    });

    startRevengeRematch('B', 2);
    const second = endRoundWithWinner('A', 3);
    expect(second.rivalrySet?.players.map((player) => player.wins)).toEqual([2, 0]);
    expect(second.rivalrySet?.roundsPlayed).toBe(2);

    startRevengeRematch('B', 4);
    const clincher = endRoundWithWinner('A', 5);
    expect(clincher.rivalrySet?.championId).toBe('A');
    expect(clincher.rivalrySet?.players.map((player) => player.wins)).toEqual([3, 0]);

    // Both opt into a new set. The clincher's loser still gets the revenge
    // draft, but the score itself restarts at 0-0 before this round.
    startRevengeRematch('B', 6);
    const newSet = endRoundWithWinner('B', 7);
    expect(newSet.rivalrySet).toEqual({
      winsToClinch: 3,
      roundsPlayed: 1,
      players: [
        { playerId: 'A', nickname: 'Alpha', wins: 0 },
        { playerId: 'B', nickname: 'Bravo', wins: 1 },
      ],
      championId: null,
    });
  });

  it('starts a rematch draft when both players request it', () => {
    startMatchAndForceEnd('A', 'B');
    sent.length = 0; // clear matchEnd messages

    mgr.handleRematchRequest('A');
    // After A's request, B should have been notified
    const aMsgs = sent.filter(
      (s) => s.playerId === 'B' && s.message.type === 'server:rematchStatus',
    );
    expect(aMsgs).toHaveLength(1);

    mgr.handleRematchRequest('B');

    // Both agreed → a fresh draft opens rather than an instant match.
    expect(mgr.getActiveMatches()).toHaveLength(0);
    walkDraft(mgr, sent);

    const matchFoundMsgs = sent.filter((s) => s.message.type === 'server:matchFound');
    expect(matchFoundMsgs.map((m) => m.playerId).sort()).toEqual(['A', 'B']);

    // A new match should be active
    expect(mgr.getActiveMatches()).toHaveLength(1);
  });

  it('carries the previous round mutators through the rematch draft', () => {
    mgr.handleJoinMatchmaking('A', 'Alpha');
    mgr.handleJoinMatchmaking('B', 'Bravo');
    walkDraft(mgr, sent);
    const first = mgr.getActiveMatches()[0];
    const previous: MutatorId[] = ['vampire', 'blackout'];
    (first.activeMutators as MutatorId[]).push(...previous);
    first.phase = MatchPhase.ENDED;
    mgr.tick(0.05, 1);

    sent.length = 0;
    mgr.handleRematchRequest('A');
    mgr.handleRematchRequest('B');
    walkDraft(mgr, sent);

    const rematch = mgr.getActiveMatches()[0] as unknown as {
      rematchMutatorExclusions: ReadonlySet<MutatorId>;
    };
    expect([...rematch.rematchMutatorExclusions]).toEqual(previous);
  });

  it('rolls a different contract for a direct rematch', () => {
    mgr.handleJoinMatchmaking('A', 'Alpha');
    mgr.handleJoinMatchmaking('B', 'Bravo');
    walkDraft(mgr, sent);
    const first = mgr.getActiveMatches()[0];
    const previousContract = first.getContractHudState().id;
    first.phase = MatchPhase.ENDED;
    mgr.tick(0.05, 1);

    sent.length = 0;
    mgr.handleRematchRequest('A');
    mgr.handleRematchRequest('B');
    walkDraft(mgr, sent);

    expect(mgr.getActiveMatches()[0].getContractHudState().id).not.toBe(previousContract);
  });

  it('resets the post-match timeout when a player requests rematch', () => {
    vi.useFakeTimers();
    try {
      startMatchAndForceEnd('A', 'B');
      sent.length = 0;

      // Burn most of the initial 60s window before A clicks rematch.
      vi.advanceTimersByTime(55_000);
      mgr.handleRematchRequest('A');

      // 50s after A's click — would have been past the original timeout if it
      // hadn't been reset (55s + 50s = 105s total since match end). The
      // post-match state must still be live so B can complete the rematch.
      vi.advanceTimersByTime(50_000);
      mgr.handleRematchRequest('B');
      walkDraft(mgr, sent);

      const matchFoundMsgs = sent.filter((s) => s.message.type === 'server:matchFound');
      expect(matchFoundMsgs.map((m) => m.playerId).sort()).toEqual(['A', 'B']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancels the post-match state if neither player clicks within the window', () => {
    vi.useFakeTimers();
    try {
      startMatchAndForceEnd('A', 'B');
      sent.length = 0;

      // Run past the timeout without any rematch requests.
      vi.advanceTimersByTime(60_001);

      const cancelMsgs = sent.filter(
        (s) => s.message.type === 'server:matchmakingStatus' && s.message.status === 'cancelled',
      );
      expect(cancelMsgs.map((m) => m.playerId).sort()).toEqual(['A', 'B']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('responds when a rematch request arrives after the post-match window expired', () => {
    vi.useFakeTimers();
    try {
      startMatchAndForceEnd('A', 'B');
      sent.length = 0;

      vi.advanceTimersByTime(60_001);
      sent.length = 0;

      mgr.handleRematchRequest('A');

      expect(sent).toContainEqual(
        expect.objectContaining({
          playerId: 'A',
          message: expect.objectContaining({
            type: 'server:matchmakingStatus',
            status: 'cancelled',
          }),
          reliable: true,
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('MatchmakingManager map rotation (FORCE-pinned, draft skipped)', () => {
  let mgr: MatchmakingManager;
  let sent: SentMessage[];

  beforeEach(() => {
    const { fake, sent: bucket } = makeFakeServer();
    sent = bucket;
    mgr = new MatchmakingManager(fake);
    // Any FORCE pin disables the draft; pinning the MODE leaves the map
    // side on the rotation cursor under test.
    process.env.FORCE_MODE = GameModeType.DEATHMATCH;
  });

  afterEach(() => {
    delete process.env.FORCE_MAP;
    delete process.env.FORCE_MODE;
  });

  function matchFoundMapName(playerId: PlayerId): string {
    const msg = sent.find((s) => s.playerId === playerId && s.message.type === 'server:matchFound');
    if (!msg || msg.message.type !== 'server:matchFound') {
      throw new Error(`no matchFound for ${playerId}`);
    }
    return msg.message.mapName;
  }

  function endActiveMatch(): void {
    const matches = mgr.getActiveMatches();
    expect(matches).toHaveLength(1);
    matches[0].phase = MatchPhase.ENDED;
    mgr.tick(0.05, 1);
  }

  function lastMatchEndNextMap(): string | null {
    const msgs = sent.filter((s) => s.message.type === 'server:matchEnd');
    expect(msgs.length).toBeGreaterThan(0);
    const last = msgs[msgs.length - 1];
    if (last.message.type !== 'server:matchEnd') throw new Error('unreachable');
    return last.message.result.nextMapName;
  }

  it('fresh matches cycle the registry order and wrap', () => {
    const names = listMapNames();
    const pairs: Array<[PlayerId, PlayerId]> = Array.from(
      { length: names.length + 1 },
      (_, index) => [`P${index}A`, `P${index}B`],
    );
    pairs.forEach(([p1, p2], i) => {
      sent.length = 0;
      mgr.handleJoinMatchmaking(p1, p1);
      mgr.handleJoinMatchmaking(p2, p2);
      expect(matchFoundMapName(p1)).toBe(names[i % names.length]);
      expect(matchFoundMapName(p2)).toBe(names[i % names.length]);
    });
    expect(matchFoundMapName(pairs[names.length][0])).toBe(names[0]); // wrapped
  });

  it('matchEnd promises the next map and the pinned rematch delivers it', () => {
    const names = listMapNames();
    mgr.handleJoinMatchmaking('A', 'A');
    mgr.handleJoinMatchmaking('B', 'B');
    expect(matchFoundMapName('A')).toBe(names[0]);

    // Every result promises the next registry map and its rematch delivers it.
    for (let i = 1; i < names.length; i += 1) {
      endActiveMatch();
      expect(lastMatchEndNextMap()).toBe(names[i]);
      sent.length = 0;
      mgr.handleRematchRequest('A');
      mgr.handleRematchRequest('B');
      expect(matchFoundMapName('A')).toBe(names[i]);
    }

    // The final map promises the first map again.
    endActiveMatch();
    expect(lastMatchEndNextMap()).toBe(names[0]);
  });

  it('FORCE_MAP pins fresh matches, the promised next map, and rematches', () => {
    const names = listMapNames();
    process.env.FORCE_MAP = names[2];

    mgr.handleJoinMatchmaking('A', 'A');
    mgr.handleJoinMatchmaking('B', 'B');
    expect(matchFoundMapName('A')).toBe(names[2]);

    endActiveMatch();
    expect(lastMatchEndNextMap()).toBe(names[2]);
    sent.length = 0;
    mgr.handleRematchRequest('A');
    mgr.handleRematchRequest('B');
    expect(matchFoundMapName('A')).toBe(names[2]);
  });

  it('ignores an unknown FORCE_MAP and falls back to rotation (still no draft)', () => {
    process.env.FORCE_MAP = 'No Such Arena';
    delete process.env.FORCE_MODE;
    mgr.handleJoinMatchmaking('A', 'A');
    mgr.handleJoinMatchmaking('B', 'B');
    // A present-but-invalid pin still means "no draft" — it degrades to
    // the deterministic rotation, never to a surprise draft.
    expect(matchFoundMapName('A')).toBe(listMapNames()[0]);
    expect(sent.some((s) => s.message.type === 'server:draftState')).toBe(false);
  });
});

describe('MatchmakingManager mode rotation (FORCE-pinned, draft skipped)', () => {
  let mgr: MatchmakingManager;
  let sent: SentMessage[];

  beforeEach(() => {
    const { fake, sent: bucket } = makeFakeServer();
    sent = bucket;
    mgr = new MatchmakingManager(fake);
    // Any FORCE pin disables the draft; pinning the MAP leaves the mode
    // side on the rotation cursor under test.
    process.env.FORCE_MAP = listMapNames()[0];
  });

  afterEach(() => {
    delete process.env.FORCE_MAP;
    delete process.env.FORCE_MODE;
  });

  function matchFoundMode(playerId: PlayerId): GameModeType {
    const msg = sent.find((s) => s.playerId === playerId && s.message.type === 'server:matchFound');
    if (!msg || msg.message.type !== 'server:matchFound') {
      throw new Error(`no matchFound for ${playerId}`);
    }
    return msg.message.gameMode;
  }

  function endActiveMatch(): void {
    const matches = mgr.getActiveMatches();
    expect(matches).toHaveLength(1);
    matches[0].phase = MatchPhase.ENDED;
    mgr.tick(0.05, 1);
  }

  function lastMatchEndNextMode(): GameModeType | null {
    const msgs = sent.filter((s) => s.message.type === 'server:matchEnd');
    expect(msgs.length).toBeGreaterThan(0);
    const last = msgs[msgs.length - 1];
    if (last.message.type !== 'server:matchEnd') throw new Error('unreachable');
    return last.message.result.nextGameMode;
  }

  it('fresh matches cycle every mode and wrap', () => {
    const pairs: Array<[PlayerId, PlayerId]> = [
      ['A', 'B'],
      ['C', 'D'],
      ['E', 'F'],
      ['G', 'H'],
      ['I', 'J'],
      ['K', 'L'],
      ['M', 'N'],
      ['O', 'P'],
      ['Q', 'R'],
    ];
    pairs.forEach(([p1, p2], i) => {
      sent.length = 0;
      mgr.handleJoinMatchmaking(p1, p1);
      mgr.handleJoinMatchmaking(p2, p2);
      const expected = GAME_MODE_ROTATION[i % GAME_MODE_ROTATION.length];
      expect(matchFoundMode(p1)).toBe(expected);
      expect(matchFoundMode(p2)).toBe(expected);
    });
    expect(matchFoundMode('Q')).toBe(GAME_MODE_ROTATION[0]); // wrapped
  });

  it('matchEnd promises the next mode and the pinned rematch delivers it', () => {
    mgr.handleJoinMatchmaking('A', 'A');
    mgr.handleJoinMatchmaking('B', 'B');
    expect(matchFoundMode('A')).toBe(GameModeType.DEATHMATCH);

    endActiveMatch();
    expect(lastMatchEndNextMode()).toBe(GameModeType.KOTH);
    sent.length = 0;
    mgr.handleRematchRequest('A');
    mgr.handleRematchRequest('B');
    expect(matchFoundMode('A')).toBe(GameModeType.KOTH);

    // Chain continues into Gun Game...
    endActiveMatch();
    expect(lastMatchEndNextMode()).toBe(GameModeType.GUN_GAME);
    sent.length = 0;
    mgr.handleRematchRequest('A');
    mgr.handleRematchRequest('B');
    expect(matchFoundMode('A')).toBe(GameModeType.GUN_GAME);

    // ...then continues into Last Stand...
    endActiveMatch();
    expect(lastMatchEndNextMode()).toBe(GameModeType.LAST_STAND);
    sent.length = 0;
    mgr.handleRematchRequest('A');
    mgr.handleRematchRequest('B');
    expect(matchFoundMode('A')).toBe(GameModeType.LAST_STAND);

    // ...then Kill Confirmed...
    endActiveMatch();
    expect(lastMatchEndNextMode()).toBe(GameModeType.KILL_CONFIRMED);
    sent.length = 0;
    mgr.handleRematchRequest('A');
    mgr.handleRematchRequest('B');
    expect(matchFoundMode('A')).toBe(GameModeType.KILL_CONFIRMED);

    // ...then One in the Chamber...
    endActiveMatch();
    expect(lastMatchEndNextMode()).toBe(GameModeType.ONE_IN_THE_CHAMBER);
    sent.length = 0;
    mgr.handleRematchRequest('A');
    mgr.handleRematchRequest('B');
    expect(matchFoundMode('A')).toBe(GameModeType.ONE_IN_THE_CHAMBER);

    // ...then Core Run...
    endActiveMatch();
    expect(lastMatchEndNextMode()).toBe(GameModeType.CORE_RUN);
    sent.length = 0;
    mgr.handleRematchRequest('A');
    mgr.handleRematchRequest('B');
    expect(matchFoundMode('A')).toBe(GameModeType.CORE_RUN);

    // ...then Bounty Hunt...
    endActiveMatch();
    expect(lastMatchEndNextMode()).toBe(GameModeType.BOUNTY_HUNT);
    sent.length = 0;
    mgr.handleRematchRequest('A');
    mgr.handleRematchRequest('B');
    expect(matchFoundMode('A')).toBe(GameModeType.BOUNTY_HUNT);

    // ...then wraps back to DM.
    endActiveMatch();
    expect(lastMatchEndNextMode()).toBe(GameModeType.DEATHMATCH);
    sent.length = 0;
    mgr.handleRematchRequest('A');
    mgr.handleRematchRequest('B');
    expect(matchFoundMode('A')).toBe(GameModeType.DEATHMATCH);
  });

  it('FORCE_MODE pins fresh matches, the promised next mode, and rematches', () => {
    process.env.FORCE_MODE = GameModeType.KOTH;

    mgr.handleJoinMatchmaking('A', 'A');
    mgr.handleJoinMatchmaking('B', 'B');
    expect(matchFoundMode('A')).toBe(GameModeType.KOTH);

    endActiveMatch();
    expect(lastMatchEndNextMode()).toBe(GameModeType.KOTH);
    sent.length = 0;
    mgr.handleRematchRequest('A');
    mgr.handleRematchRequest('B');
    expect(matchFoundMode('A')).toBe(GameModeType.KOTH);
  });

  it('ignores an unknown FORCE_MODE and falls back to rotation (still no draft)', () => {
    process.env.FORCE_MODE = 'no_such_mode';
    delete process.env.FORCE_MAP;
    mgr.handleJoinMatchmaking('A', 'A');
    mgr.handleJoinMatchmaking('B', 'B');
    expect(matchFoundMode('A')).toBe(GAME_MODE_ROTATION[0]);
    expect(sent.some((s) => s.message.type === 'server:draftState')).toBe(false);
  });

  it('FORCE_MODE=gun_game pins fresh matches and rematches to Gun Game', () => {
    process.env.FORCE_MODE = GameModeType.GUN_GAME;

    mgr.handleJoinMatchmaking('A', 'A');
    mgr.handleJoinMatchmaking('B', 'B');
    expect(matchFoundMode('A')).toBe(GameModeType.GUN_GAME);

    endActiveMatch();
    expect(lastMatchEndNextMode()).toBe(GameModeType.GUN_GAME);
    sent.length = 0;
    mgr.handleRematchRequest('A');
    mgr.handleRematchRequest('B');
    expect(matchFoundMode('A')).toBe(GameModeType.GUN_GAME);
  });

  it('KOTH gameState snapshots carry hill state; DM ones do not', () => {
    process.env.FORCE_MODE = GameModeType.KOTH;
    const dt = 0.05;

    mgr.handleJoinMatchmaking('A', 'A');
    mgr.handleJoinMatchmaking('B', 'B');
    mgr.handleCharacterLock('A', 'mighty_man');
    mgr.handleCharacterLock('B', 'bruce');

    const totalTicks = Math.ceil(MATCH.COUNTDOWN_DURATION / dt) + 10;
    for (let i = 1; i <= totalTicks; i++) mgr.tick(dt, i);

    const active = sent.filter(
      (s) => s.message.type === 'server:gameState' && s.message.phase === MatchPhase.ACTIVE,
    );
    expect(active.length).toBeGreaterThan(0);
    for (const { message } of active) {
      if (message.type !== 'server:gameState') throw new Error('unreachable');
      expect(message.koth).toBeDefined();
      expect(message.koth!.hill).toBeDefined();
      expect(message.isOvertime).toBe(false);
      expect(message.contract.target).toBeGreaterThan(0);
      expect(message.contract.players).toEqual([
        expect.objectContaining({
          playerId: 'A',
          progress: expect.any(Number),
        }),
        expect.objectContaining({
          playerId: 'B',
          progress: expect.any(Number),
        }),
      ]);
    }
  });

  it('Core Run snapshots carry the persistent moving objective state', () => {
    process.env.FORCE_MODE = GameModeType.CORE_RUN;
    const dt = 0.05;

    mgr.handleJoinMatchmaking('A', 'A');
    mgr.handleJoinMatchmaking('B', 'B');
    mgr.handleCharacterLock('A', 'mighty_man');
    mgr.handleCharacterLock('B', 'bruce');

    const totalTicks = Math.ceil(MATCH.COUNTDOWN_DURATION / dt) + 10;
    for (let i = 1; i <= totalTicks; i++) mgr.tick(dt, i);

    const active = sent.filter(
      (s) => s.message.type === 'server:gameState' && s.message.phase === MatchPhase.ACTIVE,
    );
    expect(active.length).toBeGreaterThan(0);
    for (const { message } of active) {
      if (message.type !== 'server:gameState') throw new Error('unreachable');
      expect(message.coreRun).toMatchObject({
        position: { x: expect.any(Number), y: expect.any(Number) },
        carrierId: null,
        carryFraction: expect.any(Number),
      });
      expect(message.confirmedTags).toBeUndefined();
      expect(message.koth).toBeUndefined();
    }
  });

  it('Bounty Hunt snapshots carry one authoritative marked fighter', () => {
    process.env.FORCE_MODE = GameModeType.BOUNTY_HUNT;
    const dt = 0.05;

    mgr.handleJoinMatchmaking('A', 'A');
    mgr.handleJoinMatchmaking('B', 'B');
    mgr.handleCharacterLock('A', 'mighty_man');
    mgr.handleCharacterLock('B', 'bruce');

    const totalTicks = Math.ceil(MATCH.COUNTDOWN_DURATION / dt) + 10;
    for (let i = 1; i <= totalTicks; i++) mgr.tick(dt, i);

    const active = sent.filter(
      (s) => s.message.type === 'server:gameState' && s.message.phase === MatchPhase.ACTIVE,
    );
    expect(active.length).toBeGreaterThan(0);
    for (const { message } of active) {
      if (message.type !== 'server:gameState') throw new Error('unreachable');
      expect(['A', 'B']).toContain(message.bountyHunt?.targetId);
      expect(message.coreRun).toBeUndefined();
      expect(message.koth).toBeUndefined();
    }
  });

  it('snapshots carry Wasteland Warp countdown state only after activation', () => {
    process.env.FORCE_MODE = GameModeType.DEATHMATCH;
    const dt = 0.05;
    mgr.handleJoinMatchmaking('A', 'A');
    mgr.handleJoinMatchmaking('B', 'B');
    mgr.handleCharacterLock('A', 'mighty_man');
    mgr.handleCharacterLock('B', 'bruce');
    const toActive = Math.ceil(MATCH.COUNTDOWN_DURATION / dt) + 5;
    for (let i = 1; i <= toActive; i++) mgr.tick(dt, i);

    const before = [...sent]
      .reverse()
      .find(
        (entry) =>
          entry.message.type === 'server:gameState' && entry.message.phase === MatchPhase.ACTIVE,
      );
    expect(
      before?.message.type === 'server:gameState' && before.message.wastelandWarp,
    ).toBeUndefined();

    const match = mgr.getActiveMatches()[0];
    (
      match as unknown as {
        startMutator: (mutator: MutatorId, isFinalMinute: boolean) => void;
      }
    ).startMutator('wasteland_warp', false);
    sent.length = 0;
    mgr.tick(dt, 1000);

    const after = sent.find(
      (entry) =>
        entry.message.type === 'server:gameState' && entry.message.phase === MatchPhase.ACTIVE,
    );
    if (!after || after.message.type !== 'server:gameState') {
      throw new Error('missing active warp snapshot');
    }
    expect(after.message.wastelandWarp).toMatchObject({
      secondsUntilSwap: expect.any(Number),
      sequence: 0,
    });
  });

  it('snapshots carry Scrapstorm warnings and transient impact cues', () => {
    process.env.FORCE_MODE = GameModeType.DEATHMATCH;
    const dt = 0.05;
    mgr.handleJoinMatchmaking('A', 'A');
    mgr.handleJoinMatchmaking('B', 'B');
    mgr.handleCharacterLock('A', 'mighty_man');
    mgr.handleCharacterLock('B', 'bruce');
    const toActive = Math.ceil(MATCH.COUNTDOWN_DURATION / dt) + 5;
    for (let i = 1; i <= toActive; i++) mgr.tick(dt, i);

    const match = mgr.getActiveMatches()[0];
    (
      match as unknown as {
        startMutator: (mutator: MutatorId, isFinalMinute: boolean) => void;
      }
    ).startMutator('scrapstorm', false);
    sent.length = 0;
    const warningTicks = Math.ceil(MUTATORS.SCRAPSTORM_FIRST_WARNING_DELAY_SECONDS / dt) + 1;
    for (let i = 1; i <= warningTicks; i++) mgr.tick(dt, 1000 + i);

    const warning = [...sent]
      .reverse()
      .find(
        (entry) =>
          entry.message.type === 'server:gameState' &&
          entry.message.scrapstorm?.targetPosition != null,
      );
    if (!warning || warning.message.type !== 'server:gameState') {
      throw new Error('missing Scrapstorm warning snapshot');
    }
    expect(warning.message.scrapstorm).toMatchObject({
      targetPosition: expect.objectContaining({
        x: expect.any(Number),
        y: expect.any(Number),
      }),
      targetPlayerId: expect.stringMatching(/^[AB]$/),
      secondsUntilImpact: expect.any(Number),
      radius: MUTATORS.SCRAPSTORM_RADIUS_PX,
    });

    sent.length = 0;
    const impactTicks = Math.ceil(MUTATORS.SCRAPSTORM_WARNING_SECONDS / dt) + 1;
    for (let i = 1; i <= impactTicks; i++) mgr.tick(dt, 2000 + i);
    const impact = sent.find(
      (entry) =>
        entry.message.type === 'server:gameState' && entry.message.barrelExplosions.length > 0,
    );
    expect(impact).toBeDefined();
  });

  it('broadcasts overtimeStart and flags gameState when a tie runs out the clock', () => {
    const dt = 0.05;
    mgr.handleJoinMatchmaking('A', 'A');
    mgr.handleJoinMatchmaking('B', 'B');
    mgr.handleCharacterLock('A', 'mighty_man');
    mgr.handleCharacterLock('B', 'bruce');

    const toActive = Math.ceil(MATCH.COUNTDOWN_DURATION / dt) + 5;
    for (let i = 1; i <= toActive; i++) mgr.tick(dt, i);

    // Fast-forward the authoritative clock to the final moment; the 0-0
    // scoreboard is a genuine tie when it expires.
    const match = mgr.getActiveMatches()[0];
    match.matchTimer = 0.06;
    sent.length = 0;
    mgr.tick(dt, toActive + 1);
    mgr.tick(dt, toActive + 2);

    const overtimeMsgs = sent.filter((s) => s.message.type === 'server:overtimeStart');
    expect(overtimeMsgs.map((m) => m.playerId).sort()).toEqual(['A', 'B']);
    for (const { message, reliable } of overtimeMsgs) {
      if (message.type !== 'server:overtimeStart') throw new Error('unreachable');
      expect(message.overtimeEndsInMs).toBe(OVERTIME.DURATION * 1000);
      expect(reliable).toBe(true);
    }

    const lastState = [...sent].reverse().find((s) => s.message.type === 'server:gameState');
    if (!lastState || lastState.message.type !== 'server:gameState') {
      throw new Error('missing gameState');
    }
    expect(lastState.message.isOvertime).toBe(true);
    expect(lastState.message.matchTimer).toBeLessThanOrEqual(OVERTIME.DURATION);
    expect(lastState.message.matchTimer).toBeGreaterThan(OVERTIME.DURATION - 1);
  });
});

describe('MatchmakingManager pre-match draft', () => {
  let sent: SentMessage[];
  let fake: GameServer;

  beforeEach(() => {
    const made = makeFakeServer();
    fake = made.fake;
    sent = made.sent;
  });

  afterEach(() => {
    delete process.env.FORCE_MAP;
    delete process.env.FORCE_MODE;
  });

  function makeManager(rngValues: number[]): MatchmakingManager {
    return new MatchmakingManager(fake, () => 0, undefined, seededRng(rngValues));
  }

  function pairUp(mgr: MatchmakingManager): void {
    mgr.handleJoinMatchmaking('A', 'A');
    mgr.handleJoinMatchmaking('B', 'B');
  }

  function matchFoundMessages(bucket: SentMessage[]) {
    return bucket
      .filter((s) => s.message.type === 'server:matchFound')
      .map((s) => {
        if (s.message.type !== 'server:matchFound') throw new Error('unreachable');
        return {
          playerId: s.playerId,
          message: s.message,
          reliable: s.reliable,
        };
      });
  }

  it('rolls who picks first with the injected rng (second entrant wins the roll)', () => {
    const mgr = makeManager([0.9, 0]);
    pairUp(mgr);

    // Drafting, not matched: no Match, no matchFound.
    expect(mgr.getActiveMatches()).toHaveLength(0);
    mgr.tick(0.05, 1);
    expect(sent.some((s) => s.message.type === 'server:matchFound')).toBe(false);

    const snap = latestDraftState(sent);
    expect(snap.firstPickerId).toBe('B');
    expect(snap.currentPickerId).toBe('B');
    expect(snap.players.map((p) => p.id).sort()).toEqual(['A', 'B']);
  });

  it('rolls who picks first with the injected rng (first entrant wins the roll)', () => {
    const mgr = makeManager([0.1, 0]);
    pairUp(mgr);
    mgr.tick(0.05, 1);

    const snap = latestDraftState(sent);
    expect(snap.firstPickerId).toBe('A');
    expect(snap.currentPickerId).toBe('A');
  });

  it('first pick claims map; the second picker may only pick the remaining category', () => {
    const names = listMapNames();
    const mgr = makeManager([0, 0]); // A first, B second
    pairUp(mgr);

    mgr.handleDraftPick('A', 'map', names[1]);
    mgr.tick(0.05, 1);
    let snap = latestDraftState(sent);
    expect(snap.mapPick).toBe(names[1]);
    expect(snap.modePick).toBeNull();
    // The roles are distinct: the turn moved to the OTHER entrant with a
    // fresh second-pick window.
    expect(snap.currentPickerId).toBe('B');
    expect(snap.pickDeadlineMs).toBeGreaterThan((DRAFT.SECOND_PICK_SECONDS - 1) * 1000);
    expect(snap.pickDeadlineMs).toBeLessThanOrEqual(DRAFT.SECOND_PICK_SECONDS * 1000);

    // B tries to re-pick the claimed category — ignored.
    mgr.handleDraftPick('B', 'map', names[2]);
    mgr.tick(0.05, 2);
    snap = latestDraftState(sent);
    expect(snap.mapPick).toBe(names[1]);
    expect(snap.modePick).toBeNull();
    expect(sent.some((s) => s.message.type === 'server:matchFound')).toBe(false);

    // B picks the remaining category — draft finalizes.
    mgr.handleDraftPick('B', 'mode', GameModeType.KOTH);
    const found = matchFoundMessages(sent);
    expect(found.map((f) => f.playerId).sort()).toEqual(['A', 'B']);
  });

  it('first pick claims mode; the second picker then picks the map (mirror order)', () => {
    const names = listMapNames();
    const mgr = makeManager([0.9, 0]); // B first, A second
    pairUp(mgr);

    mgr.handleDraftPick('B', 'mode', GameModeType.GUN_GAME);
    mgr.tick(0.05, 1);
    let snap = latestDraftState(sent);
    expect(snap.modePick).toBe(GameModeType.GUN_GAME);
    expect(snap.mapPick).toBeNull();
    expect(snap.currentPickerId).toBe('A');

    // A tries the claimed category — ignored.
    mgr.handleDraftPick('A', 'mode', GameModeType.KOTH);
    mgr.tick(0.05, 2);
    snap = latestDraftState(sent);
    expect(snap.modePick).toBe(GameModeType.GUN_GAME);
    expect(sent.some((s) => s.message.type === 'server:matchFound')).toBe(false);

    mgr.handleDraftPick('A', 'map', names[0]);
    const match = mgr.getActiveMatches()[0];
    expect(match.gameModeType).toBe(GameModeType.GUN_GAME);
    expect(match.mapManager.getMapData().name).toBe(names[0]);
  });

  it('ignores wrong-turn picks, unknown values, and picks from players outside the draft', () => {
    const names = listMapNames();
    const mgr = makeManager([0, 0]); // A first
    pairUp(mgr);

    mgr.handleDraftPick('B', 'map', names[0]); // not B's turn
    mgr.handleDraftPick('A', 'map', 'No Such Arena'); // unknown map
    mgr.handleDraftPick('A', 'mode', 'no_such_mode'); // unknown mode
    mgr.handleDraftPick('Z', 'map', names[0]); // not in any draft

    mgr.tick(0.05, 1);
    const snap = latestDraftState(sent);
    expect(snap.mapPick).toBeNull();
    expect(snap.modePick).toBeNull();
    expect(snap.currentPickerId).toBe('A');
    expect(sent.some((s) => s.message.type === 'server:matchFound')).toBe(false);
    expect(mgr.getActiveMatches()).toHaveLength(0);
  });

  it('creates the match with exactly the drafted map+mode and stops broadcasting', () => {
    const names = listMapNames();
    const mgr = makeManager([0, 0]); // A first
    pairUp(mgr);

    // Capture the draft's matchId so the matchFound correlation holds.
    mgr.tick(0.05, 1);
    const draftMatchId = latestDraftState(sent).matchId;

    mgr.handleDraftPick('A', 'map', names[2]);
    mgr.handleDraftPick('B', 'mode', GameModeType.KOTH);

    const found = matchFoundMessages(sent);
    expect(found.map((f) => f.playerId).sort()).toEqual(['A', 'B']);
    for (const f of found) {
      expect(f.message.matchId).toBe(draftMatchId);
      expect(f.message.mapName).toBe(names[2]);
      expect(f.message.gameMode).toBe(GameModeType.KOTH);
      expect(f.reliable).toBe(true);
    }

    const matched = sent.filter(
      (s) => s.message.type === 'server:matchmakingStatus' && s.message.status === 'matched',
    );
    expect(matched.map((s) => s.playerId).sort()).toEqual(['A', 'B']);

    // The Match itself was constructed from the drafted pair.
    const match = mgr.getActiveMatches()[0];
    expect(match.mapManager.getMapData().name).toBe(names[2]);
    expect(match.gameModeType).toBe(GameModeType.KOTH);

    // Draft broadcast stops once the match exists.
    sent.length = 0;
    mgr.tick(0.05, 2);
    expect(sent.some((s) => s.message.type === 'server:draftState')).toBe(false);
  });

  it('auto-picks the map on first-pick timeout and hands the mode to the second picker with a fresh window', () => {
    const names = listMapNames();
    // Rolls: first=A, second=B; timeout: category 0.4 (<0.5 → map),
    // option 0 → first registry map.
    const mgr = makeManager([0, 0, 0.4, 0]);
    pairUp(mgr);

    // Burn the entire first-pick window in 1s ticks.
    for (let i = 1; i <= DRAFT.FIRST_PICK_SECONDS; i++) mgr.tick(1, i);

    const snap = latestDraftState(sent);
    expect(snap.mapPick).toBe(names[0]);
    expect(snap.modePick).toBeNull();
    expect(snap.firstPickerId).toBe('A');
    expect(snap.currentPickerId).toBe('B');
    expect(snap.pickDeadlineMs).toBe(DRAFT.SECOND_PICK_SECONDS * 1000);
    expect(sent.some((s) => s.message.type === 'server:matchFound')).toBe(false);
  });

  it('first-pick timeout can auto-claim the mode category instead', () => {
    // Timeout rolls: category 0.6 (≥0.5 → mode), option 0.5 → middle mode.
    const mgr = makeManager([0, 0, 0.6, 0.5]);
    pairUp(mgr);

    for (let i = 1; i <= DRAFT.FIRST_PICK_SECONDS; i++) mgr.tick(1, i);

    const snap = latestDraftState(sent);
    const expectedMode = GAME_MODE_ROTATION[Math.floor(0.5 * GAME_MODE_ROTATION.length)];
    expect(snap.modePick).toBe(expectedMode);
    expect(snap.mapPick).toBeNull();
    expect(snap.currentPickerId).toBe('B');
  });

  it('auto-picks the remaining category on second-pick timeout and finalizes', () => {
    const names = listMapNames();
    // Rolls: first=A, second=B; second-pick timeout consumes ONE option
    // roll (the category is forced to the remaining one): 0.9 → last map.
    const mgr = makeManager([0, 0, 0.9]);
    pairUp(mgr);

    mgr.handleDraftPick('A', 'mode', GameModeType.DEATHMATCH);
    for (let i = 1; i <= DRAFT.SECOND_PICK_SECONDS; i++) mgr.tick(1, i);

    const expectedMap = names[Math.floor(0.9 * names.length)];
    const found = matchFoundMessages(sent);
    expect(found.map((f) => f.playerId).sort()).toEqual(['A', 'B']);
    for (const f of found) {
      expect(f.message.mapName).toBe(expectedMap);
      expect(f.message.gameMode).toBe(GameModeType.DEATHMATCH);
      expect(f.message.standardMatch).toBeUndefined();
    }
    const match = mgr.getActiveMatches()[0];
    expect(match.mapManager.getMapData().name).toBe(expectedMap);
  });

  it('broadcasts a full snapshot to every entrant each tick with a counting-down deadline', () => {
    const names = listMapNames();
    const mgr = makeManager([0, 0]);
    mgr.handleJoinMatchmaking('A', 'Ryan');
    mgr.handleJoinMatchmaking('B', 'Dave');

    mgr.tick(0.05, 1);
    const perTick = sent.filter((s) => s.message.type === 'server:draftState');
    expect(perTick.map((s) => s.playerId).sort()).toEqual(['A', 'B']);
    // Same cadence contract as characterSelectState: unreliable, the next
    // tick repairs a drop.
    expect(perTick.every((s) => !s.reliable)).toBe(true);

    const snap1 = latestDraftState(sent);
    expect(snap1.players).toEqual([
      { id: 'A', nickname: 'Ryan', arenaWins: createEmptyArenaWins() },
      { id: 'B', nickname: 'Dave', arenaWins: createEmptyArenaWins() },
    ]);
    expect(snap1.firstPickerId).toBe('A');
    expect(snap1.currentPickerId).toBe('A');
    expect(snap1.mapPick).toBeNull();
    expect(snap1.modePick).toBeNull();
    expect(snap1.mapOptions).toEqual([...names]);
    expect(snap1.modeOptions).toEqual([...GAME_MODE_ROTATION]);
    expect(snap1.pickDeadlineMs).toBeGreaterThan(0);
    expect(snap1.pickDeadlineMs).toBeLessThanOrEqual(DRAFT.FIRST_PICK_SECONDS * 1000);

    sent.length = 0;
    mgr.tick(0.05, 2);
    const snap2 = latestDraftState(sent);
    expect(snap2.pickDeadlineMs).toBeLessThan(snap1.pickDeadlineMs);

    // Picks land in the very next snapshot.
    mgr.handleDraftPick('A', 'map', names[1]);
    sent.length = 0;
    mgr.tick(0.05, 3);
    const snap3 = latestDraftState(sent);
    expect(snap3.mapPick).toBe(names[1]);
    expect(snap3.currentPickerId).toBe('B');
  });

  it('FORCE_MAP skips the draft entirely (immediate matchFound, no draftState)', () => {
    const names = listMapNames();
    process.env.FORCE_MAP = names[1];
    const mgr = makeManager([0, 0]);
    pairUp(mgr);

    const found = matchFoundMessages(sent);
    expect(found.map((f) => f.playerId).sort()).toEqual(['A', 'B']);
    expect(found[0].message.mapName).toBe(names[1]);
    expect(found[0].message.standardMatch).toBeUndefined();

    mgr.tick(0.05, 1);
    expect(sent.some((s) => s.message.type === 'server:draftState')).toBe(false);
  });

  it('FORCE_MODE skips the draft entirely (immediate matchFound, no draftState)', () => {
    process.env.FORCE_MODE = GameModeType.KOTH;
    const mgr = makeManager([0, 0]);
    pairUp(mgr);

    const found = matchFoundMessages(sent);
    expect(found.map((f) => f.playerId).sort()).toEqual(['A', 'B']);
    expect(found[0].message.gameMode).toBe(GameModeType.KOTH);

    mgr.tick(0.05, 1);
    expect(sent.some((s) => s.message.type === 'server:draftState')).toBe(false);
  });

  it('a rematch opens a fresh draft with a fresh roll and plays the drafted map/mode', () => {
    const names = listMapNames();
    // Fresh roll: A first. Rematch roll: 0.9 → B first.
    const mgr = makeManager([0, 0, 0.9, 0]);
    pairUp(mgr);
    walkDraft(mgr, sent);

    const match = mgr.getActiveMatches()[0];
    match.phase = MatchPhase.ENDED;
    mgr.tick(0.05, 1);
    sent.length = 0;

    mgr.handleRematchRequest('A');
    mgr.handleRematchRequest('B');

    // No instant match — a new draft with a fresh who-picks-first roll.
    expect(mgr.getActiveMatches()).toHaveLength(0);
    expect(sent.some((s) => s.message.type === 'server:matchFound')).toBe(false);
    mgr.tick(0.05, 2);
    const snap = latestDraftState(sent);
    expect(snap.firstPickerId).toBe('B');

    mgr.handleDraftPick('B', 'mode', GameModeType.GUN_GAME);
    mgr.handleDraftPick('A', 'map', names[2]);

    const rematch = mgr.getActiveMatches()[0];
    expect(rematch.gameModeType).toBe(GameModeType.GUN_GAME);
    expect(rematch.mapManager.getMapData().name).toBe(names[2]);
  });

  it('tears the draft down when an entrant disconnects', () => {
    const mgr = makeManager([0, 0]);
    pairUp(mgr);
    sent.length = 0;

    mgr.handlePlayerDisconnect('A');

    const disc = sent.filter((s) => s.message.type === 'server:opponentDisconnected');
    expect(disc).toHaveLength(1);
    expect(disc[0].playerId).toBe('B');
    expect(disc[0].reliable).toBe(true);

    // Broadcast stops and no match ever forms.
    sent.length = 0;
    mgr.tick(0.05, 1);
    expect(sent.some((s) => s.message.type === 'server:draftState')).toBe(false);
    expect(mgr.getActiveMatches()).toHaveLength(0);

    // The remaining player is back in the lobby and can re-queue.
    mgr.handleJoinMatchmaking('B', 'B');
    expect(
      sent.some(
        (s) =>
          s.playerId === 'B' &&
          s.message.type === 'server:matchmakingStatus' &&
          s.message.status === 'queued',
      ),
    ).toBe(true);
  });

  it('treats returnToLobby from a drafting player as a draft teardown', () => {
    const mgr = makeManager([0, 0]);
    pairUp(mgr);
    sent.length = 0;

    mgr.handleReturnToLobby('B');

    const disc = sent.filter((s) => s.message.type === 'server:opponentDisconnected');
    expect(disc.map((d) => d.playerId)).toEqual(['A']);
    mgr.tick(0.05, 1);
    expect(sent.some((s) => s.message.type === 'server:draftState')).toBe(false);

    // BOTH entrants were released — re-pairing starts a brand-new draft.
    mgr.handleJoinMatchmaking('A', 'A');
    mgr.handleJoinMatchmaking('B', 'B');
    sent.length = 0;
    mgr.tick(0.05, 2);
    expect(sent.some((s) => s.message.type === 'server:draftState')).toBe(true);
  });

  it('releases every entrant when a player leaves character select', () => {
    const mgr = makeManager([0, 0]);
    pairUp(mgr);
    walkDraft(mgr, sent);
    expect(mgr.getActiveMatches()).toHaveLength(1);
    expect(mgr.getActiveMatches()[0].phase).toBe(MatchPhase.CHARACTER_SELECT);
    sent.length = 0;

    mgr.handleReturnToLobby('A');

    expect(mgr.getActiveMatches()).toHaveLength(0);
    expect(
      sent.filter((entry) => entry.message.type === 'server:opponentDisconnected'),
    ).toMatchObject([{ playerId: 'B', reliable: true }]);

    // Neither side remains mapped to the abandoned match: both can queue
    // again immediately and receive a fresh draft instead of being ignored.
    mgr.handleJoinMatchmaking('A', 'A');
    mgr.handleJoinMatchmaking('B', 'B');
    sent.length = 0;
    mgr.tick(0.05, 2);
    expect(sent.some((entry) => entry.message.type === 'server:draftState')).toBe(true);
  });

  it('ends an active duel as a forfeit without sending results to the leaver', () => {
    const mgr = makeManager([0, 0]);
    pairUp(mgr);
    walkDraft(mgr, sent);
    const match = mgr.getActiveMatches()[0];
    mgr.handleCharacterLock('A', 'mighty_man');
    mgr.handleCharacterLock('B', 'bruce');
    mgr.tick(0.05, 1);
    mgr.tick(MATCH.COUNTDOWN_DURATION + 0.05, 2);
    expect(match.phase).toBe(MatchPhase.ACTIVE);
    sent.length = 0;

    mgr.handleReturnToLobby('A');

    expect(match.getConnectedPlayerIds()).toEqual(['B']);
    expect(
      sent.filter((entry) => entry.message.type === 'server:opponentDisconnected'),
    ).toMatchObject([{ playerId: 'B', reliable: true }]);

    mgr.tick(0.05, 3);
    const endings = sent.filter((entry) => entry.message.type === 'server:matchEnd');
    expect(endings.map((entry) => entry.playerId)).toEqual(['B']);
    expect(
      endings[0]?.message.type === 'server:matchEnd' ? endings[0].message.result.winnerId : null,
    ).toBe('B');

    sent.length = 0;
    mgr.handleJoinMatchmaking('A', 'Alpha');
    expect(
      sent.some(
        (entry) =>
          entry.playerId === 'A' &&
          entry.message.type === 'server:matchmakingStatus' &&
          entry.message.status === 'queued',
      ),
    ).toBe(true);
  });

  it('tears character select down when a player loses connection', () => {
    const mgr = makeManager([0, 0]);
    pairUp(mgr);
    walkDraft(mgr, sent);
    sent.length = 0;

    mgr.handlePlayerDisconnect('A');

    expect(mgr.getActiveMatches()).toHaveLength(0);
    expect(
      sent.filter((entry) => entry.message.type === 'server:opponentDisconnected'),
    ).toMatchObject([{ playerId: 'B', reliable: true }]);
  });

  it('ignores joinMatchmaking from a player already in a draft', () => {
    const mgr = makeManager([0, 0]);
    pairUp(mgr);
    sent.length = 0;

    mgr.handleJoinMatchmaking('A', 'A');

    expect(mgr.getQueueLength()).toBe(0);
    expect(
      sent.some((s) => s.playerId === 'A' && s.message.type === 'server:matchmakingStatus'),
    ).toBe(false);
  });
});

describe('MatchmakingManager persistent stats integration', () => {
  let dataDir: string;
  let store: PersistentStatsStore | null;

  beforeEach(() => {
    dataDir = mkdtempSync(path.join(os.tmpdir(), 'mmr-mm-stats-'));
    store = null;
  });

  afterEach(async () => {
    // Drain queued writes before deleting the dir so the background write
    // doesn't race rmSync.
    await store?.flush();
    vi.unstubAllEnvs();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('records the match into the store and ships the rivalry in matchEnd', () => {
    const { fake, sent } = makeFakeServer();
    store = new PersistentStatsStore(dataDir);
    const mgr = new MatchmakingManager(fake, () => 0, store);

    mgr.handleJoinMatchmaking('A', 'Ryan');
    mgr.handleJoinMatchmaking('B', 'Dave');
    walkDraft(mgr, sent);
    const match = mgr.getActiveMatches()[0];
    const initialFound = sent.find(
      (entry) => entry.playerId === 'A' && entry.message.type === 'server:matchFound',
    );
    if (!initialFound || initialFound.message.type !== 'server:matchFound') {
      throw new Error('missing initial matchFound');
    }
    expect(initialFound.message.characterWins).toEqual(createEmptyCharacterWins());
    // Give Ryan a decisive scoreboard so the winner is unambiguous.
    match.players.get('A')!.characterId = 'jack';
    match.players.get('B')!.characterId = 'bubba';
    match.players.get('A')!.score = 3;
    match.phase = MatchPhase.ENDED;
    mgr.tick(0.05, 1);

    // Lifetime store took the match...
    expect(store.getLifetime('Ryan')!.wins).toBe(1);
    expect(store.getLifetime('Dave')!.losses).toBe(1);
    expect(store.getLifetime('Ryan')!.characterWins.jack).toBe(1);
    expect(store.getLifetime('Dave')!.characterWins.bubba).toBe(0);
    const arenaName = match.getMapData().name;
    expect(store.getLifetime('Ryan')!.arenaWins[arenaName]).toBe(1);
    expect(store.getLifetime('Dave')!.arenaWins[arenaName]).toBe(0);

    // ...and both matchEnd messages carry the updated rivalry.
    const matchEndMsgs = sent.filter((s) => s.message.type === 'server:matchEnd');
    expect(matchEndMsgs).toHaveLength(2);
    for (const { message } of matchEndMsgs) {
      if (message.type !== 'server:matchEnd') throw new Error('unreachable');
      expect(message.result.rivalry).toEqual({
        nicknameA: 'Dave',
        nicknameB: 'Ryan',
        winsA: 0,
        winsB: 1,
        draws: 0,
      });
      expect(message.result.winStreaks).toEqual({
        A: { previous: 0, current: 1, previousBest: 0, best: 1 },
        B: { previous: 0, current: 0, previousBest: 0, best: 0 },
      });
      expect(message.result.arenaMastery).toEqual({
        A: { mapName: arenaName, previousWins: 0, wins: 1 },
        B: { mapName: arenaName, previousWins: 0, wins: 0 },
      });
    }

    mgr.handleRematchRequest('A');
    mgr.handleRematchRequest('B');
    walkDraft(mgr, sent);
    const rematchFound = [...sent]
      .reverse()
      .find((entry) => entry.playerId === 'A' && entry.message.type === 'server:matchFound');
    if (!rematchFound || rematchFound.message.type !== 'server:matchFound') {
      throw new Error('missing rematch matchFound');
    }
    expect(rematchFound.message.characterWins?.jack).toBe(1);
    const rematchDraft = [...sent]
      .reverse()
      .find((entry) => entry.message.type === 'server:draftState');
    if (!rematchDraft || rematchDraft.message.type !== 'server:draftState') {
      throw new Error('missing rematch draft mastery');
    }
    expect(rematchDraft.message.players.find((player) => player.id === 'A')?.arenaWins).toEqual({
      ...createEmptyArenaWins(),
      [arenaName]: 1,
    });
  });

  it('rebroadcasts the refreshed leaderboard to every connection after stats are recorded', () => {
    const { fake, sent, connected } = makeFakeServer();
    store = new PersistentStatsStore(dataDir);
    const mgr = new MatchmakingManager(fake, () => 0, store);

    // A third, idle connection (lobby) must get the refresh too.
    connected.push('A', 'B', 'C');

    mgr.handleJoinMatchmaking('A', 'Ryan');
    mgr.handleJoinMatchmaking('B', 'Dave');
    walkDraft(mgr, sent);
    const match = mgr.getActiveMatches()[0];
    match.players.get('A')!.score = 3;
    match.phase = MatchPhase.ENDED;
    mgr.tick(0.05, 1);

    const leaderboardMsgs = sent.filter((s) => s.message.type === 'server:leaderboard');
    expect(leaderboardMsgs.map((s) => s.playerId)).toEqual(['A', 'B', 'C']);
    for (const { message, reliable } of leaderboardMsgs) {
      if (message.type !== 'server:leaderboard') throw new Error('unreachable');
      expect(reliable).toBe(true);
      // Ryan won, so he leads Dave; the just-recorded match is included.
      expect(message.entries.map((e) => e.nickname)).toEqual(['Ryan', 'Dave']);
      expect(message.entries[0].wins).toBe(1);
    }
  });

  it('persists completed contracts and returns the updated career total', () => {
    vi.stubEnv('FORCE_CONTRACT', 'hot_shot');
    const { fake, sent } = makeFakeServer();
    store = new PersistentStatsStore(dataDir);
    const mgr = new MatchmakingManager(fake, () => 0, store);

    mgr.handleJoinMatchmaking('A', 'Ryan');
    mgr.handleJoinMatchmaking('B', 'Dave');
    walkDraft(mgr, sent);
    const match = mgr.getActiveMatches()[0];
    for (let i = 0; i < 8; i++) match.stats.recordHit('A');
    match.players.get('A')!.score = 3;
    match.phase = MatchPhase.ENDED;
    mgr.tick(0.05, 1);

    expect(store.getLifetime('Ryan')!.contractsCompleted).toBe(1);
    expect(store.getLifetime('Dave')!.contractsCompleted).toBe(0);
    const end = sent.find((entry) => entry.message.type === 'server:matchEnd');
    if (!end || end.message.type !== 'server:matchEnd') {
      throw new Error('missing matchEnd');
    }
    expect(end.message.result.contract).toMatchObject({
      id: 'hot_shot',
      careerCompletions: { A: 1, B: 0 },
      players: [
        { playerId: 'A', progress: 8, completed: true },
        { playerId: 'B', progress: 0, completed: false },
      ],
    });
  });

  it('sends no leaderboard when no store is configured', () => {
    const { fake, sent, connected } = makeFakeServer();
    const mgr = new MatchmakingManager(fake);
    connected.push('A', 'B');

    mgr.handleJoinMatchmaking('A', 'Ryan');
    mgr.handleJoinMatchmaking('B', 'Dave');
    walkDraft(mgr, sent);
    mgr.getActiveMatches()[0].phase = MatchPhase.ENDED;
    mgr.tick(0.05, 1);

    expect(sent.some((s) => s.message.type === 'server:leaderboard')).toBe(false);
  });

  it('ships rivalry: null when no store is configured', () => {
    const { fake, sent } = makeFakeServer();
    const mgr = new MatchmakingManager(fake);

    mgr.handleJoinMatchmaking('A', 'Ryan');
    mgr.handleJoinMatchmaking('B', 'Dave');
    walkDraft(mgr, sent);
    mgr.getActiveMatches()[0].phase = MatchPhase.ENDED;
    mgr.tick(0.05, 1);

    const matchEnd = sent.find((s) => s.message.type === 'server:matchEnd');
    if (!matchEnd || matchEnd.message.type !== 'server:matchEnd') {
      throw new Error('missing matchEnd');
    }
    expect(matchEnd.message.result.rivalry).toBeNull();
  });
});

describe('MatchmakingManager solo practice flow', () => {
  let dataDir: string;
  let store: PersistentStatsStore;

  beforeEach(() => {
    dataDir = mkdtempSync(path.join(os.tmpdir(), 'mmr-practice-stats-'));
    store = new PersistentStatsStore(dataDir);
  });

  afterEach(async () => {
    await store.flush();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('dissolves an active Practice match when the human leaves', () => {
    const { fake, sent } = makeFakeServer();
    const mgr = new MatchmakingManager(fake, () => 0, store, seededRng([0, 0, 0]));
    mgr.handleStartPractice('A', 'Alpha');
    const match = mgr.getActiveMatches()[0];
    match.phase = MatchPhase.ACTIVE;
    sent.length = 0;

    mgr.handleReturnToLobby('A');

    expect(mgr.getActiveMatches()).toHaveLength(0);
    mgr.handleStartPractice('A', 'Alpha');
    expect(mgr.getActiveMatches()).toHaveLength(1);
    expect(
      sent.some((entry) => entry.playerId === 'A' && entry.message.type === 'server:matchFound'),
    ).toBe(true);
  });

  it('starts immediately, locks Rusty, keeps stats clean, and auto-accepts a direct rematch', () => {
    const { fake, sent, connected } = makeFakeServer();
    connected.push('A');
    const mgr = new MatchmakingManager(fake, () => 0, store, seededRng([0, 0, 0]));

    mgr.handleStartPractice('A', 'Alpha');
    expect(mgr.getQueueLength()).toBe(0);
    expect(mgr.getActiveMatches()).toHaveLength(1);
    const first = mgr.getActiveMatches()[0];
    const bot = [...first.players.values()].find((player) => player.id.startsWith('bot:'))!;
    expect(bot.nickname).toBe('RUSTY');
    expect(first.selectionState.get(bot.id)?.locked).not.toBeNull();

    const found = sent.find(
      (entry) => entry.playerId === 'A' && entry.message.type === 'server:matchFound',
    );
    if (!found || found.message.type !== 'server:matchFound') {
      throw new Error('missing practice matchFound');
    }
    expect(found.message.opponents).toEqual([{ id: bot.id, nickname: 'RUSTY' }]);

    const previousMutators: MutatorId[] = ['second_wind', 'blackout'];
    (first.activeMutators as MutatorId[]).push(...previousMutators);
    first.players.get('A')!.score = 3;
    first.phase = MatchPhase.ENDED;
    mgr.tick(0.05, 1);
    const ended = [...sent]
      .reverse()
      .find((entry) => entry.playerId === 'A' && entry.message.type === 'server:matchEnd');
    if (!ended || ended.message.type !== 'server:matchEnd') {
      throw new Error('missing practice matchEnd');
    }
    expect(ended.message.result.isPractice).toBe(true);
    expect(ended.message.result.rivalry).toBeNull();
    expect(ended.message.result.winStreaks).toBeUndefined();
    expect(ended.message.result.arenaMastery).toBeUndefined();
    expect(ended.message.result.rivalrySet?.players[0].wins).toBe(1);
    expect(store.getLifetime('Alpha')).toBeNull();
    expect(store.getLifetime('Rusty')).toBeNull();
    expect(sent.some((entry) => entry.message.type === 'server:leaderboard')).toBe(false);

    sent.length = 0;
    mgr.handleRematchRequest('A');
    expect(mgr.getActiveMatches()).toHaveLength(1);
    const rematch = mgr.getActiveMatches()[0];
    expect(rematch.mapManager.getMapData().name).toBe('Overgrown Suburb');
    expect(rematch.gameModeType).toBe(GameModeType.KOTH);
    expect(rematch.players.has(bot.id)).toBe(true);
    expect(rematch.selectionState.get(bot.id)?.locked).not.toBeNull();
    expect(sent.some((entry) => entry.message.type === 'server:draftState')).toBe(false);
    const rematchInternals = rematch as unknown as {
      rematchMutatorExclusions: ReadonlySet<MutatorId>;
    };
    expect([...rematchInternals.rematchMutatorExclusions]).toEqual(previousMutators);
  });

  it('opens a full Scrap Pit, drives three Rusties, and preserves Rumble rematches', () => {
    const { fake, sent, connected } = makeFakeServer();
    connected.push('A');
    const mgr = new MatchmakingManager(fake, () => 0, store, seededRng([0, 0, 0, 0, 0]));

    mgr.handleStartPractice(
      'A',
      'Alpha',
      'warlord',
      'rusty_rumble',
      GameModeType.DEATHMATCH,
      'frost_wizard',
      'blackout',
    );

    expect(mgr.getActiveMatches()).toHaveLength(1);
    const first = mgr.getActiveMatches()[0];
    const botIds = [...first.players.keys()].filter((playerId) => playerId.startsWith('bot:'));
    const botNicknames = botIds.map((playerId) => first.players.get(playerId)?.nickname);
    const botLocks = botIds.map((playerId) => first.selectionState.get(playerId)?.locked);
    expect(first.players).toHaveLength(RUMBLE.MAX_PLAYERS);
    expect(botNicknames).toEqual([...BOT.RUMBLE_NICKNAMES]);
    expect(new Set(botLocks).size).toBe(botIds.length);
    expect(botLocks).toContain('frost_wizard');
    expect(first.gameModeType).toBe(GameModeType.DEATHMATCH);

    const controllers = (
      mgr as unknown as {
        botControllers: Map<
          string,
          Array<{ playerId: PlayerId; difficulty: string; tactic: string }>
        >;
      }
    ).botControllers.get(first.matchId);
    expect(controllers?.map((controller) => controller.playerId)).toEqual(botIds);
    expect(controllers?.every((controller) => controller.difficulty === 'warlord')).toBe(true);
    expect(controllers?.map((controller) => controller.tactic)).toEqual(
      SCRAP_PIT_RIVALS.map((rival) => rival.tactic),
    );

    const opening = sent.find(
      (entry) => entry.playerId === 'A' && entry.message.type === 'server:matchFound',
    );
    if (!opening || opening.message.type !== 'server:matchFound') {
      throw new Error('missing Scrap Pit matchFound');
    }
    expect(opening.message.matchKind).toBe('rumble');
    expect(opening.message.practiceKind).toBe('rusty_rumble');
    expect(opening.message.opponents.map((opponent) => opponent.nickname)).toEqual([
      ...BOT.RUMBLE_NICKNAMES,
    ]);
    expect(opening.message.practiceMutatorId).toBe('blackout');

    const humanCharacter = CHARACTER_IDS.find((characterId) => !botLocks.includes(characterId));
    if (!humanCharacter) throw new Error('missing open fighter');
    first.setLock('A', humanCharacter);
    first.updateCharacterSelect(0);
    const expectedResultCharacters = Object.fromEntries(
      [...first.players].map(([playerId, player]) => [playerId, player.characterId]),
    );
    first.players.get('A')!.position = { x: 48, y: 48 };
    botIds.forEach((botId, index) => {
      first.players.get(botId)!.position = { x: (index + 2) * 48, y: 48 };
    });
    first.phase = MatchPhase.ACTIVE;
    first.matchTimer = 100;
    sent.length = 0;

    mgr.handleTaunt('A', 'come_get_some');

    const localTaunts = sent.filter(
      (entry) => entry.playerId === 'A' && entry.message.type === 'server:taunt',
    );
    expect(
      localTaunts.map((entry) =>
        entry.message.type === 'server:taunt'
          ? { playerId: entry.message.playerId, tauntId: entry.message.tauntId }
          : null,
      ),
    ).toEqual([
      { playerId: 'A', tauntId: 'come_get_some' },
      { playerId: botIds[0], tauntId: SCRAP_PIT_RIVALS[0].signatureTauntId },
    ]);
    expect(sent.filter((entry) => entry.message.type === 'server:taunt')).toHaveLength(8);
    expect(
      sent
        .filter((entry) => entry.message.type === 'server:taunt')
        .every((entry) => entry.reliable),
    ).toBe(true);

    const update = first.update.bind(first);
    const updateSpy = vi.spyOn(first, 'update').mockImplementationOnce((dt) => {
      update(dt);
      first.onKill(botIds[1], 'A', 'gun');
    });
    sent.length = 0;
    mgr.tick(0.05, 1);
    updateSpy.mockRestore();

    expect(
      sent.some(
        (entry) =>
          entry.playerId === 'A' &&
          entry.message.type === 'server:playerKilled' &&
          entry.message.entry.killerId === botIds[1],
      ),
    ).toBe(true);
    expect(
      sent.some(
        (entry) =>
          entry.playerId === 'A' &&
          entry.reliable &&
          entry.message.type === 'server:taunt' &&
          entry.message.playerId === botIds[1] &&
          entry.message.tauntId === SCRAP_PIT_RIVALS[1].signatureTauntId,
      ),
    ).toBe(true);

    first.players.get('A')!.score = 5;
    first.phase = MatchPhase.ENDED;
    mgr.tick(0.05, 2);

    const ended = [...sent]
      .reverse()
      .find((entry) => entry.playerId === 'A' && entry.message.type === 'server:matchEnd');
    if (!ended || ended.message.type !== 'server:matchEnd') {
      throw new Error('missing Scrap Pit matchEnd');
    }
    expect(ended.message.result.isPractice).toBe(true);
    expect(ended.message.result.matchKind).toBe('rumble');
    expect(ended.message.result.playerCharacters).toEqual(expectedResultCharacters);
    expect(ended.message.result.rivalrySet).toBeNull();
    expect(ended.message.result.rumbleCrown?.crown?.holderId).toBe('A');
    expect(store.getLifetime('Alpha')).toBeNull();

    sent.length = 0;
    mgr.handleRematchRequest('A');
    expect(mgr.getActiveMatches()).toHaveLength(1);
    const rematch = mgr.getActiveMatches()[0];
    expect(rematch.players).toHaveLength(RUMBLE.MAX_PLAYERS);
    expect(
      [...rematch.selectionState.values()].filter((selection) => selection.locked),
    ).toHaveLength(RUMBLE.MAX_PLAYERS - 1);
    const rematchFound = sent.find(
      (entry) => entry.playerId === 'A' && entry.message.type === 'server:matchFound',
    );
    if (!rematchFound || rematchFound.message.type !== 'server:matchFound') {
      throw new Error('missing Scrap Pit rematch');
    }
    expect(rematchFound.message.matchKind).toBe('rumble');
    expect(rematchFound.message.practiceKind).toBe('rusty_rumble');
    expect(rematchFound.message.rumbleCrown?.holderId).toBe('A');
    const rematchControllers = (
      mgr as unknown as {
        botControllers: Map<string, Array<{ tactic: string }>>;
      }
    ).botControllers.get(rematch.matchId);
    expect(rematchControllers?.map((controller) => controller.tactic)).toEqual(
      SCRAP_PIT_RIVALS.map((rival) => rival.tactic),
    );
  });

  it('honors a team-aware Crew objective and preserves its sides and mode pin on rematch', () => {
    const { fake, sent, connected } = makeFakeServer();
    connected.push('A');
    const mgr = new MatchmakingManager(fake, () => 0, store, seededRng([0, 0, 0, 0, 0]));

    mgr.handleStartPractice(
      'A',
      'Alpha',
      'warlord',
      'crew_battle',
      GameModeType.KOTH,
      undefined,
      'blackout',
    );
    expect(mgr.getActiveMatches()).toHaveLength(0);
    const queued = [...sent]
      .reverse()
      .find((entry) => entry.playerId === 'A' && entry.message.type === 'server:matchmakingStatus');
    expect(queued?.message).toMatchObject({
      type: 'server:matchmakingStatus',
      status: 'queued',
      matchKind: 'duos',
      groupSize: 1,
      maxGroupSize: 2,
      launchInMs: CREW_BATTLE.ALLY_WAIT_SECONDS * 1000,
    });
    mgr.tick(CREW_BATTLE.ALLY_WAIT_SECONDS, 0);

    const first = mgr.getActiveMatches()[0];
    expect(first.gameModeType).toBe(GameModeType.KOTH);
    expect(first.players).toHaveLength(4);
    const teams = first.getTeamAssignments();
    expect([...teams.values()].filter((teamId) => teamId === 'blue')).toHaveLength(2);
    expect([...teams.values()].filter((teamId) => teamId === 'red')).toHaveLength(2);
    const allyId = [...teams].find(
      ([playerId, teamId]) => playerId !== 'A' && teamId === 'blue',
    )?.[0];
    expect(allyId?.startsWith('bot:')).toBe(true);

    const found = sent.find(
      (entry) => entry.playerId === 'A' && entry.message.type === 'server:matchFound',
    );
    if (!found || found.message.type !== 'server:matchFound') {
      throw new Error('missing Crew Battle matchFound');
    }
    expect(found.message).toMatchObject({
      matchKind: 'duos',
      practiceKind: 'crew_battle',
      gameMode: GameModeType.KOTH,
    });
    expect(found.message.playerTeams).toEqual(Object.fromEntries(teams));

    first.players.get('A')!.score = 30;
    first.players.get(allyId!)!.score = 30;
    first.phase = MatchPhase.ENDED;
    mgr.tick(0.05, 1);
    const ended = [...sent]
      .reverse()
      .find((entry) => entry.playerId === 'A' && entry.message.type === 'server:matchEnd');
    if (!ended || ended.message.type !== 'server:matchEnd') {
      throw new Error('missing Crew Battle matchEnd');
    }
    expect(ended.message.result).toMatchObject({
      matchKind: 'duos',
      winnerId: null,
      winnerTeamId: 'blue',
      teamScores: { blue: 60, red: 0 },
      isPractice: true,
      rivalrySet: null,
    });

    sent.length = 0;
    mgr.handleRematchRequest('A');
    const rematch = mgr.getActiveMatches()[0];
    expect(rematch.gameModeType).toBe(GameModeType.KOTH);
    expect(Object.fromEntries(rematch.getTeamAssignments())).toEqual(Object.fromEntries(teams));
    const rematchFound = sent.find(
      (entry) => entry.playerId === 'A' && entry.message.type === 'server:matchFound',
    );
    expect(
      rematchFound?.message.type === 'server:matchFound' ? rematchFound.message.practiceKind : null,
    ).toBe('crew_battle');
  });

  it('launches two real friends as the blue crew under the captain settings', () => {
    const { fake, sent, connected } = makeFakeServer();
    connected.push('A', 'B');
    const mgr = new MatchmakingManager(fake, () => 0, store, seededRng([0, 0, 0, 0, 0]));

    mgr.handleStartPractice(
      'A',
      'Alpha',
      'warlord',
      'crew_battle',
      GameModeType.KOTH,
      undefined,
      'blackout',
    );
    mgr.tick(2, 0);
    mgr.handleStartPractice('B', 'Bravo', 'rookie', 'crew_battle', GameModeType.DEATHMATCH);
    mgr.tick(0, 1);

    const match = mgr.getActiveMatches()[0];
    expect(match.players).toHaveLength(4);
    expect(match.gameModeType).toBe(GameModeType.KOTH);
    expect(Object.fromEntries(match.getTeamAssignments())).toMatchObject({
      A: 'blue',
      B: 'blue',
    });
    const bots = [...match.players.keys()].filter((playerId) => playerId.startsWith('bot:'));
    expect(bots).toHaveLength(2);
    expect(bots.every((playerId) => match.getTeamId(playerId) === 'red')).toBe(true);
    const foundByPlayer = new Map(
      sent
        .filter((entry) => entry.message.type === 'server:matchFound')
        .map((entry) => [entry.playerId, entry.message]),
    );
    expect(foundByPlayer.get('A')).toMatchObject({
      matchKind: 'duos',
      practiceKind: 'crew_battle',
      gameMode: GameModeType.KOTH,
    });
    expect(foundByPlayer.get('B')).toMatchObject({
      matchKind: 'duos',
      practiceKind: 'crew_battle',
      gameMode: GameModeType.KOTH,
    });
    const controllers = (
      mgr as unknown as {
        botControllers: Map<string, Array<{ tactic: string }>>;
      }
    ).botControllers.get(match.matchId);
    expect(controllers?.map((controller) => controller.tactic)).toEqual(
      SCRAP_PIT_RIVALS.slice(1).map((rival) => rival.tactic),
    );
    const practiceSettings = mgr as unknown as {
      practiceDifficulties: Map<string, string>;
      practiceMutatorPreferences: Map<string, MutatorId>;
    };
    expect(practiceSettings.practiceDifficulties.get(match.matchId)).toBe('warlord');
    expect(practiceSettings.practiceMutatorPreferences.get(match.matchId)).toBe('blackout');

    const originalTeams = Object.fromEntries(match.getTeamAssignments());
    match.phase = MatchPhase.ENDED;
    mgr.tick(0.05, 2);
    expect(mgr.getActiveMatches()).toHaveLength(0);
    mgr.handleRematchRequest('A');
    expect(mgr.getActiveMatches()).toHaveLength(0);
    mgr.handleRematchRequest('B');
    const rematch = mgr.getActiveMatches()[0];
    expect(Object.fromEntries(rematch.getTeamAssignments())).toEqual(originalTeams);
    expect(practiceSettings.practiceDifficulties.get(rematch.matchId)).toBe('warlord');
    expect(practiceSettings.practiceMutatorPreferences.get(rematch.matchId)).toBe('blackout');

    rematch.phase = MatchPhase.ACTIVE;
    mgr.handlePlayerDisconnect('B');
    expect(mgr.getActiveMatches()).toHaveLength(0);
    expect(
      sent.some(
        (entry) =>
          entry.playerId === 'A' &&
          entry.message.type === 'server:opponentDisconnected' &&
          entry.message.playerId === 'B',
      ),
    ).toBe(true);
  });

  it('rotates a random Crew Battle through only team-compatible objectives', () => {
    const { fake, sent, connected } = makeFakeServer();
    connected.push('A');
    const mgr = new MatchmakingManager(fake, () => 0, store, seededRng([0, 0, 0, 0, 0]));

    mgr.handleStartPractice('A', 'Alpha', 'scrapper', 'crew_battle');
    mgr.tick(CREW_BATTLE.ALLY_WAIT_SECONDS, 0);
    const first = mgr.getActiveMatches()[0];
    expect(first.gameModeType).toBe(GameModeType.DEATHMATCH);
    const teams = first.getTeamAssignments();
    const allyId = [...teams].find(
      ([playerId, teamId]) => playerId !== 'A' && teamId === 'blue',
    )?.[0];
    first.players.get('A')!.score = 8;
    first.players.get(allyId!)!.score = 7;
    first.phase = MatchPhase.ENDED;
    mgr.tick(0.05, 1);

    const ended = [...sent]
      .reverse()
      .find((entry) => entry.playerId === 'A' && entry.message.type === 'server:matchEnd');
    expect(
      ended?.message.type === 'server:matchEnd' ? ended.message.result.nextGameMode : null,
    ).toBe(GameModeType.KOTH);

    mgr.handleRematchRequest('A');
    const rematch = mgr.getActiveMatches()[0];
    expect(rematch.gameModeType).toBe(GameModeType.KOTH);
    expect(Object.fromEntries(rematch.getTeamAssignments())).toEqual(Object.fromEntries(teams));
  });

  it('tears down every Scrap Pit bot when its solo player disconnects', () => {
    const { fake } = makeFakeServer();
    const mgr = new MatchmakingManager(fake, () => 0, store, seededRng([0, 0, 0, 0, 0]));
    mgr.handleStartPractice('A', 'Alpha', 'scrapper', 'rusty_rumble');
    const match = mgr.getActiveMatches()[0];
    const botIds = [...match.players.keys()].filter((playerId) => playerId.startsWith('bot:'));
    match.phase = MatchPhase.ACTIVE;

    mgr.handlePlayerDisconnect('A');

    expect(mgr.getActiveMatches()).toHaveLength(0);
    const internals = mgr as unknown as {
      botControllers: Map<string, unknown[]>;
      botPlayerIds: Set<PlayerId>;
      playerMatchMap: Map<PlayerId, string>;
    };
    expect(internals.botControllers.size).toBe(0);
    expect(internals.botPlayerIds.size).toBe(0);
    expect(botIds.every((botId) => !internals.playerMatchMap.has(botId))).toBe(true);
  });

  it('pins a validated Spar mode through the result promise and direct rematch', () => {
    const { fake, sent } = makeFakeServer();
    const mgr = new MatchmakingManager(fake, () => 0, store, seededRng([0, 0, 0]));

    mgr.handleStartPractice('A', 'Alpha', 'scrapper', 'sparring', GameModeType.CORE_RUN);
    const first = mgr.getActiveMatches()[0];
    expect(first.gameModeType).toBe(GameModeType.CORE_RUN);

    first.phase = MatchPhase.ENDED;
    mgr.tick(0.05, 1);
    const ended = [...sent]
      .reverse()
      .find((entry) => entry.playerId === 'A' && entry.message.type === 'server:matchEnd');
    if (!ended || ended.message.type !== 'server:matchEnd') {
      throw new Error('missing pinned practice matchEnd');
    }
    expect(ended.message.result.nextGameMode).toBe(GameModeType.CORE_RUN);

    mgr.handleRematchRequest('A');
    expect(mgr.getActiveMatches()[0].gameModeType).toBe(GameModeType.CORE_RUN);
  });

  it('pins a validated Spar rival through direct rematches', () => {
    const { fake } = makeFakeServer();
    const mgr = new MatchmakingManager(fake, () => 0, store, seededRng([0, 0, 0]));

    mgr.handleStartPractice('A', 'Alpha', 'scrapper', 'sparring', undefined, 'frost_wizard');
    const first = mgr.getActiveMatches()[0];
    const firstBot = [...first.selectionState.entries()].find(([playerId]) =>
      playerId.startsWith('bot:'),
    );
    expect(firstBot?.[1].locked).toBe('frost_wizard');

    first.phase = MatchPhase.ENDED;
    mgr.tick(0.05, 1);
    mgr.handleRematchRequest('A');

    const rematch = mgr.getActiveMatches()[0];
    const rematchBot = [...rematch.selectionState.entries()].find(([playerId]) =>
      playerId.startsWith('bot:'),
    );
    expect(rematchBot?.[1].locked).toBe('frost_wizard');
  });

  it('pins compatible Spar chaos, confirms it, and carries it through direct rematches', () => {
    const { fake, sent } = makeFakeServer();
    const mgr = new MatchmakingManager(fake, () => 0, store, seededRng([0, 0, 0]));

    mgr.handleStartPractice(
      'A',
      'Alpha',
      'scrapper',
      'sparring',
      GameModeType.DEATHMATCH,
      undefined,
      'blackout',
    );
    const first = mgr.getActiveMatches()[0];
    const firstInternals = first as unknown as {
      plannedMidMatchMutator?: MutatorId;
    };
    expect(firstInternals.plannedMidMatchMutator).toBe('blackout');
    const found = sent.find(
      (entry) => entry.playerId === 'A' && entry.message.type === 'server:matchFound',
    );
    if (!found || found.message.type !== 'server:matchFound') {
      throw new Error('missing custom-chaos matchFound');
    }
    expect(found.message.practiceMutatorId).toBe('blackout');

    (first.activeMutators as MutatorId[]).push('blackout');
    first.phase = MatchPhase.ENDED;
    mgr.tick(0.05, 1);
    mgr.handleRematchRequest('A');

    const rematch = mgr.getActiveMatches()[0];
    const rematchInternals = rematch as unknown as {
      plannedMidMatchMutator?: MutatorId;
      rematchMutatorExclusions: ReadonlySet<MutatorId>;
    };
    expect(rematchInternals.plannedMidMatchMutator).toBe('blackout');
    expect(rematchInternals.rematchMutatorExclusions.has('blackout')).toBe(true);
    const rematchFound = [...sent]
      .reverse()
      .find((entry) => entry.playerId === 'A' && entry.message.type === 'server:matchFound');
    expect(
      rematchFound?.message.type === 'server:matchFound'
        ? rematchFound.message.practiceMutatorId
        : undefined,
    ).toBe('blackout');
  });

  it('keeps Random-mode custom chaos on compatible modes and rejects a conflicting pin', () => {
    const random = makeFakeServer();
    const randomMgr = new MatchmakingManager(random.fake, () => 0, store, seededRng([0, 0.3, 0]));
    randomMgr.handleStartPractice(
      'A',
      'Alpha',
      'scrapper',
      'sparring',
      undefined,
      undefined,
      'weapon_roulette',
    );
    expect(randomMgr.getActiveMatches()[0].gameModeType).toBe(GameModeType.KOTH);
    randomMgr.getActiveMatches()[0].phase = MatchPhase.ENDED;
    randomMgr.tick(0.05, 1);
    const randomEnded = [...random.sent]
      .reverse()
      .find((entry) => entry.playerId === 'A' && entry.message.type === 'server:matchEnd');
    expect(
      randomEnded?.message.type === 'server:matchEnd'
        ? randomEnded.message.result.nextGameMode
        : undefined,
    ).toBe(GameModeType.LAST_STAND);

    const pinned = makeFakeServer();
    const pinnedMgr = new MatchmakingManager(pinned.fake, () => 0, store);
    pinnedMgr.handleStartPractice(
      'B',
      'Bravo',
      'scrapper',
      'sparring',
      GameModeType.GUN_GAME,
      undefined,
      'weapon_roulette',
    );
    expect(pinnedMgr.getActiveMatches()[0].gameModeType).toBe(GameModeType.GUN_GAME);
    const found = pinned.sent.find(
      (entry) => entry.playerId === 'B' && entry.message.type === 'server:matchFound',
    );
    expect(
      found?.message.type === 'server:matchFound' ? found.message.practiceMutatorId : undefined,
    ).toBeUndefined();
  });

  it('does not promise Spar chaos already reserved by a forced final event', () => {
    process.env.FORCE_EVENT = 'blackout';
    try {
      const { fake, sent } = makeFakeServer();
      const mgr = new MatchmakingManager(fake, () => 0, store);
      mgr.handleStartPractice(
        'A',
        'Alpha',
        'scrapper',
        'sparring',
        GameModeType.DEATHMATCH,
        undefined,
        'blackout',
      );

      const match = mgr.getActiveMatches()[0] as unknown as {
        plannedMidMatchMutator?: MutatorId;
      };
      expect(match.plannedMidMatchMutator).toBeUndefined();
      const found = sent.find(
        (entry) => entry.playerId === 'A' && entry.message.type === 'server:matchFound',
      );
      expect(
        found?.message.type === 'server:matchFound' ? found.message.practiceMutatorId : undefined,
      ).toBeUndefined();
    } finally {
      delete process.env.FORCE_EVENT;
    }
  });

  it('rejects malformed Spar pins and ignores pins on Gauntlet requests', () => {
    const invalid = makeFakeServer();
    const invalidMgr = new MatchmakingManager(invalid.fake, () => 0, store, seededRng([0, 0, 0]));
    invalidMgr.handleStartPractice(
      'A',
      'Alpha',
      'scrapper',
      'sparring',
      'not-a-mode' as GameModeType,
      'not-a-fighter' as CharacterId,
      'not-chaos' as MutatorId,
    );
    const invalidMatch = invalidMgr.getActiveMatches()[0];
    expect(invalidMatch.gameModeType).toBe(GameModeType.DEATHMATCH);
    const invalidBot = [...invalidMatch.selectionState.entries()].find(([playerId]) =>
      playerId.startsWith('bot:'),
    );
    expect(invalidBot?.[1].locked).toBe('mighty_man');

    const gauntlet = makeFakeServer();
    const gauntletMgr = new MatchmakingManager(gauntlet.fake, () => 0, store, seededRng([0, 0, 0]));
    gauntletMgr.handleStartPractice(
      'B',
      'Bravo',
      'rookie',
      'gauntlet',
      GameModeType.CORE_RUN,
      'rook',
      'blackout',
    );
    const gauntletMatch = gauntletMgr.getActiveMatches()[0];
    expect(gauntletMatch.gameModeType).toBe(GameModeType.DEATHMATCH);
    const gauntletBot = [...gauntletMatch.selectionState.entries()].find(([playerId]) =>
      playerId.startsWith('bot:'),
    );
    expect(gauntletBot?.[1].locked).toBe('mighty_man');
    const gauntletFound = gauntlet.sent.find(
      (entry) => entry.playerId === 'B' && entry.message.type === 'server:matchFound',
    );
    expect(
      gauntletFound?.message.type === 'server:matchFound'
        ? gauntletFound.message.practiceMutatorId
        : undefined,
    ).toBeUndefined();
  });

  it('pins a shared UTC Daily Run opening and retries the same challenge after failure', () => {
    const { fake, sent } = makeFakeServer();
    const challengeDate = new Date('2026-07-13T23:30:00Z');
    const mgr = new MatchmakingManager(
      fake,
      () => 0,
      store,
      seededRng([0.99, 0.99, 0.99]),
      () => challengeDate,
    );

    mgr.handleStartPractice('A', 'Alpha', 'warlord', 'daily');
    const opening = sent.find(
      (entry) => entry.playerId === 'A' && entry.message.type === 'server:matchFound',
    );
    if (!opening || opening.message.type !== 'server:matchFound' || !opening.message.gauntlet) {
      throw new Error('missing Daily Run matchFound');
    }
    const openingSummary = {
      mapName: opening.message.mapName,
      gameMode: opening.message.gameMode,
      opponentCharacterId: opening.message.gauntlet.opponentCharacterId,
    };
    expect(opening.message.gauntlet).toMatchObject({
      stage: 1,
      difficulty: 'rookie',
      runScore: 0,
      challengeKey: dailyChallengeKey(challengeDate),
      dailyChase: { kind: 'set_pace' },
    });

    const first = mgr.getActiveMatches()[0];
    const botId = [...first.players.keys()].find((playerId) => playerId.startsWith('bot:'))!;
    const openingContractId = first.getContractHudState().id;
    const openingPlayerPosition = { ...first.players.get('A')!.position };
    const openingBotPosition = { ...first.players.get(botId)!.position };
    expect(first.selectionState.get(botId)?.locked).toBe(openingSummary.opponentCharacterId);

    const { fake: secondFake } = makeFakeServer();
    const secondMgr = new MatchmakingManager(
      secondFake,
      () => 0,
      store,
      seededRng([0.01, 0.01, 0.01]),
      () => challengeDate,
    );
    secondMgr.handleStartPractice('B', 'Bravo', 'scrapper', 'daily');
    const second = secondMgr.getActiveMatches()[0];
    const secondBotId = [...second.players.keys()].find((playerId) => playerId.startsWith('bot:'))!;
    expect(second.mapManager.getMapData().name).toBe(openingSummary.mapName);
    expect(second.gameModeType).toBe(openingSummary.gameMode);
    expect(second.getContractHudState().id).toBe(openingContractId);
    expect(second.players.get('B')?.position).toEqual(openingPlayerPosition);
    expect(second.players.get(secondBotId)?.position).toEqual(openingBotPosition);

    first.players.get(botId)!.score = 3;
    first.phase = MatchPhase.ENDED;
    mgr.tick(0.05, 1);

    const ended = [...sent]
      .reverse()
      .find((entry) => entry.playerId === 'A' && entry.message.type === 'server:matchEnd');
    if (!ended || ended.message.type !== 'server:matchEnd') {
      throw new Error('missing Daily Run result');
    }
    expect(ended.message.result.gauntlet).toMatchObject({
      outcome: 'failed',
      challengeKey: '2026-07-13',
      nextStage: 1,
    });
    expect(ended.message.result.nextMapName).toBe(openingSummary.mapName);
    expect(ended.message.result.nextGameMode).toBe(openingSummary.gameMode);

    sent.length = 0;
    mgr.handleRematchRequest('A');
    const retry = sent.find(
      (entry) => entry.playerId === 'A' && entry.message.type === 'server:matchFound',
    );
    if (!retry || retry.message.type !== 'server:matchFound') {
      throw new Error('missing Daily Run retry');
    }
    expect({
      mapName: retry.message.mapName,
      gameMode: retry.message.gameMode,
      opponentCharacterId: retry.message.gauntlet?.opponentCharacterId,
      challengeKey: retry.message.gauntlet?.challengeKey,
      dailyChase: retry.message.gauntlet?.dailyChase,
    }).toEqual({
      ...openingSummary,
      challengeKey: '2026-07-13',
      dailyChase: { kind: 'set_pace' },
    });
    const retryMatch = mgr.getActiveMatches()[0];
    expect(retryMatch.getContractHudState().id).toBe(openingContractId);
    expect(retryMatch.players.get('A')?.position).toEqual(openingPlayerPosition);
    expect(retryMatch.players.get(botId)?.position).toEqual(openingBotPosition);
  });

  it('records a completed Daily Run, returns its rank, and rebroadcasts standings', () => {
    process.env.FORCE_MODE = GameModeType.DEATHMATCH;
    try {
      const { fake, sent, connected } = makeFakeServer();
      connected.push('A', 'OBSERVER');
      const challengeDate = new Date('2026-07-13T18:00:00Z');
      const mgr = new MatchmakingManager(
        fake,
        () => 0,
        store,
        seededRng([0, 0, 0, 0]),
        () => challengeDate,
      );

      mgr.handleStartPractice('A', 'Alpha', 'rookie', 'daily');
      for (let stage = 1; stage <= 3; stage += 1) {
        const match = mgr.getActiveMatches()[0];
        match.players.get('A')!.score = 3;
        match.matchTimer = 60;
        match.phase = MatchPhase.ENDED;
        mgr.tick(0.05, stage);
        if (stage < 3) {
          expect(
            sent.some((entry) => entry.message.type === 'server:dailyGauntletLeaderboard'),
          ).toBe(false);
          sent.length = 0;
          mgr.handleRematchRequest('A');
          const nextStage = sent.find(
            (entry) => entry.playerId === 'A' && entry.message.type === 'server:matchFound',
          );
          if (!nextStage || nextStage.message.type !== 'server:matchFound') {
            throw new Error('missing next Daily Run stage');
          }
          expect(nextStage.message.gauntlet?.dailyChase).toEqual({
            kind: 'set_pace',
          });
        }
      }

      const cleared = [...sent]
        .reverse()
        .find((entry) => entry.playerId === 'A' && entry.message.type === 'server:matchEnd');
      if (!cleared || cleared.message.type !== 'server:matchEnd') {
        throw new Error('missing ranked Daily Run clear');
      }
      expect(cleared.message.result.gauntlet).toMatchObject({
        challengeKey: '2026-07-13',
        outcome: 'cleared',
        dailyRank: 1,
      });
      expect(cleared.message.result.gauntlet?.dailyBestScore).toBe(
        cleared.message.result.gauntlet?.runScore,
      );
      expect(store.getLifetime('Alpha')).toBeNull();
      expect(store.getDailyGauntletLeaderboard('2026-07-13', 5)).toEqual([
        {
          nickname: 'Alpha',
          score: cleared.message.result.gauntlet?.runScore,
        },
      ]);

      const updates = sent.filter(
        (entry) => entry.message.type === 'server:dailyGauntletLeaderboard',
      );
      expect(updates.map((entry) => entry.playerId)).toEqual(['A', 'OBSERVER']);
      for (const update of updates) {
        if (update.message.type !== 'server:dailyGauntletLeaderboard') continue;
        expect(update.reliable).toBe(true);
        expect(update.message.challengeKey).toBe('2026-07-13');
        expect(update.message.entries[0]).toMatchObject({ nickname: 'Alpha' });
      }

      sent.length = 0;
      mgr.handleRematchRequest('A');
      const retry = sent.find(
        (entry) => entry.playerId === 'A' && entry.message.type === 'server:matchFound',
      );
      if (!retry || retry.message.type !== 'server:matchFound') {
        throw new Error('missing ranked Daily Run retry');
      }
      expect(retry.message.gauntlet?.dailyChase).toEqual({
        kind: 'defend_lead',
        targetScore: (cleared.message.result.gauntlet?.runScore ?? 0) + 1,
      });
    } finally {
      delete process.env.FORCE_MODE;
    }
  });

  it('removes a queued player before opening practice', () => {
    const { fake } = makeFakeServer();
    const mgr = new MatchmakingManager(fake, () => 0, store, seededRng([0, 0, 0]));
    mgr.handleJoinMatchmaking('A', 'Alpha');
    expect(mgr.getQueueLength()).toBe(1);
    mgr.handleStartPractice('A', 'Alpha');
    expect(mgr.getQueueLength()).toBe(0);
    expect(mgr.getActiveMatches()).toHaveLength(1);
  });

  it('forecasts only mode-compatible chaos for a forced One in the Chamber run', () => {
    process.env.FORCE_MODE = GameModeType.ONE_IN_THE_CHAMBER;
    try {
      const { fake, sent } = makeFakeServer();
      const mgr = new MatchmakingManager(fake, () => 0, store, seededRng([0, 0, 0, 0]));
      mgr.handleStartPractice('A', 'Alpha', 'rookie', 'gauntlet');

      const first = mgr.getActiveMatches()[0];
      first.players.get('A')!.score = 8;
      first.phase = MatchPhase.ENDED;
      mgr.tick(0.05, 1);

      const ended = [...sent]
        .reverse()
        .find((entry) => entry.playerId === 'A' && entry.message.type === 'server:matchEnd');
      if (!ended || ended.message.type !== 'server:matchEnd') {
        throw new Error('missing forced-mode Gauntlet result');
      }
      const routes = ended.message.result.gauntlet?.routeOptions ?? [];
      const excluded = getGameMode(GameModeType.ONE_IN_THE_CHAMBER).excludedMutators ?? [];
      expect(routes).toHaveLength(2);
      expect(routes.every((route) => route.gameMode === GameModeType.ONE_IN_THE_CHAMBER)).toBe(
        true,
      );
      expect(routes.every((route) => route.forecastMutatorId !== undefined)).toBe(true);
      for (const route of routes) {
        expect(excluded).not.toContain(route.forecastMutatorId);
      }
    } finally {
      delete process.env.FORCE_MODE;
    }
  });

  it('banks the human combat highlights into the authoritative Gauntlet result', () => {
    const { fake, sent } = makeFakeServer();
    const mgr = new MatchmakingManager(fake, () => 0, store, seededRng([0, 0, 0, 0]));
    mgr.handleStartPractice('A', 'Alpha', 'rookie', 'gauntlet');

    const match = mgr.getActiveMatches()[0];
    const botId = [...match.players.keys()].find((playerId) => playerId.startsWith('bot:'))!;
    match.onKill('A', botId, 'gun');
    match.players.get('A')!.score = 3;
    match.phase = MatchPhase.ENDED;
    mgr.tick(0.05, 1);

    const ended = [...sent]
      .reverse()
      .find((entry) => entry.playerId === 'A' && entry.message.type === 'server:matchEnd');
    if (!ended || ended.message.type !== 'server:matchEnd') {
      throw new Error('missing styled Gauntlet result');
    }
    expect(ended.message.result.gauntlet).toMatchObject({
      outcome: 'advanced',
      stageScore: 1650,
      runScore: 1650,
      styleBonus: 50,
    });
  });

  it('runs an escalating three-stage Gauntlet and resets a failed run', () => {
    const { fake, sent, connected } = makeFakeServer();
    connected.push('A');
    const mgr = new MatchmakingManager(fake, () => 0, store, seededRng([0, 0, 0, 0]));

    // The selected sparring difficulty is deliberately ignored in Gauntlet.
    mgr.handleStartPractice('A', 'Alpha', 'warlord', 'gauntlet');
    const opening = sent.find(
      (entry) => entry.playerId === 'A' && entry.message.type === 'server:matchFound',
    );
    if (!opening || opening.message.type !== 'server:matchFound') {
      throw new Error('missing Gauntlet matchFound');
    }
    expect(opening.message.gauntlet).toEqual({
      stage: 1,
      totalStages: 3,
      difficulty: 'rookie',
      runScore: 0,
      opponentCharacterId: 'mighty_man',
    });

    const first = mgr.getActiveMatches()[0];
    const firstRival = [...first.selectionState.entries()].find(([id]) =>
      id.startsWith('bot:'),
    )?.[1].locked;
    expect(firstRival).toBe('mighty_man');
    first.players.get('A')!.score = 3;
    first.matchTimer = 100;
    first.phase = MatchPhase.ENDED;
    mgr.tick(0.05, 1);
    const firstEnd = [...sent]
      .reverse()
      .find((entry) => entry.playerId === 'A' && entry.message.type === 'server:matchEnd');
    if (!firstEnd || firstEnd.message.type !== 'server:matchEnd') {
      throw new Error('missing Gauntlet stage-one result');
    }
    expect(firstEnd.message.result.gauntlet).toMatchObject({
      stage: 1,
      difficulty: 'rookie',
      opponentCharacterId: 'mighty_man',
      outcome: 'advanced',
      stageScore: 1800,
      runScore: 1800,
      chaosBountyBonus: 0,
      flawlessBonus: 400,
      paceBonus: 200,
      nextStage: 2,
      nextDifficulty: 'scrapper',
      routeOptions: [
        {
          id: 'route_a',
          mapName: 'Overgrown Suburb',
          gameMode: GameModeType.KOTH,
          opponentCharacterId: 'bruce',
        },
        {
          id: 'route_b',
          mapName: 'Scrapyard',
          gameMode: GameModeType.GUN_GAME,
          opponentCharacterId: 'frost_wizard',
        },
      ],
    });
    const firstRoutes = firstEnd.message.result.gauntlet?.routeOptions ?? [];
    expect(firstRoutes).toHaveLength(2);
    expect(firstRoutes.every((route) => route.forecastMutatorId !== undefined)).toBe(true);
    expect(new Set(firstRoutes.map((route) => route.forecastMutatorId)).size).toBe(2);
    expect(firstRoutes.every((route) => route.boonId !== undefined)).toBe(true);
    expect(new Set(firstRoutes.map((route) => route.boonId)).size).toBe(2);
    const secondForecast = firstRoutes[1].forecastMutatorId!;
    const secondBoon = firstRoutes[1].boonId!;
    const secondBounty = practiceGauntletChaosBounty(secondForecast);
    expect(firstEnd.message.result.rivalrySet).toBeNull();
    expect(store.getLifetime('Alpha')).toBeNull();

    sent.length = 0;
    mgr.handleRematchRequest('A', 'route_b');
    const secondFound = sent.find(
      (entry) => entry.playerId === 'A' && entry.message.type === 'server:matchFound',
    );
    if (!secondFound || secondFound.message.type !== 'server:matchFound') {
      throw new Error('missing Gauntlet stage-two matchFound');
    }
    expect(secondFound.message.gauntlet).toEqual({
      stage: 2,
      totalStages: 3,
      difficulty: 'scrapper',
      runScore: 1800,
      opponentCharacterId: 'frost_wizard',
      forecastMutatorId: secondForecast,
      boonIds: [secondBoon],
    });
    expect(secondFound.message.mapName).toBe('Scrapyard');
    expect(secondFound.message.gameMode).toBe(GameModeType.GUN_GAME);

    const second = mgr.getActiveMatches()[0];
    const secondRival = [...second.selectionState.entries()].find(([id]) =>
      id.startsWith('bot:'),
    )?.[1].locked;
    expect(secondRival).toBe('frost_wizard');
    second.players.get('A')!.score = 3;
    second.stats.recordDeath('A');
    second.matchTimer = 47.9;
    second.phase = MatchPhase.ENDED;
    mgr.tick(0.05, 2);
    const secondEnd = [...sent]
      .reverse()
      .find((entry) => entry.playerId === 'A' && entry.message.type === 'server:matchEnd');
    if (!secondEnd || secondEnd.message.type !== 'server:matchEnd') {
      throw new Error('missing Gauntlet stage-two result');
    }
    expect(secondEnd.message.result.gauntlet).toMatchObject({
      stage: 2,
      difficulty: 'scrapper',
      opponentCharacterId: 'frost_wizard',
      forecastMutatorId: secondForecast,
      outcome: 'advanced',
      stageScore: 1294 + secondBounty,
      runScore: 3094 + secondBounty,
      chaosBountyBonus: secondBounty,
      flawlessBonus: 0,
      paceBonus: 94,
      nextStage: 3,
      nextDifficulty: 'warlord',
      routeOptions: [
        {
          id: 'route_a',
          mapName: 'Collapsed Overpass',
          gameMode: GameModeType.LAST_STAND,
          opponentCharacterId: 'bubba',
        },
        {
          id: 'route_b',
          mapName: 'Checkpoint Zero',
          gameMode: GameModeType.KILL_CONFIRMED,
          opponentCharacterId: 'jack',
        },
      ],
    });
    const secondRoutes = secondEnd.message.result.gauntlet?.routeOptions ?? [];
    expect(secondRoutes).toHaveLength(2);
    expect(secondRoutes.every((route) => route.forecastMutatorId !== undefined)).toBe(true);
    expect(new Set(secondRoutes.map((route) => route.forecastMutatorId)).size).toBe(2);
    expect(secondRoutes.map((route) => route.forecastMutatorId)).not.toContain(secondForecast);
    expect(secondRoutes.every((route) => route.boonId !== undefined)).toBe(true);
    expect(new Set(secondRoutes.map((route) => route.boonId)).size).toBe(2);
    expect(secondRoutes.map((route) => route.boonId)).not.toContain(secondBoon);
    const thirdForecast = secondRoutes[0].forecastMutatorId!;
    const thirdBoon = secondRoutes[0].boonId!;
    const thirdBounty = practiceGauntletChaosBounty(thirdForecast);

    sent.length = 0;
    mgr.handleRematchRequest(
      'A',
      'not-a-server-route' as Parameters<MatchmakingManager['handleRematchRequest']>[1],
    );
    const thirdFound = sent.find(
      (entry) => entry.playerId === 'A' && entry.message.type === 'server:matchFound',
    );
    if (!thirdFound || thirdFound.message.type !== 'server:matchFound') {
      throw new Error('missing Gauntlet stage-three matchFound');
    }
    expect(thirdFound.message.gauntlet).toEqual({
      stage: 3,
      totalStages: 3,
      difficulty: 'warlord',
      runScore: 3094 + secondBounty,
      opponentCharacterId: 'bubba',
      forecastMutatorId: thirdForecast,
      boonIds: [secondBoon, thirdBoon],
    });
    expect(thirdFound.message.mapName).toBe('Collapsed Overpass');
    expect(thirdFound.message.gameMode).toBe(GameModeType.LAST_STAND);

    const third = mgr.getActiveMatches()[0];
    const thirdRival = [...third.selectionState.entries()].find(([id]) =>
      id.startsWith('bot:'),
    )?.[1].locked;
    expect(thirdRival).toBe('bubba');
    expect(new Set([firstRival, secondRival, thirdRival]).size).toBe(3);
    third.players.get('A')!.score = 3;
    third.matchTimer = 0;
    third.phase = MatchPhase.ENDED;
    mgr.tick(0.05, 3);
    const cleared = [...sent]
      .reverse()
      .find((entry) => entry.playerId === 'A' && entry.message.type === 'server:matchEnd');
    if (!cleared || cleared.message.type !== 'server:matchEnd') {
      throw new Error('missing Gauntlet clear result');
    }
    expect(cleared.message.result.gauntlet).toMatchObject({
      stage: 3,
      difficulty: 'warlord',
      opponentCharacterId: 'bubba',
      forecastMutatorId: thirdForecast,
      boonIds: [secondBoon, thirdBoon],
      outcome: 'cleared',
      stageScore: 1600 + thirdBounty,
      runScore: 4694 + secondBounty + thirdBounty,
      chaosBountyBonus: thirdBounty,
      flawlessBonus: 400,
      paceBonus: 0,
      nextStage: 1,
      nextDifficulty: 'rookie',
    });
    expect(cleared.message.result.gauntlet?.routeOptions).toBeUndefined();

    sent.length = 0;
    mgr.handleRematchRequest('A');
    const retry = sent.find(
      (entry) => entry.playerId === 'A' && entry.message.type === 'server:matchFound',
    );
    if (!retry || retry.message.type !== 'server:matchFound') {
      throw new Error('missing post-clear Gauntlet retry');
    }
    expect(retry.message.gauntlet).toEqual({
      stage: 1,
      totalStages: 3,
      difficulty: 'rookie',
      runScore: 0,
      opponentCharacterId: 'mighty_man',
    });

    const retryMatch = mgr.getActiveMatches()[0];
    const bot = [...retryMatch.players.values()].find((player) => player.id.startsWith('bot:'))!;
    bot.score = 3;
    retryMatch.phase = MatchPhase.ENDED;
    mgr.tick(0.05, 4);
    const failed = [...sent]
      .reverse()
      .find((entry) => entry.playerId === 'A' && entry.message.type === 'server:matchEnd');
    if (!failed || failed.message.type !== 'server:matchEnd') {
      throw new Error('missing Gauntlet failure result');
    }
    expect(failed.message.result.gauntlet).toMatchObject({
      stage: 1,
      difficulty: 'rookie',
      opponentCharacterId: 'mighty_man',
      outcome: 'failed',
      stageScore: 0,
      runScore: 0,
      chaosBountyBonus: 0,
      nextStage: 1,
      nextDifficulty: 'rookie',
    });
    expect(failed.message.result.gauntlet?.routeOptions).toBeUndefined();
  });
});

describe('match clock alignment (regression: 3-second event/timer offset)', () => {
  it('matchEndsInMs equals the wall-clock time between matchStart broadcast and eventStart broadcast', () => {
    process.env.FORCE_EVENT = 'infinite_ammo';
    try {
      const { fake, sent } = makeFakeServer();
      const mgr = new MatchmakingManager(fake);
      const dt = 0.05;

      mgr.handleJoinMatchmaking('A', 'A');
      mgr.handleJoinMatchmaking('B', 'B');
      walkDraft(mgr, sent);
      expect(mgr.getActiveMatches()).toHaveLength(1);

      // Skip CHARACTER_SELECT — both players lock immediately so the
      // match transitions to COUNTDOWN on the next tick.
      mgr.handleCharacterLock('A', 'mighty_man');
      mgr.handleCharacterLock('B', 'bruce');

      let matchStartTick = -1;
      let matchEndsInMsValue = 0;
      let eventStartTick = -1;
      const totalTicks = Math.ceil(
        (MATCH.COUNTDOWN_DURATION + MATCH.TIME_LIMIT - MUTATORS.ACTIVATION_AT_REMAINING + 1) / dt,
      );

      for (let i = 1; i <= totalTicks; i++) {
        mgr.tick(dt, i);
        for (const s of sent) {
          if (s.message.type === 'server:matchStart' && matchStartTick === -1) {
            matchStartTick = i;
            matchEndsInMsValue = s.message.matchEndsInMs;
          }
          // Only the FINAL-MINUTE start is clock-aligned; the mid-match
          // mutator fires earlier at a random time and must be ignored.
          if (
            s.message.type === 'server:eventStart' &&
            s.message.isFinalMinute &&
            eventStartTick === -1
          ) {
            eventStartTick = i;
          }
        }
        sent.length = 0;
      }

      expect(matchStartTick).toBeGreaterThan(0);
      expect(eventStartTick).toBeGreaterThan(0);

      // Wall-clock ms between matchStart and eventStart on the server.
      const elapsedMs = (eventStartTick - matchStartTick) * dt * 1000;

      // The client computes display = matchEndsInMs - elapsedMs. For the
      // displayed timer to read ~ACTIVATION_AT_REMAINING when eventStart
      // fires, matchEndsInMs - elapsedMs must equal ACTIVATION_AT_REMAINING * 1000.
      const displayAtEventMs = matchEndsInMsValue - elapsedMs;
      const displayAtEvent = displayAtEventMs / 1000;

      // Allow a 1-tick (50ms) tolerance for tick discretization.
      expect(displayAtEvent).toBeGreaterThan(MUTATORS.ACTIVATION_AT_REMAINING - 0.06);
      expect(displayAtEvent).toBeLessThan(MUTATORS.ACTIVATION_AT_REMAINING + 0.06);
    } finally {
      delete process.env.FORCE_EVENT;
    }
  });

  it('every active-phase gameState carries the authoritative matchTimer for client re-anchoring', () => {
    const { fake, sent } = makeFakeServer();
    const mgr = new MatchmakingManager(fake);
    const dt = 0.05;

    mgr.handleJoinMatchmaking('A', 'A');
    mgr.handleJoinMatchmaking('B', 'B');
    walkDraft(mgr, sent);

    // Skip CHARACTER_SELECT — both players lock immediately.
    mgr.handleCharacterLock('A', 'mighty_man');
    mgr.handleCharacterLock('B', 'bruce');

    // Run through the countdown plus a handful of active ticks.
    const totalTicks = Math.ceil(MATCH.COUNTDOWN_DURATION / dt) + 20;
    for (let i = 1; i <= totalTicks; i++) {
      mgr.tick(dt, i);
    }

    const activeStateMessages = sent.filter(
      (s) => s.message.type === 'server:gameState' && s.message.phase === MatchPhase.ACTIVE,
    );
    expect(activeStateMessages.length).toBeGreaterThan(0);

    // Each active snapshot must carry a sane matchTimer (descending toward 0,
    // never larger than TIME_LIMIT). The first one should be very close to
    // TIME_LIMIT; the last one should be smaller; all should be <= TIME_LIMIT.
    let prev = Number.POSITIVE_INFINITY;
    for (const m of activeStateMessages) {
      if (m.message.type !== 'server:gameState') throw new Error('unreachable');
      expect(m.message.matchTimer).toBeLessThanOrEqual(MATCH.TIME_LIMIT);
      expect(m.message.matchTimer).toBeLessThanOrEqual(prev + 1e-6);
      expect(m.message.matchTimer).toBeGreaterThanOrEqual(0);
      prev = m.message.matchTimer;
    }
  });
});
