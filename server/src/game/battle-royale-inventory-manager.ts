import {
  BATTLE_ROYALE_INVENTORY,
  WEAPONS,
  normalizeWeaponInstance,
  type DroppedWeaponState,
  type Vec2,
  type WeaponInstance,
} from '@shared/game';

/** Server-owned ground-gun registry for the dormant one-slot inventory. */
export class BattleRoyaleInventoryManager {
  private readonly drops = new Map<string, DroppedWeaponState>();
  private nextDropId = 0;

  spawnDrop(
    weaponInstance: WeaponInstance,
    loadedAmmo: number,
    position: Vec2,
    lootSourceId?: string,
  ): DroppedWeaponState | null {
    const normalized = normalizeWeaponInstance(weaponInstance);
    if (!normalized || !Number.isFinite(position.x) || !Number.isFinite(position.y)) return null;
    const id = `br-drop:${this.nextDropId++}`;
    const drop: DroppedWeaponState = {
      id,
      position: { ...position },
      weaponInstance: normalized,
      loadedAmmo: Math.min(
        WEAPONS[normalized.weaponId].magazineSize,
        Math.max(0, Math.floor(loadedAmmo)),
      ),
      ...(lootSourceId === undefined ? {} : { lootSourceId }),
    };
    this.drops.set(id, drop);
    return drop;
  }

  getDrops(): DroppedWeaponState[] {
    return [...this.drops.values()].map((drop) => ({
      ...drop,
      position: { ...drop.position },
      weaponInstance: { ...drop.weaponInstance },
    }));
  }

  findCandidate(position: Vec2): DroppedWeaponState | null {
    const radiusSquared = BATTLE_ROYALE_INVENTORY.PICKUP_RADIUS ** 2;
    let best: { drop: DroppedWeaponState; distanceSquared: number } | null = null;
    for (const drop of this.drops.values()) {
      const dx = drop.position.x - position.x;
      const dy = drop.position.y - position.y;
      const distanceSquared = dx * dx + dy * dy;
      if (distanceSquared > radiusSquared) continue;
      if (
        best === null ||
        distanceSquared < best.distanceSquared ||
        (distanceSquared === best.distanceSquared && drop.id.localeCompare(best.drop.id) < 0)
      ) {
        best = { drop, distanceSquared };
      }
    }
    return best?.drop ?? null;
  }

  collect(dropId: string): DroppedWeaponState | null {
    const drop = this.drops.get(dropId);
    if (!drop) return null;
    this.drops.delete(dropId);
    return drop;
  }

  clear(): void {
    this.drops.clear();
  }
}
