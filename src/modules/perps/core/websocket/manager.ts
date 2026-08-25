import { perpEventBus, PerpEvent } from '../events';
import { TransportError } from '../errors';

export interface WebSocketManagerOptions {
  url: string;
  pingIntervalMs?: number;
  reconnectBaseDelayMs?: number;
  maxReconnectDelayMs?: number;
}

export abstract class WebSocketManager {
  protected ws: WebSocket | null = null;
  protected readonly url: string;

  private pingIntervalMs: number;
  private pingIntervalId?: ReturnType<typeof setInterval>;

  private reconnectBaseDelayMs: number;
  private maxReconnectDelayMs: number;
  private reconnectAttempt = 0;
  private reconnectTimeoutId?: ReturnType<typeof setTimeout>;

  // Set to true on intentional disconnect to prevent reconnect loop
  private isIntentionalClose = false;

  // Ref-counted subscription map — prevents duplicate stream subscriptions
  protected subscriptions: Map<string, number> = new Map();

  constructor(options: WebSocketManagerOptions) {
    this.url = options.url;
    this.pingIntervalMs = options.pingIntervalMs ?? 30000;
    this.reconnectBaseDelayMs = options.reconnectBaseDelayMs ?? 1000;
    this.maxReconnectDelayMs = options.maxReconnectDelayMs ?? 30000;
  }

  public connect(): void {
    // Guard: skip if already open or mid-handshake
    if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
      return;
    }

    this.isIntentionalClose = false;
    this.ws = new WebSocket(this.url);

    this.ws.onopen = this.handleOpen.bind(this);
    this.ws.onmessage = this.handleMessage.bind(this);
    this.ws.onclose = this.handleClose.bind(this);
    this.ws.onerror = this.handleError.bind(this);
  }

  public disconnect(): void {
    this.isIntentionalClose = true;
    this.clearPing();
    this.clearReconnectTimeout();

    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.close();
      this.ws = null;
    }

    this.subscriptions.clear();
    perpEventBus.emit(PerpEvent.DISCONNECTED);
  }

  public send(payload: unknown): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(payload));
  }

  // Increment ref-count for a topic. Only sends the subscribe frame on first subscriber.
  public subscribe(topicId: string, payload: unknown): void {
    const count = this.subscriptions.get(topicId) ?? 0;
    this.subscriptions.set(topicId, count + 1);
    if (count === 0) this.send(payload);
  }

  // Decrement ref-count. Only sends unsubscribe frame when last subscriber leaves.
  public unsubscribe(topicId: string, payload: unknown): void {
    const count = this.subscriptions.get(topicId) ?? 0;
    if (count <= 0) return;

    if (count === 1) {
      this.subscriptions.delete(topicId);
      this.send(payload);
    } else {
      this.subscriptions.set(topicId, count - 1);
    }
  }

  protected handleOpen(): void {
    this.reconnectAttempt = 0;
    this.startPing();
    this.onReconnect();
    perpEventBus.emit(PerpEvent.CONNECTED);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected handleClose(_event: CloseEvent): void {
    this.clearPing();
    if (!this.isIntentionalClose) {
      this.scheduleReconnect();
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected handleError(_event: Event): void {
    perpEventBus.emit(PerpEvent.ERROR, new TransportError('WebSocket error'));
  }

  protected abstract handleMessage(event: MessageEvent): void;
  protected abstract onReconnect(): void;
  protected abstract ping(): void;

  private startPing(): void {
    this.clearPing();
    this.pingIntervalId = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) this.ping();
    }, this.pingIntervalMs);
  }

  private clearPing(): void {
    if (this.pingIntervalId !== undefined) {
      clearInterval(this.pingIntervalId);
      this.pingIntervalId = undefined;
    }
  }

  private scheduleReconnect(): void {
    this.clearReconnectTimeout();

    // Exponential backoff capped at maxReconnectDelayMs
    const delay = Math.min(
      this.reconnectBaseDelayMs * Math.pow(2, this.reconnectAttempt),
      this.maxReconnectDelayMs
    );
    this.reconnectAttempt++;

    console.warn(`[WS] Disconnected. Reconnecting in ${delay}ms (attempt ${this.reconnectAttempt})`);

    this.reconnectTimeoutId = setTimeout(() => {
      this.connect();
    }, delay);
  }

  private clearReconnectTimeout(): void {
    if (this.reconnectTimeoutId !== undefined) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = undefined;
    }
  }
}
