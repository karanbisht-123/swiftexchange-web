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
  orders: TrackedOrder[];
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

export interface PositionPnl {
  unrealizedPnl: string;
  realizedPnl: string;
  netFunding: string;
}

export interface TrackedOrder {
  id: string;
  subaccountId?: string;
  clientId?: string;
  clobPairId?: string;
  side: 'BUY' | 'SELL';
  size: string;
  price: string;
  type: string;
  status: string;
  timeInForce?: string;
  postOnly?: boolean;
  reduceOnly?: boolean;
  orderFlags?: string;
  goodTilBlock?: string;
  goodTilBlockTime?: string;
  ticker?: string;
  removalReason?: string;
  clientMetadata?: string;
  updatedAt?: string;
  createdAtHeight?: string;
  totalOptimisticFilled?: string;
  _msgId: number;
  _terminalAt?: number;
}

export type RawOrder = Omit<TrackedOrder, '_msgId' | '_terminalAt'> & {
  _msgId?: number;
  _terminalAt?: number;
};

export type PartialSubaccountUpdate = Omit<Partial<ParentSubaccountData>, 'orders'> & {
  orders?: RawOrder[];
};

const TERMINAL_STATUSES = new Set(['FILLED', 'CANCELED', 'BEST_EFFORT_CANCELED', 'REJECTED']);

const OPEN_STATUSES = new Set(['OPEN', 'BEST_EFFORT_OPENED', 'UNTRIGGERED', 'PARTIALLY_FILLED']);

const TERMINAL_GRACE_MS = 6_000;

const MAX_ORDERS = 150;
const MAX_FILLS = 150;
const UNSUB_DELAY_MS = 5_000;

interface WebSocketState {
  isConnected: boolean;
  connectionId: string | null;
  updateTrigger: number;

  parentSubaccounts: Map<string, ParentSubaccountData>;
  markets: Map<string, MarketData>;
  trades: Map<string, TradeData>;
  candles: Map<string, CandleData>;
  positionPnl: Map<string, PositionPnl>;

  activeSubscriptions: Set<string>;
  subscriptionRefs: Map<string, () => void>;
  subscriptionCounts: Map<string, number>;
  unsubTimers: Map<string, ReturnType<typeof setTimeout>>;

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

  updateParentSubaccount: (key: string, data: PartialSubaccountUpdate, msgId?: number) => void;
  updateMarket: (ticker: string, data: Partial<MarketData>) => void;
  updateMarkets: (updates: Record<string, Partial<MarketData>>) => void;
  updateTrades: (market: string, data: Partial<TradeData>) => void;
  updateCandles: (key: string, data: Partial<CandleData>) => void;
  cleanup: () => void;
}

const handleSubscribe = (
  key: string,
  set: (fn: (s: WebSocketState) => Partial<WebSocketState>) => void,
  subscribeFn: () => (() => void) | void
) => {
  set((state) => {
    const { activeSubscriptions, subscriptionCounts, unsubTimers, subscriptionRefs } = state;
    const count = subscriptionCounts.get(key) ?? 0;
    const newCounts = new Map(subscriptionCounts).set(key, count + 1);

    const timer = unsubTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      const newTimers = new Map(unsubTimers);
      newTimers.delete(key);
      return { subscriptionCounts: newCounts, unsubTimers: newTimers };
    }

    if (activeSubscriptions.has(key)) return { subscriptionCounts: newCounts };

    try {
      const unsubscribe = subscribeFn();
      if (typeof unsubscribe === 'function') {
        return {
          activeSubscriptions: new Set(activeSubscriptions).add(key),
          subscriptionRefs: new Map(subscriptionRefs).set(key, unsubscribe),
          subscriptionCounts: newCounts,
        };
      }
    } catch (error) {
      console.error(`[WSStore] Failed to subscribe to ${key}:`, error);
    }

    return { subscriptionCounts: newCounts };
  });
};

const handleUnsubscribe = (
  key: string,
  set: (fn: (s: WebSocketState) => Partial<WebSocketState>) => void
) => {
  set((state) => {
    const { subscriptionCounts, unsubTimers } = state;
    const count = subscriptionCounts.get(key) ?? 0;

    if (count > 1) {
      return { subscriptionCounts: new Map(subscriptionCounts).set(key, count - 1) };
    }

    const newCounts = new Map(subscriptionCounts);
    newCounts.delete(key);

    const timer = setTimeout(() => {
      set((inner) => {
        if (inner.subscriptionCounts.has(key)) return {};

        const refs = new Map(inner.subscriptionRefs);
        const subs = new Set(inner.activeSubscriptions);
        const timers = new Map(inner.unsubTimers);

        const unsubscribe = refs.get(key);
        if (typeof unsubscribe === 'function') {
          try { unsubscribe(); } catch (err) {
            console.error(`[WSStore] Error unsubscribing from ${key}:`, err);
          }
        }

        refs.delete(key);
        subs.delete(key);
        timers.delete(key);

        return { subscriptionRefs: refs, activeSubscriptions: subs, unsubTimers: timers };
      });
    }, UNSUB_DELAY_MS);

    return {
      subscriptionCounts: newCounts,
      unsubTimers: new Map(unsubTimers).set(key, timer),
    };
  });
};

function mergeOrders(
  existing: Map<string, TrackedOrder>,
  incoming: any[],
  msgId: number,
  now: number
): Map<string, TrackedOrder> {
  const next = new Map(existing);

  for (const raw of incoming) {
    const id: string = raw.id;
    if (!id) continue;

    const prev = next.get(id);
    if (prev && prev._msgId > msgId) continue;

    const isTerminal = TERMINAL_STATUSES.has(raw.status);

    next.set(id, {
      ...prev,
      ...raw,
      _msgId: msgId,
      _terminalAt: isTerminal
        ? (prev && TERMINAL_STATUSES.has(prev.status) ? prev._terminalAt : now)
        : undefined,
    } as TrackedOrder);
  }

  return next;
}

function evictOrders(
  orderMap: Map<string, TrackedOrder>,
  currentBlock: number,
  now: number
): TrackedOrder[] {
  const kept: TrackedOrder[] = [];

  for (const order of orderMap.values()) {
    if (TERMINAL_STATUSES.has(order.status)) {
      if (now - (order._terminalAt ?? now) < TERMINAL_GRACE_MS) kept.push(order);
      continue;
    }

    if (currentBlock > 0 && order.goodTilBlock && parseInt(order.goodTilBlock, 10) < currentBlock) {
      continue;
    }

    kept.push(order);
  }

  return kept
    .sort((a, b) => {
      const tA = a.updatedAt ? new Date(a.updatedAt).getTime() : parseInt(a.createdAtHeight ?? '0', 10);
      const tB = b.updatedAt ? new Date(b.updatedAt).getTime() : parseInt(b.createdAtHeight ?? '0', 10);
      return tB - tA;
    })
    .slice(0, MAX_ORDERS);
}

function mergeFills(existing: any[], incoming: any[]): any[] {
  const fillMap = new Map<string, any>(existing.map(f => [f.id, f]));

  for (const fill of incoming) {
    const ex = fillMap.get(fill.id);
    if (!ex || (fill.createdAt && new Date(fill.createdAt) >= new Date(ex.createdAt))) {
      fillMap.set(fill.id, fill);
    }
  }

  return Array.from(fillMap.values())
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, MAX_FILLS);
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
    positionPnl: new Map(),
    activeSubscriptions: new Set(),
    subscriptionRefs: new Map(),
    subscriptionCounts: new Map(),
    unsubTimers: new Map(),

    subscribeToParentSubaccount: (address, subaccountNumber) => {
      const key = `parent_subaccount_${address}_${subaccountNumber}`;

      handleSubscribe(key, set, () => {
        const socketClient = getSocketClient();

        return socketClient.subscribeToParentSubaccounts(address, subaccountNumber, (data: any) => {
          if (!data?.contents) return;

          const msgId: number = data.message_id ?? 0;
          const messageType: string = data.type;
          const contents = data.contents;
          const updates: Partial<ParentSubaccountData> = { lastUpdate: Date.now() };

          if (messageType === 'subscribed' && contents.subaccount) {
            const sub = contents.subaccount;

            updates.address = sub.address;
            updates.parentSubaccountNumber = sub.parentSubaccountNumber;
            updates.equity = sub.equity ?? '0';
            updates.freeCollateral = sub.freeCollateral ?? '0';

            if (Array.isArray(sub.childSubaccounts)) {
              updates.childSubaccounts = sub.childSubaccounts.map((child: any) => ({
                address: child.address,
                subaccountNumber: child.subaccountNumber,
                equity: child.equity ?? '0',
                freeCollateral: child.freeCollateral ?? '0',
                openPerpetualPositions: child.openPerpetualPositions ?? {},
                assetPositions: child.assetPositions ?? {},
                marginEnabled: child.marginEnabled ?? true,
                updatedAtHeight: child.updatedAtHeight ?? '0',
                latestProcessedBlockHeight: child.latestProcessedBlockHeight ?? '0',
              }));

              const initialPnl = new Map(get().positionPnl);
              sub.childSubaccounts.forEach((child: any) => {
                Object.values(child.openPerpetualPositions ?? {}).forEach((pos: any) => {
                  if (pos.market) {
                    initialPnl.set(pos.market, {
                      unrealizedPnl: pos.unrealizedPnl ?? '0',
                      realizedPnl: pos.realizedPnl ?? '0',
                      netFunding: pos.netFunding ?? '0',
                    });
                  }
                });
              });
              set({ positionPnl: initialPnl });
            }

            if (contents.orders !== undefined) {
              updates.orders = (Array.isArray(contents.orders) ? contents.orders : []).map(
                (o: any) => ({ ...o, _msgId: 0 })
              );
            }
            if (contents.fills !== undefined) updates.fills = Array.isArray(contents.fills) ? contents.fills : [];
            if (contents.transfers !== undefined) updates.transfers = Array.isArray(contents.transfers) ? contents.transfers : [];
            if (contents.blockHeight) updates.blockHeight = contents.blockHeight;

            get().updateParentSubaccount(key, updates, msgId);
            return;
          }

          if (messageType === 'channel_batch_data' || messageType === 'channel_data') {
            const batches: any[] = Array.isArray(contents) ? contents : [contents];
            const batchSubNum: number = data.subaccountNumber ?? 0;
            const currentData = get().parentSubaccounts.get(key);
            if (!currentData) return;

            let updatedChildren = currentData.childSubaccounts.map(child => ({
              ...child,
              openPerpetualPositions: { ...child.openPerpetualPositions },
              assetPositions: { ...child.assetPositions },
            }));

            const allOrders: any[] = [];
            const allFills: any[] = [];
            const pnlUpdates = new Map<string, PositionPnl>();
            const closedMarkets: string[] = [];
            let hasPositionChange = false;

            for (const batch of batches) {
              if (Array.isArray(batch.perpetualPositions)) {
                for (const pos of batch.perpetualPositions) {
                  const subNum: number = pos.subaccountNumber ?? batchSubNum;
                  let idx = updatedChildren.findIndex(c => c.subaccountNumber === subNum);

                  if (idx === -1) {
                    updatedChildren.push({
                      address: pos.address ?? currentData.address,
                      subaccountNumber: subNum,
                      equity: '0',
                      freeCollateral: '0',
                      openPerpetualPositions: {},
                      assetPositions: {},
                      marginEnabled: true,
                      updatedAtHeight: batch.blockHeight ?? '0',
                      latestProcessedBlockHeight: batch.blockHeight ?? '0',
                    });
                    idx = updatedChildren.length - 1;
                    hasPositionChange = true;
                  }

                  const child = updatedChildren[idx];
                  const isClosed = pos.status === 'CLOSED' || parseFloat(pos.size ?? '0') === 0;

                  if (isClosed) {
                    delete child.openPerpetualPositions[pos.market];
                    hasPositionChange = true;
                    pnlUpdates.set(pos.market, {
                      unrealizedPnl: '0',
                      realizedPnl: pos.realizedPnl ?? '0',
                      netFunding: pos.netFunding ?? '0',
                    });
                    closedMarkets.push(pos.market);
                  } else {
                    const existing = child.openPerpetualPositions[pos.market];
                    const isPnlOnly =
                      existing &&
                      pos.unrealizedPnl !== undefined &&
                      pos.size === undefined &&
                      pos.entryPrice === undefined &&
                      pos.side === undefined;

                    const merged = isPnlOnly
                      ? {
                        ...existing,
                        unrealizedPnl: pos.unrealizedPnl ?? existing.unrealizedPnl,
                        realizedPnl: pos.realizedPnl ?? existing.realizedPnl,
                        netFunding: pos.netFunding ?? existing.netFunding,
                      }
                      : existing
                        ? {
                          ...existing,
                          ...pos,
                          unrealizedPnl: pos.unrealizedPnl ?? existing.unrealizedPnl ?? '0',
                          realizedPnl: pos.realizedPnl ?? existing.realizedPnl ?? '0',
                          netFunding: pos.netFunding ?? existing.netFunding ?? '0',
                          entryPrice: pos.entryPrice ?? existing.entryPrice ?? '0',
                          size: pos.size ?? existing.size ?? '0',
                          side: pos.side ?? existing.side,
                          subaccountNumber: subNum,
                        }
                        : { ...pos, subaccountNumber: subNum };

                    child.openPerpetualPositions[pos.market] = merged;
                    if (!isPnlOnly) hasPositionChange = true;

                    pnlUpdates.set(pos.market, {
                      unrealizedPnl: merged.unrealizedPnl,
                      realizedPnl: merged.realizedPnl,
                      netFunding: merged.netFunding,
                    });
                  }

                  child.updatedAtHeight = batch.blockHeight ?? child.updatedAtHeight;
                  child.latestProcessedBlockHeight = batch.blockHeight ?? child.latestProcessedBlockHeight;
                }
              }

              if (Array.isArray(batch.assetPositions)) {
                for (const asset of batch.assetPositions) {
                  const subNum: number = asset.subaccountNumber ?? batchSubNum;
                  let idx = updatedChildren.findIndex(c => c.subaccountNumber === subNum);

                  if (idx === -1) {
                    updatedChildren.push({
                      address: asset.address ?? currentData.address,
                      subaccountNumber: subNum,
                      equity: '0',
                      freeCollateral: '0',
                      openPerpetualPositions: {},
                      assetPositions: {},
                      marginEnabled: true,
                      updatedAtHeight: batch.blockHeight ?? '0',
                      latestProcessedBlockHeight: batch.blockHeight ?? '0',
                    });
                    idx = updatedChildren.length - 1;
                  }

                  const child = updatedChildren[idx];
                  if (parseFloat(asset.size ?? '0') === 0) {
                    delete child.assetPositions[asset.symbol];
                  } else {
                    child.assetPositions[asset.symbol] = { ...asset, subaccountNumber: subNum };
                  }
                }
              }

              if (Array.isArray(batch.orders)) allOrders.push(...batch.orders);
              if (Array.isArray(batch.fills)) allFills.push(...batch.fills);
              if (batch.blockHeight) updates.blockHeight = batch.blockHeight;
            }

            if (pnlUpdates.size > 0 || closedMarkets.length > 0) {
              set(state => {
                const next = new Map(state.positionPnl);
                pnlUpdates.forEach((val, market) => next.set(market, val));
                closedMarkets.forEach(market => next.delete(market));
                return { positionPnl: next };
              });
            }

            if (hasPositionChange) updates.childSubaccounts = updatedChildren;
            if (allOrders.length > 0) updates.orders = allOrders as any;
            if (allFills.length > 0) updates.fills = allFills;

            get().updateParentSubaccount(key, updates, msgId);
            return;
          }

          if (contents.subaccount) {
            const sub = contents.subaccount;
            updates.address = sub.address;
            updates.parentSubaccountNumber = sub.parentSubaccountNumber;
            updates.equity = sub.equity ?? '0';
            updates.freeCollateral = sub.freeCollateral ?? '0';

            if (Array.isArray(sub.childSubaccounts)) {
              updates.childSubaccounts = sub.childSubaccounts.map((child: any) => ({
                address: child.address,
                subaccountNumber: child.subaccountNumber,
                equity: child.equity ?? '0',
                freeCollateral: child.freeCollateral ?? '0',
                openPerpetualPositions: child.openPerpetualPositions ?? {},
                assetPositions: child.assetPositions ?? {},
                marginEnabled: child.marginEnabled ?? true,
                updatedAtHeight: child.updatedAtHeight ?? '0',
                latestProcessedBlockHeight: child.latestProcessedBlockHeight ?? '0',
              }));
            }
          }

          if (contents.orders !== undefined) updates.orders = Array.isArray(contents.orders) ? contents.orders : ([] as any);
          if (contents.fills !== undefined) updates.fills = Array.isArray(contents.fills) ? contents.fills : [];
          if (contents.transfers !== undefined) updates.transfers = Array.isArray(contents.transfers) ? contents.transfers : [];
          if (contents.blockHeight) updates.blockHeight = contents.blockHeight;

          get().updateParentSubaccount(key, updates, msgId);
        });
      });
    },

    unsubscribeFromParentSubaccount: (address, subaccountNumber) => {
      handleUnsubscribe(`parent_subaccount_${address}_${subaccountNumber}`, set);
    },

    subscribeToMarket: (ticker) => {
      handleSubscribe(`market_${ticker}`, set, () => {
        const socketClient = getSocketClient();
        return socketClient.subscribeToMarkets((data: any) => {
          if (data.contents?.markets?.[ticker]) {
            const m = data.contents.markets[ticker];
            get().updateMarket(ticker, {
              ticker,
              oraclePrice: m.oraclePrice,
              priceChange24H: m.priceChange24H,
              trades24H: m.trades24H,
              volume24H: m.volume24H,
              openInterest: m.openInterest,
              nextFundingRate: m.nextFundingRate,
              lastUpdate: Date.now(),
            });
          }
        });
      });
    },

    unsubscribeFromMarket: (ticker) => {
      handleUnsubscribe(`market_${ticker}`, set);
    },

    subscribeToAllMarkets: () => {
      handleSubscribe('markets_all', set, () => {
        const socketClient = getSocketClient();
        return socketClient.subscribeToMarkets((data: any) => {
          if (data.contents?.markets) {
            get().updateMarkets(data.contents.markets);
          }
        });
      });
    },

    unsubscribeFromAllMarkets: () => {
      handleUnsubscribe('markets_all', set);
    },

    subscribeToTrades: (market) => {
      handleSubscribe(`trades_${market}`, set, () => {
        const socketClient = getSocketClient();
        return socketClient.subscribeToTrades(market, (data: any) => {
          if (data.contents?.trades) {
            get().updateTrades(market, { market, trades: data.contents.trades, lastUpdate: Date.now() });
          }
        });
      });
    },

    unsubscribeFromTrades: (market) => {
      handleUnsubscribe(`trades_${market}`, set);
    },

    subscribeToCandles: (market, resolution) => {
      const key = `candles_${market}_${resolution}`;
      handleSubscribe(key, set, () => {
        const socketClient = getSocketClient();
        return socketClient.subscribeToCandles(market, resolution, (data: any) => {
          if (data.contents?.candles) {
            get().updateCandles(key, { market, resolution, candles: data.contents.candles, lastUpdate: Date.now() });
          }
        });
      });
    },

    unsubscribeFromCandles: (market, resolution) => {
      handleUnsubscribe(`candles_${market}_${resolution}`, set);
    },

    updateParentSubaccount: (key, data, msgId = 0) => {
      set((state) => {
        const newMap = new Map(state.parentSubaccounts);
        const existing = newMap.get(key) ?? {
          address: '',
          parentSubaccountNumber: 0,
          equity: '0',
          freeCollateral: '0',
          childSubaccounts: [],
          orders: [] as TrackedOrder[],
          fills: [],
          transfers: [],
          blockHeight: '0',
          lastUpdate: 0,
        };

        const now = Date.now();
        const orderMap = new Map<string, TrackedOrder>(existing.orders.map(o => [o.id, o]));

        const mergedOrderMap =
          data.orders !== undefined && data.orders.length > 0
            ? mergeOrders(orderMap, data.orders as any[], msgId, now)
            : orderMap;

        const currentBlock = parseInt(data.blockHeight ?? existing.blockHeight ?? '0', 10);
        const finalOrders = evictOrders(mergedOrderMap, currentBlock, now);
        const finalFills = data.fills !== undefined ? mergeFills(existing.fills, data.fills) : existing.fills;

        const merged: ParentSubaccountData = {
          address: data.address ?? existing.address,
          parentSubaccountNumber: data.parentSubaccountNumber ?? existing.parentSubaccountNumber,
          equity: data.equity ?? existing.equity,
          freeCollateral: data.freeCollateral ?? existing.freeCollateral,
          childSubaccounts: data.childSubaccounts ?? existing.childSubaccounts,
          orders: finalOrders,
          fills: finalFills,
          transfers: data.transfers ?? existing.transfers,
          blockHeight: data.blockHeight ?? existing.blockHeight,
          lastUpdate: now,
        };

        newMap.set(key, merged);

        const hasChanges =
          data.childSubaccounts !== undefined ||
          (data.orders !== undefined && data.orders.length > 0) ||
          (data.fills !== undefined && data.fills.length > 0) ||
          data.equity !== existing.equity ||
          data.freeCollateral !== existing.freeCollateral ||
          finalOrders.length !== existing.orders.length ||
          finalFills.length !== existing.fills.length;

        return {
          parentSubaccounts: newMap,
          updateTrigger: hasChanges ? state.updateTrigger + 1 : state.updateTrigger,
        };
      });
    },

    updateMarket: (ticker, data) => {
      set((state) => {
        const existing = state.markets.get(ticker);
        const next = { ...existing, ...data, lastUpdate: Date.now() } as MarketData;

        if (
          existing &&
          existing.oraclePrice === next.oraclePrice &&
          existing.volume24H === next.volume24H &&
          existing.nextFundingRate === next.nextFundingRate &&
          existing.openInterest === next.openInterest &&
          existing.priceChange24H === next.priceChange24H
        ) {
          return {};
        }

        const newMap = new Map(state.markets);
        newMap.set(ticker, next);
        return { markets: newMap, updateTrigger: state.updateTrigger + 1 };
      });
    },

    updateMarkets: (updates: Record<string, Partial<MarketData>>) => {
      set((state) => {
        const now = Date.now();
        let hasAnyChange = false;
        const newMap = new Map(state.markets);

        for (const [ticker, m] of Object.entries(updates)) {
          const existing = newMap.get(ticker);
          const next: MarketData = {
            ...(existing ?? { ticker, trades24H: '0', lastUpdate: 0 }),
            ticker,
            oraclePrice: m.oraclePrice ?? existing?.oraclePrice ?? '0',
            priceChange24H: m.priceChange24H ?? existing?.priceChange24H ?? '0',
            volume24H: m.volume24H ?? existing?.volume24H ?? '0',
            openInterest: m.openInterest ?? existing?.openInterest ?? '0',
            nextFundingRate: m.nextFundingRate ?? existing?.nextFundingRate ?? '0',
            trades24H: m.trades24H ?? existing?.trades24H ?? '0',
            lastUpdate: now,
          };

          if (
            !existing ||
            existing.oraclePrice !== next.oraclePrice ||
            existing.volume24H !== next.volume24H ||
            existing.nextFundingRate !== next.nextFundingRate ||
            existing.openInterest !== next.openInterest ||
            existing.priceChange24H !== next.priceChange24H
          ) {
            newMap.set(ticker, next);
            hasAnyChange = true;
          }
        }

        return hasAnyChange
          ? { markets: newMap, updateTrigger: state.updateTrigger + 1 }
          : {};
      });
    },

    updateTrades: (market, data) => {
      set((state) => {
        const newMap = new Map(state.trades);
        newMap.set(market, { ...newMap.get(market), ...data } as TradeData);
        return { trades: newMap };
      });
    },

    updateCandles: (key, data) => {
      set((state) => {
        const newMap = new Map(state.candles);
        newMap.set(key, { ...newMap.get(key), ...data } as CandleData);
        return { candles: newMap };
      });
    },

    cleanup: () => {
      const { subscriptionRefs, unsubTimers } = get();

      unsubTimers.forEach(timer => clearTimeout(timer));
      subscriptionRefs.forEach((unsubscribe, key) => {
        try { unsubscribe(); } catch (error) {
          console.error(`[WSStore] Cleanup error for ${key}:`, error);
        }
      });

      set({
        parentSubaccounts: new Map(),
        markets: new Map(),
        trades: new Map(),
        candles: new Map(),
        positionPnl: new Map(),
        activeSubscriptions: new Set(),
        subscriptionRefs: new Map(),
        subscriptionCounts: new Map(),
        unsubTimers: new Map(),
        updateTrigger: 0,
      });
    },
  }))
);

webSocketManager.onConnect(() => useWebSocketStore.setState({ isConnected: true }));
webSocketManager.onDisconnect(() => useWebSocketStore.setState({ isConnected: false }));

export function selectOpenOrders(data: ParentSubaccountData | undefined): TrackedOrder[] {
  if (!data) return [];
  return data.orders.filter(o => OPEN_STATUSES.has(o.status));
}

export function selectOpenAndGraceOrders(data: ParentSubaccountData | undefined): TrackedOrder[] {
  if (!data) return [];
  const now = Date.now();
  return data.orders.filter(o => {
    if (OPEN_STATUSES.has(o.status)) return true;
    if (TERMINAL_STATUSES.has(o.status)) return now - (o._terminalAt ?? now) < TERMINAL_GRACE_MS;
    return false;
  });
}

export function selectRecentlyTerminalOrders(data: ParentSubaccountData | undefined): TrackedOrder[] {
  if (!data) return [];
  const now = Date.now();
  return data.orders.filter(
    o => TERMINAL_STATUSES.has(o.status) && now - (o._terminalAt ?? now) < TERMINAL_GRACE_MS
  );
}
