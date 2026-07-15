import {
  BOT_DIFFICULTIES,
  DEFAULT_BOT_DIFFICULTY,
  type BotDifficulty,
  type CharacterId,
  type MutatorId,
  type PracticeKind,
} from '@shared/config/game.js';
import type { GameModeType } from '@shared/types/game.js';
import { nextPracticeModePreference, normalizePracticeModePreference } from '../practice-mode.js';
import {
  nextPracticeMutatorPreference,
  normalizePracticeMutatorPreference,
} from '../practice-mutator.js';
import {
  nextPracticeRivalPreference,
  normalizePracticeRivalPreference,
} from '../practice-rival.js';

export const REFORGED_CHALLENGE_STORAGE_KEYS = Object.freeze({
  nickname: 'mmr_nickname',
  difficulty: 'mmr_bot_difficulty',
  mode: 'mmr_practice_mode',
  rival: 'mmr_practice_rival',
  mutator: 'mmr_practice_mutator',
});

export type ReforgedChallengeKind = Extract<
  PracticeKind,
  'sparring' | 'rusty_rumble' | 'gauntlet' | 'daily'
>;

export interface ReforgedChallengePreferences {
  readonly difficulty: BotDifficulty;
  readonly mode: GameModeType | null;
  readonly rival: CharacterId | null;
  readonly mutator: MutatorId | null;
}

export type ReforgedChallengeSetupField = 'difficulty' | 'rival' | 'mode' | 'mutator';

export interface ReforgedChallengeStartRequest {
  readonly kind: ReforgedChallengeKind;
  readonly difficulty: BotDifficulty;
  readonly gameMode?: GameModeType;
  readonly opponentCharacterId?: CharacterId;
  readonly mutatorId?: MutatorId;
}

type ChallengeStorageReader = Pick<Storage, 'getItem'>;
type ChallengeStorageWriter = Pick<Storage, 'setItem' | 'removeItem'>;

/** Read the established Lobby preferences without inventing a second schema. */
export function readReforgedChallengePreferences(
  storage: ChallengeStorageReader,
): ReforgedChallengePreferences {
  const storedDifficulty = storage.getItem(REFORGED_CHALLENGE_STORAGE_KEYS.difficulty);
  const difficulty = BOT_DIFFICULTIES.includes(storedDifficulty as BotDifficulty)
    ? (storedDifficulty as BotDifficulty)
    : DEFAULT_BOT_DIFFICULTY;
  const mode = normalizePracticeModePreference(
    storage.getItem(REFORGED_CHALLENGE_STORAGE_KEYS.mode),
  );
  return {
    difficulty,
    mode,
    rival: normalizePracticeRivalPreference(storage.getItem(REFORGED_CHALLENGE_STORAGE_KEYS.rival)),
    mutator: normalizePracticeMutatorPreference(
      storage.getItem(REFORGED_CHALLENGE_STORAGE_KEYS.mutator),
      mode,
    ),
  };
}

/** Preserve the exact Lobby cycle order and mode/mutator compatibility rule. */
export function advanceReforgedChallengePreferences(
  current: ReforgedChallengePreferences,
  field: ReforgedChallengeSetupField,
): ReforgedChallengePreferences {
  if (field === 'difficulty') {
    const index = BOT_DIFFICULTIES.indexOf(current.difficulty);
    return {
      ...current,
      difficulty: BOT_DIFFICULTIES[(index + 1) % BOT_DIFFICULTIES.length],
    };
  }
  if (field === 'rival') {
    return { ...current, rival: nextPracticeRivalPreference(current.rival) };
  }
  if (field === 'mutator') {
    return {
      ...current,
      mutator: nextPracticeMutatorPreference(current.mutator, current.mode),
    };
  }
  const mode = nextPracticeModePreference(current.mode);
  return {
    ...current,
    mode,
    mutator: normalizePracticeMutatorPreference(current.mutator, mode),
  };
}

/** Write only the preference that the player changed, matching the legacy path. */
export function persistReforgedChallengePreference(
  storage: ChallengeStorageWriter,
  previous: ReforgedChallengePreferences,
  next: ReforgedChallengePreferences,
  field: ReforgedChallengeSetupField,
): void {
  if (field === 'difficulty') {
    storage.setItem(REFORGED_CHALLENGE_STORAGE_KEYS.difficulty, next.difficulty);
    return;
  }
  if (field === 'rival') {
    writeNullable(storage, REFORGED_CHALLENGE_STORAGE_KEYS.rival, next.rival);
    return;
  }
  if (field === 'mutator') {
    writeNullable(storage, REFORGED_CHALLENGE_STORAGE_KEYS.mutator, next.mutator);
    return;
  }
  writeNullable(storage, REFORGED_CHALLENGE_STORAGE_KEYS.mode, next.mode);
  if (next.mutator !== previous.mutator) {
    writeNullable(storage, REFORGED_CHALLENGE_STORAGE_KEYS.mutator, next.mutator);
  }
}

/** Project a tab choice onto the unchanged client:startPractice call boundary. */
export function reforgedChallengeStartRequest(
  kind: ReforgedChallengeKind,
  preferences: ReforgedChallengePreferences,
): ReforgedChallengeStartRequest {
  const customizable = kind === 'sparring' || kind === 'rusty_rumble';
  return {
    kind,
    difficulty: preferences.difficulty,
    ...(customizable && preferences.mode !== null ? { gameMode: preferences.mode } : {}),
    ...(customizable && preferences.rival !== null
      ? { opponentCharacterId: preferences.rival }
      : {}),
    ...(customizable && preferences.mutator !== null ? { mutatorId: preferences.mutator } : {}),
  };
}

function writeNullable(storage: ChallengeStorageWriter, key: string, value: string | null): void {
  if (value === null) storage.removeItem(key);
  else storage.setItem(key, value);
}
