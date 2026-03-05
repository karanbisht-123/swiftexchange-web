import { PositionStatus, TickerType } from '@dydxprotocol/v4-client-js';

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
  positionSizeBefore?: string;
  entryPriceBefore?: string;
  positionSideBefore?: string;
}

export interface HistoricalPnl {
  id: string;
  subaccountId?: string;
  equity: string;
  totalPnl: string;
  netTransfers: string;
  createdAt: string;
  blockHeight: string;
  blockTime: string;
}

export interface FundingPayment {
  subaccountNumber: string;
  createdAt: string;
  createdAtHeight: string;
  perpetualId: string;
  ticker: string;
  oraclePrice: string;
  size: string;
  side: string;
  rate: string;
  payment: string;
  fundingIndex: string;
}

export interface FundingPaymentsResponse {
  fundingPayments: FundingPayment[];
  pageSize: number;
  totalResults: number;
  offset: number;
}

export interface Transfer {
  id: string;
  sender: {
    address: string;
    parentSubaccountNumber?: number;
  };
  recipient: {
    address: string;
    parentSubaccountNumber?: number;
  };
  size: string;
  symbol: string;
  type: 'DEPOSIT' | 'WITHDRAWAL';
  createdAt: string;
  createdAtHeight: string;
  transactionHash: string;
}

export interface TransfersResponse {
  transfers: Transfer[];
  limit: number;
  latestCreatedAt: string;
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

  invalidateCache(keys: string | string[]): void {
    const patterns = Array.isArray(keys) ? keys : [keys];
    const keysToDelete: string[] = [];

    this.cache.forEach((_, key) => {
      if (patterns.some(pattern => key.startsWith(pattern))) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach(key => this.cache.delete(key));
  }

  async getPositions(
    status: 'OPEN' | 'CLOSED' = 'OPEN',
    limit?: number,
    useCache = true
  ): Promise<Position[]> {
    const statusEnum = status === 'OPEN' ? PositionStatus.OPEN : PositionStatus.CLOSED;
    const cacheKey = `positions_${status}_${limit || 'default'}`;

    if (useCache) {
      const cached = this.getCached<Position[]>(cacheKey);
      if (cached) return cached;
    }

    this.stats.restCalls++;

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
    limit?: number,
    useCache = true
  ): Promise<AssetPosition[]> {
    const statusEnum = status === 'OPEN' ? PositionStatus.OPEN : PositionStatus.CLOSED;
    const cacheKey = `asset_positions_${status}_${limit || 'default'}`;

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
    limit?: number,
    returnLatestOrders = true,
    useCache = true
  ): Promise<Order[]> {
    const cacheKey = `orders_${ticker || 'all'}_${limit || 'default'}_${returnLatestOrders}`;

    if (useCache) {
      const cached = this.getCached<Order[]>(cacheKey);
      if (cached) return cached;
    }

    this.stats.restCalls++;
    const { indexer, address } = this.getContext();

    try {
      const response = await indexer.account.getParentSubaccountNumberOrders(
        address,
        0,
        ticker,
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
        const timeA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const timeB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
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
    limit?: number,
    useCache = true
  ): Promise<Fill[]> {
    const cacheKey = `fills_${ticker || 'all'}_${limit || 'default'}`;

    if (useCache) {
      const cached = this.getCached<Fill[]>(cacheKey);
      if (cached) return cached;
    }

    this.stats.restCalls++;
    const { indexer, address } = this.getContext();

    try {
      const response: any = await indexer.account.getParentSubaccountNumberFills(
        address,
        0,
        ticker,
        TickerType.PERPETUAL,
        limit,
        undefined,
        undefined
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
    const { indexer, address } = this.getContext();

    try {
      const response = await indexer.account.getParentSubaccountNumberHistoricalPNLs(
        address,
        0,
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

  async refreshPositions(status: 'OPEN' | 'CLOSED' = 'OPEN', limit?: number): Promise<Position[]> {
    this.invalidateCache('positions');
    return this.getPositions(status, limit, false);
  }

  async refreshOrders(ticker?: string, limit?: number): Promise<Order[]> {
    this.invalidateCache('orders');
    return this.getOrders(ticker, limit, true, false);
  }

  async refreshFills(ticker?: string, limit?: number): Promise<Fill[]> {
    this.invalidateCache('fills');
    return this.getFills(ticker, limit, false);
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
  async getFundingPayments(
    ticker?: string,
    limit: number = 100,
    page: number = 1
  ): Promise<FundingPaymentsResponse> {
    this.stats.restCalls++;
    const { indexer, address, subaccountNumber } = this.getContext();

    try {
      const response: any = await indexer.account.getSubaccountFundingPayments(
        address,
        subaccountNumber,
        limit,
        ticker,
        undefined,
        page
      );

      return {
        fundingPayments: (response.fundingPayments || []) as FundingPayment[],
        pageSize: response.pageSize || limit,
        totalResults: response.totalResults || 0,
        offset: response.offset || 0
      };
    } catch (err) {
      console.error('[DydxDataService] getFundingPayments failed:', err);
      return {
        fundingPayments: [],
        pageSize: limit,
        totalResults: 0,
        offset: 0
      };
    }
  }

  async getHistoricalFunding(
    market: string,
    limit: number = 100,
    effectiveBeforeOrAt?: string
  ): Promise<any[]> {
    this.stats.restCalls++;
    try {
      const indexer = dydxWalletService.getIndexerClient();
      if (!indexer) throw new Error('Indexer client not initialized');

      const response: any = await indexer.markets.getPerpetualMarketHistoricalFunding(
        market,
        effectiveBeforeOrAt,
        undefined,
        limit
      );
      return response.historicalFunding || [];
    } catch (err) {
      console.error('[DydxDataService] getHistoricalFunding failed:', err);
      return [];
    }
  }

  async getTransfers(
    limit: number = 100,
    createdBeforeOrAt?: any
  ): Promise<TransfersResponse> {
    this.stats.restCalls++;
    const { indexer, address } = this.getContext();

    try {

      const response: any = await indexer.account.getParentSubaccountNumberTransfers(
        address,
        0,
        limit,
        createdBeforeOrAt
      );

      return {
        transfers: (response.transfers || []) as Transfer[],
        limit: limit,
        latestCreatedAt: response.latestCreatedAt || ''
      };
    } catch (err) {
      console.error('[DydxDataService] getTransfers failed:', err);
      return {
        transfers: [],
        limit: limit,
        latestCreatedAt: ''
      };
    }
  }
}
export const dydxDataService = new DydxDataService();
