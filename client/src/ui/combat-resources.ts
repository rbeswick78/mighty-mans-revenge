export type CombatResourceTone = 'normal' | 'warning' | 'danger' | 'live' | 'disabled';

export interface CombatResourcePresentation {
  label: string;
  tone: CombatResourceTone;
}

const LOW_AMMO_FRACTION = 0.25;

export function rifleAmmoPresentation(
  current: number,
  capacity: number,
  isReloading: boolean,
): CombatResourcePresentation {
  const safeCapacity = Math.max(1, Math.floor(capacity));
  const safeCurrent = Math.max(0, Math.floor(current));
  if (isReloading) return { label: 'RIFLE  RELOADING', tone: 'warning' };
  if (safeCurrent === 0) return { label: `RIFLE  0/${safeCapacity}`, tone: 'danger' };
  return {
    label: `RIFLE  ${safeCurrent}/${safeCapacity}`,
    tone: safeCurrent / safeCapacity <= LOW_AMMO_FRACTION ? 'warning' : 'normal',
  };
}

export function grenadePresentation(
  hasActiveGrenade: boolean,
  count: number,
  disabled: boolean,
): CombatResourcePresentation {
  if (disabled) return { label: 'GRENADES  OFF', tone: 'disabled' };
  if (hasActiveGrenade) return { label: 'GRENADE  LIVE', tone: 'live' };
  const safeCount = Math.max(0, Math.floor(count));
  return {
    label: `GRENADES  ${safeCount}`,
    tone: safeCount === 0 ? 'danger' : safeCount === 1 ? 'warning' : 'normal',
  };
}
