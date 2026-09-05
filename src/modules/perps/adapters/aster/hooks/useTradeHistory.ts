import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { Signer } from 'ethers';

import { useHistoryStore } from '../../../core/stores/historyStore';
import { getUserTrades } from '../api/account';
import type { AsterUserTrade } from '../types/account';

const PAGE_LIMIT = 50;
const CACHE_TTL = 30000; // 30 seconds

// Module-level global cache that persists across tab switches
const globalTradeCache: Record<
  string,
  { data: AsterUserTrade[]; timestamp: number; hasMore: boolean }
> = {};

const sortDesc = (items: AsterUserTrade[]) => {
  return [...items].sort((a, b) => (b.time || 0) - (a.time || 0));
};

export const useTradeHistory = (
  signer: Signer | null,
  userAddr: string | null,
  symbol: string | null
) => {
  const cacheKey = userAddr ? `${userAddr}_${symbol || 'all'}_trades` : '';
  const cachedEntry = cacheKey ? globalTradeCache[cacheKey] : undefined;

  const [trades, setTrades] = useState<AsterUserTrade[]>(() => cachedEntry?.data || []);
  const [isLoading, setIsLoading] = useState(() => !cachedEntry);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(() => (cachedEntry ? cachedEntry.hasMore : true));

  const isFetchingMoreRef = useRef(false);

  useEffect(() => {
    if (!signer || !userAddr) {
      setTrades([]);
      setHasMore(true);
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    const currentCached = globalTradeCache[cacheKey];

    // If cache is fresh, don't show loading and don't spam API
    if (currentCached && Date.now() - currentCached.timestamp < CACHE_TTL) {
      setTrades(currentCached.data);
      setHasMore(currentCached.hasMore);
      setIsLoading(false);
      return;
    }

    if (!currentCached) {
      setIsLoading(true);
    }

    const fetchHistory = async () => {
      try {
        const data = await getUserTrades(signer, userAddr, symbol || undefined, {
          limit: PAGE_LIMIT,
        });
        if (isMounted) {
          const sorted = sortDesc(Array.isArray(data) ? data : []);
          const more = sorted.length > 0;
          setTrades(sorted);
          setHasMore(more);
          globalTradeCache[cacheKey] = { data: sorted, timestamp: Date.now(), hasMore: more };
        }
      } catch (err) {
        console.error('Failed to load trade history:', err);
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
    if (trades.length === 0) return;

    const oldestTime = trades[trades.length - 1]?.time;
    if (!oldestTime) return;

    isFetchingMoreRef.current = true;
    setIsLoadingMore(true);

    try {
      const nextBatch = await getUserTrades(signer, userAddr, symbol || undefined, {
        endTime: oldestTime - 1,
        limit: PAGE_LIMIT,
      });

      const list = Array.isArray(nextBatch) ? nextBatch : [];
      if (list.length === 0) {
        setHasMore(false);
        if (globalTradeCache[cacheKey]) globalTradeCache[cacheKey].hasMore = false;
      } else {
        setTrades(prev => {
          const existingIds = new Set(prev.map(t => String(t.id)));
          const uniqueNew = list.filter(t => !existingIds.has(String(t.id)));
          if (uniqueNew.length === 0) {
            setHasMore(false);
            if (globalTradeCache[cacheKey]) globalTradeCache[cacheKey].hasMore = false;
            return prev;
          }
          const combined = sortDesc([...prev, ...uniqueNew]);
          const more = uniqueNew.length > 0;
          setHasMore(more);
          globalTradeCache[cacheKey] = { data: combined, timestamp: Date.now(), hasMore: more };
          return combined;
        });
      }
    } catch (err) {
      console.error('Failed to load more trade history:', err);
    } finally {
      setIsLoadingMore(false);
      isFetchingMoreRef.current = false;
    }
  }, [signer, userAddr, symbol, isLoadingMore, hasMore, trades, cacheKey]);

  const recentTrades = useHistoryStore(state => state.recentTrades);

  const mergedTrades = useMemo(() => {
    const socketTrades = symbol ? recentTrades.filter(t => t.symbol === symbol) : recentTrades;
    const all = [...socketTrades, ...trades];
    const seen = new Set();
    return all
      .filter(t => {
        const key = `${t.id}_${t.time}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => (b.time || 0) - (a.time || 0));
  }, [symbol, recentTrades, trades]);

  return { trades: mergedTrades, isLoading, isLoadingMore, hasMore, loadMore };
};
