import { ethers } from 'ethers';

import { ERC20_ABI } from '../../../config/tokenConfig';
import PancakeTokens from '../../../data/swap/PancakeList.json';
import UniswapTokens from '../../../data/swap/UniswapList.json';

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
  logoURI: string;
}

const NATIVE_TOKEN_CONFIG: Record<number, ChainNativeConfig> = {
  1: {
    symbol: 'ETH',
    name: 'Ethereum',
    decimals: 18,
    logoURI:
      'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png',
  },
  56: {
    symbol: 'BNB',
    name: 'BNB',
    decimals: 18,
    logoURI:
      'https://tokens.pancakeswap.finance/images/0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c.png',
  },
  11155111: {
    symbol: 'ETH',
    name: 'Sepolia ETH',
    decimals: 18,
    logoURI: 'https://assets.coingecko.com/coins/images/279/small/ethereum.png',
  },
  97: {
    symbol: 'BNB',
    name: 'Test BNB',
    decimals: 18,
    logoURI: 'https://assets.coingecko.com/coins/images/825/small/bnb-icon2_2x.png',
  },
};

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const ZERO_ADDRESS_UPPER = '0X0000000000000000000000000000000000000000';

function isNativeAddress(address: string): boolean {
  const addr = address.toLowerCase();
  return addr === ZERO_ADDRESS || addr === ZERO_ADDRESS_UPPER.toLowerCase();
}

export function getTokensForChain(chainId: number): TokenInfo[] {

  console.log('getTokensForChain', chainId);
  let rawTokens: any[] = [];
  if (chainId === 1 || chainId === 11155111) {
    rawTokens = UniswapTokens;
  } else if (chainId === 56 || chainId === 97) {
    rawTokens = PancakeTokens;
  }

  const mappedTokens = rawTokens
    .filter(t => !isNativeAddress(t.address))
    .map(t => ({
      chainId: t.chainId || chainId,
      address: t.address,
      name: t.name,
      symbol: t.symbol,
      decimals: t.decimals,
      logoURI: t.logoURI,
      balance: undefined,
      isNative: false,
    }));

  const nativeConfig = NATIVE_TOKEN_CONFIG[chainId];
  if (nativeConfig) {
    const nativeAsset: TokenInfo = {
      chainId,
      address: ethers.ZeroAddress,
      name: nativeConfig.name,
      symbol: nativeConfig.symbol,
      decimals: nativeConfig.decimals,
      logoURI: nativeConfig.logoURI,
      balance: undefined,
      isNative: true,
    };
    return [nativeAsset, ...mappedTokens];
  }

  return mappedTokens;
}

export async function fetchSingleTokenBalance(
  walletAddress: string,
  provider: ethers.BrowserProvider | ethers.JsonRpcProvider,
  tokenAddress: string,
  isNative: boolean,
  decimals = 18
): Promise<string> {
  try {
    if (isNative) {

      console.log('fetchSingleTokenBalance', walletAddress, provider, tokenAddress, isNative, decimals);
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
  return NATIVE_TOKEN_CONFIG[chainId];
}

export function isChainSupported(chainId: number): boolean {
  return chainId in NATIVE_TOKEN_CONFIG;
}

export function getSupportedChainIds(): number[] {
  return Object.keys(NATIVE_TOKEN_CONFIG).map(Number);
}

// export function clearTokenListCache(): void {

// }
