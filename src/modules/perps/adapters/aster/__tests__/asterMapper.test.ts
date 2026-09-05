import { describe, expect, it } from 'vitest';

import { AsterMapper } from '../mapper';

describe('AsterMapper', () => {
  describe('mapMarket', () => {
    it('maps exchange info symbol with filters to Market model', () => {
      const asterSymbol = {
        symbol: 'BTCUSDT',
        baseAsset: 'BTC',
        quoteAsset: 'USDT',
        filters: [
          { filterType: 'PRICE_FILTER', tickSize: '0.10' },
          { filterType: 'LOT_SIZE', stepSize: '0.001', minQty: '0.002' },
          { filterType: 'MIN_NOTIONAL', notional: '5.0' },
        ],
      };

      const market = AsterMapper.mapMarket(asterSymbol);

      expect(market).toEqual({
        symbol: 'BTC-USDT',
        baseAsset: 'BTC',
        quoteAsset: 'USDT',
        tickSize: 0.1,
        stepSize: 0.001,
        minOrderSize: 0.002,
        minNotional: 5.0,
        maxLeverage: 50,
      });
    });

    it('falls back gracefully when filters or asset names are omitted', () => {
      const minimalSymbol = {
        symbol: 'ETHUSDT',
      };

      const market = AsterMapper.mapMarket(minimalSymbol);

      expect(market.symbol).toBe('ETH-USDT');
      expect(market.baseAsset).toBe('ETH');
      expect(market.quoteAsset).toBe('USDT');
      expect(market.tickSize).toBe(0);
      expect(market.stepSize).toBe(0);
      expect(market.minOrderSize).toBe(0);
      expect(market.minNotional).toBe(0);
      expect(market.maxLeverage).toBe(50);
    });
  });

  describe('mapOrderBook', () => {
    it('maps bids, asks and lastUpdateId', () => {
      const asterDepth = {
        lastUpdateId: 12345678,
        bids: [
          ['65000.0', '1.5'],
          ['64990.0', '2.0'],
        ],
        asks: [
          ['65010.0', '0.8'],
          ['65020.0', '1.2'],
        ],
      };

      const ob = AsterMapper.mapOrderBook('BTC-USDT', asterDepth);

      expect(ob.symbol).toBe('BTC-USDT');
      expect(ob.updateId).toBe(12345678);
      expect(ob.bids).toEqual([
        { price: '65000.0', size: '1.5' },
        { price: '64990.0', size: '2.0' },
      ]);
      expect(ob.asks).toEqual([
        { price: '65010.0', size: '0.8' },
        { price: '65020.0', size: '1.2' },
      ]);
    });

    it('handles missing bids, asks, and alternate u updateId field', () => {
      const ob = AsterMapper.mapOrderBook('ETH-USDT', { u: 999 });

      expect(ob.updateId).toBe(999);
      expect(ob.bids).toEqual([]);
      expect(ob.asks).toEqual([]);
    });
  });

  describe('mapTrade', () => {
    it('maps REST trade format with buyer as maker (sell taker)', () => {
      const restTrade = {
        id: 1001,
        price: '65000.5',
        qty: '0.05',
        time: 1710000000000,
        isBuyerMaker: true,
      };

      const trade = AsterMapper.mapTrade(restTrade);

      expect(trade).toEqual({
        id: '1001',
        symbol: 'UNKNOWN',
        price: '65000.5',
        size: '0.05',
        side: 'sell',
        timestamp: 1710000000000,
      });
    });

    it('maps WS aggTrade format with buyer not maker (buy taker)', () => {
      const wsTrade = {
        a: 8888,
        s: 'BTCUSDT',
        p: '65100.0',
        q: '1.2',
        T: 1710000050000,
        m: false,
      };

      const trade = AsterMapper.mapTrade(wsTrade);

      expect(trade).toEqual({
        id: '8888',
        symbol: 'BTCUSDT',
        price: '65100.0',
        size: '1.2',
        side: 'buy',
        timestamp: 1710000050000,
      });
    });
  });

  describe('mapTicker and mapMarkPrice', () => {
    it('maps 24h ticker stats correctly', () => {
      const asterTicker = {
        c: '65000.00',
        o: '63000.00',
        q: '15000000.00',
        fundingRate: '0.0001',
      };

      const ticker = AsterMapper.mapTicker(asterTicker);

      expect(ticker.markPx).toBe('65000.00');
      expect(ticker.prevDayPx).toBe('63000.00');
      expect(ticker.dayNtlVlm).toBe('15000000.00');
      expect(ticker.funding).toBe('0.0001');
    });

    it('maps mark price update correctly', () => {
      const asterMark = {
        p: '65050.2',
        i: '65045.0',
        r: '0.00015',
        T: 1710003600000,
      };

      const partial = AsterMapper.mapMarkPrice(asterMark);

      expect(partial.markPx).toBe('65050.2');
      expect(partial.oraclePx).toBe('65045.0');
      expect(partial.funding).toBe('0.00015');
      expect(partial.nextFundingTime).toBe(1710003600000);
    });
  });

  describe('mapCandle and mapLiveCandle', () => {
    it('maps REST Kline array into Candle format', () => {
      const klineArray = [
        1710000000000, // 0: Open time
        '65000.0', // 1: Open
        '65500.0', // 2: High
        '64900.0', // 3: Low
        '65200.0', // 4: Close
        '10.5', // 5: Volume
        1710000060000, // 6: Close time
        '685000.0', // 7: Quote asset volume
        250, // 8: Number of trades
      ];

      const candle = AsterMapper.mapCandle('BTC-USDT', '1m', klineArray);

      expect(candle.ticker).toBe('BTC-USDT');
      expect(candle.resolution).toBe('1m');
      expect(candle.open).toBe('65000.0');
      expect(candle.high).toBe('65500.0');
      expect(candle.low).toBe('64900.0');
      expect(candle.close).toBe('65200.0');
      expect(candle.baseTokenVolume).toBe('10.5');
      expect(candle.usdVolume).toBe('685000.0');
      expect(candle.trades).toBe(250);
      expect(candle.id).toBe('1710000000000');
    });

    it('maps live WS Kline payload into Candle format', () => {
      const wsKlinePayload = {
        k: {
          t: 1710000000000,
          s: 'ETHUSDT',
          i: '5m',
          o: '3500.0',
          h: '3520.0',
          l: '3490.0',
          c: '3515.0',
          v: '120.5',
          q: '422000.0',
          n: 45,
        },
      };

      const candle = AsterMapper.mapLiveCandle(wsKlinePayload);

      expect(candle.ticker).toBe('ETH-USDT');
      expect(candle.resolution).toBe('5m');
      expect(candle.open).toBe('3500.0');
      expect(candle.close).toBe('3515.0');
      expect(candle.trades).toBe(45);
    });
  });

  describe('mapPosition, mapOrder, mapAccountBalance, and mapUserTrade', () => {
    it('maps position with cross or isolated margin', () => {
      const pos = AsterMapper.mapPosition({
        symbol: 'BTCUSDT',
        positionAmt: '0.5',
        entryPrice: '64000.0',
        markPrice: '65000.0',
        liquidationPrice: '55000.0',
        unrealizedProfit: '500.0',
        leverage: '10',
        marginType: 'cross',
        isolatedMargin: '0',
      });

      expect(pos.symbol).toBe('BTC-USDT');
      expect(pos.size).toBe('0.5');
      expect(pos.marginType).toBe('cross');
      expect(pos.leverage).toBe(10);
      expect(pos.unrealizedPnl).toBe('500.0');
    });

    it('maps order with normalized side and type', () => {
      const order = AsterMapper.mapOrder({
        orderId: 777,
        symbol: 'SOLUSDT',
        type: 'LIMIT',
        side: 'BUY',
        price: '140.0',
        origQty: '5.0',
        executedQty: '2.5',
        status: 'PARTIALLY_FILLED',
        reduceOnly: false,
        time: 1710000000000,
      });

      expect(order.symbol).toBe('SOL-USDT');
      expect(order.type).toBe('limit');
      expect(order.side).toBe('buy');
      expect(order.status).toBe('partially_filled');
      expect(order.filledSize).toBe('2.5');
      expect(order.size).toBe('5.0');
    });

    it('maps account balance and computes locked funds', () => {
      const bal = AsterMapper.mapAccountBalance({
        asset: 'USDT',
        walletBalance: '1000.0',
        availableBalance: '850.0',
      });

      expect(bal.asset).toBe('USDT');
      expect(bal.total).toBe('1000.0');
      expect(bal.available).toBe('850.0');
      expect(bal.locked).toBe('150');
    });

    it('maps user trade execution fill', () => {
      const userTrade = AsterMapper.mapUserTrade({
        id: 9991,
        orderId: 777,
        symbol: 'BTCUSDT',
        side: 'BUY',
        price: '65000.0',
        qty: '0.1',
        commission: '0.065',
        commissionAsset: 'USDT',
        realizedPnl: '0',
        time: 1710000000000,
      });

      expect(userTrade.symbol).toBe('BTC-USDT');
      expect(userTrade.orderId).toBe('777');
      expect(userTrade.side).toBe('buy');
      expect(userTrade.fee).toBe('0.065');
      expect(userTrade.feeAsset).toBe('USDT');
    });
  });
});
