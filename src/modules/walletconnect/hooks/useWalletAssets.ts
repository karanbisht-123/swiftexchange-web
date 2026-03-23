import { useEffect } from 'react';

import { WalletType } from '../../walletconnect/constants/Wallet';
import { useWalletConnect } from '../../walletconnect/hooks/useWalletConnect';
import { selectTotalValue, usePortfolioStore } from '../store/portfolioStore';
import { portfolioUtils } from '../utils/portfolioUtils';

export type { Asset } from '../store/portfolioStore';

export const useWalletAssets = (network: string) => {
  const { connectedWallets } = useWalletConnect();

  const assets = usePortfolioStore(state => state.assets);
  const isLoading = usePortfolioStore(state => state.isLoading);
  const fetchAssets = usePortfolioStore(state => state.fetchAssets);
  const totalValue = usePortfolioStore(selectTotalValue);
  const hasError = usePortfolioStore(state => state.hasError);
  const errorMessage = usePortfolioStore(state => state.errorMessage);

  // Fetch assets on mount and when wallets/network change
  useEffect(() => {
    const wallets = {
      [WalletType.EVM]: connectedWallets[WalletType.EVM],
      [WalletType.STELLAR]: connectedWallets[WalletType.STELLAR],
    };

    // Only fetch if at least one wallet is connected
    if (wallets[WalletType.EVM]?.address || wallets[WalletType.STELLAR]?.address) {
      fetchAssets(wallets, network);
    }
  }, [connectedWallets, network, fetchAssets]);

  // Price enrichment effect
  useEffect(() => {
    const fetchMissingPrices = async () => {
      const needsPrice = assets.filter(a => a.current_price === 0 && a.balance !== null);
      if (needsPrice.length === 0) return;

      try {
        const metadata = await Promise.all(
          needsPrice.map(a => portfolioUtils.getAssetMetadata(a.symbol))
        );
        const ids = metadata.map(m => m.id);
        const prices = await portfolioUtils.fetchPrices(ids);

        const { updateAsset } = usePortfolioStore.getState();
        needsPrice.forEach((asset, index) => {
          const cgId = ids[index];
          if (prices[cgId]) {
            updateAsset({
              ...asset,
              current_price: prices[cgId].usd,
              price_change_percentage_24h: prices[cgId].usd_24h_change,
            });
          }
        });
      } catch (err) {
        console.warn('[useWalletAssets] Price fetch failed:', err);
      }
    };

    const timer = setTimeout(fetchMissingPrices, 1000);
    return () => clearTimeout(timer);
  }, [assets]);

  return {
    assets,
    loading: isLoading,
    totalValue,
    hasError,
    errorMessage,
    refetch: () => {
      const wallets = {
        [WalletType.EVM]: connectedWallets[WalletType.EVM],
        [WalletType.STELLAR]: connectedWallets[WalletType.STELLAR],
      };
      usePortfolioStore.getState().refreshAssets(wallets, network);
    },
  };
};
