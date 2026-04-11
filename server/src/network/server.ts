import geckos, { type GeckosServer, type ServerChannel, type Data } from '@geckos.io/server';
import { SERVER } from '@shared/game';
import type { ClientMessage, PlayerId, ServerMessage } from '@shared/game';
import { logger } from '../utils/logger.js';

export type MessageHandler = (playerId: PlayerId, message: ClientMessage) => void;

const VALID_CLIENT_MESSAGE_TYPES = new Set([
  'client:input',
  'client:joinMatchmaking',
  'client:cancelMatchmaking',
  'client:rematchRequest',
  'client:returnToLobby',
  'client:ping',
]);

export class GameServer {
  private readonly io: GeckosServer;
  private readonly channels = new Map<PlayerId, ServerChannel>();
  private messageHandler: MessageHandler | null = null;
  private connectHandler: ((playerId: PlayerId) => void) | null = null;
  private disconnectHandler: ((playerId: PlayerId) => void) | null = null;
  private readonly port: number;

  constructor(port?: number) {
    this.port = port ?? parseInt(process.env['PORT'] ?? '3000', 10);
    this.io = geckos({
      // CORS configuration for dev
      cors: { allowAuthorization: true, origin: '*' },
    });
  }

  start(): void {
    this.io.onConnection((channel: ServerChannel) => {
      const playerId = crypto.randomUUID() as PlayerId;

      // Enforce max player count
      if (this.channels.size >= SERVER.MAX_PLAYERS) {
        logger.warn(
          { playerId, currentCount: this.channels.size },
          'Connection rejected: server full',
        );
        channel.emit('error', JSON.stringify({ type: 'server:error', message: 'Server is full' }));
        channel.close();
        return;
      }

      this.channels.set(playerId, channel);
      // Store playerId on channel for disconnect lookup
      channel.userData = { playerId };

      logger.info(
        { playerId, channelId: channel.id, playerCount: this.channels.size },
        'Player connected',
      );

      // Send welcome message with assigned player ID
      this.sendTo(playerId, { type: 'server:welcome', playerId });

      // Notify connect handler
      this.connectHandler?.(playerId);

      // Listen for messages
      channel.on('message', (data: Data) => {
        if (!this.messageHandler) return;

        try {
          const raw = typeof data === 'string' ? data : new TextDecoder().decode(data as ArrayBuffer);
          const parsed: unknown = JSON.parse(raw);

          if (
            typeof parsed === 'object' &&
            parsed !== null &&
            'type' in parsed &&
            typeof (parsed as { type: unknown }).type === 'string' &&
            VALID_CLIENT_MESSAGE_TYPES.has((parsed as { type: string }).type)
          ) {
            this.messageHandler(playerId, parsed as ClientMessage);
          } else {
            logger.warn({ playerId, data: raw }, 'Invalid message type received');
          }
        } catch {
          logger.warn({ playerId }, 'Failed to parse client message');
        }
      });

      // Handle disconnect
      channel.onDisconnect(() => {
        const storedId = (channel.userData as { playerId: PlayerId } | undefined)?.playerId;
        const id = storedId ?? playerId;

        this.channels.delete(id);

        logger.info(
          { playerId: id, playerCount: this.channels.size },
          'Player disconnected',
        );

        this.disconnectHandler?.(id);
      });
    });

    this.io.listen(this.port);
    logger.info({ port: this.port }, 'Game server listening');
  }

  /** Broadcast a message to all connected players. */
  broadcast(message: ServerMessage): void {
    const payload = JSON.stringify(message);
    this.io.emit('message', payload);
  }

  /** Send a message to a specific player. */
  sendTo(playerId: PlayerId, message: ServerMessage): void {
    const channel = this.channels.get(playerId);
    if (!channel) {
      logger.debug({ playerId }, 'Cannot send to unknown player');
      return;
    }
    channel.emit('message', JSON.stringify(message));
  }

  /** Register a handler for incoming client messages. */
  onMessage(handler: MessageHandler): void {
    this.messageHandler = handler;
  }

  /** Register a handler for player connections. */
  onConnect(handler: (playerId: PlayerId) => void): void {
    this.connectHandler = handler;
  }

  /** Register a handler for player disconnections. */
  onDisconnect(handler: (playerId: PlayerId) => void): void {
    this.disconnectHandler = handler;
  }

  /** Number of connected players. */
  get playerCount(): number {
    return this.channels.size;
  }

  /** Get all connected player IDs. */
  getConnectedPlayerIds(): PlayerId[] {
    return [...this.channels.keys()];
  }
}
