import { useCallback, useEffect, useState } from 'react';

import { Horizon } from '@stellar/stellar-sdk';

import { getStellarConfig } from '../config/chains';
import { useWalletStore } from '../store/walletConnectStore';

export interface UseStellarAccountStatusReturn {
  isActive: boolean | null;
  isChecking: boolean;
  error: string | null;
  checkStatus: (isManual?: boolean) => Promise<boolean>;
}

export function useStellarAccountStatus(customAddress?: string): UseStellarAccountStatusReturn {
  const currentNetwork = useWalletStore(state => state.network);
  const connectedAddress = useWalletStore(state => state.connectedWallets.stellar?.address);
  const address = customAddress || connectedAddress || '';

  const [isActive, setIsActive] = useState<boolean | null>(() => {
    if (!address) return null;
    const cacheKey = `stellar_active_${address}_${currentNetwork}`;
    return localStorage.getItem(cacheKey) === 'true' ? true : null;
  });

  const [isChecking, setIsChecking] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const checkStatus = useCallback(
    async (isManual = false): Promise<boolean> => {
      if (!address) {
        setIsActive(null);
        return false;
      }

      const cacheKey = `stellar_active_${address}_${currentNetwork}`;
      if (!isManual && localStorage.getItem(cacheKey) === 'true') {
        setIsActive(true);
        return true;
      }

      if (isManual) {
        setIsChecking(true);
      }
      setError(null);

      try {
        const config = getStellarConfig(currentNetwork);
        const horizon = new Horizon.Server(config.horizonUrl);
        const account = await horizon.loadAccount(address);
        const hasBalance = account.balances.some(b => parseFloat(b.balance) > 0);

        if (hasBalance) {
          localStorage.setItem(cacheKey, 'true');
          setIsActive(true);
          return true;
        } else {
          setIsActive(false);
          return false;
        }
      } catch (err: any) {
        if (err?.response?.status === 404 || err?.status === 404) {
          setIsActive(false);
        } else {
          if (isManual) {
            setError('Unable to reach Stellar network. Please try again.');
          }
          setIsActive(false);
        }
        return false;
      } finally {
        if (isManual) {
          setIsChecking(false);
        }
      }
    },
    [address, currentNetwork]
  );

  useEffect(() => {
    if (!address) {
      setIsActive(null);
      return;
    }

    const cacheKey = `stellar_active_${address}_${currentNetwork}`;
    if (localStorage.getItem(cacheKey) === 'true') {
      setIsActive(true);
      return;
    }

    checkStatus(false);
  }, [address, currentNetwork, checkStatus]);

  return {
    isActive,
    isChecking,
    error,
    checkStatus,
  };
}
