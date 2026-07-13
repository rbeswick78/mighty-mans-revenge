import {
  GameModeType,
  ONE_IN_THE_CHAMBER,
  PickupType,
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
 * One in the Chamber is a complete combat economy: one lethal pistol round
 * on spawn, lethal fists after a miss, and a fresh round for an opponent
 * kill. PlayerState's existing weapon/ammo fields carry the whole state.
 */
export class OneInTheChamberMode implements GameMode {
  readonly excludedMutators: readonly MutatorId[] = [
    'grenades_only',
    'infinite_ammo',
    'fists_only',
    'weapon_roulette',
    // These do not create an interesting second rule here: direct hits are
    // already lethal, health stealing is moot, and grenades cannot be used.
    // Last Laugh would reintroduce free explosive kills into that scarcity;
    // Scavenger Rush can only roll a useless bandage in this lethal mode.
    'low_health',
    'vampire',
    'turbo_grenades',
    'last_laugh',
    'scavenger_rush',
  ];

  private readonly awaitingRespawn = new Set<PlayerId>();
  private readonly earnedRoundThisTick = new Set<PlayerId>();
  private overtimeLoadoutApplied = false;

  onStart(match: MatchContext): void {
    this.awaitingRespawn.clear();
    this.earnedRoundThisTick.clear();
    this.overtimeLoadoutApplied = false;
    for (const player of match.players.values()) {
      this.grantRound(match, player);
      player.grenades = 0;
    }
  }

  onTick(match: MatchContext, _dt: number): void {
    // Match's overtime reset deliberately restores generic rifle loadouts.
    // Detect that edge once and make the sudden-death duel obey this mode.
    if (match.isOvertime && !this.overtimeLoadoutApplied) {
      this.overtimeLoadoutApplied = true;
      for (const player of match.players.values()) {
        if (!player.isDead) this.grantRound(match, player);
      }
    }

    for (const player of match.players.values()) {
      player.grenades = 0;
      player.grenadeRegenSeconds = 0;
      player.specialReserve = 0;
      player.isReloading = false;
      player.reloadTimer = 0;
      if (player.isDead) continue;

      if (this.awaitingRespawn.delete(player.id)) {
        this.grantRound(match, player);
        continue;
      }

      // The generic fire path installs its normal pistol/punch recovery
      // after onKill returns. A kill reward is intentionally immediate.
      if (this.earnedRoundThisTick.delete(player.id)) {
        match.clearWeaponTransients(player.id);
      }

      if (player.weaponId === 'pistol' && player.specialAmmo > 0) {
        player.specialAmmo = ONE_IN_THE_CHAMBER.CHAMBERED_ROUNDS;
        continue;
      }

      // A spent pistol auto-reverts to the generic rifle inside Match.
      // Any dry pistol, rifle, or incompatible forced pickup becomes fists.
      if (player.weaponId !== 'punch') {
        this.equipPunch(match, player);
      }
    }
  }

  onKill(
    match: MatchContext,
    killerId: PlayerId,
    victimId: PlayerId,
    weapon: KillWeapon,
  ): void {
    this.awaitingRespawn.add(victimId);
    if (match.isOvertime || killerId === victimId) return;
    // A barrel kill is necessarily initiated by the chambered pistol in
    // this mode (grenades and abilities are disabled), so reward the clever
    // bank shot exactly like a direct hit or recovery punch.
    if (weapon !== 'pistol' && weapon !== 'punch' && weapon !== 'barrel') return;

    const killer = match.players.get(killerId);
    if (!killer) return;
    killer.score++;
    this.grantRound(match, killer);
    this.earnedRoundThisTick.add(killer.id);
  }

  /** Only healing remains on the map; weapons/ammo would break scarcity. */
  isPickupTypeEnabled(type: PickupType): boolean {
    return type === PickupType.BANDAGE;
  }

  areGrenadesDisabled(_match: MatchContext, _player: PlayerState): boolean {
    return true;
  }

  areAbilitiesDisabled(_match: MatchContext, _player: PlayerState): boolean {
    return true;
  }

  damageForWeaponHit(
    _match: MatchContext,
    _attacker: PlayerState,
    victim: PlayerState,
    weaponId: WeaponId,
    baseDamage: number,
  ): number {
    if (weaponId !== 'pistol' && weaponId !== 'punch') return baseDamage;
    // Exact remaining health keeps damage stats/contracts honest: a fighter
    // softened by a barrel should not award artificial overkill damage.
    return victim.health;
  }

  isMatchOver(match: MatchContext): boolean {
    for (const player of match.players.values()) {
      if (player.score >= ONE_IN_THE_CHAMBER.SCORE_TARGET) return true;
    }
    return match.matchTimer <= 0;
  }

  determineWinner(match: MatchContext): PlayerId | null {
    const players = [...match.players.values()].sort((a, b) => b.score - a.score);
    if (players.length === 0) return null;
    const top = players[0];
    const second = players[1];
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
      gameMode: GameModeType.ONE_IN_THE_CHAMBER,
      awards: computeAwards(
        playerStats,
        (id) => match.players.get(id)?.nickname ?? 'UNKNOWN',
      ),
      rivalry: null,
      rivalrySet: null,
      isPractice: false,
      nextMapName: null,
      nextGameMode: null,
      wentToOvertime: match.isOvertime,
    };
  }

  private grantRound(match: MatchContext, player: PlayerState): void {
    player.weaponId = 'pistol';
    player.specialAmmo = ONE_IN_THE_CHAMBER.CHAMBERED_ROUNDS;
    player.specialReserve = 0;
    player.isReloading = false;
    player.reloadTimer = 0;
    match.clearWeaponTransients(player.id);
  }

  private equipPunch(match: MatchContext, player: PlayerState): void {
    player.weaponId = 'punch';
    player.specialAmmo = 0;
    player.specialReserve = 0;
    player.isReloading = false;
    player.reloadTimer = 0;
    match.clearWeaponTransients(player.id);
  }
}
