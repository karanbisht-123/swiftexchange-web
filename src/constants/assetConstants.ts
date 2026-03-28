import { type NetworkKey } from '../modules/evm/utils/Chainregistry';
import type { TokenMetadata } from '../types/evm/swap.types';

export const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';
export const CACHE_TTL = 24 * 60 * 60 * 1000;

export const PLATFORM_MAP: Record<NetworkKey, string> = {
  ethereum: 'ethereum',
  bsc: 'bnb',
  polygon: 'polygon-pos',
  sepolia: 'ethereum',
  bscTestnet: 'bnb',
  amoy: 'polygon-pos',
};

export const COMMON_TOKENS: Record<NetworkKey, { address: string; expectedSymbol?: string }[]> = {
  ethereum: [
    {
      address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      expectedSymbol: 'WETH',
    },
    {
      address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      expectedSymbol: 'USDC',
    },
    {
      address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      expectedSymbol: 'USDT',
    },
  ],
  bsc: [
    {
      address: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
      expectedSymbol: 'WBNB',
    },
    {
      address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
      expectedSymbol: 'USDC',
    },
  ],
  polygon: [
    {
      address: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
      expectedSymbol: 'WMATIC',
    },
    {
      address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
      expectedSymbol: 'USDC',
    },
  ],
  sepolia: [
    {
      address: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
      expectedSymbol: 'WETH',
    },
    {
      address: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
      expectedSymbol: 'USDC',
    },
  ],
  bscTestnet: [
    {
      address: '0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd',
      expectedSymbol: 'WBNB',
    },
    {
      address: '0x64544969ed7EBf5f083679233325356EbE738930',
      expectedSymbol: 'USDC',
    },
  ],
  amoy: [
    {
      address: '0x9c3C9283D3e44854697Cd22D3Faa240Cfb032889',
      expectedSymbol: 'WMATIC',
    },
    {
      address: '0x41E94Eb019C0762f9Bfcf9Fb1C3F3ffc1991a9E9',
      expectedSymbol: 'USDC',
    },
  ],
};

export const TESTNET_METADATA: Record<NetworkKey, Record<string, TokenMetadata>> = {
  sepolia: {
    '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14': {
      name: 'Wrapped Ether',
      code: 'WETH',
      decimals: 18,
      logoUri: 'https://coin-images.coingecko.com/coins/images/2518/large/weth.png?1696503332',
    },
    '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238': {
      name: 'USD Coin',
      code: 'USDC',
      decimals: 6,
      logoUri:
        'https://coin-images.coingecko.com/coins/images/6319/large/USD_Coin_icon.png?1696506694',
    },
  },
  bscTestnet: {
    '0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd': {
      name: 'Wrapped BNB',
      code: 'WBNB',
      decimals: 18,
      logoUri:
        'https://coin-images.coingecko.com/coins/images/825/large/bnb-icon2_2x.png?1696501970',
    },
    '0x64544969ed7EBf5f083679233325356EbE738930': {
      name: 'USD Coin',
      code: 'USDC',
      decimals: 18,
      logoUri:
        'https://coin-images.coingecko.com/coins/images/6319/large/USD_Coin_icon.png?1696506694',
    },
  },
  amoy: {
    '0x9c3C9283D3e44854697Cd22D3Faa240Cfb032889': {
      name: 'Wrapped Matic',
      code: 'WMATIC',
      decimals: 18,
      logoUri:
        'https://coin-images.coingecko.com/coins/images/4713/large/matic-token-icon.png?1696505277',
    },
    '0x41E94Eb019C0762f9Bfcf9Fb1C3F3ffc1991a9E9': {
      name: 'USD Coin',
      code: 'USDC',
      decimals: 6,
      logoUri:
        'https://coin-images.coingecko.com/coins/images/6319/large/USD_Coin_icon.png?1696506694',
    },
  },
  ethereum: {},
  bsc: {},
  polygon: {},
};

export const NETWORK_LOGOS: Record<NetworkKey, string> = {
  ethereum: 'https://coin-images.coingecko.com/coins/images/279/large/ethereum.png?1696501628',
  bsc: 'https://coin-images.coingecko.com/coins/images/825/large/bnb-icon2_2x.png?1696501970',
  polygon:
    'https://coin-images.coingecko.com/coins/images/4713/large/matic-token-icon.png?1696505277',
  sepolia: 'https://coin-images.coingecko.com/coins/images/279/large/ethereum.png?1696501628',
  bscTestnet:
    'https://coin-images.coingecko.com/coins/images/825/large/bnb-icon2_2x.png?1696501970',
  amoy: 'https://coin-images.coingecko.com/coins/images/4713/large/matic-token-icon.png?1696505277',
};

export const isTestnetNetwork = (networkKey: NetworkKey): boolean => {
  return ['sepolia', 'bscTestnet', 'amoy'].includes(networkKey);
};
