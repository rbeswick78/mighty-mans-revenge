import { MUTATORS, type MutatorId } from '@shared/config/game.js';
import type { GameModeType } from '@shared/types/game.js';
import { eventDisplayName } from '@shared/utils/event-modifiers.js';
import { isMutatorCompatibleWithMode, isMutatorId } from '@shared/utils/mutator-compatibility.js';

export type PracticeMutatorPreference = MutatorId | null;

/** Invalid, legacy, or mode-incompatible storage preserves Random behavior. */
export function normalizePracticeMutatorPreference(
  stored: unknown,
  gameMode: GameModeType | null = null,
): PracticeMutatorPreference {
  if (!isMutatorId(stored)) return null;
  return gameMode === null || isMutatorCompatibleWithMode(stored, gameMode) ? stored : null;
}

/** Cycle RANDOM -> every compatible shared event -> RANDOM in pool order. */
export function nextPracticeMutatorPreference(
  current: PracticeMutatorPreference,
  gameMode: GameModeType | null = null,
): PracticeMutatorPreference {
  const choices = MUTATORS.POOL.filter(
    (mutator) => gameMode === null || isMutatorCompatibleWithMode(mutator, gameMode),
  );
  if (current === null) return choices[0] ?? null;
  const index = choices.indexOf(current);
  return index >= 0 && index < choices.length - 1 ? choices[index + 1] : null;
}

export function practiceMutatorPreferenceLabel(mutator: PracticeMutatorPreference): string {
  return `SOLO CHAOS: ${mutator === null ? 'RANDOM' : eventDisplayName(mutator)}`;
}

export function practiceMutatorBriefingLabel(mutator: MutatorId): string {
  return `MID-MATCH: ${eventDisplayName(mutator)}`;
}
