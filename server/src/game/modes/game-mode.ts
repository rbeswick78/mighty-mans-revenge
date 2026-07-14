import type {
  PlayerId,
  PlayerState,
  MatchResult,
  MapData,
  KothHudState,
  KillWeapon,
  KillConfirmedTagState,
  KillConfirmedCollection,
  CoreRunState,
  BountyHuntState,
  MutatorId,
  PickupType,
  WeaponId,
  TeamId,
} from '@shared/game';
import type { StatsTracker } from '../stats-tracker.js';

/** Context interface so game modes can read match state without tight coupling. */
export interface MatchContext {
  matchId: string;
  matchTimer: number;
  players: Map<PlayerId, PlayerState>;
  stats: StatsTracker;
  /**
   * True while the match is in sudden-death overtime. Modes must stop
   * accruing scoreboard points during it — otherwise an overtime timeout
   * could produce a winner instead of the promised true draw.
   */
  isOvertime: boolean;
  getKillTarget(): number;
  getTimeLimit(): number;
  /** The map this match is played on (modes read kothHills etc. from it). */
  getMapData(): MapData;
  /**
   * Seconds of play so far, overtime included — matchTimer alone can't
   * express this because entering overtime resets it to OVERTIME.DURATION.
   */
  getElapsedSeconds(): number;
  /**
   * Clear the match's server-internal per-player fire state (pending
   * burst + fire-cooldown timer). Modes call this when they swap a
   * player's weapon out from under them (Gun Game rung changes), so a
   * stale rifle burst or shotgun rack can't leak onto the new weapon.
   */
  clearWeaponTransients(playerId: PlayerId): void;
  /** Optional side helpers used by team-compatible modes. */
  getTeamId?(playerId: PlayerId): TeamId | null;
  getTeamIds?(): TeamId[];
  getTeamScore?(teamId: TeamId): number;
}

/** Team score rows when a match has complete side helpers, otherwise null. */
export function teamScoreRows(
  match: MatchContext,
): Array<{ teamId: TeamId; score: number }> | null {
  const teamIds = match.getTeamIds?.() ?? [];
  if (teamIds.length === 0 || !match.getTeamScore) return null;
  return teamIds.map((teamId) => ({ teamId, score: match.getTeamScore!(teamId) }));
}

/** Whether any side has collectively reached an objective's score target. */
export function hasTeamReachedScore(match: MatchContext, target: number): boolean {
  return teamScoreRows(match)?.some(({ score }) => score >= target) ?? false;
}

/**
 * Representative player for the uniquely leading side. Match converts this
 * back to winnerTeamId in the final result; null deliberately triggers normal
 * sudden-death handling for an exact team tie.
 */
export function determineTeamLeader(match: MatchContext): PlayerId | null {
  const rows = teamScoreRows(match);
  if (!rows || !match.getTeamId) return null;
  rows.sort((left, right) => right.score - left.score || left.teamId.localeCompare(right.teamId));
  if (rows[1] && rows[0].score === rows[1].score) return null;
  return (
    [...match.players.values()].find((player) => match.getTeamId!(player.id) === rows[0].teamId)
      ?.id ?? null
  );
}

export interface GameMode {
  onStart(match: MatchContext): void;
  onTick(match: MatchContext, dt: number): void;
  onKill(match: MatchContext, killerId: PlayerId, victimId: PlayerId, weapon: KillWeapon): void;
  isMatchOver(match: MatchContext): boolean;
  getResults(match: MatchContext): MatchResult;
  /**
   * Scoreboard winner right now; null means a genuine tie. Match calls
   * this when isMatchOver flips true — a null answer (with 2+ players)
   * sends the match into sudden-death overtime instead of ending it.
   */
  determineWinner(match: MatchContext): PlayerId | null;
  /**
   * Per-tick King of the Hill HUD state, merged into gameState broadcasts.
   * Only modes with a hill implement it.
   */
  getKothState?(match: MatchContext): KothHudState;
  /** Active objective tokens for Kill Confirmed snapshots and bot routing. */
  getKillConfirmedTags?(match: MatchContext): readonly KillConfirmedTagState[];
  /** One-tick confirm/deny events used for client feedback. */
  getKillConfirmedCollections?(match: MatchContext): readonly KillConfirmedCollection[];
  /** Persistent moving-objective state for Core Run snapshots and bots. */
  getCoreRunState?(match: MatchContext): CoreRunState;
  /** Current marked fighter for Bounty Hunt snapshots and Practice routing. */
  getBountyHuntState?(match: MatchContext): BountyHuntState;
  /**
   * Mutators this mode removes from BOTH random rolls (mid-match and
   * final-minute). The FORCE_EVENT / FORCE_MIDMATCH_MUTATOR env pins
   * bypass the exclusion — they're smoke-test tools and keep their
   * pre-mode semantics.
   */
  readonly excludedMutators?: readonly MutatorId[];
  /**
   * Pickup-type veto applied when the match's pickups are created from
   * map data. Types the mode disables never spawn and never announce.
   * Omitted = every pickup the map declares spawns.
   */
  isPickupTypeEnabled?(type: PickupType): boolean;
  /**
   * Per-player gun gate, OR'd with the grenades_only mutator check in
   * the input loop (Gun Game's grenade rung). Blocks all firePressed
   * weapon fire; grenade throws stay live.
   */
  areGunsDisabled?(match: MatchContext, player: PlayerState): boolean;
  /** Mode-level input gates for rulesets that own the whole combat economy. */
  areGrenadesDisabled?(match: MatchContext, player: PlayerState): boolean;
  areAbilitiesDisabled?(match: MatchContext, player: PlayerState): boolean;
  /**
   * Optional authoritative damage rewrite for a validated direct weapon hit.
   * Spawn protection and hit detection have already passed; Match still routes
   * the returned amount through CombatManager's single damage choke point.
   */
  damageForWeaponHit?(
    match: MatchContext,
    attacker: PlayerState,
    victim: PlayerState,
    weaponId: WeaponId,
    baseDamage: number,
  ): number;
  /**
   * Whether a dead player may return. Omitted = normal respawns. Last Stand
   * uses this to keep zero-life fighters eliminated in N-player matches and
   * out of sudden-death overtime.
   */
  canRespawn?(match: MatchContext, player: PlayerState): boolean;
}
