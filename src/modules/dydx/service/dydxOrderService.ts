import { PositionStatus } from '@dydxprotocol/v4-client-js';

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
  subaccountNumber?: any;
}

export interface AssetPosition {
  assetId: string;
  symbol: string;
  side: string;
  size: string;
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
  private readonly CACHE_TTL = 8000;

  private stats = {
    restCalls: 0,
    cacheHits: 0,
    cacheMisses: 0,
  };

  private getContext() {
    const indexer = dydxWalletService.getIndexerClient();
    const address = dydxWalletService.getAddress();
    const subaccountNumber = dydxWalletService.getSubaccountNumber();

    if (!indexer || !address || subaccountNumber === undefined) {
      throw new Error('Wallet not connected or missing subaccount');
    }

    return { indexer, address, subaccountNumber: Number(subaccountNumber) };
  }

  private getCached<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (entry && Date.now() - entry.timestamp < this.CACHE_TTL) {
      this.stats.cacheHits++;
      return entry.data as T;
    }
    this.cache.delete(key);
    this.stats.cacheMisses++;
    return null;
  }

  private setCache<T>(key: string, data: T): void {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  private invalidateCache(keys: string | string[]): void {
    if (typeof keys === 'string') {
      keys = [keys];
    }
    keys.forEach(pattern => {
      for (const key of this.cache.keys()) {
        if (key.includes(pattern)) {
          this.cache.delete(key);
        }
      }
    });
  }

  // REST API methods (fallback / manual refresh only)
  async getPositions(
    status: 'OPEN' | 'CLOSED' = 'OPEN',
    limit = 100,
    useCache = true
  ): Promise<Position[]> {
    const statusEnum = status === 'OPEN' ? PositionStatus.OPEN : PositionStatus.CLOSED;
    const cacheKey = `positions_${status}_${limit}`;

    if (useCache) {
      const cached = this.getCached<Position[]>(cacheKey);
      if (cached) return cached;
    }

    this.stats.restCalls++;
    console.log('[DydxDataService] REST API call for positions (fallback/manual refresh)');

    const { indexer, address, subaccountNumber } = this.getContext();

    try {
      const response = await indexer.account.getSubaccountPerpetualPositions(
        address,
        subaccountNumber,
        statusEnum,
        limit
      );

      const positions = (response?.positions || []) as Position[];
      this.setCache(cacheKey, positions);
      return positions;
    } catch (err) {
      console.error('[DydxDataService] getPositions failed:', err);
      return [];
    }
  }

  async getAssetPositions(
    status: 'OPEN' | 'CLOSED' = 'OPEN',
    limit = 50,
    useCache = true
  ): Promise<AssetPosition[]> {
    const statusEnum = status === 'OPEN' ? PositionStatus.OPEN : PositionStatus.CLOSED;
    const cacheKey = `asset_positions_${status}_${limit}`;

    if (useCache) {
      const cached = this.getCached<AssetPosition[]>(cacheKey);
      if (cached) return cached;
    }

    this.stats.restCalls++;
    const { indexer, address, subaccountNumber } = this.getContext();

    try {
      const response = await indexer.account.getSubaccountAssetPositions(
        address,
        subaccountNumber,
        statusEnum,
        limit
      );

      const positions = (response?.positions || []).map((p: any) => p.position) as AssetPosition[];

      this.setCache(cacheKey, positions);
      return positions;
    } catch (err) {
      console.error('[DydxDataService] getAssetPositions failed:', err);
      return [];
    }
  }

  async getOrders(
    ticker?: string,
    limit = 50,
    returnLatestOrders = true,
    useCache = true,
    createdBeforeOrAtHeight?: string
  ): Promise<Order[]> {
    const cacheKey = `orders_${ticker || 'all'}_${limit}_${returnLatestOrders}_${createdBeforeOrAtHeight || 'latest'}`;

    if (useCache) {
      const cached = this.getCached<Order[]>(cacheKey);
      if (cached) return cached;
    }

    this.stats.restCalls++;
    const { indexer, address, subaccountNumber } = this.getContext();

    try {
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

      const orders = (response || []) as Order[];

      const sorted = orders.sort((a, b) => {
        const timeA = a.updatedAt
          ? new Date(a.updatedAt).getTime()
          : Number(a.createdAtHeight || 0);
        const timeB = b.updatedAt
          ? new Date(b.updatedAt).getTime()
          : Number(b.createdAtHeight || 0);
        return timeB - timeA;
      });

      this.setCache(cacheKey, sorted);
      return sorted;
    } catch (err) {
      console.error('[DydxDataService] getOrders failed:', err);
      return [];
    }
  }

  async getFills(
    ticker?: string,
    limit = 50,
    createdBeforeOrAtHeight?: string,
    useCache = true
  ): Promise<Fill[]> {
    const cacheKey = `fills_${ticker || 'all'}_${limit}_${createdBeforeOrAtHeight || 'latest'}`;

    if (useCache) {
      const cached = this.getCached<Fill[]>(cacheKey);
      if (cached) return cached;
    }

    this.stats.restCalls++;
    const { indexer, address, subaccountNumber } = this.getContext();

    try {
      const response = await indexer.account.getSubaccountFills(
        address,
        subaccountNumber,
        ticker,
        undefined,
        limit,
        undefined,
        createdBeforeOrAtHeight
      );

      const fills = (response?.fills || []) as Fill[];

      const sorted = fills.sort((a, b) => {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

      this.setCache(cacheKey, sorted);
      return sorted;
    } catch (err) {
      console.error('[DydxDataService] getFills failed:', err);
      return [];
    }
  }

  async getHistoricalPnl(
    effectiveBeforeOrAt?: string,
    effectiveAtOrAfter?: string,
    limit = 10,
    useCache = true
  ): Promise<HistoricalPnl[]> {
    const cacheKey = `pnl_${effectiveBeforeOrAt || 'all'}_${effectiveAtOrAfter || 'all'}_${limit}`;

    if (useCache) {
      const cached = this.getCached<HistoricalPnl[]>(cacheKey);
      if (cached) return cached;
    }

    this.stats.restCalls++;
    const { indexer, address, subaccountNumber } = this.getContext();

    try {
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
    } catch (err) {
      console.error('[DydxDataService] getHistoricalPnl failed:', err);
      return [];
    }
  }

  async refreshPositions(status: 'OPEN' | 'CLOSED' = 'OPEN', limit = 100): Promise<Position[]> {
    this.invalidateCache('positions');
    return this.getPositions(status, limit, false);
  }

  async refreshOrders(ticker?: string, limit = 50): Promise<Order[]> {
    this.invalidateCache('orders');
    return this.getOrders(ticker, limit, true, false);
  }

  async refreshFills(ticker?: string, limit = 50): Promise<Fill[]> {
    this.invalidateCache('fills');
    return this.getFills(ticker, limit, undefined, false);
  }

  clearCache(pattern?: string): void {
    this.invalidateCache(pattern || '');
  }

  isReady(): boolean {
    return dydxWalletService.isConnected();
  }

  getServiceStatus() {
    return {
      walletConnected: dydxWalletService.isConnected(),
      stats: {
        ...this.stats,
        cacheSize: this.cache.size,
      },
    };
  }
}

export const dydxDataService = new DydxDataService();
