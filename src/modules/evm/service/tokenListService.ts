import { ethers } from 'ethers';
import { ERC20_ABI } from '../../../abi/Erc20AbI';
import PancakeTokens from '../../../data/swap/PancakeList.json';
import UniswapTokens from '../../../data/swap/UniswapList.json';
import { CHAIN_REGISTRY, getChainById } from '../utils/Chainregistry';

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

export interface ChainNativeConfig {
  symbol: string;
  name: string;
  decimals: number;
  logoURI: string;
}

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const ZERO_ADDRESS_UPPER = '0X0000000000000000000000000000000000000000';

function isNativeAddress(address: string): boolean {
  const addr = address.toLowerCase();
  return addr === ZERO_ADDRESS || addr === ZERO_ADDRESS_UPPER.toLowerCase();
}

export function getTokensForChain(chainId: number): TokenInfo[] {
  const chainConfig = getChainById(chainId);
  if (!chainConfig) return [];

  let rawTokens: any[] = [];
  const platform = chainConfig.coingeckoPlatform.toLowerCase();
  const slug = chainConfig.slug.toLowerCase();

  if (platform === 'binance-smart-chain' || platform === 'bnb' || slug === 'smartchain' || slug === 'binance') {
    rawTokens = PancakeTokens;
  } else {
    rawTokens = UniswapTokens;
  }

  const combinedTokens = [...(chainConfig.assets || []), ...rawTokens].filter(
    t => t.chainId === chainId || !t.chainId
  );

  const uniqueTokensMap = new Map<string, any>();
  for (const t of combinedTokens) {
    const addr = t.address?.toLowerCase();
    if (addr && !uniqueTokensMap.has(addr)) {
      uniqueTokensMap.set(addr, t);
    }
  }

  const mappedTokens: TokenInfo[] = Array.from(uniqueTokensMap.values())
    .filter(t => !isNativeAddress(t.address))
    .map(t => ({
      chainId: chainId,
      address: t.address,
      name: t.name,
      symbol: t.symbol,
      decimals: t.decimals,
      logoURI: t.logoURI,
      balance: undefined,
      isNative: false,
    }));

  if (chainConfig.nativeCurrency) {
    const nativeAsset: TokenInfo = {
      chainId,
      address: ethers.ZeroAddress,
      name: chainConfig.nativeCurrency.name,
      symbol: chainConfig.nativeCurrency.symbol,
      decimals: chainConfig.nativeCurrency.decimals,
      logoURI: chainConfig.nativeCurrency.logoURI,
      balance: undefined,
      isNative: true,
    };
    return [nativeAsset, ...mappedTokens];
  }

  return mappedTokens;
}

export async function fetchSingleTokenBalance(
  walletAddress: string,
  provider: ethers.BrowserProvider | ethers.AbstractProvider,
  tokenAddress: string,
  isNative: boolean,
  decimals = 18
): Promise<string> {
  try {
    if (isNative || isNativeAddress(tokenAddress)) {
      const balance = await provider.getBalance(walletAddress);
      return ethers.formatEther(balance);
    }

    const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
    const balance = await contract.balanceOf(walletAddress);
    return ethers.formatUnits(balance, decimals);
  } catch (error) {
    console.error(`[TokenList] Error fetching balance for ${tokenAddress}:`, error);
    return '0';
  }
}

export function getNativeTokenConfig(chainId: number): ChainNativeConfig | undefined {
  const chainConfig = getChainById(chainId);
  if (!chainConfig) return undefined;
  return {
    symbol: chainConfig.nativeCurrency.symbol,
    name: chainConfig.nativeCurrency.name,
    decimals: chainConfig.nativeCurrency.decimals,
    logoURI: chainConfig.nativeCurrency.logoURI,
  };
}

export function isChainSupported(chainId: number): boolean {
  const chain = getChainById(chainId);
  return !!chain && chain.available;
}

export function isSwapEnabled(chainId: number): boolean {
  const chain = getChainById(chainId);
  return !!chain && chain.available && chain.swapEnabled;
}

export function getSupportedChainIds(): number[] {
  return CHAIN_REGISTRY.filter(c => c.available).map(c => c.chainId);
}

export function getSwapEnabledChainIds(): number[] {
  return CHAIN_REGISTRY.filter(c => c.available && c.swapEnabled).map(c => c.chainId);
}

