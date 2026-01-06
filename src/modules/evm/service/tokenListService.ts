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
