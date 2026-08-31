import { HttpTransport } from '@nktkas/hyperliquid';
import { historicalOrders, openOrders, userFillsByTime } from '@nktkas/hyperliquid/api/info';

import type { AsterUserTrade } from '../../aster/types/account';
import type { AsterOrderResponse } from '../../aster/types/orders';

const transport = new HttpTransport(); // Connects to mainnet API

export const getHyperliquidOpenOrders = async (userAddr: string): Promise<AsterOrderResponse[]> => {
  try {
    const data = await openOrders({ transport }, { user: userAddr as `0x${string}` });
    return data.map((o: any) => ({
      orderId: o.oid,
      symbol: o.coin,
      status: 'NEW',
      clientOrderId: '',
      price: o.limitPx,
      avgPrice: '0',
      origQty: o.sz,
      executedQty: '0',
      cumQty: '0',
      cumQuote: '0',
      timeInForce: 'GTC' as any,
      type: 'LIMIT',
      origType: 'LIMIT',
      side: o.side === 'A' ? 'SELL' : 'BUY',
      positionSide: 'BOTH',
      stopPrice: '0',
      closePosition: o.reduceOnly || false,
      updateTime: o.timestamp || Date.now(),
      workingType: 'CONTRACT_PRICE' as any,
      priceProtect: false,
      reduceOnly: o.reduceOnly || false,
    }));
  } catch (err) {
    console.error('getHyperliquidOpenOrders error', err);
    return [];
  }
};

export const getHyperliquidHistoricalOrders = async (
  userAddr: string,
  options?: { endTime?: number; limit?: number }
): Promise<AsterOrderResponse[]> => {
  try {
    const data = await historicalOrders({ transport }, { user: userAddr as `0x${string}` });

    let filtered = data;
    if (options?.endTime) {
      filtered = data.filter(o => o.order.timestamp <= options.endTime!);
    }

    // Convert to AsterOrderResponse
    let mapped = filtered.map(item => {
      const o = item.order;

      let mappedStatus = 'NEW';
      if (item.status === 'filled') mappedStatus = 'FILLED';
      if (item.status === 'canceled' || item.status.includes('Canceled')) mappedStatus = 'CANCELED';
      if (item.status.includes('Rejected')) mappedStatus = 'REJECTED';

      return {
        orderId: o.oid,
        symbol: o.coin,
        status: mappedStatus as any,
        clientOrderId: '',
        price: o.limitPx,
        avgPrice: '0',
        origQty: o.sz,
        executedQty: '0',
        cumQty: '0',
        cumQuote: '0',
        timeInForce: 'GTC' as any,
        type: o.orderType === 'Limit' ? 'LIMIT' : 'MARKET',
        origType: o.orderType === 'Limit' ? 'LIMIT' : 'MARKET',
        side: o.side === 'A' ? 'SELL' : 'BUY',
        positionSide: 'BOTH',
        stopPrice: o.triggerPx || '0',
        closePosition: o.reduceOnly || false,
        updateTime: item.statusTimestamp || o.timestamp,
        time: o.timestamp,
        workingType: 'CONTRACT_PRICE' as any,
        priceProtect: false,
        reduceOnly: o.reduceOnly || false,
      };
    });

    if (options?.limit) {
      mapped = mapped.slice(0, options.limit);
    }
    return mapped;
  } catch (err) {
    console.error('getHyperliquidHistoricalOrders error', err);
    return [];
  }
};

export const getHyperliquidUserFills = async (
  userAddr: string,
  options?: { endTime?: number; limit?: number }
): Promise<AsterUserTrade[]> => {
  try {
    // We use a generic startTime since hyperliquid requires it, 1 year back
    const startTime = Date.now() - 365 * 24 * 60 * 60 * 1000;
    const data = await userFillsByTime(
      { transport },
      {
        user: userAddr as `0x${string}`,
        startTime,
        endTime: options?.endTime,
      }
    );

    let mapped = data.map(
      f =>
        ({
          id: f.oid, // oid is used as unique ID for fill
          orderId: f.oid,
          symbol: f.coin,
          price: f.px,
          qty: f.sz,
          quoteQty: (parseFloat(f.px) * parseFloat(f.sz)).toString(),
          realizedPnl: f.closedPnl || '0',
          commission: f.fee || '0',
          commissionAsset: (f as any).feeToken || 'USDC',
          time: f.time,
          buyer: f.side === 'B',
          maker: (f as any).maker || false,
          side: f.side === 'B' ? 'BUY' : 'SELL', // Some UI components rely on 'side' existing in trade object
        }) as unknown as AsterUserTrade
    ); // Type asserting to handle any missing strict Aster fields

    if (options?.limit) {
      mapped = mapped.slice(0, options.limit);
    }

    return mapped;
  } catch (err) {
    console.error('getHyperliquidUserFills error', err);
    return [];
  }
};
