import type { Market, OrderBook, Ticker, OrderBookLevel } from '../../core/models';

// Hyperliquid Internal Types 

export interface HlUniverseItem {
  name: string;
  szDecimals: number;
  maxLeverage: number;
}

export interface HlMetaResponse {
  universe: HlUniverseItem[];
}

export interface HlBookLevel {
  px: string;
  sz: string;
  n: number;
}

export interface HlL2BookResponse {
  coin: string;
  time: number;
  levels: [HlBookLevel[], HlBookLevel[]];
}

export interface HlTrade {
  coin: string;
  px: string;
  sz: string;
  time: number;
  hash: string;
  dir: string;
}

export interface HlCandle {
  t: number;   // Open time
  T: number;   // Close time
  s: string;   // Coin
  i: string;   // Interval
  o: string;   // Open
  h: string;   // High
  l: string;   // Low
  c: string;   // Close
  v: string;   // Volume
  n: number;   // Num trades
}

export class HyperliquidMapper {
  /**
   * Hyperliquid pays funding exactly at the top of every hour.
   * Returns the timestamp (ms) for the next upcoming hour.
   */
  public static getNextFundingTime(): number {
    const now = new Date();
    now.setUTCHours(now.getUTCHours() + 1, 0, 0, 0);
    return now.getTime();
  }

  public static mapMarkets(meta: HlMetaResponse): Market[] {
    return meta.universe.map((item) => {
      const quoteAsset = 'USDC';
      const baseAsset = item.name;
      const sizePrecision = item.szDecimals;
      const pricePrecision = 4;

      return {
        symbol: `${baseAsset}-${quoteAsset}`,
        baseAsset: baseAsset,
        quoteAsset: quoteAsset,
        tickSize: Math.pow(10, -pricePrecision),
        stepSize: Math.pow(10, -sizePrecision),
        minOrderSize: Math.pow(10, -sizePrecision), // Simple heuristic for now
        maxLeverage: item.maxLeverage,
      };
    });
  }

  public static mapOrderBook(book: HlL2BookResponse): OrderBook {
    const rawBids = book.levels[0] || [];
    const rawAsks = book.levels[1] || [];

    const bids: OrderBookLevel[] = rawBids.map((level) => ({
      price: level.px,
      size: level.sz,
    }));

    const asks: OrderBookLevel[] = rawAsks.map((level) => ({
      price: level.px,
      size: level.sz,
    }));

    return {
      symbol: `${book.coin}-USDC`,
      bids,
      asks,
      updateId: book.time, // Using timestamp as sequence for now
    };
  }

  public static mapTrade(trades: HlTrade[]): import('../../core/models').Trade[] {
    return trades.map(t => {
      const dirStr = (t.dir || (t as any).side || '').toLowerCase();
      return {
        id: t.hash,
        symbol: `${t.coin}-USDC`,
        price: t.px,
        size: t.sz,
        side: dirStr === 'buy' || dirStr === 'b' ? 'buy' : 'sell',
        timestamp: t.time,
      };
    });
  }

  public static mapCandle(candles: HlCandle[]): import('../../core/models').Candle[] {
    return candles.map(c => {
      return {
        startedAt: new Date(c.t).toISOString(),
        startedAtTime: c.t,
        ticker: `${c.s}-USDC`,
        resolution: c.i,
        open: c.o,
        high: c.h,
        low: c.l,
        close: c.c,
        baseTokenVolume: c.v,
        usdVolume: (parseFloat(c.v) * parseFloat(c.c)).toString(), // Estimate USD volume
        trades: c.n,
        id: c.t.toString(),
      };
    });
  }

  public static mapTickerFromTrade(trades: HlTrade[]): Ticker | null {
    if (!trades || trades.length === 0) return null;

    const latestTrade = trades[0];

    return {
      symbol: `${latestTrade.coin}-USDC`,
      lastPrice: latestTrade.px,
      // The rest of these fields require the 'metaAndAssetCtxs' endpoint from HL.
      // We stub them here as they are not provided by the raw trades stream.
      markPrice: '0',
      indexPrice: '0',
      fundingRate: '0',
      volume24h: '0',
      openInterest: '0',
      high24h: '0',
      low24h: '0',
    };
  }
}
