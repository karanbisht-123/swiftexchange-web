import { getSocketClient } from '../client/clients';
import { webSocketManager } from '../utils/WebSocketManager';
import { dydxWalletService } from './dydxWalletService';

export interface Position {
  market: string;
  status: string;
  side: string;
  size: string;
  maxSize: string;
  entryPrice: string;
  exitPrice: string | null;
  realizedPnl: string;
  unrealizedPnl: string;
  createdAt: string;
  closedAt: string | null;
  sumOpen: string;
  sumClose: string;
  netFunding: string;
}

export interface AssetPosition {
  symbol: string;
  side: string;
  size: string;
  assetId: string;
  subaccountNumber: number;
}

export interface Order {
  id: string;
  subaccountId: string;
  clientId: string;
  clobPairId: string;
  side: string;
  size: string;
  totalFilled: string;
  price: string;
  type: string;
  status: string;
  timeInForce: string;
  postOnly: boolean;
  reduceOnly: boolean;
  orderFlags: string;
  goodTilBlock?: string;
  goodTilBlockTime?: string;
  ticker: string;
  createdAtHeight: string;
  updatedAt?: string;
  updatedAtHeight?: string;
}

export interface Fill {
  id: string;
  side: string;
  liquidity: string;
  type: string;
  market: string;
  marketType: string;
  price: string;
  size: string;
  fee: string;
  createdAt: string;
  createdAtHeight: string;
  orderId?: string;
  clientMetadata?: string;
}

export interface HistoricalPnl {
  id: string;
  subaccountId: string;
  equity: string;
  totalPnl: string;
  netTransfers: string;
  createdAt: string;
  blockHeight: string;
  blockTime: string;
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

type DataUpdateCallback<T> = (data: T) => void;

class DydxDataService {
  private cache = new Map<string, CacheEntry<any>>();
  private readonly CACHE_TTL = 5000;

  private wsUnsubscribe: (() => void) | null = null;
  private isSubscribed = false;
  private subscriptionAttempts = 0;
  private readonly MAX_RETRY_ATTEMPTS = 3;
  private retryTimer: NodeJS.Timeout | null = null;

  private positionListeners: DataUpdateCallback<Position[]>[] = [];
  private orderListeners: DataUpdateCallback<Order[]>[] = [];

  private stats = {
    wsUpdates: 0,
    restCalls: 0,
    lastWsUpdate: 0,
    positionUpdates: 0,
    orderUpdates: 0,
  };

  constructor() {
    dydxWalletService.onStatusChange(status => {
      if (status === 'connected') {
        this.setupWebSocket();
      } else if (status === 'disconnected') {
        this.cleanup();
      }
    });

    webSocketManager.onConnect(() => {
      if (dydxWalletService.isConnected() && !this.isSubscribed) {
        this.setupWebSocket();
      }
    });

    webSocketManager.onDisconnect(() => {
      this.isSubscribed = false;
    });
  }

  private getContext() {
    const indexer = dydxWalletService.getIndexerClient();
    const address = dydxWalletService.getAddress();
    const subaccountNumber = dydxWalletService.getSubaccountNumber();

    if (!indexer || !address) {
      throw new Error('Wallet not connected');
    }

    return { indexer, address, subaccountNumber };
  }

  private getCached<T>(key: string): T | null {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.data as T;
    }
    if (cached) {
      this.cache.delete(key);
    }
    return null;
  }

  private setCache<T>(key: string, data: T): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    });
  }

  private clearCachePattern(pattern?: string): void {
    if (!pattern) {
      this.cache.clear();
      return;
    }

    const keysToDelete: string[] = [];
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach(key => this.cache.delete(key));
  }

  private setupWebSocket(): void {
    if (this.isSubscribed || !dydxWalletService.isConnected() || !webSocketManager.isConnected()) {
      return;
    }

    try {
      const address = dydxWalletService.getAddress();
      const subaccountNumber = dydxWalletService.getSubaccountNumber();

      if (!address) return;

      const socketClient = getSocketClient();
      this.wsUnsubscribe = socketClient.subscribeToSubaccounts(address, subaccountNumber, data =>
        this.handleWebSocketUpdate(data)
      );

      this.isSubscribed = true;
      this.subscriptionAttempts = 0;
    } catch (error) {
      this.subscriptionAttempts++;

      if (this.subscriptionAttempts < this.MAX_RETRY_ATTEMPTS) {
        const delay = Math.min(1000 * Math.pow(2, this.subscriptionAttempts), 10000);

        this.retryTimer = setTimeout(() => {
          this.setupWebSocket();
        }, delay);
      }
    }
  }

  private handleWebSocketUpdate(data: any): void {
    const now = Date.now();
    this.stats.wsUpdates++;
    this.stats.lastWsUpdate = now;

    if (!data.contents) return;

    const { subaccount } = data.contents;
    if (!subaccount) return;

    // Handle position updates
    if (subaccount.openPerpetualPositions !== undefined) {
      const positions = subaccount.openPerpetualPositions;
      this.stats.positionUpdates++;
      this.clearCachePattern('positions');
      this.notifyPositionListeners(positions);
    }

    // Handle order updates
    if (subaccount.orders !== undefined) {
      const orders = subaccount.orders;
      this.stats.orderUpdates++;
      this.clearCachePattern('orders');
      this.notifyOrderListeners(orders);
    }

    // Handle fills
    if (subaccount.fills !== undefined) {
      this.clearCachePattern('fills');
    }
  }

  private cleanup(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }

    if (this.wsUnsubscribe) {
      try {
        this.wsUnsubscribe();
      } catch (error) {
        console.error('Error unsubscribing', error);
      }
      this.wsUnsubscribe = null;
    }

    this.isSubscribed = false;
    this.subscriptionAttempts = 0;
    this.cache.clear();
    this.positionListeners = [];
    this.orderListeners = [];
  }

  onPositionsUpdate(callback: DataUpdateCallback<Position[]>): () => void {
    this.positionListeners.push(callback);

    return () => {
      this.positionListeners = this.positionListeners.filter(cb => cb !== callback);
    };
  }

  onOrdersUpdate(callback: DataUpdateCallback<Order[]>): () => void {
    this.orderListeners.push(callback);

    return () => {
      this.orderListeners = this.orderListeners.filter(cb => cb !== callback);
    };
  }

  private notifyPositionListeners(positions: Position[]): void {
    this.positionListeners.forEach(listener => {
      try {
        listener(positions);
      } catch (error) {
        console.error('Position listener error:', error);
      }
    });
  }

  private notifyOrderListeners(orders: Order[]): void {
    this.orderListeners.forEach(listener => {
      try {
        listener(orders);
      } catch (error) {
        console.error('Order listener error:', error);
      }
    });
  }

  async getSubaccount(useCache = true) {
    const cacheKey = 'subaccount';

    if (useCache) {
      const cached = this.getCached(cacheKey);
      if (cached) return cached;
    }

    this.stats.restCalls++;
    const { indexer, address, subaccountNumber } = this.getContext();
    const data = await indexer.account.getSubaccount(address, subaccountNumber);

    this.setCache(cacheKey, data);
    return data;
  }

  async getPositions(
    status: 'OPEN' | 'CLOSED' = 'OPEN',
    limit?: number,
    useCache = true
  ): Promise<Position[]> {
    const cacheKey = `positions-${status}-${limit}`;

    if (useCache) {
      const cached = this.getCached<Position[]>(cacheKey);
      if (cached) return cached;
    }

    this.stats.restCalls++;
    const { indexer, address, subaccountNumber } = this.getContext();
    const response = await indexer.account.getSubaccountPerpetualPositions(
      address,
      subaccountNumber,
      status as any,
      limit
    );

    const positions = response.positions || [];
    this.setCache(cacheKey, positions);
    return positions;
  }

  async getAssetPositions(
    status: 'OPEN' | 'CLOSED' = 'OPEN',
    limit?: number,
    useCache = true
  ): Promise<AssetPosition[]> {
    const cacheKey = `asset-positions-${status}-${limit}`;

    if (useCache) {
      const cached = this.getCached<AssetPosition[]>(cacheKey);
      if (cached) return cached;
    }

    this.stats.restCalls++;
    const { indexer, address, subaccountNumber } = this.getContext();
    const response = await indexer.account.getSubaccountAssetPositions(
      address,
      subaccountNumber,
      status as any,
      limit
    );

    const assetPositions = response.positions || [];
    this.setCache(cacheKey, assetPositions);
    return assetPositions;
  }

  async getOrders(
    ticker?: string,
    limit = 10,
    returnLatestOrders = true,
    useCache = true
  ): Promise<Order[]> {
    const cacheKey = `orders-${ticker || 'all'}-${limit}-${returnLatestOrders}`;

    if (useCache) {
      const cached = this.getCached<Order[]>(cacheKey);
      if (cached) return cached;
    }

    this.stats.restCalls++;
    const { indexer, address, subaccountNumber } = this.getContext();
    const response = await indexer.account.getSubaccountOrders(
      address,
      subaccountNumber,
      ticker,
      undefined,
      undefined,
      undefined,
      undefined,
      limit,
      undefined,
      undefined,
      returnLatestOrders
    );

    const orders = response || [];
    this.setCache(cacheKey, orders);
    return orders;
  }

  async getFills(
    ticker?: string,
    limit = 10,
    createdBeforeOrAtHeight?: string,
    useCache = true
  ): Promise<Fill[]> {
    const cacheKey = `fills-${ticker || 'all'}-${limit}-${createdBeforeOrAtHeight || 'latest'}`;

    if (useCache) {
      const cached = this.getCached<Fill[]>(cacheKey);
      if (cached) return cached;
    }

    this.stats.restCalls++;
    const { indexer, address, subaccountNumber } = this.getContext();
    const response = await indexer.account.getSubaccountFills(
      address,
      subaccountNumber,
      ticker,
      undefined,
      limit,
      undefined,
      createdBeforeOrAtHeight
    );

    const fills = response.fills || [];
    this.setCache(cacheKey, fills);
    return fills;
  }

  async getHistoricalPnl(
    effectiveBeforeOrAt?: string,
    effectiveAtOrAfter?: string,
    limit = 100,
    useCache = true
  ): Promise<HistoricalPnl[]> {
    const cacheKey = `pnl-${effectiveBeforeOrAt || 'all'}-${effectiveAtOrAfter || 'all'}-${limit}`;

    if (useCache) {
      const cached = this.getCached<HistoricalPnl[]>(cacheKey);
      if (cached) return cached;
    }

    this.stats.restCalls++;
    const { indexer, address, subaccountNumber } = this.getContext();
    const response = await indexer.account.getSubaccountHistoricalPNLs(
      address,
      subaccountNumber,
      undefined,
      effectiveBeforeOrAt,
      undefined,
      effectiveAtOrAfter,
      limit
    );

    const historicalPnls = response.historicalPnl || [];
    this.setCache(cacheKey, historicalPnls);
    return historicalPnls;
  }

  async refreshPositions(status: 'OPEN' | 'CLOSED' = 'OPEN', limit?: number): Promise<Position[]> {
    this.clearCachePattern('positions');
    return this.getPositions(status, limit, false);
  }

  async refreshOrders(ticker?: string, limit = 10): Promise<Order[]> {
    this.clearCachePattern('orders');
    return this.getOrders(ticker, limit, true, false);
  }

  async refreshFills(ticker?: string, limit = 10): Promise<Fill[]> {
    this.clearCachePattern('fills');
    return this.getFills(ticker, limit, undefined, false);
  }

  clearCache(pattern?: string): void {
    this.clearCachePattern(pattern);
  }

  isReady(): boolean {
    return dydxWalletService.isConnected();
  }

  isReceivingUpdates(): boolean {
    return this.isSubscribed && Date.now() - this.stats.lastWsUpdate < 30000;
  }

  getServiceStatus() {
    const wsDebug = webSocketManager.getDebugInfo();
    const timeSinceLastUpdate = this.stats.lastWsUpdate
      ? Date.now() - this.stats.lastWsUpdate
      : null;

    return {
      walletConnected: dydxWalletService.isConnected(),
      websocketConnected: webSocketManager.isConnected(),
      subscribed: this.isSubscribed,
      subscriptionAttempts: this.subscriptionAttempts,
      stats: {
        wsUpdates: this.stats.wsUpdates,
        restCalls: this.stats.restCalls,
        positionUpdates: this.stats.positionUpdates,
        orderUpdates: this.stats.orderUpdates,
        cacheSize: this.cache.size,
        timeSinceLastUpdate,
      },
      listeners: {
        positions: this.positionListeners.length,
        orders: this.orderListeners.length,
      },
      websocketManager: wsDebug,
    };
  }
}

export const dydxDataService = new DydxDataService();
