import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  type AssetPosition,
  type Fill,
  type Order,
  type Position,
  dydxDataService,
} from '../service/dydxOrderService';
import { dydxWalletService } from '../service/dydxWalletService';
import { type TrackedOrder, selectOpenOrders, useWebSocketStore } from '../store/websocketStore';

interface UseDydxDataReturn {
  positions: Position[];
  loadingPositions: boolean;
  positionsError: string | null;
  refreshPositions: () => Promise<void>;

  assetPositions: AssetPosition[];
  loadingAssetPositions: boolean;
  assetPositionsError: string | null;
  refreshAssetPositions: () => Promise<void>;

  orders: TrackedOrder[];
  openOrders: TrackedOrder[];
  loadingOrders: boolean;
  ordersError: string | null;
  refreshOrders: () => Promise<void>;

  fills: Fill[];
  loadingFills: boolean;
  fillsError: string | null;
  refreshFills: () => Promise<void>;
  loadMoreFills: () => Promise<any[]>;
  parentKey: string | null;

  openOrderCount: number;
  activePositionCount: number;
  fillCount: number;

  isConnected: boolean;
  isReceivingUpdates: boolean;
  lastUpdateTime: number | null;
  blockHeight: string;
}

const WS_FRESHNESS_MS = 30_000;

export const useDydxData = (): UseDydxDataReturn => {
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [loadingFills, setLoadingFills] = useState(false);
  const [fillsError, setFillsError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const isMountedRef = useRef(true);
  const hasInitializedRef = useRef(false);
  const isFirstMountRef = useRef(true);
  const isFetchingOrdersRef = useRef(false);
  const isFetchingFillsRef = useRef(false);
  const isFetchingPositionsRef = useRef(false);
  const isFetchingAssetPositionsRef = useRef(false);
  const prevWsConnectedRef = useRef(false);

  const subscribeToParentSubaccount = useWebSocketStore(s => s.subscribeToParentSubaccount);
  const unsubscribeFromParentSubaccount = useWebSocketStore(s => s.unsubscribeFromParentSubaccount);

  const dydxAddress = dydxWalletService.getAddress();
  const subaccountNumber = dydxWalletService.getSubaccountNumber();
  const parentKey = dydxAddress ? `parent_subaccount_${dydxAddress}_${subaccountNumber}` : null;

  const parentData = useWebSocketStore(
    useCallback(s => (parentKey ? s.parentSubaccounts.get(parentKey) : undefined), [parentKey])
  );

  const positions = useMemo(() => {
    const raw =
      parentData?.childSubaccounts?.flatMap(child =>
        Object.values(child.openPerpetualPositions || {}).map(pos => ({
          ...pos,
          subaccountNumber: child.subaccountNumber,
        }))
      ) ?? [];
    return raw.filter(p => Math.abs(parseFloat(p.size || '0')) > 0);
  }, [parentData?.childSubaccounts]);

  const assetPositions = useMemo(() => {
    return (
      parentData?.childSubaccounts?.flatMap(child => Object.values(child.assetPositions || {})) ??
      []
    );
  }, [parentData?.childSubaccounts]);

  const orders = useMemo<TrackedOrder[]>(() => {
    const all = parentData?.orders ?? [];
    return [...all].sort((a, b) => {
      const tA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const tB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return tB - tA;
    });
  }, [parentData?.orders]);

  const openOrders = useMemo<TrackedOrder[]>(() => selectOpenOrders(parentData), [parentData]);

  const fills = useMemo(() => {
    const all = parentData?.fills ?? [];
    return [...all].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [parentData?.fills]);

  const openOrderCount = openOrders.length;
  const activePositionCount = positions.length;
  const fillCount = fills.length;
  const blockHeight = parentData?.blockHeight ?? '0';
  const lastUpdateTime = parentData?.lastUpdate ?? null;
  const isReceivingUpdates = parentData
    ? Date.now() - parentData.lastUpdate < WS_FRESHNESS_MS
    : false;

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
    if (!dydxDataService.isReady() || !parentKey || isFetchingOrdersRef.current) return;

    isFetchingOrdersRef.current = true;
    setLoadingOrders(true);
    setOrdersError(null);

    try {
      const data: Order[] = await dydxDataService.refreshOrders(undefined, undefined);

      if (isMountedRef.current && parentKey) {
        useWebSocketStore
          .getState()
          .updateParentSubaccount(parentKey, { orders: data as any, lastUpdate: Date.now() }, 0);
      }
    } catch (err: any) {
      console.error('[useDydxData] Orders refresh failed:', err);
      if (isMountedRef.current) setOrdersError(err.message || 'Failed to refresh orders');
    } finally {
      isFetchingOrdersRef.current = false;
      if (isMountedRef.current) setLoadingOrders(false);
    }
  }, [parentKey]);

  const refreshFills = useCallback(async (): Promise<void> => {
    if (!dydxDataService.isReady() || !parentKey || isFetchingFillsRef.current) return;

    isFetchingFillsRef.current = true;
    setLoadingFills(true);
    setFillsError(null);

    try {
      const data = await dydxDataService.refreshFills(undefined, undefined);
      if (isMountedRef.current && parentKey) {
        useWebSocketStore
          .getState()
          .updateParentSubaccount(parentKey, { fills: data as any, lastUpdate: Date.now() });
      }
    } catch (err: any) {
      console.error('[useDydxData] Fills refresh failed:', err);
      if (isMountedRef.current) setFillsError(err.message || 'Failed to refresh fills');
    } finally {
      isFetchingFillsRef.current = false;
      if (isMountedRef.current) setLoadingFills(false);
    }
  }, [parentKey]);

  const loadMoreFills = useCallback(async (): Promise<any[]> => {
    if (!dydxDataService.isReady() || !parentKey || loadingFills || !fills.length) return [];

    setLoadingFills(true);
    setFillsError(null);

    try {
      const oldestFill = fills[fills.length - 1];
      const cursor = oldestFill ? oldestFill.createdAt : undefined;
      const moreFills = await dydxDataService.getFills(undefined, undefined, false, cursor);

      if (isMountedRef.current && parentKey && moreFills.length > 0) {
        useWebSocketStore
          .getState()
          .updateParentSubaccount(parentKey, { fills: moreFills as any, lastUpdate: Date.now() });
      }
      return moreFills;
    } catch (err: any) {
      console.error('[useDydxData] loadMoreFills failed:', err);
      if (isMountedRef.current) setFillsError(err.message || 'Failed to load more fills');
      throw err;
    } finally {
      if (isMountedRef.current) setLoadingFills(false);
    }
  }, [parentKey, fills, loadingFills]);

  const refreshPositions = useCallback(async (): Promise<void> => {
    if (!dydxDataService.isReady() || !parentKey || isFetchingPositionsRef.current) return;

    isFetchingPositionsRef.current = true;
    try {
      const positionsData = await dydxDataService.refreshPositions('OPEN');

      if (!isMountedRef.current || !parentKey) return;

      useWebSocketStore.setState(state => {
        const existing = state.parentSubaccounts.get(parentKey);
        if (!existing) return state;

        const newChildMap = new Map(
          existing.childSubaccounts.map(c => [c.subaccountNumber, { ...c }])
        );

        const apiBySubNum = new Map<number, Record<string, any>>();

        positionsData.forEach((pos: any) => {
          const subNum = pos.subaccountNumber ?? existing.parentSubaccountNumber ?? 0;
          if (!apiBySubNum.has(subNum)) apiBySubNum.set(subNum, {});
          const wsPos = newChildMap.get(subNum)?.openPerpetualPositions?.[pos.market];
          apiBySubNum.get(subNum)![pos.market] = wsPos ? { ...wsPos, ...pos } : pos;
        });

        newChildMap.forEach((child, subNum) => {
          const apiPositions = apiBySubNum.get(subNum) || {};
          child.openPerpetualPositions = apiPositions;
        });

        const newMap = new Map(state.parentSubaccounts);
        newMap.set(parentKey, {
          ...existing,
          childSubaccounts: Array.from(newChildMap.values()),
          lastUpdate: Date.now(),
        });

        return {
          parentSubaccounts: newMap,
          optimisticFreeCollateralDelta: 0,
          updateTrigger: state.updateTrigger + 1,
        };
      });
    } catch (err) {
      console.error('[useDydxData] Positions refresh failed:', err);
    } finally {
      isFetchingPositionsRef.current = false;
    }
  }, [parentKey]);

  const refreshAssetPositions = useCallback(async (): Promise<void> => {
    if (!dydxDataService.isReady() || !parentKey || isFetchingAssetPositionsRef.current) return;

    isFetchingAssetPositionsRef.current = true;
    try {
      const assetData = await dydxDataService.getAssetPositions('OPEN', undefined, false);

      if (!isMountedRef.current || !parentKey) return;

      useWebSocketStore.setState(state => {
        const existing = state.parentSubaccounts.get(parentKey);
        if (!existing) return state;

        const newChildMap = new Map(
          existing.childSubaccounts.map(c => [c.subaccountNumber, { ...c }])
        );

        const apiAssetsBySubNum = new Map<number, Record<string, any>>();

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
              latestProcessedBlockHeight: '0',
            });
          }
          const child = newChildMap.get(subNum)!;
          if (!apiAssetsBySubNum.has(subNum)) apiAssetsBySubNum.set(subNum, {});
          const existingAsset = child.assetPositions[asset.symbol];
          apiAssetsBySubNum.get(subNum)![asset.symbol] = existingAsset
            ? { ...existingAsset, ...asset }
            : asset;
        });

        newChildMap.forEach((child, subNum) => {
          child.assetPositions = apiAssetsBySubNum.get(subNum) || {};
        });

        const newMap = new Map(state.parentSubaccounts);
        newMap.set(parentKey, {
          ...existing,
          childSubaccounts: Array.from(newChildMap.values()),
          lastUpdate: Date.now(),
        });
        return { parentSubaccounts: newMap, updateTrigger: state.updateTrigger + 1 };
      });
    } catch (err) {
      console.error('[useDydxData] Asset positions refresh failed:', err);
    } finally {
      isFetchingAssetPositionsRef.current = false;
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
      refreshOrders().catch(e => console.warn('[useDydxData] Initial orders fetch failed:', e));
      refreshFills().catch(e => console.warn('[useDydxData] Initial fills fetch failed:', e));
    } else if (wsJustReconnected) {
      hasInitializedRef.current = true;
      refreshOrders().catch(e =>
        console.warn('[useDydxData] Reconnection orders fetch failed:', e)
      );
      refreshFills().catch(e => console.warn('[useDydxData] Reconnection fills fetch failed:', e));
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
    refreshOrders,
    refreshFills,
  ]);

  useEffect(() => {
    const unsubscribe = dydxWalletService.onStatusChange(status => {
      if (!isMountedRef.current) return;
      if (status === 'connected') {
        setIsConnected(true);
      } else if (status === 'disconnected' || status === 'no_subaccount') {
        setIsConnected(false);
        hasInitializedRef.current = false;
        isFetchingOrdersRef.current = false;
        isFetchingFillsRef.current = false;
        isFetchingPositionsRef.current = false;
        isFetchingAssetPositionsRef.current = false;
      }
    });

    if (dydxWalletService.isReadyForTrading()) setIsConnected(true);

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
    loadMoreFills,
    parentKey,

    openOrderCount,
    activePositionCount,
    fillCount,

    isConnected,
    isReceivingUpdates,
    lastUpdateTime,
    blockHeight,
  };
};
