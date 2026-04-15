import { useEffect, useRef } from 'react';

import { WalletType } from '../../walletconnect/constants/Wallet';
import { useWalletConnect } from '../../walletconnect/hooks/useWalletConnect';
import { selectTotalValue, usePortfolioStore } from '../store/portfolioStore';

export type { Asset } from '../store/portfolioStore';

export const useWalletAssets = (network: string) => {
  const { connectedWallets } = useWalletConnect();

  const assets = usePortfolioStore(state => state.assets);
  const isLoading = usePortfolioStore(state => state.isLoading);
  const totalValue = usePortfolioStore(selectTotalValue);
  const hasError = usePortfolioStore(state => state.hasError);
  const errorMessage = usePortfolioStore(state => state.errorMessage);
  const networkRef = useRef(network);
  networkRef.current = network;
  const walletsRef = useRef(connectedWallets);
  walletsRef.current = connectedWallets;

  // Fetch balances when wallet addresses or network change.
  const evmAddress = connectedWallets[WalletType.EVM]?.address;
  const stellarAddress = connectedWallets[WalletType.STELLAR]?.address;

  useEffect(() => {
    const wallets = {
      [WalletType.EVM]: walletsRef.current[WalletType.EVM],
      [WalletType.STELLAR]: walletsRef.current[WalletType.STELLAR],
    };
    if (wallets[WalletType.EVM]?.address || wallets[WalletType.STELLAR]?.address) {
      usePortfolioStore.getState().fetchAssets(wallets, networkRef.current);
    }
  }, [evmAddress, stellarAddress, network]);

  return {
    assets,
    loading: isLoading,
    totalValue,
    hasError,
    errorMessage,
    refetch: () => {
      const wallets = {
        [WalletType.EVM]: walletsRef.current[WalletType.EVM],
        [WalletType.STELLAR]: walletsRef.current[WalletType.STELLAR],
      };
      usePortfolioStore.getState().refreshAssets(wallets, networkRef.current);
    },
  };
};
