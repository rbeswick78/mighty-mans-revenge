import { pino } from 'pino';

const LOG_LEVEL = process.env['LOG_LEVEL'] ?? 'info';

export const logger = pino({
  level: LOG_LEVEL,
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level(label: string) {
      return { level: label };
    },
  },
  base: {
    service: 'mighty-mans-revenge',
  },
});

/** Child logger for network-related events (connections, messages, WebRTC). */
export const networkLogger = logger.child({ module: 'network' });

/** Child logger for matchmaking events (queue, pairing, rematch). */
export const matchmakingLogger = logger.child({ module: 'matchmaking' });

/** Child logger for game loop and tick processing. */
export const gameLoopLogger = logger.child({ module: 'gameLoop' });

/** Child logger for match/combat events (kills, damage, phases). */
export const matchLogger = logger.child({ module: 'match' });

/** Child logger for the health check and admin endpoints. */
export const adminLogger = logger.child({ module: 'admin' });
