import {
  BATTLE_ROYALE_INVENTORY,
  BATTLE_ROYALE_LOOT,
  GRENADE,
  PICKUP,
  WEAPONS,
  createWeaponInstance,
  normalizeWeaponInstance,
  rollBattleRoyaleGun,
  type BattleRoyaleContainerState,
  type BattleRoyaleSupplyBundleState,
  type BattleRoyaleSustainType,
  type PlayerState,
  type Vec2,
} from '@shared/game';
import type { BattleRoyaleInventoryManager } from './battle-royale-inventory-manager.js';

interface ManagedContainer {
  readonly id: string;
  readonly position: Vec2;
  readonly tile: Readonly<{ col: number; row: number }>;
  status: 'intact' | 'opened';
  openedSecondsRemaining: number;
}

function stableHash(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function stableRoll(value: string): number {
  return stableHash(value) / 4294967296;
}

/** Server-owned Battle Royale container, supply, and elimination-pile lifecycle. */
export class BattleRoyaleLootManager {
  private readonly containers = new Map<string, ManagedContainer>();
  private readonly containerIdByTile = new Map<string, string>();
  private readonly supplyBundles = new Map<string, BattleRoyaleSupplyBundleState>();
  private readonly retiredLootSourceIds = new Set<string>();
  private nextBundleId = 0;

  constructor(
    private readonly stableSeed: string,
    private readonly inventoryManager: BattleRoyaleInventoryManager,
  ) {}

  spawnContainer(
    id: string,
    tile: Readonly<{ col: number; row: number }>,
    position: Vec2,
  ): BattleRoyaleContainerState | null {
    if (
      !/^[A-Za-z0-9:_-]{1,96}$/.test(id) ||
      !Number.isInteger(tile.col) ||
      tile.col < 0 ||
      !Number.isInteger(tile.row) ||
      tile.row < 0 ||
      !Number.isFinite(position.x) ||
      !Number.isFinite(position.y) ||
      this.containers.has(id) ||
      this.containerIdByTile.has(`${tile.col},${tile.row}`)
    ) {
      return null;
    }
    const container: ManagedContainer = {
      id,
      tile: { ...tile },
      position: { ...position },
      status: 'intact',
      openedSecondsRemaining: 0,
    };
    this.containers.set(id, container);
    this.containerIdByTile.set(`${tile.col},${tile.row}`, id);
    return this.cloneContainer(container);
  }

  openContainerAt(col: number, row: number): BattleRoyaleContainerState | null {
    const id = this.containerIdByTile.get(`${col},${row}`);
    if (!id) return null;
    const container = this.containers.get(id);
    if (!container || container.status !== 'intact') return null;
    container.status = 'opened';
    container.openedSecondsRemaining = BATTLE_ROYALE_LOOT.CONTAINER_OPEN_FEEDBACK_SECONDS;
    this.containerIdByTile.delete(`${col},${row}`);

    const weaponId = rollBattleRoyaleGun(stableRoll(`${this.stableSeed}:${id}:gun`));
    const instanceId = `br-weapon:${stableHash(`${this.stableSeed}:${id}:instance:a`)
      .toString(16)
      .padStart(8, '0')}${stableHash(`${this.stableSeed}:${id}:instance:b`)
      .toString(16)
      .padStart(8, '0')}`;
    const instance = weaponId
      ? createWeaponInstance(instanceId, weaponId, stableRoll(`${this.stableSeed}:${id}:rarity`))
      : null;
    if (!instance) throw new Error(`Battle Royale container ${id} produced invalid gun loot`);
    const drop = this.inventoryManager.spawnDrop(
      instance,
      WEAPONS[instance.weaponId].magazineSize,
      container.position,
      id,
    );
    if (!drop) throw new Error(`Battle Royale container ${id} could not author its gun loot`);
    this.spawnSupplyBundle(
      id,
      container.position,
      BATTLE_ROYALE_LOOT.CONTAINER_RESERVE_AMMO,
      this.stableSustain(`${this.stableSeed}:${id}:sustain`),
      'container',
    );
    return this.cloneContainer(container);
  }

  hasIntactContainerAt(col: number, row: number): boolean {
    const id = this.containerIdByTile.get(`${col},${row}`);
    return id !== undefined && this.containers.get(id)?.status === 'intact';
  }

  spawnEliminationPile(player: PlayerState): boolean {
    const sourceId = `br-elimination:${player.id}`;
    if (this.retiredLootSourceIds.has(sourceId)) return false;
    const inventory = player.battleRoyaleInventory;
    if (!inventory) return false;
    this.retiredLootSourceIds.add(sourceId);
    const equipped = inventory.equipped ? normalizeWeaponInstance(inventory.equipped) : null;
    if (equipped) {
      this.inventoryManager.spawnDrop(equipped, inventory.loadedAmmo, player.position, sourceId);
    }
    this.spawnSupplyBundle(
      sourceId,
      player.position,
      inventory.reserveAmmo,
      this.eliminationSustain(player),
      'elimination',
    );
    return true;
  }

  update(dt: number): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    for (const [id, container] of this.containers) {
      if (container.status !== 'opened') continue;
      container.openedSecondsRemaining -= dt;
      if (container.openedSecondsRemaining <= 0) this.containers.delete(id);
    }
  }

  findSupplyCandidate(position: Vec2): BattleRoyaleSupplyBundleState | null {
    const radiusSquared = BATTLE_ROYALE_LOOT.SUPPLY_PICKUP_RADIUS ** 2;
    let best: { bundle: BattleRoyaleSupplyBundleState; distanceSquared: number } | null = null;
    for (const bundle of this.supplyBundles.values()) {
      const dx = bundle.position.x - position.x;
      const dy = bundle.position.y - position.y;
      const distanceSquared = dx * dx + dy * dy;
      if (distanceSquared > radiusSquared) continue;
      if (
        best === null ||
        distanceSquared < best.distanceSquared ||
        (distanceSquared === best.distanceSquared && bundle.id.localeCompare(best.bundle.id) < 0)
      ) {
        best = { bundle, distanceSquared };
      }
    }
    return best?.bundle ?? null;
  }

  collectSupply(bundleId: string, player: PlayerState): boolean {
    const bundle = this.supplyBundles.get(bundleId);
    const inventory = player.battleRoyaleInventory;
    if (!bundle || !inventory || player.isDead) return false;
    const reserveUseful =
      bundle.reserveAmmo > 0 && inventory.reserveAmmo < BATTLE_ROYALE_INVENTORY.MAX_RESERVE_AMMO;
    const sustainUseful = this.sustainUseful(bundle.sustainType, player);
    if (!reserveUseful && !sustainUseful) return false;
    inventory.reserveAmmo = Math.min(
      BATTLE_ROYALE_INVENTORY.MAX_RESERVE_AMMO,
      inventory.reserveAmmo + bundle.reserveAmmo,
    );
    player.specialReserve = inventory.reserveAmmo;
    if (sustainUseful) this.applySustain(bundle.sustainType, player);
    this.supplyBundles.delete(bundleId);
    return true;
  }

  getContainers(): BattleRoyaleContainerState[] {
    return [...this.containers.values()]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((container) => this.cloneContainer(container));
  }

  getSupplyBundles(): BattleRoyaleSupplyBundleState[] {
    return [...this.supplyBundles.values()]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((bundle) => ({ ...bundle, position: { ...bundle.position } }));
  }

  private spawnSupplyBundle(
    lootSourceId: string,
    position: Vec2,
    reserveAmmo: number,
    sustainType: BattleRoyaleSustainType,
    source: BattleRoyaleSupplyBundleState['source'],
  ): void {
    const id = `br-supply:${this.nextBundleId++}`;
    this.supplyBundles.set(id, {
      id,
      position: { ...position },
      reserveAmmo: Math.min(
        BATTLE_ROYALE_INVENTORY.MAX_RESERVE_AMMO,
        Math.max(0, Math.floor(reserveAmmo)),
      ),
      sustainType,
      lootSourceId,
      source,
    });
  }

  private stableSustain(seed: string): BattleRoyaleSustainType {
    return (['bandage', 'armor', 'grenade'] as const)[stableHash(seed) % 3];
  }

  private eliminationSustain(player: PlayerState): BattleRoyaleSustainType {
    if (player.grenades > 0) return 'grenade';
    if (player.armor > 0) return 'armor';
    return 'bandage';
  }

  private sustainUseful(type: BattleRoyaleSustainType, player: PlayerState): boolean {
    if (type === 'bandage') return player.health < player.maxHealth;
    if (type === 'armor') return player.armor < PICKUP.ARMOR_MAX;
    return player.grenades < GRENADE.MAX_COUNT;
  }

  private applySustain(type: BattleRoyaleSustainType, player: PlayerState): void {
    if (type === 'bandage') {
      player.health = Math.min(player.maxHealth, player.health + PICKUP.BANDAGE_HEAL);
    } else if (type === 'armor') {
      player.armor = Math.min(PICKUP.ARMOR_MAX, player.armor + PICKUP.ARMOR_AMOUNT);
    } else {
      player.grenades = Math.min(GRENADE.MAX_COUNT, player.grenades + GRENADE.PICKUP_AMOUNT);
    }
  }

  private cloneContainer(container: BattleRoyaleContainerState): BattleRoyaleContainerState {
    return {
      id: container.id,
      position: { ...container.position },
      tile: { ...container.tile },
      status: container.status,
    };
  }
}
