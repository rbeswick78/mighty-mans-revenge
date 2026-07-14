import { describe, it, expect } from 'vitest';
import {
  CHARACTERS,
  CHARACTER_IDS,
  WEAPONS,
  WEAPON_IDS,
  PICKUP,
  PLAYER,
  ABILITY,
  KILL_WEAPONS,
  GAME_MODES,
  GAME_MODE_ROTATION,
  BOT,
  BOT_TACTICS,
  SCRAP_PIT_RIVALS,
  RUMBLE,
  CREW_BATTLE_MODES,
  PRACTICE_KINDS,
  getNextGameMode,
  getNextCrewBattleMode,
  isCrewBattleMode,
  crewBattleObjective,
  crewBattleScoreUnit,
  gameModeDisplayName,
  characterMaxHealth,
  characterSpeedMultiplier,
  characterHitbox,
  KOTH,
  OVERTIME,
  MATCH,
  AWARD_DEFS,
  AWARD_IDS,
  AWARDS,
  DAILY_GAUNTLET_LEADERBOARD,
  LEADERBOARD,
  MATCH_CONTRACTS,
  COMBAT_MEDALS,
  TAUNT,
  TAUNTS,
  TAUNT_IDS,
  isTauntId,
  CAREER_RANKS,
  careerRankProgressForContracts,
  CHARACTER_MASTERY_TIERS,
  ARENA_MASTERY_TIERS,
  MUTATORS,
  ONE_IN_THE_CHAMBER,
  CORE_RUN,
  BOUNTY_HUNT,
  characterMasteryProgressForWins,
  arenaMasteryProgressForWins,
  createEmptyCharacterWins,
  selectMatchContract,
  SCAVENGER_CACHE,
  selectScavengerCacheReward,
  type CharacterId,
  type WeaponId,
} from './game.js';
import { GameModeType } from '../types/game.js';
import { PickupType } from '../types/pickup.js';
import { DEATH_DIRECTIONS, DIRECTIONS, type CharacterDef } from '../types/character.js';
import type { WeaponDef } from '../types/weapon.js';

describe('wasteland taunts', () => {
  it('keeps a small frozen registry with safe, unique display copy', () => {
    expect(Object.isFrozen(TAUNTS)).toBe(true);
    expect(Object.isFrozen(TAUNT_IDS)).toBe(true);
    expect(TAUNT_IDS).toHaveLength(4);
    const copy = TAUNT_IDS.map((id) => TAUNTS[id].text);
    expect(new Set(copy).size).toBe(copy.length);
    expect(copy.every((line) => line.length > 0 && line.length <= 18)).toBe(true);
    expect(TAUNT.COOLDOWN_SECONDS).toBeGreaterThan(TAUNT.DISPLAY_MS / 1000);
  });

  it('narrows only own registry keys', () => {
    expect(isTauntId('bring_it')).toBe(true);
    expect(isTauntId('toString')).toBe(false);
    expect(isTauntId('not-a-taunt')).toBe(false);
    expect(isTauntId(null)).toBe(false);
  });
});

describe('game mode rotation', () => {
  it('rotation covers every GameModeType exactly once', () => {
    const allModes = Object.values(GameModeType).sort();
    expect([...GAME_MODE_ROTATION].sort()).toEqual(allModes);
  });

  it('getNextGameMode cycles every mode and wraps to DM', () => {
    expect(getNextGameMode(GameModeType.DEATHMATCH)).toBe(GameModeType.KOTH);
    expect(getNextGameMode(GameModeType.KOTH)).toBe(GameModeType.GUN_GAME);
    expect(getNextGameMode(GameModeType.GUN_GAME)).toBe(GameModeType.LAST_STAND);
    expect(getNextGameMode(GameModeType.LAST_STAND)).toBe(GameModeType.KILL_CONFIRMED);
    expect(getNextGameMode(GameModeType.KILL_CONFIRMED)).toBe(GameModeType.ONE_IN_THE_CHAMBER);
    expect(getNextGameMode(GameModeType.ONE_IN_THE_CHAMBER)).toBe(GameModeType.CORE_RUN);
    expect(getNextGameMode(GameModeType.CORE_RUN)).toBe(GameModeType.BOUNTY_HUNT);
    expect(getNextGameMode(GameModeType.BOUNTY_HUNT)).toBe(GameModeType.DEATHMATCH);
  });

  it('restarts the cycle for unknown values instead of throwing', () => {
    expect(getNextGameMode('bogus' as GameModeType)).toBe(GAME_MODE_ROTATION[0]);
  });

  it('every mode has display and countdown briefing copy', () => {
    for (const mode of GAME_MODE_ROTATION) {
      expect(GAME_MODES[mode].displayName.length).toBeGreaterThan(0);
      expect(GAME_MODES[mode].objective.length).toBeGreaterThan(0);
      expect(gameModeDisplayName(mode)).toBe(GAME_MODES[mode].displayName);
    }
    expect(gameModeDisplayName(GameModeType.KOTH)).toBe('KING OF THE HILL');
    expect(gameModeDisplayName(GameModeType.LAST_STAND)).toBe('LAST STAND');
    expect(gameModeDisplayName(GameModeType.KILL_CONFIRMED)).toBe('KILL CONFIRMED');
    expect(gameModeDisplayName(GameModeType.ONE_IN_THE_CHAMBER)).toBe('ONE IN THE CHAMBER');
    expect(gameModeDisplayName(GameModeType.CORE_RUN)).toBe('CORE RUN');
    expect(gameModeDisplayName(GameModeType.BOUNTY_HUNT)).toBe('BOUNTY HUNT');
  });
});

describe('Crew Battle mode rotation', () => {
  it('contains only explicitly team-aware objectives and wraps', () => {
    expect(CREW_BATTLE_MODES).toEqual([
      GameModeType.DEATHMATCH,
      GameModeType.KOTH,
      GameModeType.KILL_CONFIRMED,
      GameModeType.CORE_RUN,
    ]);
    expect(Object.isFrozen(CREW_BATTLE_MODES)).toBe(true);
    expect(getNextCrewBattleMode(GameModeType.DEATHMATCH)).toBe(GameModeType.KOTH);
    expect(getNextCrewBattleMode(GameModeType.CORE_RUN)).toBe(GameModeType.DEATHMATCH);
    expect(getNextCrewBattleMode(GameModeType.GUN_GAME)).toBe(GameModeType.DEATHMATCH);
  });

  it('provides compact team-specific objective copy for every compatible mode', () => {
    for (const mode of CREW_BATTLE_MODES) {
      expect(isCrewBattleMode(mode)).toBe(true);
      expect(crewBattleObjective(mode)).toMatch(/CREW|ALLIES/);
      expect(crewBattleObjective(mode).length).toBeLessThanOrEqual(48);
      expect(crewBattleScoreUnit(mode)).toMatch(/^(KOs|PTS|TAGS|SEC)$/);
    }
    expect(isCrewBattleMode(GameModeType.GUN_GAME)).toBe(false);
  });
});

describe('one in the chamber mode', () => {
  it('defines one starting round and a positive score target', () => {
    expect(ONE_IN_THE_CHAMBER.CHAMBERED_ROUNDS).toBe(1);
    expect(ONE_IN_THE_CHAMBER.SCORE_TARGET).toBeGreaterThan(0);
    expect(Object.isFrozen(ONE_IN_THE_CHAMBER)).toBe(true);
  });
});

describe('core run mode', () => {
  it('defines a frozen positive target, pickup radius, and return timer', () => {
    expect(Object.isFrozen(CORE_RUN)).toBe(true);
    expect(CORE_RUN.SCORE_TARGET).toBeGreaterThan(0);
    expect(CORE_RUN.COLLECT_RADIUS).toBeGreaterThan(0);
    expect(CORE_RUN.RETURN_SECONDS).toBeGreaterThan(0);
  });
});

describe('bounty hunt mode', () => {
  it('defines a frozen 1/2/3 score economy and positive target', () => {
    expect(Object.isFrozen(BOUNTY_HUNT)).toBe(true);
    expect(BOUNTY_HUNT.SCORE_TARGET).toBeGreaterThan(0);
    expect(BOUNTY_HUNT.ORDINARY_KILL_POINTS).toBe(1);
    expect(BOUNTY_HUNT.TARGET_RETALIATION_POINTS).toBe(2);
    expect(BOUNTY_HUNT.BOUNTY_KILL_POINTS).toBe(3);
  });
});

describe('weapon roulette mutator', () => {
  it('cycles through every core weapon exactly once on a positive cadence', () => {
    expect(MUTATORS.WEAPON_ROULETTE_INTERVAL_SECONDS).toBeGreaterThan(0);
    expect(MUTATORS.WEAPON_ROULETTE_ORDER).toEqual(['shotgun', 'pistol', 'punch', 'rifle']);
    expect(new Set(MUTATORS.WEAPON_ROULETTE_ORDER)).toEqual(
      new Set(WEAPON_IDS.filter((id) => id !== 'bat')),
    );
    expect(Object.isFrozen(MUTATORS.WEAPON_ROULETTE_ORDER)).toBe(true);
  });
});

describe('radiation storm mutator', () => {
  it('defines a positive nonlethal pulse and shrinking-zone cadence', () => {
    expect(MUTATORS.POOL).toContain('radiation_storm');
    expect(MUTATORS.RADIATION_STORM_SHRINK_SECONDS).toBeGreaterThan(0);
    expect(MUTATORS.RADIATION_STORM_FINAL_RADIUS_PX).toBeGreaterThan(0);
    expect(MUTATORS.RADIATION_STORM_DAMAGE_PER_PULSE).toBeGreaterThan(0);
    expect(MUTATORS.RADIATION_STORM_PULSE_SECONDS).toBeGreaterThan(0);
  });
});

describe('scrapstorm mutator', () => {
  it('defines a readable nonlethal strike cadence', () => {
    expect(MUTATORS.POOL).toContain('scrapstorm');
    expect(MUTATORS.SCRAPSTORM_FIRST_WARNING_DELAY_SECONDS).toBeGreaterThan(0);
    expect(MUTATORS.SCRAPSTORM_WARNING_SECONDS).toBeGreaterThan(1);
    expect(MUTATORS.SCRAPSTORM_INTERVAL_SECONDS).toBeGreaterThan(
      MUTATORS.SCRAPSTORM_WARNING_SECONDS,
    );
    expect(MUTATORS.SCRAPSTORM_RADIUS_PX).toBeGreaterThan(0);
    expect(MUTATORS.SCRAPSTORM_DAMAGE).toBeGreaterThan(0);
  });
});

describe('blood rush mutator', () => {
  it('defines a meaningful positive kill-triggered speed window', () => {
    expect(MUTATORS.POOL).toContain('blood_rush');
    expect(MUTATORS.BLOOD_RUSH_SPEED_MULTIPLIER).toBeGreaterThan(1);
    expect(MUTATORS.BLOOD_RUSH_DURATION_SECONDS).toBeGreaterThan(0);
  });
});

describe('ability overdrive mutator', () => {
  it('defines a noticeable shared cooldown acceleration', () => {
    expect(MUTATORS.POOL).toContain('ability_overdrive');
    expect(MUTATORS.ABILITY_OVERDRIVE_RECHARGE_MULTIPLIER).toBe(3);
  });
});

describe('overcharge pickup', () => {
  it('defines a meaningful spent-cooldown gate and contested respawn', () => {
    expect(PICKUP.OVERCHARGE_MIN_COOLDOWN_SECONDS).toBeGreaterThan(0);
    expect(PICKUP.OVERCHARGE_RESPAWN_TIME).toBeGreaterThan(PICKUP.OVERCHARGE_MIN_COOLDOWN_SECONDS);
  });
});

describe('scavenger cache rewards', () => {
  it('uses a frozen weighted table with every collectible pickup kind', () => {
    expect(Object.isFrozen(SCAVENGER_CACHE)).toBe(true);
    expect(Object.isFrozen(SCAVENGER_CACHE.LOOT_TABLE)).toBe(true);
    expect(new Set(SCAVENGER_CACHE.LOOT_TABLE)).toEqual(new Set(Object.values(PickupType)));
  });

  it('selects one deterministic reward from only mode-enabled types', () => {
    const first = selectScavengerCacheReward('cache-match');
    expect(selectScavengerCacheReward('cache-match')).toBe(first);

    expect(
      selectScavengerCacheReward('gun-game-cache', (type) => type === PickupType.BANDAGE),
    ).toBe(PickupType.BANDAGE);
  });
});

describe('wasteland match contracts', () => {
  it('defines frozen, achievable positive targets', () => {
    expect(Object.isFrozen(MATCH_CONTRACTS)).toBe(true);
    for (const contract of Object.values(MATCH_CONTRACTS)) {
      expect(contract.title.length).toBeGreaterThan(0);
      expect(contract.objective.length).toBeGreaterThan(0);
      expect(contract.target).toBeGreaterThan(0);
      expect(Object.isFrozen(contract)).toBe(true);
    }
  });

  it('selects deterministically without consuming gameplay RNG', () => {
    const first = selectMatchContract('match-24', GameModeType.DEATHMATCH);
    expect(selectMatchContract('match-24', GameModeType.DEATHMATCH)).toBe(first);
  });

  it('allows a valid smoke-test pin and ignores an unknown pin', () => {
    expect(selectMatchContract('anything', GameModeType.DEATHMATCH, 'powder_keg').id).toBe(
      'powder_keg',
    );
    expect(selectMatchContract('anything', GameModeType.DEATHMATCH, 'not-real').id).not.toBe(
      'not-real',
    );
  });

  it('prevents an immediate rematch repeat unless a smoke pin forces it', () => {
    const previous = selectMatchContract('previous', GameModeType.DEATHMATCH);
    const next = selectMatchContract('rematch', GameModeType.DEATHMATCH, undefined, previous.id);
    expect(next.id).not.toBe(previous.id);
    expect(
      selectMatchContract('rematch', GameModeType.DEATHMATCH, previous.id, previous.id).id,
    ).toBe(previous.id);
  });

  it('adds objective-specific contracts only to compatible mode pools', () => {
    const kothIds = new Set(
      Array.from({ length: 100 }, (_, i) => selectMatchContract(`koth-${i}`, GameModeType.KOTH).id),
    );
    const confirmedIds = new Set(
      Array.from(
        { length: 100 },
        (_, i) => selectMatchContract(`confirmed-${i}`, GameModeType.KILL_CONFIRMED).id,
      ),
    );
    const coreIds = new Set(
      Array.from(
        { length: 100 },
        (_, i) => selectMatchContract(`core-${i}`, GameModeType.CORE_RUN).id,
      ),
    );
    const dmIds = new Set(
      Array.from(
        { length: 100 },
        (_, i) => selectMatchContract(`dm-${i}`, GameModeType.DEATHMATCH).id,
      ),
    );
    const gunGameIds = new Set(
      Array.from(
        { length: 100 },
        (_, i) => selectMatchContract(`gun-game-${i}`, GameModeType.GUN_GAME).id,
      ),
    );
    const chamberIds = new Set(
      Array.from(
        { length: 100 },
        (_, i) => selectMatchContract(`chamber-${i}`, GameModeType.ONE_IN_THE_CHAMBER).id,
      ),
    );
    expect(kothIds).toContain('hill_dweller');
    expect(confirmedIds).toContain('tag_hunter');
    expect(coreIds).toContain('core_runner');
    expect(dmIds).not.toContain('hill_dweller');
    expect(dmIds).not.toContain('tag_hunter');
    expect(dmIds).not.toContain('core_runner');
    expect(dmIds).toContain('power_trip');
    expect(gunGameIds).not.toContain('power_trip');
    expect(chamberIds).not.toContain('power_trip');
  });
});

describe('combat medals', () => {
  it('defines frozen, positive, strictly escalating rapid-kill thresholds', () => {
    expect(Object.isFrozen(COMBAT_MEDALS)).toBe(true);
    expect(COMBAT_MEDALS.RAPID_KILL_WINDOW_SECONDS).toBeGreaterThan(0);
    expect(COMBAT_MEDALS.DOUBLE_KILL_COUNT).toBe(2);
    expect(COMBAT_MEDALS.TRIPLE_KILL_COUNT).toBeGreaterThan(COMBAT_MEDALS.DOUBLE_KILL_COUNT);
    expect(COMBAT_MEDALS.MAYHEM_COUNT).toBeGreaterThan(COMBAT_MEDALS.TRIPLE_KILL_COUNT);
    expect(COMBAT_MEDALS.CLUTCH_HEALTH_FRACTION).toBeGreaterThan(0);
    expect(COMBAT_MEDALS.CLUTCH_HEALTH_FRACTION).toBeLessThan(1);
  });
});

describe('Scavenger Rush', () => {
  it('defines a frozen mutator with a non-overlapping supply cadence', () => {
    expect(Object.isFrozen(MUTATORS)).toBe(true);
    expect(MUTATORS.POOL).toContain('scavenger_rush');
    expect(MUTATORS.SCAVENGER_RUSH_DROP_LIFETIME_SECONDS).toBeGreaterThan(0);
    expect(MUTATORS.SCAVENGER_RUSH_DROP_INTERVAL_SECONDS).toBeGreaterThan(
      MUTATORS.SCAVENGER_RUSH_DROP_LIFETIME_SECONDS,
    );
  });
});

describe('wasteland reputation', () => {
  it('defines a frozen, ordered ladder with unique three-letter badges', () => {
    expect(Object.isFrozen(CAREER_RANKS)).toBe(true);
    expect(CAREER_RANKS[0].minContracts).toBe(0);
    expect(new Set(CAREER_RANKS.map((rank) => rank.id)).size).toBe(CAREER_RANKS.length);
    expect(new Set(CAREER_RANKS.map((rank) => rank.badge)).size).toBe(CAREER_RANKS.length);
    for (let i = 0; i < CAREER_RANKS.length; i++) {
      expect(Object.isFrozen(CAREER_RANKS[i])).toBe(true);
      expect(CAREER_RANKS[i].badge).toHaveLength(3);
      if (i > 0) {
        expect(CAREER_RANKS[i].minContracts).toBeGreaterThan(CAREER_RANKS[i - 1].minContracts);
      }
    }
  });

  it('changes rank exactly at every threshold and reports the next milestone', () => {
    for (let i = 0; i < CAREER_RANKS.length; i++) {
      const rank = CAREER_RANKS[i];
      const atThreshold = careerRankProgressForContracts(rank.minContracts);
      expect(atThreshold.current).toBe(rank);
      expect(atThreshold.next).toBe(CAREER_RANKS[i + 1] ?? null);
      expect(atThreshold.remaining).toBe(
        atThreshold.next ? atThreshold.next.minContracts - rank.minContracts : 0,
      );
      if (rank.minContracts > 0) {
        expect(careerRankProgressForContracts(rank.minContracts - 1).current).toBe(
          CAREER_RANKS[i - 1],
        );
      }
    }
  });

  it('normalizes fractional, negative, and non-finite totals safely', () => {
    expect(careerRankProgressForContracts(8.9).completed).toBe(8);
    expect(careerRankProgressForContracts(-4).completed).toBe(0);
    expect(careerRankProgressForContracts(Number.NaN).completed).toBe(0);
    expect(careerRankProgressForContracts(Number.POSITIVE_INFINITY).completed).toBe(0);
  });
});

describe('fighter mastery', () => {
  it('defines a frozen ordered tier ladder beginning at zero wins', () => {
    expect(Object.isFrozen(CHARACTER_MASTERY_TIERS)).toBe(true);
    expect(CHARACTER_MASTERY_TIERS[0].minWins).toBe(0);
    for (let i = 0; i < CHARACTER_MASTERY_TIERS.length; i++) {
      expect(Object.isFrozen(CHARACTER_MASTERY_TIERS[i])).toBe(true);
      if (i > 0) {
        expect(CHARACTER_MASTERY_TIERS[i].minWins).toBeGreaterThan(
          CHARACTER_MASTERY_TIERS[i - 1].minWins,
        );
      }
    }
  });

  it('changes tier exactly at every threshold and reports the next target', () => {
    for (let i = 0; i < CHARACTER_MASTERY_TIERS.length; i++) {
      const tier = CHARACTER_MASTERY_TIERS[i];
      const progress = characterMasteryProgressForWins(tier.minWins);
      expect(progress.current).toBe(tier);
      expect(progress.next).toBe(CHARACTER_MASTERY_TIERS[i + 1] ?? null);
      if (tier.minWins > 0) {
        expect(characterMasteryProgressForWins(tier.minWins - 1).current).toBe(
          CHARACTER_MASTERY_TIERS[i - 1],
        );
      }
    }
  });

  it('normalizes invalid wins and creates a complete zeroed roster record', () => {
    expect(characterMasteryProgressForWins(7.9).wins).toBe(7);
    expect(characterMasteryProgressForWins(-2).wins).toBe(0);
    expect(characterMasteryProgressForWins(Number.NaN).wins).toBe(0);
    expect(createEmptyCharacterWins()).toEqual(
      Object.fromEntries(CHARACTER_IDS.map((id) => [id, 0])),
    );
  });
});

describe('arena mastery', () => {
  it('defines a frozen ordered battlefield ladder beginning at zero wins', () => {
    expect(Object.isFrozen(ARENA_MASTERY_TIERS)).toBe(true);
    expect(ARENA_MASTERY_TIERS[0]).toMatchObject({ title: 'UNCHARTED', minWins: 0 });
    expect(ARENA_MASTERY_TIERS[ARENA_MASTERY_TIERS.length - 1]).toMatchObject({
      title: 'HOME TURF',
      minWins: 15,
    });
    for (let i = 0; i < ARENA_MASTERY_TIERS.length; i++) {
      expect(Object.isFrozen(ARENA_MASTERY_TIERS[i])).toBe(true);
      if (i > 0) {
        expect(ARENA_MASTERY_TIERS[i].minWins).toBeGreaterThan(ARENA_MASTERY_TIERS[i - 1].minWins);
      }
    }
  });

  it('changes tier at each threshold and normalizes invalid totals', () => {
    for (let i = 0; i < ARENA_MASTERY_TIERS.length; i++) {
      const tier = ARENA_MASTERY_TIERS[i];
      const progress = arenaMasteryProgressForWins(tier.minWins);
      expect(progress.current).toBe(tier);
      expect(progress.next).toBe(ARENA_MASTERY_TIERS[i + 1] ?? null);
    }
    expect(arenaMasteryProgressForWins(7.9).wins).toBe(7);
    expect(arenaMasteryProgressForWins(-2).wins).toBe(0);
    expect(arenaMasteryProgressForWins(Number.NaN).wins).toBe(0);
  });
});

describe('KOTH and overtime tuning', () => {
  it('hill cadence fits the match: several relocations per match, warning inside the interval', () => {
    expect(KOTH.HILL_MOVE_WARNING).toBeLessThan(KOTH.HILL_MOVE_INTERVAL);
    expect(MATCH.TIME_LIMIT / KOTH.HILL_MOVE_INTERVAL).toBeGreaterThanOrEqual(3);
  });

  it('the score target is reachable within the match clock', () => {
    // 1 point/second of sole occupancy — the target must fit inside the
    // total match time or nobody could ever win by score.
    expect(KOTH.SCORE_TARGET).toBeLessThan(MATCH.TIME_LIMIT);
  });

  it('overtime is short and positive', () => {
    expect(OVERTIME.DURATION).toBeGreaterThan(0);
    expect(OVERTIME.DURATION).toBeLessThan(MATCH.TIME_LIMIT);
  });
});

describe('CHARACTERS registry', () => {
  it('contains at least mighty_man and bruce', () => {
    expect(Object.keys(CHARACTERS).length).toBeGreaterThanOrEqual(2);
    expect(CHARACTERS).toHaveProperty('mighty_man');
    expect(CHARACTERS).toHaveProperty('bruce');
  });

  it('every entry has the required string fields', () => {
    for (const [key, def] of Object.entries(CHARACTERS)) {
      expect(typeof def.id).toBe('string');
      expect(typeof def.displayName).toBe('string');
      expect(typeof def.spritePrefix).toBe('string');
      expect(typeof def.assetFolder).toBe('string');
      expect(typeof def.assetBaseName).toBe('string');

      expect(def.id.length).toBeGreaterThan(0);
      expect(def.displayName.length).toBeGreaterThan(0);
      expect(def.spritePrefix.length).toBeGreaterThan(0);
      expect(def.assetFolder.length).toBeGreaterThan(0);
      expect(def.assetBaseName.length).toBeGreaterThan(0);

      // The entry's id must match its key in the registry.
      expect(def.id).toBe(key);
    }
  });

  it('every entry has idleFrames and runFrames for all four directions with positive dimensions', () => {
    for (const def of Object.values(CHARACTERS)) {
      expect(def.idleFrames).toBeDefined();
      expect(def.runFrames).toBeDefined();

      for (const dir of DIRECTIONS) {
        const idle = def.idleFrames[dir];
        const run = def.runFrames[dir];

        expect(idle, `${def.id} missing idle frame for ${dir}`).toBeDefined();
        expect(run, `${def.id} missing run frame for ${dir}`).toBeDefined();

        expect(idle.w).toBeGreaterThan(0);
        expect(idle.h).toBeGreaterThan(0);
        expect(run.w).toBeGreaterThan(0);
        expect(run.h).toBeGreaterThan(0);
      }
    }
  });

  it('CHARACTER_IDS contains exactly the keys of CHARACTERS', () => {
    const keys = Object.keys(CHARACTERS) as CharacterId[];
    expect([...CHARACTER_IDS].sort()).toEqual([...keys].sort());
    expect(CHARACTER_IDS.length).toBe(keys.length);
  });

  it('every entry declares a hasGun boolean', () => {
    for (const def of Object.values(CHARACTERS)) {
      expect(typeof def.hasGun).toBe('boolean');
    }
  });

  it('CHARACTERS is frozen', () => {
    expect(Object.isFrozen(CHARACTERS)).toBe(true);
  });

  it('ships the full six-fighter roster', () => {
    expect(CHARACTER_IDS).toEqual(['mighty_man', 'bruce', 'frost_wizard', 'bubba', 'jack', 'rook']);
  });

  it('every entry declares positive frame counts', () => {
    for (const entry of Object.values(CHARACTERS)) {
      const def: CharacterDef = entry;
      expect(def.idleFrameCount).toBeGreaterThan(0);
      expect(def.runFrameCount).toBeGreaterThan(0);
      expect(def.attackFrameCount).toBeGreaterThan(0);
      expect(def.deathFrameCount).toBeGreaterThan(0);
      for (const dir of DEATH_DIRECTIONS) {
        expect(def.deathFrames[dir].w).toBeGreaterThan(0);
        expect(def.deathFrames[dir].h).toBeGreaterThan(0);
      }
      if (def.deathVariants) expect(Object.isFrozen(def.deathVariants)).toBe(true);
      for (const variant of def.deathVariants ?? []) {
        expect(variant.spritePrefix).not.toBe(def.spritePrefix);
        expect(variant.assetBaseName).toBeTruthy();
        expect(variant.deathFrameCount).toBeGreaterThan(0);
        for (const dir of DEATH_DIRECTIONS) {
          expect(variant.deathFrames[dir].w).toBeGreaterThan(0);
          expect(variant.deathFrames[dir].h).toBeGreaterThan(0);
        }
      }
    }
    // The pack's Zombie_Big / Zombie_Axe walk sheets are 8-frame; their
    // idles (and the whole original roster) are 6-frame.
    expect(CHARACTERS.bubba.runFrameCount).toBe(8);
    expect(CHARACTERS.jack.runFrameCount).toBe(8);
    expect(CHARACTERS.bubba.idleFrameCount).toBe(6);
    expect(CHARACTERS.mighty_man.runFrameCount).toBe(6);
  });

  it('Rook is the only synchronized body-overlay fighter and all frames are valid', () => {
    for (const id of CHARACTER_IDS) {
      const def: CharacterDef = CHARACTERS[id];
      if (id !== 'rook') {
        expect(def.bodyOverlay).toBeUndefined();
        continue;
      }
      const overlay = def.bodyOverlay;
      expect(overlay).toBeDefined();
      if (!overlay) continue;
      for (const frames of [overlay.idleFrames, overlay.runFrames, overlay.attackFrames]) {
        for (const dir of DIRECTIONS) {
          expect(frames[dir].w).toBeGreaterThan(0);
          expect(frames[dir].h).toBeGreaterThan(0);
        }
      }
      for (const dir of DEATH_DIRECTIONS) {
        expect(overlay.deathFrames[dir].w).toBeGreaterThan(0);
        expect(overlay.deathFrames[dir].h).toBeGreaterThan(0);
      }
    }
  });

  it('every entry has a coherent stat identity', () => {
    for (const def of Object.values(CHARACTERS)) {
      expect(def.maxHealth).toBeGreaterThan(0);
      expect(def.speedMultiplier).toBeGreaterThan(0);
      expect(def.hitbox.width).toBeGreaterThan(0);
      expect(def.hitbox.height).toBeGreaterThan(0);
    }
  });

  it('stat identities match the roadmap table', () => {
    expect(CHARACTERS.mighty_man.maxHealth).toBe(100);
    expect(CHARACTERS.mighty_man.speedMultiplier).toBe(1.0);
    expect(CHARACTERS.bruce.maxHealth).toBe(115);
    expect(CHARACTERS.bruce.speedMultiplier).toBe(0.95);
    expect(CHARACTERS.frost_wizard.maxHealth).toBe(85);
    expect(CHARACTERS.frost_wizard.speedMultiplier).toBe(1.08);
    expect(CHARACTERS.bubba.maxHealth).toBe(150);
    expect(CHARACTERS.bubba.speedMultiplier).toBe(0.85);
    expect(CHARACTERS.bubba.hitbox).toEqual({ width: 30, height: 30 });
    expect(CHARACTERS.jack.maxHealth).toBe(100);
    expect(CHARACTERS.jack.speedMultiplier).toBe(1.0);
    expect(CHARACTERS.jack.hitbox).toEqual({ width: 24, height: 24 });
    expect(CHARACTERS.rook.maxHealth).toBe(95);
    expect(CHARACTERS.rook.speedMultiplier).toBe(1.1);
    expect(CHARACTERS.rook.hitbox).toEqual({ width: 24, height: 24 });
  });
});

describe('character stat accessors', () => {
  it('return the registry values for known ids', () => {
    expect(characterMaxHealth('bubba')).toBe(150);
    expect(characterSpeedMultiplier('bubba')).toBe(0.85);
    expect(characterHitbox('bubba')).toEqual({ width: 30, height: 30 });
  });

  it('fall back to PLAYER baselines for null (pre-select)', () => {
    expect(characterMaxHealth(null)).toBe(PLAYER.MAX_HEALTH);
    expect(characterSpeedMultiplier(null)).toBe(1);
    expect(characterHitbox(null)).toEqual({
      width: PLAYER.HITBOX_WIDTH,
      height: PLAYER.HITBOX_HEIGHT,
    });
  });
});

describe('session-6 ability tuning', () => {
  it('Iron Hide reduces damage by half for a short window inside its cooldown', () => {
    expect(ABILITY.BUBBA_IRON_HIDE.DAMAGE_REDUCTION).toBe(0.5);
    expect(ABILITY.BUBBA_IRON_HIDE.DURATION).toBeLessThan(ABILITY.BUBBA_IRON_HIDE.COOLDOWN);
  });

  it('Axe Throw flight tuning is coherent', () => {
    expect(ABILITY.JACK_AXE_THROW.DAMAGE).toBe(60);
    expect(ABILITY.JACK_AXE_THROW.RANGE_TILES).toBe(6);
    expect(ABILITY.JACK_AXE_THROW.SPEED).toBeGreaterThan(0);
    expect(ABILITY.JACK_AXE_THROW.COOLDOWN).toBeGreaterThan(0);
  });

  it("KILL_WEAPONS includes the axe so Jack's kills attribute cleanly", () => {
    expect(KILL_WEAPONS).toContain('axe');
  });
});

describe('WEAPONS registry', () => {
  it('contains the rifle and the shotgun', () => {
    expect(WEAPONS).toHaveProperty('rifle');
    expect(WEAPONS).toHaveProperty('shotgun');
  });

  it('WEAPON_IDS contains exactly the keys of WEAPONS', () => {
    const keys = Object.keys(WEAPONS) as WeaponId[];
    expect([...WEAPON_IDS].sort()).toEqual([...keys].sort());
  });

  it('every entry has coherent tuning values', () => {
    for (const [key, def] of Object.entries(WEAPONS) as [string, WeaponDef][]) {
      // Melee uses flat damage and a hard reach. Fists are ammo-less; the
      // bat spends finite durability from the special slot.
      const isMelee = def.maxRange !== undefined;
      expect(def.id).toBe(key);
      expect(def.displayName.length).toBeGreaterThan(0);
      expect(def.damageMin).toBeGreaterThan(0);
      expect(def.damageMax).toBeGreaterThanOrEqual(def.damageMin);
      expect(def.falloffRangeMin).toBeGreaterThan(0);
      if (isMelee) {
        expect(def.falloffRangeMax).toBeGreaterThanOrEqual(def.falloffRangeMin);
        expect(def.reloadTime).toBe(0);
        if (key === 'punch') expect(def.magazineSize).toBe(0);
        else expect(def.magazineSize).toBeGreaterThan(0);
      } else {
        expect(def.falloffRangeMax).toBeGreaterThan(def.falloffRangeMin);
        expect(def.magazineSize).toBeGreaterThan(0);
        expect(def.reloadTime).toBeGreaterThan(0);
      }
      expect(def.burstSize).toBeGreaterThanOrEqual(1);
      expect(def.burstInterval).toBeGreaterThanOrEqual(0);
      expect(def.pelletCount).toBeGreaterThanOrEqual(1);
      expect(def.spreadAngle).toBeGreaterThanOrEqual(0);
      expect(def.fireCooldown).toBeGreaterThanOrEqual(0);
      expect(def.pickupAmmo).toBeGreaterThanOrEqual(0);
    }
  });

  it('melee reach never exceeds where its damage falloff ends', () => {
    for (const def of Object.values(WEAPONS) as WeaponDef[]) {
      if (def.maxRange !== undefined) {
        expect(def.maxRange).toBeLessThanOrEqual(def.falloffRangeMax);
        expect(def.maxRange).toBeGreaterThan(0);
      }
    }
  });

  it('rifle keeps the pre-weapon-system tuning (regression)', () => {
    const r = WEAPONS.rifle;
    expect(r.damageMin).toBe(8);
    expect(r.damageMax).toBe(25);
    expect(r.falloffRangeMin).toBe(64);
    expect(r.falloffRangeMax).toBe(400);
    expect(r.burstSize).toBe(3);
    expect(r.burstInterval).toBeCloseTo(0.15, 10);
    expect(r.magazineSize).toBe(30);
    expect(r.reloadTime).toBeCloseTo(2.0, 10);
    expect(r.pelletCount).toBe(1);
    expect(r.spreadAngle).toBe(0);
    expect(r.fireCooldown).toBe(0);
  });

  it('a shotgun weapon pickup fills the magazine plus a non-negative reserve', () => {
    const s = WEAPONS.shotgun;
    expect(s.pickupAmmo).toBeGreaterThanOrEqual(s.magazineSize);
  });

  it('locks the bat to four finite, flat-damage heavy swings', () => {
    expect(WEAPONS.bat).toMatchObject({
      damageMin: 80,
      damageMax: 80,
      maxRange: 72,
      pelletCount: 9,
      magazineSize: 4,
      pickupAmmo: 4,
      reloadTime: 0,
    });
    expect(KILL_WEAPONS).toContain('bat');
  });

  it('weapon announce lead fits inside the weapon respawn cycle', () => {
    expect(PICKUP.WEAPON_ANNOUNCE_LEAD).toBeLessThan(PICKUP.WEAPON_RESPAWN_TIME);
  });

  it('gives dropped power weapons a positive contest window', () => {
    expect(PICKUP.DROPPED_WEAPON_LIFETIME_SECONDS).toBeGreaterThan(0);
  });

  it('WEAPONS and every entry are frozen', () => {
    expect(Object.isFrozen(WEAPONS)).toBe(true);
    for (const def of Object.values(WEAPONS)) {
      expect(Object.isFrozen(def)).toBe(true);
    }
  });
});

describe('session-8 polish backlog config', () => {
  it('defines one frozen, distinct tactical rival per open Scrap Pit slot', () => {
    expect(PRACTICE_KINDS).toContain('rusty_rumble');
    expect(SCRAP_PIT_RIVALS).toHaveLength(RUMBLE.MAX_PLAYERS - 1);
    expect(BOT.RUMBLE_NICKNAMES).toHaveLength(RUMBLE.MAX_PLAYERS - 1);
    expect(new Set(BOT.RUMBLE_NICKNAMES).size).toBe(BOT.RUMBLE_NICKNAMES.length);
    expect(BOT.RUMBLE_NICKNAMES).toEqual(SCRAP_PIT_RIVALS.map((rival) => rival.nickname));
    expect(SCRAP_PIT_RIVALS.map((rival) => rival.tactic)).toEqual([...BOT_TACTICS]);
    expect(new Set(SCRAP_PIT_RIVALS.map((rival) => rival.role)).size).toBe(SCRAP_PIT_RIVALS.length);
    const signatureTaunts = SCRAP_PIT_RIVALS.map((rival) => rival.signatureTauntId);
    expect(new Set(signatureTaunts).size).toBe(SCRAP_PIT_RIVALS.length);
    expect(signatureTaunts.every((tauntId) => TAUNT_IDS.includes(tauntId))).toBe(true);
    expect(Object.isFrozen(BOT.RUMBLE_NICKNAMES)).toBe(true);
    expect(Object.isFrozen(SCRAP_PIT_RIVALS)).toBe(true);
    expect(SCRAP_PIT_RIVALS.every((rival) => Object.isFrozen(rival))).toBe(true);
    expect(BOT.SCAVENGER_RESOURCE_MAX_DETOUR_TILES).toBeGreaterThan(BOT.RESOURCE_MAX_DETOUR_TILES);
  });

  it('a pistol weapon pickup fills the magazine plus a positive reserve', () => {
    const p = WEAPONS.pistol;
    expect(p.pickupAmmo).toBeGreaterThan(p.magazineSize);
    // 12 in the mag + 24 reserve, per the roadmap spec.
    expect(p.pickupAmmo).toBe(36);
  });

  it('hill_hog exists and sits right after sharpshooter in priority order', () => {
    expect(AWARD_DEFS.hill_hog.displayName).toBe('Hill Hog');
    expect(AWARD_IDS.indexOf('hill_hog')).toBe(AWARD_IDS.indexOf('sharpshooter') + 1);
    expect(AWARDS.HILL_HOG_MIN_SECONDS).toBeGreaterThan(0);
  });

  it('leaderboard ships a sane number of entries', () => {
    expect(LEADERBOARD.SIZE).toBeGreaterThanOrEqual(1);
    expect(LEADERBOARD.SIZE).toBeLessThanOrEqual(10);
    expect(Object.isFrozen(LEADERBOARD)).toBe(true);
    expect(DAILY_GAUNTLET_LEADERBOARD.SIZE).toBe(LEADERBOARD.SIZE);
    expect(DAILY_GAUNTLET_LEADERBOARD.HISTORY_DAYS).toBeGreaterThanOrEqual(7);
    expect(Object.isFrozen(DAILY_GAUNTLET_LEADERBOARD)).toBe(true);
  });

  it('Jack (and only Jack) declares a no-axe alt body with coherent frames', () => {
    for (const id of CHARACTER_IDS) {
      const def: CharacterDef = CHARACTERS[id];
      if (id !== 'jack') {
        expect(def.altBody).toBeUndefined();
        continue;
      }
      const alt = def.altBody;
      expect(alt).toBeDefined();
      if (!alt) continue;
      // Distinct keys so the renderer can swap prefix without colliding
      // with the with-axe anim set.
      expect(alt.spritePrefix).not.toBe(def.spritePrefix);
      expect(alt.assetBaseName).not.toBe(def.assetBaseName);
      // Frame dims are positive integers for every state and direction
      // (sheet width = w * frameCount must divide evenly).
      for (const frames of [alt.idleFrames, alt.runFrames, alt.attackFrames]) {
        for (const dir of DIRECTIONS) {
          expect(Number.isInteger(frames[dir].w)).toBe(true);
          expect(Number.isInteger(frames[dir].h)).toBe(true);
          expect(frames[dir].w).toBeGreaterThan(0);
          expect(frames[dir].h).toBeGreaterThan(0);
        }
      }
      expect(alt.deathFrameCount).toBeGreaterThan(0);
      for (const dir of DEATH_DIRECTIONS) {
        expect(alt.deathFrames[dir].w).toBeGreaterThan(0);
        expect(alt.deathFrames[dir].h).toBeGreaterThan(0);
      }
      if (alt.deathVariants) expect(Object.isFrozen(alt.deathVariants)).toBe(true);
      for (const variant of alt.deathVariants ?? []) {
        expect(variant.spritePrefix).not.toBe(alt.spritePrefix);
        expect(variant.deathFrameCount).toBeGreaterThan(0);
        for (const dir of DEATH_DIRECTIONS) {
          expect(variant.deathFrames[dir].w).toBeGreaterThan(0);
          expect(variant.deathFrames[dir].h).toBeGreaterThan(0);
        }
      }
    }
  });

  it('Breach Dash is a frequent, utility-only reposition', () => {
    expect(ABILITY.ROOK_BREACH_DASH.DISTANCE_TILES).toBe(3);
    expect(ABILITY.ROOK_BREACH_DASH.COOLDOWN).toBe(8);
    expect(CHARACTERS.rook.bodyOverlay?.spritePrefix).toBe('rook-helmet');
  });
});
