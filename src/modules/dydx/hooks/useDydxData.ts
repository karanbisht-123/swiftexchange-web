import { useCallback, useEffect, useRef, useState } from 'react';

import {
  type AssetPosition,
  type Fill,
  type Order,
  type Position,
  dydxDataService,
} from '../service/dydxOrderService';
import { dydxWalletService } from '../service/dydxWalletService';

interface UseDydxDataReturn {
  // Positions
  positions: Position[];
  loadingPositions: boolean;
  positionsError: string | null;
  refreshPositions: () => Promise<void>;

  // Asset Positions
  assetPositions: AssetPosition[];
  loadingAssetPositions: boolean;
  assetPositionsError: string | null;
  refreshAssetPositions: () => Promise<void>;

  // Orders
  orders: Order[];
  loadingOrders: boolean;
  ordersError: string | null;
  refreshOrders: () => Promise<void>;

  // Fills
  fills: Fill[];
  loadingFills: boolean;
  fillsError: string | null;
  refreshFills: () => Promise<void>;

  // General
  isConnected: boolean;
  isReceivingUpdates: boolean;
  lastUpdateTime: number | null;
}

export const useDydxData = (): UseDydxDataReturn => {
  // Positions state
  const [positions, setPositions] = useState<Position[]>([]);
  const [loadingPositions, setLoadingPositions] = useState(false);
  const [positionsError, setPositionsError] = useState<string | null>(null);

  // Asset positions state
  const [assetPositions, setAssetPositions] = useState<AssetPosition[]>([]);
  const [loadingAssetPositions, setLoadingAssetPositions] = useState(false);
  const [assetPositionsError, setAssetPositionsError] = useState<string | null>(null);

  // Orders state
  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [ordersError, setOrdersError] = useState<string | null>(null);

  // Fills state
  const [fills, setFills] = useState<Fill[]>([]);
  const [loadingFills, setLoadingFills] = useState(false);
  const [fillsError, setFillsError] = useState<string | null>(null);

  // General state
  const [isConnected, setIsConnected] = useState(false);
  const [isReceivingUpdates, setIsReceivingUpdates] = useState(false);
  const [lastUpdateTime, setLastUpdateTime] = useState<number | null>(null);

  // Refs
  const isMountedRef = useRef(true);
  const hasInitialFetchRef = useRef(false);
  const positionUnsubRef = useRef<(() => void) | null>(null);
  const orderUnsubRef = useRef<(() => void) | null>(null);
  const isFetchingRef = useRef({
    positions: false,
    assetPositions: false,
    orders: false,
    fills: false,
  });

  // Track mount state
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Fetch positions
  const fetchPositions = useCallback(async (forceRefresh = false): Promise<void> => {
    if (isFetchingRef.current.positions || !isMountedRef.current) {
      return;
    }

    if (!dydxDataService.isReady()) {
      if (isMountedRef.current) {
        setPositionsError('Service not ready');
      }
      return;
    }

    isFetchingRef.current.positions = true;

    if (isMountedRef.current) {
      setLoadingPositions(true);
      setPositionsError(null);
    }

    try {
      const data = forceRefresh
        ? await dydxDataService.refreshPositions('OPEN')
        : await dydxDataService.getPositions('OPEN');

      if (isMountedRef.current) {
        setPositions(data);
        setLastUpdateTime(Date.now());
      }
    } catch (err: any) {
      if (isMountedRef.current) {
        setPositionsError(err.message || 'Failed to fetch positions');
      }
    } finally {
      if (isMountedRef.current) {
        setLoadingPositions(false);
      }
      isFetchingRef.current.positions = false;
    }
  }, []);

  // Fetch asset positions
  const fetchAssetPositions = useCallback(async (forceRefresh = false): Promise<void> => {
    if (isFetchingRef.current.assetPositions || !isMountedRef.current) {
      return;
    }

    if (!dydxDataService.isReady()) {
      if (isMountedRef.current) {
        setAssetPositionsError('Service not ready');
      }
      return;
    }

    isFetchingRef.current.assetPositions = true;

    if (isMountedRef.current) {
      setLoadingAssetPositions(true);
      setAssetPositionsError(null);
    }

    try {
      const data = await dydxDataService.getAssetPositions('OPEN', undefined, !forceRefresh);

      if (isMountedRef.current) {
        setAssetPositions(data);
      }
    } catch (err: any) {
      if (isMountedRef.current) {
        setAssetPositionsError(err.message || 'Failed to fetch asset positions');
      }
    } finally {
      if (isMountedRef.current) {
        setLoadingAssetPositions(false);
      }
      isFetchingRef.current.assetPositions = false;
    }
  }, []);

  const fetchOrders = useCallback(async (forceRefresh = false): Promise<void> => {
    if (isFetchingRef.current.orders || !isMountedRef.current) {
      return;
    }

    if (!dydxDataService.isReady()) {
      if (isMountedRef.current) {
        setOrdersError('Service not ready');
      }
      return;
    }

    isFetchingRef.current.orders = true;

    if (isMountedRef.current) {
      setLoadingOrders(true);
      setOrdersError(null);
    }

    try {
      const data = forceRefresh
        ? await dydxDataService.refreshOrders()
        : await dydxDataService.getOrders();

      if (isMountedRef.current) {
        setOrders(data);
        setLastUpdateTime(Date.now());
      }
    } catch (err: any) {
      if (isMountedRef.current) {
        setOrdersError(err.message || 'Failed to fetch orders');
      }
    } finally {
      if (isMountedRef.current) {
        setLoadingOrders(false);
      }
      isFetchingRef.current.orders = false;
    }
  }, []);

  const fetchFills = useCallback(async (forceRefresh = false): Promise<void> => {
    if (isFetchingRef.current.fills || !isMountedRef.current) {
      return;
    }

    if (!dydxDataService.isReady()) {
      if (isMountedRef.current) {
        setFillsError('Service not ready');
      }
      return;
    }

    isFetchingRef.current.fills = true;

    if (isMountedRef.current) {
      setLoadingFills(true);
      setFillsError(null);
    }

    try {
      const data = forceRefresh
        ? await dydxDataService.refreshFills()
        : await dydxDataService.getFills();

      if (isMountedRef.current) {
        setFills(data);
      }
    } catch (err: any) {
      if (isMountedRef.current) {
        setFillsError(err.message || 'Failed to fetch fills');
      }
    } finally {
      if (isMountedRef.current) {
        setLoadingFills(false);
      }
      isFetchingRef.current.fills = false;
    }
  }, []);

  // Effect: Monitor wallet connection status
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
        setPositions([]);
        setAssetPositions([]);
        setOrders([]);
        setFills([]);
        setLastUpdateTime(null);
        setIsReceivingUpdates(false);
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

    return () => {
      unsubscribe();
    };
  }, [fetchPositions, fetchAssetPositions, fetchOrders, fetchFills]);

  // Effect: Setup WebSocket listeners for real-time updates
  useEffect(() => {
    if (!isConnected) {
      // Cleanup listeners if not connected
      if (positionUnsubRef.current) {
        positionUnsubRef.current();
        positionUnsubRef.current = null;
      }
      if (orderUnsubRef.current) {
        orderUnsubRef.current();
        orderUnsubRef.current = null;
      }
      setIsReceivingUpdates(false);
      return;
    }

    // Subscribe to position updates
    const positionUnsub = dydxDataService.onPositionsUpdate(updatedPositions => {
      if (!isMountedRef.current) return;

      setPositions(updatedPositions);
      setLastUpdateTime(Date.now());
      setIsReceivingUpdates(true);
    });

    const orderUnsub = dydxDataService.onOrdersUpdate(updatedOrders => {
      if (!isMountedRef.current) return;

      setOrders(updatedOrders);
      setLastUpdateTime(Date.now());
      setIsReceivingUpdates(true);
    });

    positionUnsubRef.current = positionUnsub;
    orderUnsubRef.current = orderUnsub;

    const statusInterval = setInterval(() => {
      if (!isMountedRef.current) return;

      const receiving = dydxDataService.isReceivingUpdates();
      setIsReceivingUpdates(receiving);
    }, 5000);

    return () => {
      if (positionUnsubRef.current) {
        positionUnsubRef.current();
        positionUnsubRef.current = null;
      }
      if (orderUnsubRef.current) {
        orderUnsubRef.current();
        orderUnsubRef.current = null;
      }
      clearInterval(statusInterval);
    };
  }, [isConnected]);

  // Public refresh methods
  const refreshPositions = useCallback(async () => {
    await fetchPositions(true);
  }, [fetchPositions]);

  const refreshAssetPositions = useCallback(async () => {
    await fetchAssetPositions(true);
  }, [fetchAssetPositions]);

  const refreshOrders = useCallback(async () => {
    await fetchOrders(true);
  }, [fetchOrders]);

  const refreshFills = useCallback(async () => {
    await fetchFills(true);
  }, [fetchFills]);

  return {
    // Positions
    positions,
    loadingPositions,
    positionsError,
    refreshPositions,

    // Asset Positions
    assetPositions,
    loadingAssetPositions,
    assetPositionsError,
    refreshAssetPositions,

    // Orders
    orders,
    loadingOrders,
    ordersError,
    refreshOrders,

    // Fills
    fills,
    loadingFills,
    fillsError,
    refreshFills,

    // General
    isConnected,
    isReceivingUpdates,
    lastUpdateTime,
  };
};
