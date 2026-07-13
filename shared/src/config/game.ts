import type { CharacterDef } from '../types/character.js';
import type {
  KillWeapon,
  CareerRankDefinition,
  CareerRankProgress,
  MatchContractDefinition,
  MatchContractId,
} from '../types/game.js';
import type { WeaponDef } from '../types/weapon.js';
import { GameModeType } from '../types/game.js';
import { PickupType } from '../types/pickup.js';

export const PLAYER = Object.freeze({
  BASE_SPEED: 200,
  SPRINT_SPEED: 320,
  SPRINT_DURATION: 3,
  SPRINT_RECHARGE_RATE: 1,
  MAX_HEALTH: 100,
  HITBOX_WIDTH: 24,
  HITBOX_HEIGHT: 24,
});

export const MATCH_CONTRACTS = Object.freeze({
  hot_shot: Object.freeze({
    id: 'hot_shot',
    title: 'HOT SHOT',
    objective: 'LAND 8 ATTACKS',
    metric: 'hits',
    target: 8,
  }),
  heavy_hitter: Object.freeze({
    id: 'heavy_hitter',
    title: 'HEAVY HITTER',
    objective: 'DEAL 300 DAMAGE',
    metric: 'damage',
    target: 300,
  }),
  on_a_roll: Object.freeze({
    id: 'on_a_roll',
    title: 'ON A ROLL',
    objective: 'REACH A 3-KILL STREAK',
    metric: 'streak',
    target: 3,
  }),
  road_warrior: Object.freeze({
    id: 'road_warrior',
    title: 'ROAD WARRIOR',
    objective: 'CROSS 25 MAP TILES',
    metric: 'distance_tiles',
    target: 25,
  }),
  powder_keg: Object.freeze({
    id: 'powder_keg',
    title: 'POWDER KEG',
    objective: 'DETONATE BOTH BARRELS',
    metric: 'barrels',
    target: 2,
  }),
  hill_dweller: Object.freeze({
    id: 'hill_dweller',
    title: 'HILL DWELLER',
    objective: 'SPEND 20S ON THE HILL',
    metric: 'hill_seconds',
    target: 20,
  }),
  tag_hunter: Object.freeze({
    id: 'tag_hunter',
    title: 'TAG HUNTER',
    objective: 'CONFIRM 3 ENEMY TAGS',
    metric: 'confirmed_tags',
    target: 3,
  }),
} as const) satisfies Readonly<Record<MatchContractId, MatchContractDefinition>>;

const BASE_CONTRACT_POOL: readonly MatchContractId[] = Object.freeze([
  'hot_shot',
  'heavy_hitter',
  'on_a_roll',
  'road_warrior',
  'powder_keg',
]);

function contractHash(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Scavenger Caches use one shared reward roll per match so rotationally
 * paired crates stay fair. Repeated entries are intentional weights: common
 * sustain makes up 75% of the table, while each special weapon is a rare hit.
 */
export const SCAVENGER_CACHE = Object.freeze({
  LOOT_TABLE: Object.freeze([
    PickupType.GUN_AMMO,
    PickupType.GUN_AMMO,
    PickupType.BANDAGE,
    PickupType.BANDAGE,
    PickupType.GRENADE,
    PickupType.GRENADE,
    PickupType.WEAPON_PISTOL,
    PickupType.WEAPON_SHOTGUN,
  ] as const),
});

/** Stable reward selection that consumes none of Match's gameplay RNG. */
export function selectScavengerCacheReward(
  matchId: string,
  isTypeEnabled: (type: PickupType) => boolean = () => true,
): PickupType {
  const eligible = SCAVENGER_CACHE.LOOT_TABLE.filter(isTypeEnabled);
  if (eligible.length === 0) return PickupType.BANDAGE;
  return eligible[contractHash(`${matchId}:scavenger-cache`) % eligible.length];
}

/** Stable per-match selection that consumes none of Match's gameplay RNG. */
export function selectMatchContract(
  matchId: string,
  mode: GameModeType,
  forced?: string,
  excluded?: MatchContractId,
): MatchContractDefinition {
  if (forced && Object.prototype.hasOwnProperty.call(MATCH_CONTRACTS, forced)) {
    return MATCH_CONTRACTS[forced as MatchContractId];
  }
  const pool = [...BASE_CONTRACT_POOL];
  if (mode === GameModeType.KOTH) pool.push('hill_dweller');
  if (mode === GameModeType.KILL_CONFIRMED) pool.push('tag_hunter');
  const eligible = excluded ? pool.filter((id) => id !== excluded) : pool;
  return MATCH_CONTRACTS[
    eligible[contractHash(`${matchId}:${mode}`) % eligible.length]
  ];
}

/**
 * Cosmetic reputation ladder. Rank is always derived from the persisted
 * contractsCompleted total, so it needs no new storage shape or migration.
 * Thresholds are cumulative career clears, not a spendable currency.
 */
export const CAREER_RANKS: readonly CareerRankDefinition[] = Object.freeze([
  Object.freeze({ id: 'drifter', title: 'DRIFTER', badge: 'DRF', minContracts: 0 }),
  Object.freeze({ id: 'scavenger', title: 'SCAVENGER', badge: 'SCV', minContracts: 3 }),
  Object.freeze({ id: 'road_dog', title: 'ROAD DOG', badge: 'DOG', minContracts: 8 }),
  Object.freeze({ id: 'marauder', title: 'MARAUDER', badge: 'MAR', minContracts: 15 }),
  Object.freeze({
    id: 'wasteland_veteran',
    title: 'WASTELAND VETERAN',
    badge: 'VET',
    minContracts: 25,
  }),
  Object.freeze({
    id: 'legend',
    title: 'LEGEND OF THE WASTE',
    badge: 'LEG',
    minContracts: 40,
  }),
]);

/** Rank + next milestone for any wire/storage value, including old bad input. */
export function careerRankProgressForContracts(value: number): CareerRankProgress {
  const completed = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  let current = CAREER_RANKS[0];
  let next: CareerRankDefinition | null = null;
  for (const rank of CAREER_RANKS) {
    if (completed >= rank.minContracts) {
      current = rank;
    } else {
      next = rank;
      break;
    }
  }
  return {
    completed,
    current,
    next,
    remaining: next ? next.minContracts - completed : 0,
  };
}

/**
 * Weapon roster. The rifle is the always-carried default (the pre-weapon-
 * system "GUN"); everything else is a map-spawned special weapon that
 * occupies the single pickup slot until its ammo runs out.
 */
export const WEAPONS = Object.freeze({
  rifle: Object.freeze({
    id: 'rifle',
    displayName: 'Rifle',
    damageMin: 8,
    damageMax: 25,
    falloffRangeMin: 64,
    falloffRangeMax: 400,
    /** Number of rounds in a single burst fired on left-click release. */
    burstSize: 3,
    /** Seconds between each round in a burst. */
    burstInterval: 0.15,
    magazineSize: 30,
    reloadTime: 2.0,
    pelletCount: 1,
    spreadAngle: 0,
    fireCooldown: 0,
    /** The rifle is never a map pickup. */
    pickupAmmo: 0,
  }),
  shotgun: Object.freeze({
    id: 'shotgun',
    displayName: 'Shotgun',
    /** Per-pellet damage — brutal close, useless far. */
    damageMin: 3,
    damageMax: 8,
    falloffRangeMin: 32,
    falloffRangeMax: 180,
    /** Single shot per trigger pull; pump racking gates the fire rate. */
    burstSize: 1,
    burstInterval: 0,
    magazineSize: 2,
    reloadTime: 1.5,
    pelletCount: 6,
    /** Full fan width ≈ 20°. */
    spreadAngle: 0.35,
    /** Pump-racking delay between shots. */
    fireCooldown: 0.6,
    /** Picked up with 8 shells total (2 in the mag + 6 reserve). */
    pickupAmmo: 8,
  }),
  /**
   * Gun Game rung weapon (Session 7) and, since Session 8, a DM/KOTH map
   * pickup — a sidegrade to the rifle, not a power weapon like the
   * shotgun (spawns active, never pre-announced).
   */
  pistol: Object.freeze({
    id: 'pistol',
    displayName: 'Pistol',
    damageMin: 7,
    damageMax: 14,
    falloffRangeMin: 48,
    falloffRangeMax: 320,
    burstSize: 1,
    burstInterval: 0,
    magazineSize: 12,
    reloadTime: 1.0,
    pelletCount: 1,
    spreadAngle: 0,
    /** Semi-auto tap-fire cap (~4.5 shots/s). */
    fireCooldown: 0.22,
    /** Picked up with 36 rounds total (12 in the mag + 24 reserve). */
    pickupAmmo: 36,
  }),
  /**
   * Melee punch — the Gun Game finisher rung. Validated as an arc of
   * pelletCount deterministic even-fan rays (evenFanAngles — NO jitter,
   * so the fan can't gap past a 24px hitbox at max range) through the
   * same lag-comp rewind as every gun. Flat damage (min == max); maxRange
   * hard-caps the rays at melee reach. One damage application per victim
   * per swing regardless of how many rays connect; a wide arc CAN hit
   * multiple victims. No ammo, no reload.
   */
  punch: Object.freeze({
    id: 'punch',
    displayName: 'Fists',
    damageMin: 60,
    damageMax: 60,
    falloffRangeMin: 56,
    falloffRangeMax: 56,
    burstSize: 1,
    burstInterval: 0,
    magazineSize: 0,
    reloadTime: 0,
    /** Rays in the melee arc fan, not projectiles. */
    pelletCount: 7,
    /** Full arc width ≈ 100°. */
    spreadAngle: 1.75,
    /** Swing cooldown. */
    fireCooldown: 0.5,
    pickupAmmo: 0,
    /** Melee reach in px (~1.2 tiles). Rays stop dead here. */
    maxRange: 56,
  }),
}) satisfies Readonly<Record<string, WeaponDef>>;

export type WeaponId = keyof typeof WEAPONS;
export const WEAPON_IDS = Object.keys(WEAPONS) as WeaponId[];

/**
 * Runtime list of every kill-attribution source, for keying per-weapon
 * kill counters. Must stay in sync with the KillWeapon union in
 * shared/src/types/game.ts (the `satisfies` clause catches typos but not
 * omissions — extend both when adding a weapon).
 */
export const KILL_WEAPONS = Object.freeze([
  'gun',
  'grenade',
  'fire',
  'shotgun',
  'axe',
  'pistol',
  'punch',
  'barrel',
] as const) satisfies readonly KillWeapon[];

/** Fresh all-zero per-weapon kill record (PlayerStats.killsByWeapon). */
export function createEmptyKillsByWeapon(): Record<KillWeapon, number> {
  const record = {} as Record<KillWeapon, number>;
  for (const weapon of KILL_WEAPONS) {
    record[weapon] = 0;
  }
  return record;
}

export const GRENADE = Object.freeze({
  DAMAGE: 100,
  BLAST_RADIUS: 96,
  /**
   * Damage at the edge of the blast radius, as a fraction of full DAMAGE.
   * Linear falloff between 1.0 at the center and this value at the edge;
   * anything outside the blast radius takes 0 damage.
   */
  MIN_DAMAGE_FACTOR: 0.5,
  /**
   * Fallback fuse — grenades wait for a manual right-click detonation,
   * but auto-explode after this many seconds if the player forgets or dies.
   */
  SAFETY_FUSE: 5.0,
  THROW_SPEED: 300,
  /** Grenades a player spawns with and the cap on grenade pickups. */
  STARTING_COUNT: 3,
  MAX_COUNT: 3,
  /** Grenades granted per pickup. */
  PICKUP_AMOUNT: 1,
});

export const TRAJECTORY = Object.freeze({
  /** How far ahead (seconds) the grenade aim preview simulates. */
  PREVIEW_SECONDS: 1.5,
  /** Sub-step used when simulating the preview path. */
  PREVIEW_STEP_DT: 1 / 60,
});

export const PICKUP = Object.freeze({
  GUN_AMMO_AMOUNT: 15,
  /** Respawn time for ammo/grenade top-off pickups. */
  RESPAWN_TIME: 15,
  /** HP restored by a bandage, capped at the player's max health. */
  BANDAGE_HEAL: 30,
  BANDAGE_RESPAWN_TIME: 20,
  /**
   * Respawn cycle for special-weapon pickups (shotgun). Weapon pickups
   * also start the match on this timer rather than pre-placed, so every
   * drop — including the first — gets the same pre-announcement.
   */
  WEAPON_RESPAWN_TIME: 30,
  /** Seconds before a weapon pickup lands that the warning banner fires. */
  WEAPON_ANNOUNCE_LEAD: 5,
});

export const RESPAWN = Object.freeze({
  DELAY: 3,
  INVULNERABILITY_DURATION: 2,
});

export const MATCH = Object.freeze({
  KILL_TARGET: 10,
  /**
   * Match length in seconds. Tuned to the gameplay music track
   * (game-play.mp3, ~173.5s) so the track plays through once and
   * ends at the same moment the timer hits 0:00 — no loop, no trailing
   * silence. If the music asset changes length, change this too.
   */
  TIME_LIMIT: 173,
  COUNTDOWN_DURATION: 3,
  /**
   * Max seconds players have on the character-select screen before any
   * unlocked player is auto-locked onto their current hover and the
   * countdown begins.
   */
  CHARACTER_SELECT_TIMEOUT_SEC: 30,
});

/**
 * Pre-match map/mode draft (Session 9). Every real match — fresh AND
 * rematch — opens with a draft instead of the blind rotation: the server
 * rolls who picks first; that player claims a category implicitly by
 * picking EITHER a map OR a mode; the other player picks from the
 * remaining category. Lives in MatchmakingManager BEFORE Match
 * construction (Match takes mapData/gameMode in its constructor), so
 * `server:matchFound` keeps meaning "match exists; final map+mode".
 * FORCE_MAP / FORCE_MODE skip the draft entirely (smoke pins double as
 * the kill switch); the rotation cursors survive only for that path.
 */
export const DRAFT = Object.freeze({
  /**
   * Seconds the first picker has to make their pick. Includes the
   * client's who-picks-first spectacle (SPECTACLE_MS) — the server
   * deadline starts at draft creation, not at spectacle end.
   */
  FIRST_PICK_SECONDS: 20,
  /** Seconds the second picker has once the first pick lands. */
  SECOND_PICK_SECONDS: 15,
  /**
   * Client-side duration of the "WHO PICKS FIRST?" nickname ping-pong
   * before the option columns unlock. Purely cosmetic — the outcome is
   * server-rolled and already in the first draftState message.
   */
  SPECTACLE_MS: 2600,
  /** Shorter reveal used when the previous round's loser earns first pick. */
  REVENGE_REVEAL_MS: 1800,
});

/** Consecutive rematches form a short, self-contained rivalry set. */
export const RIVALRY_SET = Object.freeze({
  WINS_TO_CLINCH: 3,
});

/** Server-authoritative solo practice opponent. All behavior tuning lives here. */
export const BOT = Object.freeze({
  PLAYER_ID_PREFIX: 'bot:',
  NICKNAME: 'RUSTY',
  PATH_RECALC_SECONDS: 0.25,
  PREFERRED_DISTANCE: 220,
  RETREAT_DISTANCE: 120,
  FIRE_RANGE: 520,
  AIM_WOBBLE_RADIANS: 0.045,
  FIRE_INTERVAL_SECONDS: 0.55,
  STRAFE_SWITCH_SECONDS: 1.6,
  GRENADE_INTERVAL_SECONDS: 7,
  GRENADE_RUNG_INTERVAL_SECONDS: 1.5,
  GRENADE_DETONATE_SECONDS: 0.85,
  ABILITY_OPENING_DELAY_SECONDS: 4,
});

export const BOT_DIFFICULTIES = ['rookie', 'scrapper', 'warlord'] as const;
export type BotDifficulty = (typeof BOT_DIFFICULTIES)[number];
export const DEFAULT_BOT_DIFFICULTY: BotDifficulty = 'scrapper';

/** Skill profiles change decision cadence, never physics or damage rules. */
export const BOT_PROFILES: Readonly<
  Record<
    BotDifficulty,
    {
      aimWobbleRadians: number;
      fireIntervalSeconds: number;
      grenadeIntervalSeconds: number;
      abilityIntervalSeconds: number;
      pathRecalcSeconds: number;
    }
  >
> = Object.freeze({
  rookie: Object.freeze({
    aimWobbleRadians: 0.12,
    fireIntervalSeconds: 0.9,
    grenadeIntervalSeconds: 12,
    abilityIntervalSeconds: 8,
    pathRecalcSeconds: 0.4,
  }),
  scrapper: Object.freeze({
    aimWobbleRadians: BOT.AIM_WOBBLE_RADIANS,
    fireIntervalSeconds: BOT.FIRE_INTERVAL_SECONDS,
    grenadeIntervalSeconds: BOT.GRENADE_INTERVAL_SECONDS,
    abilityIntervalSeconds: BOT.ABILITY_OPENING_DELAY_SECONDS,
    pathRecalcSeconds: BOT.PATH_RECALC_SECONDS,
  }),
  warlord: Object.freeze({
    aimWobbleRadians: 0.018,
    fireIntervalSeconds: 0.3,
    grenadeIntervalSeconds: 4.5,
    abilityIntervalSeconds: 2.5,
    pathRecalcSeconds: 0.15,
  }),
});

/** Thresholds for authoritative kill-streak and payback callouts. */
export const COMBAT_CALLOUTS = Object.freeze({
  STREAK_START: 2,
  RAMPAGE_START: 3,
  UNSTOPPABLE_START: 5,
  SHUTDOWN_MIN_VICTIM_STREAK: 3,
});

/**
 * Combat-medal timing is evaluated only by the authoritative server. Kills
 * inside this rolling window form a rapid chain; the client merely presents
 * the count stamped onto KillFeedEntry.
 */
export const COMBAT_MEDALS = Object.freeze({
  RAPID_KILL_WINDOW_SECONDS: 6,
  DOUBLE_KILL_COUNT: 2,
  TRIPLE_KILL_COUNT: 3,
  MAYHEM_COUNT: 4,
});

/**
 * Game mode metadata + rotation. Rotation order doubles as the cycle fresh
 * matches walk through (mirrors the map registry's rotation contract):
 * fresh matches advance a global cursor, rematches play the mode AFTER the
 * one just played (pinned at match end so the results-screen promise can't
 * lie). Display names are HUD/lobby/results copy.
 */
export const GAME_MODES = Object.freeze({
  [GameModeType.DEATHMATCH]: Object.freeze({
    displayName: 'DEATHMATCH',
    objective: 'FIRST TO 20 KILLS',
  }),
  [GameModeType.KOTH]: Object.freeze({
    displayName: 'KING OF THE HILL',
    objective: 'HOLD THE HILL · FIRST TO 60',
  }),
  [GameModeType.GUN_GAME]: Object.freeze({
    displayName: 'GUN GAME',
    objective: 'MASTER EVERY WEAPON',
  }),
  [GameModeType.LAST_STAND]: Object.freeze({
    displayName: 'LAST STAND',
    objective: '5 LIVES · LAST FIGHTER STANDING',
  }),
  [GameModeType.KILL_CONFIRMED]: Object.freeze({
    displayName: 'KILL CONFIRMED',
    objective: 'CONFIRM ENEMY TAGS · DENY YOUR OWN',
  }),
  [GameModeType.ONE_IN_THE_CHAMBER]: Object.freeze({
    displayName: 'ONE IN THE CHAMBER',
    objective: 'ONE BULLET · KILLS RELOAD · FIRST TO 8',
  }),
}) satisfies Readonly<
  Record<GameModeType, { displayName: string; objective: string }>
>;

/** Rotation cycle for fresh matches and rematch succession. */
export const GAME_MODE_ROTATION: readonly GameModeType[] = Object.freeze([
  GameModeType.DEATHMATCH,
  GameModeType.KOTH,
  GameModeType.GUN_GAME,
  GameModeType.LAST_STAND,
  GameModeType.KILL_CONFIRMED,
  GameModeType.ONE_IN_THE_CHAMBER,
]);

/**
 * The mode that follows `current` in rotation order, wrapping at the end.
 * Unknown values restart the cycle at the first mode rather than throwing —
 * rotation should never kill a match (same contract as getNextMapName).
 */
export function getNextGameMode(current: GameModeType): GameModeType {
  const idx = GAME_MODE_ROTATION.indexOf(current);
  return GAME_MODE_ROTATION[(idx + 1) % GAME_MODE_ROTATION.length];
}

/** HUD/lobby/results display name for a mode. */
export function gameModeDisplayName(mode: GameModeType): string {
  return GAME_MODES[mode]?.displayName ?? String(mode).toUpperCase();
}

/**
 * King of the Hill. One square hill zone is live at a time; a player scores
 * 1 point per full second as the zone's sole living occupant (contested =
 * nobody scores; fractional progress resets whenever sole occupancy is
 * broken). The hill relocates round-robin through the map's kothHills list
 * on a fixed interval, with a warning marker at the next spot.
 */
export const KOTH = Object.freeze({
  /** First player to this many hill points wins (else highest at time-out). */
  SCORE_TARGET: 60,
  /** Hill zone edge length in tiles (zones are square). */
  HILL_SIZE_TILES: 2,
  /** Seconds between hill relocations. */
  HILL_MOVE_INTERVAL: 25,
  /** Seconds before relocation that the next-hill warning marker appears. */
  HILL_MOVE_WARNING: 3,
});

/**
 * Sudden-death overtime, all modes: entered when a match would otherwise
 * end in a tie. Everyone respawns fresh with a single life; the first kill
 * wins; if nobody dies before the clock runs out the match is a true draw.
 */
export const OVERTIME = Object.freeze({
  /** Overtime length in seconds. */
  DURATION: 30,
});

/**
 * Gun Game (Session 7): every kill made WITH YOUR CURRENT RUNG WEAPON
 * marches you down the ladder; the first player through the final rung
 * wins immediately. `PlayerState.score` carries total ladder kills — the
 * pure helpers in shared/src/utils/gun-game.ts derive the rung from it on
 * both server and client, so no extra per-player wire state exists.
 * Ability kills (axe, fire) and self-kills never advance. No demotion.
 *
 * The mode is the loadout authority: it enforces each rung's weapon and
 * keeps ammo above the floors below so no rung can strand a player
 * (rifle reloads are already free; grenades refill on a timer during the
 * grenade rung). Weapon/ammo/grenade pickups don't spawn in this mode and
 * the grenades_only / infinite_ammo mutators are excluded from its rolls.
 */
export const GUN_GAME = Object.freeze({
  /** Rung weapons, in ladder order. */
  LADDER: ['rifle', 'shotgun', 'pistol', 'grenade', 'punch'] as const,
  /**
   * Kills required to clear each rung (same order as LADDER). The punch
   * finisher needs only one — landing a melee kill on armed opponents is
   * the hard part.
   */
  RUNG_KILLS: [2, 2, 2, 2, 1] as const,
  /** Seconds to refill one grenade during the grenade rung, up to max. */
  GRENADE_REFILL_SECONDS: 3.0,
  /** specialReserve floor while on the shotgun rung (reload never strands). */
  SHOTGUN_RESERVE_FLOOR: 6,
  /** specialReserve floor while on the pistol rung. */
  PISTOL_RESERVE_FLOOR: 24,
});

/**
 * Last Stand: every fighter begins with a visible stock of lives. Deaths
 * remove one life; the last fighter with lives remaining wins. A tied clock
 * uses the normal sudden-death overtime path.
 */
export const LAST_STAND = Object.freeze({
  STARTING_LIVES: 5,
});

/**
 * One in the Chamber: every spawn and opponent kill grants one lethal
 * pistol round. Missing swaps the fighter to lethal fists until they earn
 * the chambered round back. The mode owns its complete combat economy.
 */
export const ONE_IN_THE_CHAMBER = Object.freeze({
  SCORE_TARGET: 8,
  CHAMBERED_ROUNDS: 1,
});

/** Kill Confirmed: bank enemy tags, or recover your own to deny the point. */
export const KILL_CONFIRMED = Object.freeze({
  SCORE_TARGET: 8,
  TAG_COLLECT_RADIUS: 30,
  TAG_LIFETIME_SECONDS: 20,
});

/** A Gun Game ladder rung's weapon: a real WeaponId or the grenade rung. */
export type GunGameRungWeapon = (typeof GUN_GAME.LADDER)[number];

/**
 * Mutators: match-wide rule modifiers that activate mid-match and run until
 * the match ends. Each match schedules TWO activations from POOL, no
 * repeats:
 *
 *   1. Mid-match — at a random time inside the 40%–70% elapsed window
 *      (rolled from the match's injectable RNG, so tests can seed it).
 *   2. Final-minute — guaranteed, at the fixed remaining-time thresholds
 *      below (the pre-mutator "final-minute event" system, unchanged).
 *
 * Both get a warning banner WARNING_LEAD_SECONDS before activation, and
 * both run to match end — the 70% window edge lies inside the final
 * minute, so the two mutators can be active simultaneously (stacking is
 * intended; movement multipliers compose multiplicatively).
 */
export const MUTATORS = Object.freeze({
  POOL: [
    'super_speed',
    'grenades_only',
    'infinite_ammo',
    'low_health',
    'big_heads',
    'vampire',
    'turbo_grenades',
    'second_wind',
    'blackout',
    'fists_only',
    'weapon_roulette',
  ] as const,
  /** Final-minute slot: warning/activation thresholds in seconds REMAINING. */
  WARNING_AT_REMAINING: 65,
  ACTIVATION_AT_REMAINING: 60,
  /** Mid-match slot: activation window as fractions of match time ELAPSED. */
  MIDMATCH_MIN_ELAPSED_FRACTION: 0.4,
  MIDMATCH_MAX_ELAPSED_FRACTION: 0.7,
  /** Seconds between the mid-match warning banner and its activation. */
  WARNING_LEAD_SECONDS: 5,
  /** BASE_SPEED multiplier during super_speed. */
  SUPER_SPEED_MULTIPLIER: 1.6,
  /** Seconds to refill one grenade during grenades_only. */
  GRENADES_ONLY_REFILL_SECONDS: 3.0,
  /** Max-HP cap during low_health (clamps current HP and respawn HP). */
  LOW_HEALTH_HP: 1,
  /** big_heads: hit-validation AABB scale (server + aim-line preview only). */
  BIG_HEADS_HITBOX_SCALE: 1.5,
  /** big_heads: sprite render scale multiplier (client visual only). */
  BIG_HEADS_RENDER_SCALE: 1.3,
  /** vampire: fraction of damage dealt returned to the attacker as healing. */
  VAMPIRE_HEAL_FRACTION: 0.5,
  /** turbo_grenades: multiplier on grenade throw speed. */
  TURBO_GRENADES_SPEED_MULTIPLIER: 1.5,
  /** turbo_grenades: seconds to refill one grenade, up to GRENADE.MAX_COUNT. */
  TURBO_GRENADES_REFILL_SECONDS: 5.0,
  /** second_wind: speed multiplier granted on respawn... */
  SECOND_WIND_SPEED_MULTIPLIER: 1.3,
  /** ...for this many seconds (PlayerState.secondWindTimer). */
  SECOND_WIND_DURATION_SECONDS: 3,
  /** Fair shared loadout sequence used by weapon_roulette. */
  WEAPON_ROULETTE_ORDER: Object.freeze([
    'shotgun',
    'pistol',
    'punch',
    'rifle',
  ] as const),
  /** Seconds each shared roulette loadout stays active. */
  WEAPON_ROULETTE_INTERVAL_SECONDS: 10,
});

/**
 * A mutator's id. Formerly `FinalMinuteEvent` — renamed when the pool grew
 * a second, randomly-timed mid-match activation slot.
 */
export type MutatorId = (typeof MUTATORS.POOL)[number];

/**
 * End-of-match awards. Declaration order IS the priority order: the server
 * walks AWARD_IDS top to bottom and ships the first AWARDS.DISPLAY_COUNT
 * awards that have an outright winner (ties earn nobody the award).
 * Display names are final per the replayability roadmap; thresholds are
 * tunable.
 */
export const AWARD_DEFS = Object.freeze({
  sharpshooter: Object.freeze({ displayName: 'Sharpshooter' }),
  hill_hog: Object.freeze({ displayName: 'Hill Hog' }),
  spray_and_pray: Object.freeze({ displayName: 'Spray & Pray' }),
  demolition_man: Object.freeze({ displayName: 'Demolition Man' }),
  buckshot_barber: Object.freeze({ displayName: 'Buckshot Barber' }),
  bare_knuckles: Object.freeze({ displayName: 'Bare Knuckles' }),
  untouchable: Object.freeze({ displayName: 'Untouchable' }),
  pincushion: Object.freeze({ displayName: 'Pincushion' }),
  pin_puller_no_payoff: Object.freeze({ displayName: 'Pin Puller, No Payoff' }),
  tourist: Object.freeze({ displayName: 'Tourist' }),
});

export type AwardId = keyof typeof AWARD_DEFS;
/** Award ids in priority order (= declaration order of AWARD_DEFS). */
export const AWARD_IDS = Object.keys(AWARD_DEFS) as readonly AwardId[];

export const AWARDS = Object.freeze({
  /** How many awards the results screen shows, by priority. */
  DISPLAY_COUNT: 3,
  /** Sharpshooter requires at least this many shots fired. */
  SHARPSHOOTER_MIN_SHOTS: 10,
  /** Spray & Pray requires at least this many shots fired... */
  SPRAY_AND_PRAY_MIN_SHOTS: 10,
  /** ...and an accuracy strictly below this fraction. */
  SPRAY_AND_PRAY_MAX_ACCURACY: 0.25,
  /** Untouchable requires a kill streak at least this long. */
  UNTOUCHABLE_MIN_STREAK: 3,
  /** Pin Puller requires at least this many grenades thrown (and 0 grenade kills). */
  PIN_PULLER_MIN_THROWN: 3,
  /**
   * Hill Hog requires at least this many seconds spent alive inside the
   * live hill (contested time counts — see StatsTracker.recordHillSeconds).
   * Only KOTH accrues hill seconds, so other modes can never award it.
   */
  HILL_HOG_MIN_SECONDS: 10,
});

export const LEADERBOARD = Object.freeze({
  /** How many all-time top players ship in server:leaderboard. */
  SIZE: 5,
});

export const SERVER = Object.freeze({
  TICK_RATE: 20,
  TICK_INTERVAL: 50,
  /**
   * Upper bound on how many queued inputs a player can catch up with in one
   * server tick. Normal play is 1; short client/frame/network bursts may be
   * 2-3. Keeping a cap protects the tick budget without forcing bad acks.
   */
  MAX_INPUTS_PER_PLAYER_PER_TICK: 5,
  REWIND_BUFFER_SECONDS: 1,
  MAX_PLAYERS: 10,
});

export const MAP = Object.freeze({
  TILE_SIZE: 48,
});

/**
 * Per-character active abilities, triggered by the spacebar / on-screen
 * ability button. See server/src/game/match.ts for the state machine and
 * client/src/scenes/game-scene.ts for VFX wiring.
 *
 * Cooldown semantics:
 *   - Bruce: cooldown begins at activation. Total cycle = COOLDOWN seconds.
 *     The 1.2s breath plays out within that window.
 *   - Mighty Man: cooldown begins when the active window ends. Total cycle =
 *     DURATION + COOLDOWN. Death cancels the active window early; cooldown
 *     starts at the death moment in that case.
 */
export const ABILITY = Object.freeze({
  BRUCE_FIRE_BREATH: {
    DURATION: 1.2,
    COOLDOWN: 45,
    /** Reach in tiles. 4 * TILE_SIZE = 192px. */
    RANGE_TILES: 4,
    /**
     * Number of damage ticks fired evenly across the active window. Tick 0
     * fires on the activation server tick (elapsed = 0), tick k fires once
     * elapsed >= k * (DURATION / DAMAGE_TICK_COUNT). At DURATION=1.2 and
     * TICK_COUNT=5 the spacing is 0.24s.
     */
    DAMAGE_TICK_COUNT: 5,
    /**
     * Damage applied to every player currently inside the cone on each
     * damage tick. Distance-independent — the longer a victim stays in the
     * breath, the more ticks they eat. Five ticks at 30 = 150 max damage.
     */
    DAMAGE_PER_TICK: 30,
    /** Segment thickness in pixels — gives the breath some hit forgiveness. */
    WIDTH: 14,
  },
  MIGHTY_MAN_XRAY: {
    DURATION: 7,
    COOLDOWN: 30,
  },
  /**
   * Frost Wizard. Auto-targets the nearest non-self living opponent and
   * pins them in place for DURATION seconds — no movement, no shooting,
   * no grenade, no reload, no counter-ability. Instant cast, no active
   * window: caster's `abilityActiveSeconds` stays 0 and cooldown begins
   * at activation. Cycle = COOLDOWN seconds. If no eligible target
   * exists, the cooldown is not consumed (see Match.tryActivateAbility).
   */
  FROST_WIZARD_FREEZE: {
    DURATION: 2,
    COOLDOWN: 30,
  },
  /**
   * Bubba's Iron Hide: all incoming damage is multiplied by
   * (1 - DAMAGE_REDUCTION) while the active window runs. Applied inside
   * CombatManager.applyDamage — the single damage choke point — so every
   * source (rifle, pellets, grenades, fire breath, thrown axes, future
   * weapons) is covered automatically. Bruce-style cooldown anchor:
   * cooldown starts at activation, so the total cycle is COOLDOWN seconds
   * with the DURATION overlapping its first 4.
   */
  BUBBA_IRON_HIDE: {
    DURATION: 4,
    COOLDOWN: 30,
    DAMAGE_REDUCTION: 0.5,
  },
  /**
   * Jack's Axe Throw: a straight-line thrown-axe projectile fired along
   * the activation aim angle. Server-simulated like grenades (no client
   * damage prediction); flat DAMAGE on the first victim hit; blocked by
   * walls; the axe lands after RANGE_TILES of flight. Instant cast (no
   * active window) — cooldown begins at activation, like Frost Lock.
   */
  JACK_AXE_THROW: {
    COOLDOWN: 12,
    DAMAGE: 60,
    /** Max flight distance in tiles. 6 * TILE_SIZE = 288px. */
    RANGE_TILES: 6,
    /** Flight speed in px/s (~0.55s to reach max range). */
    SPEED: 520,
  },
  /**
   * Rook's Breach Dash: an instant, aim-directed reposition that stops at
   * the last collision-free point before map geometry. It deals no damage
   * and grants no invulnerability, so its value comes from positioning.
   */
  ROOK_BREACH_DASH: {
    COOLDOWN: 8,
    DISTANCE_TILES: 3,
  },
});

/**
 * Character roster. Frame dimensions are sourced from the actual sprite
 * sheets shipped under `client/public/assets/{assetFolder}/`. Sheets are
 * horizontal strips of idleFrameCount / runFrameCount frames (sheet width
 * = w * frameCount; the original roster is 6/6, the Session 6 zombies ship
 * 8-frame walks).
 *
 * Adding a new character: add an entry here, drop the assets into
 * `client/public/assets/<folder>/`, and the BootScene loader picks it up
 * automatically. No further code changes needed for the sprite pipeline.
 *
 * Stat identities (maxHealth / speedMultiplier / hitbox) are the Session 6
 * counterpick axes — see CharacterDef for exactly which systems consume
 * each. Starting values from the replayability roadmap; tune in playtest.
 */
export const CHARACTERS = Object.freeze({
  mighty_man: {
    id: 'mighty_man',
    displayName: 'Mighty Man',
    spritePrefix: 'mighty_man',
    assetFolder: 'player',
    assetBaseName: 'character',
    hasGun: true,
    maxHealth: 100,
    speedMultiplier: 1.0,
    hitbox: { width: 24, height: 24 },
    idleFrameCount: 6,
    runFrameCount: 6,
    attackFrameCount: 4,
    deathFrameCount: 6,
    idleFrames: {
      down: { w: 11, h: 16 },
      up: { w: 11, h: 16 },
      side: { w: 10, h: 16 },
      'side-left': { w: 10, h: 16 },
    },
    runFrames: {
      down: { w: 11, h: 17 },
      up: { w: 11, h: 17 },
      side: { w: 10, h: 17 },
      'side-left': { w: 10, h: 17 },
    },
    attackFrames: {
      down: { w: 12, h: 18 },
      up: { w: 12, h: 17 },
      side: { w: 20, h: 18 },
      'side-left': { w: 20, h: 18 },
    },
    deathFrames: {
      side: { w: 21, h: 16 },
      'side-left': { w: 21, h: 16 },
    },
  },
  bruce: {
    id: 'bruce',
    displayName: 'Bruce',
    spritePrefix: 'bruce',
    assetFolder: 'enemies',
    assetBaseName: 'zombie',
    hasGun: false,
    maxHealth: 115,
    speedMultiplier: 0.95,
    hitbox: { width: 24, height: 24 },
    idleFrameCount: 6,
    runFrameCount: 6,
    attackFrameCount: 4,
    deathFrameCount: 6,
    idleFrames: {
      down: { w: 13, h: 16 },
      up: { w: 13, h: 15 },
      side: { w: 11, h: 15 },
      'side-left': { w: 11, h: 15 },
    },
    runFrames: {
      down: { w: 12, h: 16 },
      up: { w: 13, h: 16 },
      side: { w: 13, h: 15 },
      'side-left': { w: 13, h: 15 },
    },
    attackFrames: {
      down: { w: 13, h: 16 },
      up: { w: 14, h: 15 },
      side: { w: 11, h: 14 },
      'side-left': { w: 11, h: 14 },
    },
    deathFrames: {
      side: { w: 16, h: 14 },
      'side-left': { w: 16, h: 14 },
    },
  },
  // Frost Wizard intentionally shares Mighty Man's spritePrefix, asset
  // folder, base name, and frame dimensions — he reuses the exact same
  // sheets at runtime and is differentiated visually by the renderer
  // (cyan tint + always-on frost mist + drawn wand overlay). BootScene
  // dedupes sheet loading and animation creation by spritePrefix so this
  // doesn't cause duplicate-key warnings. `hasGun: false` because the
  // wand overlay replaces the gun overlay.
  frost_wizard: {
    id: 'frost_wizard',
    displayName: 'Frost Wizard',
    spritePrefix: 'mighty_man',
    assetFolder: 'player',
    assetBaseName: 'character',
    hasGun: false,
    maxHealth: 85,
    speedMultiplier: 1.08,
    hitbox: { width: 24, height: 24 },
    idleFrameCount: 6,
    runFrameCount: 6,
    attackFrameCount: 4,
    deathFrameCount: 6,
    idleFrames: {
      down: { w: 11, h: 16 },
      up: { w: 11, h: 16 },
      side: { w: 10, h: 16 },
      'side-left': { w: 10, h: 16 },
    },
    runFrames: {
      down: { w: 11, h: 17 },
      up: { w: 11, h: 17 },
      side: { w: 10, h: 17 },
      'side-left': { w: 10, h: 17 },
    },
    attackFrames: {
      down: { w: 12, h: 18 },
      up: { w: 12, h: 17 },
      side: { w: 20, h: 18 },
      'side-left': { w: 20, h: 18 },
    },
    deathFrames: {
      side: { w: 21, h: 16 },
      'side-left': { w: 21, h: 16 },
    },
  },
  // Bubba — the tank. Pack's Zombie_Big: huge HP pool, slow, and a bigger
  // hit-validation box (he's simply easier to hit). Ability: Iron Hide
  // (ABILITY.BUBBA_IRON_HIDE) — brief 50% damage reduction on demand.
  bubba: {
    id: 'bubba',
    displayName: 'Bubba',
    spritePrefix: 'bubba',
    assetFolder: 'enemies',
    assetBaseName: 'zombie-big',
    hasGun: false,
    maxHealth: 150,
    speedMultiplier: 0.85,
    hitbox: { width: 30, height: 30 },
    idleFrameCount: 6,
    runFrameCount: 8,
    attackFrameCount: 8,
    deathFrameCount: 7,
    idleFrames: {
      down: { w: 16, h: 23 },
      up: { w: 16, h: 22 },
      side: { w: 16, h: 22 },
      'side-left': { w: 16, h: 22 },
    },
    runFrames: {
      down: { w: 16, h: 24 },
      up: { w: 16, h: 24 },
      side: { w: 16, h: 24 },
      'side-left': { w: 16, h: 24 },
    },
    attackFrames: {
      down: { w: 20, h: 25 },
      up: { w: 18, h: 24 },
      side: { w: 23, h: 23 },
      'side-left': { w: 23, h: 23 },
    },
    deathFrames: {
      side: { w: 29, h: 23 },
      'side-left': { w: 29, h: 23 },
    },
  },
  // Jack — the skirmisher. Pack's Zombie_Axe (with-axe body variant).
  // Baseline stats; his identity is the Axe Throw projectile
  // (ABILITY.JACK_AXE_THROW) — the roster's first non-hitscan character
  // attack, server-simulated like grenades.
  jack: {
    id: 'jack',
    displayName: 'Jack',
    spritePrefix: 'jack',
    assetFolder: 'enemies',
    assetBaseName: 'zombie-axe',
    hasGun: false,
    maxHealth: 100,
    speedMultiplier: 1.0,
    hitbox: { width: 24, height: 24 },
    idleFrameCount: 6,
    runFrameCount: 8,
    attackFrameCount: 7,
    deathFrameCount: 6,
    idleFrames: {
      down: { w: 13, h: 18 },
      up: { w: 12, h: 23 },
      side: { w: 22, h: 18 },
      'side-left': { w: 22, h: 18 },
    },
    runFrames: {
      down: { w: 12, h: 20 },
      up: { w: 12, h: 23 },
      side: { w: 21, h: 19 },
      'side-left': { w: 21, h: 19 },
    },
    attackFrames: {
      down: { w: 15, h: 21 },
      up: { w: 13, h: 25 },
      side: { w: 25, h: 19 },
      'side-left': { w: 25, h: 19 },
    },
    deathFrames: {
      side: { w: 27, h: 18 },
      'side-left': { w: 27, h: 18 },
    },
    // No-axe body variant, rendered while the thrown axe is in flight or
    // on cooldown (abilityCooldownSeconds > 0). Same 6/8/7 frame counts
    // as the with-axe sheets; dims measured off the pack's No-Axe strips.
    altBody: {
      spritePrefix: 'jack-noaxe',
      assetBaseName: 'zombie-axe-noaxe',
      idleFrames: {
        down: { w: 11, h: 18 },
        up: { w: 11, h: 19 },
        side: { w: 15, h: 18 },
        'side-left': { w: 15, h: 18 },
      },
      runFrames: {
        down: { w: 11, h: 20 },
        up: { w: 11, h: 20 },
        side: { w: 14, h: 19 },
        'side-left': { w: 14, h: 19 },
      },
      attackFrames: {
        down: { w: 12, h: 21 },
        up: { w: 12, h: 21 },
        side: { w: 18, h: 19 },
        'side-left': { w: 18, h: 19 },
      },
      deathFrames: {
        side: { w: 22, h: 18 },
        'side-left': { w: 22, h: 18 },
      },
      deathFrameCount: 6,
    },
  },
  // Rook — the mobile flanker. Reuses Mighty Man's body sheets under the
  // same prefix, then layers the pack's synchronized helmet strips on top.
  // Breach Dash is intentionally utility-only: fast repositioning without
  // damage or invulnerability keeps the 8-second cycle skill-driven.
  rook: {
    id: 'rook',
    displayName: 'Rook',
    spritePrefix: 'mighty_man',
    assetFolder: 'player',
    assetBaseName: 'character',
    hasGun: true,
    maxHealth: 95,
    speedMultiplier: 1.1,
    hitbox: { width: 24, height: 24 },
    idleFrameCount: 6,
    runFrameCount: 6,
    attackFrameCount: 4,
    deathFrameCount: 6,
    idleFrames: {
      down: { w: 11, h: 16 },
      up: { w: 11, h: 16 },
      side: { w: 10, h: 16 },
      'side-left': { w: 10, h: 16 },
    },
    runFrames: {
      down: { w: 11, h: 17 },
      up: { w: 11, h: 17 },
      side: { w: 10, h: 17 },
      'side-left': { w: 10, h: 17 },
    },
    attackFrames: {
      down: { w: 12, h: 18 },
      up: { w: 12, h: 17 },
      side: { w: 20, h: 18 },
      'side-left': { w: 20, h: 18 },
    },
    deathFrames: {
      side: { w: 21, h: 16 },
      'side-left': { w: 21, h: 16 },
    },
    bodyOverlay: {
      spritePrefix: 'rook-helmet',
      assetFolder: 'player',
      assetBaseName: 'rook-helmet',
      idleFrames: {
        down: { w: 10, h: 9 },
        up: { w: 10, h: 9 },
        side: { w: 10, h: 8 },
        'side-left': { w: 10, h: 8 },
      },
      runFrames: {
        down: { w: 10, h: 9 },
        up: { w: 10, h: 9 },
        side: { w: 10, h: 8 },
        'side-left': { w: 10, h: 8 },
      },
      attackFrames: {
        down: { w: 10, h: 10 },
        up: { w: 10, h: 10 },
        side: { w: 13, h: 8 },
        'side-left': { w: 13, h: 8 },
      },
      deathFrames: {
        side: { w: 21, h: 18 },
        'side-left': { w: 21, h: 18 },
      },
    },
  },
}) satisfies Readonly<Record<string, CharacterDef>>;

export type CharacterId = keyof typeof CHARACTERS;
export const CHARACTER_IDS = Object.keys(CHARACTERS) as CharacterId[];

export type CharacterMasteryTierId =
  | 'untested'
  | 'blooded'
  | 'proven'
  | 'veteran'
  | 'master';

export interface CharacterMasteryTier {
  id: CharacterMasteryTierId;
  title: string;
  minWins: number;
}

export interface CharacterMasteryProgress {
  wins: number;
  current: CharacterMasteryTier;
  next: CharacterMasteryTier | null;
  remaining: number;
}

/** Cosmetic per-fighter ladder; wins are never spent or used for balance. */
export const CHARACTER_MASTERY_TIERS: readonly CharacterMasteryTier[] = Object.freeze([
  Object.freeze({ id: 'untested', title: 'UNTESTED', minWins: 0 }),
  Object.freeze({ id: 'blooded', title: 'BLOODED', minWins: 1 }),
  Object.freeze({ id: 'proven', title: 'PROVEN', minWins: 3 }),
  Object.freeze({ id: 'veteran', title: 'VETERAN', minWins: 7 }),
  Object.freeze({ id: 'master', title: 'MASTER', minWins: 15 }),
]);

export function characterMasteryProgressForWins(value: number): CharacterMasteryProgress {
  const wins = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  let current = CHARACTER_MASTERY_TIERS[0];
  let next: CharacterMasteryTier | null = null;
  for (const tier of CHARACTER_MASTERY_TIERS) {
    if (wins >= tier.minWins) current = tier;
    else {
      next = tier;
      break;
    }
  }
  return {
    wins,
    current,
    next,
    remaining: next ? next.minWins - wins : 0,
  };
}

export function createEmptyCharacterWins(): Record<CharacterId, number> {
  return Object.fromEntries(CHARACTER_IDS.map((id) => [id, 0])) as Record<
    CharacterId,
    number
  >;
}

/**
 * Stat-identity accessors. All take `CharacterId | null` because
 * PlayerState.characterId is null until the select screen locks —
 * pre-lock callers get the baseline PLAYER constants.
 */
export function characterMaxHealth(id: CharacterId | null): number {
  return id ? CHARACTERS[id].maxHealth : PLAYER.MAX_HEALTH;
}

export function characterSpeedMultiplier(id: CharacterId | null): number {
  return id ? CHARACTERS[id].speedMultiplier : 1;
}

/**
 * HIT-VALIDATION hitbox dims (bullets, pellets, fire breath, thrown axes —
 * live and lag-comp-rewound alike). Movement collision does NOT use this;
 * it stays on PLAYER.HITBOX_* for every character so map geometry plays
 * identically across the roster (same contract as big_heads).
 */
export function characterHitbox(id: CharacterId | null): { width: number; height: number } {
  return id ? CHARACTERS[id].hitbox : { width: PLAYER.HITBOX_WIDTH, height: PLAYER.HITBOX_HEIGHT };
}

/** Convenience alias for SERVER.TICK_RATE */
export const TICK_RATE = SERVER.TICK_RATE;

/** Convenience alias for SERVER.TICK_INTERVAL (milliseconds) */
export const TICK_INTERVAL_MS = SERVER.TICK_INTERVAL;
