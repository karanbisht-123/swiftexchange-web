import { useState, useEffect, useRef, useMemo } from 'react';
import type { Signer } from 'ethers';
import { getAllOrders } from '../api/orders';
import type { AsterOrderResponse } from '../types/orders';
import { useHistoryStore } from '../../../core/stores/historyStore';

export const useOrderHistory = (
  signer: Signer | null,
  userAddr: string | null,
  symbol: string | null
) => {
  const [orders, setOrders] = useState<AsterOrderResponse[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  // Cache to prevent refetching the exact same data instantly on tab switch
  const cacheRef = useRef<Record<string, { data: AsterOrderResponse[], timestamp: number }>>({});
  
  useEffect(() => {
    if (!signer || !userAddr) return;
    
    let isMounted = true;
    const cacheKey = `${userAddr}_${symbol || 'all'}_orders`;
    const CACHE_TTL = 10000; // 10 seconds cache to prevent rapid switching spam
    
    const fetchHistory = async () => {
      const cached = cacheRef.current[cacheKey];
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        setOrders(cached.data);
        return;
      }
      
      setIsLoading(true);
      try {
        const data = await getAllOrders(signer, userAddr, { symbol: symbol || undefined });
        if (isMounted) {
          setOrders(data);
          cacheRef.current[cacheKey] = { data, timestamp: Date.now() };
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
  }, [signer, userAddr, symbol]);
  
  const { recentOrders } = useHistoryStore();
  
  const mergedOrders = useMemo(() => {
    if (!symbol) return orders;
    const socketOrders = recentOrders.filter(o => o.symbol === symbol);
    const all = [...socketOrders, ...orders];
    const seen = new Set();
    return all.filter(o => {
      if (seen.has(o.orderId)) return false;
      seen.add(o.orderId);
      return true;
    }).sort((a, b) => b.updateTime - a.updateTime);
  }, [orders, recentOrders, symbol]);

  return { orders: mergedOrders, isLoading };
};
