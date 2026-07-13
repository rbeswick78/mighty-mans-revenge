import { PICKUP } from '@shared/config/game.js';

export interface ArmorPresentation {
  visible: boolean;
  ratio: number;
  healthLabel: string;
}

/** Shared HUD/overhead presentation for the authoritative Scrap Armor pool. */
export function armorPresentation(health: number, armor: number): ArmorPresentation {
  const safeArmor = Number.isFinite(armor) ? Math.max(0, armor) : 0;
  return {
    visible: safeArmor > 0,
    ratio: Math.min(1, safeArmor / PICKUP.ARMOR_MAX),
    healthLabel:
      safeArmor > 0
        ? `${Math.ceil(health)} +${Math.ceil(safeArmor)}`
        : `${Math.ceil(health)}`,
  };
}
