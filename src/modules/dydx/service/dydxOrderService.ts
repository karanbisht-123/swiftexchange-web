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

class DydxDataService {
  private cache = new Map<string, CacheEntry<any>>();
  private readonly CACHE_TTL = 5000;

  private stats = {
    restCalls: 0,
    cacheHits: 0,
    cacheMisses: 0,
  };

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
      this.stats.cacheHits++;
      return cached.data as T;
    }
    if (cached) {
      this.cache.delete(key);
    }
    this.stats.cacheMisses++;
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
    limit = 50,
    returnLatestOrders = true,
    useCache = true,
    createdBeforeOrAtHeight?: string
  ): Promise<Order[]> {
    const cacheKey = `orders-${ticker || 'all'}-${limit}-${returnLatestOrders}-${createdBeforeOrAtHeight || 'latest'}`;

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
      undefined, // tickerType
      undefined, // side
      undefined, // status
      undefined, // type
      limit,
      undefined, // goodTilBlockBeforeOrAt
      undefined, // goodTilBlockTimeBeforeOrAt
      returnLatestOrders
    );

    // Sort by date (newest first)
    const orders = (response || []).sort((a: Order, b: Order) => {
      const timeA = new Date(a.updatedAt || a.createdAtHeight || '0').getTime();
      const timeB = new Date(b.updatedAt || b.createdAtHeight || '0').getTime();
      return timeB - timeA;
    });

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

    // Sort by date (newest first)
    const fills = (response.fills || []).sort((a: Fill, b: Fill) => {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    this.setCache(cacheKey, fills);
    return fills;
  }

  async getHistoricalPnl(
    effectiveBeforeOrAt?: string,
    effectiveAtOrAfter?: string,
    limit = 10,
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

  async refreshOrders(ticker?: string, limit = 50): Promise<Order[]> {
    this.clearCachePattern('orders');
    return this.getOrders(ticker, limit, true, false);
  }

  async refreshFills(ticker?: string, limit = 50): Promise<Fill[]> {
    this.clearCachePattern('fills');
    return this.getFills(ticker, limit, undefined, false);
  }

  clearCache(pattern?: string): void {
    this.clearCachePattern(pattern);
  }

  isReady(): boolean {
    return dydxWalletService.isConnected();
  }

  getServiceStatus() {
    return {
      walletConnected: dydxWalletService.isConnected(),
      stats: {
        restCalls: this.stats.restCalls,
        cacheHits: this.stats.cacheHits,
        cacheMisses: this.stats.cacheMisses,
        cacheSize: this.cache.size,
      },
    };
  }
}

export const dydxDataService = new DydxDataService();
