import { BATTLE_ROYALE_SAFE_ZONE } from '../config/game.js';
import type { Vec2 } from '../types/common.js';
import type { BattleRoyaleSafeZonePhase, BattleRoyaleSafeZoneState } from '../types/game.js';
import type { MapData } from '../types/map.js';

export interface BattleRoyaleSafeZoneCircle {
  readonly center: Vec2;
  readonly radius: number;
}

export interface BattleRoyaleSafeZoneSegment {
  readonly phase: BattleRoyaleSafeZonePhase;
  readonly durationSeconds: number;
  readonly from: BattleRoyaleSafeZoneCircle;
  readonly to: BattleRoyaleSafeZoneCircle;
  readonly damagePerPulse: number;
}

export interface BattleRoyaleSafeZonePlan {
  readonly segments: readonly BattleRoyaleSafeZoneSegment[];
  readonly totalDurationSeconds: number;
}

function stableUnit(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0x1_0000_0000;
}

function circle(center: Vec2, radius: number): BattleRoyaleSafeZoneCircle {
  return Object.freeze({ center: Object.freeze({ ...center }), radius });
}

function targetCircle(
  seed: string,
  index: number,
  parent: BattleRoyaleSafeZoneCircle,
  radius: number,
  width: number,
  height: number,
): BattleRoyaleSafeZoneCircle {
  const minX = radius;
  const maxX = width - radius;
  const minY = radius;
  const maxY = height - radius;
  const desired = {
    x: minX + (maxX - minX) * stableUnit(`${seed}:safe-zone:${index}:x`),
    y: minY + (maxY - minY) * stableUnit(`${seed}:safe-zone:${index}:y`),
  };
  const dx = desired.x - parent.center.x;
  const dy = desired.y - parent.center.y;
  const distance = Math.hypot(dx, dy);
  const maxDistance = Math.max(0, parent.radius - radius);
  const scale = distance > maxDistance && distance > 0 ? maxDistance / distance : 1;
  return circle(
    {
      x: Math.min(maxX, Math.max(minX, parent.center.x + dx * scale)),
      y: Math.min(maxY, Math.max(minY, parent.center.y + dy * scale)),
    },
    radius,
  );
}

/** Build a deterministic, strictly nested sequence without consuming gameplay RNG. */
export function createBattleRoyaleSafeZonePlan(
  seed: string,
  map: MapData,
): BattleRoyaleSafeZonePlan {
  const width = map.width * map.tileSize;
  const height = map.height * map.tileSize;
  const initialCenter = { x: width / 2, y: height / 2 };
  const initial = circle(initialCenter, Math.hypot(width / 2, height / 2) + map.tileSize);
  const radii = BATTLE_ROYALE_SAFE_ZONE.TARGET_RADIUS_FRACTIONS.map(
    (fraction) => Math.min(width, height) * fraction,
  );
  const first = targetCircle(seed, 0, initial, radii[0], width, height);
  const second = targetCircle(seed, 1, first, radii[1], width, height);
  const third = targetCircle(seed, 2, second, radii[2], width, height);
  const finalCircle = circle(third.center, 0);
  const durations = [
    BATTLE_ROYALE_SAFE_ZONE.PREVIEW_SECONDS,
    BATTLE_ROYALE_SAFE_ZONE.FIRST_CLOSE_SECONDS,
    BATTLE_ROYALE_SAFE_ZONE.FIRST_HOLD_SECONDS,
    BATTLE_ROYALE_SAFE_ZONE.SECOND_CLOSE_SECONDS,
    BATTLE_ROYALE_SAFE_ZONE.SECOND_HOLD_SECONDS,
    BATTLE_ROYALE_SAFE_ZONE.THIRD_CLOSE_SECONDS,
    BATTLE_ROYALE_SAFE_ZONE.THIRD_HOLD_SECONDS,
    BATTLE_ROYALE_SAFE_ZONE.FINAL_CLOSE_SECONDS,
  ];
  const phases: BattleRoyaleSafeZonePhase[] = [
    'preview',
    'closing',
    'hold',
    'closing',
    'hold',
    'closing',
    'hold',
    'final',
  ];
  const from = [initial, initial, first, first, second, second, third, third];
  const to = [first, first, second, second, third, third, finalCircle, finalCircle];
  const segments = phases.map((phase, index) =>
    Object.freeze({
      phase,
      durationSeconds: durations[index],
      from: from[index],
      to: to[index],
      damagePerPulse: BATTLE_ROYALE_SAFE_ZONE.DAMAGE_PER_PULSE[index],
    }),
  );
  return Object.freeze({
    segments: Object.freeze(segments),
    totalDurationSeconds: durations.reduce((sum, duration) => sum + duration, 0),
  });
}

function interpolateCircle(
  from: BattleRoyaleSafeZoneCircle,
  to: BattleRoyaleSafeZoneCircle,
  progress: number,
): BattleRoyaleSafeZoneCircle {
  return circle(
    {
      x: from.center.x + (to.center.x - from.center.x) * progress,
      y: from.center.y + (to.center.y - from.center.y) * progress,
    },
    from.radius + (to.radius - from.radius) * progress,
  );
}

/** Sample the reconnect-safe state at an authoritative elapsed time. */
export function battleRoyaleSafeZoneStateAt(
  plan: BattleRoyaleSafeZonePlan,
  elapsedSeconds: number,
): BattleRoyaleSafeZoneState {
  const elapsed = Math.max(0, elapsedSeconds);
  let start = 0;
  let phaseIndex = plan.segments.length - 1;
  let segmentStart = plan.totalDurationSeconds - plan.segments.at(-1)!.durationSeconds;
  for (let index = 0; index < plan.segments.length; index += 1) {
    const end = start + plan.segments[index].durationSeconds;
    if (elapsed < end) {
      phaseIndex = index;
      segmentStart = start;
      break;
    }
    start = end;
  }
  const segment = plan.segments[phaseIndex];
  const localElapsed = Math.max(0, elapsed - segmentStart);
  const remaining = Math.max(0, segment.durationSeconds - localElapsed);
  const closes = segment.phase === 'closing' || segment.phase === 'final';
  const progress = closes ? Math.min(1, localElapsed / segment.durationSeconds) : 0;
  const current = interpolateCircle(segment.from, segment.to, progress);
  const next = segment.phase === 'final' ? null : segment.to;
  return {
    phaseIndex,
    phase: segment.phase,
    center: { ...current.center },
    radius: current.radius,
    nextCenter: next ? { ...next.center } : null,
    nextRadius: next?.radius ?? null,
    phaseSecondsRemaining: remaining,
    damagePerPulse: segment.damagePerPulse,
  };
}

export function isOutsideBattleRoyaleSafeZone(
  position: Vec2,
  state: BattleRoyaleSafeZoneState,
): boolean {
  return Math.hypot(position.x - state.center.x, position.y - state.center.y) > state.radius;
}
