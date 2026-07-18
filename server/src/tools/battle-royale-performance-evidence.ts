import { performance } from 'node:perf_hooks';

import {
  BATTLE_ROYALE_QUEUE,
  CHARACTER_IDS,
  DISABLED_SERVER_CAPABILITIES,
  MatchPhase,
  SERVER,
  WEAPONS,
  createWeaponInstance,
  type PlayerId,
  type PlayerInput,
  type ServerCapabilities,
  type ServerGameStateMessage,
  type ServerMessage,
  type WeaponInstance,
} from '@shared/game';

import { GameLoop } from '../game/game-loop.js';
import type { Match } from '../game/match.js';
import { MatchmakingManager } from '../matchmaking/matchmaking-manager.js';
import type { GameServer } from '../network/server.js';
import {
  BATTLE_ROYALE_PERFORMANCE_BUDGETS,
  assertBattleRoyalePerformanceBudget,
  performanceDistribution,
  roundPerformance,
  snapshotTraffic,
} from '../performance/battle-royale-performance.js';

const FIXED_DT_SECONDS = SERVER.TICK_INTERVAL / 1_000;
const WARMUP_TICKS = 300;
const SAMPLE_TICKS = 3_000;
const LIVE_SAMPLE_MS = 2_250;

class EvidenceServer {
  readonly capabilities: Readonly<ServerCapabilities> = Object.freeze({
    ...DISABLED_SERVER_CAPABILITIES,
    largeWorlds: true,
    battleRoyale: true,
  });
  readonly connected = new Set<PlayerId>();
  latestSnapshot: ServerGameStateMessage | null = null;
  snapshotEncodes = 0;
  snapshotDeliveries = 0;
  snapshotBytesDelivered = 0;

  sendTo(_playerId: PlayerId, _message: ServerMessage): void {}

  sendToMany(playerIds: Iterable<PlayerId>, message: ServerMessage): void {
    if (message.type !== 'server:gameState') return;
    const payload = JSON.stringify(message);
    this.snapshotEncodes += 1;
    this.latestSnapshot = message;
    for (const playerId of playerIds) {
      if (!this.connected.has(playerId)) continue;
      this.snapshotDeliveries += 1;
      this.snapshotBytesDelivered += Buffer.byteLength(payload, 'utf8');
    }
  }

  getConnectedPlayerIds(): PlayerId[] {
    return [...this.connected];
  }

  getCapabilities(): Readonly<ServerCapabilities> {
    return this.capabilities;
  }

  get playerCount(): number {
    return this.connected.size;
  }
}

interface Fixture {
  readonly server: EvidenceServer;
  readonly manager: MatchmakingManager;
  readonly humanIds: readonly PlayerId[];
  readonly match: Match;
}

function createFixture(humanCount: number): Fixture {
  const server = new EvidenceServer();
  const manager = new MatchmakingManager(
    server as unknown as GameServer,
    () => 0,
    undefined,
    () => 0.42,
    () => new Date('2026-07-18T12:00:00.000Z'),
  );
  const humanIds = Array.from(
    { length: humanCount },
    (_, index) => `perf-human-${index}` as PlayerId,
  );
  for (const [index, playerId] of humanIds.entries()) {
    server.connected.add(playerId);
    if (
      !manager.handleJoinBattleRoyale(
        playerId,
        `Perf${index}`,
        CHARACTER_IDS[index % CHARACTER_IDS.length],
      )
    ) {
      throw new Error(`Could not queue performance entrant ${playerId}`);
    }
  }
  if (humanCount < BATTLE_ROYALE_QUEUE.MAX_PLAYERS) {
    manager.tick(BATTLE_ROYALE_QUEUE.BOT_FILL_DEADLINE_SECONDS, 1);
  }
  const [match] = manager.getActiveMatches();
  if (!match || match.players.size !== BATTLE_ROYALE_QUEUE.MAX_PLAYERS) {
    throw new Error('Performance fixture did not launch exactly eight entrants');
  }
  match.phase = MatchPhase.ACTIVE;
  match.matchTimer = 100_000;
  for (const [index, player] of [...match.players.values()].entries()) {
    player.characterId = CHARACTER_IDS[index % CHARACTER_IDS.length];
    player.maxHealth = 1_000_000;
    player.health = player.maxHealth;
    player.invulnerableTimer = 0;
  }
  return { server, manager, humanIds, match };
}

function equip(
  player: Match['players'] extends Map<PlayerId, infer State> ? State : never,
  instance: WeaponInstance,
): void {
  const loadedAmmo = WEAPONS[instance.weaponId].magazineSize;
  player.weaponId = instance.weaponId;
  player.weaponInstance = instance;
  player.ammo = loadedAmmo;
  player.specialAmmo = loadedAmmo;
  player.specialReserve = 96;
  player.battleRoyaleInventory = {
    equipped: instance,
    loadedAmmo,
    reserveAmmo: 96,
  };
}

function input(sequenceNumber: number, index: number): PlayerInput {
  return {
    sequenceNumber,
    moveX: index % 2 === 0 ? 1 : -1,
    moveY: index % 3 === 0 ? 1 : 0,
    aimAngle: (index * Math.PI) / 4,
    aimingGun: true,
    firePressed: sequenceNumber % 8 === 0,
    aimingGrenade: false,
    throwPressed: sequenceNumber % 80 === 1,
    detonatePressed: sequenceNumber % 80 === 40,
    sprint: sequenceNumber % 4 === 0,
    reload: sequenceNumber % 120 === 0,
    abilityPressed: sequenceNumber % 240 === 0,
    tick: sequenceNumber,
  };
}

function seedStressState(fixture: Fixture): void {
  const { match } = fixture;
  const containerSpawns = match.getMapData().battleRoyale?.containerSpawns ?? [];
  for (const spawn of containerSpawns.slice(0, 8)) {
    match.battleRoyaleLootManager?.openContainerAt(spawn.x, spawn.y);
  }
  for (const [index, player] of [...match.players.values()].entries()) {
    const weaponId = index < 2 ? 'rifle' : 'launcher';
    const instance = createWeaponInstance(`perf-weapon-${index}`, weaponId, 0.72);
    if (!instance) throw new Error(`Could not create performance weapon ${index}`);
    equip(player, instance);
    if (weaponId === 'launcher') {
      match.combatManager.spawnRocket(player.id, player.position, player.aimAngle, instance);
    }
    match.combatManager.spawnGrenade(player.id, player.position, player.aimAngle, false, 1);
  }
}

function queueHumanInputs(fixture: Fixture, sequenceNumber: number): void {
  for (const [index, playerId] of fixture.humanIds.entries()) {
    fixture.manager.routeInput(playerId, input(sequenceNumber, index));
  }
}

function encodedBytes(snapshot: ServerGameStateMessage | null): number {
  if (!snapshot) throw new Error('Missing authoritative performance snapshot');
  return Buffer.byteLength(JSON.stringify(snapshot), 'utf8');
}

function objectCounts(snapshot: ServerGameStateMessage | null): Readonly<Record<string, number>> {
  if (!snapshot) throw new Error('Missing authoritative performance snapshot');
  return Object.freeze({
    fighters: snapshot.players.length,
    grenades: snapshot.grenades.length,
    axes: snapshot.axes.length,
    rockets: snapshot.rockets?.length ?? 0,
    bulletTrails: snapshot.bulletTrails.length,
    explosions: snapshot.barrelExplosions.length,
    containers: snapshot.battleRoyaleContainers?.length ?? 0,
    droppedWeapons: snapshot.droppedWeapons?.length ?? 0,
    supplyBundles: snapshot.battleRoyaleSupplyBundles?.length ?? 0,
    safeZones: snapshot.battleRoyaleSafeZone ? 1 : 0,
    spectatorEntries: snapshot.battleRoyaleSpectator?.standings.length ?? 0,
  });
}

function collectGarbage(): boolean {
  const gc = globalThis.gc;
  if (!gc) return false;
  gc();
  return true;
}

async function main(): Promise<void> {
  process.env.FORCE_MATCH_SECONDS = '100000';
  let mixed: Fixture | null = createFixture(4);
  seedStressState(mixed);
  queueHumanInputs(mixed, 2);
  mixed.manager.tick(0.001, 2);
  const stressedSnapshotBytes = encodedBytes(mixed.server.latestSnapshot);
  const stressedObjects = objectCounts(mixed.server.latestSnapshot);
  queueHumanInputs(mixed, 40);
  mixed.manager.tick(0.001, 40);
  const transientEffectObjects = objectCounts(mixed.server.latestSnapshot);

  for (let tick = 0; tick < WARMUP_TICKS; tick += 1) {
    queueHumanInputs(mixed, tick + 41);
    mixed.manager.tick(FIXED_DT_SECONDS, tick + 41);
  }
  const representativeSnapshotBytes = encodedBytes(mixed.server.latestSnapshot);
  const garbageCollectionAvailable = collectGarbage();
  const warmedHeapBytes = process.memoryUsage().heapUsed;

  const samples: number[] = [];
  for (let tick = 0; tick < SAMPLE_TICKS; tick += 1) {
    queueHumanInputs(mixed, WARMUP_TICKS + tick + 41);
    const startedAt = performance.now();
    mixed.manager.tick(FIXED_DT_SECONDS, WARMUP_TICKS + tick + 41);
    samples.push(performance.now() - startedAt);
  }
  collectGarbage();
  const settledHeapBytes = process.memoryUsage().heapUsed;
  const settledHeapGrowthBytes = Math.max(0, settledHeapBytes - warmedHeapBytes);
  const tickDistribution = performanceDistribution(samples);

  const liveLoop = new GameLoop((dt, tick) => {
    if (!mixed) return;
    queueHumanInputs(mixed, WARMUP_TICKS + SAMPLE_TICKS + tick + 41);
    mixed.manager.tick(dt, WARMUP_TICKS + SAMPLE_TICKS + tick + 41);
  }, SERVER.TICK_RATE);
  const liveStartedAt = performance.now();
  liveLoop.start();
  await new Promise<void>((resolve) => setTimeout(resolve, LIVE_SAMPLE_MS));
  liveLoop.stop();
  const liveWindowMs = performance.now() - liveStartedAt;

  const traffic = snapshotTraffic(stressedSnapshotBytes);
  assertBattleRoyalePerformanceBudget({
    tick: tickDistribution,
    stressedSnapshotBytes,
    aggregateBytesPerSecond: traffic.aggregateBytesPerSecond,
    settledHeapGrowthBytes,
  });

  const fullHuman = createFixture(8);
  fullHuman.manager.tick(0.001, 1);
  const fullHumanDeliveries = fullHuman.server.snapshotDeliveries;
  const fullHumanEncodes = fullHuman.server.snapshotEncodes;

  const survivorId = mixed.humanIds[0];
  for (const playerId of mixed.match.players.keys()) {
    if (playerId !== survivorId) mixed.match.onPlayerDisconnect(playerId, true);
  }
  mixed.manager.tick(FIXED_DT_SECONDS, WARMUP_TICKS + SAMPLE_TICKS + 100);
  const activeMatchesAfterTerminal = mixed.manager.getActiveMatches().length;
  for (const playerId of mixed.humanIds) mixed.manager.handleReturnToLobby(playerId);
  mixed = null;
  collectGarbage();
  const cleanupHeapBytes = process.memoryUsage().heapUsed;

  const evidence = {
    capturedAt: new Date().toISOString(),
    node: process.version,
    fixture: {
      entrants: BATTLE_ROYALE_QUEUE.MAX_PLAYERS,
      humans: 4,
      bots: 4,
      map: 'Shatterlands',
      warmupTicks: WARMUP_TICKS,
      sampleTicks: SAMPLE_TICKS,
      stressedObjects,
      transientEffectObjects,
      terminalActiveMatches: activeMatchesAfterTerminal,
    },
    tick: {
      budgetMs: BATTLE_ROYALE_PERFORMANCE_BUDGETS.tickMs,
      synthetic: tickDistribution,
      live: {
        configuredHz: SERVER.TICK_RATE,
        measuredHz: liveLoop.measuredTickRate,
        ticks: liveLoop.tick_number,
        windowMs: roundPerformance(liveWindowMs),
        effectiveHz: roundPerformance((liveLoop.tick_number * 1_000) / liveWindowMs),
        averageProcessingMs: roundPerformance(liveLoop.avgProcessingTimeMs),
      },
    },
    network: {
      encoding: 'UTF-8 JSON',
      representativeSnapshotBytes,
      stressedSnapshotBytes,
      snapshotBudgetBytes: BATTLE_ROYALE_PERFORMANCE_BUDGETS.snapshotBytes,
      ...traffic,
      aggregateBudgetBytesPerSecond: BATTLE_ROYALE_PERFORMANCE_BUDGETS.aggregateBytesPerSecond,
      fullHumanFanout: {
        recipients: 8,
        encodes: fullHumanEncodes,
        deliveries: fullHumanDeliveries,
      },
    },
    memory: {
      garbageCollectionAvailable,
      warmedHeapBytes,
      settledHeapBytes,
      settledHeapGrowthBytes,
      cleanupHeapBytes,
      growthBudgetBytes: BATTLE_ROYALE_PERFORMANCE_BUDGETS.settledHeapGrowthBytes,
    },
  };

  if (stressedObjects.fighters !== 8 || stressedObjects.safeZones !== 1) {
    throw new Error('Performance fixture lost required fighters or safe-zone authority');
  }
  if (
    stressedObjects.containers < 8 ||
    stressedObjects.droppedWeapons < 8 ||
    stressedObjects.supplyBundles < 8 ||
    stressedObjects.grenades < 8 ||
    stressedObjects.rockets < 6
  ) {
    throw new Error(
      `Performance fixture did not retain its stressed object mix: ${JSON.stringify(stressedObjects)}`,
    );
  }
  if (transientEffectObjects.bulletTrails < 2) {
    throw new Error(
      `Performance fixture did not retain its transient combat effects: ${JSON.stringify(transientEffectObjects)}`,
    );
  }
  if (fullHumanEncodes !== 1 || fullHumanDeliveries !== 8) {
    throw new Error('Full-human fanout did not encode once and deliver eight times');
  }
  if (activeMatchesAfterTerminal !== 0) {
    throw new Error('Battle Royale terminal cleanup retained an active match');
  }

  console.log(`BATTLE_ROYALE_PERFORMANCE_EVIDENCE ${JSON.stringify(evidence)}`);
}

await main();
