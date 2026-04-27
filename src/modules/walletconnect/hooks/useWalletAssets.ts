import { useCallback, useEffect, useMemo } from 'react';
import { type Asset, usePortfolioStore } from '../store/portfolioStore';

import { useWalletStore } from '../store/walletConnectStore';

interface UseWalletAssetsReturn {
  assets: Asset[];
  loading: boolean;
  isRefreshing: boolean;
  totalValue: number;
  hasError: boolean;
  errorMessage: string;
  refetch: () => Promise<void>;
}


export function useWalletAssets(network: string): UseWalletAssetsReturn {
  const { connectedWallets } = useWalletStore();


  const storeAssets = usePortfolioStore((state) => state.assets);
  const isLoading = usePortfolioStore((state) => state.isLoading);
  const isFetching = usePortfolioStore((state) => state.isFetching);
  const hasError = usePortfolioStore((state) => state.hasError);
  const errorMessage = usePortfolioStore((state) => state.errorMessage || '');
  const fetchAssets = usePortfolioStore((state) => state.fetchAssets);
  const refreshAssets = usePortfolioStore((state) => state.refreshAssets);


  useEffect(() => {
    if (connectedWallets.evm || connectedWallets.stellar) {
      fetchAssets(connectedWallets, network);
    }

    const interval = setInterval(() => {
      if (document.visibilityState === 'visible' && (connectedWallets.evm || connectedWallets.stellar)) {
        fetchAssets(connectedWallets, network);
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [connectedWallets, network, fetchAssets]);


  const totalValue = useMemo(() => {
    return storeAssets.reduce((sum, a) => sum + (a.balance || 0) * (a.current_price || 0), 0);
  }, [storeAssets]);


  const refetch = useCallback(async () => {
    await refreshAssets(connectedWallets, network);
  }, [connectedWallets, network, refreshAssets]);

  return {
    assets: storeAssets,
    loading: isLoading,
    isRefreshing: isFetching,
    totalValue,
    hasError,
    errorMessage,
    refetch,
  };
}
