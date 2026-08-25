import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { Signer } from 'ethers';

import { useHistoryStore } from '../../../core/stores/historyStore';
import { getAllOrders } from '../api/orders';
import type { AsterOrderResponse } from '../types/orders';

const PAGE_LIMIT = 50;
const CACHE_TTL = 30000; // 30 seconds

// Module-level global cache that persists across tab switches
const globalOrderCache: Record<
  string,
  { data: AsterOrderResponse[]; timestamp: number; hasMore: boolean }
> = {};

const getOrderTime = (o: AsterOrderResponse) => {
  return o.updateTime || o.time || 0;
};

const sortDesc = (items: AsterOrderResponse[]) => {
  return [...items].sort((a, b) => getOrderTime(b) - getOrderTime(a));
};

export const useOrderHistory = (
  signer: Signer | null,
  userAddr: string | null,
  symbol: string | null
) => {
  const cacheKey = userAddr ? `${userAddr}_${symbol || 'all'}_orders` : '';
  const cachedEntry = cacheKey ? globalOrderCache[cacheKey] : undefined;

  const [orders, setOrders] = useState<AsterOrderResponse[]>(() => cachedEntry?.data || []);
  const [isLoading, setIsLoading] = useState(() => !cachedEntry);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(() => (cachedEntry ? cachedEntry.hasMore : true));

  const isFetchingMoreRef = useRef(false);

  useEffect(() => {
    if (!signer || !userAddr) {
      setOrders([]);
      setHasMore(true);
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    const currentCached = globalOrderCache[cacheKey];

    // If cache is fresh, don't show loading and don't spam API
    if (currentCached && Date.now() - currentCached.timestamp < CACHE_TTL) {
      setOrders(currentCached.data);
      setHasMore(currentCached.hasMore);
      setIsLoading(false);
      return;
    }

    if (!currentCached) {
      setIsLoading(true);
    }

    const fetchHistory = async () => {
      try {
        const data = await getAllOrders(signer, userAddr, {
          symbol: symbol || undefined,
          limit: PAGE_LIMIT,
        });
        if (isMounted) {
          const sorted = sortDesc(Array.isArray(data) ? data : []);
          const more = sorted.length > 0;
          setOrders(sorted);
          setHasMore(more);
          globalOrderCache[cacheKey] = { data: sorted, timestamp: Date.now(), hasMore: more };
        }
      } catch (err) {
        console.error('Failed to load order history:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchHistory();

    return () => {
      isMounted = false;
    };
  }, [signer, userAddr, symbol, cacheKey]);

  const loadMore = useCallback(async () => {
    if (!signer || !userAddr || isLoadingMore || !hasMore || isFetchingMoreRef.current) return;
    if (orders.length === 0) return;

    const oldestOrder = orders[orders.length - 1];
    const oldestTime = getOrderTime(oldestOrder);
    if (!oldestTime) return;

    isFetchingMoreRef.current = true;
    setIsLoadingMore(true);

    try {
      const nextBatch = await getAllOrders(signer, userAddr, {
        symbol: symbol || undefined,
        endTime: oldestTime - 1,
        limit: PAGE_LIMIT,
      });

      const list = Array.isArray(nextBatch) ? nextBatch : [];
      if (list.length === 0) {
        setHasMore(false);
        if (globalOrderCache[cacheKey]) globalOrderCache[cacheKey].hasMore = false;
      } else {
        setOrders(prev => {
          const existingIds = new Set(prev.map(o => String(o.orderId)));
          const uniqueNew = list.filter(o => !existingIds.has(String(o.orderId)));
          if (uniqueNew.length === 0) {
            setHasMore(false);
            if (globalOrderCache[cacheKey]) globalOrderCache[cacheKey].hasMore = false;
            return prev;
          }
          const combined = sortDesc([...prev, ...uniqueNew]);
          const more = uniqueNew.length > 0;
          setHasMore(more);
          globalOrderCache[cacheKey] = { data: combined, timestamp: Date.now(), hasMore: more };
          return combined;
        });
      }
    } catch (err) {
      console.error('Failed to load more order history:', err);
    } finally {
      setIsLoadingMore(false);
      isFetchingMoreRef.current = false;
    }
  }, [signer, userAddr, symbol, isLoadingMore, hasMore, orders, cacheKey]);

  const recentOrders = useHistoryStore(state => state.recentOrders);

  const mergedOrders = useMemo(() => {
    const socketOrders = symbol ? recentOrders.filter(o => o.symbol === symbol) : recentOrders;
    const all = [...socketOrders, ...orders];
    const seen = new Set();
    return all
      .filter(o => {
        const key = String(o.orderId);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => getOrderTime(b) - getOrderTime(a));
  }, [symbol, recentOrders, orders]);

  return { orders: mergedOrders, isLoading, isLoadingMore, hasMore, loadMore };
};
