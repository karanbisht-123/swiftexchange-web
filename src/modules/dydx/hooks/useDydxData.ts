import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

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
  openOrders: Order[];
  loadingOrders: boolean;
  ordersError: string | null;
  refreshOrders: () => Promise<void>;

  fills: Fill[];
  loadingFills: boolean;
  fillsError: string | null;
  refreshFills: () => Promise<void>;

  openOrderCount: number;
  activePositionCount: number;
  fillCount: number;

  isConnected: boolean;
  isReceivingUpdates: boolean;
  lastUpdateTime: number | null;
}

export const useDydxData = (): UseDydxDataReturn => {
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [ordersError, setOrdersError] = useState<string | null>(null);

  const [loadingFills, setLoadingFills] = useState(false);
  const [fillsError, setFillsError] = useState<string | null>(null);

  const [isConnected, setIsConnected] = useState(false);

  const isMountedRef = useRef(true);
  const hasInitializedRef = useRef(false);
  const isFirstMountRef = useRef(true);
  const isFetchingRef = useRef(false);

  const subscribeToParentSubaccount = useWebSocketStore(state => state.subscribeToParentSubaccount);
  const unsubscribeFromParentSubaccount = useWebSocketStore(
    state => state.unsubscribeFromParentSubaccount
  );

  const dydxAddress = dydxWalletService.getAddress();
  const subaccountNumber = dydxWalletService.getSubaccountNumber();

  const parentKey = dydxAddress ? `parent_subaccount_${dydxAddress}_${subaccountNumber}` : null;

  const { parentData, updateTrigger } = useWebSocketStore(
    useShallow(state => ({
      parentData: parentKey ? state.parentSubaccounts.get(parentKey) : null,
      updateTrigger: state.updateTrigger,
    }))
  );

  const OPEN_ORDER_STATUSES = ['OPEN', 'PARTIALLY_FILLED', 'BEST_EFFORT_OPENED', 'UNTRIGGERED'];
  const TERMINAL_ORDER_STATUSES = ['FILLED', 'CANCELED', 'BEST_EFFORT_CANCELED', 'REJECTED'];

  const positions = useMemo(() => {
    const raw =
      parentData?.childSubaccounts?.flatMap(child =>
        Object.values(child.openPerpetualPositions || {}).map(pos => ({
          ...pos,
          subaccountNumber: child.subaccountNumber,
        }))
      ) || [];

    const filtered = raw.filter(p => Math.abs(parseFloat(p.size || '0')) > 0);

    console.log('[useDydxData]  Positions computed:', {
      childSubaccountsCount: parentData?.childSubaccounts?.length ?? 0,
      rawPositions: raw.length,
      filteredPositions: filtered.length,
      parentKey,
    });

    return filtered;
  }, [parentData?.childSubaccounts, updateTrigger, parentKey]);

  const assetPositions = useMemo(() => {
    return (
      parentData?.childSubaccounts?.flatMap(child => Object.values(child.assetPositions || {})) ||
      []
    );
  }, [parentData?.childSubaccounts, updateTrigger]);

  const orders = useMemo(() => {
    const allOrders = parentData?.orders || [];
    return [...allOrders].sort((a, b) => {
      const timeA = a.updatedAt ? new Date(a.updatedAt).getTime() : Number(a.createdAtHeight || 0);
      const timeB = b.updatedAt ? new Date(b.updatedAt).getTime() : Number(b.createdAtHeight || 0);
      return timeB - timeA;
    });
  }, [parentData?.orders, updateTrigger]);

  const openOrders = useMemo(() => {
    return orders.filter(order =>
      OPEN_ORDER_STATUSES.includes(order.status) &&
      !TERMINAL_ORDER_STATUSES.includes(order.status)
    );
  }, [orders]);

  const fills = useMemo(() => {
    const allFills = parentData?.fills || [];
    return [...allFills].sort((a, b) => {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [parentData?.fills, updateTrigger]);

  const openOrderCount = openOrders.length;
  const activePositionCount = positions.length;
  const fillCount = fills.length;

  const lastUpdateTime = parentData?.lastUpdate || null;
  const isReceivingUpdates = parentData ? Date.now() - parentData.lastUpdate < 30000 : false;

  const loadingPositions = false;
  const positionsError = null;
  const loadingAssetPositions = false;
  const assetPositionsError = null;

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);
  const fetchHistoricalData = useCallback(async (): Promise<void> => {
    if (isFetchingRef.current || hasInitializedRef.current) {
      console.log('[useDydxData] Skipping fetch - already initialized or in progress');
      return;
    }

    if (!dydxDataService.isReady() || !parentKey) {
      console.log('[useDydxData] Skipping fetch - not ready');
      return;
    }

    isFetchingRef.current = true;
    hasInitializedRef.current = true;

    console.log('[useDydxData] Starting historical data fetch...');

    setLoadingOrders(true);
    setLoadingFills(true);

    try {
      const [orderData, fillData] = await Promise.all([
        dydxDataService.getOrders(undefined, 100, true, false),
        dydxDataService.getFills(undefined, 100, undefined, false),
      ]);

      console.log('[useDydxData] Historical data fetched:', {
        orders: orderData.length,
        fills: fillData.length,
      });

      if (isMountedRef.current && parentKey) {

        const currentData = useWebSocketStore.getState().parentSubaccounts.get(parentKey);

        const existingOrderIds = new Set((currentData?.orders || []).map(o => o.id));
        const newOrders = orderData.filter(o => !existingOrderIds.has(o.id));
        const mergedOrders = [...(currentData?.orders || []), ...newOrders];

        const existingFillIds = new Set((currentData?.fills || []).map(f => f.id));
        const newFills = fillData.filter(f => !existingFillIds.has(f.id));
        const mergedFills = [...(currentData?.fills || []), ...newFills];

        useWebSocketStore.getState().updateParentSubaccount(parentKey, {
          orders: mergedOrders,
          fills: mergedFills,
          lastUpdate: Date.now(),
        });

        console.log('[useDydxData] Historical data merged into store');
      }
    } catch (err: any) {
      console.error('[useDydxData] Historical data fetch failed:', err);
      if (isMountedRef.current) {
        setOrdersError(err.message || 'Failed to fetch historical orders');
        setFillsError(err.message || 'Failed to fetch historical fills');
      }
    } finally {
      if (isMountedRef.current) {
        setLoadingOrders(false);
        setLoadingFills(false);
      }
      isFetchingRef.current = false;
    }
  }, [parentKey]);

  const refreshOrders = useCallback(async (): Promise<void> => {
    if (!dydxDataService.isReady() || !parentKey || isFetchingRef.current) return;

    setLoadingOrders(true);
    setOrdersError(null);

    try {
      const data = await dydxDataService.refreshOrders(undefined, 100);
      console.log('[useDydxData] Orders manually refreshed:', data.length);

      if (isMountedRef.current && parentKey) {
        useWebSocketStore.getState().updateParentSubaccount(parentKey, {
          orders: data,
          lastUpdate: Date.now(),
        });
      }
    } catch (err: any) {
      console.error('[useDydxData] Orders refresh failed:', err);
      if (isMountedRef.current) {
        setOrdersError(err.message || 'Failed to refresh orders');
      }
    } finally {
      if (isMountedRef.current) setLoadingOrders(false);
    }
  }, [parentKey]);

  const refreshFills = useCallback(async (): Promise<void> => {
    if (!dydxDataService.isReady() || !parentKey || isFetchingRef.current) return;

    setLoadingFills(true);
    setFillsError(null);

    try {
      const data = await dydxDataService.refreshFills(undefined, 100);
      console.log('[useDydxData] Fills manually refreshed:', data.length);

      if (isMountedRef.current && parentKey) {
        useWebSocketStore.getState().updateParentSubaccount(parentKey, {
          fills: data,
          lastUpdate: Date.now(),
        });
      }
    } catch (err: any) {
      console.error('[useDydxData] Fills refresh failed:', err);
      if (isMountedRef.current) {
        setFillsError(err.message || 'Failed to refresh fills');
      }
    } finally {
      if (isMountedRef.current) setLoadingFills(false);
    }
  }, [parentKey]);

  const refreshPositions = useCallback(async (): Promise<void> => {
    console.log('[useDydxData] Positions are real-time from WebSocket');
  }, []);

  const refreshAssetPositions = useCallback(async (): Promise<void> => {
    console.log('[useDydxData] Asset positions are real-time from WebSocket');
  }, []);

  useEffect(() => {
    if (!dydxAddress || !isConnected) {
      return;
    }

    if (isFirstMountRef.current) {
      isFirstMountRef.current = false;
      subscribeToParentSubaccount(dydxAddress, subaccountNumber);
      console.log('[useDydxData] WebSocket subscribed');

      setTimeout(() => {
        if (!hasInitializedRef.current) {
          fetchHistoricalData();
        }
      }, 1000);
    }

    return () => {
      unsubscribeFromParentSubaccount(dydxAddress, subaccountNumber);
      isFirstMountRef.current = true;
      console.log('[useDydxData] WebSocket unsubscribed');
    };
  }, [
    dydxAddress,
    subaccountNumber,
    isConnected,
    subscribeToParentSubaccount,
    unsubscribeFromParentSubaccount,
    fetchHistoricalData,
  ]);

  useEffect(() => {
    const unsubscribe = dydxWalletService.onStatusChange(status => {
      if (!isMountedRef.current) return;

      if (status === 'connected') {
        console.log('[useDydxData] Wallet connected');
        setIsConnected(true);
      } else if (status === 'disconnected') {
        console.log('[useDydxData] Wallet disconnected');
        setIsConnected(false);
        hasInitializedRef.current = false;
        isFetchingRef.current = false;
      }
    });

    if (dydxWalletService.isConnected()) {
      setIsConnected(true);
    }

    return unsubscribe;
  }, []);

  return {
    positions,
    loadingPositions,
    positionsError,
    refreshPositions,

    assetPositions,
    loadingAssetPositions,
    assetPositionsError,
    refreshAssetPositions,

    orders,
    openOrders,
    loadingOrders,
    ordersError,
    refreshOrders,

    fills,
    loadingFills,
    fillsError,
    refreshFills,

    openOrderCount,
    activePositionCount,
    fillCount,

    isConnected,
    isReceivingUpdates,
    lastUpdateTime,
  };
};
