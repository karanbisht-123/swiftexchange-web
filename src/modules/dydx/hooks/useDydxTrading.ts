import { useCallback, useState } from 'react';

import { dydxTradingService } from '../service/dydxTradingService';
import { dydxWalletService } from '../service/dydxWalletService';
import {
  type OpenOrder,
  type OrderResult,
  type PlaceOrderParams,
  type Position,
  type TriggerParams,
} from '../types/trading.types';

export const useDydxTrading = () => {
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isSettingTriggers, setIsSettingTriggers] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);

  const canTrade = dydxWalletService.isReadyForTrading();
  const address = dydxWalletService.getAddress();

  const clearOrderError = useCallback(() => setOrderError(null), []);

  const placeOrder = useCallback(
    async (params: PlaceOrderParams): Promise<OrderResult> => {
      console.log(params, 'order Parms --------');
      if (!canTrade || !address) {
        const msg = 'Wallet not connected or no active subaccount';
        setOrderError(msg);
        return { success: false, error: msg, userMessage: msg, retryable: false };
      }

      setIsPlacingOrder(true);
      setOrderError(null);

      try {
        const result = await dydxTradingService.placeOrder(params);
        return result;
      } catch (err: any) {
        const msg = err.message || 'Place order failed';
        setOrderError(msg);
        return { success: false, error: msg, userMessage: msg, retryable: true };
      } finally {
        setIsPlacingOrder(false);
      }
    },
    [canTrade, address]
  );

  const cancelOrder = useCallback(
    async (order: OpenOrder): Promise<OrderResult> => {
      if (!canTrade || !address) {
        const msg = 'Not ready to trade';
        setOrderError(msg);
        return { success: false, error: msg, userMessage: msg, retryable: false };
      }

      setIsCancelling(true);
      setOrderError(null);

      try {
        const result = await dydxTradingService.cancelOrder(order);
        return result;
      } catch (err: any) {
        const msg = err.message || 'Cancel failed';
        setOrderError(msg);
        return { success: false, error: msg, userMessage: msg, retryable: true };
      } finally {
        setIsCancelling(false);
      }
    },
    [canTrade, address]
  );

  const closePosition = useCallback(
    async (position: Position): Promise<OrderResult> => {
      console.log(position, '-----------------');
      if (!canTrade || !address) {
        const msg = 'Not ready to trade';
        setOrderError(msg);
        return { success: false, error: msg, userMessage: msg, retryable: false };
      }

      try {
        const result = await dydxTradingService.closePosition(position);
        return result;
      } catch (err: any) {
        const msg = err.message || 'Close position failed';
        setOrderError(msg);
        return { success: false, error: msg, userMessage: msg, retryable: true };
      }
    },
    [canTrade, address]
  );

  const setTriggers = useCallback(
    async (position: Position, triggers: TriggerParams): Promise<any> => {
      if (!canTrade || !address) {
        const msg = 'Not ready to trade';
        setOrderError(msg);
        return { success: false, error: msg };
      }

      setIsSettingTriggers(true);
      setOrderError(null);

      try {
        const result = await dydxTradingService.setTriggers(position, triggers);
        return result;
      } catch (err: any) {
        const msg = err.message || 'Set triggers failed';
        setOrderError(msg);
        throw err;
      } finally {
        setIsSettingTriggers(false);
      }
    },
    [canTrade, address]
  );

  return {
    placeOrder,
    cancelOrder,
    closePosition,
    setTriggers,
    isPlacingOrder,
    isCancelling,
    isSettingTriggers,
    orderError,
    clearOrderError,
    canTrade,
    address,
  };
};
