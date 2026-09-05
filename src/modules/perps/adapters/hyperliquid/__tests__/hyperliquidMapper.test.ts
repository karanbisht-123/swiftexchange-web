import { describe, expect, it } from 'vitest';

import {
  type HlCandle,
  type HlL2BookResponse,
  type HlMetaResponse,
  type HlTrade,
  HyperliquidMapper,
} from '../mapper';

describe('HyperliquidMapper', () => {
  describe('getNextFundingTime', () => {
    it('returns the next top-of-the-hour timestamp in the future', () => {
      const nextFunding = HyperliquidMapper.getNextFundingTime();
      const now = Date.now();

      expect(nextFunding).toBeGreaterThan(now);
      const date = new Date(nextFunding);
      expect(date.getUTCMinutes()).toBe(0);
      expect(date.getUTCSeconds()).toBe(0);
      expect(date.getUTCMilliseconds()).toBe(0);
    });
  });

  describe('mapMarkets', () => {
    it('maps universe metadata items into Market models', () => {
      const meta: HlMetaResponse = {
        universe: [
          { name: 'BTC', szDecimals: 4, maxLeverage: 50 },
          { name: 'ETH', szDecimals: 3, maxLeverage: 25 },
        ],
      };

      const markets = HyperliquidMapper.mapMarkets(meta);

      expect(markets).toHaveLength(2);
      expect(markets[0].symbol).toBe('BTC-USDC');
      expect(markets[0].baseAsset).toBe('BTC');
      expect(markets[0].quoteAsset).toBe('USDC');
      expect(markets[0].tickSize).toBeCloseTo(0.0001, 6);
      expect(markets[0].stepSize).toBeCloseTo(0.0001, 6);
      expect(markets[0].minOrderSize).toBeCloseTo(0.0001, 6);
      expect(markets[0].maxLeverage).toBe(50);

      expect(markets[1].symbol).toBe('ETH-USDC');
      expect(markets[1].baseAsset).toBe('ETH');
      expect(markets[1].quoteAsset).toBe('USDC');
      expect(markets[1].tickSize).toBeCloseTo(0.0001, 6);
      expect(markets[1].stepSize).toBeCloseTo(0.001, 6);
      expect(markets[1].minOrderSize).toBeCloseTo(0.001, 6);
      expect(markets[1].maxLeverage).toBe(25);
    });
  });

  describe('mapOrderBook', () => {
    it('maps L2 orderbook response into OrderBook model', () => {
      const book: HlL2BookResponse = {
        coin: 'BTC',
        time: 1710000000000,
        levels: [
          [
            { px: '65000.0', sz: '1.2', n: 3 },
            { px: '64990.0', sz: '0.8', n: 1 },
          ],
          [
            { px: '65010.0', sz: '2.1', n: 5 },
            { px: '65020.0', sz: '1.5', n: 2 },
          ],
        ],
      };

      const ob = HyperliquidMapper.mapOrderBook(book);

      expect(ob.symbol).toBe('BTC-USDC');
      expect(ob.updateId).toBe(1710000000000);
      expect(ob.bids).toEqual([
        { price: '65000.0', size: '1.2' },
        { price: '64990.0', size: '0.8' },
      ]);
      expect(ob.asks).toEqual([
        { price: '65010.0', size: '2.1' },
        { price: '65020.0', size: '1.5' },
      ]);
    });
  });

  describe('mapTrade', () => {
    it('maps trades with buy and sell direction', () => {
      const trades: HlTrade[] = [
        {
          coin: 'BTC',
          px: '65000.0',
          sz: '0.5',
          time: 1710000000000,
          hash: '0xabc123',
          dir: 'Buy',
        },
        {
          coin: 'BTC',
          px: '64995.0',
          sz: '0.2',
          time: 1710000005000,
          hash: '0xdef456',
          dir: 'Sell',
        },
      ];

      const mapped = HyperliquidMapper.mapTrade(trades);

      expect(mapped).toEqual([
        {
          id: '0xabc123',
          symbol: 'BTC-USDC',
          price: '65000.0',
          size: '0.5',
          side: 'buy',
          timestamp: 1710000000000,
        },
        {
          id: '0xdef456',
          symbol: 'BTC-USDC',
          price: '64995.0',
          size: '0.2',
          side: 'sell',
          timestamp: 1710000005000,
        },
      ]);
    });
  });

  describe('mapCandle', () => {
    it('maps candle array into Candle models with estimated USD volume', () => {
      const hlCandles: HlCandle[] = [
        {
          t: 1710000000000,
          T: 1710000060000,
          s: 'ETH',
          i: '1m',
          o: '3500.0',
          h: '3510.0',
          l: '3495.0',
          c: '3505.0',
          v: '10.0',
          n: 50,
        },
      ];

      const candles = HyperliquidMapper.mapCandle(hlCandles);

      expect(candles).toHaveLength(1);
      const c = candles[0];
      expect(c.ticker).toBe('ETH-USDC');
      expect(c.resolution).toBe('1m');
      expect(c.open).toBe('3500.0');
      expect(c.high).toBe('3510.0');
      expect(c.low).toBe('3495.0');
      expect(c.close).toBe('3505.0');
      expect(c.baseTokenVolume).toBe('10.0');
      expect(c.usdVolume).toBe('35050'); // 10.0 * 3505.0
      expect(c.trades).toBe(50);
      expect(c.id).toBe('1710000000000');
    });
  });

  describe('mapTickerFromTrade', () => {
    it('returns null when trades array is empty', () => {
      expect(HyperliquidMapper.mapTickerFromTrade([])).toBeNull();
      expect(HyperliquidMapper.mapTickerFromTrade(null as any)).toBeNull();
    });

    it('derives a ticker from the latest trade price', () => {
      const trades: HlTrade[] = [
        {
          coin: 'SOL',
          px: '145.5',
          sz: '5.0',
          time: 1710000000000,
          hash: '0xhash',
          dir: 'buy',
        },
      ];

      const ticker = HyperliquidMapper.mapTickerFromTrade(trades);

      expect(ticker).not.toBeNull();
      expect(ticker?.symbol).toBe('SOL-USDC');
      expect(ticker?.lastPrice).toBe('145.5');
      expect(ticker?.markPrice).toBe('0');
    });
  });
});
