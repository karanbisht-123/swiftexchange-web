import type { Market, OrderBook, Trade, Candle } from '../../core/models';
import type { AssetCtx } from '../../core/stores/tickerStore';

export class AsterMapper {
  static mapMarket(asterExchangeInfoSymbol: any): Market {
    const rawSymbol = asterExchangeInfoSymbol.symbol || '';
    const baseAsset = asterExchangeInfoSymbol.baseAsset || rawSymbol.replace('USDT', '');
    const quoteAsset = asterExchangeInfoSymbol.quoteAsset || 'USDT';

    let tickSize = 0;
    let stepSize = 0;
    let minOrderSize = 0;
    let minNotional = 0;

    if (Array.isArray(asterExchangeInfoSymbol.filters)) {
      for (const filter of asterExchangeInfoSymbol.filters) {
        if (filter.filterType === 'PRICE_FILTER') {
          tickSize = parseFloat(filter.tickSize || '0');
        } else if (filter.filterType === 'LOT_SIZE') {
          stepSize = parseFloat(filter.stepSize || '0');
          minOrderSize = parseFloat(filter.minQty || '0');
        } else if (filter.filterType === 'MIN_NOTIONAL') {
          minNotional = parseFloat(filter.notional || filter.minNotional || '0');
        }
      }
    }

    return {
      symbol: `${baseAsset}-${quoteAsset}`,
      baseAsset,
      quoteAsset,
      tickSize,
      stepSize,
      minOrderSize,
      minNotional,
      maxLeverage: 50,
    };
  }

  static mapOrderBook(symbol: string, asterDepth: any): OrderBook {
    return {
      symbol,
      bids: asterDepth.bids ? asterDepth.bids.map((b: any) => ({ price: b[0], size: b[1] })) : [],
      asks: asterDepth.asks ? asterDepth.asks.map((a: any) => ({ price: a[0], size: a[1] })) : [],
      updateId: asterDepth.lastUpdateId || asterDepth.u || 0,
    };
  }

  static mapTrade(asterTrade: any): Trade {
    // Both REST /fapi/v3/trades and WS @aggTrade format
    // WS aggTrade uses short keys: p (price), q (quantity), m (isBuyerMaker), T (time)
    // REST uses: price, qty, time, isBuyerMaker
    const price = asterTrade.p || asterTrade.price;
    const size = asterTrade.q || asterTrade.qty;
    const time = asterTrade.T || asterTrade.time;
    const isBuyerMaker = asterTrade.m ?? asterTrade.isBuyerMaker;
    const id = asterTrade.a || asterTrade.id; // aggTradeId or id

    return {
      id: String(id),
      symbol: asterTrade.s || 'UNKNOWN',
      price: String(price),
      size: String(size),
      side: isBuyerMaker ? 'sell' : 'buy', // If buyer is maker, then it was a sell taker order
      timestamp: Number(time),
    };
  }

  static mapTicker(asterTicker: any): AssetCtx {
    const markPx = asterTicker.c || asterTicker.lastPrice || '0';
    const prevDayPx = asterTicker.o || asterTicker.openPrice || '0';
    const dayNtlVlm = asterTicker.q || asterTicker.quoteVolume || '0';
    const funding = asterTicker.fundingRate || '0';

    return {
      funding,
      openInterest: '0',
      prevDayPx: String(prevDayPx),
      dayNtlVlm: String(dayNtlVlm),
      premium: '0',
      oraclePx: String(markPx),
      markPx: String(markPx),
      midPx: String(markPx),
    };
  }

  static mapMarkPrice(asterMark: any): Partial<AssetCtx> {
    return {
      markPx: String(asterMark.p || asterMark.markPrice || '0'),
      oraclePx: String(asterMark.i || asterMark.indexPrice || '0'),
      funding: String(asterMark.r || asterMark.lastFundingRate || '0'),
      nextFundingTime: asterMark.T ? Number(asterMark.T) : undefined,
    };
  }

  static mapCandle(symbol: string, interval: string, asterKlineArray: any[]): Candle {
    return {
      startedAt: new Date(asterKlineArray[0]).toISOString(),
      startedAtTime: asterKlineArray[0],
      ticker: symbol,
      resolution: interval,
      open: String(asterKlineArray[1]),
      high: String(asterKlineArray[2]),
      low: String(asterKlineArray[3]),
      close: String(asterKlineArray[4]),
      baseTokenVolume: String(asterKlineArray[5]),
      usdVolume: String(asterKlineArray[7]),
      trades: Number(asterKlineArray[8]),
      id: String(asterKlineArray[0]),
    };
  }

  static mapLiveCandle(asterKlinePayload: any): Candle {
    const k = asterKlinePayload.k;
    const uiSymbol = k.s.replace('USDT', '-USDT');
    return {
      startedAt: new Date(k.t).toISOString(),
      startedAtTime: k.t,
      ticker: uiSymbol,
      resolution: k.i,
      open: String(k.o),
      high: String(k.h),
      low: String(k.l),
      close: String(k.c),
      baseTokenVolume: String(k.v),
      usdVolume: String(k.q),
      trades: Number(k.n),
      id: String(k.t),
    };
  }

  static mapPosition(asterPos: any): import('../../core/models').Position {
    const symbol = asterPos.symbol.replace('USDT', '-USDT');
    return {
      symbol,
      size: String(asterPos.positionAmt),
      entryPrice: String(asterPos.entryPrice),
      markPrice: String(asterPos.markPrice || '0'),
      liquidationPrice: String(asterPos.liquidationPrice || '0'),
      unrealizedPnl: String(asterPos.unrealizedProfit || asterPos.unRealizedProfit || '0'),
      leverage: Number(asterPos.leverage),
      marginType: asterPos.isolated || asterPos.marginType === 'isolated' ? 'isolated' : 'cross',
      isolatedMargin: String(asterPos.isolatedMargin || asterPos.isolatedWallet || '0'),
    };
  }

  static mapOrder(asterOrder: any): import('../../core/models').Order {
    const symbol = asterOrder.symbol.replace('USDT', '-USDT');
    return {
      id: String(asterOrder.orderId),
      symbol,
      type: asterOrder.type.toLowerCase() as any,
      side: asterOrder.side.toLowerCase() as any,
      price: String(asterOrder.price),
      size: String(asterOrder.origQty),
      filledSize: String(asterOrder.executedQty),
      status: asterOrder.status.toLowerCase() as any,
      reduceOnly: asterOrder.reduceOnly || false,
      timestamp: asterOrder.time || asterOrder.updateTime || Date.now(),
    };
  }

  static mapAccountBalance(asterAsset: any): import('../../core/models').AccountBalance {
    return {
      asset: asterAsset.asset,
      total: String(asterAsset.walletBalance),
      available: String(asterAsset.availableBalance),
      locked: String(Number(asterAsset.walletBalance) - Number(asterAsset.availableBalance)),
    };
  }

  static mapUserTrade(asterTrade: any): import('../../core/models').UserTrade {
    const symbol = asterTrade.symbol.replace('USDT', '-USDT');
    return {
      id: String(asterTrade.id),
      orderId: String(asterTrade.orderId),
      symbol,
      side: asterTrade.side.toLowerCase() as any,
      price: String(asterTrade.price),
      size: String(asterTrade.qty),
      fee: String(asterTrade.commission),
      feeAsset: asterTrade.commissionAsset,
      realizedPnl: String(asterTrade.realizedPnl),
      timestamp: asterTrade.time,
    };
  }
}
