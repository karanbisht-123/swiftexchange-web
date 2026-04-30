import { RPC_URLS, EXPLORER_URLS, GET_LOGO_URL, GET_RESOURCES_LIST_URL, RPC, NATIVE_ADDRESS } from './constants';
import { type IChain } from './types';

export const ETH = {
  RPC: RPC.ETHRPC,
  chainId: 1,
  nativeChainKey: "ethereum",
  minGasGwei: 10,
  imageUrl: GET_LOGO_URL('eth'),
  name: "Ethereum",
  symbol: "ETH",
  rangoSymbol: "ETH",
  chainName: "Ethereum",
  subName: "Mainnet",
  gasLimit: 65000,
  bridgeSupportTokens: [
    {
      "name": "Tether USD",
      "symbol": "USDT",
      "address": "0xdAC17F958D2ee523a2206206994597C13D831ec7",
      "chainId": 1,
      "decimals": 6,
      "logoURI": "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xdAC17F958D2ee523a2206206994597C13D831ec7/logo.png"
    },
    {
      "name": "USD Coin",
      "symbol": "USDC",
      "address": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      "chainId": 1,
      "decimals": 6,
      "logoURI": "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png"
    }
  ]
};

export const ARB = {
  RPC: RPC.ARBRPC,
  chainId: 42161,
  nativeChainKey: "arbitrum-one",
  minGasGwei: 0.1,
  imageUrl: GET_LOGO_URL('arb'),
  name: "Arbitrum One",
  symbol: "ARB",
  rangoSymbol: "ARBITRUM",
  chainName: "Arbitrum",
  subName: "L2",
  gasLimit: 65000,
  bridgeSupportTokens: [
    {
      "name": "Tether USD",
      "symbol": "USDT",
      "address": "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
      "chainId": 42161,
      "decimals": 6,
      "logoURI": "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xdAC17F958D2ee523a2206206994597C13D831ec7/logo.png"
    },
    {
      "name": "USD Coin",
      "symbol": "USDC",
      "address": "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
      "chainId": 42161,
      "decimals": 6,
      "logoURI": "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png"
    }
  ]
};

export const POL = {
  RPC: RPC.POLRPC,
  chainId: 137,
  nativeChainKey: "polygon-pos",
  minGasGwei: 30,
  imageUrl: GET_LOGO_URL('poly'),
  name: "Polygon",
  symbol: "POL",
  rangoSymbol: "POLYGON",
  chainName: "Polygon",
  subName: "POS",
  gasLimit: 65000,
  bridgeSupportTokens: [
    {
      "name": "Tether USD",
      "symbol": "USDT",
      "address": "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
      "chainId": 137,
      "decimals": 6,
      "logoURI": "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xdAC17F958D2ee523a2206206994597C13D831ec7/logo.png"
    },
    {
      "name": "USD Coin",
      "symbol": "USDC",
      "address": "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
      "chainId": 137,
      "decimals": 6,
      "logoURI": "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png"
    }
  ]
};

export const OPT = {
  RPC: RPC.OPRPC,
  chainId: 10,
  nativeChainKey: "optimistic-ethereum",
  minGasGwei: 0.001,
  imageUrl: GET_LOGO_URL('op'),
  name: "Optimism",
  symbol: "OPT",
  rangoSymbol: "OPTIMISM",
  chainName: "Optimism",
  subName: "L2",
  gasLimit: 65000,
  bridgeSupportTokens: [
    {
      "name": "Tether USD",
      "symbol": "USDT",
      "address": "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58",
      "chainId": 10,
      "decimals": 6,
      "logoURI": "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xdAC17F958D2ee523a2206206994597C13D831ec7/logo.png"
    },
    {
      "name": "USD Coin",
      "symbol": "USDC",
      "address": "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
      "chainId": 10,
      "decimals": 6,
      "logoURI": "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png"
    }
  ]
};

export const AVAX = {
  RPC: RPC.AVAXRPC,
  chainId: 43114,
  nativeChainKey: "avalanche",
  minGasGwei: 25,
  imageUrl: GET_LOGO_URL('avax'),
  name: "Avalanche",
  symbol: "AVAX",
  rangoSymbol: "AVAX_CCHAIN",
  chainName: "Avalanche",
  subName: "C-Chain",
  gasLimit: 65000,
  bridgeSupportTokens: [
    {
      "name": "Tether USD",
      "symbol": "USDT",
      "address": "0x9702230A8Ea53601f5cD2dc00fDBc13d4df4A8c7",
      "chainId": 43114,
      "decimals": 6,
      "logoURI": "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xdAC17F958D2ee523a2206206994597C13D831ec7/logo.png"
    },
    {
      "name": "USD Coin",
      "symbol": "USDC",
      "address": "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
      "chainId": 43114,
      "decimals": 6,
      "logoURI": "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png"
    }
  ]
};

export const BASE = {
  RPC: RPC.BASERPC,
  chainId: 8453,
  nativeChainKey: "base",
  minGasGwei: 0.001,
  imageUrl: GET_LOGO_URL('base'),
  name: "Base",
  symbol: "BASE",
  rangoSymbol: "BASE",
  chainName: "Base",
  subName: "L2",
  gasLimit: 65000,
  bridgeSupportTokens: [
    {
      "name": "Tether USD",
      "symbol": "USDT",
      "address": "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2",
      "chainId": 8453,
      "decimals": 6,
      "logoURI": "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xdAC17F958D2ee523a2206206994597C13D831ec7/logo.png"
    },
    {
      "name": "USD Coin",
      "symbol": "USDC",
      "address": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      "chainId": 8453,
      "decimals": 6,
      "logoURI": "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png"
    }
  ]
};

export const BSC = {
  RPC: RPC.BSCRPC,
  chainId: 56,
  nativeChainKey: "bnbMainnet",
  minGasGwei: 1,
  imageUrl: "https://coin-images.coingecko.com/coins/images/825/large/bnb-icon2_2x.png?1696501970",
  name: "Binance",
  symbol: "BNB",
  rangoSymbol: "BSC",
  chainName: "BSC",
  subName: "BNB",
  gasLimit: 65000,
  bridgeSupportTokens: [
    {
      "name": "Binance USDT",
      "symbol": "USDT",
      "address": "0x55d398326f99059fF775485246999027B3197955",
      "chainId": 56,
      "decimals": 18,
      "logoURI": "https://tokens.pancakeswap.finance/images/0x55d398326f99059fF775485246999027B3197955.png"
    },
    {
      "name": "Binance USDC",
      "symbol": "USDC",
      "address": "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
      "chainId": 56,
      "decimals": 18,
      "logoURI": "https://tokens.pancakeswap.finance/images/0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d.png"
    }
  ]
};

export const STR = {
  RPC: RPC.STRRPC,
  chainId: 'pubnet',
  nativeChainKey: "stellar",
  minGasGwei: 100,
  imageUrl: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/stellar/info/logo.png',
  name: "Stellar",
  symbol: "XLM",
  chainName: "Stellar",
  subName: "Network",
  bridgeSupportTokens: [
    {
      "name": "USD Coin",
      "symbol": "USDC",
      "address": "USDC",
      "chainId": 'pubnet',
      "decimals": 7,
      "logoURI": "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png"
    }
  ]
};

export const DYDX = {
  RPC: RPC.DYDXRPC,
  chainId: 'dydx-mainnet-1',
  nativeChainKey: "dydx",
  minGasGwei: 0,
  imageUrl: 'https://raw.githubusercontent.com/cosmos/chain-registry/master/dydx/images/dydx.png',
  name: "dYdX",
  symbol: "DYDX",
  chainName: "dYdX",
  subName: "Chain",
  bridgeSupportTokens: []
};

export const CHAINS: Record<string, IChain> = {
  ETH: {
    rpcUrl: ETH.RPC,
    rpcUrls: RPC_URLS.ETH,
    chainId: ETH.chainId,
    nativeChainKey: ETH.nativeChainKey,
    minGasGwei: ETH.minGasGwei,
    imageUrl: ETH.imageUrl,
    name: ETH.name,
    symbol: ETH.symbol,
    rangoSymbol: ETH.rangoSymbol,
    chainName: ETH.chainName,
    subName: ETH.subName,
    slug: 'eth',
    networkType: 'mainnet',
    blockExplorerUrl: EXPLORER_URLS.ETH,
    supportedTokenList: GET_RESOURCES_LIST_URL('eth_tokens.json'),
    nativeToken: {
      "name": ETH.name,
      "address": NATIVE_ADDRESS,
      "symbol": ETH.symbol,
      "decimals": 18,
      "type": ETH.name?.toUpperCase(),
      "logoURI": ETH.imageUrl
    },
    wrappedAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    bridgeSupportTokens: ETH.bridgeSupportTokens,
    sendEnable: true,
    receiveEnable: true,
    bridgeEnable: true,
    swapEnable: true,
    importForSetupApp: true,
    importForSetupedApp: true
  },
  ARB: {
    rpcUrl: ARB.RPC,
    rpcUrls: RPC_URLS.ARB,
    chainId: ARB.chainId,
    nativeChainKey: ARB.nativeChainKey,
    minGasGwei: ARB.minGasGwei,
    imageUrl: ARB.imageUrl,
    name: ARB.name,
    symbol: ARB.symbol,
    rangoSymbol: ARB.rangoSymbol,
    chainName: ARB.chainName,
    subName: ARB.subName,
    slug: 'arb',
    networkType: 'mainnet',
    blockExplorerUrl: EXPLORER_URLS.ARB,
    supportedTokenList: GET_RESOURCES_LIST_URL('arb_tokens.json'),
    nativeToken: {
      "name": ARB.name,
      "symbol": ARB.symbol,
      "address": NATIVE_ADDRESS,
      "type": ARB.name?.toUpperCase(),
      "decimals": 18,
      "logoURI": ARB.imageUrl
    },
    wrappedAddress: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    bridgeSupportTokens: ARB.bridgeSupportTokens,
    sendEnable: true,
    receiveEnable: true,
    bridgeEnable: true,
    swapEnable: true,
    importForSetupApp: true,
    importForSetupedApp: true
  },
  POL: {
    rpcUrl: POL.RPC,
    rpcUrls: RPC_URLS.POL,
    chainId: POL.chainId,
    nativeChainKey: POL.nativeChainKey,
    minGasGwei: POL.minGasGwei,
    imageUrl: POL.imageUrl,
    name: POL.name,
    symbol: POL.symbol,
    rangoSymbol: POL.rangoSymbol,
    chainName: POL.chainName,
    subName: POL.subName,
    slug: 'poly',
    networkType: 'mainnet',
    blockExplorerUrl: EXPLORER_URLS.POL,
    supportedTokenList: GET_RESOURCES_LIST_URL('poly_tokens.json'),
    nativeToken: {
      "name": POL.name,
      "symbol": POL.symbol,
      "address": NATIVE_ADDRESS,
      "type": POL.name?.toUpperCase(),
      "decimals": 18,
      "logoURI": POL.imageUrl
    },
    wrappedAddress: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
    bridgeSupportTokens: POL.bridgeSupportTokens,
    sendEnable: true,
    receiveEnable: true,
    bridgeEnable: true,
    swapEnable: true,
    importForSetupApp: true,
    importForSetupedApp: true
  },
  OPT: {
    rpcUrl: OPT.RPC,
    rpcUrls: RPC_URLS.OPT,
    chainId: OPT.chainId,
    nativeChainKey: OPT.nativeChainKey,
    minGasGwei: OPT.minGasGwei,
    imageUrl: OPT.imageUrl,
    name: OPT.name,
    symbol: OPT.symbol,
    rangoSymbol: OPT.rangoSymbol,
    chainName: OPT.chainName,
    subName: OPT.subName,
    slug: 'op',
    networkType: 'mainnet',
    blockExplorerUrl: EXPLORER_URLS.OPT,
    supportedTokenList: GET_RESOURCES_LIST_URL('op_tokens.json'),
    nativeToken: {
      "name": OPT.name,
      "symbol": OPT.symbol,
      "address": NATIVE_ADDRESS,
      "type": OPT.name?.toUpperCase(),
      "decimals": 18,
      "logoURI": OPT.imageUrl
    },
    wrappedAddress: '0x4200000000000000000000000000000000000006',
    bridgeSupportTokens: OPT.bridgeSupportTokens,
    sendEnable: true,
    receiveEnable: true,
    bridgeEnable: true,
    swapEnable: true,
    importForSetupApp: true,
    importForSetupedApp: true
  },
  AVAX: {
    rpcUrl: AVAX.RPC,
    rpcUrls: RPC_URLS.AVAX,
    chainId: AVAX.chainId,
    nativeChainKey: AVAX.nativeChainKey,
    minGasGwei: AVAX.minGasGwei,
    imageUrl: AVAX.imageUrl,
    name: AVAX.name,
    symbol: AVAX.symbol,
    rangoSymbol: AVAX.rangoSymbol,
    chainName: AVAX.chainName,
    subName: AVAX.subName,
    slug: 'avax',
    networkType: 'mainnet',
    blockExplorerUrl: EXPLORER_URLS.AVAX,
    supportedTokenList: GET_RESOURCES_LIST_URL('avax_tokens.json'),
    nativeToken: {
      "name": AVAX.name,
      "symbol": AVAX.symbol,
      "address": NATIVE_ADDRESS,
      "type": AVAX.name?.toUpperCase(),
      "decimals": 18,
      "logoURI": AVAX.imageUrl
    },
    wrappedAddress: '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7',
    bridgeSupportTokens: AVAX.bridgeSupportTokens,
    sendEnable: true,
    receiveEnable: true,
    bridgeEnable: true,
    swapEnable: true,
    importForSetupApp: true,
    importForSetupedApp: true
  },
  BASE: {
    rpcUrl: BASE.RPC,
    rpcUrls: RPC_URLS.BASE,
    chainId: BASE.chainId,
    nativeChainKey: BASE.nativeChainKey,
    minGasGwei: BASE.minGasGwei,
    imageUrl: BASE.imageUrl,
    name: BASE.name,
    symbol: BASE.symbol,
    rangoSymbol: BASE.rangoSymbol,
    chainName: BASE.chainName,
    subName: BASE.subName,
    slug: 'base',
    networkType: 'mainnet',
    blockExplorerUrl: EXPLORER_URLS.BASE,
    supportedTokenList: GET_RESOURCES_LIST_URL('base_tokens.json'),
    nativeToken: {
      "name": BASE.name,
      "symbol": BASE.symbol,
      "address": NATIVE_ADDRESS,
      "type": BASE.name?.toUpperCase(),
      "decimals": 18,
      "logoURI": BASE.imageUrl
    },
    wrappedAddress: '0x4200000000000000000000000000000000000006',
    bridgeSupportTokens: BASE.bridgeSupportTokens,
    sendEnable: true,
    receiveEnable: true,
    bridgeEnable: true,
    swapEnable: true,
    importForSetupApp: true,
    importForSetupedApp: true
  },
  BNB: {
    rpcUrl: BSC.RPC,
    rpcUrls: RPC_URLS.BNB,
    chainId: BSC.chainId,
    nativeChainKey: BSC.nativeChainKey,
    minGasGwei: BSC.minGasGwei,
    imageUrl: BSC.imageUrl,
    name: BSC.name,
    symbol: BSC.symbol,
    rangoSymbol: BSC.rangoSymbol,
    chainName: BSC.chainName,
    subName: BSC.subName,
    slug: 'bsc',
    networkType: 'mainnet',
    blockExplorerUrl: EXPLORER_URLS.BNB,
    supportedTokenList: GET_RESOURCES_LIST_URL('bsc_tokens.json'),
    nativeToken: {
      "name": BSC.name,
      "symbol": BSC.symbol,
      "address": NATIVE_ADDRESS,
      "type": BSC.name?.toUpperCase(),
      "decimals": 18,
      "logoURI": BSC.imageUrl
    },
    wrappedAddress: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
    bridgeSupportTokens: BSC.bridgeSupportTokens,
    sendEnable: true,
    receiveEnable: true,
    bridgeEnable: true,
    swapEnable: true,
    importForSetupApp: true,
    importForSetupedApp: true
  },
  STR: {
    rpcUrl: STR.RPC,
    rpcUrls: RPC_URLS.STR,
    chainId: STR.chainId,
    nativeChainKey: STR.nativeChainKey,
    minGasGwei: STR.minGasGwei,
    imageUrl: STR.imageUrl,
    name: STR.name,
    symbol: STR.symbol,
    chainName: STR.chainName,
    subName: STR.subName,
    slug: 'stellar',
    networkType: 'mainnet',
    blockExplorerUrl: EXPLORER_URLS.STR,
    supportedTokenList: "https://lobstr.co/api/v1/sep/assets/curated.json",
    nativeToken: {
      "name": "Stellar",
      "symbol": "XLM",
      "address": NATIVE_ADDRESS,
      "type": STR.name?.toUpperCase(),
      "decimals": 7,
      "logoURI": STR.imageUrl
    },
    bridgeSupportTokens: STR.bridgeSupportTokens,
    sendEnable: true,
    receiveEnable: true,
    bridgeEnable: true,
    swapEnable: true,
    importForSetupApp: false,
    importForSetupedApp: true
  },
  DYDX: {
    rpcUrl: DYDX.RPC,
    rpcUrls: RPC_URLS.DYDX,
    chainId: DYDX.chainId,
    nativeChainKey: DYDX.nativeChainKey,
    minGasGwei: DYDX.minGasGwei,
    imageUrl: DYDX.imageUrl,
    name: DYDX.name,
    symbol: DYDX.symbol,
    chainName: DYDX.chainName,
    subName: DYDX.subName,
    slug: 'dydx',
    networkType: 'mainnet',
    blockExplorerUrl: EXPLORER_URLS.DYDX,
    supportedTokenList: [
      {
        name: DYDX.symbol,
        asset: DYDX.symbol,
        symbol: DYDX.symbol,
        address: "Native",
        chainId: DYDX.chainId,
        type: "NATIVE",
        decimals: 18,
        logoURI: DYDX.imageUrl
      },
      {
        name: 'USD Coin',
        asset: DYDX.symbol,
        symbol: 'USDC',
        address: 'USDC',
        chainId: DYDX.chainId,
        type: "",
        decimals: 6,
        logoURI: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png"
      }
    ],
    nativeToken: {
      "name": DYDX.symbol,
      "symbol": DYDX.symbol,
      "address": "",
      "type": DYDX.symbol,
      "decimals": 18,
      "logoURI": DYDX.imageUrl
    },
    bridgeSupportTokens: DYDX.bridgeSupportTokens,
    sendEnable: true,
    receiveEnable: true,
    bridgeEnable: false,
    swapEnable: false,
    importForSetupApp: false,
    importForSetupedApp: true
  }
};
