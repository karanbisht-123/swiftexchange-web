import { ethers } from 'ethers';

import { ERC20_ABI } from '../../../abi/Erc20AbI';
import PancakeTokens from '../../../data/swap/PancakeList.json';
import UniswapTokens from '../../../data/swap/UniswapList.json';
import { CHAIN_REGISTRY, getChainById, normalizeTokenForDisplay } from '../utils/Chainregistry';
import { NATIVE_ADDRESS } from '../utils/assetmanagement/constants';

export interface TokenInfo {
  chainId: number | string;
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  logoURI?: string;
  balance?: string;
  isNative?: boolean;
  type?: string;
}

export interface ChainNativeConfig {
  symbol: string;
  name: string;
  decimals: number;
  logoURI: string;
}

function isNativeAddress(address: string): boolean {
  if (!address) return false;
  const lower = address.toLowerCase();
  return (
    lower === NATIVE_ADDRESS.toLowerCase() ||
    lower === '0x0000000000000000000000000000000000000000' ||
    lower === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' ||
    lower === 'native'
  );
}

export function getTokensForChain(chainId: number | string): TokenInfo[] {
  const chainConfig = getChainById(chainId);
  if (!chainConfig) return [];

  let rawTokens: any[] = [];
  const platform = chainConfig.coingeckoPlatform.toLowerCase();
  const slug = chainConfig.slug.toLowerCase();

  if (
    platform === 'binance-smart-chain' ||
    platform === 'bnb' ||
    slug === 'smartchain' ||
    slug === 'binance'
  ) {
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

  const mappedTokens: TokenInfo[] = Array.from(uniqueTokensMap.values()).map(t => {
    const isNative = isNativeAddress(t.address) || t.type === 'NATIVE';

    // Normalize: native-address tokens on ETH L2 chains must display as ETH
    // (token sources like 1inch/Uniswap may label them with the chain symbol)
    const normalized = normalizeTokenForDisplay(
      {
        symbol: t.symbol,
        name: t.name,
        logoURI: t.logoURI,
        address: t.address,
        isNative,
        type: t.type,
      },
      chainId
    );

    return {
      chainId: t.chainId || chainId,
      address: t.address,
      name: normalized.name,
      symbol: normalized.symbol,
      decimals: t.decimals,
      logoURI: normalized.logoURI || t.logoURI,
      balance: undefined,
      isNative: normalized.isNative,
      type: t.type,
    };
  });

  const hasNative = mappedTokens.some(t => t.isNative);

  if (!hasNative && chainConfig.nativeCurrency) {
    // nativeCurrency is already corrected to ETH for ARB/OPT/BASE chains
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
    mappedTokens.unshift(nativeAsset);
  }

  // Sort so native token is always at the top
  return mappedTokens.sort((a, b) => {
    if (a.isNative && !b.isNative) return -1;
    if (!a.isNative && b.isNative) return 1;
    return 0;
  });
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

export function getNativeTokenConfig(chainId: number | string): ChainNativeConfig | undefined {
  const chainConfig = getChainById(chainId);
  if (!chainConfig) return undefined;
  return {
    symbol: chainConfig.nativeCurrency.symbol,
    name: chainConfig.nativeCurrency.name,
    decimals: chainConfig.nativeCurrency.decimals,
    logoURI: chainConfig.nativeCurrency.logoURI,
  };
}

export function isChainSupported(chainId: number | string): boolean {
  const chain = getChainById(chainId);
  return !!chain && chain.available;
}

export function isSwapEnabled(chainId: number | string): boolean {
  const chain = getChainById(chainId);
  return !!chain && chain.available && chain.swapEnabled;
}

export function getSupportedChainIds(): (number | string)[] {
  return CHAIN_REGISTRY.filter(c => c.available).map(c => c.chainId);
}

export function getSwapEnabledChainIds(): (number | string)[] {
  return CHAIN_REGISTRY.filter(c => c.available && c.swapEnabled).map(c => c.chainId);
}
