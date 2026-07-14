import type { PlayerId } from '@shared/types/common.js';
import type { DraftCategory, ServerDraftStateMessage } from '@shared/types/network.js';

/**
 * Pure state derivation for the DraftScene. Phaser-free (same contract as
 * ui/leaderboard-format.ts) so the pick-flow logic and the spectacle hop
 * scheduling stay unit-testable — the scene is a projector of these
 * functions. Everything derives from the latest draftState snapshot; the
 * server is authoritative and echoes any accepted pick within a tick.
 */

/** Everything the pick UI renders for one draftState snapshot. */
export interface DraftView {
  /** Group ballot rather than the classic two-role draft. */
  isRally: boolean;
  /** True when the server is waiting on the local player's pick. */
  yourTurn: boolean;
  /** Categories the local player may pick right now (empty otherwise). */
  enabledCategories: DraftCategory[];
  /** Status line under the columns — exact strings are e2e hooks. */
  statusLine: string;
  /** Locked-badge tag for the MAP column, null while unpicked. */
  mapBadge: string | null;
  /** Locked-badge tag for the MODE column, null while unpicked. */
  modeBadge: string | null;
  /** Both picks in — the draft is settled, matchFound is imminent. */
  complete: boolean;
  /** Accepted ballots by option for the active rally phase. */
  voteCounts: Record<string, number>;
  /** Local player's immutable ballot in the active phase. */
  localVote: string | null;
}

/**
 * The category the FIRST pick claimed, derivable only while exactly one
 * pick is in (a completed snapshot alone can't attribute picks — the scene
 * caches this function's first non-null answer and feeds it back into
 * deriveDraftView so completed drafts keep correct badge attribution).
 * Null before any pick and — deliberately — once both picks are in.
 */
export function firstPickedCategory(snapshot: ServerDraftStateMessage): DraftCategory | null {
  if (snapshot.mapPick !== null && snapshot.modePick === null) return 'map';
  if (snapshot.modePick !== null && snapshot.mapPick === null) return 'mode';
  return null;
}

/**
 * True when the scene should skip the who-picks-first spectacle: a pick is
 * already recorded, so we arrived late (reconnect, slow scene handoff) and
 * replaying the theater would eat into the real pick window.
 */
export function shouldSkipSpectacle(snapshot: ServerDraftStateMessage): boolean {
  return snapshot.draftKind === 'rally' || snapshot.mapPick !== null || snapshot.modePick !== null;
}

/**
 * Project a draftState snapshot into everything the pick UI shows.
 * `firstPicked` is the scene's cached firstPickedCategory answer (null is
 * fine — badges then fall back to a nickname-less "LOCKED IN" for the
 * arrived-after-completion edge case).
 */
export function deriveDraftView(
  snapshot: ServerDraftStateMessage,
  localPlayerId: PlayerId | null,
  firstPicked: DraftCategory | null,
): DraftView {
  if (snapshot.draftKind === 'rally') {
    const complete = snapshot.mapPick !== null && snapshot.modePick !== null;
    const category = snapshot.rallyCategory ?? null;
    const votes = snapshot.rallyVotes ?? [];
    const localVote = votes.find((vote) => vote.playerId === localPlayerId)?.value ?? null;
    const voteCounts: Record<string, number> = {};
    for (const vote of votes) voteCounts[vote.value] = (voteCounts[vote.value] ?? 0) + 1;
    const yourTurn = !complete && category !== null && localPlayerId !== null && localVote === null;
    const remaining = Math.max(0, snapshot.players.length - votes.length);
    let statusLine: string;
    if (complete) {
      statusLine = 'GROUP PICKS LOCKED IN';
    } else if (yourTurn) {
      statusLine = `YOUR VOTE - CHOOSE A ${category === 'map' ? 'MAP' : 'MODE'}`;
    } else if (localVote !== null) {
      statusLine = `VOTE CAST - WAITING FOR ${remaining} FIGHTER${remaining === 1 ? '' : 'S'}`;
    } else {
      statusLine = `GROUP IS VOTING FOR A ${category === 'map' ? 'MAP' : 'MODE'}...`;
    }
    return {
      isRally: true,
      yourTurn,
      enabledCategories: yourTurn && category !== null ? [category] : [],
      statusLine,
      mapBadge: snapshot.mapPick === null ? null : 'GROUP PICK',
      modeBadge: snapshot.modePick === null ? null : 'GROUP PICK',
      complete,
      voteCounts,
      localVote,
    };
  }

  const nickOf = (id: PlayerId | null): string => {
    const player = snapshot.players.find((p) => p.id === id);
    return (player?.nickname ?? 'OPPONENT').toUpperCase();
  };

  const complete = snapshot.mapPick !== null && snapshot.modePick !== null;
  const yourTurn =
    !complete && localPlayerId !== null && snapshot.currentPickerId === localPlayerId;

  const enabledCategories: DraftCategory[] = [];
  if (yourTurn) {
    if (snapshot.mapPick === null) enabledCategories.push('map');
    if (snapshot.modePick === null) enabledCategories.push('mode');
  }

  // Badge attribution: while exactly one pick is in, it was necessarily
  // made by the first picker. Once both are in, the cached firstPicked
  // hint splits the two columns between first and second picker.
  const firstNick = nickOf(snapshot.firstPickerId);
  const secondPicker = snapshot.players.find((p) => p.id !== snapshot.firstPickerId) ?? null;
  const secondNick = (secondPicker?.nickname ?? 'OPPONENT').toUpperCase();

  let mapBadge: string | null = null;
  let modeBadge: string | null = null;
  if (complete) {
    if (firstPicked === 'map') {
      mapBadge = `${firstNick} PICKED`;
      modeBadge = `${secondNick} PICKED`;
    } else if (firstPicked === 'mode') {
      modeBadge = `${firstNick} PICKED`;
      mapBadge = `${secondNick} PICKED`;
    } else {
      mapBadge = 'LOCKED IN';
      modeBadge = 'LOCKED IN';
    }
  } else if (snapshot.mapPick !== null) {
    mapBadge = `${firstNick} PICKED`;
  } else if (snapshot.modePick !== null) {
    modeBadge = `${firstNick} PICKED`;
  }

  let statusLine: string;
  if (complete) {
    statusLine = 'PICKS LOCKED IN';
  } else if (yourTurn) {
    if (enabledCategories.length === 2) {
      statusLine = 'YOUR PICK - CHOOSE A MAP OR A MODE';
    } else if (enabledCategories[0] === 'map') {
      statusLine = 'YOUR PICK - CHOOSE A MAP';
    } else {
      statusLine = 'YOUR PICK - CHOOSE A MODE';
    }
  } else {
    statusLine = `${nickOf(snapshot.currentPickerId)} IS CHOOSING...`;
  }

  return {
    isRally: false,
    yourTurn,
    enabledCategories,
    statusLine,
    mapBadge,
    modeBadge,
    complete,
    voteCounts: {},
    localVote: null,
  };
}

/** One highlight move of the who-picks-first spectacle. */
export interface SpectacleHop {
  /** Ms after spectacle start at which the highlight moves. */
  atMs: number;
  /** Which contender (0 or 1, display order) the highlight lands on. */
  index: number;
}

export interface HopSchedule {
  hops: SpectacleHop[];
  /** Ms of the final hop — the moment the highlight settles on the winner. */
  landMs: number;
}

export interface HopScheduleOpts {
  /** First hop interval; each subsequent hop stretches by `stretch`. */
  initialHopMs?: number;
  /** Deceleration factor (> 1) applied per hop. */
  stretch?: number;
  /** No hop is scheduled past this — leaves room for the landing beat. */
  budgetMs?: number;
}

/**
 * Deterministic hop schedule for the "WHO PICKS FIRST?" ping-pong. The
 * highlight starts on contender 0 at t=0 and alternates on every hop,
 * decelerating (each interval multiplied by `stretch`) until the budget
 * runs out. The outcome is server-rolled and already known, so the
 * animation is pure theater: if the naturally-final hop lands on the
 * loser, it is dropped — consecutive hops alternate, so the schedule then
 * ends on the winner, and the longer final hold reads as the wheel
 * settling.
 */
export function buildHopSchedule(winnerIndex: number, opts: HopScheduleOpts = {}): HopSchedule {
  const initialHopMs = opts.initialHopMs ?? 80;
  const stretch = opts.stretch ?? 1.28;
  const budgetMs = opts.budgetMs ?? 1900;

  const hops: SpectacleHop[] = [];
  let t = 0;
  let delay = initialHopMs;
  let index = 0;
  while (t + delay <= budgetMs) {
    t += delay;
    index = index === 0 ? 1 : 0;
    hops.push({ atMs: Math.round(t), index });
    delay *= stretch;
  }

  if (hops.length > 0 && hops[hops.length - 1].index !== winnerIndex) {
    hops.pop();
  }
  // Degenerate-opts guard (budget too small for any winning hop): land
  // directly on the winner rather than returning an empty schedule.
  if (hops.length === 0 || hops[hops.length - 1].index !== winnerIndex) {
    hops.push({ atMs: initialHopMs, index: winnerIndex });
  }

  return { hops, landMs: hops[hops.length - 1].atMs };
}

/** Countdown label, e.g. "AUTO-PICK IN 0:15". Ceils; clamps at 0:00. */
export function formatDraftCountdown(remainingMs: number): string {
  const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `AUTO-PICK IN ${mins}:${String(secs).padStart(2, '0')}`;
}

/** Rally equivalent of the draft timer; the deadline resolves the current ballot. */
export function formatRallyCountdown(remainingMs: number): string {
  return formatDraftCountdown(remainingMs).replace('AUTO-PICK', 'VOTE CLOSES');
}
