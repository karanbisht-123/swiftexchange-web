import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  BinanceBridgeService,
  getBinanceInterval,
  getBinanceSymbol,
  isBinanceFailed,
  isBinanceSupported,
  isFlippedPair,
} from '../binanceBridgeService';

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  url: string;
  readyState: number = 0; // CONNECTING
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((event: any) => void) | null = null;
  onerror: ((err: any) => void) | null = null;
  sentMessages: string[] = [];

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
    setTimeout(() => {
      this.readyState = 1; // OPEN
      if (this.onopen) this.onopen();
    }, 0);
  }

  send(data: string) {
    this.sentMessages.push(data);
  }

  close() {
    this.readyState = 3; // CLOSED
    if (this.onclose) this.onclose();
  }
}

let mockTime = 1700000000000;

describe('binanceBridgeService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTime += 10 * 60 * 1000; // Advance past 5-min BINANCE_RETRY_WINDOW
    vi.spyOn(Date, 'now').mockImplementation(() => mockTime);
    MockWebSocket.instances = [];
    vi.stubGlobal('WebSocket', MockWebSocket);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('Symbol Resolution and Utilities', () => {
    it('resolves correct Binance symbol for direct and native pairs', () => {
      expect(getBinanceSymbol('XLM', 'USDT')).toBe('XLMUSDT');
      expect(getBinanceSymbol('NATIVE', 'USDT')).toBe('XLMUSDT');
      expect(getBinanceSymbol('USDT', 'XLM')).toBe('XLMUSDT');
      expect(getBinanceSymbol('BTC', 'USDT')).toBe('BTCUSDT');
      expect(getBinanceSymbol('UNKNOWN', 'COIN')).toBeNull();
    });

    it('identifies if pair is supported on Binance', () => {
      expect(isBinanceSupported('XLM', 'USDT')).toBe(true);
      expect(isBinanceSupported('ETH', 'BTC')).toBe(true);
      expect(isBinanceSupported('UNSUPPORTED', 'TOKEN')).toBe(false);
    });

    it('identifies flipped pairs correctly', () => {
      // XLM / USDT has symbol XLMUSDT -> starts with XLM, not flipped
      expect(isFlippedPair('XLM', 'USDT')).toBe(false);
      // USDT / XLM has symbol XLMUSDT -> starts with XLM, base is USDT => flipped!
      expect(isFlippedPair('USDT', 'XLM')).toBe(true);
      expect(isFlippedPair('NATIVE', 'USDT')).toBe(false);
      expect(isFlippedPair('UNKNOWN', 'PAIR')).toBe(false);
    });

    it('maps resolution in milliseconds to Binance interval strings', () => {
      expect(getBinanceInterval(60000)).toBe('1m');
      expect(getBinanceInterval(300000)).toBe('5m');
      expect(getBinanceInterval(900000)).toBe('15m');
      expect(getBinanceInterval(3600000)).toBe('1h');
      expect(getBinanceInterval(86400000)).toBe('1d');
      expect(getBinanceInterval(604800000)).toBe('1w');
      expect(getBinanceInterval(12345)).toBe('1m'); // default fallback
    });

    it('checks if Binance is marked as failed', () => {
      expect(isBinanceFailed()).toBe(false);
    });
  });

  describe('BinanceBridgeService.fetchOrderBook', () => {
    it('fetches and formats normal (non-flipped) order book', async () => {
      const mockDepthData = {
        bids: [
          ['0.1200000', '100.0'],
          ['0.1190000', '250.0'],
        ],
        asks: [
          ['0.1210000', '150.0'],
          ['0.1220000', '300.0'],
        ],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockDepthData,
      });

      const book = await BinanceBridgeService.fetchOrderBook('XLMUSDT', false, 20);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.binance.com/api/v3/depth?symbol=XLMUSDT&limit=20'
      );
      expect(book.bids).toEqual([
        { price: '0.1200000', amount: '100.0' },
        { price: '0.1190000', amount: '250.0' },
      ]);
      expect(book.asks).toEqual([
        { price: '0.1210000', amount: '150.0' },
        { price: '0.1220000', amount: '300.0' },
      ]);
    });

    it('fetches and inverts flipped order book (asks become bids, bids become asks)', async () => {
      const mockDepthData = {
        bids: [['2.0', '10.0']], // Inverted: 1 / 2.0 = 0.5, amount = 10 * 2 = 20.0 (becomes ask)
        asks: [['4.0', '5.0']], // Inverted: 1 / 4.0 = 0.25, amount = 5 * 4 = 20.0 (becomes bid)
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockDepthData,
      });

      const book = await BinanceBridgeService.fetchOrderBook('XLMUSDT', true, 10);

      expect(book.bids[0].price).toBe('0.2500000');
      expect(book.bids[0].amount).toBe('20.0000000');
      expect(book.asks[0].price).toBe('0.5000000');
      expect(book.asks[0].amount).toBe('20.0000000');
    });

    it('handles HTTP errors and dispatches failure event', async () => {
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      });

      await expect(BinanceBridgeService.fetchOrderBook('XLMUSDT', false)).rejects.toThrow(
        'Binance HTTP error! status: 500'
      );
      expect(dispatchSpy).toHaveBeenCalled();
    });
  });

  describe('BinanceBridgeService.fetchRecentTrades', () => {
    it('fetches and maps non-flipped recent trades', async () => {
      const mockTrades = [
        {
          id: 1001,
          time: 1672531199000,
          price: '0.1250000',
          qty: '500.0',
          isBuyerMaker: false,
        },
      ];

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockTrades,
      });

      const trades = await BinanceBridgeService.fetchRecentTrades('XLMUSDT', false, 10);

      expect(trades).toHaveLength(1);
      expect(trades[0]).toEqual({
        id: '1001',
        time: new Date(1672531199000).toISOString(),
        price: '0.1250000',
        amount: '500.0',
        isBuy: true, // !isBuyerMaker (false -> true)
      });
    });

    it('inverts prices and flags for flipped recent trades', async () => {
      const mockTrades = [
        {
          id: 2002,
          time: 1672531200000,
          price: '2.0',
          qty: '10.0',
          isBuyerMaker: false,
        },
      ];

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockTrades,
      });

      const trades = await BinanceBridgeService.fetchRecentTrades('XLMUSDT', true, 10);

      expect(trades[0].id).toBe('2002');
      expect(trades[0].price).toBe('0.5000000'); // 1 / 2.0
      expect(trades[0].amount).toBe('20.0000000'); // 10 * 2.0
      expect(trades[0].isBuy).toBe(false); // Inverted isBuy
    });
  });

  describe('BinanceBridgeService.fetchTradeAggregations', () => {
    it('fetches and maps non-flipped klines / trade aggregations', async () => {
      const mockKline = [
        1672531200000, // openTime
        '0.120', // open
        '0.125', // high
        '0.118', // low
        '0.122', // close
        '1000', // baseVol
        1672531260000, // closeTime
        '120', // quoteVol
        50, // tradeCount
      ];

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [mockKline],
      });

      const data = await BinanceBridgeService.fetchTradeAggregations('XLMUSDT', false, '1m');

      expect(data).toHaveLength(1);
      expect(data[0]).toEqual({
        timestamp: 1672531200000,
        open: '0.120',
        high: '0.125',
        low: '0.118',
        close: '0.122',
        volume: '1120',
        baseVolume: '1000',
        counterVolume: '120',
        tradeCount: 50,
      });
    });

    it('inverts high/low and volumes for flipped trade aggregations', async () => {
      const mockKline = [
        1672531200000,
        '2.0', // open
        '4.0', // high
        '1.0', // low
        '2.5', // close
        '50', // baseVol
        1672531260000,
        '100', // quoteVol
        10,
      ];

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [mockKline],
      });

      const data = await BinanceBridgeService.fetchTradeAggregations('XLMUSDT', true, '1m');

      expect(data[0].timestamp).toBe(1672531200000);
      expect(data[0].open).toBe((1 / 2.0).toString()); // 0.5
      expect(data[0].high).toBe((1 / 1.0).toString()); // Inverted: 1 / low = 1.0
      expect(data[0].low).toBe((1 / 4.0).toString()); // Inverted: 1 / high = 0.25
      expect(data[0].close).toBe((1 / 2.5).toString()); // 0.4
      expect(data[0].baseVolume).toBe('100'); // swapped quoteVol
      expect(data[0].counterVolume).toBe('50'); // swapped baseVol
    });
  });

  describe('WebSocket Streaming Subscription and Teardown', () => {
    it('subscribes to orderbook stream and allows unsubscription', () => {
      const onUpdate = vi.fn();
      const unsubscribe = BinanceBridgeService.streamOrderBook('XLMUSDT', false, onUpdate);

      expect(typeof unsubscribe).toBe('function');
      expect(MockWebSocket.instances.length).toBeGreaterThanOrEqual(1);

      unsubscribe();
    });

    it('subscribes to recent trades stream and allows unsubscription', () => {
      const onTrade = vi.fn();
      const unsubscribe = BinanceBridgeService.streamRecentTrades('XLMUSDT', false, onTrade);

      expect(typeof unsubscribe).toBe('function');
      unsubscribe();
    });

    it('subscribes to kline aggregations stream and allows unsubscription', () => {
      const onData = vi.fn();
      const unsubscribe = BinanceBridgeService.streamTradeAggregations(
        'XLMUSDT',
        false,
        '1m',
        onData
      );

      expect(typeof unsubscribe).toBe('function');
      unsubscribe();
    });
  });
});
