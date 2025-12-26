import { useCallback, useEffect, useState } from 'react';

import * as StellarSdk from '@stellar/stellar-sdk';
import { ethers } from 'ethers';

import {
  type EVMChainConfig,
  type NetworkType,
  getEVMChains,
  getStellarConfig,
} from '../../walletconnect/config/chains';
import { WalletType } from '../../walletconnect/constants/Wallet';
import { useWalletConnect } from '../../walletconnect/hooks/useWalletConnect';
import { useWalletStore } from '../store/walletConnectStore';

export interface Asset {
  id: string;
  symbol: string;
  name: string;
  image: string;
  balance: number;
  volume: number;
  current_price: number;
  price_change_percentage_24h: number;
  chainId?: number;
  chainName?: string;
}

const COINGECKO_IDS_MAP: Record<string, string> = {
  ETH: 'ethereum',
  MATIC: 'matic-network',
  BNB: 'binancecoin',
  AVAX: 'avalanche-2',
  XLM: 'stellar',
};

const fetchPrices = async (
  symbols: string[]
): Promise<Record<string, { usd: number; usd_24h_change: number; volume: number }>> => {
  const ids = [
    ...new Set(symbols.map(s => COINGECKO_IDS_MAP[s.toUpperCase()] || s.toLowerCase())),
  ].join(',');
  if (!ids) return {};
  try {
    const response = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true`
    );
    if (!response.ok) return {};
    const data = await response.json();
    const result: Record<string, any> = {};
    symbols.forEach(symbol => {
      const id = COINGECKO_IDS_MAP[symbol.toUpperCase()] || symbol.toLowerCase();
      if (data[id]) {
        result[symbol] = {
          usd: data[id].usd,
          usd_24h_change: data[id].usd_24hr_change || 0,
          volume: data[id].usd_24hr_vol || 0,
        };
      }
    });
    return result;
  } catch {
    return {};
  }
};

const fetchStellarAssets = async (address: string, network: NetworkType): Promise<Asset[]> => {
  const config = getStellarConfig(network);
  const server = new StellarSdk.Horizon.Server(config.horizonUrl);

  try {
    const account = await server.loadAccount(address);
    const balances = account.balances.filter(b => parseFloat(b.balance) > 0);
    if (balances.length === 0) return [];

    const symbols = balances.map(b => ('asset_code' in b ? b.asset_code : 'XLM'));
    const prices = await fetchPrices(symbols);

    return balances.map(b => {
      const symbol = 'asset_code' in b ? b.asset_code : 'XLM';
      const priceData = prices[symbol] || { usd: 0, usd_24h_change: 0, volume: 0 };
      const balance = parseFloat(b.balance);
      const id = COINGECKO_IDS_MAP[symbol] || symbol.toLowerCase();

      const image =
        symbol === 'XLM' && config.logoUrl
          ? config.logoUrl
          : `https://coin-images.coingecko.com/coins/images/${id}/large/${id}.png`;

      return {
        id: `stellar-${symbol.toLowerCase()}`,
        symbol,
        name: symbol === 'XLM' ? 'Stellar Lumens' : `${symbol} on Stellar`,
        image,
        balance,
        current_price: priceData.usd,
        price_change_percentage_24h: priceData.usd_24h_change,
        volume: priceData.volume,
      };
    });
  } catch {
    return [];
  }
};

const fetchEVMNativeBalances = async (
  chains: EVMChainConfig[],
  address: string,
  currentChainId: number
): Promise<Asset[]> => {
  const assets: Asset[] = [];

  for (const chain of chains) {
    try {
      const provider = new ethers.JsonRpcProvider(chain.rpcUrl);
      const balanceWei = await provider.getBalance(address);
      const balance = parseFloat(ethers.formatEther(balanceWei));

      if (balance <= 0) continue; 

      const symbol = chain.nativeCurrency.symbol;
      const prices = await fetchPrices([symbol]);
      const priceData = prices[symbol] || { usd: 0, usd_24h_change: 0, volume: 0 };

      const image =
        chain.logoUrl ||
        `https://coin-images.coingecko.com/coins/images/${COINGECKO_IDS_MAP[symbol] || symbol.toLowerCase()}/large/${symbol.toLowerCase()}.png`;

      assets.push({
        id: `${chain.chainId}-${symbol.toLowerCase()}`,
        symbol,
        name: chain.name,
        image,
        balance,
        current_price: priceData.usd,
        price_change_percentage_24h: priceData.usd_24h_change,
        volume: priceData.volume,
        chainId: chain.chainId,
        chainName: chain.name,
      });
    } catch {
    }
  }

  return assets;
};

export const useWalletAssets = () => {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);

  const { network } = useWalletStore();
  const { connectedWallets } = useWalletConnect();

  const fetchAllAssets = useCallback(async () => {
    setLoading(true);
    const allAssets: Asset[] = [];

    try {
      const evmWallet = connectedWallets[WalletType.EVM];
      const stellarWallet = connectedWallets[WalletType.STELLAR];

      // Fetch EVM native balances only (no fake tokens)
      if (evmWallet?.address) {
        const evmChains = getEVMChains(network);
        const evmAssets = await fetchEVMNativeBalances(
          evmChains,
          evmWallet.address,
          Number(evmWallet.chainId)
        );
        allAssets.push(...evmAssets);
      }

      // Fetch real Stellar assets user holds
      if (stellarWallet?.address) {
        const stellarAssets = await fetchStellarAssets(stellarWallet.address, network);
        allAssets.push(...stellarAssets);
      }

      // Sort by balance descending
      allAssets.sort((a, b) => b.balance - a.balance);

      setAssets(allAssets);
    } catch (error) {
      console.error('Error fetching wallet assets:', error);
      setAssets([]);
    } finally {
      setLoading(false);
    }
  }, [connectedWallets, network]);

  useEffect(() => {
    if (Object.keys(connectedWallets).length > 0) {
      fetchAllAssets();
    } else {
      setAssets([]);
      setLoading(false);
    }
  }, [connectedWallets, network, fetchAllAssets]);


  const isEmpty = !loading && assets.length === 0 && Object.keys(connectedWallets).length > 0;

  return {
    assets,
    loading,
    refetch: fetchAllAssets,
    isEmpty,
  };
};
