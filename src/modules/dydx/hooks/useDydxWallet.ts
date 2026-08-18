import { useCallback, useEffect, useRef, useState } from 'react';

import { useWalletStore } from '../../walletconnect/store/walletConnectStore';
import { dydxWalletService } from '../service/dydxWalletService';
import { useWebSocketStore } from '../store/websocketStore';

export interface AccountBalance {
  /** Total equity across ALL child subaccounts (cross + isolated) */
  totalEquity: string;
  /** Cross subaccount (subaccountNumber 0) equity — shown as Available Balance */
  crossEquity: string;
  /** Parent-level freeCollateral (kept for compatibility) */
  freeCollateral: string;
}

interface UseDydxWalletReturn {
  isConnected: boolean;
  address: string | null;
  balance: AccountBalance | null;

  dataLoaded: boolean;
  lastUpdateTime: number | null;
  isReceivingUpdates: boolean;
  error: string | null;
}

export const useDydxWallet = (): UseDydxWalletReturn => {
  const dydxAddress = useWalletStore(
    useCallback(state => {
      const evm = state.connectedWallets.evm;
      return evm?.dydxAddress || null;
    }, [])
  );

  const [status, setStatus] = useState(() => dydxWalletService.getStatus());

  useEffect(() => {
    return dydxWalletService.onStatusChange(newStatus => {
      setStatus(newStatus);
    });
  }, []);

  const hasDydxWallet = !!dydxAddress;

  const isFirstMountRef = useRef(true);

  const subscribeToParentSubaccount = useWebSocketStore(state => state.subscribeToParentSubaccount);
  const unsubscribeFromParentSubaccount = useWebSocketStore(
    state => state.unsubscribeFromParentSubaccount
  );

  const subaccountNumber = dydxWalletService.getSubaccountNumber();
  const parentKey = dydxAddress ? `parent_subaccount_${dydxAddress}_${subaccountNumber}` : null;

  const updateTrigger = useWebSocketStore(state => state.updateTrigger);
  const parentData = useWebSocketStore(
    useCallback(
      state => (parentKey ? state.parentSubaccounts.get(parentKey) : undefined),
      [parentKey, updateTrigger]
    )
  );

  useEffect(() => {
    if (!dydxAddress || !dydxWalletService.isReadyForTrading()) return;

    subscribeToParentSubaccount(dydxAddress, subaccountNumber);
    isFirstMountRef.current = false;

    return () => {
      unsubscribeFromParentSubaccount(dydxAddress, subaccountNumber);
      isFirstMountRef.current = true;
    };
  }, [
    dydxAddress,
    subaccountNumber,
    status,
    subscribeToParentSubaccount,
    unsubscribeFromParentSubaccount,
  ]);

  const balance: AccountBalance | null = parentData
    ? {
        totalEquity: parentData.equity || '0',
        crossEquity:
          parentData.childSubaccounts?.find(c => c.subaccountNumber === 0)?.equity || '0',
        freeCollateral: parentData.freeCollateral || '0',
      }
    : null;

  const lastUpdateTime = parentData?.lastUpdate ?? null;
  // dataLoaded = WS snapshot has arrived and contains equity
  const dataLoaded =
    parentData !== undefined && parentData.equity !== undefined && parentData.lastUpdate > 0;

  const wsIsConnected = useWebSocketStore(s => s.isConnected);
  const isReceivingUpdates =
    hasDydxWallet && dydxWalletService.isConnected() && wsIsConnected && dataLoaded;

  return {
    isConnected: hasDydxWallet && (status === 'connected' || status === 'no_subaccount'),
    address: dydxAddress,
    balance,
    dataLoaded,
    lastUpdateTime,
    isReceivingUpdates,
    error: null,
  };
};
