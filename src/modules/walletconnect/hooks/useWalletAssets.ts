import { useCallback, useEffect, useState } from 'react';

import * as StellarSdk from '@stellar/stellar-sdk';
import { ethers } from 'ethers';

import { ERC20_ABI, getTokenAddressesForChain } from '../../../config/tokenConfig';
import { getEVMChains, getStellarConfig } from '../../walletconnect/config/chains';
import { WalletType } from '../../walletconnect/constants/Wallet';
import { useWalletConnect } from '../../walletconnect/hooks/useWalletConnect';
import { portfolioUtils } from '../utils/portfolioUtils';

export interface Asset {
  id: string;
  symbol: string;
  name: string;
  image: string;
  balance: number | null;
  current_price: number;
  price_change_percentage_24h: number;
  chainName: string;
  isNative?: boolean;
}

export const useWalletAssets = (network: any) => {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(false);
  const { connectedWallets } = useWalletConnect();

  const updateAsset = useCallback((newAsset: Asset) => {
    setAssets(prev => {
      const index = prev.findIndex(a => a.id === newAsset.id);
      const nextAssets = [...prev];
      if (index >= 0) {
        nextAssets[index] = { ...nextAssets[index], ...newAsset };
      } else {
        nextAssets.push(newAsset);
      }
      // Sort by USD value descending
      return nextAssets.sort(
        (a, b) => (b.balance || 0) * b.current_price - (a.balance || 0) * a.current_price
      );
    });
  }, []);

  const fetchAllBalances = useCallback(async () => {
    setLoading(true);
    setAssets([]);

    const evmAddr = connectedWallets[WalletType.EVM]?.address;
    const stellarAddr = connectedWallets[WalletType.STELLAR]?.address;

    // 1. DYNAMIC STELLAR FETCH - Only show assets with balance > 0
    if (stellarAddr) {
      const config = getStellarConfig(network);
      const server = new StellarSdk.Horizon.Server(config.horizonUrl);
      server.loadAccount(stellarAddr).then(async acc => {
        for (const b of acc.balances) {
          const balanceNum = parseFloat(b.balance);
          if (balanceNum > 0) {
            const symbol = 'asset_code' in b ? b.asset_code : 'XLM';
            const meta = await portfolioUtils.getAssetMetadata(symbol);
            updateAsset({
              id: `stellar-${symbol}`,
              symbol,
              name: meta.name,
              image: meta.image,
              balance: balanceNum,
              current_price: 0,
              price_change_percentage_24h: 0,
              chainName: 'Stellar',
            });
          }
        }
      });
    }

    // 2. DYNAMIC EVM FETCH - Render immediately, load balance async
    if (evmAddr) {
      const chains = getEVMChains(network);
      for (const chain of chains) {
        const provider = new ethers.JsonRpcProvider(chain.rpcUrl);

        // Native Balance - Only show if balance > 0
        (async () => {
          const bal = await provider.getBalance(evmAddr);
          const balanceNum = parseFloat(ethers.formatEther(bal));

          if (balanceNum > 0) {
            const meta = await portfolioUtils.getAssetMetadata(chain.nativeCurrency.symbol);
            updateAsset({
              id: `${chain.chainId}-native`,
              symbol: chain.nativeCurrency.symbol,
              name: chain.name,
              image: meta.image,
              balance: balanceNum,
              current_price: 0,
              price_change_percentage_24h: 0,
              chainName: chain.name,
              isNative: true,
            });
          }
        })();

        // Scan common tokens for this chain - Only show if balance > 0
        const tokens = getTokenAddressesForChain(chain.chainId);
        Object.entries(tokens).forEach(async ([symbol, address]) => {
          const contract = new ethers.Contract(address, ERC20_ABI, provider);

          try {
            const [bal, dec] = await Promise.all([
              contract.balanceOf(evmAddr),
              contract.decimals(),
            ]);
            const balanceNum = parseFloat(ethers.formatUnits(bal, dec));

            if (balanceNum > 0) {
              const meta = await portfolioUtils.getAssetMetadata(symbol);
              updateAsset({
                id: `${chain.chainId}-${symbol}`,
                symbol,
                name: meta.name,
                image: meta.image,
                balance: balanceNum,
                current_price: 0,
                price_change_percentage_24h: 0,
                chainName: chain.name,
              });
            }
          } catch (e) {
            /* Token not on this chain */
          }
        });
      }
    }
    setLoading(false);
  }, [connectedWallets, network, updateAsset]);

  // Price Enrichment: Runs in background when assets are discovered
  useEffect(() => {
    const fetchMissingPrices = async () => {
      const needsPrice = assets.filter(a => a.current_price === 0 && a.balance !== null);
      if (needsPrice.length === 0) return;

      const metadata = await Promise.all(
        needsPrice.map(a => portfolioUtils.getAssetMetadata(a.symbol))
      );
      const ids = metadata.map(m => m.id);
      const prices = await portfolioUtils.fetchPrices(ids);

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
    };

    const timer = setTimeout(fetchMissingPrices, 1000);
    return () => clearTimeout(timer);
  }, [assets, updateAsset]);

  // Auto-load on mount
  useEffect(() => {
    fetchAllBalances();
  }, [fetchAllBalances]);

  return {
    assets,
    loading,
    refetch: fetchAllBalances,
    totalValue: portfolioUtils.calculateTotalUSD(assets),
  };
};
