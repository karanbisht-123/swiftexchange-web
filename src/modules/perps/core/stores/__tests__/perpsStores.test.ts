import { beforeEach, describe, expect, it } from 'vitest';

import { leverageStore, useLeverageStore } from '../leverageStore';
import { marketStore, useMarketStore } from '../marketStore';
import { useOrderEntryStore } from '../orderEntryStore';
import { useOrderStore } from '../orderStore';
import { usePositionStore } from '../positionStore';

describe('Perps Core Stores', () => {
  beforeEach(() => {
    useMarketStore.setState({ markets: {}, selectedSymbol: 'BTC-USDT' });
    useLeverageStore.setState({ bracketsBySymbol: {} });
    usePositionStore.setState({ positions: {} });
    useOrderStore.setState({ orders: {} });
    useOrderEntryStore.getState().reset();
  });

  describe('marketStore', () => {
    const mockMarkets = [
      {
        symbol: 'BTC-USDT',
        baseAsset: 'BTC',
        quoteAsset: 'USDT',
        tickSize: 0.1,
        stepSize: 0.001,
        minOrderSize: 0.001,
        maxLeverage: 50,
      },
      {
        symbol: 'ETH-USDT',
        baseAsset: 'ETH',
        quoteAsset: 'USDT',
        tickSize: 0.01,
        stepSize: 0.01,
        minOrderSize: 0.01,
        maxLeverage: 25,
      },
    ];

    it('sets markets and indexes them by symbol', () => {
      marketStore.setMarkets(mockMarkets);

      expect(marketStore.isHydrated()).toBe(true);
      expect(marketStore.getAllMarkets()).toHaveLength(2);
      expect(marketStore.getMarket('BTC-USDT')?.baseAsset).toBe('BTC');
      expect(marketStore.getMarket('ETH-USDT')?.baseAsset).toBe('ETH');
    });

    it('updates selected symbol and guards against duplicate updates', () => {
      marketStore.setSelectedSymbol('SOL-USDT');
      expect(marketStore.getSelectedSymbol()).toBe('SOL-USDT');

      // Duplicate call should be a no-op
      marketStore.setSelectedSymbol('SOL-USDT');
      expect(marketStore.getSelectedSymbol()).toBe('SOL-USDT');
    });
  });

  describe('leverageStore', () => {
    it('sets and retrieves leverage brackets by symbol', () => {
      const mockBrackets = [
        {
          bracket: 1,
          initialLeverage: 50,
          notionalCap: 50000,
          notionalFloor: 0,
          maintMarginRatio: 0.01,
          cum: 0,
        },
        {
          bracket: 2,
          initialLeverage: 20,
          notionalCap: 250000,
          notionalFloor: 50000,
          maintMarginRatio: 0.025,
          cum: 750,
        },
      ];

      useLeverageStore.getState().setBrackets('BTC-USDT', mockBrackets);

      expect(leverageStore.getBrackets('BTC-USDT')).toEqual(mockBrackets);
      expect(leverageStore.getMaxLeverage('BTC-USDT')).toBe(50);
    });

    it('returns default fallback of 20 when no brackets exist', () => {
      expect(leverageStore.getBrackets('UNKNOWN')).toEqual([]);
      expect(leverageStore.getMaxLeverage('UNKNOWN')).toBe(20);
    });
  });

  describe('positionStore', () => {
    const mockPosition = {
      symbol: 'BTC-USDT',
      size: '1.5',
      entryPrice: '65000',
      markPrice: '66000',
      liquidationPrice: '52000',
      unrealizedPnl: '1500',
      leverage: 10,
      marginType: 'cross' as const,
      isolatedMargin: '0',
    };

    it('sets, updates, and removes positions', () => {
      const store = usePositionStore.getState();

      store.setPositions([mockPosition]);
      expect(usePositionStore.getState().getPosition('BTC-USDT')).toEqual(mockPosition);

      // Update position
      const updated = { ...mockPosition, size: '2.0', unrealizedPnl: '2000' };
      usePositionStore.getState().updatePosition(updated);
      expect(usePositionStore.getState().getPosition('BTC-USDT')?.size).toBe('2.0');

      // Remove position
      usePositionStore.getState().removePosition('BTC-USDT');
      expect(usePositionStore.getState().getPosition('BTC-USDT')).toBeUndefined();
    });
  });

  describe('orderStore', () => {
    const mockOrder1 = {
      id: 'ord-1',
      symbol: 'BTC-USDT',
      type: 'limit' as const,
      side: 'buy' as const,
      price: '64000',
      size: '1.0',
      filledSize: '0',
      status: 'new' as const,
      reduceOnly: false,
      timestamp: 1710000000000,
    };

    const mockOrder2 = {
      id: 'ord-2',
      symbol: 'BTC-USDT',
      type: 'limit' as const,
      side: 'buy' as const,
      price: '63000',
      size: '1.0',
      filledSize: '1.0',
      status: 'filled' as const,
      reduceOnly: false,
      timestamp: 1710000010000,
    };

    it('filters open orders correctly based on status', () => {
      useOrderStore.getState().setOrders([mockOrder1, mockOrder2]);

      const openOrders = useOrderStore.getState().getOpenOrders();
      expect(openOrders).toHaveLength(1);
      expect(openOrders[0].id).toBe('ord-1');

      // Update order to partially_filled
      useOrderStore.getState().updateOrder({ ...mockOrder1, status: 'partially_filled' as any });
      expect(useOrderStore.getState().getOpenOrders()).toHaveLength(1);

      // Remove order
      useOrderStore.getState().removeOrder('ord-1');
      expect(useOrderStore.getState().getOpenOrders()).toHaveLength(0);
    });
  });

  describe('orderEntryStore', () => {
    it('manages order entry form state and resets cleanly', () => {
      const store = useOrderEntryStore.getState();

      store.setSide('SELL');
      store.setOrderType('MARKET');
      store.setSize('0.5');
      store.setPrice('67000');
      store.setLeverage(25);
      store.setMarginType('isolated');
      store.setReduceOnly(true);

      const state = useOrderEntryStore.getState();
      expect(state.side).toBe('SELL');
      expect(state.orderType).toBe('MARKET');
      expect(state.size).toBe('0.5');
      expect(state.price).toBe('67000');
      expect(state.leverage).toBe(25);
      expect(state.marginType).toBe('isolated');
      expect(state.isReduceOnly).toBe(true);

      // Reset
      useOrderEntryStore.getState().reset();
      const resetState = useOrderEntryStore.getState();
      expect(resetState.side).toBe('BUY');
      expect(resetState.orderType).toBe('MARKET');
      expect(resetState.size).toBe('');
      expect(resetState.price).toBe('');
      expect(resetState.isReduceOnly).toBe(false);
    });
  });
});
