import {
  GameModeType,
  GRENADE,
  GUN_GAME,
  PickupType,
  WEAPONS,
  gunGameRungForScore,
  gunGameTotalKills,
  rungWeaponToKillWeapon,
} from '@shared/game';
import type {
  KillWeapon,
  MatchResult,
  MutatorId,
  PlayerId,
  PlayerState,
  WeaponId,
} from '@shared/game';
import { computeAwards } from '../awards.js';
import type { GameMode, MatchContext } from './game-mode.js';

/**
 * Gun Game: every kill made with your current rung weapon marches you down
 * the GUN_GAME.LADDER (rifle → shotgun → pistol → grenades → punch); the
 * first player through the whole ladder wins. PlayerState.score carries
 * total ladder kills — the rung is DERIVED from it via the shared
 * gunGameRungForScore, so the client HUD and this mode can never disagree.
 *
 * The mode is the loadout authority: onTick enforces each living player's
 * rung loadout every tick, which also self-heals the generic rifle reset
 * done by death/respawn/overtime entry (those code paths stay untouched —
 * the mismatch is corrected within one tick). Ammo can never strand a
 * rung: reserves stay topped to the GUN_GAME floors and the grenade rung
 * refills on a timer, so auto-revert can't fire.
 */
export class GunGameMode implements GameMode {
  /**
   * grenades_only would gate the very guns the ladder is about, and
   * infinite_ammo fights the reserve-floor economy, while fists_only and
   * weapon_roulette would bypass the ladder entirely, while free corpse-bomb
   * grenade kills could advance the wrong rung. Scavenger Rush can only roll
   * bandages after the mode veto, so it adds noise instead of a real contest.
   * All six stay out of random
   * rolls (FORCE_* env pins still bypass — smoke tools).
   */
  readonly excludedMutators: readonly MutatorId[] = [
    'grenades_only',
    'infinite_ammo',
    'fists_only',
    'weapon_roulette',
    'last_laugh',
    'scavenger_rush',
  ];

  /**
   * Per-player rung index as of that player's last living tick, for
   * rung-entry one-shots (the grenade rung's fill-on-entry). Populated
   * lazily on each player's first enforced tick.
   */
  private readonly lastRungIndex = new Map<PlayerId, number>();

  onStart(_match: MatchContext): void {
    // No arena setup — the ladder state lives on PlayerState.score.
  }

  /** The ladder IS the weapon economy: only bandages spawn from the map. */
  isPickupTypeEnabled(type: PickupType): boolean {
    return type === PickupType.BANDAGE;
  }

  /**
   * The grenade rung keeps the rifle in hand for rendering, but pulling
   * the trigger does nothing — grenades are the rung's whole point.
   */
  areGunsDisabled(_match: MatchContext, player: PlayerState): boolean {
    return gunGameRungForScore(player.score).weapon === 'grenade';
  }

  onTick(match: MatchContext, dt: number): void {
    // Loadout enforcement runs during overtime too — the duel is fought
    // with rung weapons; only scoring (onKill) is frozen.
    for (const [playerId, player] of match.players) {
      if (player.isDead) continue;

      const rung = gunGameRungForScore(player.score);
      const rungEntered = this.lastRungIndex.get(playerId) !== rung.rungIndex;
      this.lastRungIndex.set(playerId, rung.rungIndex);

      // The grenade rung holds the (gated) rifle; every other rung holds
      // its own weapon.
      const expectedWeapon: WeaponId = rung.weapon === 'grenade' ? 'rifle' : rung.weapon;

      if (player.weaponId !== expectedWeapon) {
        // Fresh spawn, post-kill advance, or overtime reset — re-equip.
        // The new weapon arrives with a full mag and a clean slate: no
        // leftover reload, burst, or fire-cooldown from the old one.
        player.weaponId = expectedWeapon;
        player.isReloading = false;
        player.reloadTimer = 0;
        if (expectedWeapon === 'shotgun' || expectedWeapon === 'pistol') {
          player.specialAmmo = WEAPONS[expectedWeapon].magazineSize;
          player.specialReserve = reserveFloorFor(expectedWeapon);
        } else {
          player.specialAmmo = 0;
          player.specialReserve = 0;
        }
        match.clearWeaponTransients(playerId);
      }

      // Reserve floors: topped up every tick so the shotgun/pistol
      // auto-revert-when-dry path can never fire in this mode.
      if (player.weaponId === 'shotgun' || player.weaponId === 'pistol') {
        player.specialReserve = Math.max(player.specialReserve, reserveFloorFor(player.weaponId));
      }

      if (rung.weapon === 'grenade') {
        if (rungEntered) {
          // Rung entry arrives with a full pouch, mirroring the full-mag
          // contract of the weapon rungs.
          player.grenades = GRENADE.MAX_COUNT;
          player.grenadeRegenSeconds = 0;
        } else if (player.grenades >= GRENADE.MAX_COUNT) {
          player.grenadeRegenSeconds = 0;
        } else {
          player.grenadeRegenSeconds += dt;
          if (player.grenadeRegenSeconds >= GUN_GAME.GRENADE_REFILL_SECONDS) {
            player.grenades = Math.min(GRENADE.MAX_COUNT, player.grenades + 1);
            player.grenadeRegenSeconds = 0;
          }
        }
      }
    }
  }

  onKill(match: MatchContext, killerId: PlayerId, victimId: PlayerId, weapon: KillWeapon): void {
    // Overtime is settled by Match's generic first-kill rule; the ladder
    // score freezes so a sudden-death timeout stays a true draw.
    if (match.isOvertime) return;
    // Self-kills never advance the ladder.
    if (killerId === victimId) return;
    const killer = match.players.get(killerId);
    if (!killer) return;

    // Only kills made WITH the current rung weapon advance — ability
    // kills ('axe'/'fire') and wrong-weapon kills score nothing.
    const rung = gunGameRungForScore(killer.score);
    if (weapon !== rungWeaponToKillWeapon(rung.weapon)) return;

    killer.score++;
  }

  isMatchOver(match: MatchContext): boolean {
    for (const player of match.players.values()) {
      if (player.score >= gunGameTotalKills()) return true;
    }
    return match.matchTimer <= 0;
  }

  determineWinner(match: MatchContext): PlayerId | null {
    const players = Array.from(match.players.values());
    if (players.length === 0) return null;

    players.sort((a, b) => b.score - a.score);
    const top = players[0];
    const second = players[1];

    // Equal ladder kills is a genuine tie — overtime settles it. No
    // secondary criterion: ladder progress IS the score in this mode.
    if (second && top.score === second.score) return null;
    return top.id;
  }

  getResults(match: MatchContext): MatchResult {
    const playerStats = match.stats.getAllStats();
    return {
      matchId: match.matchId,
      winnerId: this.determineWinner(match),
      playerStats,
      duration: match.getElapsedSeconds(),
      gameMode: GameModeType.GUN_GAME,
      awards: computeAwards(playerStats, (id) => match.players.get(id)?.nickname ?? 'UNKNOWN'),
      // Attached by the matchmaking manager — see DeathmatchMode.
      rivalry: null,
      rivalrySet: null,
      isPractice: false,
      nextMapName: null,
      nextGameMode: null,
      wentToOvertime: match.isOvertime,
    };
  }
}

/** specialReserve floor for the rung weapons that carry a reserve. */
function reserveFloorFor(weaponId: 'shotgun' | 'pistol'): number {
  return weaponId === 'shotgun' ? GUN_GAME.SHOTGUN_RESERVE_FLOOR : GUN_GAME.PISTOL_RESERVE_FLOOR;
}
