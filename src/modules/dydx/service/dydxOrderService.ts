import { PositionStatus, TickerType } from '@dydxprotocol/v4-client-js';

import { useWebSocketStore } from '../store/websocketStore';
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
  leverage?: string;
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
  updatedAt: string;
  updatedAtHeight: string;
  clientMetadata: string;
  marginMode?: string;
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
  createdAtHeight?: string;
  orderId?: string;
  clientMetadata?: string;
  positionSizeBefore?: string;
  entryPriceBefore?: string;
  positionSideBefore?: string;
  marginMode?: string;
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
  isFetching?: boolean;
}

export function normalizeFill(f: any): Fill {
  if (!f) return f;
  return {
    id: f.id,
    side: f.side,
    liquidity: f.liquidity,
    type: f.type,
    market: f.market || f.ticker,
    marketType: f.marketType || f.market_type,
    price: f.price,
    size: f.size,
    fee: f.fee,
    createdAt: f.createdAt || f.created_at,
    createdAtHeight: f.createdAtHeight || f.created_at_height,
    orderId: f.orderId || f.order_id,
    clientMetadata: f.clientMetadata || f.client_metadata,
    positionSizeBefore: f.positionSizeBefore || f.position_size_before,
    entryPriceBefore: f.entryPriceBefore || f.entry_price_before,
    positionSideBefore: f.positionSideBefore || f.position_side_before,
    marginMode: f.marginMode,
  };
}

export function normalizeOrder(o: any): Order {
  if (!o) return o;
  return {
    id: o.id,
    subaccountId: o.subaccountId || o.subaccount_id,
    clientId: o.clientId || o.client_id,
    clobPairId: o.clobPairId || o.clob_pair_id,
    side: o.side,
    size: o.size,
    totalFilled: o.totalFilled || o.total_filled,
    price: o.price,
    type: o.type,
    status: o.status,
    timeInForce: o.timeInForce || o.time_in_force,
    postOnly: o.postOnly !== undefined ? o.postOnly : o.post_only,
    reduceOnly: o.reduceOnly !== undefined ? o.reduceOnly : o.reduce_only,
    orderFlags: o.orderFlags || o.order_flags,
    goodTilBlock: o.goodTilBlock || o.good_til_block,
    goodTilBlockTime: o.goodTilBlockTime || o.good_til_block_time,
    ticker: o.ticker || o.clobPairId || o.clob_pair_id || '',
    createdAtHeight: o.createdAtHeight || o.created_at_height,
    updatedAt: o.updatedAt || o.updated_at,
    updatedAtHeight: o.updatedAtHeight || o.updated_at_height,
    clientMetadata: o.clientMetadata || o.client_metadata,
    marginMode: o.marginMode,
  };
}

class DydxDataService {
  private cache = new Map<string, CacheEntry<any>>();
  private readonly CACHE_TTL = 5000;
  private stats = {
    restCalls: 0,
    cacheHits: 0,
    cacheMisses: 0,
  };
  private listeners = new Set<(key: string, data: any) => void>();

  subscribe(listener: (key: string, data: any) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(key: string, data: any): void {
    this.listeners.forEach(listener => {
      try {
        listener(key, data);
      } catch (err) {
        console.error('[DydxDataService] Listener error:', err);
      }
    });
  }

  getCachedValueWithoutSideEffects<T>(key: string): T | null {
    const entry = this.cache.get(key);
    return entry ? (entry.data as T) : null;
  }

  getCachedFundingPayments(
    ticker?: string,
    limit: number = 100,
    page: number = 1
  ): FundingPaymentsResponse | null {
    const cacheKey = `funding_payments_${ticker || 'all'}_${limit}_${page}`;
    return this.getCachedValueWithoutSideEffects<FundingPaymentsResponse>(cacheKey);
  }

  getCachedOrders(ticker?: string, limit?: number, returnLatestOrders = true): Order[] | null {
    const cacheKey = `orders_${ticker || 'all'}_${limit || 'default'}_${returnLatestOrders}`;
    return this.getCachedValueWithoutSideEffects<Order[]>(cacheKey);
  }

  getCachedFills(ticker?: string, limit?: number): Fill[] | null {
    const cacheKey = `fills_${ticker || 'all'}_${limit || 'default'}`;
    return this.getCachedValueWithoutSideEffects<Fill[]>(cacheKey);
  }

  private getContext() {
    const indexer = dydxWalletService.getIndexerClient();
    const address = dydxWalletService.getAddress();
    const subaccountNumber = dydxWalletService.getSubaccountNumber();

    if (!indexer || !address || subaccountNumber === undefined) {
      throw new Error('Wallet not connected or missing subaccount');
    }

    return { indexer, address, subaccountNumber: Number(subaccountNumber) };
  }

  private getCached<T>(key: string, customTtl?: number): T | null {
    const entry = this.cache.get(key);
    const ttl = customTtl !== undefined ? customTtl : this.CACHE_TTL;
    if (entry && Date.now() - entry.timestamp < ttl) {
      this.stats.cacheHits++;
      return entry.data as T;
    }
    this.cache.delete(key);
    this.stats.cacheMisses++;
    return null;
  }

  private setCache<T>(key: string, data: T): void {
    this.cache.set(key, { data, timestamp: Date.now(), isFetching: false });
  }

  private triggerBackgroundRevalidate<T>(
    key: string,
    fetchPromise: Promise<T>,
    onSuccess?: (data: T) => void
  ): void {
    const entry = this.cache.get(key);
    if (!entry) return;

    entry.isFetching = true;

    fetchPromise
      .then(data => {
        entry.data = data;
        entry.timestamp = Date.now();
        entry.isFetching = false;
        this.notifyListeners(key, data);
        if (onSuccess) {
          try {
            onSuccess(data);
          } catch (e) {
            console.error('[DydxDataService] onSuccess callback failed:', e);
          }
        }
      })
      .catch(err => {
        console.error(`[DydxDataService] Background revalidation failed for key ${key}:`, err);
        entry.isFetching = false;
      });
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
    useCache = true,
    createdBeforeOrAt?: string
  ): Promise<Order[]> {
    const cacheKey = `orders_${ticker || 'all'}_${limit || 'default'}_${returnLatestOrders}_${createdBeforeOrAt || 'none'}`;

    if (useCache) {
      const entry = this.cache.get(cacheKey);
      if (entry) {
        const age = Date.now() - entry.timestamp;
        if (age < 60000) {
          this.stats.cacheHits++;
          return entry.data as Order[];
        }
        if (!entry.isFetching) {
          const fetchPromise = this.fetchOrdersRaw(
            ticker,
            limit,
            returnLatestOrders,
            createdBeforeOrAt
          );
          this.triggerBackgroundRevalidate(cacheKey, fetchPromise, data => {
            try {
              const address = dydxWalletService.getAddress();
              const subaccountNumber = dydxWalletService.getSubaccountNumber();
              const parentKey = address ? `parent_subaccount_${address}_${subaccountNumber}` : null;
              if (parentKey) {
                useWebSocketStore
                  .getState()
                  .updateParentSubaccount(
                    parentKey,
                    { orders: data as any, lastUpdate: Date.now() },
                    0
                  );
              }
            } catch (err) {
              console.error('[DydxDataService] Failed to update websocket store for orders:', err);
            }
          });
        }

        this.stats.cacheHits++;
        return entry.data as Order[];
      }
    }

    const sorted = await this.fetchOrdersRaw(ticker, limit, returnLatestOrders, createdBeforeOrAt);
    this.setCache(cacheKey, sorted);
    return sorted;
  }

  private async fetchOrdersRaw(
    ticker?: string,
    limit?: number,
    returnLatestOrders = true,
    createdBeforeOrAt?: string
  ): Promise<Order[]> {
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
        createdBeforeOrAt,
        returnLatestOrders
      );
      let orders = ((response || []) as any[]).map(normalizeOrder);

      let trades: any[] = [];
      try {
        const tradeResponse: any = await indexer.account.getParentSubaccountNumberTradeHistory(
          address,
          0,
          ticker,
          undefined,
          limit,
          undefined
        );
        trades = tradeResponse?.tradeHistory || [];
      } catch (err) {
        console.error('[DydxDataService] Failed to fetch trade history for order merging', err);
      }

      const tradeSubNumMap = new Map<string, number>();
      trades.forEach((t: any) => {
        const orderId = t.orderId || t.id;
        if (orderId) {
          tradeSubNumMap.set(orderId, parseInt(t.subaccountNumber) || 0);
        }
      });
      const wsOrders = useWebSocketStore.getState().parentSubaccounts;

      orders = orders.map((o: Order) => {
        let subNum = 0;

        if (tradeSubNumMap.has(o.id)) {
          subNum = tradeSubNumMap.get(o.id)!;
        } else {
          wsOrders.forEach(parent => {
            const cachedOrder = parent.orders?.find(wsO => wsO.id === o.id);
            if (cachedOrder && typeof (cachedOrder as any).subaccountNumber === 'number') {
              subNum = (cachedOrder as any).subaccountNumber;
            }
          });
        }

        o.marginMode = subNum >= 128 ? 'ISOLATED' : 'CROSS';
        return o;
      });

      return orders.sort((a: Order, b: Order) => {
        const timeA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const timeB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return timeB - timeA;
      });
    } catch (err) {
      console.error('[DydxDataService] fetchOrdersRaw failed:', err);
      return [];
    }
  }

  async getFills(
    ticker?: string,
    limit?: number,
    useCache = true,
    createdBeforeOrAt?: string
  ): Promise<Fill[]> {
    const cacheKey = `fills_${ticker || 'all'}_${limit || 'default'}_${createdBeforeOrAt || 'none'}`;

    if (useCache) {
      const entry = this.cache.get(cacheKey);
      if (entry) {
        const age = Date.now() - entry.timestamp;
        if (age < 60000) {
          this.stats.cacheHits++;
          return entry.data as Fill[];
        }

        // Stale-While-Revalidate background fetch
        if (!entry.isFetching) {
          const fetchPromise = this.fetchFillsRaw(ticker, limit, createdBeforeOrAt);
          this.triggerBackgroundRevalidate(cacheKey, fetchPromise, data => {
            // Update useWebSocketStore in the background so all subscribers get fresh data
            try {
              const address = dydxWalletService.getAddress();
              const subaccountNumber = dydxWalletService.getSubaccountNumber();
              const parentKey = address ? `parent_subaccount_${address}_${subaccountNumber}` : null;
              if (parentKey) {
                useWebSocketStore.getState().updateParentSubaccount(parentKey, {
                  fills: data as any,
                  lastUpdate: Date.now(),
                });
              }
            } catch (err) {
              console.error('[DydxDataService] Failed to update websocket store for fills:', err);
            }
          });
        }

        this.stats.cacheHits++;
        return entry.data as Fill[];
      }
    }

    const sorted = await this.fetchFillsRaw(ticker, limit, createdBeforeOrAt);
    this.setCache(cacheKey, sorted);
    return sorted;
  }

  private async fetchFillsRaw(
    ticker?: string,
    limit?: number,
    createdBeforeOrAt?: string
  ): Promise<Fill[]> {
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
        createdBeforeOrAt
      );

      const fills = ((response?.fills || []) as any[]).map(normalizeFill);

      return fills.sort((a, b) => {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return timeB - timeA;
      });
    } catch (err) {
      console.error('[DydxDataService] Error fetching fills:', err);
      return [];
    }
  }

  async getHistoricalPnl(
    effectiveBeforeOrAt?: string,
    effectiveAtOrAfter?: string,
    limit = 100,
    useCache = true,
    daily = false
  ): Promise<HistoricalPnl[]> {
    const cacheKey = `pnl_v2_${effectiveBeforeOrAt || 'all'}_${effectiveAtOrAfter || 'all'}_${limit}_${daily}`;

    if (useCache) {
      const cached = this.getCached<HistoricalPnl[]>(cacheKey);
      if (cached) return cached;
    }

    this.stats.restCalls++;
    const { indexer, address } = this.getContext();

    try {
      const response: any = await indexer.account.getParentSubaccountNumberHistoricalPNLsV2(
        address,
        0,
        daily,
        undefined,
        effectiveBeforeOrAt,
        undefined,
        effectiveAtOrAfter
      );

      const items = (response.pnl || []).map((item: any) => ({
        id: item.createdAt,
        equity: item.equity,
        totalPnl: item.totalPnl,
        netTransfers: item.netTransfers,
        createdAt: item.createdAt,
        blockHeight: item.createdAtHeight,
        blockTime: item.createdAt,
      })) as HistoricalPnl[];

      // Deduplicate by createdAt
      const uniqueResults: HistoricalPnl[] = [];
      const seenIds = new Set();
      for (const item of items) {
        const uniqueKey = item.createdAt;
        if (!seenIds.has(uniqueKey)) {
          seenIds.add(uniqueKey);
          uniqueResults.push(item);
        }
      }

      this.setCache(cacheKey, uniqueResults);
      return uniqueResults;
    } catch (err) {
      console.error('[DydxDataService] getHistoricalPnl V2 failed:', err);
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
    if (!pattern) {
      this.cache.clear();
    } else {
      this.invalidateCache(pattern);
    }
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
    page: number = 1,
    useCache = true
  ): Promise<FundingPaymentsResponse> {
    const cacheKey = `funding_payments_${ticker || 'all'}_${limit}_${page}`;

    if (useCache) {
      const entry = this.cache.get(cacheKey);
      if (entry) {
        const age = Date.now() - entry.timestamp;
        if (age < 60000) {
          this.stats.cacheHits++;
          return entry.data as FundingPaymentsResponse;
        }

        // Stale-While-Revalidate background fetch
        if (!entry.isFetching) {
          const fetchPromise = this.fetchFundingPaymentsRaw(ticker, limit, page);
          this.triggerBackgroundRevalidate(cacheKey, fetchPromise);
        }

        this.stats.cacheHits++;
        return entry.data as FundingPaymentsResponse;
      }
    }

    const result = await this.fetchFundingPaymentsRaw(ticker, limit, page);
    this.setCache(cacheKey, result);
    return result;
  }

  private async fetchFundingPaymentsRaw(
    ticker?: string,
    limit: number = 100,
    page: number = 1
  ): Promise<FundingPaymentsResponse> {
    this.stats.restCalls++;
    const { indexer, address } = this.getContext();

    try {
      const response: any = await indexer.account.getParentSubaccountNumberFundingPayments(
        address,
        0, // parent subaccount number
        limit,
        ticker,
        undefined,
        page
      );

      return {
        fundingPayments: (response.fundingPayments || []) as FundingPayment[],
        pageSize: response.pageSize || limit,
        totalResults: response.totalResults || 0,
        offset: response.offset || 0,
      };
    } catch (err) {
      console.error('[DydxDataService] fetchFundingPaymentsRaw failed:', err);
      return {
        fundingPayments: [],
        pageSize: limit,
        totalResults: 0,
        offset: 0,
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

  async getFillsByDateRange(fromDate: string, toDate: string): Promise<Fill[]> {
    const cacheKey = `fills_range_${fromDate}_${toDate}`;
    const cached = this.getCached<Fill[]>(cacheKey);
    if (cached) return cached;

    try {
      const from = new Date(fromDate).getTime();
      const toISO = new Date(toDate);
      toISO.setHours(23, 59, 59, 999);
      const to = toISO.getTime();

      const allFills = await this.getFills(undefined, undefined, false);
      const filtered = allFills.filter(f => {
        const t = new Date(f.createdAt).getTime();
        return t >= from && t <= to;
      });

      filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      this.setCache(cacheKey, filtered);
      return filtered;
    } catch (err) {
      console.error('[DydxDataService] getFillsByDateRange failed:', err);
      return [];
    }
  }

  async getFundingPaymentsByDateRange(fromDate: string, toDate: string): Promise<FundingPayment[]> {
    const cacheKey = `funding_payments_range_${fromDate}_${toDate}`;
    const cached = this.getCached<FundingPayment[]>(cacheKey);
    if (cached) return cached;

    try {
      const fromTime = new Date(fromDate).getTime();
      const toISO = new Date(toDate);
      toISO.setHours(23, 59, 59, 999);
      const toTime = toISO.getTime();

      const allPayments: FundingPayment[] = [];
      let page = 1;
      const limit = 100;
      let hasMore = true;

      while (hasMore) {
        const response = await this.getFundingPayments(undefined, limit, page, false);
        const payments = response.fundingPayments || [];
        if (payments.length === 0) {
          hasMore = false;
          break;
        }

        let reachedBeforeFromDate = false;
        for (const p of payments) {
          const t = new Date(p.createdAt).getTime();
          if (t >= fromTime && t <= toTime) {
            allPayments.push(p);
          } else if (t < fromTime) {
            reachedBeforeFromDate = true;
          }
        }

        if (
          reachedBeforeFromDate ||
          payments.length < limit ||
          allPayments.length >= response.totalResults
        ) {
          hasMore = false;
        } else {
          page++;
        }
      }

      allPayments.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      this.setCache(cacheKey, allPayments);
      return allPayments;
    } catch (err) {
      console.error('[DydxDataService] getFundingPaymentsByDateRange failed:', err);
      return [];
    }
  }

  async getOrdersByDateRange(fromDate: string, toDate: string): Promise<Order[]> {
    const cacheKey = `orders_range_${fromDate}_${toDate}`;
    const cached = this.getCached<Order[]>(cacheKey);
    if (cached) return cached;

    try {
      const allOrders = await this.getOrders(undefined, undefined, true, false);
      const from = new Date(fromDate).getTime();
      const toISO = new Date(toDate);
      toISO.setHours(23, 59, 59, 999);
      const to = toISO.getTime();

      const filtered = allOrders.filter(o => {
        const t = o.updatedAt ? new Date(o.updatedAt).getTime() : 0;
        return t >= from && t <= to;
      });

      this.setCache(cacheKey, filtered);
      return filtered;
    } catch (err) {
      console.error('[DydxDataService] getOrdersByDateRange failed:', err);
      return [];
    }
  }

  async getTransfersByDateRange(fromDate: string, toDate: string): Promise<Transfer[]> {
    const cacheKey = `transfers_range_${fromDate}_${toDate}`;
    const cached = this.getCached<Transfer[]>(cacheKey);
    if (cached) return cached;

    try {
      const response = await this.getTransfers(100);
      const from = new Date(fromDate).getTime();
      const toISO = new Date(toDate);
      toISO.setHours(23, 59, 59, 999);
      const to = toISO.getTime();

      const filtered = response.transfers.filter(tx => {
        const t = new Date(tx.createdAt).getTime();
        return t >= from && t <= to;
      });

      this.setCache(cacheKey, filtered);
      return filtered;
    } catch (err) {
      console.error('[DydxDataService] getTransfersByDateRange failed:', err);
      return [];
    }
  }

  async getPnlByDateRange(fromDate: string, toDate: string): Promise<HistoricalPnl[]> {
    const toISO = new Date(toDate);
    toISO.setHours(23, 59, 59, 999);
    return this.getHistoricalPnl(
      toISO.toISOString(),
      new Date(fromDate).toISOString(),
      100,
      true,
      true
    );
  }

  async getTransfers(limit: number = 100, createdBeforeOrAt?: string): Promise<TransfersResponse> {
    this.stats.restCalls++;
    const { indexer, address } = this.getContext();

    try {
      const response: any = await indexer.account.getParentSubaccountNumberTransfers(
        address,
        0,
        limit,
        undefined,
        createdBeforeOrAt
      );

      const items = (response.transfers || []) as Transfer[];

      return {
        transfers: items,
        limit: limit,
        latestCreatedAt: items.length > 0 ? items[0].createdAt : '',
      };
    } catch (err) {
      console.error('[DydxDataService] getTransfers failed:', err);
      return {
        transfers: [],
        limit: limit,
        latestCreatedAt: '',
      };
    }
  }
}
export const dydxDataService = new DydxDataService();
