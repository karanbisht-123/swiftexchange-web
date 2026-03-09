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
  const prevWsConnectedRef = useRef(false);

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
      const timeA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const timeB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
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


  const refreshOrders = useCallback(async (): Promise<void> => {
    if (!dydxDataService.isReady() || !parentKey || isFetchingRef.current) return;

    setLoadingOrders(true);
    setOrdersError(null);

    try {
      const data = await dydxDataService.refreshOrders(undefined, undefined);

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
      const data = await dydxDataService.refreshFills(undefined, undefined);

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
    if (!dydxDataService.isReady() || !parentKey || isFetchingRef.current) return;
    try {
      const positionsData = await dydxDataService.refreshPositions('OPEN');
      if (isMountedRef.current && parentKey) {
        useWebSocketStore.setState(state => {
          const existing = state.parentSubaccounts.get(parentKey);
          if (!existing) return state;

          const newChildMap = new Map();
          existing.childSubaccounts.forEach(c => newChildMap.set(c.subaccountNumber, { ...c, openPerpetualPositions: {} }));

          positionsData.forEach(pos => {
            const subNum = pos.subaccountNumber ?? existing.parentSubaccountNumber ?? 0;
            if (!newChildMap.has(subNum)) {
              newChildMap.set(subNum, {
                subaccountNumber: subNum,
                address: existing.address,
                equity: '0',
                freeCollateral: '0',
                openPerpetualPositions: {},
                assetPositions: {},
                marginEnabled: true,
                updatedAtHeight: '0',
                latestProcessedBlockHeight: '0'
              });
            }
            newChildMap.get(subNum).openPerpetualPositions[pos.market] = pos;
          });

          const childSubaccounts = Array.from(newChildMap.values());
          const newMap = new Map(state.parentSubaccounts);
          newMap.set(parentKey, { ...existing, childSubaccounts, lastUpdate: Date.now() });
          return { parentSubaccounts: newMap, updateTrigger: state.updateTrigger + 1 };
        });
      }
    } catch (err) {
      console.error('[useDydxData] Positions refresh failed:', err);
    }
  }, [parentKey]);

  const refreshAssetPositions = useCallback(async (): Promise<void> => {
    if (!dydxDataService.isReady() || !parentKey || isFetchingRef.current) return;
    try {
      const assetData = await dydxDataService.getAssetPositions('OPEN', undefined, false);
      if (isMountedRef.current && parentKey) {
        useWebSocketStore.setState(state => {
          const existing = state.parentSubaccounts.get(parentKey);
          if (!existing) return state;

          const newChildMap = new Map();
          existing.childSubaccounts.forEach(c => newChildMap.set(c.subaccountNumber, { ...c, assetPositions: {} }));

          assetData.forEach((asset: any) => {
            const subNum = asset.subaccountNumber ?? existing.parentSubaccountNumber ?? 0;
            if (!newChildMap.has(subNum)) {
              newChildMap.set(subNum, {
                subaccountNumber: subNum,
                address: existing.address,
                equity: '0',
                freeCollateral: '0',
                openPerpetualPositions: {},
                assetPositions: {},
                marginEnabled: true,
                updatedAtHeight: '0',
                latestProcessedBlockHeight: '0'
              });
            }
            newChildMap.get(subNum).assetPositions[asset.symbol] = asset;
          });

          const childSubaccounts = Array.from(newChildMap.values());
          const newMap = new Map(state.parentSubaccounts);
          newMap.set(parentKey, { ...existing, childSubaccounts, lastUpdate: Date.now() });
          return { parentSubaccounts: newMap, updateTrigger: state.updateTrigger + 1 };
        });
      }
    } catch (err) {
      console.error('[useDydxData] Asset positions refresh failed:', err);
    }
  }, [parentKey]);

  useEffect(() => {
    if (!dydxAddress || !isConnected) return;

    const wsJustReconnected = !prevWsConnectedRef.current && isConnected;
    prevWsConnectedRef.current = isConnected;

    if (isFirstMountRef.current) {
      isFirstMountRef.current = false;
      subscribeToParentSubaccount(dydxAddress, subaccountNumber);
      hasInitializedRef.current = true;
    } else if (wsJustReconnected) {
      hasInitializedRef.current = true;
    }

    return () => {
      unsubscribeFromParentSubaccount(dydxAddress, subaccountNumber);
      isFirstMountRef.current = true;
      prevWsConnectedRef.current = false;
    };
  }, [
    dydxAddress,
    subaccountNumber,
    isConnected,
    subscribeToParentSubaccount,
    unsubscribeFromParentSubaccount,
  ]);

  useEffect(() => {
    const unsubscribe = dydxWalletService.onStatusChange(status => {
      if (!isMountedRef.current) return;

      if (status === 'connected') {
        setIsConnected(true);
      } else if (status === 'disconnected') {
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
