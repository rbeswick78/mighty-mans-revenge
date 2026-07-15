import { CHARACTER_IDS, GAME_MODE_ROTATION } from '@shared/config/game.js';
import { GameModeType } from '@shared/types/game.js';
import { describe, expect, it } from 'vitest';
import {
  EMPTY_PLAY_ROSTER_STATE,
  PLAY_FORMATS,
  applyPlayRosterChoice,
  backPlayRosterBuilder,
  compositionLabel,
  fighterLabel,
  modeLabel,
  normalizePlayRosterAvailability,
  playRosterBuilderStep,
  playRosterCompositions,
  playRosterModes,
  reconcilePlayRosterAvailability,
  serializePlayRosterDraft,
  type PlayFormatId,
  type PlayRosterBuilderState,
} from './play-roster-builder.js';

const ARENAS = Object.freeze(['Arena A', 'Arena B', 'Arena C']);
const completeAvailability = normalizePlayRosterAvailability(
  GAME_MODE_ROTATION.map((mode, index) => ({
    mode,
    arenaName: ARENAS[index % ARENAS.length],
  })),
  ARENAS,
);

function completeDraft(
  format: PlayFormatId,
  composition: Readonly<{ humanCount: number; botCount: number }>,
  mode: GameModeType,
  fighterId: (typeof CHARACTER_IDS)[number],
): PlayRosterBuilderState {
  let state = applyPlayRosterChoice(EMPTY_PLAY_ROSTER_STATE, completeAvailability, {
    kind: 'format',
    format,
  });
  state = applyPlayRosterChoice(state, completeAvailability, {
    kind: 'composition',
    composition,
  });
  state = applyPlayRosterChoice(state, completeAvailability, { kind: 'mode', mode });
  state = applyPlayRosterChoice(state, completeAvailability, { kind: 'arena' });
  return applyPlayRosterChoice(state, completeAvailability, { kind: 'fighter', fighterId });
}

describe('Play roster builder', () => {
  it('publishes only the three Batch 5 standard formats and frozen legal compositions', () => {
    expect(PLAY_FORMATS.map(({ id }) => id)).toEqual(['duel', 'rumble', 'crew']);
    expect(playRosterCompositions('duel')).toEqual([
      { humanCount: 1, botCount: 1 },
      { humanCount: 2, botCount: 0 },
    ]);
    expect(playRosterCompositions('rumble')).toHaveLength(9);
    expect(playRosterCompositions('crew')).toEqual([
      { humanCount: 1, botCount: 3 },
      { humanCount: 2, botCount: 2 },
      { humanCount: 3, botCount: 1 },
      { humanCount: 4, botCount: 0 },
    ]);
    for (const format of PLAY_FORMATS) {
      for (const composition of playRosterCompositions(format.id)) {
        expect(Object.isFrozen(composition)).toBe(true);
        const total = composition.humanCount + composition.botCount;
        if (format.id === 'duel') expect(total).toBe(2);
        if (format.id === 'rumble') expect(total).toBeGreaterThanOrEqual(2);
        if (format.id === 'rumble') expect(total).toBeLessThanOrEqual(4);
        if (format.id === 'crew') expect(total).toBe(4);
      }
    }
  });

  it('exhaustively selects and serializes every legal format/composition/mode/fighter product', () => {
    let combinations = 0;
    for (const format of PLAY_FORMATS) {
      for (const composition of playRosterCompositions(format.id)) {
        for (const mode of playRosterModes(format.id, completeAvailability)) {
          for (const fighterId of CHARACTER_IDS) {
            const state = completeDraft(format.id, composition, mode, fighterId);
            expect(playRosterBuilderStep(state)).toBe('review');
            expect(serializePlayRosterDraft(state, completeAvailability)).toEqual({
              format: format.id,
              composition,
              mode,
              arenaName: completeAvailability.currentArenaByMode[mode],
              fighterId,
            });
            combinations += 1;
          }
        }
      }
    }
    expect(combinations).toBe(624);
  });

  it('keeps Crew on its exhaustive four-mode allowlist while Duel and Rumble use all modes', () => {
    expect(playRosterModes('duel', completeAvailability)).toEqual(GAME_MODE_ROTATION);
    expect(playRosterModes('rumble', completeAvailability)).toEqual(GAME_MODE_ROTATION);
    expect(playRosterModes('crew', completeAvailability)).toEqual([
      'deathmatch',
      'koth',
      'kill_confirmed',
      'core_run',
    ]);
  });

  it('normalizes malformed, duplicate, unknown-mode, and unknown-arena schedules fail-closed', () => {
    const availability = normalizePlayRosterAvailability(
      [
        null,
        { mode: 'deathmatch', arenaName: 'Missing' },
        { mode: 'unknown', arenaName: 'Arena A' },
        { mode: 'koth', arenaName: 'Arena B' },
        { mode: 'koth', arenaName: 'Arena C' },
        'bad',
      ],
      ARENAS,
    );
    expect(availability.currentArenaByMode).toEqual({ koth: 'Arena B' });
    expect(playRosterModes('duel', availability)).toEqual(['koth']);
    expect(Object.isFrozen(availability)).toBe(true);
    expect(Object.isFrozen(availability.currentArenaByMode)).toBe(true);
  });

  it('rejects out-of-order, unknown, and format-incompatible choices without mutation', () => {
    const initial = EMPTY_PLAY_ROSTER_STATE;
    expect(
      applyPlayRosterChoice(initial, completeAvailability, {
        kind: 'composition',
        composition: { humanCount: 1, botCount: 1 },
      }),
    ).toBe(initial);
    expect(
      applyPlayRosterChoice(initial, completeAvailability, { kind: 'format', format: 'solo' }),
    ).toBe(initial);

    const crew = applyPlayRosterChoice(initial, completeAvailability, {
      kind: 'format',
      format: 'crew',
    });
    expect(
      applyPlayRosterChoice(crew, completeAvailability, {
        kind: 'composition',
        composition: { humanCount: 1, botCount: 1 },
      }),
    ).toBe(crew);

    const crewComposition = applyPlayRosterChoice(crew, completeAvailability, {
      kind: 'composition',
      composition: { humanCount: 1, botCount: 3 },
    });
    expect(
      applyPlayRosterChoice(crewComposition, completeAvailability, {
        kind: 'mode',
        mode: 'gun_game',
      }),
    ).toBe(crewComposition);
  });

  it('does not make a mode selectable when its current arena is absent', () => {
    const availability = normalizePlayRosterAvailability(
      [{ mode: 'deathmatch', arenaName: 'Arena A' }],
      ARENAS,
    );
    let state = applyPlayRosterChoice(EMPTY_PLAY_ROSTER_STATE, availability, {
      kind: 'format',
      format: 'duel',
    });
    state = applyPlayRosterChoice(state, availability, {
      kind: 'composition',
      composition: { humanCount: 1, botCount: 1 },
    });
    expect(playRosterModes('duel', availability)).toEqual(['deathmatch']);
    expect(applyPlayRosterChoice(state, availability, { kind: 'mode', mode: 'koth' })).toBe(state);
  });

  it('backs up one dependency at a time and clears the choice being edited', () => {
    const complete = completeDraft(
      'duel',
      { humanCount: 1, botCount: 1 },
      GameModeType.KOTH,
      'bruce',
    );
    const fighter = backPlayRosterBuilder(complete);
    expect(playRosterBuilderStep(fighter)).toBe('fighter');
    expect(fighter.fighterId).toBeNull();
    const arena = backPlayRosterBuilder(fighter);
    expect(playRosterBuilderStep(arena)).toBe('arena');
    expect(arena.arenaName).toBeNull();
    const mode = backPlayRosterBuilder(arena);
    expect(playRosterBuilderStep(mode)).toBe('mode');
    expect(mode.mode).toBeNull();
    const composition = backPlayRosterBuilder(mode);
    expect(playRosterBuilderStep(composition)).toBe('composition');
    expect(composition.composition).toBeNull();
    expect(backPlayRosterBuilder(composition)).toBe(EMPTY_PLAY_ROSTER_STATE);
    expect(backPlayRosterBuilder(EMPTY_PLAY_ROSTER_STATE)).toBe(EMPTY_PLAY_ROSTER_STATE);
  });

  it.each([
    ['not an object', null],
    ['unknown format', { format: 'solo' }],
    [
      'bad composition',
      {
        ...completeDraft('duel', { humanCount: 1, botCount: 1 }, GameModeType.DEATHMATCH, 'bruce'),
        composition: { humanCount: 1, botCount: 3 },
      },
    ],
    [
      'incompatible mode',
      {
        ...completeDraft('crew', { humanCount: 1, botCount: 3 }, GameModeType.DEATHMATCH, 'bruce'),
        mode: 'gun_game',
        arenaName: completeAvailability.currentArenaByMode.gun_game,
      },
    ],
    [
      'stale arena',
      {
        ...completeDraft('duel', { humanCount: 1, botCount: 1 }, GameModeType.DEATHMATCH, 'bruce'),
        arenaName: 'Arena C',
      },
    ],
    [
      'unknown fighter',
      {
        ...completeDraft('duel', { humanCount: 1, botCount: 1 }, GameModeType.DEATHMATCH, 'bruce'),
        fighterId: 'intruder',
      },
    ],
  ])('never serializes %s', (_name, value) => {
    expect(serializePlayRosterDraft(value, completeAvailability)).toBeNull();
  });

  it('invalidates a formerly valid draft if the injected schedule changes', () => {
    const state = completeDraft(
      'duel',
      { humanCount: 2, botCount: 0 },
      GameModeType.DEATHMATCH,
      'mighty_man',
    );
    const changedAvailability = normalizePlayRosterAvailability(
      [{ mode: 'deathmatch', arenaName: 'Arena C' }],
      ARENAS,
    );
    expect(serializePlayRosterDraft(state, changedAvailability)).toBeNull();
    const reconciled = reconcilePlayRosterAvailability(state, changedAvailability);
    expect(reconciled).toEqual({ ...state, arenaName: 'Arena C' });
    expect(serializePlayRosterDraft(reconciled, changedAvailability)?.arenaName).toBe('Arena C');
  });

  it('backs up to mode selection if server truth removes the selected mode', () => {
    const state = completeDraft(
      'duel',
      { humanCount: 2, botCount: 0 },
      GameModeType.DEATHMATCH,
      'mighty_man',
    );
    const kothOnly = normalizePlayRosterAvailability(
      [{ mode: 'koth', arenaName: 'Arena B' }],
      ARENAS,
    );
    expect(reconcilePlayRosterAvailability(state, kothOnly)).toEqual({
      ...state,
      mode: null,
      arenaName: null,
      fighterId: null,
    });
  });

  it('provides exhaustive presentation labels without changing policy', () => {
    expect(compositionLabel({ humanCount: 1, botCount: 1 })).toBe('1 HUMAN + 1 BOT');
    expect(compositionLabel({ humanCount: 4, botCount: 0 })).toBe('4 HUMANS');
    for (const mode of GAME_MODE_ROTATION) expect(modeLabel(mode).length).toBeGreaterThan(0);
    for (const fighterId of CHARACTER_IDS)
      expect(fighterLabel(fighterId).length).toBeGreaterThan(0);
  });
});
