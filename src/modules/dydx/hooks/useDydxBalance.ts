import { useEffect, useState } from 'react';

export const useDydxBalance = (dydxAddress: string | null) => {
  const [balance, setBalance] = useState<any>(null);
  const [loading] = useState(false);
  const [error] = useState<string | null>(null);
  const [lastUpdateTime] = useState<number | null>(null);
  const [isLive] = useState(false);

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
