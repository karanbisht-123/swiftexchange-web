export interface TokenInfo {
  symbol: string;
  coingeckoId: string;
  decimals: number;
  isNative?: boolean;
}

export interface ChainTokens {
  chainId: number;
  nativeToken: TokenInfo;
  commonERC20?: TokenInfo[];
}

const BASE_TOKEN_MAP: Record<string, string> = {
  ETH: 'ethereum',
  MATIC: 'matic-network',
  BNB: 'binancecoin',
  AVAX: 'avalanche-2',
  XLM: 'stellar',
  USDT: 'tether',
  USDC: 'usd-coin',
  DAI: 'dai',
  WETH: 'weth',
  WBTC: 'wrapped-bitcoin',
  LINK: 'chainlink',
  UNI: 'uniswap',
  AAVE: 'aave',
  SHIB: 'shiba-inu',
  APE: 'apecoin',
};
export const ERC20_ADDRESSES: Record<number, Record<string, string>> = {
  1: {
    USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    DAI: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
    WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    WBTC: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
    LINK: '0x514910771AF9Ca656af840dff83E8264EcF986CA',
    UNI: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
    AAVE: '0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9',
    SHIB: '0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE',
  },
  137: {
    USDT: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
    USDC: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
    DAI: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063',
    WETH: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
    WBTC: '0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6',
    LINK: '0x53E0bca35eC356BD5ddDFebbD1Fc0fD03FaBad39',
    AAVE: '0xD6DF932A45C0f255f85145f286eA0b292B21C90B',
  },
  56: {
    USDT: '0x55d398326f99059fF775485246999027B3197955',
    USDC: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
    DAI: '0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3',
    WETH: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8',
    WBTC: '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c',
    LINK: '0xF8A0BF9cF54Bb92F17374d9e9A321E6a111a51bD',
    AAVE: '0xfb6115445Bff7b52FeB98650C87f44907E58f802',
  },
  43114: {
    USDT: '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7',
    USDC: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',
    DAI: '0xd586E7F844cEa2F87f50152665BCbc2C279D8d70',
    WETH: '0x49D5c2BdFfac6CE2BFdB6640F4F80f226bc10bAB',
    WBTC: '0x50b7545627a5162F82A992c33b87aDc75187B218',
    LINK: '0x5947BB275c521040051D82396192181b413227A3',
    AAVE: '0x63a72806098Bd3D9520cC43356dD78afe5D386D9',
  },
};

export const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function name() view returns (string)',
];

export const getCoinGeckoId = async (symbol: string): Promise<string | null> => {
  const upperSymbol = symbol.toUpperCase();
  if (BASE_TOKEN_MAP[upperSymbol]) {
    return BASE_TOKEN_MAP[upperSymbol];
  }
  try {
    const response = await fetch(`https://api.coingecko.com/api/v3/search?query=${symbol}`);
    if (!response.ok) return null;

    const data = await response.json();
    if (data.coins && data.coins.length > 0) {
      const exactMatch = data.coins.find(
        (coin: any) => coin.symbol.toLowerCase() === symbol.toLowerCase()
      );
      return exactMatch?.id || data.coins[0].id;
    }
  } catch (error) {
    console.warn(`Failed to fetch CoinGecko ID for ${symbol}:`, error);
  }

  return null;
};

export const buildTokenMapFromBalances = async (
  tokens: { symbol: string }[]
): Promise<Record<string, string>> => {
  const tokenMap: Record<string, string> = {};
  const batchSize = 5;
  for (let i = 0; i < tokens.length; i += batchSize) {
    const batch = tokens.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(async token => {
        const id = await getCoinGeckoId(token.symbol);
        return { symbol: token.symbol, id };
      })
    );

    results.forEach(({ symbol, id }) => {
      if (id) {
        tokenMap[symbol] = id;
      }
    });
    if (i + batchSize < tokens.length) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  return tokenMap;
};

export const getTokenAddressesForChain = (chainId: number): Record<string, string> => {
  return ERC20_ADDRESSES[chainId] || {};
};
export const getSupportedTokens = (chainId: number): TokenInfo[] => {
  const addresses = getTokenAddressesForChain(chainId);
  return Object.entries(addresses).map(([symbol, address]) => ({
    symbol,
    coingeckoId: BASE_TOKEN_MAP[symbol] || symbol.toLowerCase(),
    decimals: 18,
    address,
  }));
};

export const getAllPossibleCoinGeckoIds = (): string[] => {
  return [...new Set(Object.values(BASE_TOKEN_MAP))];
};
