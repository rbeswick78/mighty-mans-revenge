import {
  CHARACTERS,
  CHARACTER_IDS,
  arenaMasteryProgressForWins,
  careerRankProgressForContracts,
} from '@shared/config/game.js';
import { listMapNames } from '@shared/maps/registry.js';
import type { PlayerId } from '@shared/types/common.js';
import type { MatchResult } from '@shared/types/game.js';
import type { ArenaWins } from '@shared/types/map.js';
import type {
  LeaderboardEntry,
  ServerDailyGauntletLeaderboardMessage,
} from '@shared/types/network.js';
import { CREW_TOUR_STORAGE_KEY, normalizeCrewTourRecord } from '../crew-tour.js';
import {
  DAILY_GAUNTLET_PROGRESS_STORAGE_KEY,
  dailyGauntletProgressForKey,
  normalizeDailyGauntletProgress,
} from '../daily-gauntlet.js';
import {
  GAUNTLET_BUILD_CODEX_STORAGE_KEY,
  GAUNTLET_BUILD_IDS,
  gauntletBuildCodexCombinedBest,
  normalizeGauntletBuildCodex,
} from '../gauntlet-build-codex.js';
import {
  GAUNTLET_BEST_CLEAR_STORAGE_KEY,
  normalizeGauntletBestClear,
} from '../practice-gauntlet.js';
import { SCRAP_PIT_RECORD_STORAGE_KEY, normalizeScrapPitRecord } from '../scrap-pit-record.js';
import { characterMasteryLabel } from '../character-mastery.js';

export const REFORGED_RECORD_SECTION_IDS = Object.freeze([
  'career',
  'leaderboards',
  'rivalry',
  'fighters',
  'arenas',
  'challenges',
  'battle_royale',
] as const);

export type ReforgedRecordSectionId = (typeof REFORGED_RECORD_SECTION_IDS)[number];

export interface ReforgedRecordSection {
  readonly id: ReforgedRecordSectionId;
  readonly label: string;
  readonly summary: string;
  readonly heading: string;
  readonly authority: string;
  readonly columns: readonly [readonly string[], readonly string[]];
}

export interface ReforgedRecordsServerSnapshots {
  readonly nickname: string;
  readonly localPlayerId: PlayerId | null;
  readonly leaderboard: readonly LeaderboardEntry[];
  readonly dailyLeaderboard: ServerDailyGauntletLeaderboardMessage | null;
  readonly characterWins: Readonly<Record<(typeof CHARACTER_IDS)[number], number>>;
  readonly arenaWins: Readonly<ArenaWins> | null;
  readonly lastMatchResult: MatchResult | null;
}

export interface ReforgedRecordsLocalValues {
  readonly scrapPit: string | null;
  readonly gauntletBest: string | null;
  readonly daily: string | null;
  readonly codex: string | null;
  readonly crewTour: string | null;
}

export function readReforgedRecordsLocalValues(storage: Storage): ReforgedRecordsLocalValues {
  return {
    scrapPit: storage.getItem(SCRAP_PIT_RECORD_STORAGE_KEY),
    gauntletBest: storage.getItem(GAUNTLET_BEST_CLEAR_STORAGE_KEY),
    daily: storage.getItem(DAILY_GAUNTLET_PROGRESS_STORAGE_KEY),
    codex: storage.getItem(GAUNTLET_BUILD_CODEX_STORAGE_KEY),
    crewTour: storage.getItem(CREW_TOUR_STORAGE_KEY),
  };
}

function formatCount(value: number): string {
  return value.toLocaleString('en-US');
}

function sameCallsign(left: string, right: string): boolean {
  return left.trim().toLocaleLowerCase('en-US') === right.trim().toLocaleLowerCase('en-US');
}

function localLeaderboardEntry(
  nickname: string,
  leaderboard: readonly LeaderboardEntry[],
): { entry: LeaderboardEntry; rank: number } | null {
  const index = leaderboard.findIndex((entry) => sameCallsign(entry.nickname, nickname));
  return index === -1 ? null : { entry: leaderboard[index], rank: index + 1 };
}

function localCareerContracts(
  snapshots: ReforgedRecordsServerSnapshots,
  boardEntry: LeaderboardEntry | null,
): number | null {
  if (boardEntry) return boardEntry.contractsCompleted ?? 0;
  const { lastMatchResult, localPlayerId } = snapshots;
  if (!lastMatchResult || !localPlayerId || lastMatchResult.isPractice) return null;
  return lastMatchResult.contract?.careerCompletions[localPlayerId] ?? null;
}

function careerSection(snapshots: ReforgedRecordsServerSnapshots): ReforgedRecordSection {
  const board = localLeaderboardEntry(snapshots.nickname, snapshots.leaderboard);
  const contracts = localCareerContracts(snapshots, board?.entry ?? null);
  const rank = contracts === null ? null : careerRankProgressForContracts(contracts);
  const streak =
    snapshots.localPlayerId === null
      ? undefined
      : snapshots.lastMatchResult?.winStreaks?.[snapshots.localPlayerId];
  const identity =
    snapshots.nickname.trim().length > 0 ? snapshots.nickname.toUpperCase() : 'NO CALLSIGN';
  const progress = rank?.next
    ? `${rank.completed}/${rank.next.minContracts} CONTRACTS TO ${rank.next.title}`
    : rank
      ? `${rank.completed} CONTRACTS / MAX RANK`
      : 'PLAY A REAL MATCH TO RECEIVE A CAREER SNAPSHOT';
  const recordLines = board
    ? [
        `ALL-TIME TOP 5 / #${board.rank}`,
        `${board.entry.wins} W / ${board.entry.losses} L / ${board.entry.draws} D`,
        `${formatCount(board.entry.matches)} MATCHES / ${formatCount(board.entry.kills)} KOs`,
      ]
    : ['ALL-TIME DETAIL NOT PRESENT IN THE TOP-5 SNAPSHOT', 'NO SAVED VALUE WAS INFERRED'];
  const streakLines = streak
    ? [
        `CURRENT WIN RUN / ${formatCount(streak.current)}`,
        `BEST WIN RUN / ${formatCount(streak.best)}`,
      ]
    : ['WIN-RUN SNAPSHOT ARRIVES AFTER A REAL MATCH'];

  return {
    id: 'career',
    label: 'CAREER',
    summary: rank?.current.title ?? 'SERVER SNAPSHOT',
    heading: `CAREER / ${identity}`,
    authority: 'SERVER-AUTHORED LIFETIME TOTALS / PRESENTATION ONLY',
    columns: [
      [
        rank ? `REPUTATION / ${rank.current.title}` : 'REPUTATION / SNAPSHOT PENDING',
        progress,
        '',
        ...streakLines,
      ],
      recordLines,
    ],
  };
}

function leaderboardsSection(snapshots: ReforgedRecordsServerSnapshots): ReforgedRecordSection {
  const allTime = snapshots.leaderboard.length
    ? snapshots.leaderboard.map(
        (entry, index) =>
          `#${index + 1} ${entry.nickname.toUpperCase()} / ${entry.wins}W ${entry.losses}L ${entry.draws}D / ${formatCount(entry.kills)} KOs`,
      )
    : ['NO ALL-TIME RECORDS YET'];
  const daily = snapshots.dailyLeaderboard;
  const dailyRows = daily?.entries.length
    ? daily.entries.map(
        (entry, index) =>
          `#${index + 1} ${entry.nickname.toUpperCase()} / ${formatCount(entry.score)}`,
      )
    : ['NO DAILY CLEARS YET / SET THE FIRST SCORE'];

  return {
    id: 'leaderboards',
    label: 'BOARDS',
    summary: 'ALL-TIME + DAILY',
    heading: 'SERVER LEADERBOARDS',
    authority: 'ORDER, SCORES, RETENTION, AND RANKING ARE SERVER OWNED',
    columns: [
      ['ALL-TIME TOP 5 / W-L-D / KOs', ...allTime],
      [`DAILY TOP 5 / ${daily?.challengeKey ?? 'SERVER DATE PENDING'} UTC`, ...dailyRows],
    ],
  };
}

function rivalrySection(snapshots: ReforgedRecordsServerSnapshots): ReforgedRecordSection {
  const rivalry = snapshots.lastMatchResult?.rivalry;
  const set = snapshots.lastMatchResult?.rivalrySet;
  const lifetime = rivalry
    ? [
        'LATEST HEAD-TO-HEAD',
        `${rivalry.nicknameA.toUpperCase()} ${rivalry.winsA} - ${rivalry.winsB} ${rivalry.nicknameB.toUpperCase()}`,
        `DRAWS / ${rivalry.draws}`,
      ]
    : ['NO HEAD-TO-HEAD SNAPSHOT YET', 'FINISH A REAL DUEL TO VIEW THE LATEST RIVALRY'];
  const currentSet = set
    ? [
        `LATEST FIRST-TO-${set.winsToClinch} SET`,
        ...set.players.map((player) => `${player.nickname.toUpperCase()} / ${player.wins} WINS`),
        set.championId ? 'SET CLINCHED' : `ROUNDS PLAYED / ${set.roundsPlayed}`,
      ]
    : ['NO ACTIVE RIVALRY SET SNAPSHOT', 'SETS REMAIN SESSION-ONLY'];

  return {
    id: 'rivalry',
    label: 'RIVALRY',
    summary: rivalry ? 'LATEST DUEL' : 'NO SNAPSHOT',
    heading: 'RIVALRY RECORDS',
    authority: 'LATEST SERVER-AUTHORED DUEL RESULT / NO CLIENT INFERENCE',
    columns: [lifetime, currentSet],
  };
}

function fightersSection(snapshots: ReforgedRecordsServerSnapshots): ReforgedRecordSection {
  const lines = CHARACTER_IDS.map((fighterId) => {
    const mastery = characterMasteryLabel(snapshots.characterWins[fighterId]).replace(' · ', ' / ');
    return `${CHARACTERS[fighterId].displayName.toUpperCase()} / ${mastery}`;
  });
  return {
    id: 'fighters',
    label: 'FIGHTERS',
    summary: 'MASTERY',
    heading: 'FIGHTER MASTERY',
    authority: 'LATEST SERVER-AUTHORED REAL-MATCH WIN SNAPSHOT',
    columns: [lines.slice(0, 3), lines.slice(3)],
  };
}

function arenaMasteryLine(arenaName: string, arenaWins: Readonly<ArenaWins> | null): string {
  if (!arenaWins || !Object.prototype.hasOwnProperty.call(arenaWins, arenaName)) {
    return `${arenaName.toUpperCase()} / SNAPSHOT PENDING`;
  }
  const progress = arenaMasteryProgressForWins(arenaWins[arenaName] ?? 0);
  const detail = progress.next
    ? `${progress.current.title} / ${progress.wins}/${progress.next.minWins}`
    : `${progress.current.title} / ${progress.wins} WINS`;
  return `${arenaName.toUpperCase()} / ${detail}`;
}

function arenasSection(snapshots: ReforgedRecordsServerSnapshots): ReforgedRecordSection {
  const lines = listMapNames().map((arenaName) => arenaMasteryLine(arenaName, snapshots.arenaWins));
  return {
    id: 'arenas',
    label: 'ARENAS',
    summary: 'MASTERY',
    heading: 'ARENA MASTERY',
    authority: 'LATEST SERVER-AUTHORED DRAFT / RESULT SNAPSHOT',
    columns: [lines.slice(0, 3), lines.slice(3)],
  };
}

function challengesSection(
  snapshots: ReforgedRecordsServerSnapshots,
  values: ReforgedRecordsLocalValues,
): ReforgedRecordSection {
  const scrapPit = normalizeScrapPitRecord(values.scrapPit);
  const gauntletBest = normalizeGauntletBestClear(values.gauntletBest);
  const dailyStored = normalizeDailyGauntletProgress(values.daily);
  const dailyKey = snapshots.dailyLeaderboard?.challengeKey ?? dailyStored.challengeKey;
  const daily = dailyKey ? dailyGauntletProgressForKey(dailyStored, dailyKey) : dailyStored;
  const codex = normalizeGauntletBuildCodex(values.codex);
  const crew = normalizeCrewTourRecord(values.crewTour);

  return {
    id: 'challenges',
    label: 'CHALLENGE',
    summary: 'DEVICE RECORDS',
    heading: 'CHALLENGE RECORDS',
    authority: 'ESTABLISHED DEVICE-LOCAL VALUES / RECORDING RULES UNCHANGED',
    columns: [
      [
        'SCRAP PIT',
        `${formatCount(scrapPit.wins)} WINS / ${formatCount(scrapPit.rounds)} ROUNDS`,
        `RUN ${formatCount(scrapPit.currentStreak)} / BEST ${formatCount(scrapPit.bestStreak)}`,
        '',
        'GAUNTLET',
        gauntletBest > 0 ? `BEST CLEAR / ${formatCount(gauntletBest)}` : 'BEST CLEAR / NONE YET',
        '',
        `DAILY RUN / ${daily.challengeKey || 'NO DATE'}`,
        `BEST ${formatCount(daily.bestScore)} / CLEAR STREAK ${formatCount(daily.streak)}`,
      ],
      [
        'BUILD CODEX',
        `${codex.discovered.length}/${GAUNTLET_BUILD_IDS.length} DISCOVERED`,
        `COMBINED BEST / ${formatCount(gauntletBuildCodexCombinedBest(codex))}`,
        '',
        'CREW TOUR',
        `${formatCount(crew.toursCompleted)} TOURS / ${crew.securedModes.length}/4 PATCHES`,
        `${formatCount(crew.wins)} WINS / RUN ${formatCount(crew.currentWinStreak)} / BEST ${formatCount(crew.bestWinStreak)}`,
      ],
    ],
  };
}

function battleRoyaleSection(): ReforgedRecordSection {
  return {
    id: 'battle_royale',
    label: 'BR FUTURE',
    summary: 'RESERVED',
    heading: 'BATTLE ROYALE RECORDS',
    authority: 'EXPLICIT ZERO STATE / BATCH 49 OWNS FUTURE PERSISTENCE',
    columns: [
      ['NO BATTLE ROYALE RECORD EXISTS YET', 'MATCHES / --', 'WINS / --', 'TOP THREE / --'],
      ['ELIMINATIONS / --', 'DAMAGE / --', 'BEST PLACEMENT / --', '', 'NOT RECORDED OR INFERRED'],
    ],
  };
}

/** Pure presentation projection over existing authoritative snapshots and local records. */
export function buildReforgedRecordSections(
  snapshots: ReforgedRecordsServerSnapshots,
  values: ReforgedRecordsLocalValues,
): readonly ReforgedRecordSection[] {
  return [
    careerSection(snapshots),
    leaderboardsSection(snapshots),
    rivalrySection(snapshots),
    fightersSection(snapshots),
    arenasSection(snapshots),
    challengesSection(snapshots, values),
    battleRoyaleSection(),
  ];
}
