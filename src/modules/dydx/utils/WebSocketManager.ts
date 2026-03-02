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
  message?: string;
}

export type MessageHandler = (data: WebSocketMessage) => void;
export type ConnectionHandler = () => void;

interface MessageCache {
  lastContent: string;
  lastTimestamp: number;
}

interface SubscriptionStats {
  lastMessageTime: number;
  messageCount: number;
  errorCount: number;
}

class WebSocketManager {
  private static instance: WebSocketManager;
  private ws: WebSocket | null = null;
  private connectionId: string | null = null;
  private currentWsUrl: string | null = null;
  private isConnecting = false;
  private isReconnecting = false;
  private connectPromise: Promise<void> | null = null;
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 10;
  private readonly BASE_RECONNECT_DELAY = 1000;
  private readonly MAX_RECONNECT_DELAY = 30000;

  private subscriptions = new Map<string, Set<MessageHandler>>();
  private serverSubscriptions = new Set<string>();
  private pendingSubscriptions = new Map<string, WebSocketSubscription>();
  private subscriptionInProgress = new Set<string>();
  private subscriptionStats = new Map<string, SubscriptionStats>();

  private messageQueue: WebSocketSubscription[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private readonly FLUSH_INTERVAL = 100;
  private rafId: number | null = null;
  private pendingHandlerCalls: Array<{ handler: MessageHandler; data: WebSocketMessage }> = [];
  private readonly MAX_BATCH_SIZE = 100;
  private lastMessageTime = 0;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private readonly HEALTH_CHECK_INTERVAL = 15000;
  private readonly CONNECTION_TIMEOUT = 60000;

  private pingInterval: NodeJS.Timeout | null = null;
  private readonly PING_INTERVAL = 25000;
  private pongReceived = true;
  private missedPongs = 0;
  private readonly MAX_MISSED_PONGS = 2;

  private connectionHandlers = new Set<ConnectionHandler>();
  private disconnectionHandlers = new Set<ConnectionHandler>();

  private messageCache = new Map<string, MessageCache>();
  private readonly CACHE_CLEANUP_INTERVAL = 60000;
  private readonly CACHE_TTL = 5000;
  private cacheCleanupTimer: NodeJS.Timeout | null = null;

  private throttleMap = new Map<string, NodeJS.Timeout>();
  private readonly THROTTLE_INTERVALS: Record<string, number> = {
    v4_markets: 500,
    v4_candles: 0,
    v4_block_height: 1000,
    v4_trades: 0,
    v4_orderbook: 0,
    v4_subaccounts: 0,
    v4_parent_subaccounts: 0,
  };

  private readonly CHANNEL_STALE_THRESHOLDS: Record<string, number> = {
    v4_trades: 45000,
    v4_orderbook: 45000,
    v4_markets: 90000,
    v4_candles: 90000,
    v4_parent_subaccounts: 60000,
    v4_block_height: 60000,
  };

  // messages received
  private totalMessagesReceived = 0;
  private messagesByChannel = new Map<string, number>();

  private constructor() {
    this.startHealthCheck();
    this.startCacheCleanup();
    this.setupVisibilityHandling();
  }

  static getInstance(): WebSocketManager {
    if (!WebSocketManager.instance) {
      WebSocketManager.instance = new WebSocketManager();
    }
    return WebSocketManager.instance;
  }

  private setupVisibilityHandling(): void {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.handleVisibilityChange);
    }
  }

  private readonly handleVisibilityChange = (): void => {
    if (document.hidden) {
      this.stopPing();
      return;
    }

    if (!this.currentWsUrl) return;

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.startPing();
      try {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      } catch {
        this.connect(this.currentWsUrl).catch(console.error);
      }
    } else if (!this.isConnecting && !this.isReconnecting) {
      this.connect(this.currentWsUrl).catch(console.error);
    }
  };

  async connect(wsUrl: string): Promise<void> {
    if (this.currentWsUrl === wsUrl && this.ws?.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }

    if (this.isConnecting) {
      return this.connectPromise || Promise.resolve();
    }

    if (this.currentWsUrl !== wsUrl && this.ws) {
      this.isReconnecting = false;
      await this.disconnect();
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    this.connectPromise = new Promise((resolve, reject) => {
      this.isConnecting = true;
      this.currentWsUrl = wsUrl;

      try {
        this.ws = new WebSocket(wsUrl);

        const connectionTimeout = setTimeout(() => {
          this.cleanup();
          reject(new Error('Connection timeout'));
        }, 10000);

        this.ws.onopen = () => {
          clearTimeout(connectionTimeout);
          this.isConnecting = false;
          this.connectPromise = null;
          this.reconnectAttempts = 0;
          this.isReconnecting = false;
          this.lastMessageTime = Date.now();
          this.pongReceived = true;
          this.missedPongs = 0;
          this.serverSubscriptions.clear();
          this.subscriptionInProgress.clear();
          this.messageCache.clear();
          this.resubscribeAll();
          if (!document.hidden) {
            this.startPing();
          }
          this.notifyConnectionHandlers();
          resolve();
        };

        this.ws.onmessage = event => {
          this.lastMessageTime = Date.now();
          this.totalMessagesReceived++;
          this.handleMessage(event);
        };

        this.ws.onerror = error => {
          console.error('[WS] Connection error:', error);
          clearTimeout(connectionTimeout);
          this.isConnecting = false;
          this.connectPromise = null;
          if (!this.isReconnecting) {
            reject(error);
          }
        };

        this.ws.onclose = (event: CloseEvent) => {
          clearTimeout(connectionTimeout);
          this.connectionId = null;
          this.isConnecting = false;
          this.connectPromise = null;
          this.stopPing();
          this.serverSubscriptions.clear();
          this.subscriptionInProgress.clear();
          this.notifyDisconnectionHandlers();

          const shouldReconnect =
            !this.isReconnecting &&
            event.code !== 1000 &&
            this.reconnectAttempts < this.MAX_RECONNECT_ATTEMPTS &&
            this.currentWsUrl !== null;

          if (shouldReconnect) {
            this.attemptReconnect();
          }
        };
      } catch (error) {
        console.error('[WS] Connection creation error:', error);
        this.isConnecting = false;
        reject(error);
      }
    });
  }

  private async disconnect(): Promise<void> {
    this.stopPing();
    this.isReconnecting = false;
    this.reconnectAttempts = this.MAX_RECONNECT_ATTEMPTS;

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.serverSubscriptions.forEach(key => {
        const subscription = this.pendingSubscriptions.get(key);
        if (subscription) {
          try {
            this.ws!.send(
              JSON.stringify({
                type: 'unsubscribe',
                channel: subscription.channel,
                ...(subscription.id && { id: subscription.id }),
              })
            );
          } catch {
            // ignore
          }
        }
      });
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    this.cleanup();
  }

  private async attemptReconnect(): Promise<void> {
    if (
      this.isReconnecting ||
      this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS ||
      !this.currentWsUrl
    ) {
      return;
    }

    this.isReconnecting = true;
    this.reconnectAttempts++;

    const exponentialDelay = Math.min(
      this.BASE_RECONNECT_DELAY * Math.pow(2, this.reconnectAttempts - 1),
      this.MAX_RECONNECT_DELAY
    );
    const delay = exponentialDelay + Math.random() * 1000;

    await new Promise(resolve => setTimeout(resolve, delay));

    try {
      await this.connect(this.currentWsUrl);
      this.isReconnecting = false;
    } catch (error) {
      console.error('[WS] Reconnection failed:', error);
      this.isReconnecting = false;
      if (this.reconnectAttempts < this.MAX_RECONNECT_ATTEMPTS) {
        this.attemptReconnect();
      } else {
        console.error('[WS] Max reconnection attempts reached');
      }
    }
  }

  subscribe(channel: string, handler: MessageHandler, id?: string, batched = false): () => void {
    const subscriptionKey = id ? `${channel}_${id}` : channel;

    if (!this.subscriptions.has(subscriptionKey)) {
      this.subscriptions.set(subscriptionKey, new Set());
      this.subscriptionStats.set(subscriptionKey, {
        lastMessageTime: 0,
        messageCount: 0,
        errorCount: 0,
      });
    }
    this.subscriptions.get(subscriptionKey)!.add(handler);

    if (
      !this.serverSubscriptions.has(subscriptionKey) &&
      !this.subscriptionInProgress.has(subscriptionKey)
    ) {
      const subscription: WebSocketSubscription = {
        type: 'subscribe',
        channel,
        ...(id && { id }),
        batched,
      };

      this.pendingSubscriptions.set(subscriptionKey, subscription);
      this.subscriptionInProgress.add(subscriptionKey);
      this.queueMessage(subscription);
    }

    return () => {
      const handlers = this.subscriptions.get(subscriptionKey);
      if (handlers) {
        handlers.delete(handler);

        if (handlers.size === 0) {
          this.subscriptions.delete(subscriptionKey);
          this.pendingSubscriptions.delete(subscriptionKey);
          this.serverSubscriptions.delete(subscriptionKey);
          this.subscriptionInProgress.delete(subscriptionKey);
          this.messageCache.delete(subscriptionKey);
          this.subscriptionStats.delete(subscriptionKey);

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

  private resubscribeAll(): void {
    this.subscriptionInProgress.clear();
    this.pendingSubscriptions.forEach((subscription, key) => {
      this.subscriptionInProgress.add(key);
      this.queueMessage(subscription);
    });
  }

  private queueMessage(message: WebSocketSubscription): void {
    const isDuplicate = this.messageQueue.some(
      m =>
        m.type === message.type &&
        m.channel === message.channel &&
        m.id === message.id &&
        m.batched === message.batched
    );

    if (isDuplicate) return;

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

    if (!this.messageQueue.length || !this.isConnected()) return;

    const messages = [...this.messageQueue];
    this.messageQueue = [];

    messages.forEach(message => {
      try {
        this.ws!.send(JSON.stringify(message));
      } catch (error) {
        console.error('[WS] Send error:', error);
        this.messageQueue.push(message);
      }
    });
  }

  private handleMessage(event: MessageEvent): void {
    try {
      const data: WebSocketMessage = JSON.parse(event.data);

      if (data.type === 'connected' && data.connection_id) {
        this.connectionId = data.connection_id;
        console.log('[WS] Received connection ID:', data.connection_id);
        return;
      }

      if (data.type === 'subscribed') {
        const key = data.id ? `${data.channel}_${data.id}` : data.channel;
        this.serverSubscriptions.add(key);
        this.subscriptionInProgress.delete(key);
        console.log('[WS] Subscribed to:', key);
        if (data.contents) {
          const handlers = this.subscriptions.get(key);
          if (handlers && handlers.size > 0) {
            handlers.forEach(handler => {
              this.pendingHandlerCalls.push({ handler, data });
            });
            this.scheduleHandlerExecution();
          }
        }
        return;
      }

      if (data.type === 'unsubscribed') {
        const key = data.id ? `${data.channel}_${data.id}` : data.channel;
        this.serverSubscriptions.delete(key);
        console.log('[WS] Unsubscribed from:', key);
        return;
      }

      if (data.type === 'error' && data.message) {
        const key = data.id ? `${data.channel}_${data.id}` : data.channel;
        console.error('[WS] Subscription error:', data.message);

        const stats = this.subscriptionStats.get(key);
        if (stats) {
          stats.errorCount++;
        }

        if (data.message.includes('already subscribed')) {
          this.serverSubscriptions.add(key);
          this.subscriptionInProgress.delete(key);
        } else {
          this.subscriptionInProgress.delete(key);
        }
        return;
      }

      if (data.type === 'pong') {
        this.pongReceived = true;
        this.missedPongs = 0;
        return;
      }

      if (data.type === 'channel_data' || data.type === 'channel_batch_data') {
        const subscriptionKey = data.id ? `${data.channel}_${data.id}` : data.channel;

        const stats = this.subscriptionStats.get(subscriptionKey);
        if (stats) {
          stats.lastMessageTime = Date.now();
          stats.messageCount++;
        }

        this.messagesByChannel.set(
          data.channel,
          (this.messagesByChannel.get(data.channel) || 0) + 1
        );

        const shouldCheckDuplicates = data.channel !== 'v4_trades';
        if (shouldCheckDuplicates && this.isDuplicateMessage(subscriptionKey, data)) {
          return;
        }

        const handlers = this.subscriptions.get(subscriptionKey);
        if (handlers && handlers.size > 0) {
          this.throttleMessage(subscriptionKey, data, handlers);
        }
      }
    } catch (error) {
      console.error('[WS] Message parse error:', error);
    }
  }

  private isDuplicateMessage(key: string, data: WebSocketMessage): boolean {
    const contentStr = JSON.stringify(data.contents);
    const cached = this.messageCache.get(key);
    const now = Date.now();

    if (cached && cached.lastContent === contentStr && now - cached.lastTimestamp < 100) {
      return true;
    }

    this.messageCache.set(key, { lastContent: contentStr, lastTimestamp: now });
    return false;
  }

  private throttleMessage(
    key: string,
    data: WebSocketMessage,
    handlers: Set<MessageHandler>
  ): void {
    const throttleInterval = this.THROTTLE_INTERVALS[data.channel] ?? 0;

    if (throttleInterval === 0) {
      handlers.forEach(handler => {
        this.pendingHandlerCalls.push({ handler, data });
      });
      this.scheduleHandlerExecution();
    } else {
      const throttleKey = `${key}_throttle`;

      if (!this.throttleMap.has(throttleKey)) {
        handlers.forEach(handler => {
          this.pendingHandlerCalls.push({ handler, data });
        });
        this.scheduleHandlerExecution();

        this.throttleMap.set(
          throttleKey,
          setTimeout(() => this.throttleMap.delete(throttleKey), throttleInterval)
        );
      }
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
          console.error('[WS] Handler execution error:', error);
        }
      });

      if (this.pendingHandlerCalls.length > 0) {
        this.scheduleHandlerExecution();
      }
    });
  }

  private startPing(): void {
    this.stopPing();

    this.pingInterval = setInterval(() => {
      if (!this.isConnected()) return;

      if (!this.pongReceived) {
        this.missedPongs++;
        if (this.missedPongs >= this.MAX_MISSED_PONGS) {
          this.ws?.close();
          return;
        }
      }

      this.pongReceived = false;
      try {
        this.ws!.send(JSON.stringify({ type: 'ping' }));
      } catch (error) {
        console.error('[WS] Ping send failed:', error);
        this.ws?.close();
      }
    }, this.PING_INTERVAL);
  }

  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private startHealthCheck(): void {
    if (this.healthCheckInterval) clearInterval(this.healthCheckInterval);

    this.healthCheckInterval = setInterval(() => {
      if (!this.isConnected()) return;

      const now = Date.now();

      const timeSinceLastMessage = now - this.lastMessageTime;
      if (timeSinceLastMessage > this.CONNECTION_TIMEOUT) {
        this.ws?.close();
        return;
      }

      this.subscriptionStats.forEach((stats, key) => {
        if (!this.serverSubscriptions.has(key)) return;
        if (stats.lastMessageTime === 0) return;

        const channel = key.split('_').slice(0, 2).join('_');
        const threshold = this.CHANNEL_STALE_THRESHOLDS[channel];
        if (!threshold) return;

        const staleDuration = now - stats.lastMessageTime;
        if (staleDuration > threshold) {
          this.serverSubscriptions.delete(key);
          this.subscriptionInProgress.delete(key);
          const pending = this.pendingSubscriptions.get(key);
          if (pending) {
            this.subscriptionInProgress.add(key);
            this.queueMessage(pending);
          }
        }
      });
    }, this.HEALTH_CHECK_INTERVAL);
  }

  private startCacheCleanup(): void {
    if (this.cacheCleanupTimer) clearInterval(this.cacheCleanupTimer);

    this.cacheCleanupTimer = setInterval(() => {
      const now = Date.now();
      this.messageCache.forEach((cache, key) => {
        if (now - cache.lastTimestamp > this.CACHE_TTL) {
          this.messageCache.delete(key);
        }
      });
    }, this.CACHE_CLEANUP_INTERVAL);
  }

  onConnect(handler: ConnectionHandler): () => void {
    this.connectionHandlers.add(handler);
    if (this.isConnected()) handler();
    return () => this.connectionHandlers.delete(handler);
  }

  onDisconnect(handler: ConnectionHandler): () => void {
    this.disconnectionHandlers.add(handler);
    return () => this.disconnectionHandlers.delete(handler);
  }

  private notifyConnectionHandlers(): void {
    this.connectionHandlers.forEach(handler => {
      try {
        handler();
      } catch (e) {
        console.error('[WS] Connection handler error:', e);
      }
    });
  }

  private notifyDisconnectionHandlers(): void {
    this.disconnectionHandlers.forEach(handler => {
      try {
        handler();
      } catch (e) {
        console.error('[WS] Disconnection handler error:', e);
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

  // subscription activity
  getDebugInfo(): any {
    const now = Date.now();
    const subscriptionActivity = Array.from(this.subscriptionStats.entries()).map(
      ([key, stats]) => ({
        key,
        isActive: this.serverSubscriptions.has(key),
        lastMessageAgo: stats.lastMessageTime ? now - stats.lastMessageTime : null,
        totalMessages: stats.messageCount,
        errors: stats.errorCount,
        handlerCount: this.subscriptions.get(key)?.size || 0,
      })
    );

    return {
      connectionStatus: this.getConnectionStatus(),
      connectionId: this.connectionId,
      currentWsUrl: this.currentWsUrl,
      localSubscriptions: Array.from(this.subscriptions.keys()),
      serverSubscriptions: Array.from(this.serverSubscriptions),
      pendingSubscriptions: Array.from(this.pendingSubscriptions.keys()),
      inProgressSubscriptions: Array.from(this.subscriptionInProgress),
      reconnectAttempts: this.reconnectAttempts,
      isReconnecting: this.isReconnecting,
      messageQueueLength: this.messageQueue.length,
      pendingHandlerCalls: this.pendingHandlerCalls.length,
      activeHandlerCount: Array.from(this.subscriptions.values()).reduce(
        (sum, set) => sum + set.size,
        0
      ),
      pingActive: this.pingInterval !== null,
      pongReceived: this.pongReceived,
      missedPongs: this.missedPongs,
      cacheSize: this.messageCache.size,
      activeThrottles: this.throttleMap.size,
      totalMessagesReceived: this.totalMessagesReceived,
      messagesByChannel: Object.fromEntries(this.messagesByChannel),
      subscriptionActivity,
    };
  }

  shutdown(): void {
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    }

    this.isReconnecting = false;
    this.reconnectAttempts = this.MAX_RECONNECT_ATTEMPTS;
    this.currentWsUrl = null;

    this.cleanup();
    this.clearAllSubscriptions();
    this.clearTimers();
  }

  private cleanup(): void {
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }

    this.serverSubscriptions.clear();
    this.subscriptionInProgress.clear();
    this.notifyDisconnectionHandlers();

    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    this.stopPing();
    this.pendingHandlerCalls = [];
    this.isConnecting = false;
    this.isReconnecting = false;
    this.connectionId = null;
    this.pongReceived = true;
    this.missedPongs = 0;
  }

  private clearAllSubscriptions(): void {

    this.subscriptions.clear();
    this.serverSubscriptions.clear();
    this.pendingSubscriptions.clear();
    this.subscriptionInProgress.clear();
    this.messageQueue = [];
    this.messageCache.clear();
    this.subscriptionStats.clear();
    this.throttleMap.forEach(t => clearTimeout(t));
    this.throttleMap.clear();
    this.connectionHandlers.clear();
    this.disconnectionHandlers.clear();
    this.totalMessagesReceived = 0;
    this.messagesByChannel.clear();
  }

  private clearTimers(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    if (this.cacheCleanupTimer) {
      clearInterval(this.cacheCleanupTimer);
      this.cacheCleanupTimer = null;
    }
  }
}

export const webSocketManager = WebSocketManager.getInstance();
