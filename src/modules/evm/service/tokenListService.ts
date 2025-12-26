interface TokenInfo {
  chainId: number;
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  logoURI?: string;
}

interface CachedTokenList {
  tokens: TokenInfo[];
  timestamp: number;
}

interface ChainConfig {
  name: string;
  wrappedNative: {
    address: string;
    symbol: string;
    name: string;
    decimals: number;
  };
  tokenListProvider: 'uniswap' | 'pancakeswap';
}

const CHAIN_CONFIGS: Record<number, ChainConfig> = {
  1: {
    name: 'Ethereum',
    wrappedNative: {
      address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      symbol: 'WETH',
      name: 'Wrapped Ether',
      decimals: 18,
    },
    tokenListProvider: 'uniswap',
  },
  56: {
    name: 'BSC',
    wrappedNative: {
      address: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
      symbol: 'WBNB',
      name: 'Wrapped BNB',
      decimals: 18,
    },
    tokenListProvider: 'pancakeswap',
  },
  137: {
    name: 'Polygon',
    wrappedNative: {
      address: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
      symbol: 'WMATIC',
      name: 'Wrapped Matic',
      decimals: 18,
    },
    tokenListProvider: 'uniswap',
  },
  42161: {
    name: 'Arbitrum',
    wrappedNative: {
      address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
      symbol: 'WETH',
      name: 'Wrapped Ether',
      decimals: 18,
    },
    tokenListProvider: 'uniswap',
  },
  10: {
    name: 'Optimism',
    wrappedNative: {
      address: '0x4200000000000000000000000000000000000006',
      symbol: 'WETH',
      name: 'Wrapped Ether',
      decimals: 18,
    },
    tokenListProvider: 'uniswap',
  },
  43114: {
    name: 'Avalanche',
    wrappedNative: {
      address: '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7',
      symbol: 'WAVAX',
      name: 'Wrapped AVAX',
      decimals: 18,
    },
    tokenListProvider: 'uniswap',
  },

  11155111: {
    name: 'Sepolia',
    wrappedNative: {
      address: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
      symbol: 'WETH',
      name: 'Wrapped Ether',
      decimals: 18,
    },
    tokenListProvider: 'uniswap',
  },
  80002: {
    name: 'Polygon Amoy',
    wrappedNative: {
      address: '0x9c3C9283D3e44854697Cd22D3Faa240Cfb032889',
      symbol: 'WMATIC',
      name: 'Wrapped Matic',
      decimals: 18,
    },
    tokenListProvider: 'uniswap',
  },
  97: {
    name: 'BSC Testnet',
    wrappedNative: {
      address: '0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd',
      symbol: 'WBNB',
      name: 'Wrapped BNB',
      decimals: 18,
    },
    tokenListProvider: 'pancakeswap',
  },
  421614: {
    name: 'Arbitrum Sepolia',
    wrappedNative: {
      address: '0xE591bf0A0CF924A0674d7792db046B23CEbF5f34',
      symbol: 'WETH',
      name: 'Wrapped Ether',
      decimals: 18,
    },
    tokenListProvider: 'uniswap',
  },
  11155420: {
    name: 'Optimism Sepolia',
    wrappedNative: {
      address: '0x4200000000000000000000000000000000000006',
      symbol: 'WETH',
      name: 'Wrapped Ether',
      decimals: 18,
    },
    tokenListProvider: 'uniswap',
  },
  43113: {
    name: 'Avalanche Fuji',
    wrappedNative: {
      address: '0xd00ae08403B9bbb9124bB305C09058E32C39A48c',
      symbol: 'WAVAX',
      name: 'Wrapped AVAX',
      decimals: 18,
    },
    tokenListProvider: 'uniswap',
  },
};

const TOKEN_LIST_URLS: Record<string, string> = {
  uniswap: 'https://tokens.uniswap.org',
  pancakeswap: 'https://tokens.pancakeswap.finance/pancakeswap-extended.json',
};

const CACHE_DURATION = 1000 * 60 * 60; // 1 hour
const tokenListCache = new Map<string, CachedTokenList>();

async function fetchTokenList(url: string): Promise<any> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch token list: ${response.statusText}`);
  }
  return response.json();
}

export async function getTokensForChain(chainId: number): Promise<TokenInfo[]> {
  const config = CHAIN_CONFIGS[chainId];

  if (!config) {
    console.warn(`No configuration found for chain ${chainId}`);
    return [];
  }

  const cacheKey = `${config.tokenListProvider}-${chainId}`;
  const cached = tokenListCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.tokens;
  }

  try {
    const url = TOKEN_LIST_URLS[config.tokenListProvider];
    const tokenList = await fetchTokenList(url);

    const tokens = tokenList.tokens
      .filter((token: any) => token.chainId === chainId)
      .map((token: any) => ({
        chainId: token.chainId,
        address: token.address,
        name: token.name,
        symbol: token.symbol,
        decimals: token.decimals,
        logoURI: token.logoURI,
      }));
    const wrappedNativeExists = tokens.some(
      (token: TokenInfo) =>
        token.address.toLowerCase() === config.wrappedNative.address.toLowerCase()
    );

    if (!wrappedNativeExists) {
      tokens.unshift({
        chainId,
        address: config.wrappedNative.address,
        name: config.wrappedNative.name,
        symbol: config.wrappedNative.symbol,
        decimals: config.wrappedNative.decimals,
      });
    }
    tokenListCache.set(cacheKey, {
      tokens,
      timestamp: Date.now(),
    });

    return tokens;
  } catch (error) {
    console.error(`Failed to fetch token list for chain ${chainId}:`, error);
    if (cached) {
      console.warn(`Using stale cache for chain ${chainId}`);
      return cached.tokens;
    }

    return [
      {
        chainId,
        address: config.wrappedNative.address,
        name: config.wrappedNative.name,
        symbol: config.wrappedNative.symbol,
        decimals: config.wrappedNative.decimals,
      },
    ];
  }
}

export function getWrappedNativeToken(chainId: number): TokenInfo | null {
  const config = CHAIN_CONFIGS[chainId];

  if (!config) {
    console.warn(`No configuration found for chain ${chainId}`);
    return null;
  }

  return {
    chainId,
    address: config.wrappedNative.address,
    name: config.wrappedNative.name,
    symbol: config.wrappedNative.symbol,
    decimals: config.wrappedNative.decimals,
  };
}

export function getWrappedNativeAddress(chainId: number): string {
  return CHAIN_CONFIGS[chainId]?.wrappedNative.address || '';
}

export function getProviderForChain(chainId: number): 'uniswap' | 'pancakeswap' {
  return CHAIN_CONFIGS[chainId]?.tokenListProvider || 'uniswap';
}

export function getChainConfig(chainId: number): ChainConfig | undefined {
  return CHAIN_CONFIGS[chainId];
}

export function getSupportedChainIds(): number[] {
  return Object.keys(CHAIN_CONFIGS).map(Number);
}

export function isChainSupported(chainId: number): boolean {
  return chainId in CHAIN_CONFIGS;
}

export function clearTokenListCache(): void {
  tokenListCache.clear();
}

export async function preloadTokenLists(chainIds: number[]): Promise<void> {
  const promises = chainIds.map(async chainId => {
    try {
      await getTokensForChain(chainId);
    } catch (error) {
      console.error(`Failed to preload tokens for chain ${chainId}:`, error);
    }
  });

  await Promise.allSettled(promises);
}

export function addChainConfig(chainId: number, config: ChainConfig): void {
  CHAIN_CONFIGS[chainId] = config;
}
