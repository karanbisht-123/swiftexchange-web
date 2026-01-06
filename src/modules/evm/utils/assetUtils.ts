// services/assetService.ts
import { ethers } from 'ethers';

import { fetchApiResponseFromProxy } from '../../../service/apiService';

export interface TokenInfo {
  chainId: number;
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  logoURI?: string;
  balance?: string;
  isNative?: boolean;
}

interface ChainNativeConfig {
  symbol: string;
  name: string;
  decimals: number;
}

// Only native token info needed on frontend
const NATIVE_TOKEN_CONFIG: Record<number, ChainNativeConfig> = {
  1: { symbol: 'ETH', name: 'Ethereum', decimals: 18 },
  56: { symbol: 'BNB', name: 'BNB', decimals: 18 },
  137: { symbol: 'MATIC', name: 'Polygon', decimals: 18 },
  42161: { symbol: 'ETH', name: 'Ethereum', decimals: 18 },
  10: { symbol: 'ETH', name: 'Ethereum', decimals: 18 },
  43114: { symbol: 'AVAX', name: 'Avalanche', decimals: 18 },
  11155111: { symbol: 'ETH', name: 'Sepolia ETH', decimals: 18 },
  80002: { symbol: 'MATIC', name: 'Amoy MATIC', decimals: 18 },
  97: { symbol: 'BNB', name: 'Test BNB', decimals: 18 },
  421614: { symbol: 'ETH', name: 'Arbitrum Sepolia ETH', decimals: 18 },
  11155420: { symbol: 'ETH', name: 'Optimism Sepolia ETH', decimals: 18 },
  43113: { symbol: 'AVAX', name: 'Fuji AVAX', decimals: 18 },
};

/**
 * Fetch native token balance
 */
async function fetchNativeBalance(
  provider: ethers.BrowserProvider,
  address: string
): Promise<string> {
  try {
    const balance = await provider.getBalance(address);
    return ethers.formatEther(balance);
  } catch (error) {
    console.error('Error fetching native balance:', error);
    return '0';
  }
}

/**
 * Fetch ERC20 token balances in batch
 */
async function fetchERC20Balances(
  provider: ethers.BrowserProvider,
  address: string,
  tokens: TokenInfo[]
): Promise<Map<string, string>> {
  const balances = new Map<string, string>();
  const erc20Abi = ['function balanceOf(address owner) view returns (uint256)'];

  const promises = tokens.map(async token => {
    try {
      const contract = new ethers.Contract(token.address, erc20Abi, provider);
      const balance = await contract.balanceOf(address);
      const formatted = ethers.formatUnits(balance, token.decimals);
      return { address: token.address.toLowerCase(), balance: formatted };
    } catch (error) {
      console.error(`Error fetching balance for ${token.symbol}:`, error);
      return { address: token.address.toLowerCase(), balance: '0' };
    }
  });

  const results = await Promise.all(promises);
  results.forEach(result => {
    balances.set(result.address, result.balance);
  });

  return balances;
}

/**
 * Fetch all available tokens for a chain from API
 */
export async function fetchAvailableTokens(chainId: number): Promise<TokenInfo[]> {
  try {
    const endpoint = `/eth/tokens/${chainId}`;
    const response = await fetchApiResponseFromProxy<{ tokens: TokenInfo[] }>(endpoint, 'GET');

    if (!response.data?.tokens || !Array.isArray(response.data.tokens)) {
      throw new Error('Invalid response format from API');
    }

    return response.data.tokens.map(token => ({
      ...token,
      isNative: false,
    }));
  } catch (error) {
    console.error(`Error fetching tokens for chain ${chainId}:`, error);
    throw new Error(`Failed to fetch tokens for chain ${chainId}`);
  }
}

/**
 * Fetch assets with balances for a specific wallet
 */
export async function fetchAssetsWithBalances(
  chainId: number,
  walletAddress: string,
  provider: ethers.BrowserProvider
): Promise<TokenInfo[]> {
  try {
    // Get native token config
    const nativeConfig = NATIVE_TOKEN_CONFIG[chainId];
    if (!nativeConfig) {
      throw new Error(`Unsupported chain: ${chainId}`);
    }

    // Fetch available tokens from API
    const tokens = await fetchAvailableTokens(chainId);

    // Fetch native token balance
    const nativeBalance = await fetchNativeBalance(provider, walletAddress);

    // Fetch ERC20 balances
    const erc20Balances = await fetchERC20Balances(provider, walletAddress, tokens);

    // Build assets array
    const assets: TokenInfo[] = [];

    // Add native token first
    assets.push({
      chainId,
      address: ethers.ZeroAddress,
      name: nativeConfig.name,
      symbol: nativeConfig.symbol,
      decimals: nativeConfig.decimals,
      balance: nativeBalance,
      isNative: true,
    });

    // Add ERC20 tokens with balances
    tokens.forEach(token => {
      const balance = erc20Balances.get(token.address.toLowerCase()) || '0';
      assets.push({
        ...token,
        balance,
        isNative: false,
      });
    });

    // Sort: native first, then by balance descending, then alphabetically
    return assets.sort((a, b) => {
      if (a.isNative) return -1;
      if (b.isNative) return 1;

      const balanceA = parseFloat(a.balance || '0');
      const balanceB = parseFloat(b.balance || '0');

      if (balanceA !== balanceB) {
        return balanceB - balanceA;
      }

      return a.symbol.localeCompare(b.symbol);
    });
  } catch (error) {
    console.error('Error fetching assets with balances:', error);
    throw error;
  }
}

/**
 * Get native token config
 */
export function getNativeTokenConfig(chainId: number): ChainNativeConfig | undefined {
  return NATIVE_TOKEN_CONFIG[chainId];
}

/**
 * Check if chain is supported
 */
export function isChainSupported(chainId: number): boolean {
  return chainId in NATIVE_TOKEN_CONFIG;
}

/**
 * Get all supported chain IDs
 */
export function getSupportedChainIds(): number[] {
  return Object.keys(NATIVE_TOKEN_CONFIG).map(Number);
}

// import { ethers } from 'ethers';

// import { type Asset } from '../../../types/evm/swap.types';
// import { getEVMChains } from '../../walletconnect/config/chains';
// import {
//   getProviderForChain,
//   getTokensForChain,
//   getWrappedNativeAddress,
// } from '../service/tokenListService';

// export class AssetUtils {
//   static async fetchAssets(chainId: number, address: string, network: string): Promise<Asset[]> {
//     if (!this.isValidAddress(address)) {
//       throw new Error('Invalid wallet address');
//     }

//     const availableChains = getEVMChains(network);
//     const chainConfig = availableChains.find(chain => chain.chainId === chainId);

//     if (!chainConfig) {
//       throw new Error(`Chain ID ${chainId} not found in ${network} configuration`);
//     }

//     console.log('Using chain:', chainConfig.name, 'on', network);

//     try {
//       const provider = getProviderForChain(chainId);
//       const tokens = await getTokensForChain(chainId, provider);

//       if (!tokens || tokens.length === 0) {
//         console.warn(`No tokens found for chainId: ${chainId}`);
//         return [];
//       }
//       console.log(`Found ${tokens.length} tokens for ${chainConfig.name}`);
//       const assets: Asset[] = [];
//       const rpcProvider = new ethers.JsonRpcProvider(chainConfig.rpcUrl);
//       const wrappedNativeAddress = getWrappedNativeAddress(chainId);
//       const BATCH_SIZE = 10;
//       for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
//         const batch = tokens.slice(i, i + BATCH_SIZE);

//         const batchPromises = batch.map(async token => {
//           try {
//             const balance = await this.fetchTokenBalance(
//               token.address,
//               address,
//               token.decimals,
//               wrappedNativeAddress,
//               rpcProvider
//             );

//             return {
//               code: token.symbol,
//               name: token.name,
//               decimals: token.decimals,
//               address: token.address,
//               balance: parseFloat(balance),
//               logoUri: token.logoURI || null,
//               isNative: false,
//             };
//           } catch (err) {
//             console.error(`Failed to fetch balance for ${token.symbol}:`, err);
//             return {
//               code: token.symbol,
//               name: token.name,
//               decimals: token.decimals,
//               address: token.address,
//               balance: 0,
//               logoUri: token.logoURI || null,
//               isNative: false,
//             };
//           }
//         });

//         const batchResults = await Promise.all(batchPromises);
//         assets.push(...batchResults);
//       }
//       return assets.sort((a, b) => {
//         if (a.balance > 0 && b.balance === 0) return -1;
//         if (a.balance === 0 && b.balance > 0) return 1;
//         return a.code.localeCompare(b.code);
//       });
//     } catch (err) {
//       console.error('Failed to fetch assets:', err);
//       throw new Error('Failed to load token list. Please try again.');
//     }
//   }

//   private static async fetchTokenBalance(
//     tokenAddress: string,
//     userAddress: string,
//     decimals: number,
//     wrappedNativeAddress: string,
//     provider: ethers.JsonRpcProvider
//   ): Promise<string> {
//     const isWrappedNative = tokenAddress.toLowerCase() === wrappedNativeAddress.toLowerCase();

//     if (isWrappedNative) {
//       const nativeBalance = await provider.getBalance(userAddress);
//       const wrappedContract = new ethers.Contract(
//         tokenAddress,
//         ['function balanceOf(address) view returns (uint256)'],
//         provider
//       );
//       const wrappedBalance = await wrappedContract.balanceOf(userAddress);
//       const totalBalance = nativeBalance > wrappedBalance ? nativeBalance : wrappedBalance;
//       return ethers.formatUnits(totalBalance, decimals);
//     }
//     const tokenContract = new ethers.Contract(
//       tokenAddress,
//       ['function balanceOf(address) view returns (uint256)'],
//       provider
//     );

//     const tokenBalance = await tokenContract.balanceOf(userAddress);
//     return ethers.formatUnits(tokenBalance, decimals);
//   }
//   static async searchTokens(
//     chainId: number,
//     searchTerm: string,
//     limit: number = 20
//   ): Promise<Asset[]> {
//     const provider = getProviderForChain(chainId);
//     const tokens = await getTokensForChain(chainId, provider);

//     const searchLower = searchTerm.toLowerCase();
//     const filtered = tokens.filter(
//       token =>
//         token.symbol.toLowerCase().includes(searchLower) ||
//         token.name.toLowerCase().includes(searchLower) ||
//         token.address.toLowerCase() === searchLower
//     );

//     return filtered.slice(0, limit).map(token => ({
//       code: token.symbol,
//       name: token.name,
//       decimals: token.decimals,
//       address: token.address,
//       balance: 0,
//       logoUri: token.logoURI || null,
//       isNative: false,
//     }));
//   }
//   static async getPopularTokens(chainId: number, limit: number = 50): Promise<Asset[]> {
//     const provider = getProviderForChain(chainId);
//     const tokens = await getTokensForChain(chainId, provider);
//     const popularSymbols = ['USDC', 'USDT', 'DAI', 'WETH', 'WBNB', 'WMATIC', 'BUSD'];
//     const wrappedNativeAddress = getWrappedNativeAddress(chainId);

//     const popular = tokens.filter(token => {
//       const isPopular = popularSymbols.includes(token.symbol);
//       const isWrappedNative = token.address.toLowerCase() === wrappedNativeAddress.toLowerCase();
//       return isPopular || isWrappedNative;
//     });
//     const remaining = tokens.filter(
//       token => !popular.find(p => p.address.toLowerCase() === token.address.toLowerCase())
//     );

//     const combined = [...popular, ...remaining].slice(0, limit);

//     return combined.map(token => ({
//       code: token.symbol,
//       name: token.name,
//       decimals: token.decimals,
//       address: token.address,
//       balance: 0,
//       logoUri: token.logoURI || null,
//       isNative: false,
//     }));
//   }

//   static isValidAddress(address: string): boolean {
//     return ethers.isAddress(address);
//   }

//   static clearMetadataCache(): void {
//     console.log('Metadata cache cleared');
//   }
// }
