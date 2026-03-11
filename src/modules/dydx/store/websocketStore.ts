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
  leverage?: string;
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
  subscriptionCounts: Map<string, number>;
  unsubTimers: Map<string, NodeJS.Timeout>;

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

const handleSubscribe = (key: string, set: any, subscribeFn: () => (() => void) | void) => {
  set((state: WebSocketState) => {
    const { activeSubscriptions, subscriptionCounts, unsubTimers, subscriptionRefs } = state;
    const count = subscriptionCounts.get(key) || 0;
    const newCounts = new Map(subscriptionCounts).set(key, count + 1);

    const timer = unsubTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      const newTimers = new Map(unsubTimers);
      newTimers.delete(key);
      return { subscriptionCounts: newCounts, unsubTimers: newTimers };
    }

    if (activeSubscriptions.has(key)) {
      return { subscriptionCounts: newCounts };
    }

    try {
      const unsubscribe = subscribeFn();
      if (unsubscribe) {
        return {
          activeSubscriptions: new Set(activeSubscriptions).add(key),
          subscriptionRefs: new Map(subscriptionRefs).set(key, unsubscribe),
          subscriptionCounts: newCounts,
        };
      }
      return { subscriptionCounts: newCounts };
    } catch (error) {
      console.error(`[WSStore] Failed to subscribe to ${key}:`, error);
      return { subscriptionCounts: newCounts };
    }
  });
};

const handleUnsubscribe = (key: string, set: any) => {
  set((state: WebSocketState) => {
    const { subscriptionCounts, unsubTimers } = state;
    const count = subscriptionCounts.get(key) || 0;

    if (count > 1) {
      return { subscriptionCounts: new Map(subscriptionCounts).set(key, count - 1) };
    }

    const newCounts = new Map(subscriptionCounts);
    newCounts.delete(key);

    const timer = setTimeout(() => {
      set((innerState: WebSocketState) => {
        if (innerState.subscriptionCounts.has(key)) return innerState;

        const innerRefs = new Map(innerState.subscriptionRefs);
        const innerSubs = new Set(innerState.activeSubscriptions);
        const innerTimers = new Map(innerState.unsubTimers);

        const unsubscribe = innerRefs.get(key);
        if (typeof unsubscribe === 'function') {
          unsubscribe();
        }
        innerRefs.delete(key);
        innerSubs.delete(key);
        innerTimers.delete(key);

        return {
          subscriptionRefs: innerRefs,
          activeSubscriptions: innerSubs,
          unsubTimers: innerTimers,
        };
      });
    }, 5000);

    return {
      subscriptionCounts: newCounts,
      unsubTimers: new Map(unsubTimers).set(key, timer),
    };
  });
};

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
    subscriptionCounts: new Map(),
    unsubTimers: new Map(),

    subscribeToParentSubaccount: (address: string, subaccountNumber: number) => {
      const key = `parent_subaccount_${address}_${subaccountNumber}`;
      handleSubscribe(key, set, () => {
        const socketClient = getSocketClient();
        return socketClient.subscribeToParentSubaccounts(
          address,
          subaccountNumber,
          (data: any) => {
            if (!data?.contents) return;

            const messageType = data.type;
            const contents = data.contents;
            const updates: Partial<ParentSubaccountData> = {
              lastUpdate: Date.now(),
            };

            if (messageType === 'subscribed' && contents.subaccount) {
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
              return;
            }

            if (messageType === 'channel_batch_data' || messageType === 'channel_data') {
              const batchContents = Array.isArray(contents) ? contents : [contents];
              const batchSubaccountNumber = data.subaccountNumber ?? 0;

              const currentData = get().parentSubaccounts.get(key);
              if (!currentData) return;

              let updatedChildSubaccounts = currentData.childSubaccounts.map(child => ({
                ...child,
                openPerpetualPositions: { ...child.openPerpetualPositions },
                assetPositions: { ...child.assetPositions },
              }));

              const newOrders: any[] = [];
              const newFills: any[] = [];

              batchContents.forEach((batch: any) => {
                if (batch.perpetualPositions && Array.isArray(batch.perpetualPositions)) {
                  batch.perpetualPositions.forEach((pos: any) => {
                    const subNum = pos.subaccountNumber ?? batchSubaccountNumber;
                    let childIndex = updatedChildSubaccounts.findIndex(c => c.subaccountNumber === subNum);

                    if (childIndex === -1) {
                      updatedChildSubaccounts.push({
                        address: pos.address || currentData.address,
                        subaccountNumber: subNum,
                        equity: '0',
                        freeCollateral: '0',
                        openPerpetualPositions: {},
                        assetPositions: {},
                        marginEnabled: true,
                        updatedAtHeight: batch.blockHeight || '0',
                        latestProcessedBlockHeight: batch.blockHeight || '0',
                      });
                      childIndex = updatedChildSubaccounts.length - 1;
                    }

                    const child = updatedChildSubaccounts[childIndex];

                    if (pos.status === 'CLOSED' || parseFloat(pos.size || '0') === 0) {
                      delete child.openPerpetualPositions[pos.market];
                    } else {
                      child.openPerpetualPositions[pos.market] = { ...pos, subaccountNumber: subNum };
                    }

                    child.updatedAtHeight = batch.blockHeight || child.updatedAtHeight;
                    child.latestProcessedBlockHeight = batch.blockHeight || child.latestProcessedBlockHeight;
                  });
                }
                if (batch.assetPositions && Array.isArray(batch.assetPositions)) {
                  batch.assetPositions.forEach((asset: any) => {
                    const subNum = asset.subaccountNumber ?? batchSubaccountNumber;
                    let childIndex = updatedChildSubaccounts.findIndex(c => c.subaccountNumber === subNum);

                    if (childIndex === -1) {
                      updatedChildSubaccounts.push({
                        address: asset.address || currentData.address,
                        subaccountNumber: subNum,
                        equity: '0',
                        freeCollateral: '0',
                        openPerpetualPositions: {},
                        assetPositions: {},
                        marginEnabled: true,
                        updatedAtHeight: batch.blockHeight || '0',
                        latestProcessedBlockHeight: batch.blockHeight || '0',
                      });
                      childIndex = updatedChildSubaccounts.length - 1;
                    }

                    const child = updatedChildSubaccounts[childIndex];
                    child.assetPositions[asset.symbol] = { ...asset, subaccountNumber: subNum };
                  });
                }

                if (batch.orders && Array.isArray(batch.orders)) {
                  newOrders.push(...batch.orders);
                }

                if (batch.fills && Array.isArray(batch.fills)) {
                  newFills.push(...batch.fills);
                }

                if (batch.blockHeight) {
                  updates.blockHeight = batch.blockHeight;
                }
              });

              updates.childSubaccounts = updatedChildSubaccounts;

              if (newOrders.length > 0) {
                updates.orders = newOrders;
              }

              if (newFills.length > 0) {
                updates.fills = newFills;
              }

              get().updateParentSubaccount(key, updates);
              return;
            }


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
      });
    },

    unsubscribeFromParentSubaccount: (address: string, subaccountNumber: number) => {
      handleUnsubscribe(`parent_subaccount_${address}_${subaccountNumber}`, set);
    },

    subscribeToMarket: (ticker: string) => {
      const key = `market_${ticker}`;
      handleSubscribe(key, set, () => {
        const socketClient = getSocketClient();
        return socketClient.subscribeToMarkets(data => {
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
      });
    },

    unsubscribeFromMarket: (ticker: string) => {
      handleUnsubscribe(`market_${ticker}`, set);
    },

    subscribeToAllMarkets: () => {
      const key = 'markets_all';
      handleSubscribe(key, set, () => {
        const socketClient = getSocketClient();
        return socketClient.subscribeToMarkets((data: any) => {
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
      });
    },

    unsubscribeFromAllMarkets: () => {
      handleUnsubscribe('markets_all', set);
    },

    subscribeToTrades: (market: string) => {
      const key = `trades_${market}`;
      handleSubscribe(key, set, () => {
        const socketClient = getSocketClient();
        return socketClient.subscribeToTrades(market, data => {
          if (data.contents?.trades) {
            get().updateTrades(market, {
              market,
              trades: data.contents.trades,
              lastUpdate: Date.now(),
            });
          }
        });
      });
    },

    unsubscribeFromTrades: (market: string) => {
      handleUnsubscribe(`trades_${market}`, set);
    },

    subscribeToCandles: (market: string, resolution: string) => {
      const key = `candles_${market}_${resolution}`;
      handleSubscribe(key, set, () => {
        const socketClient = getSocketClient();
        return socketClient.subscribeToCandles(market, resolution, data => {
          if (data.contents?.candles) {
            get().updateCandles(key, {
              market,
              resolution,
              candles: data.contents.candles,
              lastUpdate: Date.now(),
            });
          }
        });
      });
    },

    unsubscribeFromCandles: (market: string, resolution: string) => {
      handleUnsubscribe(`candles_${market}_${resolution}`, set);
    },

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

        let mergedOrders = existing.orders;
        if (data.orders !== undefined) {
          const orderMap = new Map<string, any>();
          existing.orders.forEach(order => orderMap.set(order.id, order));
          data.orders.forEach(order => {
            const existingOrder = orderMap.get(order.id);
            if (
              !existingOrder ||
              (order.updatedAt &&
                (!existingOrder.updatedAt || new Date(order.updatedAt).getTime() >= new Date(existingOrder.updatedAt).getTime()))
            ) {
              orderMap.set(order.id, order);
            }
          });
          mergedOrders = Array.from(orderMap.values())
            .sort((a, b) => {
              const tA = new Date(a.updatedAt || a.createdAtHeight || '0').getTime();
              const tB = new Date(b.updatedAt || b.createdAtHeight || '0').getTime();
              return tB - tA;
            })
            .slice(0, 150);
        }

        let mergedFills = existing.fills;
        if (data.fills !== undefined) {
          const fillMap = new Map<string, any>();
          existing.fills.forEach(fill => fillMap.set(fill.id, fill));
          data.fills.forEach(fill => {
            const existingFill = fillMap.get(fill.id);
            if (
              !existingFill ||
              (fill.createdAt &&
                (!existingFill.createdAt || new Date(fill.createdAt).getTime() >= new Date(existingFill.createdAt).getTime()))
            ) {
              fillMap.set(fill.id, fill);
            }
          });
          mergedFills = Array.from(fillMap.values())
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .slice(0, 150);
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

        const hasChildSubaccountChanges = data.childSubaccounts !== undefined;
        const hasOrderChanges = data.orders !== undefined && data.orders.length > 0;
        const hasFillChanges = data.fills !== undefined && data.fills.length > 0;
        const hasEquityChange = data.equity !== existing.equity || data.freeCollateral !== existing.freeCollateral;

        const hasChanges = hasChildSubaccountChanges || hasOrderChanges || hasFillChanges || hasEquityChange ||
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
        };
      });
    },

    cleanup: () => {
      const { subscriptionRefs, unsubTimers } = get();

      subscriptionRefs.forEach((unsubscribe, key) => {
        try {
          unsubscribe();
        } catch (error) {
          console.error(`[WSStore] Cleanup error for ${key}:`, error);
        }
      });

      unsubTimers.forEach(timer => clearTimeout(timer));

      set({
        parentSubaccounts: new Map(),
        markets: new Map(),
        trades: new Map(),
        candles: new Map(),
        activeSubscriptions: new Set(),
        subscriptionRefs: new Map(),
        subscriptionCounts: new Map(),
        unsubTimers: new Map(),
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
