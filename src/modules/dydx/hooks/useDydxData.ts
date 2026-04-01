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
import {
  type TrackedOrder,
  selectOpenAndGraceOrders,
  selectRecentlyTerminalOrders,
  useWebSocketStore,
} from '../store/websocketStore';

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

  openOrderCount: number;
  activePositionCount: number;
  fillCount: number;

  isConnected: boolean;
  isReceivingUpdates: boolean;
  lastUpdateTime: number | null;
  blockHeight: string;
  recentlyFilledCount: number;
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

  const subscribeToParentSubaccount = useWebSocketStore(s => s.subscribeToParentSubaccount);
  const unsubscribeFromParentSubaccount = useWebSocketStore(s => s.unsubscribeFromParentSubaccount);

  const dydxAddress = dydxWalletService.getAddress();
  const subaccountNumber = dydxWalletService.getSubaccountNumber();
  const parentKey = dydxAddress ? `parent_subaccount_${dydxAddress}_${subaccountNumber}` : null;

  const { parentData, updateTrigger } = useWebSocketStore(
    useShallow(state => ({
      parentData: parentKey ? state.parentSubaccounts.get(parentKey) : undefined,
      updateTrigger: state.updateTrigger,
    }))
  );

  // ── Derived data ──────────────────────────────────────────────────────────

  const positions = useMemo(() => {
    const raw = parentData?.childSubaccounts?.flatMap(child =>
      Object.values(child.openPerpetualPositions || {}).map(pos => ({
        ...pos,
        subaccountNumber: child.subaccountNumber,
      }))
    ) ?? [];
    return raw.filter(p => Math.abs(parseFloat(p.size || '0')) > 0);
  }, [parentData?.childSubaccounts, updateTrigger, parentKey]);

  const assetPositions = useMemo(() => {
    return parentData?.childSubaccounts?.flatMap(child =>
      Object.values(child.assetPositions || {})
    ) ?? [];
  }, [parentData?.childSubaccounts, updateTrigger]);

  const orders = useMemo<TrackedOrder[]>(() => {
    const all = parentData?.orders ?? [];
    return [...all].sort((a, b) => {
      const tA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const tB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return tB - tA;
    });
  }, [parentData?.orders, updateTrigger]);

  // Includes recently-terminal orders (within grace window) so UI can fade them out
  const openOrders = useMemo<TrackedOrder[]>(
    () => selectOpenAndGraceOrders(parentData),
    [parentData?.orders, updateTrigger]
  );

  const fills = useMemo(() => {
    const all = parentData?.fills ?? [];
    return [...all].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [parentData?.fills, updateTrigger]);

  const openOrderCount = openOrders.length;
  const activePositionCount = positions.length;
  const fillCount = fills.length;
  const blockHeight = parentData?.blockHeight ?? '0';
  const lastUpdateTime = parentData?.lastUpdate ?? null;
  const isReceivingUpdates = parentData ? Date.now() - parentData.lastUpdate < 30_000 : false;

  const recentlyFilledCount = useMemo(
    () => selectRecentlyTerminalOrders(parentData).filter(o => o.status === 'FILLED').length,
    [parentData?.orders, updateTrigger]
  );

  const loadingPositions = false;
  const positionsError = null;
  const loadingAssetPositions = false;
  const assetPositionsError = null;

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  // ── Refresh callbacks ─────────────────────────────────────────────────────

  const refreshOrders = useCallback(async (): Promise<void> => {
    if (!dydxDataService.isReady() || !parentKey || isFetchingRef.current) return;

    setLoadingOrders(true);
    setOrdersError(null);

    try {
      const data: Order[] = await dydxDataService.refreshOrders(undefined, undefined);

      if (isMountedRef.current && parentKey) {
        // HTTP data gets msgId=0 so any live WS update (msgId ≥ 1) always wins
        useWebSocketStore.getState().updateParentSubaccount(
          parentKey,
          { orders: data as any, lastUpdate: Date.now() },
          0
        );
      }
    } catch (err: any) {
      console.error('[useDydxData] Orders refresh failed:', err);
      if (isMountedRef.current) setOrdersError(err.message || 'Failed to refresh orders');
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
        useWebSocketStore.getState().updateParentSubaccount(parentKey, { fills: data, lastUpdate: Date.now() });
      }
    } catch (err: any) {
      console.error('[useDydxData] Fills refresh failed:', err);
      if (isMountedRef.current) setFillsError(err.message || 'Failed to refresh fills');
    } finally {
      if (isMountedRef.current) setLoadingFills(false);
    }
  }, [parentKey]);

  const refreshPositions = useCallback(async (): Promise<void> => {
    if (!dydxDataService.isReady() || !parentKey || isFetchingRef.current) return;

    try {
      const positionsData = await dydxDataService.refreshPositions('OPEN');

      let subaccountsData: any[] = [];
      try {
        const indexer = dydxWalletService.getIndexerClient();
        const address = dydxWalletService.getAddress();
        if (indexer && address) {
          const res = await indexer.account.getSubaccounts(address);
          subaccountsData = res.subaccounts || [];
        }
      } catch (err) {
        console.warn('[useDydxData] Failed to fetch subaccount balances during refreshPositions', err);
      }

      if (!isMountedRef.current || !parentKey) return;

      useWebSocketStore.setState(state => {
        const existing = state.parentSubaccounts.get(parentKey);
        if (!existing) return state;

        const newChildMap = new Map(existing.childSubaccounts.map(c => [c.subaccountNumber, { ...c }]));

        subaccountsData.forEach(sub => {
          const num = sub.subaccountNumber ?? 0;
          if (newChildMap.has(num)) {
            const child = newChildMap.get(num)!;
            child.equity = sub.equity ?? child.equity;
            child.freeCollateral = sub.freeCollateral ?? child.freeCollateral;
          } else {
            newChildMap.set(num, {
              subaccountNumber: num,
              address: existing.address,
              equity: sub.equity || '0',
              freeCollateral: sub.freeCollateral || '0',
              openPerpetualPositions: {},
              assetPositions: {},
              marginEnabled: true,
              updatedAtHeight: '0',
              latestProcessedBlockHeight: '0',
            });
          }
        });

        // ── Rebuild openPerpetualPositions from scratch ─────────────────────
        // The API returns ONLY currently-open positions, so anything missing
        // from this response has been closed. We must replace positions
        // wholesale (not merge) so closed positions disappear from the UI.
        //
        // Strategy: build a fresh map keyed by (subaccountNumber → market),
        // preserving any extra live WS PnL data that exists for still-open positions.
        const freshBySubNum = new Map<number, Record<string, any>>();

        positionsData.forEach((pos: any) => {
          const subNum = pos.subaccountNumber ?? existing.parentSubaccountNumber ?? 0;
          if (!freshBySubNum.has(subNum)) freshBySubNum.set(subNum, {});
          // Keep live WS PnL fields where they exist, but API data wins for structural fields.
          const wsPos = newChildMap.get(subNum)?.openPerpetualPositions?.[pos.market];
          freshBySubNum.get(subNum)![pos.market] = wsPos ? { ...wsPos, ...pos } : pos;
        });

        // Apply: every child gets its positions replaced by the fresh API set.
        // Children absent from the API response get an empty positions map —
        // any closed position in them is now gone.
        newChildMap.forEach((child, subNum) => {
          child.openPerpetualPositions = freshBySubNum.get(subNum) ?? {};
        });

        const crossSub = subaccountsData.find(s => (s.subaccountNumber ?? 0) === 0);
        const newMap = new Map(state.parentSubaccounts);
        newMap.set(parentKey, {
          ...existing,
          childSubaccounts: Array.from(newChildMap.values()),
          equity: crossSub?.equity ?? existing.equity,
          freeCollateral: crossSub?.freeCollateral ?? existing.freeCollateral,
          lastUpdate: Date.now(),
        });

        // Fresh freeCollateral just arrived from the server — clear any pending
        // optimistic deduction so we don't double-count it.
        return {
          parentSubaccounts: newMap,
          optimisticFreeCollateralDelta: 0,
          updateTrigger: state.updateTrigger + 1,
        };
      });
    } catch (err) {
      console.error('[useDydxData] Positions refresh failed:', err);
    }
  }, [parentKey]);

  const refreshAssetPositions = useCallback(async (): Promise<void> => {
    if (!dydxDataService.isReady() || !parentKey || isFetchingRef.current) return;

    try {
      const assetData = await dydxDataService.getAssetPositions('OPEN', undefined, false);

      if (!isMountedRef.current || !parentKey) return;

      useWebSocketStore.setState(state => {
        const existing = state.parentSubaccounts.get(parentKey);
        if (!existing) return state;

        const newChildMap = new Map(existing.childSubaccounts.map(c => [c.subaccountNumber, { ...c }]));

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
          const existingAsset = child.assetPositions[asset.symbol];
          child.assetPositions[asset.symbol] = existingAsset ? { ...existingAsset, ...asset } : asset;
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
    }
  }, [parentKey]);

  // ── Subscriptions ─────────────────────────────────────────────────────────

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
  }, [dydxAddress, subaccountNumber, isConnected, subscribeToParentSubaccount, unsubscribeFromParentSubaccount]);

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

    if (dydxWalletService.isConnected()) setIsConnected(true);

    return unsubscribe;
  }, []);

  // ── Return ────────────────────────────────────────────────────────────────

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
    blockHeight,
    recentlyFilledCount,
  };
};