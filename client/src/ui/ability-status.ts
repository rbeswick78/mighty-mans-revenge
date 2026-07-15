import type { CharacterId } from '@shared/config/game.js';

import { fighterAbilityName } from './fighter-briefing.js';

export type AbilityStatusTone = 'ready' | 'active' | 'cooldown';

export interface AbilityStatusPresentation {
  name: string;
  state: string;
  tone: AbilityStatusTone;
}

function safeSeconds(value: number): number {
  return Math.max(0, Number.isFinite(value) ? value : 0);
}

/** Compact, explicit live copy for every fighter ability state. */
export function abilityStatusPresentation(
  characterId: CharacterId,
  activeSeconds: number,
  cooldownSeconds: number,
): AbilityStatusPresentation {
  const name = fighterAbilityName(characterId);
  const active = safeSeconds(activeSeconds);
  const cooldown = safeSeconds(cooldownSeconds);

  if (active > 0) {
    return { name, state: `ACTIVE ${Math.ceil(active)}S`, tone: 'active' };
  }
  if (cooldown > 0) {
    return { name, state: `READY IN ${Math.ceil(cooldown)}S`, tone: 'cooldown' };
  }
  return { name, state: 'READY', tone: 'ready' };
}
