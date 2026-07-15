import {
  CHARACTERS,
  CHARACTER_IDS,
  CREW_BATTLE_MODES,
  GAME_MODES,
  GAME_MODE_ROTATION,
  type CharacterId,
} from '@shared/config/game.js';
import type { GameModeType } from '@shared/types/game.js';

export type PlayFormatId = 'duel' | 'rumble' | 'crew';

export interface PlayFormatDefinition {
  readonly id: PlayFormatId;
  readonly label: string;
  readonly detail: string;
}

export interface PlayRosterComposition {
  readonly humanCount: number;
  readonly botCount: number;
}

export interface PlayScheduledArena {
  readonly mode: GameModeType;
  readonly arenaName: string;
}

export interface PlayRosterAvailability {
  readonly currentArenaByMode: Readonly<Partial<Record<GameModeType, string>>>;
}

export interface PlayRosterBuilderState {
  readonly format: PlayFormatId | null;
  readonly composition: PlayRosterComposition | null;
  readonly mode: GameModeType | null;
  readonly arenaName: string | null;
  readonly fighterId: CharacterId | null;
}

export type PlayRosterBuilderStep =
  | 'format'
  | 'composition'
  | 'mode'
  | 'arena'
  | 'fighter'
  | 'review';

export type PlayRosterChoice =
  | Readonly<{ kind: 'format'; format: unknown }>
  | Readonly<{ kind: 'composition'; composition: unknown }>
  | Readonly<{ kind: 'mode'; mode: unknown }>
  | Readonly<{ kind: 'arena' }>
  | Readonly<{ kind: 'fighter'; fighterId: unknown }>;

/**
 * Batch 5 stops at a reviewed, presentation-only draft. This deliberately is
 * not a network MatchIntent; Batch 11 owns that authoritative contract.
 */
export interface SerializedPlayRosterDraft {
  readonly format: PlayFormatId;
  readonly composition: PlayRosterComposition;
  readonly mode: GameModeType;
  readonly arenaName: string;
  readonly fighterId: CharacterId;
}

export const PLAY_FORMATS: readonly PlayFormatDefinition[] = Object.freeze([
  Object.freeze({ id: 'duel', label: 'CURATED DUEL', detail: '2 FIGHTERS' }),
  Object.freeze({ id: 'rumble', label: 'WASTELAND RUMBLE', detail: '2-4 FIGHTERS' }),
  Object.freeze({ id: 'crew', label: 'CREW BATTLE', detail: 'FIXED 2V2' }),
]);

const freezeComposition = (humanCount: number, botCount: number): PlayRosterComposition =>
  Object.freeze({ humanCount, botCount });

const DUEL_COMPOSITIONS = Object.freeze([freezeComposition(1, 1), freezeComposition(2, 0)]);

const RUMBLE_COMPOSITIONS = Object.freeze([
  freezeComposition(1, 1),
  freezeComposition(1, 2),
  freezeComposition(1, 3),
  freezeComposition(2, 0),
  freezeComposition(2, 1),
  freezeComposition(2, 2),
  freezeComposition(3, 0),
  freezeComposition(3, 1),
  freezeComposition(4, 0),
]);

const CREW_COMPOSITIONS = Object.freeze([
  freezeComposition(1, 3),
  freezeComposition(2, 2),
  freezeComposition(3, 1),
  freezeComposition(4, 0),
]);

const COMPOSITIONS_BY_FORMAT: Readonly<Record<PlayFormatId, readonly PlayRosterComposition[]>> =
  Object.freeze({
    duel: DUEL_COMPOSITIONS,
    rumble: RUMBLE_COMPOSITIONS,
    crew: CREW_COMPOSITIONS,
  });

const MODES_BY_FORMAT: Readonly<Record<PlayFormatId, readonly GameModeType[]>> = Object.freeze({
  duel: GAME_MODE_ROTATION,
  rumble: GAME_MODE_ROTATION,
  crew: CREW_BATTLE_MODES,
});

export const EMPTY_PLAY_ROSTER_STATE: PlayRosterBuilderState = Object.freeze({
  format: null,
  composition: null,
  mode: null,
  arenaName: null,
  fighterId: null,
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isPlayFormat(value: unknown): value is PlayFormatId {
  return PLAY_FORMATS.some((format) => format.id === value);
}

function isGameMode(value: unknown): value is GameModeType {
  return typeof value === 'string' && GAME_MODE_ROTATION.includes(value as GameModeType);
}

function isCharacter(value: unknown): value is CharacterId {
  return typeof value === 'string' && CHARACTER_IDS.includes(value as CharacterId);
}

function sameComposition(left: PlayRosterComposition, right: PlayRosterComposition): boolean {
  return left.humanCount === right.humanCount && left.botCount === right.botCount;
}

function validComposition(value: unknown, format: PlayFormatId): PlayRosterComposition | null {
  if (!isRecord(value)) return null;
  const humanCount = value['humanCount'];
  const botCount = value['botCount'];
  if (
    typeof humanCount !== 'number' ||
    typeof botCount !== 'number' ||
    !Number.isInteger(humanCount) ||
    !Number.isInteger(botCount)
  ) {
    return null;
  }
  return (
    COMPOSITIONS_BY_FORMAT[format].find((composition) =>
      sameComposition(composition, { humanCount, botCount } as PlayRosterComposition),
    ) ?? null
  );
}

export function normalizePlayRosterAvailability(
  value: unknown,
  allowedArenaNames: readonly string[],
): PlayRosterAvailability {
  const currentArenaByMode: Partial<Record<GameModeType, string>> = {};
  const allowedArenas = new Set(allowedArenaNames);
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (!isRecord(entry)) continue;
      const mode = entry['mode'];
      const arenaName = entry['arenaName'];
      if (!isGameMode(mode) || typeof arenaName !== 'string' || !allowedArenas.has(arenaName)) {
        continue;
      }
      if (currentArenaByMode[mode] === undefined) currentArenaByMode[mode] = arenaName;
    }
  }
  return Object.freeze({ currentArenaByMode: Object.freeze(currentArenaByMode) });
}

export function playRosterCompositions(format: PlayFormatId): readonly PlayRosterComposition[] {
  return COMPOSITIONS_BY_FORMAT[format];
}

export function playRosterModes(
  format: PlayFormatId,
  availability: PlayRosterAvailability,
): readonly GameModeType[] {
  return MODES_BY_FORMAT[format].filter(
    (mode) => availability.currentArenaByMode[mode] !== undefined,
  );
}

export function currentPlayRosterArena(
  mode: GameModeType,
  availability: PlayRosterAvailability,
): string | null {
  return availability.currentArenaByMode[mode] ?? null;
}

/**
 * Reconcile an in-progress presentation draft to a new server snapshot. A
 * changed active arena updates the read-only dependency; a removed mode backs
 * up to mode selection. The serializer remains the final compatibility gate.
 */
export function reconcilePlayRosterAvailability(
  state: PlayRosterBuilderState,
  availability: PlayRosterAvailability,
): PlayRosterBuilderState {
  if (state.mode === null) return state;
  const arenaName = currentPlayRosterArena(state.mode, availability);
  if (arenaName === null) {
    return Object.freeze({ ...state, mode: null, arenaName: null, fighterId: null });
  }
  if (state.arenaName === null || state.arenaName === arenaName) return state;
  return Object.freeze({ ...state, arenaName });
}

export function playRosterBuilderStep(state: PlayRosterBuilderState): PlayRosterBuilderStep {
  if (state.format === null) return 'format';
  if (state.composition === null) return 'composition';
  if (state.mode === null) return 'mode';
  if (state.arenaName === null) return 'arena';
  if (state.fighterId === null) return 'fighter';
  return 'review';
}

export function applyPlayRosterChoice(
  state: PlayRosterBuilderState,
  availability: PlayRosterAvailability,
  choice: PlayRosterChoice,
): PlayRosterBuilderState {
  const step = playRosterBuilderStep(state);
  if (choice.kind !== step) return state;

  if (choice.kind === 'format') {
    if (!isPlayFormat(choice.format)) return state;
    return Object.freeze({
      format: choice.format,
      composition: null,
      mode: null,
      arenaName: null,
      fighterId: null,
    });
  }

  if (choice.kind === 'composition') {
    if (state.format === null) return state;
    const composition = validComposition(choice.composition, state.format);
    if (composition === null) return state;
    return Object.freeze({ ...state, composition });
  }

  if (choice.kind === 'mode') {
    if (
      state.format === null ||
      !isGameMode(choice.mode) ||
      !playRosterModes(state.format, availability).includes(choice.mode)
    ) {
      return state;
    }
    return Object.freeze({ ...state, mode: choice.mode });
  }

  if (choice.kind === 'arena') {
    if (state.mode === null) return state;
    const arenaName = currentPlayRosterArena(state.mode, availability);
    return arenaName === null ? state : Object.freeze({ ...state, arenaName });
  }

  if (!isCharacter(choice.fighterId)) return state;
  return Object.freeze({ ...state, fighterId: choice.fighterId });
}

export function backPlayRosterBuilder(state: PlayRosterBuilderState): PlayRosterBuilderState {
  switch (playRosterBuilderStep(state)) {
    case 'format':
      return state;
    case 'composition':
      return EMPTY_PLAY_ROSTER_STATE;
    case 'mode':
      return Object.freeze({ ...state, composition: null });
    case 'arena':
      return Object.freeze({ ...state, mode: null });
    case 'fighter':
      return Object.freeze({ ...state, arenaName: null });
    case 'review':
      return Object.freeze({ ...state, fighterId: null });
  }
}

export function compositionLabel(composition: PlayRosterComposition): string {
  const humans = `${composition.humanCount} HUMAN${composition.humanCount === 1 ? '' : 'S'}`;
  if (composition.botCount === 0) return humans;
  return `${humans} + ${composition.botCount} BOT${composition.botCount === 1 ? '' : 'S'}`;
}

export function modeLabel(mode: GameModeType): string {
  return GAME_MODES[mode].displayName.toUpperCase();
}

export function fighterLabel(fighterId: CharacterId): string {
  return CHARACTERS[fighterId].displayName.toUpperCase();
}

export function serializePlayRosterDraft(
  value: unknown,
  availability: PlayRosterAvailability,
): SerializedPlayRosterDraft | null {
  if (!isRecord(value)) return null;
  const format = value['format'];
  const mode = value['mode'];
  const arenaName = value['arenaName'];
  const fighterId = value['fighterId'];
  if (!isPlayFormat(format) || !isGameMode(mode) || !isCharacter(fighterId)) return null;

  const composition = validComposition(value['composition'], format);
  if (composition === null || !MODES_BY_FORMAT[format].includes(mode)) return null;
  const currentArena = currentPlayRosterArena(mode, availability);
  if (currentArena === null || arenaName !== currentArena) return null;

  return Object.freeze({
    format,
    composition: Object.freeze({ ...composition }),
    mode,
    arenaName: currentArena,
    fighterId,
  });
}
