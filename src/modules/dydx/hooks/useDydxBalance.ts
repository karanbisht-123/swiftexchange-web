import { useEffect, useState } from 'react';

import { getSocketClient } from '../client/clients';

export const useDydxBalance = (dydxAddress: string | null) => {
  const [balance, setBalance] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdateTime, setLastUpdateTime] = useState<number | null>(null);
  const [isLive, setIsLive] = useState(false);

  const fetchBalance = async () => {
    if (!dydxAddress) return;
  };

  const refresh = () => fetchBalance();

  useEffect(() => {
    if (!dydxAddress) {
      setBalance(null);
      return;
    }

    fetchBalance();
  }, [dydxAddress]);

  return {
    balance,
    loading,
    error,
    refresh,
    lastUpdateTime,
    isLive,
  };
};
