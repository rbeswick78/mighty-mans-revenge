import geckos, { type ClientChannel } from '@geckos.io/client';
import type { ClientMessage, ServerMessage } from '@shared/types/network.js';
import type { ConnectionState, ConnectionQuality } from './types.js';

const RTT_GOOD_THRESHOLD = 80;
const RTT_FAIR_THRESHOLD = 150;
const PING_INTERVAL_MS = 2000;
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
  private reconnectAttempts = 0;
  private reconnectTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private messageCallbacks: MessageCallback[] = [];
  private stateChangeCallbacks: StateChangeCallback[] = [];

  constructor(serverUrl?: string) {
    const raw = serverUrl ?? import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3000';
    const url = new URL(raw);
    this.serverUrl = `${url.protocol}//${url.hostname}`;
    this.serverPort = url.port ? Number(url.port) : (url.protocol === 'https:' ? 443 : 80);
  }

  async connect(): Promise<void> {
    this.setState('connecting');
    this.reconnectAttempts = 0;
    await this.createChannel();
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
    this.clearReconnectTimeout();
    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }
    this.setState('disconnected');
    this.reconnectAttempts = 0;
  }

  private async createChannel(): Promise<void> {
    this.channel = geckos({
      url: this.serverUrl,
      port: this.serverPort,
    });

    this.channel.onConnect((error) => {
      if (error) {
        console.error('[NetworkConnection] Connection error:', error);
        this.handleDisconnect();
        return;
      }

      this.setState('connected');
      this.reconnectAttempts = 0;
      this.startPing();
    });

    this.channel.onDisconnect(() => {
      this.handleDisconnect();
    });

    this.channel.on('message', (data) => {
      if (typeof data !== 'string') return;
      try {
        const message = JSON.parse(data) as ServerMessage;
        for (const cb of this.messageCallbacks) {
          cb(message);
        }
      } catch {
        console.warn('[NetworkConnection] Failed to parse server message');
      }
    });
  }

  private handleDisconnect(): void {
    this.stopPing();

    if (this.state === 'disconnected') return;

    if (this.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      this.setState('reconnecting');
      this.scheduleReconnect();
    } else {
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
      if (this.channel) {
        this.channel.close();
        this.channel = null;
      }
      this.setState('connecting');
      this.createChannel();
    }, delay);
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
