export type NetworkKey = 'ethereum' | 'bsc' | 'polygon' | 'sepolia' | 'bscTestnet' | 'amoy';

export const SWAP_CONFIGS: Record<NetworkKey, { wNative: string; swapRouter: string }> = {
  ethereum: {
    wNative: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    swapRouter: '0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E', // Uniswap V3 SwapRouter02
  },
  bsc: {
    wNative: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
    swapRouter: '0x13f4EA83D0bd40E75C8222255bc855a974568Dd4', // PancakeSwap V3
  },
  polygon: {
    wNative: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
    swapRouter: '0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E', // Uniswap V3 SwapRouter02
  },
  sepolia: {
    wNative: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
    swapRouter: '0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E', // Uniswap V3 SwapRouter02 for Sepolia
  },
  bscTestnet: {
    wNative: '0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd',
    swapRouter: '0x9a489505a00cE272eAa5e07cDb1fA2596C12b89c', // PancakeSwap V3 Testnet
  },
  amoy: {
    wNative: '0x9c3C9283D3e44854697Cd22D3Faa240Cfb032889',
    swapRouter: '0x3fC91f5A0e0C4DDb6b5344B0B16b987A1eC1CefF', // Uniswap V3 or equivalent for Amoy
  },
};
