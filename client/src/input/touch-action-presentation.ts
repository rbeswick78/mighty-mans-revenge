export type TouchAbilityState = 'ready' | 'active' | 'cooldown';

export const TAUNT_BUTTON_LABEL = 'TAUNT';

export function grenadeButtonLabel(hasActiveGrenade: boolean): string {
  return hasActiveGrenade ? 'DETONATE' : 'GRENADE';
}

export function abilityButtonLabel(state: TouchAbilityState): string {
  const stateLabel = state === 'ready' ? 'READY' : state === 'active' ? 'ACTIVE' : 'COOLDOWN';
  return `ABILITY\n${stateLabel}`;
}

export function touchAbilityState(
  activeSeconds: number,
  cooldownSeconds: number,
): TouchAbilityState {
  if (Number.isFinite(activeSeconds) && activeSeconds > 0) return 'active';
  if (Number.isFinite(cooldownSeconds) && cooldownSeconds > 0) return 'cooldown';
  return 'ready';
}
