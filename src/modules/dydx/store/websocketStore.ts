import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

import { getSocketClient } from '../client/clients';
import { webSocketManager } from '../utils/WebSocketManager';

export interface SubaccountData {
  equity: string;
  freeCollateral: string;
  openPerpetualPositions: Record<string, any>;
  assetPositions: Record<string, any>;
  orders: any[];
  fills: any[];
  marginEnabled: boolean;
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
  }>;
  lastUpdate: number;
}

interface WebSocketState {
  isConnected: boolean;
  connectionId: string | null;
  updateTrigger: number;

  subaccounts: Map<string, SubaccountData>;
  markets: Map<string, MarketData>;
  trades: Map<string, TradeData>;
  candles: Map<string, CandleData>;

  activeSubscriptions: Set<string>;
  subscriptionRefs: Map<string, () => void>;

  subscribeToSubaccount: (address: string, subaccountNumber: number) => void;
  unsubscribeFromSubaccount: (address: string, subaccountNumber: number) => void;

  subscribeToMarket: (ticker: string) => void;
  unsubscribeFromMarket: (ticker: string) => void;

  subscribeToAllMarkets: () => void;
  unsubscribeFromAllMarkets: () => void;

  subscribeToTrades: (market: string) => void;
  unsubscribeFromTrades: (market: string) => void;

  subscribeToCandles: (market: string, resolution: string) => void;
  unsubscribeFromCandles: (market: string, resolution: string) => void;

  updateSubaccount: (key: string, data: Partial<SubaccountData>) => void;
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
    subaccounts: new Map(),
    markets: new Map(),
    trades: new Map(),
    candles: new Map(),
    activeSubscriptions: new Set(),
    subscriptionRefs: new Map(),

    subscribeToSubaccount: (address: string, subaccountNumber: number) => {
      const key = `subaccount_${address}_${subaccountNumber}`;
      const { activeSubscriptions } = get();

      if (activeSubscriptions.has(key)) {
        return;
      }

      try {
        const socketClient = getSocketClient();

        const unsubscribe = socketClient.subscribeToSubaccounts(
          address,
          subaccountNumber,
          (data: any) => {
            if (!data?.contents) {
              return;
            }

            const contents = data.contents;
            const updates: Partial<SubaccountData> = { lastUpdate: Date.now() };

            if (contents.subaccount) {
              const subaccountData = contents.subaccount;
              updates.equity = subaccountData.equity || '0';
              updates.freeCollateral = subaccountData.freeCollateral || '0';
              updates.openPerpetualPositions = subaccountData.openPerpetualPositions || {};
              updates.assetPositions = subaccountData.assetPositions || {};
              updates.orders = subaccountData.orders || [];
              updates.fills = subaccountData.fills || [];
              updates.marginEnabled = subaccountData.marginEnabled ?? true;
            }

            if (contents.orders && Array.isArray(contents.orders)) {
              const currentData = get().subaccounts.get(key);
              const existingOrders = currentData?.orders || [];
              const updatedOrders = [...existingOrders];

              contents.orders.forEach((orderUpdate: any) => {
                const index = updatedOrders.findIndex((o: any) => o.id === orderUpdate.id);
                if (index !== -1) {
                  updatedOrders[index] = { ...updatedOrders[index], ...orderUpdate };
                } else {
                  updatedOrders.push(orderUpdate);
                }
              });

              updates.orders = updatedOrders.filter(
                (o: any) =>
                  o.status === 'OPEN' || o.status === 'PENDING' || o.status === 'UNTRIGGERED'
              );
            }

            if (contents.fills && Array.isArray(contents.fills)) {
              const currentData = get().subaccounts.get(key);
              const existingFills = currentData?.fills || [];

              const fillsMap = new Map(existingFills.map((f: any) => [f.id, f]));
              contents.fills.forEach((fill: any) => {
                fillsMap.set(fill.id, fill);
              });

              updates.fills = Array.from(fillsMap.values())
                .sort(
                  (a: any, b: any) =>
                    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                )
                .slice(0, 100);
            }

            if (contents.perpetualPositions) {
              updates.openPerpetualPositions = contents.perpetualPositions;
            }

            if (contents.assetPositions) {
              updates.assetPositions = contents.assetPositions;
            }

            get().updateSubaccount(key, updates);
          }
        );

        set(state => ({
          activeSubscriptions: new Set(state.activeSubscriptions).add(key),
          subscriptionRefs: new Map(state.subscriptionRefs).set(key, unsubscribe),
        }));
      } catch (error) {
        console.error(`[WSStore] Failed to subscribe to subaccount ${key}:`, error);
      }
    },

    unsubscribeFromSubaccount: (address: string, subaccountNumber: number) => {
      const key = `subaccount_${address}_${subaccountNumber}`;
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
      }
    },

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
      }
    },

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
      }
    },

    updateSubaccount: (key: string, data: Partial<SubaccountData>) => {
      set(state => {
        const newMap = new Map(state.subaccounts);
        const existing = newMap.get(key) || {
          equity: '0',
          freeCollateral: '0',
          openPerpetualPositions: {},
          assetPositions: {},
          orders: [],
          fills: [],
          marginEnabled: true,
          lastUpdate: 0,
        };

        const merged: SubaccountData = {
          equity: data.equity ?? existing.equity,
          freeCollateral: data.freeCollateral ?? existing.freeCollateral,
          openPerpetualPositions: data.openPerpetualPositions ?? existing.openPerpetualPositions,
          assetPositions: data.assetPositions ?? existing.assetPositions,
          marginEnabled: data.marginEnabled ?? existing.marginEnabled,
          orders: data.orders ?? existing.orders,
          fills: data.fills ?? existing.fills,
          lastUpdate: Date.now(),
        };

        newMap.set(key, merged);
        return {
          subaccounts: newMap,
          updateTrigger: state.updateTrigger + 1,
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

    cleanup: () => {
      const { subscriptionRefs } = get();

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
        candles: new Map(),
        activeSubscriptions: new Set(),
        subscriptionRefs: new Map(),
        updateTrigger: 0,
      });
    },
  }))
);

webSocketManager.onConnect(() => {
  useWebSocketStore.setState({ isConnected: true });
});

webSocketManager.onDisconnect(() => {
  useWebSocketStore.setState({ isConnected: false });
});
