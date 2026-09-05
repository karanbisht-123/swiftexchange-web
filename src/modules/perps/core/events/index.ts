export const PerpEvent = {
  CONNECTED: 'CONNECTED',
  DISCONNECTED: 'DISCONNECTED',
  RECONNECTED: 'RECONNECTED',
  ORDER_UPDATED: 'ORDER_UPDATED',
  TRADE_UPDATED: 'TRADE_UPDATED',
  POSITION_UPDATED: 'POSITION_UPDATED',
  MARKET_UPDATED: 'MARKET_UPDATED',
  SYMBOL_CHANGED: 'SYMBOL_CHANGED',
  ERROR: 'ERROR',
  CANDLE_UPDATED: 'CANDLE_UPDATED',
  TICKER_UPDATED: 'TICKER_UPDATED',
  ASSET_CTX_UPDATED: 'ASSET_CTX_UPDATED',
} as const;

export type PerpEvent = (typeof PerpEvent)[keyof typeof PerpEvent];

export type EventCallback = (data?: any) => void;

export class EventBus {
  private listeners: Map<string, Set<EventCallback>> = new Map();

  public on(event: PerpEvent | string, callback: EventCallback): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);

    return () => this.off(event, callback);
  }

  /**
   * Unsubscribe from an event
   */
  public off(event: PerpEvent | string, callback: EventCallback): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.delete(callback);
      if (callbacks.size === 0) {
        this.listeners.delete(event);
      }
    }
  }

  /**
   * Emit an event to all subscribers
   */
  public emit(event: PerpEvent | string, data?: unknown): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in event listener for ${event}:`, error);
        }
      });
    }
  }

  public clear(): void {
    this.listeners.clear();
  }
}

export const perpEventBus = new EventBus();
