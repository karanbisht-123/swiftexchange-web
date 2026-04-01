import { useCallback, useEffect, useRef } from 'react';

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
  /** true once the first WS snapshot has been received for this address */
  dataLoaded: boolean;
  lastUpdateTime: number | null;
  isReceivingUpdates: boolean;
  error: string | null;
}

export const useDydxWallet = (): UseDydxWalletReturn => {
  const dydxAddress = useWalletStore(
    useCallback(state => {
      const evm = state.connectedWallets.evm;
      const cosmos = state.connectedWallets.cosmos;
      return evm?.dydxAddress || cosmos?.dydxAddress || null;
    }, [])
  );

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

  // Subscribe to WS parent subaccount when wallet is connected.
  // We intentionally subscribe on every (address, subaccountNumber) change —
  // the store's ref-counting de-dupes repeated calls.
  useEffect(() => {
    if (!dydxAddress || !dydxWalletService.isConnected()) return;

    subscribeToParentSubaccount(dydxAddress, subaccountNumber);
    isFirstMountRef.current = false;

    return () => {
      unsubscribeFromParentSubaccount(dydxAddress, subaccountNumber);
      isFirstMountRef.current = true;
    };
  }, [dydxAddress, subaccountNumber, subscribeToParentSubaccount, unsubscribeFromParentSubaccount]);

  // Derive balance entirely from WS parentData
  const balance: AccountBalance | null = parentData
    ? {
      totalEquity: parentData.equity || '0',
      crossEquity:
        parentData.childSubaccounts?.find(c => c.subaccountNumber === 0)?.equity || '0',
      freeCollateral: parentData.freeCollateral || '0',
    }
    : null;

  const lastUpdateTime = parentData?.lastUpdate ?? null;
  // dataLoaded = WS snapshot has arrived at least once (lastUpdate > 0)
  const dataLoaded = parentData !== undefined && parentData.lastUpdate > 0;

  // isReceivingUpdates reflects whether the WebSocket itself is alive and we
  // have loaded the initial subaccount snapshot.  We deliberately do NOT use
  // the last subaccount message timestamp here, because the subaccount channel
  // is silent when there is no account activity (no trades, no orders, no
  // funding) — that is EXPECTED behaviour, not a broken connection.
  // True connection health is maintained by the browser's native RFC-6455
  // ping/pong frames + our application-level ping every 30 s (see WebSocketManager).
  const wsIsConnected = useWebSocketStore(s => s.isConnected);
  const isReceivingUpdates = hasDydxWallet && dydxWalletService.isConnected() && wsIsConnected && dataLoaded;

  return {
    isConnected: hasDydxWallet && dydxWalletService.isConnected(),
    address: dydxAddress,
    balance,
    dataLoaded,
    lastUpdateTime,
    isReceivingUpdates,
    error: null,
  };
};