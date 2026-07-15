import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

import { useNotificationStore } from '../../../store/notificationStore';
import { getSocketClient } from '../client/clients';
import type { Fill, Transfer } from '../types/trading.types';
import { webSocketManager } from '../utils/WebSocketManager';
import type { WebSocketMessage } from '../utils/WebSocketManager';

export type { Fill, Transfer };

/**
 * Loose shape of a raw market entry from the WS v4_markets snapshot.
 * All fields are optional because different protocol versions may omit some.
 */
export interface RawMarketSnapshot {
  oraclePrice?: string;
  priceChange24H?: string;
  priceChange24HPercent?: string;
  trades24H?: string | number;
  volume24H?: string;
  openInterest?: string;
  nextFundingRate?: string;
  nextFundingAt?: string;
  initialMarginFraction?: string;
  maintenanceMarginFraction?: string;
  clobPairId?: string;
  marketId?: string;
  status?: string;
  marketType?: string;
  tickSize?: string;
  stepSize?: string;
  atomicResolution?: number;
  quantumConversionExponent?: number;
  stepBaseQuantums?: number;
  subticksPerTick?: number;
  openInterestLowerCap?: string;
  openInterestUpperCap?: string;
  baseOpenInterest?: string;
  defaultFundingRate1H?: string;
  [key: string]: unknown;
}

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
  fills: Fill[];
  transfers: Transfer[];
  blockHeight: string;
  lastUpdate: number;
}

export interface MarketData {
  ticker: string;
  oraclePrice: string;
  priceChange24H: string;
  priceChange24HPercent?: string;
  trades24H: string;
  volume24H: string;
  openInterest: string;
  nextFundingRate: string;
  nextFundingAt?: string;
  initialMarginFraction: string;
  maintenanceMarginFraction?: string;
  // market spec fields from WS snapshot
  clobPairId?: string;
  marketId?: string;
  status?: string;
  marketType?: string;
  tickSize?: string;
  stepSize?: string;
  atomicResolution?: number;
  quantumConversionExponent?: number;
  stepBaseQuantums?: number;
  subticksPerTick?: number;
  openInterestLowerCap?: string;
  openInterestUpperCap?: string;
  baseOpenInterest?: string;
  defaultFundingRate1H?: string;
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
  subaccountNumber?: number;
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
  _firstSeenAt?: number; // timestamp when we first saw this order
}

export type RawOrder = Omit<TrackedOrder, '_msgId' | '_terminalAt' | '_firstSeenAt'> & {
  _msgId?: number;
  _terminalAt?: number;
  _firstSeenAt?: number;
};

export type PartialSubaccountUpdate = Omit<Partial<ParentSubaccountData>, 'orders'> & {
  orders?: RawOrder[];
};

const TERMINAL_STATUSES = new Set(['FILLED', 'CANCELED', 'BEST_EFFORT_CANCELED', 'REJECTED']);
const OPEN_STATUSES = new Set(['OPEN', 'BEST_EFFORT_OPENED', 'UNTRIGGERED', 'PARTIALLY_FILLED']);

// delayed unsubscribe prevents churn on fast mount/unmount cycles
const UNSUB_DELAY_MS = 3_000;

// Isolated subaccount numbers start at this value (dYdX protocol constant)
export const ISOLATED_SUBACCOUNT_START = 128;

export function isMarketOrder(
  order: Pick<TrackedOrder, 'type' | 'timeInForce' | 'orderFlags'>
): boolean {
  return order.type === 'MARKET' || (order.timeInForce === 'IOC' && order.orderFlags === '0');
}

function recomputeChildEquity(child: ChildSubaccount): void {
  let childEquity = 0;

  // 1. Net collateral from asset positions (normally just USDC)
  Object.values(child.assetPositions || {}).forEach(asset => {
    const size = parseFloat(asset.size || '0');
    const isShort = asset.side === 'SHORT';
    childEquity += isShort ? -size : size;
  });

  const openPerps = Object.values(child.openPerpetualPositions);

  if (openPerps.length === 0) {
    child.equity = childEquity.toFixed(6);
    child.freeCollateral = childEquity.toFixed(6);
    return;
  }

  const state = useWebSocketStore.getState();
  const markets = state.markets;

  let totalIMR = 0;
  openPerps.forEach(pos => {
    const mktData = markets.get(pos.market);
    const size = parseFloat(pos.size || '0');
    const price = mktData ? parseFloat(mktData.oraclePrice) : parseFloat(pos.entryPrice || '0');
    childEquity += size * price;

    const imf = parseFloat(mktData?.initialMarginFraction ?? '0.05');
    totalIMR += Math.abs(size * price * imf);
  });

  child.equity = childEquity.toFixed(6);
  child.freeCollateral = Math.max(0, childEquity - totalIMR).toFixed(6);
}

interface WebSocketState {
  isConnected: boolean;
  connectionStatus: 'connecting' | 'connected' | 'disconnected';
  connectionId: string | null;
  updateTrigger: number;

  parentSubaccounts: Map<string, ParentSubaccountData>;
  markets: Map<string, MarketData>;
  /** Full snapshot populated from the WS 'subscribed' message — used by useMarkets instead of REST */
  marketsSnapshot: Map<string, MarketData> | null;
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

  optimisticFreeCollateralDelta: number;
  applyOptimisticMarginDeduction: (amount: number) => void;
  clearOptimisticDelta: () => void;

  updateParentSubaccount: (
    key: string,
    data: PartialSubaccountUpdate,
    msgId?: number,
    isLiveUpdate?: boolean
  ) => void;
  updateMarket: (ticker: string, data: Partial<MarketData>) => void;
  updateMarkets: (updates: Record<string, Partial<MarketData>>) => void;
  updateOraclePrices: (updates: Record<string, string>) => void;
  initializeMarketsFromSnapshot: (snapshot: Record<string, RawMarketSnapshot>) => void;
  updateTrades: (market: string, data: Partial<TradeData>) => void;
  updateCandles: (key: string, data: Partial<CandleData>) => void;
  cleanup: () => void;
}

const handleSubscribe = (
  key: string,
  set: (fn: (s: WebSocketState) => Partial<WebSocketState>) => void,
  subscribeFn: () => (() => void) | void
) => {
  let shouldOpen = false;
  let hasTimer = false;

  set(state => {
    const { activeSubscriptions, subscriptionCounts, unsubTimers } = state;
    const count = subscriptionCounts.get(key) ?? 0;
    const newCounts = new Map(subscriptionCounts).set(key, count + 1);

    // cancel any pending delayed-unsubscribe for this key
    if (unsubTimers.has(key)) {
      clearTimeout(unsubTimers.get(key)!);
      const newTimers = new Map(unsubTimers);
      newTimers.delete(key);
      hasTimer = true;
      return { subscriptionCounts: newCounts, unsubTimers: newTimers };
    }

    if (!activeSubscriptions.has(key)) shouldOpen = true;
    return { subscriptionCounts: newCounts };
  });

  // call subscribeFn outside the setter to prevent re-entrant side-effects
  if (shouldOpen && !hasTimer) {
    try {
      const unsubscribe = subscribeFn();
      if (typeof unsubscribe === 'function') {
        set(state => ({
          activeSubscriptions: new Set(state.activeSubscriptions).add(key),
          subscriptionRefs: new Map(state.subscriptionRefs).set(key, unsubscribe),
        }));
      }
    } catch (error) {
      console.error(`[WSStore] Failed to subscribe to ${key}:`, error);
    }
  }
};

// Decrements ref count and schedules delayed unsubscribe once count hits zero
const handleUnsubscribe = (
  key: string,
  set: (fn: (s: WebSocketState) => Partial<WebSocketState>) => void
) => {
  set(state => {
    const { subscriptionCounts, unsubTimers } = state;
    const count = subscriptionCounts.get(key) ?? 0;

    // still other subscribers — just decrement
    if (count > 1) {
      return { subscriptionCounts: new Map(subscriptionCounts).set(key, count - 1) };
    }

    const newCounts = new Map(subscriptionCounts);
    newCounts.delete(key);

    // delay actual teardown so a remounting component reuses the channel
    const timer = setTimeout(() => {
      set(inner => {
        // another subscriber appeared during the delay — abort teardown
        if (inner.subscriptionCounts.has(key)) return {};

        const refs = new Map(inner.subscriptionRefs);
        const subs = new Set(inner.activeSubscriptions);
        const timers = new Map(inner.unsubTimers);

        const unsubscribe = refs.get(key);
        if (typeof unsubscribe === 'function') {
          try {
            unsubscribe();
          } catch (err) {
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

/**
 * Merges incoming raw orders into the existing map.
 * Skips updates with a stale msgId to handle out-of-order delivery.
 */
function mergeOrders(
  existing: Map<string, TrackedOrder>,
  incoming: RawOrder[],
  msgId: number,
  now: number,
  isLiveUpdate: boolean
): Map<string, TrackedOrder> {
  const next = new Map(existing);

  for (const raw of incoming) {
    const id: string = raw.id;
    if (!id) continue;

    const prev = next.get(id);
    if (prev && prev._msgId > msgId) continue;

    const mergedStatus = raw.status || (prev ? prev.status : 'OPEN');
    const isTerminal = TERMINAL_STATUSES.has(mergedStatus);
    const prevWasTerminal = prev ? TERMINAL_STATUSES.has(prev.status) : false;

    // if status is no longer terminal, clear the timestamp so grace logic is reset
    const terminalAt = !isTerminal ? undefined : prevWasTerminal ? prev!._terminalAt : now;

    const firstSeenAt = prev?._firstSeenAt ?? now;

    const merged = {
      ...prev,
      ...raw,
      status: mergedStatus,
      _msgId: msgId,
      _terminalAt: terminalAt,
      _firstSeenAt: firstSeenAt,
    } as TrackedOrder;
    next.set(id, merged);

    if (isLiveUpdate && isTerminal && !prevWasTerminal) {
      if (merged.status === 'FILLED') {
        try {
          useNotificationStore.getState().showToast({
            type: 'DYDX',
            title: 'Order Filled',
            message: `Your ${merged.side} order for ${merged.size} on ${merged.ticker || 'market'} was filled.`,
          });
        } catch (e) {
          console.error('Failed to show fill toast', e);
        }
      } else if (merged.status === 'REJECTED' || merged.status === 'BEST_EFFORT_CANCELED') {
        try {
          let reason = merged.removalReason || merged.status;
          if (reason.includes('UNDERCOLLATERALIZED')) reason = 'Undercollateralized';
          if (reason.includes('INSUFFICIENT_MARGIN')) reason = 'Insufficient Margin';
          useNotificationStore.getState().showToast({
            type: 'DYDX',
            title: 'Order Rejected',
            message: `Order rejected on chain: ${reason}`,
          });
        } catch (e) {
          console.error('Failed to show rejection toast', e);
        }
      }
    }
  }

  return next;
}

/**
 * Removes expired orders and caps the list to MAX_ORDERS.
 */
function evictOrders(orderMap: Map<string, TrackedOrder>, currentBlock: number): TrackedOrder[] {
  const kept: TrackedOrder[] = [];

  for (const order of orderMap.values()) {
    if (TERMINAL_STATUSES.has(order.status)) {
      continue;
    }

    if (currentBlock > 0 && order.goodTilBlock && parseInt(order.goodTilBlock, 10) < currentBlock) {
      if (process.env.NODE_ENV !== 'production') {
        console.debug(
          `[WSStore] Evicting expired order ${order.id} (gtb ${order.goodTilBlock} < block ${currentBlock})`
        );
      }
      continue;
    }

    kept.push(order);
  }

  return kept.sort((a, b) => {
    const tA = a.updatedAt
      ? new Date(a.updatedAt).getTime()
      : parseInt(a.createdAtHeight ?? '0', 10);
    const tB = b.updatedAt
      ? new Date(b.updatedAt).getTime()
      : parseInt(b.createdAtHeight ?? '0', 10);
    return tB - tA;
  });
}

function mergeFills(existing: Fill[], incoming: Fill[]): Fill[] {
  const fillMap = new Map<string, Fill>(existing.map(f => [f.id, f]));

  for (const fill of incoming) {
    const ex = fillMap.get(fill.id);
    // compare ISO strings lexicographically — avoids Date construction per fill
    if (!ex || (fill.createdAt && fill.createdAt >= ex.createdAt)) {
      fillMap.set(fill.id, fill);
    }
  }

  return Array.from(fillMap.values()).sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));
}

export interface WsPerpetualPosition extends Partial<PerpetualPosition> {
  address?: string;
  blockHeight?: string;
}

export interface WsAssetPosition extends Partial<AssetPosition> {
  address?: string;
  blockHeight?: string;
}

interface WsBatchItem {
  oraclePrices?: Record<string, { oraclePrice?: string }>;
  markets?: Record<string, Partial<MarketData>>;
  blockHeight?: string;
  perpetualPositions?: WsPerpetualPosition[];
  assetPositions?: WsAssetPosition[];
  orders?: RawOrder[];
  fills?: Fill[];
  transfers?: Transfer[];
  [key: string]: unknown;
}

function parseOraclePriceBatch(contents: WsBatchItem[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const batch of contents) {
    if (batch?.oraclePrices) {
      for (const [ticker, priceData] of Object.entries(batch.oraclePrices)) {
        if (priceData?.oraclePrice) {
          result[ticker] = priceData.oraclePrice;
        }
      }
    }
  }
  return result;
}

function parseMarketBatch(contents: WsBatchItem[]): Record<string, Partial<MarketData>> {
  const result: Record<string, Partial<MarketData>> = {};
  for (const batch of contents) {
    if (batch?.markets) {
      for (const [ticker, data] of Object.entries(batch.markets)) {
        result[ticker] = data;
      }
    }
  }
  return result;
}

// ─── Parent equity recomputation ──────────────────────────────────────────────

/**
 * Recomputes parent-level equity and freeCollateral after child updates:
 *
 *   portfolioValue / totalEquity = sum of all child equities
 *   availableBalance / freeCollateral = cross child (subaccountNumber 0) freeCollateral
 *
 * This mirrors the dYdX UI where:
 *   - "Portfolio Value" shows the total across ALL accounts (cross + isolated)
 *   - "Available Balance" = cross account free collateral only
 */
function recomputeParentFromChildren(
  children: ChildSubaccount[],
  existingFreeCollateral: string
): { equity: string; freeCollateral: string } {
  const totalEquity = children.reduce((sum, c) => sum + parseFloat(c.equity || '0'), 0);
  const crossChild = children.find(c => c.subaccountNumber === 0);
  const freeCollateral = crossChild?.freeCollateral ?? existingFreeCollateral;

  return {
    equity: totalEquity.toFixed(6),
    freeCollateral,
  };
}
export const useWebSocketStore = create<WebSocketState>()(
  subscribeWithSelector((set, get) => ({
    isConnected: false,
    connectionStatus: 'disconnected' as const,
    connectionId: null,
    updateTrigger: 0,
    optimisticFreeCollateralDelta: 0,
    parentSubaccounts: new Map(),
    markets: new Map(),
    marketsSnapshot: null,
    trades: new Map(),
    candles: new Map(),
    positionPnl: new Map(),
    activeSubscriptions: new Set(),
    subscriptionRefs: new Map(),
    subscriptionCounts: new Map(),
    unsubTimers: new Map(),

    // Subaccount subscription
    subscribeToParentSubaccount: (address, subaccountNumber) => {
      const key = `parent_subaccount_${address}_${subaccountNumber}`;

      handleSubscribe(key, set, () => {
        const socketClient = getSocketClient();

        return socketClient.subscribeToParentSubaccounts(
          address,
          subaccountNumber,
          (data: WebSocketMessage) => {
            if (!data?.contents) return;

            const msgId: number = data.message_id ?? 0;
            const messageType: string = data.type ?? '';
            const contents = data.contents as Record<string, unknown>;
            const updates: PartialSubaccountUpdate = { lastUpdate: Date.now() };

            if (messageType === 'subscribed' && (contents as Record<string, unknown>).subaccount) {
              const sub = (contents as Record<string, unknown>).subaccount as Record<
                string,
                unknown
              >;

              updates.address = sub.address as string | undefined;
              updates.parentSubaccountNumber = sub.parentSubaccountNumber as number | undefined;
              updates.equity = (sub.equity as string | undefined) ?? '0';
              updates.freeCollateral = (sub.freeCollateral as string | undefined) ?? '0';

              if (Array.isArray(sub.childSubaccounts)) {
                updates.childSubaccounts = (sub.childSubaccounts as Record<string, unknown>[]).map(
                  child => ({
                    address: child.address as string,
                    subaccountNumber: child.subaccountNumber as number,
                    equity: (child.equity as string) ?? '0',
                    freeCollateral: (child.freeCollateral as string) ?? '0',
                    openPerpetualPositions:
                      (child.openPerpetualPositions as Record<string, PerpetualPosition>) ?? {},
                    assetPositions: (child.assetPositions as Record<string, AssetPosition>) ?? {},
                    marginEnabled: (child.marginEnabled as boolean) ?? true,
                    updatedAtHeight: (child.updatedAtHeight as string) ?? '0',
                    latestProcessedBlockHeight: (child.latestProcessedBlockHeight as string) ?? '0',
                  })
                );

                // seed positionPnl from snapshot
                const initialPnl = new Map(get().positionPnl);
                (sub.childSubaccounts as Record<string, unknown>[]).forEach(child => {
                  Object.values(
                    (child.openPerpetualPositions as Record<string, unknown>) ?? {}
                  ).forEach(pos => {
                    const p = pos as Record<string, unknown>;
                    if (p.market && typeof p.market === 'string') {
                      initialPnl.set(p.market, {
                        unrealizedPnl: (p.unrealizedPnl as string) ?? '0',
                        realizedPnl: (p.realizedPnl as string) ?? '0',
                        netFunding: (p.netFunding as string) ?? '0',
                      });
                    }
                  });
                });
                set({ positionPnl: initialPnl });
              }

              if (contents.orders !== undefined) {
                const rawOrders = contents.orders as unknown[];
                updates.orders = (Array.isArray(rawOrders) ? rawOrders : []).map((o): RawOrder => ({
                  ...(o as RawOrder),
                  _msgId: 0,
                  subaccountNumber:
                    (o as RawOrder).subaccountNumber ??
                    (data.contents as Record<string, number>)?.subaccountNumber ??
                    subaccountNumber,
                }));
              }
              if (contents.fills !== undefined)
                updates.fills = Array.isArray(contents.fills) ? (contents.fills as Fill[]) : [];
              if (contents.transfers !== undefined)
                updates.transfers = Array.isArray(contents.transfers)
                  ? (contents.transfers as Transfer[])
                  : [];
              if (contents.blockHeight) updates.blockHeight = contents.blockHeight as string;

              get().updateParentSubaccount(key, updates, msgId, false);
              return;
            }

            // Incremental batch / single update
            if (messageType === 'channel_batch_data' || messageType === 'channel_data') {
              const batches: WsBatchItem[] = Array.isArray(contents)
                ? (contents as WsBatchItem[])
                : [contents as WsBatchItem];
              const batchSubNum: number =
                (data.contents as Record<string, number>)?.subaccountNumber ?? 0;
              const currentData = get().parentSubaccounts.get(key);
              if (!currentData) return;

              const updatedChildren = currentData.childSubaccounts.map(child => ({
                ...child,
                openPerpetualPositions: { ...child.openPerpetualPositions },
                assetPositions: { ...child.assetPositions },
              }));

              const allOrders: RawOrder[] = [];
              const allFills: Fill[] = [];
              const pnlUpdates = new Map<string, PositionPnl>();
              const closedMarkets: string[] = [];
              let hasChildUpdate = false;
              let hasPerpUpdate = false;
              let hasAssetUpdate = false;

              for (const batch of batches) {
                //  perpetual position updates
                if (Array.isArray(batch.perpetualPositions)) {
                  for (const pos of batch.perpetualPositions) {
                    if (!pos.market) continue;
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
                      hasChildUpdate = true;
                    }

                    const child = updatedChildren[idx];
                    const isClosed = pos.status === 'CLOSED' || parseFloat(pos.size ?? '0') === 0;

                    if (isClosed) {
                      const wasAlreadyClosed = !child.openPerpetualPositions[pos.market];
                      delete child.openPerpetualPositions[pos.market];
                      hasChildUpdate = true;
                      hasPerpUpdate = true;
                      pnlUpdates.set(pos.market, {
                        unrealizedPnl: '0',
                        realizedPnl: pos.realizedPnl ?? '0',
                        netFunding: pos.netFunding ?? '0',
                      });
                      closedMarkets.push(pos.market);

                      if (!wasAlreadyClosed) {
                        const pnl = parseFloat(pos.realizedPnl || '0');
                        useNotificationStore.getState().showToast({
                          type: 'DYDX',
                          title: 'Position Closed',
                          message: `Position on ${pos.market} closed. Realized PnL: $${pnl.toFixed(2)}`,
                        });
                      }
                    } else {
                      const existing = child.openPerpetualPositions[pos.market];
                      const isPnlOnly =
                        existing &&
                        pos.unrealizedPnl !== undefined &&
                        pos.size === undefined &&
                        pos.entryPrice === undefined &&
                        pos.side === undefined;

                      const merged = (
                        isPnlOnly
                          ? { ...existing, ...pos }
                          : existing
                            ? { ...existing, ...pos, subaccountNumber: subNum }
                            : { ...pos, subaccountNumber: subNum }
                      ) as PerpetualPosition;

                      child.openPerpetualPositions[pos.market] = merged;
                      if (!isPnlOnly) hasChildUpdate = true;
                      hasPerpUpdate = true;

                      pnlUpdates.set(pos.market, {
                        unrealizedPnl: merged.unrealizedPnl ?? '0',
                        realizedPnl: merged.realizedPnl ?? '0',
                        netFunding: merged.netFunding ?? '0',
                      });
                    }

                    child.updatedAtHeight = batch.blockHeight ?? child.updatedAtHeight;
                    child.latestProcessedBlockHeight =
                      batch.blockHeight ?? child.latestProcessedBlockHeight;
                  }
                }

                // asset position updates
                if (Array.isArray(batch.assetPositions)) {
                  for (const asset of batch.assetPositions) {
                    if (!asset.symbol) continue;
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
                    const newSize = parseFloat(asset.size ?? '0');

                    if (newSize === 0) {
                      delete child.assetPositions[asset.symbol];
                    } else {
                      child.assetPositions[asset.symbol] = {
                        ...asset,
                        subaccountNumber: subNum,
                      } as AssetPosition;
                    }

                    hasChildUpdate = true;
                    hasAssetUpdate = true;
                  }
                }

                if (Array.isArray(batch.orders)) {
                  allOrders.push(
                    ...batch.orders.map((o: RawOrder): RawOrder => ({
                      ...o,
                      subaccountNumber: o.subaccountNumber ?? batchSubNum,
                    }))
                  );
                }
                if (Array.isArray(batch.fills)) allFills.push(...batch.fills);
                if (batch.blockHeight) updates.blockHeight = batch.blockHeight as string;
              }

              // Recompute child equity after all batch items processed
              // Do this AFTER all perpetual + asset updates so we have the
              // correct picture of both USDC collateral and open perp PnL.
              if (hasAssetUpdate || hasPerpUpdate) {
                for (const child of updatedChildren) {
                  recomputeChildEquity(child);
                }
                hasChildUpdate = true;
              }

              if (pnlUpdates.size > 0 || closedMarkets.length > 0) {
                set(state => {
                  const next = new Map(state.positionPnl);
                  pnlUpdates.forEach((val, market) => next.set(market, val));
                  closedMarkets.forEach(market => next.delete(market));
                  return { positionPnl: next };
                });
              }

              if (hasChildUpdate) {
                updates.childSubaccounts = updatedChildren;

                // Recompute parent-level metrics:
                //   portfolioValue (equity) = sum of ALL children
                //   availableBalance (freeCollateral) = cross child's freeCollateral
                const { equity, freeCollateral } = recomputeParentFromChildren(
                  updatedChildren,
                  currentData.freeCollateral
                );
                updates.equity = equity;
                updates.freeCollateral = freeCollateral;
              }

              if (allOrders.length > 0) {
                updates.orders = allOrders;
                get().clearOptimisticDelta();
              }
              if (allFills.length > 0) updates.fills = allFills as Fill[];

              get().updateParentSubaccount(key, updates, msgId, true);
              return;
            }
            if (contents.subaccount) {
              const sub = contents.subaccount as Record<string, unknown>;
              updates.address = sub.address as string;
              updates.parentSubaccountNumber = sub.parentSubaccountNumber as number;
              updates.equity = (sub.equity as string) ?? '0';
              updates.freeCollateral = (sub.freeCollateral as string) ?? '0';

              if (Array.isArray(sub.childSubaccounts)) {
                updates.childSubaccounts = (sub.childSubaccounts as Record<string, unknown>[]).map(
                  child => ({
                    address: child.address as string,
                    subaccountNumber: child.subaccountNumber as number,
                    equity: (child.equity as string) ?? '0',
                    freeCollateral: (child.freeCollateral as string) ?? '0',
                    openPerpetualPositions:
                      (child.openPerpetualPositions as Record<string, PerpetualPosition>) ?? {},
                    assetPositions: (child.assetPositions as Record<string, AssetPosition>) ?? {},
                    marginEnabled: (child.marginEnabled as boolean) ?? true,
                    updatedAtHeight: (child.updatedAtHeight as string) ?? '0',
                    latestProcessedBlockHeight: (child.latestProcessedBlockHeight as string) ?? '0',
                  })
                );
              }
            }

            if (contents.orders !== undefined) {
              const rawOrders = contents.orders as unknown[];
              updates.orders = (Array.isArray(rawOrders) ? rawOrders : []).map((o): RawOrder => ({
                ...(o as RawOrder),
                subaccountNumber:
                  (o as RawOrder).subaccountNumber ??
                  (data.contents as Record<string, number>)?.subaccountNumber ??
                  subaccountNumber,
              }));
            }
            if (contents.fills !== undefined)
              updates.fills = Array.isArray(contents.fills) ? (contents.fills as Fill[]) : [];
            if (contents.transfers !== undefined)
              updates.transfers = Array.isArray(contents.transfers)
                ? (contents.transfers as Transfer[])
                : [];
            if (contents.blockHeight) updates.blockHeight = contents.blockHeight as string;

            get().updateParentSubaccount(key, updates, msgId, true);
          }
        );
      });
    },

    unsubscribeFromParentSubaccount: (address, subaccountNumber) => {
      handleUnsubscribe(`parent_subaccount_${address}_${subaccountNumber}`, set);
    },

    subscribeToMarket: ticker => {
      handleSubscribe(`market_${ticker}`, set, () => {
        const socketClient = getSocketClient();
        return socketClient.subscribeToMarkets((data: WebSocketMessage) => {
          if (!data?.contents) return;
          const contents = data.contents as Record<string, unknown>;

          const marketsMap = (contents as { markets?: Record<string, Partial<MarketData>> })
            .markets;
          if (marketsMap?.[ticker]) {
            const m = marketsMap[ticker];
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

          if (Array.isArray(contents)) {
            const oraclePrices = parseOraclePriceBatch(contents as WsBatchItem[]);
            if (oraclePrices[ticker]) {
              get().updateOraclePrices({ [ticker]: oraclePrices[ticker] });
            }
          }
        });
      });
    },

    unsubscribeFromMarket: ticker => {
      handleUnsubscribe(`market_${ticker}`, set);
    },

    subscribeToAllMarkets: () => {
      handleSubscribe('markets_all', set, () => {
        const socketClient = getSocketClient();
        return socketClient.subscribeToMarkets((data: WebSocketMessage) => {
          if (!data?.contents) return;
          const contents = data.contents as Record<string, unknown>;
          const msgType: string = data.type ?? '';

          if (
            msgType === 'subscribed' &&
            (contents as { markets?: Record<string, RawMarketSnapshot> }).markets
          ) {
            get().initializeMarketsFromSnapshot(
              (contents as { markets: Record<string, RawMarketSnapshot> }).markets
            );
            return;
          }

          if (
            !Array.isArray(contents) &&
            (contents as { markets?: Record<string, Partial<MarketData>> }).markets
          ) {
            get().updateMarkets(
              (contents as { markets: Record<string, Partial<MarketData>> }).markets
            );
            return;
          }

          if (Array.isArray(contents)) {
            const oraclePrices = parseOraclePriceBatch(contents as WsBatchItem[]);
            if (Object.keys(oraclePrices).length > 0) get().updateOraclePrices(oraclePrices);

            const marketUpdates = parseMarketBatch(contents as WsBatchItem[]);
            if (Object.keys(marketUpdates).length > 0) get().updateMarkets(marketUpdates);
          }
        });
      });
    },

    unsubscribeFromAllMarkets: () => {
      handleUnsubscribe('markets_all', set);
    },

    // Trades & Candles

    subscribeToTrades: market => {
      handleSubscribe(`trades_${market}`, set, () => {
        const socketClient = getSocketClient();
        return socketClient.subscribeToTrades(market, (data: WebSocketMessage) => {
          const contents = data.contents as { trades?: TradeData['trades'] } | TradeData['trades'];
          const rawTrades = Array.isArray(contents)
            ? (contents as WsBatchItem[]).flatMap(c => {
                const batch = c as { trades?: TradeData['trades']; id?: string };
                return (
                  batch?.trades || (batch?.id ? [batch as unknown as TradeData['trades'][0]] : [])
                );
              })
            : (contents as { trades?: TradeData['trades'] })?.trades || [];
          if (rawTrades.length > 0) {
            get().updateTrades(market, { market, trades: rawTrades, lastUpdate: Date.now() });
          }
        });
      });
    },

    unsubscribeFromTrades: market => {
      handleUnsubscribe(`trades_${market}`, set);
    },

    subscribeToCandles: (market, resolution) => {
      const key = `candles_${market}_${resolution}`;
      handleSubscribe(key, set, () => {
        const socketClient = getSocketClient();
        return socketClient.subscribeToCandles(market, resolution, (data: WebSocketMessage) => {
          const contents = data.contents as
            { candles?: CandleData['candles'] } | CandleData['candles'];
          const rawCandles = Array.isArray(contents)
            ? (contents as WsBatchItem[]).flatMap(c => {
                const batch = c as { candles?: CandleData['candles']; startedAt?: string };
                return (
                  batch?.candles ||
                  (batch?.startedAt ? [batch as unknown as CandleData['candles'][0]] : [])
                );
              })
            : (contents as { candles?: CandleData['candles'] })?.candles || [];
          if (rawCandles.length > 0) {
            get().updateCandles(key, {
              market,
              resolution,
              candles: rawCandles,
              lastUpdate: Date.now(),
            });
          }
        });
      });
    },

    unsubscribeFromCandles: (market, resolution) => {
      handleUnsubscribe(`candles_${market}_${resolution}`, set);
    },

    applyOptimisticMarginDeduction: amount => {
      set(s => ({ optimisticFreeCollateralDelta: s.optimisticFreeCollateralDelta + amount }));
    },

    clearOptimisticDelta: () => {
      set({ optimisticFreeCollateralDelta: 0 });
    },

    updateParentSubaccount: (key, data, msgId = 0, isLiveUpdate = false) => {
      set(state => {
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
            ? mergeOrders(orderMap, data.orders, msgId, now, isLiveUpdate)
            : orderMap;

        const currentBlock = parseInt(data.blockHeight ?? existing.blockHeight ?? '0', 10);
        const finalOrders = evictOrders(mergedOrderMap, currentBlock);
        const finalFills =
          data.fills !== undefined ? mergeFills(existing.fills, data.fills) : existing.fills;

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

        // receiving a real freeCollateral value means server has caught up — clear optimistic offset
        const clearOptimistic = data.freeCollateral !== undefined;

        return {
          parentSubaccounts: newMap,
          optimisticFreeCollateralDelta: clearOptimistic ? 0 : state.optimisticFreeCollateralDelta,
          updateTrigger: hasChanges ? state.updateTrigger + 1 : state.updateTrigger,
        };
      });
    },

    updateMarket: (ticker, data) => {
      set(state => {
        const existing = state.markets.get(ticker);
        const next = { ...existing, ...data, lastUpdate: Date.now() } as MarketData;

        // skip render if nothing meaningful changed
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
      set(state => {
        const now = Date.now();
        let hasAnyChange = false;
        const newMap = new Map(state.markets);

        for (const [ticker, m] of Object.entries(updates)) {
          const existing = newMap.get(ticker);
          const next: MarketData = {
            ...(existing ?? {
              ticker,
              trades24H: '0',
              initialMarginFraction: '0',
              lastUpdate: 0,
            }),
            ticker,
            oraclePrice: m.oraclePrice ?? existing?.oraclePrice ?? '0',
            priceChange24H: m.priceChange24H ?? existing?.priceChange24H ?? '0',
            volume24H: m.volume24H ?? existing?.volume24H ?? '0',
            openInterest: m.openInterest ?? existing?.openInterest ?? '0',
            nextFundingRate: m.nextFundingRate ?? existing?.nextFundingRate ?? '0',
            trades24H: m.trades24H ?? existing?.trades24H ?? '0',
            initialMarginFraction:
              (m as any).initialMarginFraction ?? existing?.initialMarginFraction ?? '0',
            lastUpdate: now,
          };

          if (
            !existing ||
            existing.oraclePrice !== next.oraclePrice ||
            existing.volume24H !== next.volume24H ||
            existing.nextFundingRate !== next.nextFundingRate ||
            existing.openInterest !== next.openInterest ||
            existing.priceChange24H !== next.priceChange24H ||
            existing.initialMarginFraction !== next.initialMarginFraction
          ) {
            newMap.set(ticker, next);
            hasAnyChange = true;
          }
        }

        return hasAnyChange ? { markets: newMap, updateTrigger: state.updateTrigger + 1 } : {};
      });
    },

    updateOraclePrices: (updates: Record<string, string>) => {
      set(state => {
        const now = Date.now();
        let hasAnyChange = false;
        const newMap = new Map(state.markets);

        for (const [ticker, oraclePrice] of Object.entries(updates)) {
          const existing = newMap.get(ticker);
          if (!existing || existing.oraclePrice === oraclePrice) continue;

          newMap.set(ticker, { ...existing, oraclePrice, lastUpdate: now });
          hasAnyChange = true;
        }

        return hasAnyChange ? { markets: newMap, updateTrigger: state.updateTrigger + 1 } : {};
      });
    },

    /**
     * Called once when the WS v4_markets 'subscribed' snapshot arrives.
     * Builds a full MarketData map from the raw snapshot fields and stores it
     * in `marketsSnapshot`. useMarkets reads this instead of calling the REST API.
     */
    initializeMarketsFromSnapshot: (snapshot: Record<string, any>) => {
      const now = Date.now();
      const snapshotMap = new Map<string, MarketData>();
      const marketMap = new Map<string, MarketData>();

      for (const [ticker, raw] of Object.entries(snapshot)) {
        if (!raw || typeof raw !== 'object') continue;
        const m: MarketData = {
          ticker,
          oraclePrice: raw.oraclePrice ?? '0',
          priceChange24H: raw.priceChange24H ?? '0',
          priceChange24HPercent: raw.priceChange24HPercent ?? '0',
          trades24H: String(raw.trades24H ?? '0'),
          volume24H: raw.volume24H ?? '0',
          openInterest: raw.openInterest ?? '0',
          nextFundingRate: raw.nextFundingRate ?? '0',
          nextFundingAt: raw.nextFundingAt ?? '',
          initialMarginFraction: raw.initialMarginFraction ?? '0',
          maintenanceMarginFraction: raw.maintenanceMarginFraction ?? '0',
          clobPairId: raw.clobPairId,
          marketId: raw.marketId,
          status: raw.status ?? 'ACTIVE',
          marketType: raw.marketType ?? 'CROSS',
          tickSize: raw.tickSize,
          stepSize: raw.stepSize,
          atomicResolution: raw.atomicResolution,
          quantumConversionExponent: raw.quantumConversionExponent,
          stepBaseQuantums: raw.stepBaseQuantums,
          subticksPerTick: raw.subticksPerTick,
          openInterestLowerCap: raw.openInterestLowerCap,
          openInterestUpperCap: raw.openInterestUpperCap,
          baseOpenInterest: raw.baseOpenInterest,
          defaultFundingRate1H: raw.defaultFundingRate1H,
          lastUpdate: now,
        };
        snapshotMap.set(ticker, m);
        marketMap.set(ticker, m);
      }

      set({
        marketsSnapshot: snapshotMap,
        markets: marketMap,
        updateTrigger: useWebSocketStore.getState().updateTrigger + 1,
      });
    },

    updateTrades: (market, data) => {
      set(state => {
        const newMap = new Map(state.trades);
        newMap.set(market, { ...newMap.get(market), ...data } as TradeData);
        return { trades: newMap };
      });
    },

    updateCandles: (key, data) => {
      set(state => {
        const newMap = new Map(state.candles);
        newMap.set(key, { ...newMap.get(key), ...data } as CandleData);
        return { candles: newMap };
      });
    },

    // Cleanup

    cleanup: () => {
      const { subscriptionRefs, unsubTimers } = get();

      unsubTimers.forEach(timer => clearTimeout(timer));
      subscriptionRefs.forEach((unsubscribe, key) => {
        try {
          unsubscribe();
        } catch (error) {
          console.error(`[WSStore] Cleanup error for ${key}:`, error);
        }
      });

      set({
        parentSubaccounts: new Map(),
        markets: new Map(),
        marketsSnapshot: null,
        trades: new Map(),
        candles: new Map(),
        positionPnl: new Map(),
        activeSubscriptions: new Set(),
        subscriptionRefs: new Map(),
        subscriptionCounts: new Map(),
        unsubTimers: new Map(),
        updateTrigger: 0,
        optimisticFreeCollateralDelta: 0,
        connectionStatus: 'disconnected',
      });
    },
  }))
);

webSocketManager.onConnect(() =>
  useWebSocketStore.setState({ isConnected: true, connectionStatus: 'connected' })
);
webSocketManager.onDisconnect(() =>
  useWebSocketStore.setState({ isConnected: false, connectionStatus: 'disconnected' })
);

export function selectOpenOrders(data: ParentSubaccountData | undefined): TrackedOrder[] {
  if (!data) return [];
  return data.orders.filter(o => OPEN_STATUSES.has(o.status));
}

export function selectPortfolioMetrics(
  data: ParentSubaccountData | undefined,
  optimisticDelta: number = 0,
  marketsSnapshot?: Map<string, MarketData>,
  leverages: Record<string, number> = {}
): {
  portfolioValue: number;
  availableBalance: number;
  crossEquity: number;
  crossFreeCollateral: number;
  marginUsed: number;
  marginUsagePercent: number;
  isolatedEquity: number;
} | null {
  if (!data || !data.lastUpdate) return null;

  let crossEquityValue = 0;
  let crossMarginUsed = 0;
  let isolatedEquitySum = 0;

  (data.childSubaccounts ?? []).forEach(child => {
    let childEquity = 0;

    Object.values(child.assetPositions || {}).forEach(asset => {
      const size = parseFloat(asset.size || '0');
      const isShort = asset.side === 'SHORT';
      childEquity += isShort ? -size : size;
    });

    Object.values(child.openPerpetualPositions || {}).forEach(pos => {
      const mktData = marketsSnapshot?.get(pos.market);
      if (!mktData) return;
      const size = parseFloat(pos.size || '0');
      const oraclePrice = parseFloat(mktData.oraclePrice || '0');

      const posValue = size * oraclePrice;
      childEquity += posValue;

      if (child.subaccountNumber === 0) {
        const leverage =
          (pos.leverage ? parseFloat(pos.leverage) : 0) || leverages[pos.market] || 0;
        if (leverage > 0) {
          crossMarginUsed += (Math.abs(size) * oraclePrice) / leverage;
        } else {
          const imf = parseFloat(mktData.initialMarginFraction || '0.05');
          crossMarginUsed += Math.abs(size) * oraclePrice * imf;
        }
      }
    });

    if (child.subaccountNumber === 0) {
      crossEquityValue = childEquity;
    } else if (child.subaccountNumber >= ISOLATED_SUBACCOUNT_START) {
      isolatedEquitySum += childEquity;
    }
  });

  const availableBalance = Math.max(0, crossEquityValue - crossMarginUsed - optimisticDelta);
  const marginUsagePercent =
    crossEquityValue > 0
      ? Math.min(100, Math.max(0, (crossMarginUsed / crossEquityValue) * 100))
      : 0;

  return {
    portfolioValue: crossEquityValue + isolatedEquitySum,
    availableBalance,
    crossEquity: crossEquityValue,
    crossFreeCollateral: availableBalance,
    marginUsed: crossMarginUsed,
    marginUsagePercent,
    isolatedEquity: isolatedEquitySum,
  };
}
