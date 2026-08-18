import { useCallback, useMemo, useState } from 'react';

import { useWalletStore } from '../../walletconnect/store/walletConnectStore';
import { dydxSubaccountService } from '../service/dydxSubaccountService';
import { dydxWalletService } from '../service/dydxWalletService';
import { getSubaccountBalance, useSubaccountStore } from '../store/subaccountStore';
import { type ChildSubaccount, useWebSocketStore } from '../store/websocketStore';
import {
  SUBACCOUNT_CONSTANTS,
  type SubaccountBalance,
  type TransferResult,
} from '../types/trading.types';

export const useSubaccounts = () => {
  const [isTransferring, setIsTransferring] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);
  const dydxAddress = useWalletStore(
    useCallback(state => {
      const evm = state.connectedWallets.evm;
      return evm?.dydxAddress || null;
    }, [])
  );

  const subaccountNumber = dydxWalletService.getSubaccountNumber();
  const parentKey = dydxAddress ? `parent_subaccount_${dydxAddress}_${subaccountNumber}` : null;

  const updateTrigger = useWebSocketStore(state => state.updateTrigger);
  const parentData = useWebSocketStore(
    useCallback(
      state => (parentKey ? state.parentSubaccounts.get(parentKey) : null),
      [parentKey, updateTrigger]
    )
  );
  const { selectedMarginMode, setMarginMode, activeSubaccountNumber, setActiveSubaccount } =
    useSubaccountStore();

  const childSubaccounts = useMemo(() => {
    return parentData?.childSubaccounts || [];
  }, [parentData?.childSubaccounts]);

  const crossSubaccount = useMemo(() => {
    return (
      childSubaccounts.find(c => c.subaccountNumber < SUBACCOUNT_CONSTANTS.ISOLATED_START) || null
    );
  }, [childSubaccounts]);

  const isolatedSubaccounts = useMemo(() => {
    return childSubaccounts.filter(c => c.subaccountNumber >= SUBACCOUNT_CONSTANTS.ISOLATED_START);
  }, [childSubaccounts]);

  const getSubaccountForMarket = useCallback(
    (market: string): ChildSubaccount | null => {
      return (
        isolatedSubaccounts.find(c => {
          const markets = Object.keys(c.openPerpetualPositions || {});
          return markets.includes(market);
        }) || null
      );
    },
    [isolatedSubaccounts]
  );

  const getNextIsolatedSubaccount = useCallback(
    (market: string): number => {
      return dydxSubaccountService.getNextIsolatedSubaccount(market, childSubaccounts);
    },
    [childSubaccounts]
  );

  const transfer = useCallback(
    async (
      fromSubaccount: number,
      toSubaccount: number,
      amount: string
    ): Promise<TransferResult> => {
      setIsTransferring(true);
      setTransferError(null);

      try {
        const result = await dydxSubaccountService.transfer(fromSubaccount, toSubaccount, amount);

        if (!result.success) {
          setTransferError(result.error || 'Transfer failed');
        }

        return result;
      } catch (error: any) {
        const errorMessage = error.message || 'Transfer failed';
        setTransferError(errorMessage);
        return {
          success: false,
          error: errorMessage,
          fromSubaccount,
          toSubaccount,
          amount,
        };
      } finally {
        setIsTransferring(false);
      }
    },
    []
  );

  const sweepToCross = useCallback(async () => {
    setIsTransferring(true);
    setTransferError(null);

    try {
      const result = await dydxSubaccountService.sweepToCross(childSubaccounts);

      if (!result.success && result.errors.length > 0) {
        setTransferError(result.errors.join('; '));
      }

      return result;
    } catch (error: any) {
      const errorMessage = error.message || 'Sweep failed';
      setTransferError(errorMessage);
      return { success: false, swept: 0, errors: [errorMessage] };
    } finally {
      setIsTransferring(false);
    }
  }, [childSubaccounts]);

  const validateIsolatedPosition = useCallback(
    (subaccountNumber: number) => {
      return dydxSubaccountService.validateIsolatedEquity(subaccountNumber, childSubaccounts);
    },
    [childSubaccounts]
  );

  const getBalance = useCallback(
    (subaccountNumber: number): SubaccountBalance | null => {
      return getSubaccountBalance(subaccountNumber, childSubaccounts);
    },
    [childSubaccounts]
  );

  const totalEquity = useMemo(() => {
    return parentData?.equity || '0';
  }, [parentData?.equity]);

  const totalFreeCollateral = useMemo(() => {
    return parentData?.freeCollateral || '0';
  }, [parentData?.freeCollateral]);

  return useMemo(
    () => ({
      childSubaccounts,
      crossSubaccount,
      isolatedSubaccounts,
      totalEquity,
      totalFreeCollateral,

      selectedMarginMode,
      setMarginMode,
      activeSubaccountNumber,
      setActiveSubaccount,

      getSubaccountForMarket,
      getNextIsolatedSubaccount,
      getBalance,
      validateIsolatedPosition,

      transfer,
      sweepToCross,
      isTransferring,
      transferError,
      clearTransferError: () => setTransferError(null),
    }),
    [
      childSubaccounts,
      crossSubaccount,
      isolatedSubaccounts,
      totalEquity,
      totalFreeCollateral,
      selectedMarginMode,
      setMarginMode,
      activeSubaccountNumber,
      setActiveSubaccount,
      getSubaccountForMarket,
      getNextIsolatedSubaccount,
      getBalance,
      validateIsolatedPosition,
      transfer,
      sweepToCross,
      isTransferring,
      transferError,
    ]
  );
};
