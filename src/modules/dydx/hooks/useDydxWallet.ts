import { useCallback, useEffect, useRef, useState } from 'react';

import { useWalletStore } from '../../walletconnect/store/walletConnectStore';
import { getSocketClient } from '../client/clients';
import { type AccountBalance, dydxWalletService } from '../service/dydxWalletService';

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
  const [balance, setBalance] = useState<AccountBalance | null>(null);
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [lastUpdateTime, setLastUpdateTime] = useState<number | null>(null);
  const [isReceivingUpdates, setIsReceivingUpdates] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get wallet info from store
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

  // Refs to prevent loops and track state
  const wsUnsubscribeRef = useRef<(() => void) | null>(null);
  const updateCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastUpdateTimeRef = useRef<number | null>(null);
  const currentAddressRef = useRef<string | null>(null);
  const isFetchingRef = useRef(false);
  const isMountedRef = useRef(true);
  const hasInitialFetchRef = useRef(false);

  // Track mount state
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      console.log('[useDydxWallet] Component unmounting');
      isMountedRef.current = false;
    };
  }, []);

  // Stable fetch function
  const fetchBalance = useCallback(async (forceRefresh = false): Promise<void> => {
    // Prevent concurrent fetches
    if (isFetchingRef.current) {
      console.log('[useDydxWallet] Fetch already in progress, skipping');
      return;
    }

    if (!isMountedRef.current) {
      console.log('[useDydxWallet] Component unmounted, skipping fetch');
      return;
    }

    // Check if wallet service is ready
    if (!dydxWalletService.isConnected()) {
      console.log('[useDydxWallet] Wallet service not connected');
      if (isMountedRef.current) {
        setError('Wallet not connected');
      }
      return;
    }

    console.log('[useDydxWallet] Fetching balance, force:', forceRefresh);
    isFetchingRef.current = true;

    if (isMountedRef.current) {
      setLoadingBalance(true);
      setError(null);
    }

    try {
      const bal = await dydxWalletService.getBalance(forceRefresh);

      if (isMountedRef.current && bal) {
        setBalance(bal);
        const now = Date.now();
        setLastUpdateTime(now);
        lastUpdateTimeRef.current = now;
        hasInitialFetchRef.current = true;
        console.log('[useDydxWallet] Balance fetched successfully:', bal.equity);
      }
    } catch (err: any) {
      console.error('[useDydxWallet] Balance fetch failed:', err);
      if (isMountedRef.current) {
        setError(err.message || 'Failed to fetch balance');
      }
    } finally {
      if (isMountedRef.current) {
        setLoadingBalance(false);
      }
      isFetchingRef.current = false;
    }
  }, []);

  // Effect 1: Handle wallet connection/disconnection
  useEffect(() => {
    console.log('[useDydxWallet] Wallet state:', { dydxAddress, hasDydxWallet });

    // Handle disconnection
    if (!hasDydxWallet || !dydxAddress) {
      if (currentAddressRef.current) {
        console.log('[useDydxWallet] Wallet disconnected, clearing state');
        setBalance(null);
        setLastUpdateTime(null);
        setError(null);
        setIsReceivingUpdates(false);
        lastUpdateTimeRef.current = null;
        currentAddressRef.current = null;
        hasInitialFetchRef.current = false;
      }
      return;
    }

    // Handle new address or initial connection
    const isNewAddress = currentAddressRef.current !== dydxAddress;

    if (isNewAddress) {
      console.log('[useDydxWallet] New address detected:', dydxAddress);
      currentAddressRef.current = dydxAddress;
      hasInitialFetchRef.current = false;

      // Wait a bit for wallet service to be ready, then fetch
      const timeoutId = setTimeout(() => {
        if (dydxWalletService.isConnected()) {
          fetchBalance(true);
        } else {
          console.log('[useDydxWallet] Wallet service not ready yet');
        }
      }, 500);

      return () => clearTimeout(timeoutId);
    } else if (!hasInitialFetchRef.current && dydxWalletService.isConnected()) {
      // Same address but no initial fetch yet (e.g., component remount)
      console.log('[useDydxWallet] Initial fetch for existing address');
      fetchBalance(false);
    }
  }, [dydxAddress, hasDydxWallet, fetchBalance]);

  // Effect 2: WebSocket subscription
  useEffect(() => {
    // Only subscribe if we have an address and service is connected
    if (!dydxAddress || !dydxWalletService.isConnected()) {
      // Cleanup if no address or not connected
      if (wsUnsubscribeRef.current) {
        console.log('[useDydxWallet] Cleaning up WebSocket - not ready');
        wsUnsubscribeRef.current();
        wsUnsubscribeRef.current = null;
      }

      if (updateCheckIntervalRef.current) {
        clearInterval(updateCheckIntervalRef.current);
        updateCheckIntervalRef.current = null;
      }

      if (isMountedRef.current) {
        setIsReceivingUpdates(false);
      }

      return;
    }

    console.log('[useDydxWallet] Setting up WebSocket for:', dydxAddress);

    try {
      // Get socket client
      const socketClient = getSocketClient();

      // Subscribe to real-time updates
      const unsubscribe = socketClient.subscribeToSubaccounts(
        dydxAddress,
        dydxWalletService.getSubaccountNumber(),
        data => {
          if (!isMountedRef.current) return;

          console.log('[useDydxWallet] WebSocket update received');
          setIsReceivingUpdates(true);
          const now = Date.now();
          setLastUpdateTime(now);
          lastUpdateTimeRef.current = now;

          if (data.contents?.subaccount) {
            const sub = data.contents.subaccount;
            setBalance({
              equity: sub.equity || '0',
              freeCollateral: sub.freeCollateral || '0',
              marginUsage: sub.marginUsage || '0',
              totalTradingRewards: sub.totalTradingRewards ?? '0',
            });
          }
        }
      );

      wsUnsubscribeRef.current = unsubscribe;

      // Monitor connection health
      const healthCheckInterval = setInterval(() => {
        if (!isMountedRef.current) return;

        const now = Date.now();
        const lastUpdate = lastUpdateTimeRef.current || 0;

        if (lastUpdate && now - lastUpdate > 30000) {
          console.log('[useDydxWallet] No updates in 30s, marking as stale');
          setIsReceivingUpdates(false);
        }
      }, 10000);

      updateCheckIntervalRef.current = healthCheckInterval;
    } catch (err) {
      console.error('[useDydxWallet] WebSocket setup failed:', err);
      if (isMountedRef.current) {
        setError('Failed to setup real-time updates');
      }
    }

    // Cleanup function
    return () => {
      console.log('[useDydxWallet] Cleaning up WebSocket subscription');

      if (wsUnsubscribeRef.current) {
        wsUnsubscribeRef.current();
        wsUnsubscribeRef.current = null;
      }

      if (updateCheckIntervalRef.current) {
        clearInterval(updateCheckIntervalRef.current);
        updateCheckIntervalRef.current = null;
      }
    };
  }, [dydxAddress]);

  const refresh = useCallback(async () => {
    console.log('[useDydxWallet] Manual refresh requested');
    if (dydxAddress && dydxWalletService.isConnected()) {
      await fetchBalance(true);
    } else {
      console.log('[useDydxWallet] Cannot refresh - not connected');
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
