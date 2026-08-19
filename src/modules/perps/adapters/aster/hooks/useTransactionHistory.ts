import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { Signer } from 'ethers';

import { useHistoryStore } from '../../../core/stores/historyStore';
import { getIncomeHistory } from '../api/account';
import type { IncomeRecord } from '../types/account';

const PAGE_LIMIT = 50;
const CACHE_TTL = 30000; // 30 seconds

// Module-level global cache that persists across tab switches
const globalIncomeCache: Record<
  string,
  { data: IncomeRecord[]; timestamp: number; hasMore: boolean }
> = {};

const sortDesc = (items: IncomeRecord[]) => {
  return [...items].sort((a, b) => (b.time || 0) - (a.time || 0));
};

const getRecordKey = (item: IncomeRecord, idx?: number) => {
  return `${item.tranId || ''}_${item.time || ''}_${item.incomeType || ''}_${item.symbol || ''}_${idx ?? ''}`;
};

export const useTransactionHistory = (signer: Signer | null, userAddr: string | null) => {
  const cacheKey = userAddr ? `${userAddr}_all` : '';
  const cachedEntry = cacheKey ? globalIncomeCache[cacheKey] : undefined;

  const [income, setIncome] = useState<IncomeRecord[]>(() => cachedEntry?.data || []);
  const [isLoading, setIsLoading] = useState(() => !cachedEntry);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(() => (cachedEntry ? cachedEntry.hasMore : true));

  const isFetchingMoreRef = useRef(false);

  useEffect(() => {
    if (!signer || !userAddr) {
      setIncome([]);
      setHasMore(true);
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    const currentCached = globalIncomeCache[cacheKey];

    // If cache is fresh, don't show loading and don't spam API
    if (currentCached && Date.now() - currentCached.timestamp < CACHE_TTL) {
      setIncome(currentCached.data);
      setHasMore(currentCached.hasMore);
      setIsLoading(false);
      return;
    }

    if (!currentCached) {
      setIsLoading(true);
    }

    const fetchHistory = async () => {
      try {
        const data = await getIncomeHistory(signer, userAddr, { limit: PAGE_LIMIT });
        if (isMounted) {
          const sorted = sortDesc(Array.isArray(data) ? data : []);
          const more = sorted.length > 0;
          setIncome(sorted);
          setHasMore(more);
          globalIncomeCache[cacheKey] = { data: sorted, timestamp: Date.now(), hasMore: more };
        }
      } catch (err) {
        console.error('Failed to load transaction history:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchHistory();

    return () => {
      isMounted = false;
    };
  }, [signer, userAddr, cacheKey]);

  const loadMore = useCallback(async () => {
    if (!signer || !userAddr || isLoadingMore || !hasMore || isFetchingMoreRef.current) return;
    if (income.length === 0) return;

    const oldestTime = income[income.length - 1]?.time;
    if (!oldestTime) return;

    isFetchingMoreRef.current = true;
    setIsLoadingMore(true);

    try {
      const nextBatch = await getIncomeHistory(signer, userAddr, {
        endTime: oldestTime - 1,
        limit: PAGE_LIMIT,
      });

      const list = Array.isArray(nextBatch) ? nextBatch : [];
      if (list.length === 0) {
        setHasMore(false);
        if (globalIncomeCache[cacheKey]) {
          globalIncomeCache[cacheKey].hasMore = false;
        }
      } else {
        setIncome(prev => {
          const existingIds = new Set(prev.map((item, i) => getRecordKey(item, i)));
          const uniqueNew = list.filter((item, i) => !existingIds.has(getRecordKey(item, i)));
          if (uniqueNew.length === 0) {
            setHasMore(false);
            if (globalIncomeCache[cacheKey]) globalIncomeCache[cacheKey].hasMore = false;
            return prev;
          }
          const combined = sortDesc([...prev, ...uniqueNew]);
          const more = uniqueNew.length > 0;
          setHasMore(more);
          globalIncomeCache[cacheKey] = { data: combined, timestamp: Date.now(), hasMore: more };
          return combined;
        });
      }
    } catch (err) {
      console.error('Failed to load more transaction history:', err);
    } finally {
      setIsLoadingMore(false);
      isFetchingMoreRef.current = false;
    }
  }, [signer, userAddr, isLoadingMore, hasMore, income, cacheKey]);

  const recentIncome = useHistoryStore(state => state.recentIncome);

  const mergedIncome = useMemo(() => {
    if (recentIncome.length === 0) return income;
    const all = [...recentIncome, ...income];
    const seen = new Set();
    return all
      .filter(item => {
        const key = `${item.tranId || ''}_${item.time || ''}_${item.incomeType || ''}_${item.income || ''}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => (b.time || 0) - (a.time || 0));
  }, [income, recentIncome]);

  return { income: mergedIncome, isLoading, isLoadingMore, hasMore, loadMore };
};
