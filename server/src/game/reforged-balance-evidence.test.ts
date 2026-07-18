import { describe, expect, it } from 'vitest';
import {
  CHARACTER_IDS,
  GAME_MODE_ROTATION,
  KOTH,
  MAP,
  MATCH,
  MATCH_COMPOSITIONS_BY_FORMAT,
  MATCH_FORMATS,
  MATCH_MODES_BY_FORMAT,
  GameModeType,
  MatchPhase,
  PickupType,
  createCollisionGrid,
  getMap,
  listMapNames,
} from '@shared/game';
import type { MapData, PlayerId, TeamId } from '@shared/game';
import { BotController } from './bot-controller.js';
import { Match } from './match.js';
import {
  buildReforgedBalanceEvidence,
  buildReforgedRegulationEvidence,
  REFORGED_BALANCE_CONTEXT,
} from './reforged-balance-evidence.js';

const LARGE_MAPS = listMapNames().map((name) => getMap(name, { largeWorlds: true }));

function participants(humanCount: number, botCount: number) {
  return [
    ...Array.from({ length: humanCount }, (_, index) => ({
      id: `human-${index}`,
      nickname: `Human ${index}`,
    })),
    ...Array.from({ length: botCount }, (_, index) => ({
      id: `bot:${index}`,
      nickname: `Bot ${index}`,
    })),
  ];
}

function teamsFor(ids: readonly PlayerId[]): ReadonlyMap<PlayerId, TeamId> {
  return new Map(ids.map((id, index) => [id, index < 2 ? 'blue' : 'red']));
}

function activate(match: Match): void {
  [...match.players.keys()].forEach((playerId, index) => {
    match.setLock(playerId, CHARACTER_IDS[index]);
  });
  match.update(0);
  match.update(MATCH.COUNTDOWN_DURATION);
  expect(match.phase).toBe(MatchPhase.ACTIVE);
}

function tileCenter(map: MapData, point: { x: number; y: number }) {
  return {
    x: (point.x + 0.5) * map.tileSize,
    y: (point.y + 0.5) * map.tileSize,
  };
}

function insideHill(map: MapData, position: { x: number; y: number }): boolean {
  const hill = map.kothHills![0];
  return (
    position.x >= hill.x * map.tileSize &&
    position.x <= (hill.x + KOTH.HILL_SIZE_TILES) * map.tileSize &&
    position.y >= hill.y * map.tileSize &&
    position.y <= (hill.y + KOTH.HILL_SIZE_TILES) * map.tileSize
  );
}

describe('Reforged cross-arena balance evidence', () => {
  it('enumerates every legal six-arena mode and composition product once', () => {
    const evidence = buildReforgedBalanceEvidence();
    const keys = evidence.products.map(
      (product) =>
        `${product.mapName}|${product.format}|${product.composition.humanCount}|${product.composition.botCount}|${product.mode}`,
    );

    expect(evidence.productCount).toBe(624);
    expect(new Set(keys).size).toBe(624);
    expect(new Set(evidence.products.map(({ mapName }) => mapName))).toEqual(
      new Set(listMapNames()),
    );
    expect(new Set(evidence.products.map(({ mode }) => mode))).toEqual(new Set(GAME_MODE_ROTATION));
    for (const format of MATCH_FORMATS) {
      const expectedPerMap =
        MATCH_COMPOSITIONS_BY_FORMAT[format].length * MATCH_MODES_BY_FORMAT[format].length;
      expect(evidence.products.filter((product) => product.format === format)).toHaveLength(
        expectedPerMap * LARGE_MAPS.length,
      );
    }
  });

  it('keeps cross-arena route, contest, pickup, and interaction pacing bounded', () => {
    const evidence = buildReforgedBalanceEvidence();
    expect(REFORGED_BALANCE_CONTEXT).toEqual({
      tileSize: MAP.TILE_SIZE,
      baseSpeed: 200,
      regulationSeconds: 173,
      hillMoveSeconds: 25,
    });

    for (const arena of evidence.arenas) {
      expect(
        arena.minimumSpawnPathTiles,
        `${arena.mapName} spawn separation`,
      ).toBeGreaterThanOrEqual(17);
      expect(arena.maximumArenaTravelSeconds, `${arena.mapName} path diameter`).toBeLessThanOrEqual(
        14,
      );
      expect(arena.maximumKothTravelSeconds, `${arena.mapName} KOTH travel`).toBeLessThanOrEqual(
        11,
      );
      expect(
        arena.maximumKothContestSpreadSeconds,
        `${arena.mapName} KOTH contest spread`,
      ).toBeLessThanOrEqual(8);
      expect(arena.maximumCoreTravelSeconds, `${arena.mapName} Core travel`).toBeLessThanOrEqual(6);
      expect(arena.coreContestSpreadSeconds, `${arena.mapName} Core fairness`).toBe(0);
      expect(
        arena.maximumNearestPickupTravelSeconds,
        `${arena.mapName} pickup access`,
      ).toBeLessThanOrEqual(3.5);
      expect(arena.pickupDensityPerHundredWalkableTiles).toBeGreaterThanOrEqual(1.3);
      expect(arena.pickupDensityPerHundredWalkableTiles).toBeLessThanOrEqual(1.5);
      expect(arena.maximumGateTravelSeconds, `${arena.mapName} gate access`).toBeLessThanOrEqual(
        8.5,
      );
      expect(
        arena.maximumHazardTravelSeconds,
        `${arena.mapName} barrel access`,
      ).toBeLessThanOrEqual(9);
      expect(arena.destructibleCoverTiles).toBeGreaterThanOrEqual(20);
      expect(arena.shootableGates).toBeGreaterThanOrEqual(2);
      expect(arena.explosiveBarrels).toBe(2);
    }
  });

  it('preserves mode-owned pickup economies across all six successors', () => {
    const evidence = buildReforgedBalanceEvidence();
    expect(
      Object.fromEntries(evidence.modes.map((mode) => [mode.mode, mode.enabledPickupCount])),
    ).toEqual({
      deathmatch: 10,
      koth: 10,
      gun_game: 2,
      last_stand: 10,
      kill_confirmed: 10,
      one_in_the_chamber: 2,
      core_run: 7,
      bounty_hunt: 10,
    });
  });

  it('starts every legal product on authoritative regulation state without wall-clock timing', () => {
    const evidence = buildReforgedBalanceEvidence();
    for (const product of evidence.products) {
      const entries = participants(product.composition.humanCount, product.composition.botCount);
      const playerTeams =
        product.format === 'crew' ? teamsFor(entries.map(({ id }) => id)) : new Map();
      const match = new Match(
        `balance-${product.mapName}-${product.format}-${product.mode}-${product.composition.humanCount}-${product.composition.botCount}`,
        getMap(product.mapName, { largeWorlds: true }),
        entries,
        product.mode,
        () => 0.5,
        [],
        undefined,
        undefined,
        undefined,
        undefined,
        new Map(),
        playerTeams,
      );
      activate(match);

      expect(match.players.size).toBe(product.participantCount);
      expect(match.gameModeType).toBe(product.mode);
      expect(match.matchTimer).toBe(MATCH.TIME_LIMIT);
      expect(match.mapManager.getMapData().authoring?.profile).toBe('standard-40x24');
      expect(match.pickupManager.getPickups()).toHaveLength(
        evidence.modes.find(({ mode }) => mode === product.mode)!.enabledPickupCount,
      );
      if (product.format === 'crew') {
        expect(
          [...match.players.keys()].filter((id) => match.getTeamId(id) === 'blue'),
        ).toHaveLength(2);
        expect(
          [...match.players.keys()].filter((id) => match.getTeamId(id) === 'red'),
        ).toHaveLength(2);
      }

      const controllers = entries
        .filter(({ id }) => id.startsWith('bot:'))
        .map(({ id }) => new BotController(id));
      for (let tick = 1; tick <= 4; tick++) {
        for (const controller of controllers) controller.update(0.05, match, tick);
        match.update(0.05);
      }
      for (const controller of controllers) {
        const bot = match.players.get(controller.playerId)!;
        expect(bot.lastProcessedInput).toBe(4);
        expect(Number.isFinite(bot.position.x) && Number.isFinite(bot.position.y)).toBe(true);
      }
    }
  });

  it('completes every arena and mode at 20 Hz with active bots', () => {
    const regulations = buildReforgedRegulationEvidence();
    expect(regulations).toHaveLength(LARGE_MAPS.length * GAME_MODE_ROTATION.length);
    expect(new Set(regulations.map(({ mapName, mode }) => `${mapName}|${mode}`)).size).toBe(48);
    for (const regulation of regulations) {
      expect(regulation.phase, `${regulation.mapName} ${regulation.mode} phase`).toBe(
        MatchPhase.ENDED,
      );
      expect(regulation.simulatedSeconds).toBeLessThanOrEqual(MATCH.TIME_LIMIT);
      expect(regulation.wentToOvertime).toBe(false);
      expect(
        regulation.shotsFired,
        `${regulation.mapName} ${regulation.mode} activity`,
      ).toBeGreaterThan(0);
      expect(regulation.botRecoveries).toBeGreaterThanOrEqual(0);
    }
  });

  it('routes a bot from every spawn to the live KOTH contest on every successor', () => {
    for (const map of LARGE_MAPS) {
      for (const spawn of map.spawnPoints) {
        const match = new Match(
          `balance-koth-${map.name}-${spawn.id}`,
          map,
          [
            { id: 'human', nickname: 'Human' },
            { id: 'bot:rusty', nickname: 'Rusty' },
          ],
          GameModeType.KOTH,
          () => 0.5,
        );
        activate(match);
        const human = match.players.get('human')!;
        const bot = match.players.get('bot:rusty')!;
        human.health = 100_000;
        human.maxHealth = 100_000;
        human.position = tileCenter(map, map.spawnPoints.find((point) => point !== spawn)!);
        bot.position = tileCenter(map, spawn);
        const controller = new BotController(bot.id);

        for (let tick = 1; tick <= 300 && !insideHill(map, bot.position); tick++) {
          controller.update(0.05, match, tick);
          match.update(0.05);
        }

        expect(
          insideHill(map, bot.position),
          `${map.name} ${spawn.id} KOTH route ended at ${bot.position.x.toFixed(1)},${bot.position.y.toFixed(1)}`,
        ).toBe(true);
        if (map.name === 'Overgrown Suburb' && spawn.id === 'spawn-north-east') {
          expect(controller.getRecoveryCount()).toBeGreaterThan(0);
        }
      }
    }
  });

  it('routes bots into Core Run and Kill Confirmed objectives on every successor', () => {
    for (const map of LARGE_MAPS) {
      const coreMatch = new Match(
        `balance-core-${map.name}`,
        map,
        [
          { id: 'human', nickname: 'Human' },
          { id: 'bot:rusty', nickname: 'Rusty' },
        ],
        GameModeType.CORE_RUN,
        () => 0.5,
      );
      activate(coreMatch);
      const coreHuman = coreMatch.players.get('human')!;
      const coreBot = coreMatch.players.get('bot:rusty')!;
      coreHuman.isDead = true;
      coreBot.position = tileCenter(map, map.spawnPoints[0]);
      const coreController = new BotController(coreBot.id);
      for (
        let tick = 1;
        tick <= 300 && coreMatch.getCoreRunState()?.carrierId !== coreBot.id;
        tick++
      ) {
        coreController.update(0.05, coreMatch, tick);
        coreMatch.update(0.05);
      }
      expect(coreMatch.getCoreRunState()?.carrierId, `${map.name} Core Run pickup`).toBe(
        coreBot.id,
      );

      const tagMatch = new Match(
        `balance-tag-${map.name}`,
        map,
        [
          { id: 'human', nickname: 'Human' },
          { id: 'bot:rusty', nickname: 'Rusty' },
        ],
        GameModeType.KILL_CONFIRMED,
        () => 0.5,
      );
      activate(tagMatch);
      const tagHuman = tagMatch.players.get('human')!;
      const tagBot = tagMatch.players.get('bot:rusty')!;
      tagBot.position = tileCenter(map, map.spawnPoints[0]);
      tagHuman.position = tileCenter(map, map.spawnPoints[1]);
      tagMatch.onKill(tagBot.id, tagHuman.id, 'gun');
      const tagController = new BotController(tagBot.id);
      for (let tick = 1; tick <= 300 && tagBot.score === 0; tick++) {
        tagController.update(0.05, tagMatch, tick);
        tagMatch.update(0.05);
      }
      expect(tagBot.score, `${map.name} Kill Confirmed collection`).toBe(1);
    }
  });

  it('collects useful pickups on every successor', () => {
    for (const map of LARGE_MAPS) {
      const match = new Match(
        `balance-pickup-${map.name}`,
        map,
        [
          { id: 'human', nickname: 'Human' },
          { id: 'bot:rusty', nickname: 'Rusty' },
        ],
        GameModeType.DEATHMATCH,
        () => 0.5,
      );
      activate(match);
      const human = match.players.get('human')!;
      const bot = match.players.get('bot:rusty')!;
      human.health = 100_000;
      human.maxHealth = 100_000;
      bot.health = 40;
      const bandage = match.pickupManager
        .getPickups()
        .find((pickup) => pickup.type === PickupType.BANDAGE)!;
      const grid = createCollisionGrid(map);
      const bandageTile = {
        x: Math.floor(bandage.position.x / map.tileSize),
        y: Math.floor(bandage.position.y / map.tileSize),
      };
      const approach = [
        { x: bandageTile.x - 1, y: bandageTile.y },
        { x: bandageTile.x + 1, y: bandageTile.y },
        { x: bandageTile.x, y: bandageTile.y - 1 },
        { x: bandageTile.x, y: bandageTile.y + 1 },
      ].find(({ x, y }) => !grid.solid[y]?.[x])!;
      bot.position = tileCenter(map, approach);
      const controller = new BotController(bot.id);
      for (let tick = 1; tick <= 40 && bot.health === 40; tick++) {
        controller.update(0.05, match, tick);
        match.update(0.05);
      }
      expect(bot.health, `${map.name} pickup use`).toBeGreaterThan(40);
    }
  });

  it('recovers KOTH navigation after an authoritative respawn on every successor', () => {
    for (const map of LARGE_MAPS) {
      const match = new Match(
        `balance-recovery-${map.name}`,
        map,
        [
          { id: 'human', nickname: 'Human' },
          { id: 'bot:rusty', nickname: 'Rusty' },
        ],
        GameModeType.KOTH,
        () => 0.5,
      );
      activate(match);
      const human = match.players.get('human')!;
      const bot = match.players.get('bot:rusty')!;
      human.health = 100_000;
      human.maxHealth = 100_000;
      const controller = new BotController(bot.id);
      match.onKill(human.id, bot.id, 'gun');
      match.update(3.1);
      expect(bot.isDead, `${map.name} respawn`).toBe(false);
      for (let tick = 41; tick <= 400 && !insideHill(map, bot.position); tick++) {
        controller.update(0.05, match, tick);
        match.update(0.05);
      }
      expect(insideHill(map, bot.position), `${map.name} recovered KOTH route`).toBe(true);
      const grid = createCollisionGrid(map);
      expect(
        grid.solid[Math.floor(bot.position.y / map.tileSize)][
          Math.floor(bot.position.x / map.tileSize)
        ],
      ).toBe(false);
    }
  });
});
