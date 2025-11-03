export interface EVMChainConfig {
  chainId: number;
  name: string;
  rpcUrl: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  blockExplorerUrl: string;
}

export interface CosmosChainConfig {
  chainId: string;
  chainName: string;
  rpc: string;
  rest: string;
  bech32Config: {
    bech32PrefixAccAddr: string;
  };
  currencies: Array<{
    coinDenom: string;
    coinMinimalDenom: string;
    coinDecimals: number;
  }>;
}

export interface StellarChainConfig {
  network: 'PUBLIC' | 'TESTNET';
  networkPassphrase: string;
  horizonUrl: string;
}

export type NetworkType = 'mainnet' | 'testnet';

// ==================== MAINNET CONFIGURATIONS ====================

export const EVM_CHAINS_MAINNET: EVMChainConfig[] = [
  {
    chainId: 1,
    name: 'Ethereum',
    rpcUrl: 'https://eth.llamarpc.com',
    blockExplorerUrl: 'https://etherscan.io',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
  {
    chainId: 137,
    name: 'Polygon',
    rpcUrl: 'https://polygon-rpc.com',
    blockExplorerUrl: 'https://polygonscan.com',
    nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
  },
  {
    chainId: 56,
    name: 'BNB Smart Chain',
    rpcUrl: 'https://bsc-dataseed.binance.org',
    blockExplorerUrl: 'https://bscscan.com',
    nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
  },
  {
    chainId: 42161,
    name: 'Arbitrum One',
    rpcUrl: 'https://arb1.arbitrum.io/rpc',
    blockExplorerUrl: 'https://arbiscan.io',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
  {
    chainId: 10,
    name: 'Optimism',
    rpcUrl: 'https://mainnet.optimism.io',
    blockExplorerUrl: 'https://optimistic.etherscan.io',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
  {
    chainId: 43114,
    name: 'Avalanche C-Chain',
    rpcUrl: 'https://api.avax.network/ext/bc/C/rpc',
    blockExplorerUrl: 'https://snowtrace.io',
    nativeCurrency: { name: 'AVAX', symbol: 'AVAX', decimals: 18 },
  },
];

export const COSMOS_CHAINS_MAINNET: CosmosChainConfig[] = [
  {
    chainId: 'dydx-mainnet-1',
    chainName: 'dYdX',
    rpc: 'https://dydx-rpc.publicnode.com:443',
    rest: 'https://dydx-api.publicnode.com',
    bech32Config: { bech32PrefixAccAddr: 'dydx' },
    currencies: [
      {
        coinDenom: 'DYDX',
        coinMinimalDenom: 'adydx',
        coinDecimals: 18,
      },
    ],
  },
  {
    chainId: 'cosmoshub-4',
    chainName: 'Cosmos Hub',
    rpc: 'https://rpc.cosmos.network',
    rest: 'https://api.cosmos.network',
    bech32Config: { bech32PrefixAccAddr: 'cosmos' },
    currencies: [
      {
        coinDenom: 'ATOM',
        coinMinimalDenom: 'uatom',
        coinDecimals: 6,
      },
    ],
  },
  {
    chainId: 'osmosis-1',
    chainName: 'Osmosis',
    rpc: 'https://rpc.osmosis.zone',
    rest: 'https://api.osmosis.zone',
    bech32Config: { bech32PrefixAccAddr: 'osmo' },
    currencies: [
      {
        coinDenom: 'OSMO',
        coinMinimalDenom: 'uosmo',
        coinDecimals: 6,
      },
    ],
  },
];

export const STELLAR_CONFIG_MAINNET: StellarChainConfig = {
  network: 'PUBLIC',
  networkPassphrase: 'Public Global Stellar Network ; September 2015',
  horizonUrl: 'https://horizon-testnet.stellar.org',
};

// ==================== TESTNET CONFIGURATIONS ====================

export const EVM_CHAINS_TESTNET: EVMChainConfig[] = [
  {
    chainId: 11155111,
    name: 'Sepolia',
    rpcUrl: 'https://ethereum-sepolia.publicnode.com',
    blockExplorerUrl: 'https://sepolia.etherscan.io',
    nativeCurrency: { name: 'Sepolia Ether', symbol: 'ETH', decimals: 18 },
  },
  {
    chainId: 80002,
    name: 'Polygon Amoy',
    rpcUrl: 'https://rpc-amoy.polygon.technology',
    blockExplorerUrl: 'https://amoy.polygonscan.com',
    nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
  },
  {
    chainId: 97,
    name: 'BNB Smart Chain Testnet',
    rpcUrl: 'https://data-seed-prebsc-1-s1.binance.org:8545',
    blockExplorerUrl: 'https://testnet.bscscan.com',
    nativeCurrency: { name: 'BNB', symbol: 'tBNB', decimals: 18 },
  },
  {
    chainId: 421614,
    name: 'Arbitrum Sepolia',
    rpcUrl: 'https://sepolia-rollup.arbitrum.io/rpc',
    blockExplorerUrl: 'https://sepolia.arbiscan.io',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
  {
    chainId: 11155420,
    name: 'Optimism Sepolia',
    rpcUrl: 'https://sepolia.optimism.io',
    blockExplorerUrl: 'https://sepolia-optimism.etherscan.io',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
  {
    chainId: 43113,
    name: 'Avalanche Fuji',
    rpcUrl: 'https://api.avax-test.network/ext/bc/C/rpc',
    blockExplorerUrl: 'https://testnet.snowtrace.io',
    nativeCurrency: { name: 'AVAX', symbol: 'AVAX', decimals: 18 },
  },
];

export const COSMOS_CHAINS_TESTNET: CosmosChainConfig[] = [
  {
    chainId: 'dydx-testnet-4',
    chainName: 'dYdX Testnet',
    rpc: 'https://dydx-testnet-rpc.polkachu.com',
    rest: 'https://dydx-testnet-api.polkachu.com',
    bech32Config: { bech32PrefixAccAddr: 'dydx' },
    currencies: [
      {
        coinDenom: 'DYDX',
        coinMinimalDenom: 'adydx',
        coinDecimals: 18,
      },
    ],
  },
  {
    chainId: 'theta-testnet-001',
    chainName: 'Cosmos Hub Testnet',
    rpc: 'https://rpc.sentry-01.theta-testnet.polypore.xyz',
    rest: 'https://rest.sentry-01.theta-testnet.polypore.xyz',
    bech32Config: { bech32PrefixAccAddr: 'cosmos' },
    currencies: [
      {
        coinDenom: 'ATOM',
        coinMinimalDenom: 'uatom',
        coinDecimals: 6,
      },
    ],
  },
  {
    chainId: 'osmo-test-5',
    chainName: 'Osmosis Testnet',
    rpc: 'https://rpc.testnet.osmosis.zone',
    rest: 'https://lcd.testnet.osmosis.zone',
    bech32Config: { bech32PrefixAccAddr: 'osmo' },
    currencies: [
      {
        coinDenom: 'OSMO',
        coinMinimalDenom: 'uosmo',
        coinDecimals: 6,
      },
    ],
  },
];

export const STELLAR_CONFIG_TESTNET: StellarChainConfig = {
  network: 'TESTNET',
  networkPassphrase: 'Test SDF Network ; September 2015',
  horizonUrl: 'https://horizon-testnet.stellar.org',
};

// ==================== DYNAMIC GETTERS ====================

let currentNetwork: NetworkType = 'mainnet';

export const setNetwork = (network: NetworkType) => {
  currentNetwork = network;
};

export const getNetwork = (): NetworkType => {
  return currentNetwork;
};

export const getEVMChains = (): EVMChainConfig[] => {
  return currentNetwork === 'mainnet' ? EVM_CHAINS_MAINNET : EVM_CHAINS_TESTNET;
};

export const getCosmosChains = (): CosmosChainConfig[] => {
  return currentNetwork === 'mainnet' ? COSMOS_CHAINS_MAINNET : COSMOS_CHAINS_TESTNET;
};

export const getStellarConfig = (): StellarChainConfig => {
  return currentNetwork === 'mainnet' ? STELLAR_CONFIG_MAINNET : STELLAR_CONFIG_TESTNET;
};

export const EVM_CHAINS = getEVMChains();
export const COSMOS_CHAINS = getCosmosChains();
export const STELLAR_CONFIG = getStellarConfig();

export const WALLETCONNECT_PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '';

export const WALLETCONNECT_METADATA = {
  name: 'SwiftExchange',
  description: 'Trade Swiftly,Trade Securely',
  url: 'https://yourapp.com',
  icons: ['https://yourapp.com/icon.png'],
};
