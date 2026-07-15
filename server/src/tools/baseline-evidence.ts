import { performance } from 'node:perf_hooks';

import { CHARACTER_IDS, GameModeType, MATCH, MatchPhase, SERVER, getMap } from '@shared/game';
import type {
  CharacterId,
  PlayerId,
  SerializedPlayerState,
  ServerGameStateMessage,
} from '@shared/game';

import { GameLoop } from '../game/game-loop.js';
import { Match } from '../game/match.js';

const SAMPLE_TICKS = 2_000;
const WARMUP_TICKS = 100;
const LIVE_SAMPLE_MS = 2_250;
const FIXED_DT_SECONDS = SERVER.TICK_INTERVAL / 1_000;

interface Distribution {
  meanMs: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
}

interface BaselineEvidence {
  capturedAt: string;
  node: string;
  serverTick: {
    configuredHz: number;
    budgetMs: number;
    rollingMeasuredHz: number;
    liveWindowMs: number;
    liveTicks: number;
    effectiveHz: number;
    liveAverageProcessingMs: number;
    syntheticFourPlayer: Distribution & { samples: number };
  };
  snapshotBytes: {
    twoPlayerActive: number;
    fourPlayerActive: number;
    encoding: 'UTF-8 JSON';
  };
}

function round(value: number): number {
  return Number(value.toFixed(3));
}

function percentile(sorted: readonly number[], fraction: number): number {
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1);
  return sorted[index] ?? 0;
}

function distribution(samples: readonly number[]): Distribution {
  const sorted = [...samples].sort((a, b) => a - b);
  const total = samples.reduce((sum, value) => sum + value, 0);
  return {
    meanMs: round(total / samples.length),
    p95Ms: round(percentile(sorted, 0.95)),
    p99Ms: round(percentile(sorted, 0.99)),
    maxMs: round(sorted.at(-1) ?? 0),
  };
}

function createActiveMatch(playerCount: number): Match {
  const players = Array.from({ length: playerCount }, (_, index) => ({
    id: `baseline-player-${index}` as PlayerId,
    nickname: `Baseline ${index + 1}`,
  }));
  const match = new Match(
    `baseline-${playerCount}-player`,
    getMap('Wasteland Outpost'),
    players,
    GameModeType.DEATHMATCH,
    () => 0.42,
  );

  players.forEach((player, index) => {
    match.setLock(player.id, CHARACTER_IDS[index] as CharacterId);
  });
  match.update(0.01);
  match.update(MATCH.COUNTDOWN_DURATION + 0.01);
  if (match.phase !== MatchPhase.ACTIVE) {
    throw new Error(`Baseline match did not reach ACTIVE (phase: ${match.phase})`);
  }
  return match;
}

function serializePlayer(
  player: Match['players'] extends Map<PlayerId, infer State> ? State : never,
): SerializedPlayerState {
  return {
    id: player.id,
    characterId: (player.characterId ?? CHARACTER_IDS[0]) as CharacterId,
    position: player.position,
    velocity: player.velocity,
    aimAngle: player.aimAngle,
    health: player.health,
    maxHealth: player.maxHealth,
    armor: player.armor,
    ammo: player.ammo,
    weaponId: player.weaponId,
    specialAmmo: player.specialAmmo,
    specialReserve: player.specialReserve,
    grenades: player.grenades,
    isReloading: player.isReloading,
    isSprinting: player.isSprinting,
    stamina: player.stamina,
    isDead: player.isDead,
    respawnTimer: player.respawnTimer,
    invulnerableTimer: player.invulnerableTimer,
    lastProcessedInput: player.lastProcessedInput,
    score: player.score,
    deaths: player.deaths,
    nickname: player.nickname,
    abilityActiveSeconds: player.abilityActiveSeconds,
    abilityCooldownSeconds: player.abilityCooldownSeconds,
    frozenTimer: player.frozenTimer,
    secondWindTimer: player.secondWindTimer,
    spawnRushTimer: player.spawnRushTimer ?? 0,
  };
}

function buildSnapshot(match: Match, tick: number): ServerGameStateMessage {
  return {
    type: 'server:gameState',
    tick,
    phase: match.phase,
    countdownTimer: match.countdownTimer,
    matchTimer: match.matchTimer,
    players: [...match.players.values()].map(serializePlayer),
    grenades: match.getActiveGrenades(),
    axes: match.getActiveAxes(),
    bulletTrails: match.getTickBulletTrails(),
    barrelExplosions: match.getTickBarrelExplosions(),
    contract: match.getContractHudState(),
    punches: match.getTickPunchEvents(),
    pickups: match.pickupManager.getPickups(),
    activeMutators: [...match.activeMutators],
    isOvertime: match.isOvertime,
    koth: match.getKothHudState() ?? undefined,
    confirmedTags:
      match.gameModeType === GameModeType.KILL_CONFIRMED
        ? [...match.getKillConfirmedTags()]
        : undefined,
    confirmedTagCollections:
      match.gameModeType === GameModeType.KILL_CONFIRMED
        ? [...match.getKillConfirmedCollections()]
        : undefined,
    coreRun:
      match.gameModeType === GameModeType.CORE_RUN
        ? (match.getCoreRunState() ?? undefined)
        : undefined,
    bountyHunt:
      match.gameModeType === GameModeType.BOUNTY_HUNT
        ? (match.getBountyHuntState() ?? undefined)
        : undefined,
    rumbleLead: match.getRumbleLeadState() ?? undefined,
    wastelandWarp: match.getWastelandWarpState() ?? undefined,
    radiationStorm: match.getRadiationStormState() ?? undefined,
    scrapstorm: match.getScrapstormState() ?? undefined,
  };
}

function snapshotBytes(match: Match): number {
  return Buffer.byteLength(JSON.stringify(buildSnapshot(match, 100)), 'utf8');
}

function measureSyntheticTicks(match: Match): Distribution & { samples: number } {
  for (let index = 0; index < WARMUP_TICKS; index += 1) {
    match.update(FIXED_DT_SECONDS);
  }

  const samples: number[] = [];
  for (let index = 0; index < SAMPLE_TICKS; index += 1) {
    const startedAt = performance.now();
    match.update(FIXED_DT_SECONDS);
    samples.push(performance.now() - startedAt);
  }
  return { samples: samples.length, ...distribution(samples) };
}

async function measureLiveLoop(match: Match): Promise<{
  rollingMeasuredHz: number;
  windowMs: number;
  ticks: number;
  effectiveHz: number;
  averageProcessingMs: number;
}> {
  const loop = new GameLoop((deltaTime) => match.update(deltaTime), SERVER.TICK_RATE);
  const startedAt = performance.now();
  loop.start();
  await new Promise<void>((resolve) => setTimeout(resolve, LIVE_SAMPLE_MS));
  loop.stop();
  const windowMs = performance.now() - startedAt;
  return {
    rollingMeasuredHz: loop.measuredTickRate,
    windowMs: round(windowMs),
    ticks: loop.tick_number,
    effectiveHz: round((loop.tick_number * 1_000) / windowMs),
    averageProcessingMs: round(loop.avgProcessingTimeMs),
  };
}

async function main(): Promise<void> {
  process.env.FORCE_MATCH_SECONDS = '100000';
  const twoPlayerMatch = createActiveMatch(2);
  const fourPlayerMatch = createActiveMatch(4);
  const twoPlayerBytes = snapshotBytes(twoPlayerMatch);
  const fourPlayerBytes = snapshotBytes(fourPlayerMatch);
  const synthetic = measureSyntheticTicks(fourPlayerMatch);
  const live = await measureLiveLoop(fourPlayerMatch);

  const evidence: BaselineEvidence = {
    capturedAt: new Date().toISOString(),
    node: process.version,
    serverTick: {
      configuredHz: SERVER.TICK_RATE,
      budgetMs: SERVER.TICK_INTERVAL,
      rollingMeasuredHz: live.rollingMeasuredHz,
      liveWindowMs: live.windowMs,
      liveTicks: live.ticks,
      effectiveHz: live.effectiveHz,
      liveAverageProcessingMs: live.averageProcessingMs,
      syntheticFourPlayer: synthetic,
    },
    snapshotBytes: {
      twoPlayerActive: twoPlayerBytes,
      fourPlayerActive: fourPlayerBytes,
      encoding: 'UTF-8 JSON',
    },
  };

  console.log(`BASELINE_EVIDENCE ${JSON.stringify(evidence)}`);
}

await main();
