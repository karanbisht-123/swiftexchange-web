import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

import { getSocketClient } from '../client/clients';
import { webSocketManager } from '../utils/WebSocketManager';

export interface ChildSubaccount {
  address: string;
  subaccountNumber: number;
  equity: string;
  freeCollateral: string;
  openPerpetualPositions: Record<string, PerpetualPosition>;
  assetPositions: Record<string, AssetPosition>;
  marginEnabled: boolean;
  updatedAtHeight: string;
  latestProcessedBlockHeight: string;
}

export interface PerpetualPosition {
  market: string;
  status: string;
  side: 'LONG' | 'SHORT';
  size: string;
  maxSize: string;
  entryPrice: string;
  exitPrice: string | null;
  realizedPnl: string;
  unrealizedPnl: string;
  createdAt: string;
  createdAtHeight: string;
  closedAt: string | null;
  sumOpen: string;
  sumClose: string;
  netFunding: string;
  subaccountNumber: number;
}

export interface AssetPosition {
  size: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  assetId: string;
  subaccountNumber: number;
}

export interface ParentSubaccountData {
  address: string;
  parentSubaccountNumber: number;
  equity: string;
  freeCollateral: string;
  childSubaccounts: ChildSubaccount[];
  orders: any[];
  fills: any[];
  transfers: any[];
  blockHeight: string;
  lastUpdate: number;
}

export interface MarketData {
  ticker: string;
  oraclePrice: string;
  priceChange24H: string;
  trades24H: string;
  volume24H: string;
  openInterest: string;
  nextFundingRate: string;
  lastUpdate: number;
}

export interface TradeData {
  market: string;
  trades: Array<{
    id: string;
    side: string;
    size: string;
    price: string;
    createdAt: string;
  }>;
  lastUpdate: number;
}

export interface CandleData {
  market: string;
  resolution: string;
  candles: Array<{
    startedAt: string;
    ticker: string;
    resolution: string;
    low: string;
    high: string;
    open: string;
    close: string;
    baseTokenVolume: string;
    usdVolume: string;
    trades: string;
    startingOpenInterest: string;
    orderbookMidPriceOpen?: string;
    orderbookMidPriceClose?: string;
  }>;
  lastUpdate: number;
}

interface WebSocketState {
  isConnected: boolean;
  connectionId: string | null;
  updateTrigger: number;

  parentSubaccounts: Map<string, ParentSubaccountData>;
  markets: Map<string, MarketData>;
  trades: Map<string, TradeData>;
  candles: Map<string, CandleData>;

  activeSubscriptions: Set<string>;
  subscriptionRefs: Map<string, () => void>;
  subscribeToParentSubaccount: (address: string, subaccountNumber: number) => void;
  unsubscribeFromParentSubaccount: (address: string, subaccountNumber: number) => void;

  subscribeToMarket: (ticker: string) => void;
  unsubscribeFromMarket: (ticker: string) => void;
  subscribeToAllMarkets: () => void;
  unsubscribeFromAllMarkets: () => void;
  subscribeToTrades: (market: string) => void;
  unsubscribeFromTrades: (market: string) => void;
  subscribeToCandles: (market: string, resolution: string) => void;
  unsubscribeFromCandles: (market: string, resolution: string) => void;
  updateParentSubaccount: (key: string, data: Partial<ParentSubaccountData>) => void;
  updateMarket: (ticker: string, data: Partial<MarketData>) => void;
  updateTrades: (market: string, data: Partial<TradeData>) => void;
  updateCandles: (key: string, data: Partial<CandleData>) => void;
  cleanup: () => void;
}

export const useWebSocketStore = create<WebSocketState>()(
  subscribeWithSelector((set, get) => ({
    isConnected: false,
    connectionId: null,
    updateTrigger: 0,
    parentSubaccounts: new Map(),
    markets: new Map(),
    trades: new Map(),
    candles: new Map(),
    activeSubscriptions: new Set(),
    subscriptionRefs: new Map(),

    // PARENT SUBACCOUNT SUBSCRIPTION
    subscribeToParentSubaccount: (address: string, subaccountNumber: number) => {
      const key = `parent_subaccount_${address}_${subaccountNumber}`;
      const { activeSubscriptions } = get();

      if (activeSubscriptions.has(key)) {
        console.log(`[WSStore] Already subscribed to ${key}`);
        return;
      }

      try {
        const socketClient = getSocketClient();

        const unsubscribe = socketClient.subscribeToParentSubaccounts(
          address,
          subaccountNumber,
          (data: any) => {
            if (!data?.contents) {
              console.warn('[WSStore] Received empty parent subaccount data');
              return;
            }

            const contents = data.contents;
            const updates: Partial<ParentSubaccountData> = {
              lastUpdate: Date.now(),
            };
            if (contents.subaccount) {
              const subaccount = contents.subaccount;

              updates.address = subaccount.address;
              updates.parentSubaccountNumber = subaccount.parentSubaccountNumber;
              updates.equity = subaccount.equity || '0';
              updates.freeCollateral = subaccount.freeCollateral || '0';

              if (subaccount.childSubaccounts && Array.isArray(subaccount.childSubaccounts)) {
                updates.childSubaccounts = subaccount.childSubaccounts.map((child: any) => ({
                  address: child.address,
                  subaccountNumber: child.subaccountNumber,
                  equity: child.equity || '0',
                  freeCollateral: child.freeCollateral || '0',
                  openPerpetualPositions: child.openPerpetualPositions || {},
                  assetPositions: child.assetPositions || {},
                  marginEnabled: child.marginEnabled ?? true,
                  updatedAtHeight: child.updatedAtHeight || '0',
                  latestProcessedBlockHeight: child.latestProcessedBlockHeight || '0',
                }));
              }
            }
            if (contents.orders !== undefined) {
              updates.orders = Array.isArray(contents.orders) ? contents.orders : [];
            }
            if (contents.fills !== undefined) {
              updates.fills = Array.isArray(contents.fills) ? contents.fills : [];
            }
            if (contents.transfers !== undefined) {
              updates.transfers = Array.isArray(contents.transfers) ? contents.transfers : [];
            }
            if (contents.blockHeight) {
              updates.blockHeight = contents.blockHeight;
            }

            get().updateParentSubaccount(key, updates);
          }
        );

        set(state => ({
          activeSubscriptions: new Set(state.activeSubscriptions).add(key),
          subscriptionRefs: new Map(state.subscriptionRefs).set(key, unsubscribe),
        }));

        console.log(`[WSStore] Subscribed to parent subaccount: ${key}`);
      } catch (error) {
        console.error(`[WSStore] Failed to subscribe to parent subaccount ${key}:`, error);
      }
    },

    unsubscribeFromParentSubaccount: (address: string, subaccountNumber: number) => {
      const key = `parent_subaccount_${address}_${subaccountNumber}`;
      const { subscriptionRefs, activeSubscriptions } = get();

      const unsubscribe = subscriptionRefs.get(key);
      if (unsubscribe) {
        unsubscribe();

        const newRefs = new Map(subscriptionRefs);
        newRefs.delete(key);

        const newSubs = new Set(activeSubscriptions);
        newSubs.delete(key);

        set({
          subscriptionRefs: newRefs,
          activeSubscriptions: newSubs,
        });

        console.log(`[WSStore] Unsubscribed from parent subaccount: ${key}`);
      }
    },
    // MARKET SUBSCRIPTIONS
    subscribeToMarket: (ticker: string) => {
      const key = `market_${ticker}`;
      const { activeSubscriptions } = get();

      if (activeSubscriptions.has(key)) {
        return;
      }

      try {
        const socketClient = getSocketClient();
        const unsubscribe = socketClient.subscribeToMarkets(data => {
          if (data.contents?.markets && data.contents.markets[ticker]) {
            const mktData = data.contents.markets[ticker];
            get().updateMarket(ticker, {
              ticker,
              oraclePrice: mktData.oraclePrice,
              priceChange24H: mktData.priceChange24H,
              trades24H: mktData.trades24H,
              volume24H: mktData.volume24H,
              openInterest: mktData.openInterest,
              nextFundingRate: mktData.nextFundingRate,
              lastUpdate: Date.now(),
            });
          }
        });

        set(state => ({
          activeSubscriptions: new Set(state.activeSubscriptions).add(key),
          subscriptionRefs: new Map(state.subscriptionRefs).set(key, unsubscribe),
        }));

        console.log(`[WSStore] Subscribed to market: ${ticker}`);
      } catch (error) {
        console.error(`[WSStore] Failed to subscribe to market ${ticker}:`, error);
      }
    },

    unsubscribeFromMarket: (ticker: string) => {
      const key = `market_${ticker}`;
      const { subscriptionRefs, activeSubscriptions } = get();

      const unsubscribe = subscriptionRefs.get(key);
      if (unsubscribe) {
        unsubscribe();

        const newRefs = new Map(subscriptionRefs);
        newRefs.delete(key);

        const newSubs = new Set(activeSubscriptions);
        newSubs.delete(key);

        set({
          subscriptionRefs: newRefs,
          activeSubscriptions: newSubs,
        });

        console.log(`[WSStore] Unsubscribed from market: ${ticker}`);
      }
    },

    subscribeToAllMarkets: () => {
      const key = 'markets_all';
      const { activeSubscriptions } = get();

      if (activeSubscriptions.has(key)) {
        return;
      }

      try {
        const socketClient = getSocketClient();
        const unsubscribe = socketClient.subscribeToMarkets((data: any) => {
          if (data.contents?.markets) {
            Object.entries(data.contents.markets).forEach(([ticker, mktData]: [string, any]) => {
              get().updateMarket(ticker, {
                ticker,
                oraclePrice: mktData.oraclePrice,
                priceChange24H: mktData.priceChange24H,
                trades24H: mktData.trades24H,
                volume24H: mktData.volume24H,
                openInterest: mktData.openInterest,
                nextFundingRate: mktData.nextFundingRate,
                lastUpdate: Date.now(),
              });
            });
          }
        });

        set(state => ({
          activeSubscriptions: new Set(state.activeSubscriptions).add(key),
          subscriptionRefs: new Map(state.subscriptionRefs).set(key, unsubscribe),
        }));

        console.log('[WSStore] Subscribed to all markets');
      } catch (error) {
        console.error('[WSStore] Failed to subscribe to all markets:', error);
      }
    },

    unsubscribeFromAllMarkets: () => {
      const key = 'markets_all';
      const { subscriptionRefs, activeSubscriptions } = get();

      const unsubscribe = subscriptionRefs.get(key);
      if (unsubscribe) {
        unsubscribe();

        const newRefs = new Map(subscriptionRefs);
        newRefs.delete(key);

        const newSubs = new Set(activeSubscriptions);
        newSubs.delete(key);

        set({
          subscriptionRefs: newRefs,
          activeSubscriptions: newSubs,
        });

        console.log('[WSStore] Unsubscribed from all markets');
      }
    },
    // TRADES SUBSCRIPTIONS
    subscribeToTrades: (market: string) => {
      const key = `trades_${market}`;
      const { activeSubscriptions } = get();

      if (activeSubscriptions.has(key)) {
        return;
      }

      try {
        const socketClient = getSocketClient();
        const unsubscribe = socketClient.subscribeToTrades(market, data => {
          if (data.contents?.trades) {
            get().updateTrades(market, {
              market,
              trades: data.contents.trades,
              lastUpdate: Date.now(),
            });
          }
        });

        set(state => ({
          activeSubscriptions: new Set(state.activeSubscriptions).add(key),
          subscriptionRefs: new Map(state.subscriptionRefs).set(key, unsubscribe),
        }));

        console.log(`[WSStore] Subscribed to trades: ${market}`);
      } catch (error) {
        console.error(`[WSStore] Failed to subscribe to trades ${market}:`, error);
      }
    },

    unsubscribeFromTrades: (market: string) => {
      const key = `trades_${market}`;
      const { subscriptionRefs, activeSubscriptions } = get();

      const unsubscribe = subscriptionRefs.get(key);
      if (unsubscribe) {
        unsubscribe();

        const newRefs = new Map(subscriptionRefs);
        newRefs.delete(key);

        const newSubs = new Set(activeSubscriptions);
        newSubs.delete(key);

        set({
          subscriptionRefs: newRefs,
          activeSubscriptions: newSubs,
        });

        console.log(`[WSStore] Unsubscribed from trades: ${market}`);
      }
    },

    subscribeToCandles: (market: string, resolution: string) => {
      const key = `candles_${market}_${resolution}`;
      const { activeSubscriptions } = get();

      if (activeSubscriptions.has(key)) {
        return;
      }

      try {
        const socketClient = getSocketClient();
        const unsubscribe = socketClient.subscribeToCandles(market, resolution, data => {
          if (data.contents?.candles) {
            get().updateCandles(key, {
              market,
              resolution,
              candles: data.contents.candles,
              lastUpdate: Date.now(),
            });
          }
        });

        set(state => ({
          activeSubscriptions: new Set(state.activeSubscriptions).add(key),
          subscriptionRefs: new Map(state.subscriptionRefs).set(key, unsubscribe),
        }));

        console.log(`[WSStore] Subscribed to candles: ${market}/${resolution}`);
      } catch (error) {
        console.error(`[WSStore] Failed to subscribe to candles ${market}/${resolution}:`, error);
      }
    },

    unsubscribeFromCandles: (market: string, resolution: string) => {
      const key = `candles_${market}_${resolution}`;
      const { subscriptionRefs, activeSubscriptions } = get();

      const unsubscribe = subscriptionRefs.get(key);
      if (unsubscribe) {
        unsubscribe();

        const newRefs = new Map(subscriptionRefs);
        newRefs.delete(key);

        const newSubs = new Set(activeSubscriptions);
        newSubs.delete(key);

        set({
          subscriptionRefs: newRefs,
          activeSubscriptions: newSubs,
        });

        console.log(`[WSStore] Unsubscribed from candles: ${market}/${resolution}`);
      }
    },
    // UPDATE METHODS
    // Add this method to your websocketStore.ts

    // OPTIMIZED updateParentSubaccount method - replace the existing one
    updateParentSubaccount: (key: string, data: Partial<ParentSubaccountData>) => {
      set(state => {
        const newMap = new Map(state.parentSubaccounts);
        const existing = newMap.get(key) || {
          address: '',
          parentSubaccountNumber: 0,
          equity: '0',
          freeCollateral: '0',
          childSubaccounts: [],
          orders: [],
          fills: [],
          transfers: [],
          blockHeight: '0',
          lastUpdate: 0,
        };

        // Smart merge for orders (dedupe by ID, keep newest)
        let mergedOrders = existing.orders;
        if (data.orders !== undefined) {
          const orderMap = new Map<string, any>();

          // Add existing orders
          existing.orders.forEach(order => orderMap.set(order.id, order));

          // Add/update with new orders
          data.orders.forEach(order => {
            const existingOrder = orderMap.get(order.id);
            // Only update if new order is more recent or doesn't exist
            if (
              !existingOrder ||
              (order.updatedAt &&
                (!existingOrder.updatedAt || order.updatedAt > existingOrder.updatedAt))
            ) {
              orderMap.set(order.id, order);
            }
          });

          mergedOrders = Array.from(orderMap.values());
        }

        // Smart merge for fills (dedupe by ID, keep newest)
        let mergedFills = existing.fills;
        if (data.fills !== undefined) {
          const fillMap = new Map<string, any>();

          // Add existing fills
          existing.fills.forEach(fill => fillMap.set(fill.id, fill));

          // Add/update with new fills
          data.fills.forEach(fill => {
            const existingFill = fillMap.get(fill.id);
            // Only update if new fill is more recent or doesn't exist
            if (
              !existingFill ||
              (fill.createdAt &&
                (!existingFill.createdAt || fill.createdAt > existingFill.createdAt))
            ) {
              fillMap.set(fill.id, fill);
            }
          });

          mergedFills = Array.from(fillMap.values());
        }

        const merged: ParentSubaccountData = {
          address: data.address ?? existing.address,
          parentSubaccountNumber: data.parentSubaccountNumber ?? existing.parentSubaccountNumber,
          equity: data.equity ?? existing.equity,
          freeCollateral: data.freeCollateral ?? existing.freeCollateral,
          childSubaccounts: data.childSubaccounts ?? existing.childSubaccounts,
          orders: mergedOrders,
          fills: mergedFills,
          transfers: data.transfers ?? existing.transfers,
          blockHeight: data.blockHeight ?? existing.blockHeight,
          lastUpdate: Date.now(),
        };

        newMap.set(key, merged);

        // Always increment updateTrigger when we receive new data to force UI refresh
        // This ensures real-time updates are reflected immediately
        const positionsChanged = data.childSubaccounts !== undefined;
        const ordersChanged = data.orders !== undefined && data.orders.length > 0;
        const fillsChanged = data.fills !== undefined && data.fills.length > 0;

        const hasChanges = positionsChanged || ordersChanged || fillsChanged ||
          merged.orders.length !== existing.orders.length ||
          merged.fills.length !== existing.fills.length;

        return {
          parentSubaccounts: newMap,
          updateTrigger: hasChanges ? state.updateTrigger + 1 : state.updateTrigger,
        };
      });
    },

    updateMarket: (ticker: string, data: Partial<MarketData>) => {
      set(state => {
        const newMap = new Map(state.markets);
        const existing = newMap.get(ticker);
        newMap.set(ticker, { ...existing, ...data, lastUpdate: Date.now() } as MarketData);
        return {
          markets: newMap,
          updateTrigger: state.updateTrigger + 1,
        };
      });
    },

    updateTrades: (market: string, data: Partial<TradeData>) => {
      set(state => {
        const newMap = new Map(state.trades);
        const existing = newMap.get(market);
        newMap.set(market, { ...existing, ...data } as TradeData);
        return {
          trades: newMap,
          updateTrigger: state.updateTrigger + 1,
        };
      });
    },

    updateCandles: (key: string, data: Partial<CandleData>) => {
      set(state => {
        const newMap = new Map(state.candles);
        const existing = newMap.get(key);
        newMap.set(key, { ...existing, ...data } as CandleData);
        return {
          candles: newMap,
          updateTrigger: state.updateTrigger + 1,
        };
      });
    },

    // CLEANUP
    cleanup: () => {
      const { subscriptionRefs } = get();

      subscriptionRefs.forEach((unsubscribe, key) => {
        try {
          unsubscribe();
          console.log(`[WSStore] Cleaned up subscription: ${key}`);
        } catch (error) {
          console.error(`[WSStore] Cleanup error for ${key}:`, error);
        }
      });

      set({
        parentSubaccounts: new Map(),
        markets: new Map(),
        trades: new Map(),
        candles: new Map(),
        activeSubscriptions: new Set(),
        subscriptionRefs: new Map(),
        updateTrigger: 0,
      });

      console.log('[WSStore] All subscriptions cleaned up');
    },
  }))
);

// CONNECTION STATUS LISTENERS

webSocketManager.onConnect(() => {
  useWebSocketStore.setState({ isConnected: true });
  console.log('[WSStore] WebSocket connected');
});

webSocketManager.onDisconnect(() => {
  useWebSocketStore.setState({ isConnected: false });
  console.log('[WSStore] WebSocket disconnected');
});
