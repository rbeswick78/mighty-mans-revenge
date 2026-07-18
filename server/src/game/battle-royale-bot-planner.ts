import {
  BATTLE_ROYALE_BOT,
  BATTLE_ROYALE_INVENTORY,
  GRENADE,
  PICKUP,
  PLAYER,
  WEAPONS,
  WEAPON_RARITY,
  characterSpeedMultiplier,
  isOutsideBattleRoyaleSafeZone,
} from '@shared/game';
import type {
  BattleRoyaleContainerState,
  BattleRoyaleSafeZoneState,
  BattleRoyaleSupplyBundleState,
  CollisionGrid,
  DroppedWeaponState,
  PlayerId,
  PlayerState,
  Vec2,
  WeaponInstance,
} from '@shared/game';

export type BattleRoyaleBotGoalKind =
  | 'current-zone'
  | 'next-zone'
  | 'gun'
  | 'supply'
  | 'container'
  | 'target'
  | 'hold';

export interface BattleRoyaleBotDecision {
  readonly goalKind: BattleRoyaleBotGoalKind;
  readonly movementPosition: Vec2;
  readonly combatTarget: PlayerState | null;
  readonly attackPosition: Vec2 | null;
  readonly swapDropId: string | null;
  readonly finalAggression: boolean;
}

export interface BattleRoyaleBotWorldState {
  readonly players: ReadonlyMap<PlayerId, PlayerState>;
  readonly drops: readonly DroppedWeaponState[];
  readonly containers: readonly BattleRoyaleContainerState[];
  readonly supplies: readonly BattleRoyaleSupplyBundleState[];
  readonly safeZone: BattleRoyaleSafeZoneState | null;
  readonly collisionGrid?: CollisionGrid;
  readonly tileSize: number;
}

function distance(left: Vec2, right: Vec2): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function isInsideCircle(position: Vec2, center: Vec2, radius: number): boolean {
  return distance(position, center) <= radius;
}

/** Damage-only rarity plus the weapon's ordinary trigger output; no bot-only damage rules. */
export function battleRoyaleWeaponUtility(instance: WeaponInstance): number {
  const weapon = WEAPONS[instance.weaponId];
  const averageDamage = (weapon.damageMin + weapon.damageMax) / 2;
  return (
    averageDamage *
    weapon.pelletCount *
    weapon.burstSize *
    WEAPON_RARITY[instance.rarity].damageMultiplier
  );
}

function isUsefulUpgrade(player: PlayerState, drop: DroppedWeaponState): boolean {
  const inventory = player.battleRoyaleInventory;
  if (!inventory) return false;
  if (!inventory.equipped) return true;
  const candidate = battleRoyaleWeaponUtility(drop.weaponInstance);
  const current = battleRoyaleWeaponUtility(inventory.equipped);
  if (candidate !== current) return candidate > current;
  const currentTotalAmmo = inventory.loadedAmmo + inventory.reserveAmmo;
  return currentTotalAmmo <= 0 && drop.loadedAmmo > 0;
}

function detourAllowed(
  bot: PlayerState,
  position: Vec2,
  world: BattleRoyaleBotWorldState,
): boolean {
  if (distance(bot.position, position) > BATTLE_ROYALE_BOT.MAX_LOOT_DETOUR_TILES * world.tileSize) {
    return false;
  }
  const zone = world.safeZone;
  if (!zone) return true;
  if (isOutsideBattleRoyaleSafeZone(position, zone)) return false;
  return zone.nextCenter === null || zone.nextRadius === null
    ? true
    : isInsideCircle(position, zone.nextCenter, zone.nextRadius);
}

function pickGun(bot: PlayerState, world: BattleRoyaleBotWorldState): DroppedWeaponState | null {
  const candidates = world.drops.filter(
    (drop) => isUsefulUpgrade(bot, drop) && detourAllowed(bot, drop.position, world),
  );
  candidates.sort((left, right) => {
    const utility =
      battleRoyaleWeaponUtility(right.weaponInstance) -
      battleRoyaleWeaponUtility(left.weaponInstance);
    if (utility !== 0) return utility;
    const readiness = right.loadedAmmo - left.loadedAmmo;
    if (readiness !== 0) return readiness;
    return (
      distance(bot.position, left.position) - distance(bot.position, right.position) ||
      left.id.localeCompare(right.id)
    );
  });
  return candidates[0] ?? null;
}

function supplyPriority(bot: PlayerState, supply: BattleRoyaleSupplyBundleState): number | null {
  const inventory = bot.battleRoyaleInventory;
  if (!inventory) return null;
  let priority = Number.NEGATIVE_INFINITY;
  if (supply.reserveAmmo > 0 && inventory.reserveAmmo < BATTLE_ROYALE_INVENTORY.MAX_RESERVE_AMMO) {
    priority = inventory.loadedAmmo + inventory.reserveAmmo <= 0 ? 800 : 500;
  }
  if (supply.sustainType === 'bandage' && bot.health < bot.maxHealth) {
    priority = Math.max(priority, bot.health / bot.maxHealth <= 0.5 ? 900 : 620);
  } else if (supply.sustainType === 'armor' && bot.armor < PICKUP.ARMOR_MAX) {
    priority = Math.max(priority, 580);
  } else if (supply.sustainType === 'grenade' && bot.grenades < GRENADE.MAX_COUNT) {
    priority = Math.max(priority, 440);
  }
  return Number.isFinite(priority) ? priority : null;
}

function pickSupply(
  bot: PlayerState,
  world: BattleRoyaleBotWorldState,
): { supply: BattleRoyaleSupplyBundleState; priority: number } | null {
  const candidates = world.supplies
    .map((supply) => ({ supply, priority: supplyPriority(bot, supply) }))
    .filter(
      (candidate): candidate is { supply: BattleRoyaleSupplyBundleState; priority: number } =>
        candidate.priority !== null && detourAllowed(bot, candidate.supply.position, world),
    );
  candidates.sort(
    (left, right) =>
      right.priority - left.priority ||
      distance(bot.position, left.supply.position) -
        distance(bot.position, right.supply.position) ||
      left.supply.id.localeCompare(right.supply.id),
  );
  return candidates[0] ?? null;
}

function pickContainer(
  bot: PlayerState,
  world: BattleRoyaleBotWorldState,
): BattleRoyaleContainerState | null {
  const candidates = world.containers.filter(
    (container) => container.status === 'intact' && detourAllowed(bot, container.position, world),
  );
  candidates.sort(
    (left, right) =>
      distance(bot.position, left.position) - distance(bot.position, right.position) ||
      left.id.localeCompare(right.id),
  );
  return candidates[0] ?? null;
}

/** BR target selection is stable even if the player map arrived in a different order. */
export function pickBattleRoyaleTarget(
  bot: PlayerState,
  players: ReadonlyMap<PlayerId, PlayerState>,
  safeZone: BattleRoyaleSafeZoneState | null,
): PlayerState | null {
  const candidates = [...players.values()].filter(
    (candidate) =>
      candidate.id !== bot.id &&
      !candidate.isDead &&
      (safeZone === null || !isOutsideBattleRoyaleSafeZone(candidate.position, safeZone)),
  );
  candidates.sort(
    (left, right) =>
      distance(bot.position, left.position) - distance(bot.position, right.position) ||
      left.id.localeCompare(right.id),
  );
  return candidates[0] ?? null;
}

export function battleRoyaleZoneGoal(
  bot: PlayerState,
  state: BattleRoyaleSafeZoneState | null,
  collisionGrid?: CollisionGrid,
): { kind: 'current-zone' | 'next-zone'; position: Vec2 } | null {
  if (!state) return null;
  if (isOutsideBattleRoyaleSafeZone(bot.position, state)) {
    return {
      kind: 'current-zone',
      position: walkableZonePoint(state.center, state.radius, collisionGrid),
    };
  }
  if (!state.nextCenter || state.nextRadius === null) return null;
  const outsideNext = Math.max(0, distance(bot.position, state.nextCenter) - state.nextRadius);
  if (outsideNext <= 0) return null;
  const travelSpeed = PLAYER.BASE_SPEED * characterSpeedMultiplier(bot.characterId);
  const travelSeconds = outsideNext / travelSpeed;
  if (
    state.phase === 'closing' ||
    state.phaseSecondsRemaining <= travelSeconds + BATTLE_ROYALE_BOT.ZONE_TRAVEL_BUFFER_SECONDS
  ) {
    return {
      kind: 'next-zone',
      position: walkableZonePoint(state.nextCenter, state.nextRadius, collisionGrid),
    };
  }
  return null;
}

/** Resolve arbitrary seeded geometry to a stable walkable tile inside its circle. */
function walkableZonePoint(center: Vec2, radius: number, grid: CollisionGrid | undefined): Vec2 {
  if (!grid) return { ...center };
  const centerCol = Math.floor(center.x / grid.tileSize);
  const centerRow = Math.floor(center.y / grid.tileSize);
  const maxRing = Math.ceil(radius / grid.tileSize);
  for (let ring = 0; ring <= maxRing; ring += 1) {
    const candidates: Array<{ col: number; row: number; position: Vec2; distance: number }> = [];
    for (let row = centerRow - ring; row <= centerRow + ring; row += 1) {
      for (let col = centerCol - ring; col <= centerCol + ring; col += 1) {
        if (
          ring > 0 &&
          row > centerRow - ring &&
          row < centerRow + ring &&
          col > centerCol - ring &&
          col < centerCol + ring
        ) {
          continue;
        }
        if (row < 0 || row >= grid.height || col < 0 || col >= grid.width || grid.solid[row][col]) {
          continue;
        }
        const position = {
          x: (col + 0.5) * grid.tileSize,
          y: (row + 0.5) * grid.tileSize,
        };
        const candidateDistance = distance(position, center);
        if (candidateDistance > radius) continue;
        candidates.push({ col, row, position, distance: candidateDistance });
      }
    }
    candidates.sort(
      (left, right) =>
        left.distance - right.distance || left.row - right.row || left.col - right.col,
    );
    if (candidates[0]) return candidates[0].position;
  }
  return { ...center };
}

/** Pure deterministic plan; the controller turns it into ordinary PlayerInput. */
export function planBattleRoyaleBot(
  bot: PlayerState,
  world: BattleRoyaleBotWorldState,
): BattleRoyaleBotDecision {
  const zoneGoal = battleRoyaleZoneGoal(bot, world.safeZone, world.collisionGrid);
  if (zoneGoal) {
    return {
      goalKind: zoneGoal.kind,
      movementPosition: zoneGoal.position,
      combatTarget: null,
      attackPosition: null,
      swapDropId: null,
      finalAggression: false,
    };
  }

  const target = pickBattleRoyaleTarget(bot, world.players, world.safeZone);
  const finalAggression = world.safeZone?.phase === 'final';
  if (finalAggression) {
    return {
      goalKind: target ? 'target' : 'hold',
      movementPosition: target ? { ...target.position } : { ...bot.position },
      combatTarget: target,
      attackPosition: target ? { ...target.position } : null,
      swapDropId: null,
      finalAggression: true,
    };
  }

  const inventory = bot.battleRoyaleInventory!;
  const supply = pickSupply(bot, world);
  if (supply && supply.priority >= 800) {
    return {
      goalKind: 'supply',
      movementPosition: { ...supply.supply.position },
      combatTarget: null,
      attackPosition: null,
      swapDropId: null,
      finalAggression: false,
    };
  }
  const gun = pickGun(bot, world);
  if (gun) {
    return {
      goalKind: 'gun',
      movementPosition: { ...gun.position },
      combatTarget: null,
      attackPosition: null,
      swapDropId: gun.id,
      finalAggression: false,
    };
  }
  if (supply) {
    return {
      goalKind: 'supply',
      movementPosition: { ...supply.supply.position },
      combatTarget: null,
      attackPosition: null,
      swapDropId: null,
      finalAggression: false,
    };
  }

  const equipped = inventory.equipped;
  const lowAmmo =
    !equipped ||
    inventory.loadedAmmo + inventory.reserveAmmo <=
      WEAPONS[equipped.weaponId].magazineSize * BATTLE_ROYALE_BOT.LOW_AMMO_MAGAZINES;
  const container = lowAmmo ? pickContainer(bot, world) : null;
  if (container) {
    return {
      goalKind: 'container',
      movementPosition: { ...container.position },
      combatTarget: null,
      attackPosition: { ...container.position },
      swapDropId: null,
      finalAggression: false,
    };
  }

  return {
    goalKind: target ? 'target' : 'hold',
    movementPosition: target ? { ...target.position } : { ...bot.position },
    combatTarget: target,
    attackPosition: target ? { ...target.position } : null,
    swapDropId: null,
    finalAggression: false,
  };
}
