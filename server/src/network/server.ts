import geckos, { type GeckosServer, type ServerChannel, type Data } from '@geckos.io/server';
import { BOT, SERVER } from '@shared/game';
import type { ClientMessage, PlayerId, ServerCapabilities, ServerMessage } from '@shared/game';
import { serverCapabilitiesFromEnv } from '../config/feature-flags.js';
import { logger } from '../utils/logger.js';
import { createWelcomeMessage } from './welcome-message.js';

export type MessageHandler = (playerId: PlayerId, message: ClientMessage) => void;

/**
 * Wire allowlist, one flag per ClientMessage union member. Typed as an
 * exhaustive Record so ADDING a message type to the shared union without
 * registering it here is a compile error — this gate silently drops
 * unknown types, which cost a live-debug cycle when client:draftPick was
 * routed in GameManager but never let through here (Session 9).
 */
const CLIENT_MESSAGE_TYPE_FLAGS: Record<ClientMessage['type'], true> = {
  'client:input': true,
  'client:joinMatchmaking': true,
  'client:joinRumble': true,
  'client:joinBattleRoyale': true,
  'client:submitMatchIntent': true,
  'client:createParty': true,
  'client:joinParty': true,
  'client:leaveParty': true,
  'client:kickPartyMember': true,
  'client:updatePartyIntent': true,
  'client:updatePartyFighter': true,
  'client:setPartyReady': true,
  'client:cancelPartyQueue': true,
  'client:confirmPartyBotFill': true,
  'client:requestPartyRematch': true,
  'client:startPractice': true,
  'client:cancelMatchmaking': true,
  'client:rematchRequest': true,
  'client:returnToLobby': true,
  'client:leaveBattleRoyaleSpectator': true,
  'client:characterHover': true,
  'client:characterLock': true,
  'client:draftPick': true,
  'client:taunt': true,
  'client:ping': true,
};

const VALID_CLIENT_MESSAGE_TYPES = new Set<string>(Object.keys(CLIENT_MESSAGE_TYPE_FLAGS));

export class GameServer {
  private readonly io: GeckosServer;
  private readonly channels = new Map<PlayerId, ServerChannel>();
  private messageHandler: MessageHandler | null = null;
  private connectHandler: ((playerId: PlayerId) => void) | null = null;
  private disconnectHandler: ((playerId: PlayerId) => void) | null = null;
  private readonly port: number;
  private readonly capabilities: Readonly<ServerCapabilities>;

  constructor(
    port?: number,
    capabilities: Readonly<ServerCapabilities> = serverCapabilitiesFromEnv(),
  ) {
    this.port = port ?? parseInt(process.env['PORT'] ?? '3000', 10);
    this.capabilities = capabilities;
    this.io = geckos({
      cors: { allowAuthorization: true, origin: '*' },
      // STUN servers let the WebRTC stack discover the VM's public IP via NAT
      // traversal and advertise it as an ICE candidate. Without this, the
      // server only advertises its internal GCE IP (10.x) which clients
      // on the public internet cannot reach.
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
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

      // Send welcome message with assigned player ID. Reliable: this is the
      // one-shot that gives the client its assigned playerId; if it's
      // dropped, every later message is misrouted on the client side.
      this.sendTo(playerId, createWelcomeMessage(playerId, this.capabilities), { reliable: true });

      // Notify connect handler
      this.connectHandler?.(playerId);

      // Listen for messages
      channel.on('message', (data: Data) => {
        if (!this.messageHandler) return;

        try {
          const raw =
            typeof data === 'string' ? data : new TextDecoder().decode(data as ArrayBuffer);
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

        logger.info({ playerId: id, playerCount: this.channels.size }, 'Player disconnected');

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

  /**
   * Send a message to a specific player.
   *
   * Set `reliable: true` for one-shot lifecycle messages where a drop would
   * leave the client stuck (matchFound, matchStart, matchEnd, rematchStatus,
   * matchmakingStatus, opponentDisconnected, eventWarning, eventStart,
   * welcome, error). Per-tick gameState and other low-stakes broadcasts
   * should stay unreliable so we don't retransmit stale data.
   */
  sendTo(playerId: PlayerId, message: ServerMessage, opts?: { reliable?: boolean }): void {
    const channel = this.channels.get(playerId);
    if (!channel) {
      // Server-controlled practice players intentionally have no data
      // channel. Matchmaking broadcasts through the same N-player loops;
      // quietly discard their outbound copies instead of warning at 20 Hz.
      if (playerId.startsWith(BOT.PLAYER_ID_PREFIX)) return;
      logger.warn({ playerId, type: message.type }, 'Cannot send to unknown player');
      return;
    }
    if (opts?.reliable) {
      channel.emit('message', JSON.stringify(message), { reliable: true });
    } else {
      channel.emit('message', JSON.stringify(message));
    }
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

  /** Complete immutable feature support advertised by this server process. */
  getCapabilities(): Readonly<ServerCapabilities> {
    return this.capabilities;
  }
}
