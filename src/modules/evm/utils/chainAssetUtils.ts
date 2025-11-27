import { getNetwork } from '../../walletconnect/config/chains';

export interface TokenAddresses {
  USDT: string;
  USDC: string;
  WETH?: string;
}

export interface NativeAssetInfo {
  symbol: string;
  name: string;
  decimals: number;
  logoUri: string;
}

export interface Asset {
  code: string;
  name: string;
  decimals: number;
  address: string;
  isNative: boolean;
  balance: number;
  logoUri: string;
}

// ==================== MAINNET TOKEN ADDRESSES ====================
export const MAINNET_TOKEN_ADDRESSES: Record<number, TokenAddresses> = {
  1: {
    USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  },
  56: {
    USDT: '0x55d398326f99059fF775485246999027B3197955',
    USDC: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
    WETH: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8',
  },
  137: {
    USDT: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
    USDC: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
    WETH: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
  },
  42161: {
    USDT: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
    USDC: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8',
    WETH: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
  },
  10: {
    USDT: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58',
    USDC: '0x7F5c764cBc14f9669B88837ca1490cCa17c31607',
    WETH: '0x4200000000000000000000000000000000000006',
  },
  43114: {
    USDT: '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7',
    USDC: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',
    WETH: '0x49D5c2BdFfac6CE2BFdB6640F4F80f226bc10bAB',
  },
};

// ==================== TESTNET TOKEN ADDRESSES ====================
export const TESTNET_TOKEN_ADDRESSES: Record<number, TokenAddresses> = {
  11155111: {
    USDT: '0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0',
    USDC: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
    WETH: '0xfff9976782d46cc05630d1f6ebab18b2324d6b14',
  },
  97: {
    USDT: '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd',
    USDC: '0x64544969ed7EBf5f083679233325356EbE738930',
    WETH: '0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd',
  },
  80002: {
    USDT: '0x41e94eb019c0762f9bfcf9fb1e58725bfb0e7582',
    USDC: '0x52D800ca262522580CeBAD275395ca6e7598C014',
    WETH: '0x360ad4f9a9A8EFe9A8DCB5f461c4Cc1047E1Dcf9',
  },
  421614: {
    USDT: '0xf7E8e4E8B6F4e2f2e7C4A8e3E6c6D5e4E3E2E1E0',
    USDC: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',
    WETH: '0x980B62Da83eFf3D4576C647993b0c1D7faf17c73',
  },
  11155420: {
    USDT: '0xf7E8e4E8B6F4e2f2e7C4A8e3E6c6D5e4E3E2E1E0',
    USDC: '0x5fd84259d66Cd46123540766Be93DFE6D43130D7',
    WETH: '0x4200000000000000000000000000000000000006',
  },
  43113: {
    USDT: '0xf7E8e4E8B6F4e2f2e7C4A8e3E6c6D5e4E3E2E1E0',
    USDC: '0x5425890298aed601595a70AB815c96711a31Bc65',
    WETH: '0xd00ae08403B9bbb9124bB305C09058E32C39A48c',
  },
};

// ==================== MAINNET TO TESTNET CHAIN ID MAPPING ====================

export const MAINNET_TO_TESTNET_CHAIN_MAP: Record<number, number> = {
  1: 11155111, // Ethereum -> Sepolia
  56: 97, // BSC -> BSC Testnet
  137: 80002, // Polygon -> Polygon Amoy
  42161: 421614, // Arbitrum -> Arbitrum Sepolia
  10: 11155420, // Optimism -> Optimism Sepolia
  43114: 43113, // Avalanche -> Avalanche Fuji
  286609681: 11155111, // WalletConnect Ethereum Testnet -> Sepolia
};

// ==================== NATIVE ASSETS ====================
export const NATIVE_ASSETS: Record<number, NativeAssetInfo> = {
  1: {
    symbol: 'ETH',
    name: 'Ethereum',
    decimals: 18,
    logoUri:
      'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png',
  },
  11155111: {
    symbol: 'ETH',
    name: 'Sepolia Ether',
    decimals: 18,
    logoUri:
      'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png',
  },
  56: {
    symbol: 'BNB',
    name: 'BNB',
    decimals: 18,
    logoUri:
      'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/binance/info/logo.png',
  },
  97: {
    symbol: 'tBNB',
    name: 'Test BNB',
    decimals: 18,
    logoUri:
      'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/binance/info/logo.png',
  },
  137: {
    symbol: 'MATIC',
    name: 'Polygon',
    decimals: 18,
    logoUri:
      'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/polygon/info/logo.png',
  },
  80002: {
    symbol: 'MATIC',
    name: 'Test MATIC',
    decimals: 18,
    logoUri:
      'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/polygon/info/logo.png',
  },
  42161: {
    symbol: 'ETH',
    name: 'Arbitrum ETH',
    decimals: 18,
    logoUri:
      'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/arbitrum/info/logo.png',
  },
  421614: {
    symbol: 'ETH',
    name: 'Arbitrum Sepolia ETH',
    decimals: 18,
    logoUri:
      'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/arbitrum/info/logo.png',
  },
  10: {
    symbol: 'ETH',
    name: 'Optimism ETH',
    decimals: 18,
    logoUri:
      'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/optimism/info/logo.png',
  },
  11155420: {
    symbol: 'ETH',
    name: 'Optimism Sepolia ETH',
    decimals: 18,
    logoUri:
      'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/optimism/info/logo.png',
  },
  43114: {
    symbol: 'AVAX',
    name: 'Avalanche',
    decimals: 18,
    logoUri:
      'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/avalanchec/info/logo.png',
  },
  43113: {
    symbol: 'AVAX',
    name: 'Avalanche Fuji',
    decimals: 18,
    logoUri:
      'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/avalanchec/info/logo.png',
  },
};

// ==================== NETWORK KEYS ====================
export const NETWORK_KEYS: Record<number, string> = {
  1: 'ethereum',
  11155111: 'sepolia',
  56: 'bsc',
  97: 'bsc-testnet',
  137: 'polygon',
  80002: 'polygon-amoy',
  42161: 'arbitrum',
  421614: 'arbitrum-sepolia',
  10: 'optimism',
  11155420: 'optimism-sepolia',
  43114: 'avalanche',
  43113: 'avalanche-fuji',
};

// ==================== HELPER FUNCTIONS ====================

/**
 * Maps a chainId to the correct network based on the global network setting
 * If network is testnet and chainId is mainnet, returns the testnet equivalent
 */
export function getMappedChainId(chainId: number): number {
  const networkType = getNetwork();

  // If on testnet and chainId is a mainnet chain, map it to testnet
  if (networkType === 'testnet' && MAINNET_TO_TESTNET_CHAIN_MAP[chainId]) {
    const mappedChainId = MAINNET_TO_TESTNET_CHAIN_MAP[chainId];
    console.log(
      `[CHAIN MAPPING] Mapped mainnet chainId ${chainId} to testnet chainId ${mappedChainId}`
    );
    return mappedChainId;
  }

  return chainId;
}

function getTokenAddresses(): Record<number, TokenAddresses> {
  const networkType = getNetwork();
  return networkType === 'mainnet' ? MAINNET_TOKEN_ADDRESSES : TESTNET_TOKEN_ADDRESSES;
}

export function isMainnet(chainId: number): boolean {
  console.log('Checking if mainnet for chainId:', chainId);
  const networkType = getNetwork();
  return networkType === 'mainnet';
}

export function getUSDTAddress(chainId: number): string | null {
  const mappedChainId = getMappedChainId(chainId);
  console.log(chainId, 'jhsdkjdh');
  const addresses = getTokenAddresses();
  return addresses[mappedChainId]?.USDT || null;
}

export function getUSDCAddress(chainId: number): string | null {
  const mappedChainId = getMappedChainId(chainId);
  const addresses = getTokenAddresses();
  return addresses[mappedChainId]?.USDC || null;
}

export function getWETHAddress(chainId: number): string | null {
  const mappedChainId = getMappedChainId(chainId);
  const addresses = getTokenAddresses();
  return addresses[mappedChainId]?.WETH || null;
}

export function getNativeSymbol(chainId: number): string {
  const mappedChainId = getMappedChainId(chainId);
  return NATIVE_ASSETS[mappedChainId]?.symbol || 'ETH';
}

export function getNativeName(chainId: number): string {
  const mappedChainId = getMappedChainId(chainId);
  return NATIVE_ASSETS[mappedChainId]?.name || 'Ethereum';
}

export function getNativeLogoUri(chainId: number): string {
  const mappedChainId = getMappedChainId(chainId);
  return NATIVE_ASSETS[mappedChainId]?.logoUri || '';
}

export function getNetworkKey(chainId: any): any {
  const mappedChainId = getMappedChainId(chainId);
  return NETWORK_KEYS[mappedChainId] || 'sepolia';
}

export function getNativeAssetInfo(chainId: number): NativeAssetInfo | null {
  const mappedChainId = getMappedChainId(chainId);
  return NATIVE_ASSETS[mappedChainId] || null;
}

export function isChainSupported(chainId: number): boolean {
  const mappedChainId = getMappedChainId(chainId);
  return mappedChainId in NATIVE_ASSETS;
}

export function createNativeAsset(chainId: number, balance: number = 0): Asset | null {
  const mappedChainId = getMappedChainId(chainId);
  const info = getNativeAssetInfo(mappedChainId);
  if (!info) return null;

  return {
    code: info.symbol,
    name: info.name,
    decimals: info.decimals,
    address: '0x0000000000000000000000000000000000000000',
    isNative: true,
    balance,
    logoUri: info.logoUri,
  };
}

export function createUSDTAsset(chainId: number, balance: number = 0): Asset | null {
  const address = getUSDTAddress(chainId);
  if (!address) return null;

  return {
    code: 'USDT',
    name: 'Tether USD',
    decimals: 6,
    address,
    isNative: false,
    balance,
    logoUri:
      'https://tokens.pancakeswap.finance/images/0x55d398326f99059fF775485246999027B3197955.png',
  };
}

export function createUSDCAsset(chainId: number, balance: number = 0): Asset | null {
  const address = getUSDCAddress(chainId);
  if (!address) return null;

  return {
    code: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    address,
    isNative: false,
    balance,
    logoUri: 'https://cryptologos.cc/logos/usd-coin-usdc-logo.png',
  };
}

export function getSupportedChainIds(mainnet: boolean = true): number[] {
  const addresses = mainnet ? MAINNET_TOKEN_ADDRESSES : TESTNET_TOKEN_ADDRESSES;
  return Object.keys(addresses).map(Number);
}
