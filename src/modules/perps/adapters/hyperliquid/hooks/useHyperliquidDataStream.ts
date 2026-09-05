import { useEffect, useRef } from 'react';

import { WebSocketTransport } from '@nktkas/hyperliquid';

import { useExchangeManager } from '../../../core/ExchangeManager';
import { useHistoryStore } from '../../../core/stores/historyStore';
import { useOrderStore } from '../../../core/stores/orderStore';
import { usePositionStore } from '../../../core/stores/positionStore';

export const useHyperliquidDataStream = (userAddr: string | null) => {
  const currentExchange = useExchangeManager(s => s.currentExchange);
  const transportRef = useRef<WebSocketTransport | null>(null);

  useEffect(() => {
    if (currentExchange !== 'hyperliquid' || !userAddr) {
      if (transportRef.current) {
        transportRef.current.close();
        transportRef.current = null;
      }
      return;
    }

    let isMounted = true;
    const transport = new WebSocketTransport();
    transportRef.current = transport;

    const setup = async () => {
      try {
        // Subscribe to webData2 (includes positions and open orders)
        await transport.subscribe(
          'webData2',
          { type: 'webData2', user: userAddr as `0x${string}` },
          (event: any) => {
            if (!isMounted) return;
            const data = event.data;
            if (!data) return;

            // Handle clearinghouseState (positions)
            if (data.clearinghouseState) {
              const positions = data.clearinghouseState.assetPositions?.map((p: any) => ({
                symbol: p.position.coin,
                positionAmt: p.position.szi,
                entryPrice: p.position.entryPx,
                markPrice: p.position.entryPx, // Replace with actual mark price if available
                unRealizedProfit: p.position.unrealizedPnl,
                liquidationPrice: p.position.liquidationPx || '0',
                leverage: p.position.leverage?.value?.toString() || '1',
                marginType: p.position.leverage?.type === 'cross' ? 'cross' : 'isolated',
                isolatedMargin: p.position.marginUsed,
                positionSide: parseFloat(p.position.szi) >= 0 ? 'LONG' : 'SHORT',
              }));

              if (positions) {
                // Mapping positions to PositionStore format
                usePositionStore.getState().setPositions(positions);
              }
            }

            // Handle openOrders
            if (data.openOrders) {
              const orders = data.openOrders.map((o: any) => ({
                id: o.oid?.toString(),
                symbol: o.coin,
                type: 'limit',
                side: o.side === 'A' ? 'sell' : 'buy',
                price: o.limitPx,
                size: o.sz,
                filledSize: '0',
                status: 'new',
                reduceOnly: o.reduceOnly || false,
                timestamp: o.timestamp || Date.now(),
              }));

              useOrderStore.getState().setOrders(orders);
            }
          }
        );

        // Subscribe to userEvents (for fills/trades)
        await transport.subscribe(
          'userEvents',
          { type: 'userEvents', user: userAddr as `0x${string}` },
          (event: any) => {
            if (!isMounted) return;
            const data = event.data;
            if (!data) return;

            if (data.fills) {
              const trades = data.fills.map((f: any) => ({
                id: f.oid,
                orderId: f.oid,
                symbol: f.coin,
                price: f.px,
                qty: f.sz,
                quoteQty: (parseFloat(f.px) * parseFloat(f.sz)).toString(),
                realizedPnl: f.closedPnl || '0',
                commission: f.fee || '0',
                commissionAsset: f.feeToken || 'USDC',
                time: f.time || Date.now(),
                buyer: f.side === 'B',
                maker: f.maker,
              }));

              const historyStore = useHistoryStore.getState();
              trades.forEach((t: any) => historyStore.addTrade(t));
            }
          }
        );
      } catch (err) {
        console.error('[hyperliquid ws] Subscription error', err);
      }
    };

    setup();

    return () => {
      isMounted = false;
      if (transportRef.current) {
        transportRef.current.close();
        transportRef.current = null;
      }
    };
  }, [userAddr, currentExchange]);
};
