import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  isMarketOrder,
  selectOpenAndGraceOrders,
  selectOpenOrders,
  selectPortfolioMetrics,
  selectRecentlyTerminalOrders,
  useWebSocketStore,
} from '../websocketStore';
import type { MarketData, ParentSubaccountData } from '../websocketStore';

const mockOnConnect = vi.fn();
const mockOnDisconnect = vi.fn();

vi.mock('../utils/WebSocketManager', () => ({
  webSocketManager: {
    onConnect: (cb: any) => mockOnConnect(cb),
    onDisconnect: (cb: any) => mockOnDisconnect(cb),
  },
}));

const mockSubscribeToParentSubaccounts = vi.fn(() => vi.fn());
const mockSubscribeToMarkets = vi.fn(() => vi.fn());
const mockSubscribeToTrades = vi.fn(() => vi.fn());
const mockSubscribeToCandles = vi.fn(() => vi.fn());

vi.mock('../../client/clients', () => ({
  getSocketClient: () => ({
    subscribeToParentSubaccounts: mockSubscribeToParentSubaccounts,
    subscribeToMarkets: mockSubscribeToMarkets,
    subscribeToTrades: mockSubscribeToTrades,
    subscribeToCandles: mockSubscribeToCandles,
  }),
}));

describe('websocketStore', () => {
  beforeEach(() => {
    useWebSocketStore.setState({
      isConnected: false,
      connectionStatus: 'disconnected',
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
    });
    vi.restoreAllMocks();
  });

  describe('isMarketOrder', () => {
    it('returns true for MARKET type orders', () => {
      expect(isMarketOrder({ type: 'MARKET', timeInForce: 'GTT', orderFlags: '0' })).toBe(true);
    });

    it('returns true for IOC orders with orderFlags equal to 0', () => {
      expect(isMarketOrder({ type: 'LIMIT', timeInForce: 'IOC', orderFlags: '0' })).toBe(true);
    });

    it('returns false for other order types and flag configurations', () => {
      expect(isMarketOrder({ type: 'LIMIT', timeInForce: 'GTT', orderFlags: '0' })).toBe(false);
      expect(isMarketOrder({ type: 'LIMIT', timeInForce: 'IOC', orderFlags: '64' })).toBe(false);
    });
  });

  describe('selectOpenOrders', () => {
    it('hides BEST_EFFORT_OPENED orders until ORDER_APPEARANCE_DELAY_MS elapses', () => {
      vi.useFakeTimers();
      const now = Date.now();
      const data: ParentSubaccountData = {
        address: '0xAddress',
        parentSubaccountNumber: 0,
        equity: '100',
        freeCollateral: '100',
        childSubaccounts: [],
        orders: [
          {
            id: '1',
            side: 'BUY',
            size: '1',
            price: '100',
            type: 'LIMIT',
            status: 'BEST_EFFORT_OPENED',
            _msgId: 1,
            _firstSeenAt: now,
          },
          {
            id: '2',
            side: 'BUY',
            size: '1',
            price: '100',
            type: 'LIMIT',
            status: 'OPEN',
            _msgId: 1,
            _firstSeenAt: now,
          },
        ],
        fills: [],
        transfers: [],
        blockHeight: '1',
        lastUpdate: now,
      };

      expect(selectOpenOrders(data)).toEqual([data.orders[1]]);

      vi.advanceTimersByTime(800);
      expect(selectOpenOrders(data)).toEqual([data.orders[0], data.orders[1]]);
      vi.useRealTimers();
    });
  });

  describe('selectOpenAndGraceOrders', () => {
    it('returns open orders and terminal market orders within grace period', () => {
      vi.useFakeTimers();
      const now = Date.now();
      const data: ParentSubaccountData = {
        address: '0xAddress',
        parentSubaccountNumber: 0,
        equity: '100',
        freeCollateral: '100',
        childSubaccounts: [],
        orders: [
          {
            id: '1',
            side: 'BUY',
            size: '1',
            price: '100',
            type: 'MARKET',
            status: 'CANCELED',
            _msgId: 1,
            _terminalAt: now,
          },
          {
            id: '2',
            side: 'BUY',
            size: '1',
            price: '100',
            type: 'LIMIT',
            status: 'OPEN',
            _msgId: 1,
            _firstSeenAt: now,
          },
        ],
        fills: [],
        transfers: [],
        blockHeight: '1',
        lastUpdate: now,
      };

      expect(selectOpenAndGraceOrders(data)).toEqual([data.orders[0], data.orders[1]]);

      vi.advanceTimersByTime(3500);
      expect(selectOpenAndGraceOrders(data)).toEqual([data.orders[1]]);
      vi.useRealTimers();
    });
  });

  describe('selectRecentlyTerminalOrders', () => {
    it('returns only terminal market orders within grace period', () => {
      vi.useFakeTimers();
      const now = Date.now();
      const data: ParentSubaccountData = {
        address: '0xAddress',
        parentSubaccountNumber: 0,
        equity: '100',
        freeCollateral: '100',
        childSubaccounts: [],
        orders: [
          {
            id: '1',
            side: 'BUY',
            size: '1',
            price: '100',
            type: 'MARKET',
            status: 'FILLED',
            _msgId: 1,
            _terminalAt: now,
          },
          {
            id: '2',
            side: 'BUY',
            size: '1',
            price: '100',
            type: 'LIMIT',
            status: 'OPEN',
            _msgId: 1,
            _firstSeenAt: now,
          },
        ],
        fills: [],
        transfers: [],
        blockHeight: '1',
        lastUpdate: now,
      };

      expect(selectRecentlyTerminalOrders(data)).toEqual([data.orders[0]]);

      vi.advanceTimersByTime(3500);
      expect(selectRecentlyTerminalOrders(data)).toEqual([]);
      vi.useRealTimers();
    });
  });

  describe('selectPortfolioMetrics', () => {
    it('calculates portfolio metrics for cross and isolated subaccounts', () => {
      const markets = new Map<string, MarketData>([
        [
          'BTC-USD',
          {
            ticker: 'BTC-USD',
            oraclePrice: '50000',
            priceChange24H: '0',
            trades24H: '0',
            volume24H: '0',
            openInterest: '0',
            nextFundingRate: '0',
            initialMarginFraction: '0.05',
            lastUpdate: Date.now(),
          },
        ],
      ]);

      const data: ParentSubaccountData = {
        address: '0xAddress',
        parentSubaccountNumber: 0,
        equity: '10000',
        freeCollateral: '10000',
        blockHeight: '1',
        lastUpdate: Date.now(),
        orders: [],
        fills: [],
        transfers: [],
        childSubaccounts: [
          {
            address: '0xAddress',
            subaccountNumber: 0,
            equity: '5000',
            freeCollateral: '5000',
            marginEnabled: true,
            updatedAtHeight: '1',
            latestProcessedBlockHeight: '1',
            assetPositions: {
              USDC: {
                size: '1000',
                symbol: 'USDC',
                side: 'LONG',
                assetId: 'USDC',
                subaccountNumber: 0,
              },
            },
            openPerpetualPositions: {
              'BTC-USD': {
                market: 'BTC-USD',
                status: 'OPEN',
                side: 'LONG',
                size: '0.1',
                maxSize: '0.1',
                entryPrice: '50000',
                exitPrice: null,
                realizedPnl: '0',
                unrealizedPnl: '0',
                closedAt: null,
                sumOpen: '0.1',
                sumClose: '0',
                netFunding: '0',
                subaccountNumber: 0,
                createdAt: '0',
                createdAtHeight: '0',
              },
            },
          },
          {
            address: '0xAddress',
            subaccountNumber: 128,
            equity: '3000',
            freeCollateral: '3000',
            marginEnabled: true,
            updatedAtHeight: '1',
            latestProcessedBlockHeight: '1',
            assetPositions: {
              USDC: {
                size: '3000',
                symbol: 'USDC',
                side: 'LONG',
                assetId: 'USDC',
                subaccountNumber: 128,
              },
            },
            openPerpetualPositions: {},
          },
        ],
      };

      const metrics = selectPortfolioMetrics(data, 0, markets);
      expect(metrics).not.toBeNull();
      expect(metrics!.portfolioValue).toBe(9000);
      expect(metrics!.crossEquity).toBe(6000);
      expect(metrics!.isolatedEquity).toBe(3000);
      expect(metrics!.marginUsed).toBe(250);
      expect(metrics!.availableBalance).toBe(5750);
      expect(metrics!.marginUsagePercent).toBeCloseTo(4.167, 3);
    });
  });

  describe('Store Actions', () => {
    describe('subscribeToParentSubaccount', () => {
      it('registers connection subscriptions and implements reference counting', () => {
        const store = useWebSocketStore.getState();
        store.subscribeToParentSubaccount('address1', 0);

        expect(mockSubscribeToParentSubaccounts).toHaveBeenCalledTimes(1);
        expect(mockSubscribeToParentSubaccounts).toHaveBeenCalledWith(
          'address1',
          0,
          expect.any(Function)
        );

        // Subscribing again shouldn't invoke another network subscription
        store.subscribeToParentSubaccount('address1', 0);
        expect(mockSubscribeToParentSubaccounts).toHaveBeenCalledTimes(1);
      });

      it('cancels delayed unsubscribes if resubscribed inside the window', () => {
        vi.useFakeTimers();
        const store = useWebSocketStore.getState();

        store.subscribeToParentSubaccount('address1', 0);
        store.unsubscribeFromParentSubaccount('address1', 0);

        // Resubscribe within the window
        store.subscribeToParentSubaccount('address1', 0);

        vi.advanceTimersByTime(4000);
        const refMap = useWebSocketStore.getState().activeSubscriptions;
        expect(refMap.has('parent_subaccount_address1_0')).toBe(true);
        vi.useRealTimers();
      });
    });

    describe('updateParentSubaccount', () => {
      it('merges partial subaccount updates and clears optimistic delta', () => {
        const store = useWebSocketStore.getState();
        store.applyOptimisticMarginDeduction(150);
        expect(useWebSocketStore.getState().optimisticFreeCollateralDelta).toBe(150);

        store.updateParentSubaccount('key1', {
          address: 'address1',
          freeCollateral: '400',
        });

        const account = useWebSocketStore.getState().parentSubaccounts.get('key1');
        expect(account).toBeDefined();
        expect(account!.address).toBe('address1');
        expect(account!.freeCollateral).toBe('400');
        expect(useWebSocketStore.getState().optimisticFreeCollateralDelta).toBe(0);
      });
    });

    describe('updateMarket / updateMarkets', () => {
      it('does not trigger state change or updateTrigger increment when market data is unchanged', () => {
        const store = useWebSocketStore.getState();
        store.updateMarket('BTC-USD', {
          oraclePrice: '50000',
          volume24H: '1000',
          nextFundingRate: '0.01',
          openInterest: '500',
          priceChange24H: '10',
        });

        const initialTrigger = useWebSocketStore.getState().updateTrigger;

        // Update with identical values
        store.updateMarket('BTC-USD', {
          oraclePrice: '50000',
          volume24H: '1000',
          nextFundingRate: '0.01',
          openInterest: '500',
          priceChange24H: '10',
        });

        expect(useWebSocketStore.getState().updateTrigger).toBe(initialTrigger);
      });
    });

    describe('initializeMarketsFromSnapshot', () => {
      it('initializes map metrics completely from RawMarketSnapshot snapshot data', () => {
        const store = useWebSocketStore.getState();
        store.initializeMarketsFromSnapshot({
          'ETH-USD': {
            oraclePrice: '3000',
            status: 'ACTIVE',
            trades24H: '150',
          },
        });

        const mkt = useWebSocketStore.getState().markets.get('ETH-USD');
        expect(mkt).toBeDefined();
        expect(mkt!.oraclePrice).toBe('3000');
        expect(mkt!.status).toBe('ACTIVE');
        expect(mkt!.trades24H).toBe('150');
      });
    });

    describe('cleanup', () => {
      it('clears active subscription references, timers and resets state', () => {
        vi.useFakeTimers();
        const store = useWebSocketStore.getState();
        store.subscribeToParentSubaccount('address1', 0);
        store.unsubscribeFromParentSubaccount('address1', 0);

        store.cleanup();

        const s = useWebSocketStore.getState();
        expect(s.parentSubaccounts.size).toBe(0);
        expect(s.subscriptionCounts.size).toBe(0);
        expect(s.unsubTimers.size).toBe(0);
        vi.useRealTimers();
      });
    });
  });
});
