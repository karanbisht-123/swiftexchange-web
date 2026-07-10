import { beforeEach, describe, expect, it } from 'vitest';

import type { MarketData } from '../../types/trading.types';
import useMarketStore from '../marketStore';

describe('marketStore', () => {
  beforeEach(() => {
    useMarketStore.setState({
      selectedMarket: 'BTC-USD',
      selectedMarketData: null,
      marketCache: {},
      lastUpdate: 0,
    });
  });

  const mockMarketData: MarketData = {
    ticker: 'BTC-USD',
    oraclePrice: '50000',
    priceChange24H: '0',
    priceChange24HPercent: '0',
    trades24H: 0,
    volume24H: '1000',
    openInterest: '500',
    nextFundingRate: '0.001',
    nextFundingAt: '0',
    initialMarginFraction: '0.05',
    coinIcon: '',
    status: 'ACTIVE',
    baseAsset: 'BTC',
    quoteAsset: 'USD',
  };

  describe('setSelectedMarket', () => {
    it('sets selectedMarket and falls back to cached data', () => {
      useMarketStore.setState({
        marketCache: {
          'BTC-USD': mockMarketData,
        },
      });

      const store = useMarketStore.getState();
      store.setSelectedMarket('BTC-USD');

      expect(useMarketStore.getState().selectedMarket).toBe('BTC-USD');
      expect(useMarketStore.getState().selectedMarketData).toEqual(mockMarketData);
    });

    it('sets selectedMarketData to null if market is not cached', () => {
      const store = useMarketStore.getState();
      store.setSelectedMarket('ETH-USD');

      expect(useMarketStore.getState().selectedMarket).toBe('ETH-USD');
      expect(useMarketStore.getState().selectedMarketData).toBeNull();
    });
  });

  describe('updateMarketData', () => {
    it('updates cache and conditionally updates selectedMarketData', () => {
      const store = useMarketStore.getState();
      store.setSelectedMarket('BTC-USD');

      store.updateMarketData(mockMarketData);

      const state = useMarketStore.getState();
      expect(state.marketCache['BTC-USD']).toEqual(mockMarketData);
      expect(state.selectedMarketData).toEqual(mockMarketData);
      expect(state.lastUpdate).toBeGreaterThan(0);
    });

    it('updates cache only if ticker does not match selectedMarket', () => {
      const store = useMarketStore.getState();
      store.setSelectedMarket('ETH-USD');

      store.updateMarketData(mockMarketData);

      const state = useMarketStore.getState();
      expect(state.marketCache['BTC-USD']).toEqual(mockMarketData);
      expect(state.selectedMarketData).toBeNull(); // remains null because we selected ETH-USD
    });
  });

  describe('updateMarketCache', () => {
    it('updates cache in bulk and conditionally updates selectedMarketData', () => {
      const store = useMarketStore.getState();
      store.setSelectedMarket('BTC-USD');

      store.updateMarketCache({
        'BTC-USD': mockMarketData,
        'ETH-USD': { ...mockMarketData, ticker: 'ETH-USD', oraclePrice: '3000' },
      });

      const state = useMarketStore.getState();
      expect(state.marketCache['BTC-USD']).toEqual(mockMarketData);
      expect(state.marketCache['ETH-USD']!.oraclePrice).toBe('3000');
      expect(state.selectedMarketData).toEqual(mockMarketData);
    });
  });

  describe('clearCache', () => {
    it('clears marketCache and lastUpdate but preserves selectedMarket', () => {
      useMarketStore.setState({
        selectedMarket: 'BTC-USD',
        marketCache: { 'BTC-USD': mockMarketData },
        lastUpdate: 12345,
      });

      const store = useMarketStore.getState();
      store.clearCache();

      const state = useMarketStore.getState();
      expect(state.selectedMarket).toBe('BTC-USD');
      expect(state.marketCache).toEqual({});
      expect(state.lastUpdate).toBe(0);
    });
  });
});
