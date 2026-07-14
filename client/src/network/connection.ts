import geckos, { type ClientChannel } from '@geckos.io/client';
import type { ClientMessage, ServerMessage } from '@shared/types/network.js';
import type { ConnectionState, ConnectionQuality } from './types.js';

const RTT_GOOD_THRESHOLD = 80;
const RTT_FAIR_THRESHOLD = 150;
const PING_INTERVAL_MS = 2000;
const CONNECT_TIMEOUT_MS = 5000;
const MAX_RECONNECT_ATTEMPTS = 5;
const BASE_RECONNECT_DELAY_MS = 1000;

type MessageCallback = (message: ServerMessage) => void;
type StateChangeCallback = (state: ConnectionState) => void;

export class NetworkConnection {
  private channel: ClientChannel | null = null;
  private serverUrl: string;
  private serverPort: number;
  private state: ConnectionState = 'disconnected';
  private rtt = 0;
  private pingIntervalId: ReturnType<typeof setInterval> | null = null;
  private connectTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private reconnectTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private messageCallbacks: MessageCallback[] = [];
  private stateChangeCallbacks: StateChangeCallback[] = [];

  constructor(serverUrl?: string) {
    const raw = serverUrl ?? import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3000';
    const url = new URL(raw);
    this.serverUrl = `${url.protocol}//${url.hostname}`;
    this.serverPort = url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80;
  }

  async connect(): Promise<void> {
    if (
      this.state === 'connected' ||
      this.state === 'connecting' ||
      this.state === 'reconnecting'
    ) {
      return;
    }
    this.beginConnectionAttempt();
  }

  /** Skip a pending backoff and start a fresh connection cycle immediately. */
  retryNow(): void {
    this.beginConnectionAttempt();
  }

  send(message: ClientMessage): void {
    if (!this.channel || this.state !== 'connected') return;
    this.channel.emit('message', JSON.stringify(message), { reliable: true });
  }

  onMessage(callback: MessageCallback): void {
    this.messageCallbacks.push(callback);
  }

  onStateChange(callback: StateChangeCallback): void {
    this.stateChangeCallbacks.push(callback);
  }

  getRTT(): number {
    return this.rtt;
  }

  getConnectionQuality(): ConnectionQuality {
    if (this.rtt < RTT_GOOD_THRESHOLD) return 'good';
    if (this.rtt < RTT_FAIR_THRESHOLD) return 'fair';
    return 'poor';
  }

  getState(): ConnectionState {
    return this.state;
  }

  disconnect(): void {
    this.stopPing();
    this.clearConnectTimeout();
    this.clearReconnectTimeout();
    this.closeCurrentChannel();
    this.setState('disconnected');
    this.reconnectAttempts = 0;
  }

  private beginConnectionAttempt(): void {
    this.stopPing();
    this.clearConnectTimeout();
    this.clearReconnectTimeout();
    this.closeCurrentChannel();
    this.reconnectAttempts = 0;
    this.setState('connecting');
    this.createChannel();
  }

  private createChannel(): void {
    const channel = geckos({
      url: this.serverUrl,
      port: this.serverPort,
    });
    this.channel = channel;

    channel.onConnect((error) => {
      if (this.channel !== channel) return;
      if (this.state !== 'connecting') return;
      this.clearConnectTimeout();
      if (error) {
        console.error('[NetworkConnection] Connection error:', error);
        this.handleDisconnect(channel);
        return;
      }

      this.setState('connected');
      this.reconnectAttempts = 0;
      this.startPing();
    });

    channel.onDisconnect(() => {
      this.handleDisconnect(channel);
    });

    channel.on('message', (data) => {
      if (this.channel !== channel) return;
      if (this.state !== 'connected') return;
      if (typeof data !== 'string') return;
      let message: ServerMessage;
      try {
        message = JSON.parse(data) as ServerMessage;
      } catch (err) {
        console.warn('[NetworkConnection] Failed to parse server message', err);
        return;
      }
      for (const cb of this.messageCallbacks) {
        try {
          cb(message);
        } catch (err) {
          // Don't let one throwing handler abort the rest of the dispatch:
          // we used to wrap parse + iteration in a single try/catch, which
          // meant a thrown listener swallowed downstream events under a
          // bogus "Failed to parse" log. See the rematch hang where a
          // stale LobbyScene.onMatchFound on a shut-down scene threw on
          // cameras.main, dropping ResultsScene's listener silently.
          console.error('[NetworkConnection] message handler threw', err);
        }
      }
    });

    this.connectTimeoutId = setTimeout(() => {
      this.connectTimeoutId = null;
      if (this.channel !== channel || this.state !== 'connecting') return;
      this.handleDisconnect(channel);
    }, CONNECT_TIMEOUT_MS);
  }

  private handleDisconnect(channel: ClientChannel): void {
    if (this.channel !== channel) return;
    this.stopPing();
    this.clearConnectTimeout();

    if (this.state === 'disconnected') return;
    if (this.reconnectTimeoutId !== null) return;

    if (this.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      this.setState('reconnecting');
      this.scheduleReconnect();
    } else {
      this.closeCurrentChannel();
      this.setState('disconnected');
    }
  }

  private scheduleReconnect(): void {
    const delay = BASE_RECONNECT_DELAY_MS * Math.pow(2, this.reconnectAttempts);
    this.reconnectAttempts++;

    console.log(
      `[NetworkConnection] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`,
    );

    this.reconnectTimeoutId = setTimeout(() => {
      this.reconnectTimeoutId = null;
      this.closeCurrentChannel();
      this.setState('connecting');
      this.createChannel();
    }, delay);
  }

  /**
   * Geckos may throw from close() when its WebRTC peer never finished being
   * created. Teardown must still clear our channel and let the retry state
   * machine advance; stale callbacks are ignored by channel identity.
   */
  private closeCurrentChannel(): void {
    const channel = this.channel;
    if (!channel) return;
    this.clearConnectTimeout();
    this.channel = null;
    try {
      channel.close();
    } catch {
      // A half-open transport has nothing else for us to release locally.
    }
  }

  private startPing(): void {
    this.stopPing();
    this.pingIntervalId = setInterval(() => {
      this.send({ type: 'client:ping', clientTime: performance.now() });
    }, PING_INTERVAL_MS);
  }

  private stopPing(): void {
    if (this.pingIntervalId !== null) {
      clearInterval(this.pingIntervalId);
      this.pingIntervalId = null;
    }
  }

  private clearReconnectTimeout(): void {
    if (this.reconnectTimeoutId !== null) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }
  }

  private clearConnectTimeout(): void {
    if (this.connectTimeoutId !== null) {
      clearTimeout(this.connectTimeoutId);
      this.connectTimeoutId = null;
    }
  }

  /** Called by the NetworkManager when a pong message is received. */
  handlePong(clientTime: number): void {
    this.rtt = performance.now() - clientTime;
  }

  private setState(newState: ConnectionState): void {
    if (this.state === newState) return;
    this.state = newState;
    for (const cb of this.stateChangeCallbacks) {
      cb(newState);
    }
  }
}
