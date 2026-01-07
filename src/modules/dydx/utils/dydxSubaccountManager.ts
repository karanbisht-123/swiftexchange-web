// dydxSubaccountManager.ts
import { getSocketClient } from '../client/clients';
import { dydxWalletService } from '../service/dydxWalletService';
import { webSocketManager } from '../utils/WebSocketManager';

export interface SubaccountData {
  // Balance data
  equity: string;
  freeCollateral: string;
  marginUsage: string;
  totalTradingRewards: string;

  // Position data
  openPerpetualPositions: any[];

  // Order data
  orders: any[];

  // Fill data
  fills: any[];

  // Asset positions
  assetPositions: any[];
}

type DataUpdateCallback = (data: Partial<SubaccountData>) => void;

interface SubscriberInfo {
  id: string;
  callback: DataUpdateCallback;
  interestedFields: Set<keyof SubaccountData>;
}

class DydxSubaccountManager {
  private static instance: DydxSubaccountManager;

  // Single WebSocket subscription
  private wsUnsubscribe: (() => void) | null = null;
  private isSubscribed = false;

  // Centralized data store
  private currentData: Partial<SubaccountData> = {};

  // Subscriber management
  private subscribers = new Map<string, SubscriberInfo>();
  private nextSubscriberId = 0;

  // Stats
  private stats = {
    wsUpdates: 0,
    lastUpdateTime: 0,
    subscriberCount: 0,
  };

  private constructor() {
    // React to wallet connection changes
    dydxWalletService.onStatusChange(status => {
      if (status === 'connected') {
        this.setupWebSocket();
      } else if (status === 'disconnected') {
        this.cleanup();
      }
    });

    // React to WebSocket reconnection
    webSocketManager.onConnect(() => {
      if (dydxWalletService.isConnected() && !this.isSubscribed) {
        this.setupWebSocket();
      }
    });

    webSocketManager.onDisconnect(() => {
      this.isSubscribed = false;
    });
  }

  static getInstance(): DydxSubaccountManager {
    if (!DydxSubaccountManager.instance) {
      DydxSubaccountManager.instance = new DydxSubaccountManager();
    }
    return DydxSubaccountManager.instance;
  }

  /**
   * Subscribe to subaccount updates
   * @param callback Function to call when relevant data updates
   * @param interestedFields Which fields this subscriber cares about
   * @returns Unsubscribe function
   */
  subscribe(
    callback: DataUpdateCallback,
    interestedFields?: Array<keyof SubaccountData>
  ): () => void {
    const subscriberId = `sub_${this.nextSubscriberId++}`;

    this.subscribers.set(subscriberId, {
      id: subscriberId,
      callback,
      interestedFields: new Set(
        interestedFields || [
          'equity',
          'freeCollateral',
          'marginUsage',
          'totalTradingRewards',
          'openPerpetualPositions',
          'orders',
          'fills',
          'assetPositions',
        ]
      ),
    });

    this.stats.subscriberCount = this.subscribers.size;

    console.log(
      `[SubaccountManager] New subscriber: ${subscriberId}, total: ${this.subscribers.size}`
    );

    // Setup WebSocket if this is the first subscriber
    if (this.subscribers.size === 1 && !this.isSubscribed) {
      this.setupWebSocket();
    }

    // Immediately send current data if available
    if (Object.keys(this.currentData).length > 0) {
      setTimeout(() => callback(this.currentData), 0);
    }

    // Return unsubscribe function
    return () => {
      this.subscribers.delete(subscriberId);
      this.stats.subscriberCount = this.subscribers.size;

      console.log(
        `[SubaccountManager] Unsubscribed: ${subscriberId}, remaining: ${this.subscribers.size}`
      );

      // Cleanup WebSocket if no more subscribers
      if (this.subscribers.size === 0) {
        this.cleanup();
      }
    };
  }

  private setupWebSocket(): void {
    if (this.isSubscribed || !dydxWalletService.isConnected() || !webSocketManager.isConnected()) {
      return;
    }

    try {
      const address = dydxWalletService.getAddress();
      const subaccountNumber = dydxWalletService.getSubaccountNumber();

      if (!address) return;

      console.log('[SubaccountManager] Setting up WebSocket subscription');

      const socketClient = getSocketClient();

      // SINGLE subscription for all consumers
      this.wsUnsubscribe = socketClient.subscribeToSubaccounts(address, subaccountNumber, data =>
        this.handleWebSocketUpdate(data)
      );

      this.isSubscribed = true;
      console.log('[SubaccountManager] WebSocket subscription active');
    } catch (error) {
      console.error('[SubaccountManager] Failed to setup WebSocket:', error);
    }
  }

  private handleWebSocketUpdate(data: any): void {
    const now = Date.now();
    this.stats.wsUpdates++;
    this.stats.lastUpdateTime = now;

    if (!data.contents?.subaccount) {
      return;
    }

    const subaccount = data.contents.subaccount;
    const updates: Partial<SubaccountData> = {};
    const updatedFields = new Set<keyof SubaccountData>();

    // Extract balance data
    if (subaccount.equity !== undefined) {
      updates.equity = subaccount.equity;
      updatedFields.add('equity');
    }
    if (subaccount.freeCollateral !== undefined) {
      updates.freeCollateral = subaccount.freeCollateral;
      updatedFields.add('freeCollateral');
    }
    if (subaccount.marginUsage !== undefined) {
      updates.marginUsage = subaccount.marginUsage;
      updatedFields.add('marginUsage');
    }
    if (subaccount.totalTradingRewards !== undefined) {
      updates.totalTradingRewards = subaccount.totalTradingRewards;
      updatedFields.add('totalTradingRewards');
    }

    // Extract positions
    if (subaccount.openPerpetualPositions !== undefined) {
      updates.openPerpetualPositions = subaccount.openPerpetualPositions;
      updatedFields.add('openPerpetualPositions');
    }

    // Extract orders
    if (subaccount.orders !== undefined) {
      updates.orders = subaccount.orders;
      updatedFields.add('orders');
    }

    // Extract fills
    if (subaccount.fills !== undefined) {
      updates.fills = subaccount.fills;
      updatedFields.add('fills');
    }

    // Extract asset positions
    if (subaccount.assetPositions !== undefined) {
      updates.assetPositions = subaccount.assetPositions;
      updatedFields.add('assetPositions');
    }

    if (Object.keys(updates).length === 0) {
      return;
    }

    // Update centralized store
    this.currentData = { ...this.currentData, ...updates };

    // Notify relevant subscribers
    this.notifySubscribers(updates, updatedFields);
  }

  private notifySubscribers(
    updates: Partial<SubaccountData>,
    updatedFields: Set<keyof SubaccountData>
  ): void {
    this.subscribers.forEach(subscriber => {
      try {
        // Check if this subscriber is interested in any of the updated fields
        const hasRelevantUpdate = Array.from(updatedFields).some(field =>
          subscriber.interestedFields.has(field)
        );

        if (hasRelevantUpdate) {
          // Filter updates to only include fields this subscriber cares about
          const relevantUpdates: Partial<SubaccountData> = {};

          for (const field of updatedFields) {
            if (subscriber.interestedFields.has(field)) {
              relevantUpdates[field] = updates[field] as any;
            }
          }

          subscriber.callback(relevantUpdates);
        }
      } catch (error) {
        console.error('[SubaccountManager] Subscriber callback error:', error);
      }
    });
  }

  private cleanup(): void {
    console.log('[SubaccountManager] Cleaning up WebSocket subscription');

    if (this.wsUnsubscribe) {
      try {
        this.wsUnsubscribe();
      } catch (error) {
        console.error('[SubaccountManager] Error unsubscribing:', error);
      }
      this.wsUnsubscribe = null;
    }

    this.isSubscribed = false;
    // Note: We keep currentData and subscribers on cleanup
    // Only clear on disconnect
  }

  disconnect(): void {
    this.cleanup();
    this.currentData = {};
    this.subscribers.clear();
    this.stats.subscriberCount = 0;
  }

  // Getters for current data (optional, for immediate access)
  getCurrentData(): Partial<SubaccountData> {
    return { ...this.currentData };
  }

  isActive(): boolean {
    return this.isSubscribed && this.subscribers.size > 0;
  }

  getStats() {
    return {
      ...this.stats,
      isSubscribed: this.isSubscribed,
      hasData: Object.keys(this.currentData).length > 0,
      timeSinceLastUpdate: this.stats.lastUpdateTime
        ? Date.now() - this.stats.lastUpdateTime
        : null,
    };
  }
}

export const dydxSubaccountManager = DydxSubaccountManager.getInstance();
