import type { IncomingMessage, ServerResponse } from 'node:http';
import { adminLogger } from '../utils/logger.js';

/** Summary of a completed match stored in the recent history buffer. */
export interface MatchHistoryEntry {
  matchId: string;
  endedAt: number;
  duration: number;
  winnerId: string | null;
  players: { id: string; nickname: string; kills: number; deaths: number }[];
}

export interface AdminDeps {
  getConnectionCount: () => number;
  getActiveMatchCount: () => number;
  getMeasuredTickRate: () => number;
  getQueueLength: () => number;
  /** Return summary info for each active match. */
  getActiveMatchDetails: () => {
    matchId: string;
    players: { id: string; nickname: string; score: number; deaths: number }[];
    phase: string;
    matchTimer: number;
  }[];
}

const ADMIN_API_KEY = process.env['ADMIN_API_KEY'] ?? '';
const SERVER_START_TIME = Date.now();
const MAX_MATCH_HISTORY = 20;

/** Circular buffer of recent match results. */
const matchHistory: MatchHistoryEntry[] = [];

/** Record a finished match into the history buffer. */
export function recordMatchHistory(entry: MatchHistoryEntry): void {
  if (matchHistory.length >= MAX_MATCH_HISTORY) {
    matchHistory.shift();
  }
  matchHistory.push(entry);
}

/** Get a copy of the recent match history (newest last). */
export function getMatchHistory(): readonly MatchHistoryEntry[] {
  return matchHistory;
}

// ──────────────────────────── Auth ────────────────────────────

function isAuthorized(req: IncomingMessage): boolean {
  if (!ADMIN_API_KEY) {
    adminLogger.warn('ADMIN_API_KEY not set — admin endpoints are unprotected');
    return true;
  }

  // Check x-api-key header
  const headerKey = req.headers['x-api-key'];
  if (headerKey === ADMIN_API_KEY) return true;

  // Check ?key= query param
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const queryKey = url.searchParams.get('key');
  if (queryKey === ADMIN_API_KEY) return true;

  return false;
}

function forbidden(res: ServerResponse): void {
  res.writeHead(403, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Forbidden' }));
}

// ──────────────────────────── Handlers ────────────────────────────

function getStatusJson(deps: AdminDeps): Record<string, unknown> {
  const now = Date.now();
  const mem = process.memoryUsage();
  const cpu = process.cpuUsage();

  return {
    uptime: Math.floor((now - SERVER_START_TIME) / 1000),
    tickRate: deps.getMeasuredTickRate(),
    memory: {
      rss: Math.round(mem.rss / 1024 / 1024),
      heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
    },
    cpu: {
      userMs: Math.round(cpu.user / 1000),
      systemMs: Math.round(cpu.system / 1000),
    },
    connections: deps.getConnectionCount(),
    activeMatches: deps.getActiveMatchCount(),
    activeMatchDetails: deps.getActiveMatchDetails(),
    queueLength: deps.getQueueLength(),
    recentMatchHistory: matchHistory,
  };
}

export function handleAdminStatus(
  req: IncomingMessage,
  res: ServerResponse,
  deps: AdminDeps,
): void {
  if (!isAuthorized(req)) {
    forbidden(res);
    return;
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(getStatusJson(deps), null, 2));
}

export function handleAdminHtml(
  req: IncomingMessage,
  res: ServerResponse,
  deps: AdminDeps,
): void {
  if (!isAuthorized(req)) {
    forbidden(res);
    return;
  }

  const data = getStatusJson(deps);
  const html = buildAdminHtml(data);
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

// ──────────────────────────── HTML template ────────────────────────────

function buildAdminHtml(data: Record<string, unknown>): string {
  const mem = data['memory'] as { rss: number; heapUsed: number; heapTotal: number };
  const cpu = data['cpu'] as { userMs: number; systemMs: number };
  const matches = data['activeMatchDetails'] as {
    matchId: string;
    players: { id: string; nickname: string; score: number; deaths: number }[];
    phase: string;
    matchTimer: number;
  }[];
  const history = data['recentMatchHistory'] as MatchHistoryEntry[];

  const matchRows = matches
    .map(
      (m) =>
        `<tr>
          <td>${m.matchId.slice(0, 8)}</td>
          <td>${m.phase}</td>
          <td>${Math.round(m.matchTimer)}s</td>
          <td>${m.players.map((p) => `${p.nickname} (${p.score}/${p.deaths})`).join(' vs ')}</td>
        </tr>`,
    )
    .join('');

  const historyRows = history
    .slice()
    .reverse()
    .map(
      (h) =>
        `<tr>
          <td>${h.matchId.slice(0, 8)}</td>
          <td>${Math.round(h.duration)}s</td>
          <td>${h.winnerId?.slice(0, 8) ?? 'draw'}</td>
          <td>${h.players.map((p) => `${p.nickname} (${p.kills}/${p.deaths})`).join(' vs ')}</td>
        </tr>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="refresh" content="5">
  <title>Mighty Man's Revenge - Admin</title>
  <style>
    body { font-family: monospace; background: #111; color: #0f0; padding: 1rem; }
    h1 { color: #0f0; }
    table { border-collapse: collapse; width: 100%; margin: 0.5rem 0 1.5rem; }
    th, td { border: 1px solid #333; padding: 4px 8px; text-align: left; }
    th { background: #222; }
    .stat { display: inline-block; margin: 0 1.5rem 0.5rem 0; }
    .label { color: #888; }
  </style>
</head>
<body>
  <h1>Mighty Man's Revenge - Server Admin</h1>
  <p class="label">Auto-refreshes every 5 seconds</p>

  <div>
    <span class="stat"><span class="label">Uptime:</span> ${data['uptime']}s</span>
    <span class="stat"><span class="label">Tick Rate:</span> ${data['tickRate']}/s</span>
    <span class="stat"><span class="label">Connections:</span> ${data['connections']}</span>
    <span class="stat"><span class="label">Queue:</span> ${data['queueLength']}</span>
    <span class="stat"><span class="label">Active Matches:</span> ${data['activeMatches']}</span>
  </div>

  <div>
    <span class="stat"><span class="label">Memory RSS:</span> ${mem.rss}MB</span>
    <span class="stat"><span class="label">Heap:</span> ${mem.heapUsed}/${mem.heapTotal}MB</span>
    <span class="stat"><span class="label">CPU User:</span> ${cpu.userMs}ms</span>
    <span class="stat"><span class="label">CPU System:</span> ${cpu.systemMs}ms</span>
  </div>

  <h2>Active Matches</h2>
  <table>
    <tr><th>Match</th><th>Phase</th><th>Timer</th><th>Players</th></tr>
    ${matchRows || '<tr><td colspan="4">No active matches</td></tr>'}
  </table>

  <h2>Recent Match History</h2>
  <table>
    <tr><th>Match</th><th>Duration</th><th>Winner</th><th>Players</th></tr>
    ${historyRows || '<tr><td colspan="4">No match history</td></tr>'}
  </table>
</body>
</html>`;
}
