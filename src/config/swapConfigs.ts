export type NetworkKey = 'ethereum' | 'bsc' | 'polygon' | 'sepolia' | 'bscTestnet' | 'amoy';

export interface SwapConfig {
  wNative: string;
  swapRouter: string;
  usdt: string;
  usdc: string;
  chainId: number;
  isTestnet: boolean;
  nativeSymbol: string;
  rpcUrl: string;
}

export const SWAP_CONFIGS: Record<any, SwapConfig> = {
  ethereum: {
    wNative: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
    swapRouter: '0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E', // Uniswap V3 SwapRouter02
    usdt: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    usdc: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    chainId: 1,
    isTestnet: false,
    nativeSymbol: 'ETH',
    rpcUrl: 'https://eth.llamarpc.com',
  },
  bsc: {
    wNative: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', // WBNB
    swapRouter: '0x13f4EA83D0bd40E75C8222255bc855a974568Dd4', // PancakeSwap V3
    usdt: '0x55d398326f99059fF775485246999027B3197955',
    usdc: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
    chainId: 56,
    isTestnet: false,
    nativeSymbol: 'BNB',
    rpcUrl: 'https://bsc-dataseed.binance.org',
  },
  polygon: {
    wNative: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', // WMATIC
    swapRouter: '0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E', // Uniswap V3 SwapRouter02
    usdt: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
    usdc: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
    chainId: 137,
    isTestnet: false,
    nativeSymbol: 'MATIC',
    rpcUrl: 'https://polygon-rpc.com',
  },

  // Testnet Configurations
  sepolia: {
    wNative: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14', // WETH
    swapRouter: '0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E', // Uniswap V3 SwapRouter02
    usdt: '0x7169D38820dfd117C3FA1f22a697dBA58d90BA06', // Mock USDT for testnet
    usdc: '0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8', // Mock USDC for testnet
    chainId: 11155111,
    isTestnet: true,
    nativeSymbol: 'ETH',
    rpcUrl: 'https://rpc.sepolia.org',
  },
  bscTestnet: {
    wNative: '0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd', // WBNB
    swapRouter: '0x9a489505a00cE272eAa5e07cDb1fA2596C12b89c', // PancakeSwap V3 Testnet
    usdt: '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd', // Mock USDT for testnet
    usdc: '0x64544969ed7EBf5f083679233325356EbE738930', // Mock USDC for testnet
    chainId: 97,
    isTestnet: true,
    nativeSymbol: 'BNB',
    rpcUrl: 'https://data-seed-prebsc-1-s1.binance.org:8545',
  },
  amoy: {
    wNative: '0x9c3C9283D3e44854697Cd22D3Faa240Cfb032889', // WMATIC
    swapRouter: '0x3fC91f5A0e0C4DDb6b5344B0B16b987A1eC1CefF', // Uniswap V3 compatible
    usdt: '0x1fdE0eCc619726f4cD597887C9F3b4c8740e19e2', // Mock USDT for testnet
    usdc: '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582', // Mock USDC for testnet
    chainId: 80002,
    isTestnet: true,
    nativeSymbol: 'MATIC',
    rpcUrl: 'https://rpc-amoy.polygon.technology',
  },
};

// Helper function to get config by chainId
export const getConfigByChainId = (chainId: number): SwapConfig | null => {
  return Object.values(SWAP_CONFIGS).find(config => config.chainId === chainId) || null;
};

// Helper function to determine if chain is testnet
export const isTestnetChain = (chainId: number): boolean => {
  const config = getConfigByChainId(chainId);
  return config?.isTestnet || false;
};

// Helper function to get network key from chainId
export const getNetworkKeyFromChainId = (chainId: number): NetworkKey | null => {
  const entry = Object.entries(SWAP_CONFIGS).find(([_, config]) => config.chainId === chainId);
  return entry ? (entry[0] as NetworkKey) : null;
};
