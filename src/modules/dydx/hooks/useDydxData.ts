import { useCallback, useEffect, useRef, useState } from 'react';

import {
  type AssetPosition,
  type Fill,
  type Order,
  type Position,
  dydxDataService,
} from '../service/dydxOrderService';
import { dydxWalletService } from '../service/dydxWalletService';
import { useWebSocketStore } from '../store/websocketStore';

interface UseDydxDataReturn {
  positions: Position[];
  loadingPositions: boolean;
  positionsError: string | null;
  refreshPositions: () => Promise<void>;

  assetPositions: AssetPosition[];
  loadingAssetPositions: boolean;
  assetPositionsError: string | null;
  refreshAssetPositions: () => Promise<void>;

  orders: Order[];
  loadingOrders: boolean;
  ordersError: string | null;
  refreshOrders: () => Promise<void>;

  fills: Fill[];
  loadingFills: boolean;
  fillsError: string | null;
  refreshFills: () => Promise<void>;

  isConnected: boolean;
  isReceivingUpdates: boolean;
  lastUpdateTime: number | null;
}

export const useDydxData = (): UseDydxDataReturn => {
  const [loadingPositions, setLoadingPositions] = useState(false);
  const [positionsError, setPositionsError] = useState<string | null>(null);

  const [loadingAssetPositions, setLoadingAssetPositions] = useState(false);
  const [assetPositionsError, setAssetPositionsError] = useState<string | null>(null);

  const [loadingOrders, setLoadingOrders] = useState(false);
  const [ordersError, setOrdersError] = useState<string | null>(null);

  const [loadingFills, setLoadingFills] = useState(false);
  const [fillsError, setFillsError] = useState<string | null>(null);

  const [isConnected, setIsConnected] = useState(false);

  const isMountedRef = useRef(true);
  const hasInitialFetchRef = useRef(false);
  const isFetchingRef = useRef({
    positions: false,
    assetPositions: false,
    orders: false,
    fills: false,
  });

  const isFirstMountRef = useRef(true);

  const subscribeToSubaccount = useWebSocketStore(state => state.subscribeToSubaccount);
  const unsubscribeFromSubaccount = useWebSocketStore(state => state.unsubscribeFromSubaccount);
  const updateTrigger = useWebSocketStore(state => state.updateTrigger);

  const dydxAddress = dydxWalletService.getAddress();
  const subaccountNumber = dydxWalletService.getSubaccountNumber();

  const subaccountKey = dydxAddress ? `subaccount_${dydxAddress}_${subaccountNumber}` : null;

  const subaccountData = useWebSocketStore(
    useCallback(
      state => (subaccountKey ? state.subaccounts.get(subaccountKey) : null),
      [subaccountKey, updateTrigger]
    )
  );

  const positions = subaccountData?.openPerpetualPositions
    ? Array.isArray(subaccountData.openPerpetualPositions)
      ? subaccountData.openPerpetualPositions
      : Object.values(subaccountData.openPerpetualPositions)
    : [];

  const assetPositions = subaccountData?.assetPositions
    ? Array.isArray(subaccountData.assetPositions)
      ? subaccountData.assetPositions
      : Object.values(subaccountData.assetPositions)
    : [];

  const orders = subaccountData?.orders || [];
  const fills = subaccountData?.fills || [];
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

  const updateSubaccount = useWebSocketStore(state => state.updateSubaccount);

  const fetchPositions = useCallback(
    async (forceRefresh = false): Promise<void> => {
      if (isFetchingRef.current.positions || !isMountedRef.current) return;
      if (!dydxDataService.isReady() || !subaccountKey) return;

      isFetchingRef.current.positions = true;
      if (isMountedRef.current) {
        setLoadingPositions(true);
        setPositionsError(null);
      }

      try {
        const data = await (forceRefresh
          ? dydxDataService.refreshPositions('OPEN')
          : dydxDataService.getPositions('OPEN'));

        if (isMountedRef.current) {
          updateSubaccount(subaccountKey, {
            openPerpetualPositions: data,
            lastUpdate: Date.now(),
          });
        }
      } catch (err: any) {
        console.error('[useDydxData] Positions fetch failed:', err);
        if (isMountedRef.current) {
          setPositionsError(err.message || 'Failed to fetch positions');
        }
      } finally {
        if (isMountedRef.current) setLoadingPositions(false);
        isFetchingRef.current.positions = false;
      }
    },
    [subaccountKey, updateSubaccount]
  );

  const fetchAssetPositions = useCallback(
    async (forceRefresh = false): Promise<void> => {
      if (isFetchingRef.current.assetPositions || !isMountedRef.current) return;
      if (!dydxDataService.isReady() || !subaccountKey) return;

      isFetchingRef.current.assetPositions = true;
      if (isMountedRef.current) {
        setLoadingAssetPositions(true);
        setAssetPositionsError(null);
      }

      try {
        const data = await dydxDataService.getAssetPositions('OPEN', undefined, !forceRefresh);

        if (isMountedRef.current) {
          updateSubaccount(subaccountKey, {
            assetPositions: data,
            lastUpdate: Date.now(),
          });
        }
      } catch (err: any) {
        console.error('[useDydxData] Asset positions fetch failed:', err);
        if (isMountedRef.current) {
          setAssetPositionsError(err.message || 'Failed to fetch asset positions');
        }
      } finally {
        if (isMountedRef.current) setLoadingAssetPositions(false);
        isFetchingRef.current.assetPositions = false;
      }
    },
    [subaccountKey, updateSubaccount]
  );

  const fetchOrders = useCallback(
    async (forceRefresh = false): Promise<void> => {
      if (isFetchingRef.current.orders || !isMountedRef.current) return;
      if (!dydxDataService.isReady() || !subaccountKey) return;

      isFetchingRef.current.orders = true;
      if (isMountedRef.current) {
        setLoadingOrders(true);
        setOrdersError(null);
      }

      try {
        const data = await (forceRefresh
          ? dydxDataService.refreshOrders()
          : dydxDataService.getOrders());

        if (isMountedRef.current) {
          updateSubaccount(subaccountKey, {
            orders: data,
            lastUpdate: Date.now(),
          });
        }
      } catch (err: any) {
        console.error('[useDydxData] Orders fetch failed:', err);
        if (isMountedRef.current) {
          setOrdersError(err.message || 'Failed to fetch orders');
        }
      } finally {
        if (isMountedRef.current) setLoadingOrders(false);
        isFetchingRef.current.orders = false;
      }
    },
    [subaccountKey, updateSubaccount]
  );

  const fetchFills = useCallback(
    async (forceRefresh = false): Promise<void> => {
      if (isFetchingRef.current.fills || !isMountedRef.current) return;
      if (!dydxDataService.isReady() || !subaccountKey) return;

      isFetchingRef.current.fills = true;
      if (isMountedRef.current) {
        setLoadingFills(true);
        setFillsError(null);
      }

      try {
        const data = await (forceRefresh
          ? dydxDataService.refreshFills()
          : dydxDataService.getFills());

        if (isMountedRef.current) {
          updateSubaccount(subaccountKey, {
            fills: data,
            lastUpdate: Date.now(),
          });
        }
      } catch (err: any) {
        console.error('[useDydxData] Fills fetch failed:', err);
        if (isMountedRef.current) {
          setFillsError(err.message || 'Failed to fetch fills');
        }
      } finally {
        if (isMountedRef.current) setLoadingFills(false);
        isFetchingRef.current.fills = false;
      }
    },
    [subaccountKey, updateSubaccount]
  );

  useEffect(() => {
    const unsubscribe = dydxWalletService.onStatusChange(status => {
      if (!isMountedRef.current) return;

      if (status === 'connected') {
        setIsConnected(true);
        if (!hasInitialFetchRef.current) {
          hasInitialFetchRef.current = true;
          setTimeout(() => fetchPositions(true), 100);
          setTimeout(() => fetchAssetPositions(true), 300);
          setTimeout(() => fetchOrders(true), 500);
          setTimeout(() => fetchFills(true), 700);
        }
      } else if (status === 'disconnected') {
        setIsConnected(false);
        hasInitialFetchRef.current = false;
      }
    });

    if (dydxWalletService.isConnected()) {
      setIsConnected(true);
      if (!hasInitialFetchRef.current) {
        hasInitialFetchRef.current = true;
        setTimeout(() => fetchPositions(true), 100);
        setTimeout(() => fetchAssetPositions(true), 300);
        setTimeout(() => fetchOrders(true), 500);
        setTimeout(() => fetchFills(true), 700);
      }
    }

    return unsubscribe;
  }, [fetchPositions, fetchAssetPositions, fetchOrders, fetchFills]);

  useEffect(() => {
    if (!dydxAddress || !isConnected) {
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
  }, [
    dydxAddress,
    subaccountNumber,
    isConnected,
    subscribeToSubaccount,
    unsubscribeFromSubaccount,
  ]);

  return {
    positions,
    loadingPositions,
    positionsError,
    refreshPositions: useCallback(() => fetchPositions(true), [fetchPositions]),

    assetPositions,
    loadingAssetPositions,
    assetPositionsError,
    refreshAssetPositions: useCallback(() => fetchAssetPositions(true), [fetchAssetPositions]),

    orders,
    loadingOrders,
    ordersError,
    refreshOrders: useCallback(() => fetchOrders(true), [fetchOrders]),

    fills,
    loadingFills,
    fillsError,
    refreshFills: useCallback(() => fetchFills(true), [fetchFills]),

    isConnected,
    isReceivingUpdates,
    lastUpdateTime,
  };
};
