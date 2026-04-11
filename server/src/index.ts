import { createServer as createHttpServer } from 'node:http';
import { GameServer } from './network/server.js';
import { GameManager } from './game/game-manager.js';
import { logger } from './utils/logger.js';
import { createHealthServer, type HealthCheckDeps } from './network/health.js';
import {
  handleAdminStatus,
  handleAdminHtml,
  recordMatchHistory,
  type AdminDeps,
  type MatchHistoryEntry,
} from './network/admin.js';

const port = parseInt(process.env['PORT'] ?? '3000', 10);
const healthPort = parseInt(process.env['HEALTH_PORT'] ?? '3001', 10);

const server = new GameServer(port);
const manager = new GameManager(server);

server.start();
manager.start();

logger.info(
  { port, healthPort, nodeVersion: process.version },
  "Mighty Man's Revenge server is running",
);

// ──────────────── Health & Admin HTTP server ────────────────

const healthDeps: HealthCheckDeps = {
  getConnectionCount: () => server.playerCount,
  getActiveMatchCount: () => manager.matchmakingManager.getActiveMatches().length,
  getMeasuredTickRate: () => manager.loop.measuredTickRate,
  getLastTickTime: () => manager.loop.lastTickWallTime,
};

const adminDeps: AdminDeps = {
  getConnectionCount: () => server.playerCount,
  getActiveMatchCount: () => manager.matchmakingManager.getActiveMatches().length,
  getMeasuredTickRate: () => manager.loop.measuredTickRate,
  getQueueLength: () => manager.matchmakingManager.getQueueLength(),
  getActiveMatchDetails: () =>
    manager.matchmakingManager.getActiveMatches().map((match) => {
      const players: { id: string; nickname: string; score: number; deaths: number }[] = [];
      for (const [, p] of match.players) {
        players.push({
          id: p.id,
          nickname: p.nickname,
          score: p.score,
          deaths: p.deaths,
        });
      }
      return {
        matchId: match.matchId,
        players,
        phase: match.phase,
        matchTimer: match.matchTimer,
      };
    }),
};

// Combined HTTP server for /health, /admin, /admin/status
const httpServer = createHttpServer((req, res) => {
  const url = req.url?.split('?')[0] ?? '';

  if (req.method === 'GET' && url === '/health') {
    // Delegate to health handler (inline to avoid double-server)
    const now = Date.now();
    const lastTick = healthDeps.getLastTickTime();
    const tickStalled = lastTick > 0 && now - lastTick > 2000;

    const body = {
      status: tickStalled ? 'unhealthy' : 'healthy',
      uptime: Math.floor((now - serverStartTime) / 1000),
      tickRate: healthDeps.getMeasuredTickRate(),
      connections: healthDeps.getConnectionCount(),
      activeMatches: healthDeps.getActiveMatchCount(),
    };

    const statusCode = tickStalled ? 503 : 200;
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
    return;
  }

  if (req.method === 'GET' && url === '/admin/status') {
    handleAdminStatus(req, res, adminDeps);
    return;
  }

  if (req.method === 'GET' && url === '/admin') {
    handleAdminHtml(req, res, adminDeps);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

const serverStartTime = Date.now();

httpServer.listen(healthPort, () => {
  logger.info({ healthPort }, 'Health/admin HTTP server listening');
});

// ──────────────── Graceful shutdown ────────────────

function shutdown(): void {
  logger.info('Shutting down...');
  manager.stop();
  httpServer.close();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Re-export for use in tests or other entry points
export { createHealthServer, recordMatchHistory };
export type { MatchHistoryEntry };
