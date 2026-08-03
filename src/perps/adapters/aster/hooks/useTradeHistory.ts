import { useState, useEffect, useRef, useMemo } from 'react';
import type { Signer } from 'ethers';
import { getUserTrades } from '../api/account';
import type { AsterUserTrade } from '../types/account';
import { useHistoryStore } from '../../../core/stores/historyStore';

export const useTradeHistory = (
  signer: Signer | null,
  userAddr: string | null,
  symbol: string | null
) => {
  const [trades, setTrades] = useState<AsterUserTrade[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  const cacheRef = useRef<Record<string, { data: AsterUserTrade[], timestamp: number }>>({});
  
  useEffect(() => {
    if (!signer || !userAddr) return;
    
    let isMounted = true;
    const cacheKey = `${userAddr}_${symbol || 'all'}_trades`;
    const CACHE_TTL = 10000;
    
    const fetchHistory = async () => {
      const cached = cacheRef.current[cacheKey];
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        setTrades(cached.data);
        return;
      }
      
      setIsLoading(true);
      try {
        const data = await getUserTrades(signer, userAddr, symbol || undefined);
        if (isMounted) {
          setTrades(data);
          cacheRef.current[cacheKey] = { data, timestamp: Date.now() };
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
  }, [signer, userAddr, symbol]);
  
  const { recentTrades } = useHistoryStore();
  
  const mergedTrades = useMemo(() => {
    if (!symbol) return trades;
    const socketTrades = recentTrades.filter(t => t.symbol === symbol);
    const all = [...socketTrades, ...trades];
    const seen = new Set();
    return all.filter(t => {
      if (seen.has(t.id)) return false;
      seen.add(t.id);
      return true;
    }).sort((a, b) => b.time - a.time);
  }, [trades, recentTrades, symbol]);

  return { trades: mergedTrades, isLoading };
};
