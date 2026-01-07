// stores/websocketStore.ts
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

import { getSocketClient } from '../client/clients';
import { webSocketManager } from '../utils/WebSocketManager';

// ============================================
// Types
// ============================================

export interface SubaccountData {
  equity: string;
  freeCollateral: string;
  marginUsage: string;
  totalTradingRewards: string;
  openPerpetualPositions: any[];
  orders: any[];
  fills: any[];
  assetPositions: any[];
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

export interface OrderbookData {
  market: string;
  bids: Array<[string, string]>; // [price, size]
  asks: Array<[string, string]>;
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
  }>;
  lastUpdate: number;
}

interface WebSocketState {
  // Connection status
  isConnected: boolean;
  connectionId: string | null;

  // Subaccount data (per address/subaccount)
  subaccounts: Map<string, SubaccountData>;

  // Market data
  markets: Map<string, MarketData>;

  // Trades (per market)
  trades: Map<string, TradeData>;

  // Orderbooks (per market)
  orderbooks: Map<string, OrderbookData>;

  // Candles (per market/resolution)
  candles: Map<string, CandleData>;

  // Subscription tracking (internal use)
  activeSubscriptions: Set<string>;
  subscriptionRefs: Map<string, () => void>;

  // Actions
  subscribeToSubaccount: (address: string, subaccountNumber: number) => void;
  unsubscribeFromSubaccount: (address: string, subaccountNumber: number) => void;

  subscribeToMarket: (ticker: string) => void;
  unsubscribeFromMarket: (ticker: string) => void;

  subscribeToAllMarkets: () => void;
  unsubscribeFromAllMarkets: () => void;

  subscribeToTrades: (market: string) => void;
  unsubscribeFromTrades: (market: string) => void;

  subscribeToOrderbook: (market: string) => void;
  unsubscribeFromOrderbook: (market: string) => void;

  subscribeToCandles: (market: string, resolution: string) => void;
  unsubscribeFromCandles: (market: string, resolution: string) => void;

  // Internal update methods
  updateSubaccount: (key: string, data: Partial<SubaccountData>) => void;
  updateMarket: (ticker: string, data: Partial<MarketData>) => void;
  updateTrades: (market: string, data: Partial<TradeData>) => void;
  updateOrderbook: (market: string, data: Partial<OrderbookData>) => void;
  updateCandles: (key: string, data: Partial<CandleData>) => void;

  // Cleanup
  cleanup: () => void;
}

// ============================================
// Store Creation
// ============================================

export const useWebSocketStore = create<WebSocketState>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    isConnected: false,
    connectionId: null,
    subaccounts: new Map(),
    markets: new Map(),
    trades: new Map(),
    orderbooks: new Map(),
    candles: new Map(),
    activeSubscriptions: new Set(),
    subscriptionRefs: new Map(),

    // ========================================
    // Subaccount Subscription
    // ========================================
    subscribeToSubaccount: (address: string, subaccountNumber: number) => {
      const key = `subaccount_${address}_${subaccountNumber}`;
      const { activeSubscriptions, subscriptionRefs } = get();

      // Already subscribed
      if (activeSubscriptions.has(key)) {
        console.log(`[WSStore] Already subscribed to ${key}`);
        return;
      }

      console.log(`[WSStore] Subscribing to subaccount: ${key}`);

      try {
        const socketClient = getSocketClient();
        const unsubscribe = socketClient.subscribeToSubaccounts(address, subaccountNumber, data => {
          if (data.contents?.subaccount) {
            get().updateSubaccount(key, {
              equity: data.contents.subaccount.equity,
              freeCollateral: data.contents.subaccount.freeCollateral,
              marginUsage: data.contents.subaccount.marginUsage,
              totalTradingRewards: data.contents.subaccount.totalTradingRewards,
              openPerpetualPositions: data.contents.subaccount.openPerpetualPositions || [],
              orders: data.contents.subaccount.orders || [],
              fills: data.contents.subaccount.fills || [],
              assetPositions: data.contents.subaccount.assetPositions || [],
              lastUpdate: Date.now(),
            });
          }
        });

        set(state => ({
          activeSubscriptions: new Set(state.activeSubscriptions).add(key),
          subscriptionRefs: new Map(state.subscriptionRefs).set(key, unsubscribe),
        }));
      } catch (error) {
        console.error(`[WSStore] Failed to subscribe to ${key}:`, error);
      }
    },

    unsubscribeFromSubaccount: (address: string, subaccountNumber: number) => {
      const key = `subaccount_${address}_${subaccountNumber}`;
      const { subscriptionRefs, activeSubscriptions } = get();

      const unsubscribe = subscriptionRefs.get(key);
      if (unsubscribe) {
        console.log(`[WSStore] Unsubscribing from ${key}`);
        unsubscribe();

        const newRefs = new Map(subscriptionRefs);
        newRefs.delete(key);

        const newSubs = new Set(activeSubscriptions);
        newSubs.delete(key);

        set({
          subscriptionRefs: newRefs,
          activeSubscriptions: newSubs,
        });
      }
    },

    // ========================================
    // Market Subscription
    // ========================================
    subscribeToMarket: (ticker: string) => {
      const key = `market_${ticker}`;
      const { activeSubscriptions, subscriptionRefs } = get();

      if (activeSubscriptions.has(key)) {
        console.log(`[WSStore] Already subscribed to ${key}`);
        return;
      }

      console.log(`[WSStore] Subscribing to market: ${ticker}`);

      try {
        const socketClient = getSocketClient();
        const unsubscribe = socketClient.subscribeToMarkets(data => {
          if (data.contents?.markets) {
            Object.entries(data.contents.markets).forEach(([mktTicker, mktData]: [string, any]) => {
              if (mktTicker === ticker) {
                get().updateMarket(ticker, {
                  ticker: mktTicker,
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
          }
        });

        set(state => ({
          activeSubscriptions: new Set(state.activeSubscriptions).add(key),
          subscriptionRefs: new Map(state.subscriptionRefs).set(key, unsubscribe),
        }));
      } catch (error) {
        console.error(`[WSStore] Failed to subscribe to ${key}:`, error);
      }
    },

    unsubscribeFromMarket: (ticker: string) => {
      const key = `market_${ticker}`;
      const { subscriptionRefs, activeSubscriptions } = get();

      const unsubscribe = subscriptionRefs.get(key);
      if (unsubscribe) {
        console.log(`[WSStore] Unsubscribing from ${key}`);
        unsubscribe();

        const newRefs = new Map(subscriptionRefs);
        newRefs.delete(key);

        const newSubs = new Set(activeSubscriptions);
        newSubs.delete(key);

        set({
          subscriptionRefs: newRefs,
          activeSubscriptions: newSubs,
        });
      }
    },

    // ========================================
    // All Markets Subscription (Single handler)
    // ========================================
    subscribeToAllMarkets: () => {
      const key = 'markets_all';
      const { activeSubscriptions, subscriptionRefs } = get();

      if (activeSubscriptions.has(key)) {
        console.log(`[WSStore] Already subscribed to all markets`);
        return;
      }

      console.log(`[WSStore] Subscribing to all markets (single handler)`);

      try {
        const socketClient = getSocketClient();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const unsubscribe = socketClient.subscribeToMarkets((data: any) => {
          if (data.contents?.markets) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      } catch (error) {
        console.error(`[WSStore] Failed to subscribe to all markets:`, error);
      }
    },

    unsubscribeFromAllMarkets: () => {
      const key = 'markets_all';
      const { subscriptionRefs, activeSubscriptions } = get();

      const unsubscribe = subscriptionRefs.get(key);
      if (unsubscribe) {
        console.log(`[WSStore] Unsubscribing from all markets`);
        unsubscribe();

        const newRefs = new Map(subscriptionRefs);
        newRefs.delete(key);

        const newSubs = new Set(activeSubscriptions);
        newSubs.delete(key);

        set({
          subscriptionRefs: newRefs,
          activeSubscriptions: newSubs,
        });
      }
    },

    // ========================================
    // Trades Subscription
    // ========================================
    subscribeToTrades: (market: string) => {
      const key = `trades_${market}`;
      const { activeSubscriptions, subscriptionRefs } = get();

      if (activeSubscriptions.has(key)) {
        console.log(`[WSStore] Already subscribed to ${key}`);
        return;
      }

      console.log(`[WSStore] Subscribing to trades: ${market}`);

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
      } catch (error) {
        console.error(`[WSStore] Failed to subscribe to ${key}:`, error);
      }
    },

    unsubscribeFromTrades: (market: string) => {
      const key = `trades_${market}`;
      const { subscriptionRefs, activeSubscriptions } = get();

      const unsubscribe = subscriptionRefs.get(key);
      if (unsubscribe) {
        console.log(`[WSStore] Unsubscribing from ${key}`);
        unsubscribe();

        const newRefs = new Map(subscriptionRefs);
        newRefs.delete(key);

        const newSubs = new Set(activeSubscriptions);
        newSubs.delete(key);

        set({
          subscriptionRefs: newRefs,
          activeSubscriptions: newSubs,
        });
      }
    },

    // ========================================
    // Orderbook Subscription
    // ========================================
    subscribeToOrderbook: (market: string) => {
      const key = `orderbook_${market}`;
      const { activeSubscriptions, subscriptionRefs } = get();

      if (activeSubscriptions.has(key)) {
        console.log(`[WSStore] Already subscribed to ${key}`);
        return;
      }

      console.log(`[WSStore] Subscribing to orderbook: ${market}`);

      try {
        const socketClient = getSocketClient();
        const unsubscribe = socketClient.subscribeToOrderbook(market, data => {
          if (data.contents) {
            get().updateOrderbook(market, {
              market,
              bids: data.contents.bids || [],
              asks: data.contents.asks || [],
              lastUpdate: Date.now(),
            });
          }
        });

        set(state => ({
          activeSubscriptions: new Set(state.activeSubscriptions).add(key),
          subscriptionRefs: new Map(state.subscriptionRefs).set(key, unsubscribe),
        }));
      } catch (error) {
        console.error(`[WSStore] Failed to subscribe to ${key}:`, error);
      }
    },

    unsubscribeFromOrderbook: (market: string) => {
      const key = `orderbook_${market}`;
      const { subscriptionRefs, activeSubscriptions } = get();

      const unsubscribe = subscriptionRefs.get(key);
      if (unsubscribe) {
        console.log(`[WSStore] Unsubscribing from ${key}`);
        unsubscribe();

        const newRefs = new Map(subscriptionRefs);
        newRefs.delete(key);

        const newSubs = new Set(activeSubscriptions);
        newSubs.delete(key);

        set({
          subscriptionRefs: newRefs,
          activeSubscriptions: newSubs,
        });
      }
    },

    // ========================================
    // Candles Subscription
    // ========================================
    subscribeToCandles: (market: string, resolution: string) => {
      const key = `candles_${market}_${resolution}`;
      const { activeSubscriptions, subscriptionRefs } = get();

      if (activeSubscriptions.has(key)) {
        console.log(`[WSStore] Already subscribed to ${key}`);
        return;
      }

      console.log(`[WSStore] Subscribing to candles: ${market}/${resolution}`);

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
      } catch (error) {
        console.error(`[WSStore] Failed to subscribe to ${key}:`, error);
      }
    },

    unsubscribeFromCandles: (market: string, resolution: string) => {
      const key = `candles_${market}_${resolution}`;
      const { subscriptionRefs, activeSubscriptions } = get();

      const unsubscribe = subscriptionRefs.get(key);
      if (unsubscribe) {
        console.log(`[WSStore] Unsubscribing from ${key}`);
        unsubscribe();

        const newRefs = new Map(subscriptionRefs);
        newRefs.delete(key);

        const newSubs = new Set(activeSubscriptions);
        newSubs.delete(key);

        set({
          subscriptionRefs: newRefs,
          activeSubscriptions: newSubs,
        });
      }
    },

    // ========================================
    // Update Methods
    // ========================================
    updateSubaccount: (key: string, data: Partial<SubaccountData>) => {
      set(state => {
        const newMap = new Map(state.subaccounts);
        const existing = newMap.get(key);

        // Create base merged data
        const mergedData: SubaccountData = {
          equity: data.equity ?? existing?.equity ?? '0',
          freeCollateral: data.freeCollateral ?? existing?.freeCollateral ?? '0',
          marginUsage: data.marginUsage ?? existing?.marginUsage ?? '0',
          totalTradingRewards: data.totalTradingRewards ?? existing?.totalTradingRewards ?? '0',
          openPerpetualPositions: existing?.openPerpetualPositions ?? [],
          orders: existing?.orders ?? [],
          fills: existing?.fills ?? [],
          assetPositions: existing?.assetPositions ?? [],
          lastUpdate: Date.now(),
        };

        // Merge orders by ID and sort by date (newest first)
        if (data.orders && data.orders.length > 0) {
          const ordersMap = new Map<string, any>();
          // Add existing orders first
          (existing?.orders || []).forEach(o => ordersMap.set(o.id, o));
          // Add/update with new orders
          data.orders.forEach(o => ordersMap.set(o.id, o));
          // Sort by updatedAt or createdAtHeight (newest first)
          mergedData.orders = Array.from(ordersMap.values()).sort((a, b) => {
            const timeA = new Date(a.updatedAt || a.createdAtHeight || 0).getTime();
            const timeB = new Date(b.updatedAt || b.createdAtHeight || 0).getTime();
            return timeB - timeA;
          });
        }

        // Merge fills by ID and sort by date (newest first)
        if (data.fills && data.fills.length > 0) {
          const fillsMap = new Map<string, any>();
          // Add existing fills first
          (existing?.fills || []).forEach(f => fillsMap.set(f.id, f));
          // Add/update with new fills
          data.fills.forEach(f => fillsMap.set(f.id, f));
          // Sort by createdAt (newest first)
          mergedData.fills = Array.from(fillsMap.values()).sort((a, b) => {
            const timeA = new Date(a.createdAt || 0).getTime();
            const timeB = new Date(b.createdAt || 0).getTime();
            return timeB - timeA;
          });
        }

        // Update positions (Replace strategy since it's a snapshot of open positions)
        if (data.openPerpetualPositions) {
          mergedData.openPerpetualPositions = data.openPerpetualPositions;
        }

        // Update asset positions (Replace strategy)
        if (data.assetPositions) {
          mergedData.assetPositions = data.assetPositions;
        }

        newMap.set(key, mergedData);
        return { subaccounts: newMap };
      });
    },

    updateMarket: (ticker: string, data: Partial<MarketData>) => {
      set(state => {
        const newMap = new Map(state.markets);
        const existing = newMap.get(ticker);
        newMap.set(ticker, { ...existing, ...data } as MarketData);
        return { markets: newMap };
      });
    },

    updateTrades: (market: string, data: Partial<TradeData>) => {
      set(state => {
        const newMap = new Map(state.trades);
        const existing = newMap.get(market);
        newMap.set(market, { ...existing, ...data } as TradeData);
        return { trades: newMap };
      });
    },

    updateOrderbook: (market: string, data: Partial<OrderbookData>) => {
      set(state => {
        const newMap = new Map(state.orderbooks);
        const existing = newMap.get(market);
        newMap.set(market, { ...existing, ...data } as OrderbookData);
        return { orderbooks: newMap };
      });
    },

    updateCandles: (key: string, data: Partial<CandleData>) => {
      set(state => {
        const newMap = new Map(state.candles);
        const existing = newMap.get(key);
        newMap.set(key, { ...existing, ...data } as CandleData);
        return { candles: newMap };
      });
    },

    // ========================================
    // Cleanup
    // ========================================
    cleanup: () => {
      const { subscriptionRefs } = get();

      console.log(`[WSStore] Cleaning up ${subscriptionRefs.size} subscriptions`);

      subscriptionRefs.forEach(unsubscribe => {
        try {
          unsubscribe();
        } catch (error) {
          console.error('[WSStore] Cleanup error:', error);
        }
      });

      set({
        subaccounts: new Map(),
        markets: new Map(),
        trades: new Map(),
        orderbooks: new Map(),
        candles: new Map(),
        activeSubscriptions: new Set(),
        subscriptionRefs: new Map(),
      });
    },
  }))
);

// ============================================
// Connection Status Listener
// ============================================

// Listen to WebSocket connection status
webSocketManager.onConnect(() => {
  useWebSocketStore.setState({ isConnected: true });
  console.log('[WSStore] WebSocket connected');
});

webSocketManager.onDisconnect(() => {
  useWebSocketStore.setState({ isConnected: false });
  console.log('[WSStore] WebSocket disconnected');
});
