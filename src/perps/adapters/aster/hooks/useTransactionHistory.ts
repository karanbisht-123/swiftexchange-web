import { useState, useEffect, useRef } from 'react';
import type { Signer } from 'ethers';
import { getIncomeHistory } from '../api/account';
import type { IncomeRecord } from '../types/account';

export const useTransactionHistory = (
  signer: Signer | null,
  userAddr: string | null
) => {
  const [income, setIncome] = useState<IncomeRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  const cacheRef = useRef<Record<string, { data: IncomeRecord[], timestamp: number }>>({});
  
  useEffect(() => {
    if (!signer || !userAddr) return;
    
    let isMounted = true;
    const cacheKey = `${userAddr}_all`;
    const CACHE_TTL = 10000;
    
    const fetchHistory = async () => {
      const cached = cacheRef.current[cacheKey];
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        setIncome(cached.data);
        return;
      }
      
      setIsLoading(true);
      try {
        const data = await getIncomeHistory(signer, userAddr);
        if (isMounted) {
          setIncome(data);
          cacheRef.current[cacheKey] = { data, timestamp: Date.now() };
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
  }, [signer, userAddr]);
  
  return { income, isLoading };
};
