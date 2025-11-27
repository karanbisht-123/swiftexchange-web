export interface WebSocketSubscription {
  type: 'subscribe' | 'unsubscribe';
  channel: string;
  id?: string;
  batched?: boolean;
}

export interface WebSocketMessage {
  connection_id?: string;
  channel: string;
  id?: string;
  message_id?: number;
  version?: string;
  contents?: any;
  type?: string;
}

export type MessageHandler = (data: WebSocketMessage) => void;
export type ConnectionHandler = () => void;

class WebSocketManager {
  private static instance: WebSocketManager;
  private ws: WebSocket | null = null;
  private connectionId: string | null = null;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private readonly reconnectDelay = 1000;
  private isReconnecting = false;
  private isConnecting = false;
  private subscriptions = new Map<string, Set<MessageHandler>>();
  private pendingSubscriptions = new Map<string, WebSocketSubscription>();
  private messageQueue: WebSocketSubscription[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private readonly FLUSH_INTERVAL = 50;
  private lastHeartbeat = 0;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private readonly HEARTBEAT_INTERVAL = 30000;
  private connectionHandlers = new Set<ConnectionHandler>();
  private disconnectionHandlers = new Set<ConnectionHandler>();
  private currentWsUrl: string | null = null;

  private rafId: number | null = null;
  private pendingHandlerCalls: Array<{ handler: MessageHandler; data: WebSocketMessage }> = [];
  private readonly MAX_BATCH_SIZE = 100;

  private constructor() {
    this.startHeartbeat();
  }

  static getInstance(): WebSocketManager {
    if (!WebSocketManager.instance) {
      WebSocketManager.instance = new WebSocketManager();
    }
    return WebSocketManager.instance;
  }

  async connect(wsUrl: string): Promise<void> {
    if (this.currentWsUrl !== wsUrl && this.ws?.readyState === WebSocket.OPEN) {
      console.log('[WebSocketManager] Network changed, reconnecting...');
      this.disconnect();
    }

    if (this.isConnecting || this.ws?.readyState === WebSocket.OPEN) {
      console.log('[WebSocketManager] Already connected or connecting');
      return;
    }

    return new Promise((resolve, reject) => {
      this.isConnecting = true;
      try {
        this.currentWsUrl = wsUrl;
        console.log('[WebSocketManager] Connecting to:', wsUrl);
        this.ws = new WebSocket(wsUrl);

        const timeout = setTimeout(() => {
          this.cleanup();
          reject(new Error('WebSocket connection timeout'));
        }, 10000);

        this.ws.onopen = () => {
          clearTimeout(timeout);
          console.log('[WebSocketManager] Connected successfully');
          this.isConnecting = false;
          this.reconnectAttempts = 0;
          this.isReconnecting = false;
          this.lastHeartbeat = Date.now();
          this.resubscribeAll();
          this.connectionHandlers.forEach(handler => handler());
          resolve();
        };

        this.ws.onmessage = event => {
          this.lastHeartbeat = Date.now();
          this.handleMessage(event);
        };

        this.ws.onerror = error => {
          console.error('[WebSocketManager] Error:', error);
          clearTimeout(timeout);
          this.isConnecting = false;
          if (!this.isReconnecting) reject(error);
        };

        this.ws.onclose = (event: CloseEvent) => {
          console.log('[WebSocketManager] Disconnected:', event.code, event.reason);
          clearTimeout(timeout);
          this.connectionId = null;
          this.isConnecting = false;
          this.disconnectionHandlers.forEach(handler => handler());
          if (
            !this.isReconnecting &&
            this.reconnectAttempts < this.maxReconnectAttempts &&
            event.code !== 1000
          ) {
            this.attemptReconnect();
          }
        };
      } catch (error) {
        console.error('[WebSocketManager] Connection failed:', error);
        this.isConnecting = false;
        reject(error);
      }
    });
  }

  subscribe(channel: string, handler: MessageHandler, id?: string, batched = false): () => void {
    const subscriptionKey = id ? `${channel}_${id}` : channel;

    if (!this.subscriptions.has(subscriptionKey)) {
      this.subscriptions.set(subscriptionKey, new Set());
    }
    this.subscriptions.get(subscriptionKey)!.add(handler);

    if (!this.pendingSubscriptions.has(subscriptionKey)) {
      const subscription: WebSocketSubscription = {
        type: 'subscribe',
        channel,
        ...(id && { id }),
        batched,
      };
      this.pendingSubscriptions.set(subscriptionKey, subscription);
      this.queueMessage(subscription);
      console.log('[WebSocketManager] Queued subscription:', subscriptionKey, { batched });
    } else {
      console.log('[WebSocketManager] Already subscribed to:', subscriptionKey);
    }

    return () => {
      const handlers = this.subscriptions.get(subscriptionKey);
      if (handlers) {
        handlers.delete(handler);
        if (handlers.size === 0) {
          console.log('[WebSocketManager] Unsubscribing from:', subscriptionKey);
          this.subscriptions.delete(subscriptionKey);
          this.pendingSubscriptions.delete(subscriptionKey);

          const unsubMsg: WebSocketSubscription = {
            type: 'unsubscribe',
            channel,
            ...(id && { id }),
          };
          this.queueMessage(unsubMsg);
        }
      }
    };
  }

  private queueMessage(message: WebSocketSubscription): void {
    this.messageQueue.push(message);

    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flushMessageQueue(), this.FLUSH_INTERVAL);
    }
  }

  private flushMessageQueue(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    if (!this.messageQueue.length || !this.isConnected()) {
      console.log('[WebSocketManager] Skipping flush - queue empty or not connected');
      return;
    }

    const messages = [...this.messageQueue];
    this.messageQueue = [];
    messages.forEach(message => {
      const msgStr = JSON.stringify(message);
      console.log('[WebSocketManager] Sending:', msgStr);
      this.ws!.send(msgStr);
    });
  }

  private handleMessage(event: MessageEvent): void {
    try {
      const data: WebSocketMessage = JSON.parse(event.data);

      if (data.type === 'connected' && data.connection_id) {
        this.connectionId = data.connection_id;
        console.log('[WebSocketManager] Connection ID:', this.connectionId);
        return;
      }
      if (data.type === 'subscribed') {
        const key = data.id ? `${data.channel}_${data.id}` : data.channel;
        console.log('[WebSocketManager] Subscription confirmed:', key, {
          messageId: data.message_id,
        });
        return;
      }

      if (data.type === 'unsubscribed') {
        const key = data.id ? `${data.channel}_${data.id}` : data.channel;
        console.log('[WebSocketManager] Unsubscribe confirmed:', key);
        return;
      }
      if (data.type === 'channel_data') {
        const subscriptionKey = data.id ? `${data.channel}_${data.id}` : data.channel;
        const handlers = this.subscriptions.get(subscriptionKey);

        if (handlers && handlers.size > 0) {
          handlers.forEach(handler => {
            this.pendingHandlerCalls.push({ handler, data });
          });

          this.scheduleHandlerExecution();
        } else {
          console.warn('[WebSocketManager] No handlers for:', subscriptionKey);
        }
      }
    } catch (error) {
      console.error('[WebSocketManager] Message parsing error:', error, event.data);
    }
  }

  private scheduleHandlerExecution(): void {
    if (this.rafId !== null) return;

    this.rafId = requestAnimationFrame(() => {
      this.rafId = null;
      const calls = this.pendingHandlerCalls.splice(0, this.MAX_BATCH_SIZE);

      calls.forEach(({ handler, data }) => {
        try {
          handler(data);
        } catch (error) {
          console.error('[WebSocketManager] Handler error:', error);
        }
      });
      if (this.pendingHandlerCalls.length > 0) {
        this.scheduleHandlerExecution();
      }
    });
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  getConnectionStatus(): 'connecting' | 'connected' | 'disconnected' | 'error' {
    if (!this.ws) return 'disconnected';
    switch (this.ws.readyState) {
      case WebSocket.CONNECTING:
        return 'connecting';
      case WebSocket.OPEN:
        return 'connected';
      case WebSocket.CLOSING:
      case WebSocket.CLOSED:
        return 'disconnected';
      default:
        return 'error';
    }
  }

  onConnect(handler: ConnectionHandler): () => void {
    this.connectionHandlers.add(handler);
    // Immediately call if already connected
    if (this.isConnected()) {
      handler();
    }
    return () => this.connectionHandlers.delete(handler);
  }

  onDisconnect(handler: ConnectionHandler): () => void {
    this.disconnectionHandlers.add(handler);
    return () => this.disconnectionHandlers.delete(handler);
  }

  private async attemptReconnect(): Promise<void> {
    if (
      this.isReconnecting ||
      this.reconnectAttempts >= this.maxReconnectAttempts ||
      !this.currentWsUrl
    ) {
      console.log('[WebSocketManager] Max reconnect attempts reached or no URL');
      return;
    }

    this.isReconnecting = true;
    this.reconnectAttempts++;

    const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), 30000);

    console.log(
      `[WebSocketManager] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`
    );

    await new Promise(resolve => setTimeout(resolve, delay));

    try {
      await this.connect(this.currentWsUrl);
      this.isReconnecting = false;
      console.log('[WebSocketManager] Reconnected successfully');
    } catch (error) {
      console.error('[WebSocketManager] Reconnection failed:', error);
      this.isReconnecting = false;

      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.attemptReconnect();
      }
    }
  }

  private resubscribeAll(): void {
    console.log('[WebSocketManager] Resubscribing to all channels');

    this.pendingSubscriptions.forEach((subscription, key) => {
      console.log('[WebSocketManager] Resubscribing to:', key);
      this.queueMessage(subscription);
    });
  }

  private startHeartbeat(): void {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);

    this.heartbeatInterval = setInterval(() => {
      if (this.isConnected() && Date.now() - this.lastHeartbeat > this.HEARTBEAT_INTERVAL * 2) {
        console.warn('[WebSocketManager] Connection stale, reconnecting');
        this.ws?.close();
      }
    }, this.HEARTBEAT_INTERVAL);
  }

  private cleanup(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.pendingHandlerCalls = [];
    this.isConnecting = false;
    this.isReconnecting = false;
    this.connectionId = null;
  }

  disconnect(): void {
    console.log('[WebSocketManager] Disconnecting');
    this.isReconnecting = false;
    this.reconnectAttempts = this.maxReconnectAttempts;

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    this.subscriptions.clear();
    this.pendingSubscriptions.clear();
    this.messageQueue = [];
    this.connectionHandlers.clear();
    this.disconnectionHandlers.clear();
    this.currentWsUrl = null;

    this.cleanup();
  }

  getDebugInfo(): any {
    return {
      connectionStatus: this.getConnectionStatus(),
      connectionId: this.connectionId,
      currentWsUrl: this.currentWsUrl,
      subscriptions: Array.from(this.subscriptions.keys()),
      pendingSubscriptions: Array.from(this.pendingSubscriptions.keys()),
      reconnectAttempts: this.reconnectAttempts,
      isReconnecting: this.isReconnecting,
      messageQueueLength: this.messageQueue.length,
      pendingHandlerCalls: this.pendingHandlerCalls.length,
      lastHeartbeat: new Date(this.lastHeartbeat).toISOString(),
      timeSinceLastHeartbeat: Date.now() - this.lastHeartbeat,
      activeHandlerCount: Array.from(this.subscriptions.values()).reduce(
        (sum, set) => sum + set.size,
        0
      ),
    };
  }
}

export const webSocketManager = WebSocketManager.getInstance();
