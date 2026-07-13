import type { RawInput } from './types.js';

/** Preserve primary combat/movement while suppressing mode-disabled actions. */
export function withoutSecondaryActions(raw: RawInput): RawInput {
  return {
    ...raw,
    aimingGrenade: false,
    throwPressed: false,
    detonatePressed: false,
    reload: false,
    abilityPressed: false,
  };
}
