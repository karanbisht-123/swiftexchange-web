import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useHistoryStore } from '../../../core/stores/historyStore';
import type { AsterOrderResponse } from '../../aster/types/orders';
import { getHyperliquidHistoricalOrders } from '../api/history';

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

export const useHyperliquidOrderHistory = (userAddr: string | null, symbol: string | null) => {
  const cacheKey = userAddr ? `${userAddr}_${symbol || 'all'}_orders_hl` : '';
  const cachedEntry = cacheKey ? globalOrderCache[cacheKey] : undefined;

  const [orders, setOrders] = useState<AsterOrderResponse[]>(() => cachedEntry?.data || []);
  const [isLoading, setIsLoading] = useState(() => !cachedEntry);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(() => (cachedEntry ? cachedEntry.hasMore : true));

  const isFetchingMoreRef = useRef(false);

  useEffect(() => {
    if (!userAddr) {
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
        const data = await getHyperliquidHistoricalOrders(userAddr, {
          limit: PAGE_LIMIT,
        });

        let filtered = data;
        if (symbol) {
          filtered = data.filter(o => o.symbol === symbol);
        }

        if (isMounted) {
          const sorted = sortDesc(Array.isArray(filtered) ? filtered : []);
          const more = sorted.length >= PAGE_LIMIT;
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
  }, [userAddr, symbol, cacheKey]);

  const loadMore = useCallback(async () => {
    if (!userAddr || isLoadingMore || !hasMore || isFetchingMoreRef.current) return;
    if (orders.length === 0) return;

    const oldestOrder = orders[orders.length - 1];
    const oldestTime = getOrderTime(oldestOrder);
    if (!oldestTime) return;

    isFetchingMoreRef.current = true;
    setIsLoadingMore(true);

    try {
      const nextBatch = await getHyperliquidHistoricalOrders(userAddr, {
        endTime: oldestTime - 1,
        limit: PAGE_LIMIT,
      });

      let list = Array.isArray(nextBatch) ? nextBatch : [];
      if (symbol) {
        list = list.filter(o => o.symbol === symbol);
      }

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
          const more = nextBatch.length >= PAGE_LIMIT; // Determine hasMore by API batch size
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
  }, [userAddr, symbol, isLoadingMore, hasMore, orders, cacheKey]);

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
