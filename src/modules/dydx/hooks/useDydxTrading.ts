import { useCallback, useState } from 'react';

import { dydxTradingService } from '../service/dydxTradingService';
import {
  type OpenOrder,
  type OrderResult,
  OrderSideEnum,
  OrderTypeEnum,
  type PlaceOrderParams,
  type Position,
} from '../types/trading.types';
import { useDydxWallet } from './useDydxWallet';

export const useDydxTrading = () => {
  const { isConnected, hasSubaccount, address } = useDydxWallet();

  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);

  // console.log(setIsFetching);

  const canTrade = isConnected && hasSubaccount && !!address;

  const clearOrderError = useCallback(() => setOrderError(null), []);

  const placeOrder = useCallback(
    async (params: PlaceOrderParams): Promise<OrderResult> => {
      if (!canTrade) {
        const msg = 'Wallet not connected or no active subaccount';
        setOrderError(msg);
        return { success: false, error: msg, userMessage: msg, retryable: false };
      }

      setIsPlacingOrder(true);
      setOrderError(null);

      try {
        const marketInfo = await dydxTradingService.getMarketInfo(params.market);
        if (!marketInfo) {
          const msg = `Market ${params.market} not found`;
          setOrderError(msg);
          return { success: false, error: msg, userMessage: msg, retryable: false };
        }

        const result = await dydxTradingService.placeOrder(params, marketInfo);

        if (!result.success && result.userMessage) {
          setOrderError(result.userMessage);
        }

        return result;
      } catch (err: any) {
        const msg = err.message || 'Place order failed';
        setOrderError(msg);
        return { success: false, error: msg, userMessage: msg, retryable: true };
      } finally {
        setIsPlacingOrder(false);
      }
    },
    [canTrade]
  );

  const cancelOrder = useCallback(
    async (order: OpenOrder): Promise<OrderResult> => {
      if (!canTrade) {
        const msg = 'Not ready to trade';
        setOrderError(msg);
        return { success: false, error: msg, userMessage: msg, retryable: false };
      }

      setIsCancelling(true);
      setOrderError(null);

      try {
        const result = await dydxTradingService.cancelOrder(order);

        if (!result.success && result.userMessage) {
          setOrderError(result.userMessage);
        }

        return result;
      } catch (err: any) {
        const msg = err.message || 'Cancel failed';
        setOrderError(msg);
        return { success: false, error: msg, userMessage: msg, retryable: true };
      } finally {
        setIsCancelling(false);
      }
    },
    [canTrade]
  );

  const closePosition = useCallback(
    async (market: string, position: Position): Promise<OrderResult> => {
      if (!canTrade) {
        const msg = 'Not ready to trade';
        setOrderError(msg);
        return { success: false, error: msg, userMessage: msg, retryable: false };
      }

      try {
        const marketInfo = await dydxTradingService.getMarketInfo(market);
        if (!marketInfo) {
          const msg = `Market ${market} not found`;
          setOrderError(msg);
          return { success: false, error: msg, userMessage: msg, retryable: false };
        }

        return await dydxTradingService.closePosition(market, position, marketInfo);
      } catch (err: any) {
        const msg = err.message || 'Close position failed';
        setOrderError(msg);
        return { success: false, error: msg, userMessage: msg, retryable: true };
      }
    },
    [canTrade]
  );

  const placeMarketOrder = useCallback(
    (market: string, side: OrderSideEnum, size: any, slippageTolerance?: number) =>
      placeOrder({
        market,
        side,
        type: OrderTypeEnum.MARKET,
        size,
        slippageTolerance: slippageTolerance ?? 0.01,
      }),
    [placeOrder]
  );

  const placeLimitOrder = useCallback(
    (market: string, side: OrderSideEnum, size: any, price: any) =>
      placeOrder({ market, side, type: OrderTypeEnum.LIMIT, size, price }),
    [placeOrder]
  );

  return {
    placeOrder,
    cancelOrder,
    closePosition,
    placeMarketOrder,
    placeLimitOrder,
    isPlacingOrder,
    isCancelling,
    isFetching,
    orderError,
    clearOrderError,

    canTrade,
  };
};
