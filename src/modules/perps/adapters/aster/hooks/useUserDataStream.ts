import { useEffect, useRef, useState } from 'react';

import type { Signer } from 'ethers';

import { useNotificationStore } from '../../../../../store/notificationStore';
import type { Order } from '../../../core/models';
import { useAccountStore } from '../../../core/stores/accountStore';
import { useHistoryStore } from '../../../core/stores/historyStore';
import { useOrderStore } from '../../../core/stores/orderStore';
import { usePositionStore } from '../../../core/stores/positionStore';
import { ASTER_WS_URL } from '../constants';
import { useListenKey } from './useListenKey';

export interface MarginCallPosition {
  symbol: string;
  positionSide: string;
  positionAmount: string;
  marginType: string;
  isolatedWallet: string;
  markPrice: string;
  unrealizedPnl: string;
  maintenanceMarginRequired: string;
}

export interface MarginCallEvent {
  eventTime: number;
  crossWalletBalance?: string;
  positions: MarginCallPosition[];
}

export function useUserDataStream(signer: Signer | null, userAddr: string | null) {
  const { listenKey, refresh } = useListenKey(signer, userAddr);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const applyAccountUpdate = (a: any) => {
    if (Array.isArray(a.B)) {
      a.B.forEach((b: any) => {
        useAccountStore.getState().updateBalance({
          asset: b.a,
          total: b.wb,
          available: b.cw,
          locked: String(parseFloat(b.wb) - parseFloat(b.cw)),
          marginBalance: b.cw,
        });
      });
    }

    if (Array.isArray(a.P)) {
      a.P.forEach((p: any) => {
        const symbol = (p.s as string).replace('USDT', '-USDT');
        if (parseFloat(p.pa) === 0) {
          usePositionStore.getState().removePosition(symbol);
        } else {
          // get existing position to preserve missing fields like leverage if Aster doesn't send them
          const existing = usePositionStore.getState().positions[symbol];
          usePositionStore.getState().updatePosition({
            symbol,
            size: p.pa,
            entryPrice: p.ep,
            markPrice: p.mp || existing?.markPrice || '0',
            liquidationPrice: existing?.liquidationPrice || '0',
            unrealizedPnl: p.up || '0',
            leverage: existing?.leverage || 0,
            marginType: p.mt
              ? (p.mt as string).toLowerCase() === 'isolated'
                ? 'isolated'
                : 'cross'
              : existing?.marginType || 'cross',
            isolatedMargin: p.iw ?? '0',
          });
        }
      });
    }
  };

  const applyOrderUpdate = (o: any) => {
    if (!o || !o.s) return;
    const symbol = String(o.s).replace('USDT', '-USDT');
    const status = o.X ? (String(o.X).toLowerCase() as Order['status']) : 'new';
    const orderId = String(o.i);

    const terminalStatuses = new Set(['filled', 'canceled', 'rejected', 'expired']);

    if (terminalStatuses.has(status)) {
      useOrderStore.getState().removeOrder(orderId);
    } else {
      useOrderStore.getState().updateOrder({
        id: orderId,
        symbol,
        type: o.ot ? (String(o.ot).toLowerCase() as Order['type']) : 'market',
        side: o.S ? (String(o.S).toLowerCase() as Order['side']) : 'buy',
        price: o.p,
        size: o.q,
        filledSize: o.z,
        status,
        reduceOnly: o.R ?? false,
        timestamp: o.T ?? Date.now(),
      });
    }

    // Fire toast notifications for order status changes (only if it's an execution report)
    if (o.x !== 'CALCULATED') {
      // 'CALCULATED' is for liquidation/ADL updates sometimes, we care about actual trades/orders
      const actionText = o.S === 'BUY' ? 'Buy' : 'Sell';
      let title = '';
      let message = `${actionText} ${o.q} ${symbol} at ${o.p === '0' ? 'Market' : o.p}`;
      let type: 'success' | 'error' | 'info' = 'info';

      if (o.X === 'NEW') {
        title = 'Order Placed';
        type = 'info';
      } else if (o.X === 'FILLED' || o.X === 'PARTIALLY_FILLED') {
        title = `Order ${o.X === 'FILLED' ? 'Filled' : 'Partially Filled'}`;
        type = 'success';
        message = `Executed ${o.z} ${symbol} at ${o.ap}`;
      } else if (o.X === 'CANCELED') {
        title = 'Order Canceled';
        type = 'info';
      } else if (o.X === 'REJECTED') {
        title = 'Order Rejected';
        type = 'error';
        message = o.r || 'Order was rejected by the exchange';
      } else if (o.X === 'EXPIRED') {
        title = 'Order Expired';
        type = 'info';
      }

      if (title) {
        useNotificationStore.getState().showToast({
          type: type === 'error' ? 'SYSTEM' : 'DYDX', // DYDX type maps to an exchange icon in our config
          title,
          message,
        });
      }
    }

    // Always push to history store
    useHistoryStore.getState().addOrder({
      orderId: o.i,
      symbol: o.s,
      status: o.X,
      clientOrderId: o.c,
      price: o.p,
      avgPrice: o.ap,
      origQty: o.q,
      executedQty: o.z,
      cumQty: o.z || '0',
      cumQuote: '0',
      timeInForce: o.f,
      type: o.o,
      reduceOnly: o.R,
      closePosition: o.cp,
      side: o.S,
      positionSide: o.ps,
      stopPrice: o.sp,
      workingType: o.wt,
      priceProtect: false,
      origType: o.ot,
      time: o.T,
      updateTime: o.T,
    });

    if (o.x === 'TRADE') {
      useHistoryStore.getState().addTrade({
        buyer: o.S === 'BUY',
        commission: o.n || '0',
        commissionAsset: o.N || 'USDT',
        id: o.t,
        maker: o.m,
        orderId: o.i,
        price: o.L,
        qty: o.l,
        quoteQty: String(parseFloat(o.L || '0') * parseFloat(o.l || '0')),
        realizedPnl: o.rp || '0',
        side: o.S,
        positionSide: o.ps,
        symbol: o.s,
        time: o.T,
      });

      // Real-time fee deduction sync
      if (o.n && parseFloat(o.n) > 0) {
        useHistoryStore.getState().addIncome({
          symbol: o.s,
          incomeType: 'COMMISSION',
          income: `-${o.n}`,
          asset: o.N || 'USDT',
          time: o.T,
          tranId: String(o.t || ''),
          tradeId: String(o.t || ''),
          info: '',
        });
      }

      // Real-time realized PnL sync
      if (o.rp && parseFloat(o.rp) !== 0) {
        useHistoryStore.getState().addIncome({
          symbol: o.s,
          incomeType: 'REALIZED_PNL',
          income: o.rp,
          asset: 'USDT',
          time: o.T,
          tranId: String(o.t || ''),
          tradeId: String(o.t || ''),
          info: '',
        });
      }
    }
  };

  useEffect(() => {
    if (!listenKey) return;

    const ws = new WebSocket(`${ASTER_WS_URL}/${listenKey}`);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[UserDataStream] Connected to', listenKey);
      setConnected(true);
    };

    ws.onmessage = event => {
      let data: any;
      try {
        data = JSON.parse(event.data as string);
      } catch {
        return;
      }

      console.log('[UserDataStream] Received event:', data.e, data);

      try {
        switch (data.e) {
          case 'ACCOUNT_UPDATE':
            applyAccountUpdate(data.a);
            break;
          case 'ORDER_TRADE_UPDATE':
            applyOrderUpdate(data.o);
            break;
          case 'ACCOUNT_CONFIG_UPDATE':
            if (data.ac && data.ac.s) {
              const symbol = String(data.ac.s).replace('USDT', '-USDT');
              const existing = usePositionStore.getState().positions[symbol];
              if (existing) {
                usePositionStore.getState().updatePosition({
                  ...existing,
                  leverage: data.ac.l || existing.leverage,
                });
                if (data.ac.l) {
                  useNotificationStore.getState().showToast({
                    type: 'DYDX',
                    title: 'Leverage Updated',
                    message: `Leverage for ${symbol} set to ${data.ac.l}x`,
                  });
                }
              }
            }
            break;
          case 'listenKeyExpired':
            ws.close();
            refresh();
            break;
          case 'MARGIN_CALL':
            // could toast margin call warning here
            if (data.positions && data.positions.length > 0) {
              const pos = data.positions[0];
              const symbol = String(pos.symbol).replace('USDT', '-USDT');
              useNotificationStore.getState().showToast({
                type: 'SYSTEM',
                title: 'Margin Call Warning',
                message: `Your position on ${symbol} is close to liquidation. Margin Required: ${pos.maintenanceMarginRequired}`,
              });
            }
            break;
        }
      } catch (err) {
        console.error('[UserDataStream] Error processing event:', err);
      }
    };

    ws.onclose = () => {
      console.log('[UserDataStream] Disconnected');
      setConnected(false);
    };

    return () => {
      ws.onopen = null;
      ws.onmessage = null;
      ws.onclose = null;
      ws.close();
      wsRef.current = null;
    };
  }, [listenKey, refresh]);

  return { connected };
}
