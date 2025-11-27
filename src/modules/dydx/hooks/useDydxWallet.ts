import { useCallback, useEffect, useRef, useState } from 'react';

import { WalletType } from '../../walletconnect/constants/Wallet';
import { useWalletStore } from '../../walletconnect/store/walletConnectStore';
import { getSocketClient } from '../client/clients';
import {
  type AccountBalance,
  type DydxConnection,
  type DydxStatus,
  dydxWalletService,
} from '../service/dydxWalletService';

interface UseDydxWalletReturn {
  connection: DydxConnection | null;
  status: DydxStatus;
  error: string | null;
  isLoading: boolean;

  balance: AccountBalance | null;
  loadingBalance: boolean;

  isConnected: boolean;
  isConnecting: boolean;
  address: string | null;
  hasSubaccount: boolean;
  canConnect: boolean;

  connect: (subaccountNumber?: number) => Promise<DydxConnection | null>;
  disconnect: () => Promise<void>;
  getBalance: (forceRefresh?: boolean) => Promise<AccountBalance | null>;
  refresh: () => Promise<void>;

  clearError: () => void;
  service: typeof dydxWalletService;
}

export const useDydxWallet = (autoConnect = true): UseDydxWalletReturn => {
  const [connection, setConnection] = useState<DydxConnection | null>(null);
  const [status, setStatus] = useState<DydxStatus>(dydxWalletService.getStatus());
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [balance, setBalance] = useState<AccountBalance | null>(null);
  const [loadingBalance, setLoadingBalance] = useState(false);

  const cosmosWallet = useWalletStore(s => s.connectedWallets[WalletType.COSMOS]);
  const network = useWalletStore(s => s.network);

  const autoConnectAttempted = useRef(false);
  const isConnectingRef = useRef(false);
  const previousNetworkRef = useRef(network);
  const wsUnsubscribeRef = useRef<(() => void) | null>(null);

  const connect = useCallback(
    async (subaccountNumber = 0): Promise<DydxConnection | null> => {
      if (!cosmosWallet) {
        const msg = 'Please connect your Cosmos wallet (Keplr/Leap) first';
        setError(msg);
        return null;
      }

      if (isConnectingRef.current) {
        return null;
      }

      isConnectingRef.current = true;
      setIsLoading(true);
      setError(null);

      try {
        const conn = await dydxWalletService.connect(subaccountNumber);

        setConnection(conn);
        setBalance(conn.balance ?? null);

        return conn;
      } catch (err: any) {
        const msg = err.message || 'Failed to connect to dYdX';
        console.error('[useDydxWallet] Connect error:', msg);
        setError(msg);
        return null;
      } finally {
        setIsLoading(false);
        isConnectingRef.current = false;
      }
    },
    [cosmosWallet]
  );

  const disconnect = useCallback(async () => {
    if (wsUnsubscribeRef.current) {
      wsUnsubscribeRef.current();
      wsUnsubscribeRef.current = null;
    }

    await dydxWalletService.disconnect();
    setConnection(null);
    setBalance(null);
    setError(null);
    autoConnectAttempted.current = false;
    isConnectingRef.current = false;
  }, []);

  const getBalance = useCallback(
    async (forceRefresh = false): Promise<AccountBalance | null> => {
      if (!dydxWalletService.isConnected()) return null;
      if (loadingBalance && !forceRefresh) return balance;

      setLoadingBalance(true);
      try {
        const bal = await dydxWalletService.getBalance(forceRefresh);
        setBalance(bal);
        return bal;
      } catch (err: any) {
        setError(err.message || 'Failed to fetch balance');
        return null;
      } finally {
        setLoadingBalance(false);
      }
    },
    [balance, loadingBalance]
  );

  const refresh = useCallback(async () => {
    if (!dydxWalletService.isConnected()) return;
    await getBalance(true);
  }, [getBalance]);

  const clearError = useCallback(() => setError(null), []);

  useEffect(() => {
    if (
      autoConnect &&
      cosmosWallet &&
      !dydxWalletService.isConnected() &&
      !autoConnectAttempted.current &&
      !isConnectingRef.current
    ) {
      autoConnectAttempted.current = true;
      connect(0).catch(() => {});
    }
  }, [autoConnect, cosmosWallet, connect]);

  useEffect(() => {
    const networkChanged = previousNetworkRef.current !== network;
    previousNetworkRef.current = network;

    if (networkChanged && dydxWalletService.isConnected() && !isConnectingRef.current) {
      console.log('[useDydxWallet] Network changed, reconnecting...');
      setError('Network changed – reconnecting...');

      const reconnect = async () => {
        try {
          await disconnect();
          await new Promise(resolve => setTimeout(resolve, 500));
          await connect(dydxWalletService.getSubaccountNumber());
        } catch (err: any) {
          console.error('[useDydxWallet] Network change reconnection failed:', err);
          setError('Failed to reconnect after network change');
        }
      };

      reconnect();
    }
  }, [network, connect, disconnect]);

  useEffect(() => {
    if (!cosmosWallet && dydxWalletService.isConnected()) {
      disconnect();
    }
  }, [cosmosWallet, disconnect]);

  useEffect(() => {
    const unsubscribe = dydxWalletService.onStatusChange((newStatus, payload) => {
      setStatus(newStatus);

      if (newStatus === 'connected' || newStatus === 'no_subaccount') {
        const addr = dydxWalletService.getAddress();
        const subNo = dydxWalletService.getSubaccountNumber();

        if (addr) {
          setConnection({
            address: addr,
            chainId: payload?.chainId || '',
            subaccountNumber: subNo,
            hasSubaccount: newStatus === 'connected',
            balance: payload?.balance,
          });
        }

        setError(null);
        setIsLoading(false);
        isConnectingRef.current = false;

        if (newStatus === 'connected') {
          dydxWalletService
            .getBalance(true)
            .then(setBalance)
            .catch(err => {
              console.error('[useDydxWallet] Failed to fetch balance:', err);
            });
        }
      }

      if (newStatus === 'connecting') {
        setIsLoading(true);
        setError(null);
      }

      if (newStatus === 'error') {
        setError(payload?.error || 'Unknown error');
        setIsLoading(false);
        isConnectingRef.current = false;
      }

      if (newStatus === 'disconnected') {
        setConnection(null);
        setBalance(null);
        setError(null);
        setIsLoading(false);
        isConnectingRef.current = false;
      }
    });

    setStatus(dydxWalletService.getStatus());

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!dydxWalletService.isConnected()) return;

    const addr = dydxWalletService.getAddress();
    const subNo = dydxWalletService.getSubaccountNumber();

    if (!addr) return;

    console.log('[useDydxWallet] Subscribing to subaccount updates:', addr, subNo);

    const socketClient = getSocketClient();

    const unsubscribe = socketClient.subscribeToSubaccounts(
      addr,
      subNo,
      data => {
        console.log(data, 'Subaccount update data ----------------');
        if (data.contents?.subaccount) {
          const subaccount = data.contents.subaccount;

          const updatedBalance: AccountBalance = {
            equity: subaccount.equity || '0',
            freeCollateral: subaccount.freeCollateral || '0',
            marginUsage: subaccount.marginUsage || '0',
            totalTradingRewards: subaccount.totalTradingRewards ?? '0',
          };

          console.log(updatedBalance, 'update AccountBalance----------------');

          console.log('[useDydxWallet] Balance updated via WebSocket:', updatedBalance);
          setBalance(updatedBalance);
        }
      },
      false
    );

    wsUnsubscribeRef.current = unsubscribe;

    return () => {
      console.log('[useDydxWallet] Unsubscribing from subaccount updates');
      unsubscribe();
      wsUnsubscribeRef.current = null;
    };
  }, [status]);

  const isConnected = dydxWalletService.isConnected();
  const isConnecting = status === 'connecting';
  const address = dydxWalletService.getAddress();
  const hasSubaccount = status === 'connected';

  return {
    connection,
    status,
    error,
    isLoading,

    balance,
    loadingBalance,

    isConnected,
    isConnecting,
    address,
    hasSubaccount,
    canConnect: !!cosmosWallet,

    connect,
    disconnect,
    getBalance,
    refresh,

    clearError,
    service: dydxWalletService,
  };
};
