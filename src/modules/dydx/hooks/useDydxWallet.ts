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

  const hasDydxWallet = useWalletStore(
    useCallback(state => {
      const evm = state.connectedWallets.evm;
      const cosmos = state.connectedWallets.cosmos;
      return Boolean(evm?.dydxAddress || cosmos?.dydxAddress);
    }, [])
  );

  const isMountedRef = useRef(true);
  const isFetchingRef = useRef(false);
  const hasInitialFetchRef = useRef(false);
  const isFirstMountRef = useRef(true);

  const subscribeToSubaccount = useWebSocketStore(state => state.subscribeToSubaccount);
  const unsubscribeFromSubaccount = useWebSocketStore(state => state.unsubscribeFromSubaccount);
  const updateSubaccount = useWebSocketStore(state => state.updateSubaccount);

  const subaccountNumber = dydxWalletService.getSubaccountNumber();
  const subaccountKey = dydxAddress ? `subaccount_${dydxAddress}_${subaccountNumber}` : null;

  const subaccountData = useWebSocketStore(
    useCallback(
      state => (subaccountKey ? state.subaccounts.get(subaccountKey) : null),
      [subaccountKey]
    )
  );

  const balance: AccountBalance | null = subaccountData
    ? {
        equity: subaccountData.equity || '0',
        freeCollateral: subaccountData.freeCollateral || '0',
      }
    : null;

  const lastUpdateTime = subaccountData?.lastUpdate || null;
  const isReceivingUpdates = subaccountData
    ? Date.now() - subaccountData.lastUpdate < 30000
    : false;

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const fetchBalance = useCallback(
    async (forceRefresh = false): Promise<void> => {
      if (isFetchingRef.current || !isMountedRef.current) return;
      if (!dydxWalletService.isConnected() || !dydxAddress || !subaccountKey) return;

      isFetchingRef.current = true;
      if (isMountedRef.current) {
        setLoadingBalance(true);
        setError(null);
      }

      try {
        const initialData = await dydxWalletService.getBalance(forceRefresh);
        hasInitialFetchRef.current = true;
        updateSubaccount(subaccountKey, {
          equity: initialData.equity,
          freeCollateral: initialData.freeCollateral,
          lastUpdate: Date.now(),
        });
      } catch (err: any) {
        if (isMountedRef.current) {
          setError(err.message || 'Failed to fetch balance');
        }
      } finally {
        if (isMountedRef.current) {
          setLoadingBalance(false);
        }
        isFetchingRef.current = false;
      }
    },
    [dydxAddress, subaccountKey, updateSubaccount]
  );

  useEffect(() => {
    if (!hasDydxWallet || !dydxAddress) {
      setError(null);
      hasInitialFetchRef.current = false;
      return;
    }

    if (!hasInitialFetchRef.current && dydxWalletService.isConnected()) {
      fetchBalance(true);
    }

    const unsubscribe = dydxWalletService.onStatusChange(status => {
      if (status === 'connected' && !hasInitialFetchRef.current) {
        fetchBalance(true);
      } else if (status === 'disconnected') {
        hasInitialFetchRef.current = false;
      }
    });

    return unsubscribe;
  }, [dydxAddress, hasDydxWallet, fetchBalance]);

  useEffect(() => {
    if (!dydxAddress || !dydxWalletService.isConnected()) {
      return;
    }

    if (isFirstMountRef.current) {
      isFirstMountRef.current = false;
      subscribeToSubaccount(dydxAddress, subaccountNumber);
    }

    return () => {
      unsubscribeFromSubaccount(dydxAddress, subaccountNumber);
      isFirstMountRef.current = true;
    };
  }, [dydxAddress, subaccountNumber, subscribeToSubaccount, unsubscribeFromSubaccount]);

  const refresh = useCallback(async () => {
    if (dydxAddress && dydxWalletService.isConnected()) {
      await fetchBalance(true);
    } else {
      setError('Cannot refresh - wallet not connected');
    }
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
