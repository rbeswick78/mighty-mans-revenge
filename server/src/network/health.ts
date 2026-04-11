import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { adminLogger } from '../utils/logger.js';

export interface HealthCheckDeps {
  /** Returns the number of active WebRTC connections. */
  getConnectionCount: () => number;
  /** Returns the number of active matches. */
  getActiveMatchCount: () => number;
  /** Returns the measured tick rate from the game loop. */
  getMeasuredTickRate: () => number;
  /** Returns the timestamp (ms) of the last completed tick. */
  getLastTickTime: () => number;
}

const SERVER_START_TIME = Date.now();

/** Max time (ms) since last tick before we consider the loop stalled. */
const TICK_STALL_THRESHOLD_MS = 2000;

export interface HealthResponse {
  status: 'healthy' | 'unhealthy';
  uptime: number;
  tickRate: number;
  connections: number;
  activeMatches: number;
}

export function createHealthServer(
  deps: HealthCheckDeps,
  port: number,
): ReturnType<typeof createServer> {
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.method === 'GET' && req.url === '/health') {
      handleHealth(req, res, deps);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  server.listen(port, () => {
    adminLogger.info({ port }, 'Health check server listening');
  });

  return server;
}

function handleHealth(
  _req: IncomingMessage,
  res: ServerResponse,
  deps: HealthCheckDeps,
): void {
  const now = Date.now();
  const lastTick = deps.getLastTickTime();
  const tickStalled = lastTick > 0 && now - lastTick > TICK_STALL_THRESHOLD_MS;

  const body: HealthResponse = {
    status: tickStalled ? 'unhealthy' : 'healthy',
    uptime: Math.floor((now - SERVER_START_TIME) / 1000),
    tickRate: deps.getMeasuredTickRate(),
    connections: deps.getConnectionCount(),
    activeMatches: deps.getActiveMatchCount(),
  };

  const statusCode = tickStalled ? 503 : 200;
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}
