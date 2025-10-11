import { type NetworkKey } from './swapConfigs';

export const TOKEN_CONFIGS: Record<
  NetworkKey,
  Record<string, { address: string; decimals: number; name: string; logoUri: string | null }>
> = {
  ethereum: {
    WETH: {
      address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      decimals: 18,
      name: 'Wrapped Ethereum',
      logoUri:
        'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png',
    },
    USDC: {
      address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      decimals: 6,
      name: 'USD Coin',
      logoUri:
        'https://tokens.pancakeswap.finance/images/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48.png',
    },
  },
  bsc: {
    WBNB: {
      address: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
      decimals: 18,
      name: 'Wrapped BNB',
      logoUri:
        'https://tokens.pancakeswap.finance/images/0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c.png',
    },
    USDC: {
      address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
      decimals: 18,
      name: 'USD Coin',
      logoUri:
        'https://tokens.pancakeswap.finance/images/0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d.png',
    },
  },
  polygon: {
    WMATIC: {
      address: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
      decimals: 18,
      name: 'Wrapped MATIC',
      logoUri:
        'https://tokens.pancakeswap.finance/images/0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270.png',
    },
    USDC: {
      address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
      decimals: 6,
      name: 'USD Coin',
      logoUri:
        'https://tokens.pancakeswap.finance/images/0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174.png',
    },
  },
  sepolia: {
    WETH: {
      address: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
      decimals: 18,
      name: 'Wrapped Ethereum',
      logoUri:
        'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png',
    },
    USDC: {
      address: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
      decimals: 6,
      name: 'USD Coin (Sepolia)',
      logoUri:
        'https://tokens.pancakeswap.finance/images/0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d.png',
    },
  },
  bscTestnet: {
    WBNB: {
      address: '0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd',
      decimals: 18,
      name: 'Wrapped BNB',
      logoUri:
        'https://tokens.pancakeswap.finance/images/0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd.png',
    },
    USDC: {
      address: '0x64544969ed7EBf5f083679233325356Ebe738930',
      decimals: 18,
      name: 'USD Coin (Testnet)',
      logoUri:
        'https://tokens.pancakeswap.finance/images/0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d.png',
    },
  },
  amoy: {
    WMATIC: {
      address: '0x9c3C9283D3e44854697Cd22D3Faa240Cfb032889',
      decimals: 18,
      name: 'Wrapped MATIC',
      logoUri:
        'https://tokens.pancakeswap.finance/images/0x9c3C9283D3e44854697Cd22D3Faa240Cfb032889.png',
    },
    USDC: {
      address: '0x41E94Eb019C0762f9Bfcf9Fb1E58725Bf9483C08',
      decimals: 6,
      name: 'USD Coin (Amoy)',
      logoUri:
        'https://tokens.pancakeswap.finance/images/0x41E94Eb019C0762f9Bfcf9Fb1E58725Bf9483C08.png',
    },
  },
};
