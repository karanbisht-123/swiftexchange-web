import { useCallback, useEffect, useRef, useState } from 'react';

import { useWalletStore } from '../../walletconnect/store/walletConnectStore';
import { type AccountBalance, dydxWalletService } from '../service/dydxWalletService';
import { useWebSocketStore } from '../store/websocketStore';

interface UseDydxWalletReturn {
  isConnected: boolean;
  address: string | null;
  balance: AccountBalance | null;
  loadingBalance: boolean;
  lastUpdateTime: number | null;
  isReceivingUpdates: boolean;
  refresh: () => Promise<void>;
  error: string | null;
}

export const useDydxWallet = (): UseDydxWalletReturn => {
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dydxAddress = useWalletStore(
    useCallback(state => {
      const evm = state.connectedWallets.evm;
      const cosmos = state.connectedWallets.cosmos;
      return evm?.dydxAddress || cosmos?.dydxAddress || null;
    }, [])
  );

  const hasDydxWallet = !!dydxAddress;

  const isMountedRef = useRef(true);
  const isFetchingRef = useRef(false);
  const hasInitialFetchRef = useRef(false);
  const isFirstMountRef = useRef(true);

  const subscribeToParentSubaccount = useWebSocketStore(state => state.subscribeToParentSubaccount);
  const unsubscribeFromParentSubaccount = useWebSocketStore(
    state => state.unsubscribeFromParentSubaccount
  );
  const updateParentSubaccount = useWebSocketStore(state => state.updateParentSubaccount);

  const subaccountNumber = dydxWalletService.getSubaccountNumber();
  const parentKey = dydxAddress ? `parent_subaccount_${dydxAddress}_${subaccountNumber}` : null;

  const updateTrigger = useWebSocketStore(state => state.updateTrigger);
  const parentData = useWebSocketStore(
    useCallback(
      state => (parentKey ? state.parentSubaccounts.get(parentKey) : null),
      [parentKey, updateTrigger]
    )
  );

  const balance: AccountBalance | null = parentData
    ? {
        equity: parentData.equity || '0',
        freeCollateral: parentData.freeCollateral || '0',
      }
    : null;

  const lastUpdateTime = parentData?.lastUpdate || null;
  const isReceivingUpdates = parentData ? Date.now() - parentData.lastUpdate < 30000 : false;

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const fetchBalance = useCallback(
    async (forceRefresh = false): Promise<void> => {
      if (isFetchingRef.current || !isMountedRef.current) return;
      if (!dydxWalletService.isConnected() || !dydxAddress || !parentKey) return;

      isFetchingRef.current = true;
      setLoadingBalance(true);
      setError(null);

      try {
        const freshBalance = await dydxWalletService.getBalance(forceRefresh);

        updateParentSubaccount(parentKey, {
          equity: freshBalance.equity,
          freeCollateral: freshBalance.freeCollateral,
          lastUpdate: Date.now(),
        });

        hasInitialFetchRef.current = true;
      } catch (err: any) {
        console.error('[useDydxWallet] Balance fetch failed:', err);
        setError(err.message || 'Failed to fetch wallet balance');
      } finally {
        setLoadingBalance(false);
        isFetchingRef.current = false;
      }
    },
    [dydxAddress, parentKey, updateParentSubaccount]
  );

  useEffect(() => {
    if (!hasDydxWallet || !dydxAddress) {
      setError(null);
      hasInitialFetchRef.current = false;
      return;
    }

    const unsubscribeStatus = dydxWalletService.onStatusChange(status => {
      if (status === 'connected' && !hasInitialFetchRef.current) {
        fetchBalance(true);
      } else if (status === 'disconnected') {
        hasInitialFetchRef.current = false;
      }
    });

    if (dydxWalletService.isConnected() && !hasInitialFetchRef.current) {
      fetchBalance(true);
    }

    return unsubscribeStatus;
  }, [dydxAddress, hasDydxWallet, fetchBalance]);

  useEffect(() => {
    if (!dydxAddress || !dydxWalletService.isConnected()) {
      return;
    }

    if (isFirstMountRef.current) {
      isFirstMountRef.current = false;
      subscribeToParentSubaccount(dydxAddress, subaccountNumber);
    }

    return () => {
      unsubscribeFromParentSubaccount(dydxAddress, subaccountNumber);
      isFirstMountRef.current = true;
    };
  }, [dydxAddress, subaccountNumber, subscribeToParentSubaccount, unsubscribeFromParentSubaccount]);

  const refresh = useCallback(async () => {
    if (!dydxAddress || !dydxWalletService.isConnected()) {
      setError('Cannot refresh — wallet not connected');
      return;
    }
    await fetchBalance(true);
  }, [dydxAddress, fetchBalance]);

  return {
    isConnected: hasDydxWallet && dydxWalletService.isConnected(),
    address: dydxAddress,
    balance,
    loadingBalance,
    lastUpdateTime,
    isReceivingUpdates,
    refresh,
    error,
  };
};
