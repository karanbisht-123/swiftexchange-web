import { useCallback, useEffect, useState } from 'react';

import * as StellarSdk from '@stellar/stellar-sdk';
import { ethers } from 'ethers';

import { ERC20_ABI } from '../../../abi/Erc20AbI';
import {
  type EVMChainConfig,
  EVM_CHAINS_MAINNET,
  EVM_CHAINS_TESTNET,
  getNetwork,
  getStellarConfig,
} from '../../walletconnect/config/chains';
import { WalletType } from '../../walletconnect/constants/Wallet';
import { useWalletConnect } from '../../walletconnect/hooks/useWalletConnect';

export interface Asset {
  id: string;
  symbol: string;
  name: string;
  image: string;
  balance: number;
  volume: number;
  current_price: number;
  price_change_percentage_24h: number;
  isComingSoon?: boolean;
  contractAddress?: string;
  decimals?: number;
  isLoading?: boolean;
  chainId?: number;
  chainName?: string;
}

interface TokenInfo {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  coingeckoId?: string;
  image?: string;
}

const COINGECKO_BASE_URL = 'https://api.coingecko.com/api/v3';

const COINGECKO_IDS_MAP: Record<string, string> = {
  ETH: 'ethereum',
  MATIC: 'matic-network',
  BNB: 'binancecoin',
  AVAX: 'avalanche-2',
  XLM: 'stellar',
  BTC: 'bitcoin',
};

const POPULAR_TOKENS: Record<number, TokenInfo[]> = {
  1: [
    {
      address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      symbol: 'USDT',
      name: 'Tether',
      decimals: 6,
      coingeckoId: 'tether',
    },
    {
      address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      symbol: 'USDC',
      name: 'USD Coin',
      decimals: 6,
      coingeckoId: 'usd-coin',
    },
    {
      address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
      symbol: 'WBTC',
      name: 'Wrapped Bitcoin',
      decimals: 8,
      coingeckoId: 'wrapped-bitcoin',
    },
  ],
  137: [
    {
      address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
      symbol: 'USDT',
      name: 'Tether',
      decimals: 6,
      coingeckoId: 'tether',
    },
    {
      address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
      symbol: 'USDC',
      name: 'USD Coin',
      decimals: 6,
      coingeckoId: 'usd-coin',
    },
  ],
  56: [
    {
      address: '0x55d398326f99059fF775485246999027B3197955',
      symbol: 'USDT',
      name: 'Tether',
      decimals: 18,
      coingeckoId: 'tether',
    },
    {
      address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
      symbol: 'USDC',
      name: 'USD Coin',
      decimals: 18,
      coingeckoId: 'usd-coin',
    },
  ],
  43114: [
    {
      address: '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7',
      symbol: 'USDT',
      name: 'Tether',
      decimals: 6,
      coingeckoId: 'tether',
    },
    {
      address: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',
      symbol: 'USDC',
      name: 'USD Coin',
      decimals: 6,
      coingeckoId: 'usd-coin',
    },
  ],
  11155111: [
    {
      address: '0x7169D38820dfd117C3FA1f22a697dBA58d90BA06',
      symbol: 'USDT',
      name: 'Tether (Testnet)',
      decimals: 6,
      coingeckoId: 'tether',
    },
  ],
  97: [
    {
      address: '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd',
      symbol: 'USDT',
      name: 'Tether (Testnet)',
      decimals: 18,
      coingeckoId: 'tether',
    },
  ],
  80002: [
    {
      address: '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582',
      symbol: 'USDC',
      name: 'USD Coin (Testnet)',
      decimals: 6,
      coingeckoId: 'usd-coin',
    },
  ],
};

const identifyNetworkType = (chainId: number): 'mainnet' | 'testnet' | null => {
  const isMainnet = EVM_CHAINS_MAINNET.some(chain => chain.chainId === chainId);
  const isTestnet = EVM_CHAINS_TESTNET.some(chain => chain.chainId === chainId);

  if (isMainnet) return 'mainnet';
  if (isTestnet) return 'testnet';
  return null;
};

const fetchPrices = async (
  symbols: string[]
): Promise<Record<string, { usd: number; usd_24h_change: number; volume: number }>> => {
  const ids = symbols
    .map(s => COINGECKO_IDS_MAP[s.toUpperCase()] || s.toLowerCase())
    .filter(Boolean)
    .join(',');
  if (!ids) return {};
  try {
    const response = await fetch(
      `${COINGECKO_BASE_URL}/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true`
    );
    if (!response.ok) throw new Error('Failed to fetch prices');
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
  } catch (error) {
    console.error('Price fetch error:', error);
    return {};
  }
};

const fetchERC20Balance = async (
  tokenAddress: string,
  userAddress: string,
  provider: ethers.Provider,
  decimals: number
): Promise<number> => {
  try {
    const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
    const balance = await contract.balanceOf(userAddress);
    return parseFloat(ethers.formatUnits(balance, decimals));
  } catch (error) {
    console.error(`Error fetching ERC20 balance for ${tokenAddress}:`, error);
    return 0;
  }
};

const fetchStellarAssets = async (address: string): Promise<Asset[]> => {
  const config = getStellarConfig();
  const server = new StellarSdk.Horizon.Server(config.horizonUrl);
  try {
    const account = await server.loadAccount(address);
    const symbols = account.balances.map(b => {
      if ('asset_code' in b) {
        return b.asset_code;
      }
      return 'XLM';
    });
    const prices = await fetchPrices(symbols);

    return account.balances
      .map(b => {
        const symbol = 'asset_code' in b ? b.asset_code : 'XLM';
        const priceData = prices[symbol] || { usd: 0, usd_24h_change: 0, volume: 0 };
        const balance = parseFloat(b.balance);
        const id = COINGECKO_IDS_MAP[symbol] || symbol.toLowerCase();
        return {
          id: `stellar-${symbol.toLowerCase()}`,
          symbol,
          name: symbol === 'XLM' ? 'Stellar Lumens' : `${symbol} on Stellar`,
          image: `https://coin-images.coingecko.com/coins/images/${id === symbol.toLowerCase() ? '100' : id}/large/${id}.png`,
          balance,
          current_price: priceData.usd,
          price_change_percentage_24h: priceData.usd_24h_change,
          volume: priceData.volume,
        };
      })
      .filter((a): a is Asset => a !== null);
  } catch (error) {
    console.error('Stellar assets fetch error:', error);
    return [];
  }
};

const fetchAssetsForChain = async (
  chainConfig: EVMChainConfig,
  connectedAddress: string | null,
  isConnectedChain: boolean
): Promise<Asset[]> => {
  const assets: Asset[] = [];
  const nativeSymbol = chainConfig.nativeCurrency.symbol;

  try {
    let balance = 0;
    const networkTokens = POPULAR_TOKENS[chainConfig.chainId] || [];
    let tokenBalances: Array<TokenInfo & { balance: number }> = [];

    if (isConnectedChain && connectedAddress) {
      const provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl);

      const [balanceWei, ...fetchedTokenBalances] = await Promise.all([
        provider.getBalance(connectedAddress),
        ...networkTokens.map(async token => {
          const balance = await fetchERC20Balance(
            token.address,
            connectedAddress,
            provider,
            token.decimals
          );
          return { ...token, balance };
        }),
      ]);

      balance = parseFloat(ethers.formatEther(balanceWei));
      tokenBalances = fetchedTokenBalances;
    } else {
      tokenBalances = networkTokens.map(token => ({ ...token, balance: 0 }));
    }

    // const allSymbols = [nativeSymbol, ...tokenBalances.map(t => t.symbol)];
    const symbolToCoingeckoId: Record<string, string> = {};

    tokenBalances.forEach(token => {
      if (token.coingeckoId) {
        symbolToCoingeckoId[token.symbol] = token.coingeckoId;
      }
    });

    const coingeckoIds = [COINGECKO_IDS_MAP[nativeSymbol], ...Object.values(symbolToCoingeckoId)]
      .filter(Boolean)
      .join(',');

    let prices: Record<string, any> = {};
    if (coingeckoIds) {
      try {
        const response = await fetch(
          `${COINGECKO_BASE_URL}/simple/price?ids=${coingeckoIds}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true`
        );
        if (response.ok) {
          const data = await response.json();

          prices[nativeSymbol] = data[COINGECKO_IDS_MAP[nativeSymbol]] || {
            usd: 0,
            usd_24hr_change: 0,
            usd_24hr_vol: 0,
          };

          Object.entries(symbolToCoingeckoId).forEach(([symbol, id]) => {
            if (data[id]) {
              prices[symbol] = data[id];
            }
          });
        }
      } catch (error) {
        console.error('Error fetching prices:', error);
      }
    }

    // Add native token
    const nativePriceData = prices[nativeSymbol] || { usd: 0, usd_24hr_change: 0, usd_24hr_vol: 0 };
    const nativeId = COINGECKO_IDS_MAP[nativeSymbol] || nativeSymbol.toLowerCase();

    assets.push({
      id: `${chainConfig.chainId}-${nativeSymbol.toLowerCase()}`,
      symbol: nativeSymbol,
      name: chainConfig.name,
      image: `https://coin-images.coingecko.com/coins/images/${nativeId}/large/${nativeId}.png`,
      balance,
      current_price: nativePriceData.usd,
      price_change_percentage_24h: nativePriceData.usd_24hr_change || 0,
      volume: nativePriceData.usd_24hr_vol || 0,
      chainId: chainConfig.chainId,
      chainName: chainConfig.name,
    });

    // Add all tokens
    tokenBalances.forEach(token => {
      const priceData = prices[token.symbol] || { usd: 0, usd_24hr_change: 0, usd_24hr_vol: 0 };

      assets.push({
        id: `${chainConfig.chainId}-${token.address.toLowerCase()}`,
        symbol: token.symbol,
        name: token.name,
        image: `https://coin-images.coingecko.com/coins/images/${token.coingeckoId}/large/${token.symbol.toLowerCase()}.png`,
        balance: token.balance,
        current_price: priceData.usd,
        price_change_percentage_24h: priceData.usd_24hr_change || 0,
        volume: priceData.usd_24hr_vol || 0,
        contractAddress: token.address,
        decimals: token.decimals,
        chainId: chainConfig.chainId,
        chainName: chainConfig.name,
      });
    });

    return assets;
  } catch (error) {
    console.error(`Error fetching assets for chain ${chainConfig.name}:`, error);
    return [];
  }
};

const fetchAllEVMAssets = async (
  connectedAddress: string | null,
  connectedChainId: number | null
): Promise<Asset[]> => {
  console.log('Fetching all EVM assets...', { connectedAddress, connectedChainId });

  const networkType = connectedChainId ? identifyNetworkType(connectedChainId) : getNetwork();

  if (!networkType) {
    console.warn('Could not identify network type, using config default');
  }

  const allChains = networkType === 'testnet' ? EVM_CHAINS_TESTNET : EVM_CHAINS_MAINNET;

  console.log(
    `Fetching assets for ${allChains.length} chains on ${networkType}`,
    allChains.map(c => c.name)
  );

  const assetsPromises = allChains.map(chainConfig =>
    fetchAssetsForChain(chainConfig, connectedAddress, chainConfig.chainId === connectedChainId)
  );

  const assetsArrays = await Promise.all(assetsPromises);
  const allAssets = assetsArrays.flat();

  console.log(`Total assets fetched: ${allAssets.length}`);
  return allAssets;
};

const getComingSoonAssets = async (): Promise<Asset[]> => {
  try {
    const prices = await fetchPrices(['BTC']);
    const priceData = prices['BTC'] || { usd: 0, usd_24h_change: 0, volume: 0 };

    return [
      {
        id: 'btc-coming-soon',
        symbol: 'BTC',
        name: 'Bitcoin',
        image: 'https://coin-images.coingecko.com/coins/images/1/large/bitcoin.png',
        balance: 0,
        current_price: priceData.usd,
        price_change_percentage_24h: priceData.usd_24h_change,
        volume: priceData.volume,
        isComingSoon: true,
      },
    ];
  } catch (error) {
    console.error('Coming soon assets fetch error:', error);
    return [];
  }
};

export const useWalletAssets = () => {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasInitialLoad, setHasInitialLoad] = useState(false);

  const { connectedWallets } = useWalletConnect();

  const fetchAllAssets = useCallback(async () => {
    if (!hasInitialLoad) {
      setLoading(true);
    }

    try {
      const allAssets: Asset[] = [];

      const evmWallet = connectedWallets[WalletType.EVM];
      const evmAddress = evmWallet?.address ?? null;
      const evmChainId = evmWallet?.chainId ? Number(evmWallet.chainId) : null;

      if (evmAddress && evmChainId) {
        const evmAssets = await fetchAllEVMAssets(evmAddress, evmChainId);
        allAssets.push(...evmAssets);
      }

      const stellarWallet = connectedWallets[WalletType.STELLAR];

      if (stellarWallet?.address) {
        const stellarAssets = await fetchStellarAssets(stellarWallet.address);
        console.log('Stellar assets fetched:', stellarAssets.length);
        allAssets.push(...stellarAssets);
      }

      if (evmAddress || stellarWallet?.address) {
        const comingSoonAssets = await getComingSoonAssets();
        allAssets.push(...comingSoonAssets);
      }

      console.log('Total assets:', allAssets.length);

      setAssets(allAssets);
      setHasInitialLoad(true);
    } catch (error) {
      console.error('Fetch all assets error:', error);
      setAssets([]);
    } finally {
      setLoading(false);
    }
  }, [connectedWallets, hasInitialLoad]);

  useEffect(() => {
    if (connectedWallets && Object.keys(connectedWallets).length > 0) {
      fetchAllAssets();
    } else {
      setAssets([]);
      setLoading(false);
      setHasInitialLoad(false);
    }
  }, [connectedWallets]);

  return { assets, loading, refetch: fetchAllAssets };
};
