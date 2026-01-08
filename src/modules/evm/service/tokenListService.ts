import { ethers } from 'ethers';

import { ERC20_ABI, getTokenAddressesForChain } from '../../../config/tokenConfig';
import { portfolioUtils } from '../../walletconnect/utils/portfolioUtils';

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
  provider: ethers.BrowserProvider | ethers.JsonRpcProvider,
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
async function fetchERC20BalancesAndMetadata(
  provider: ethers.BrowserProvider | ethers.JsonRpcProvider,
  address: string,
  tokens: { symbol: string; address: string }[]
): Promise<TokenInfo[]> {
  const promises = tokens.map(async token => {
    try {
      const contract = new ethers.Contract(token.address, ERC20_ABI, provider);

      // Fetch balance and decimals in parallel
      const [balance, decimals] = await Promise.all([
        contract.balanceOf(address),
        contract.decimals().catch(() => 18), // Default to 18 if decimals fail
      ]);

      const formattedBalance = ethers.formatUnits(balance, decimals);
      const metadata = await portfolioUtils.getAssetMetadata(token.symbol);

      return {
        chainId: 0, // Will be set by caller
        address: token.address,
        name: metadata.name,
        symbol: token.symbol,
        decimals: Number(decimals),
        logoURI: metadata.image,
        balance: formattedBalance,
        isNative: false,
      };
    } catch (error) {
      console.warn(`Error fetching data for ${token.symbol}:`, error);
      // Return basic info with 0 balance if fetch fails
      return {
        chainId: 0,
        address: token.address,
        name: token.symbol,
        symbol: token.symbol,
        decimals: 18,
        logoURI: '',
        balance: '0',
        isNative: false,
      };
    }
  });

  return Promise.all(promises);
}

/**
 * Fetch assets with balances for a specific wallet
 */
export async function fetchAssetsWithBalances(
  chainId: number,
  walletAddress: string,
  provider: ethers.BrowserProvider | ethers.JsonRpcProvider
): Promise<TokenInfo[]> {
  try {
    // Get native token config
    const nativeConfig = NATIVE_TOKEN_CONFIG[chainId];
    if (!nativeConfig) {
      throw new Error(`Unsupported chain: ${chainId}`);
    }

    // 1. Fetch Native Token Balance
    const nativeBalance = await fetchNativeBalance(provider, walletAddress);
    const nativeMetadata = await portfolioUtils.getAssetMetadata(nativeConfig.symbol);

    const nativeAsset: TokenInfo = {
      chainId,
      address: ethers.ZeroAddress,
      name: nativeConfig.name,
      symbol: nativeConfig.symbol,
      decimals: nativeConfig.decimals,
      logoURI: nativeMetadata.image,
      balance: nativeBalance,
      isNative: true,
    };

    // 2. Get Supported ERC20 Tokens for this Chain
    const tokenAddresses = getTokenAddressesForChain(chainId);
    const tokensToFetch = Object.entries(tokenAddresses).map(([symbol, address]) => ({
      symbol,
      address,
    }));

    // 3. Fetch Balances and Metadata for ERC20s
    const erc20Assets = await fetchERC20BalancesAndMetadata(provider, walletAddress, tokensToFetch);

    // 4. Combine and Sort
    // Sort: Native first, then by balance descending, then alphabetically through symbol
    const allAssets = [nativeAsset, ...erc20Assets].map(asset => ({ ...asset, chainId }));

    return allAssets.sort((a, b) => {
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

// Deprecated functions kept for compatibility if needed, or can be removed
export async function fetchAvailableTokens(chainId: number): Promise<TokenInfo[]> {
  // Since we don't have an API, we return the static list with 0 balances
  const tokenAddresses = getTokenAddressesForChain(chainId);
  return Object.entries(tokenAddresses).map(([symbol, address]) => ({
    chainId,
    address,
    name: symbol,
    symbol,
    decimals: 18,
    balance: '0',
    isNative: false,
  }));
}
