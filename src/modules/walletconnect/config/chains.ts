export interface EVMChainConfig {
  chainId: number;
  name: string;
  rpcUrl: string;
  fallbackRpcUrls?: string[];
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  blockExplorerUrl: string;
  logoUrl: string;
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
  logoUrl: string;
}

export interface StellarChainConfig {
  network: 'PUBLIC' | 'TESTNET';
  networkPassphrase: string;
  horizonUrl: string;
  chainId: string;
  logoUrl: string;
}

export type NetworkType = 'mainnet' | 'testnet';

export const EVM_CHAINS_MAINNET: EVMChainConfig[] = [
  {
    chainId: 1,
    name: 'Ethereum',
    rpcUrl: 'https://ethereum-rpc.publicnode.com',
    fallbackRpcUrls: [
      'https://cloudflare-eth.com',
      'https://eth.drpc.org',
      'https://eth.llamarpc.com',
      'https://rpc.flashbots.net/fast',
      'https://eth.api.onfinality.io/public',
      'https://rpc.mevblocker.io',
      'https://rpc.mevblocker.io',
    ],
    blockExplorerUrl: 'https://etherscan.io',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    logoUrl:
      'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png',
  },
  {
    chainId: 56,
    name: 'BNB Smart Chain',
    rpcUrl: 'https://bsc.publicnode.com',
    fallbackRpcUrls: [
      'https://bsc-dataseed.bnbchain.org',
      'https://bsc-dataseed1.defibit.io',
      'https://bsc-dataseed2.defibit.io',
      'https://bsc-dataseed1.ninicoin.io',
      'https://bsc-dataseed2.ninicoin.io',
      'https://bsc.drpc.org',
      'https://bsc.meowrpc.com',
      'https://1rpc.io/bnb',
      'https://bsc.rpc.blxrbdn.com',
      'https://public-bsc.nownodes.io',
    ],
    blockExplorerUrl: 'https://bscscan.com',
    nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
    logoUrl:
      'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/binance/info/logo.png',
  },
];

export const COSMOS_CHAINS_MAINNET: CosmosChainConfig[] = [
  {
    chainId: 'dydx-mainnet-1',
    chainName: 'dYdX',
    rpc: 'https://dydx-rpc.publicnode.com:443',
    rest: 'https://dydx-api.publicnode.com',
    bech32Config: { bech32PrefixAccAddr: 'dydx' },
    currencies: [{ coinDenom: 'DYDX', coinMinimalDenom: 'adydx', coinDecimals: 18 }],
    logoUrl: 'https://raw.githubusercontent.com/cosmos/chain-registry/master/dydx/images/dydx.png',
  },
  {
    chainId: 'cosmoshub-4',
    chainName: 'Cosmos Hub',
    rpc: 'https://rpc.cosmos.network',
    rest: 'https://api.cosmos.network',
    bech32Config: { bech32PrefixAccAddr: 'cosmos' },
    currencies: [{ coinDenom: 'ATOM', coinMinimalDenom: 'uatom', coinDecimals: 6 }],
    logoUrl:
      'https://raw.githubusercontent.com/cosmos/chain-registry/master/cosmoshub/images/atom.png',
  },
  {
    chainId: 'osmosis-1',
    chainName: 'Osmosis',
    rpc: 'https://rpc.osmosis.zone',
    rest: 'https://api.osmosis.zone',
    bech32Config: { bech32PrefixAccAddr: 'osmo' },
    currencies: [{ coinDenom: 'OSMO', coinMinimalDenom: 'uosmo', coinDecimals: 6 }],
    logoUrl:
      'https://raw.githubusercontent.com/cosmos/chain-registry/master/osmosis/images/osmo.png',
  },
];

export const STELLAR_CONFIG_MAINNET: StellarChainConfig = {
  network: 'PUBLIC',
  networkPassphrase: 'Public Global Stellar Network ; September 2015',
  horizonUrl: 'https://horizon.stellar.org',
  chainId: 'pubnet',
  logoUrl:
    'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/stellar/info/logo.png',
};

export const EVM_CHAINS_TESTNET: EVMChainConfig[] = [
  {
    chainId: 11155111,
    name: 'Sepolia',
    rpcUrl: 'https://ethereum-sepolia.publicnode.com',
    fallbackRpcUrls: [
      'https://rpc.sepolia.org',
      'https://rpc2.sepolia.org',
      'https://sepolia.drpc.org',
      'https://eth-sepolia.public.blastapi.io',
      'https://eth-sepolia-testnet.api.pocket.network',
      'https://sepolia.meowrpc.com',
      'https://ethereum-sepolia-rpc.publicnode.com',
    ],
    blockExplorerUrl: 'https://sepolia.etherscan.io',
    nativeCurrency: { name: 'Sepolia Ether', symbol: 'ETH', decimals: 18 },
    logoUrl:
      'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png',
  },
  {
    chainId: 97,
    name: 'BNB Smart Chain Testnet',
    rpcUrl: 'https://bsc-testnet-rpc.publicnode.com',
    fallbackRpcUrls: [
      'https://bsc-testnet.drpc.org',
      'https://data-seed-prebsc-1-s1.bnbchain.org:8545',
      'https://data-seed-prebsc-2-s1.bnbchain.org:8545',
      'https://data-seed-prebsc-1-s2.bnbchain.org:8545',
      'https://data-seed-prebsc-2-s2.bnbchain.org:8545',
      'https://bsc-testnet.public.blastapi.io',
      'https://bsc-testnet.meowrpc.com',
    ],
    blockExplorerUrl: 'https://testnet.bscscan.com',
    nativeCurrency: { name: 'BNB', symbol: 'tBNB', decimals: 18 },
    logoUrl:
      'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/binance/info/logo.png',
  },
];

export const COSMOS_CHAINS_TESTNET: CosmosChainConfig[] = [
  {
    chainId: 'dydx-testnet-4',
    chainName: 'dYdX Testnet',
    rpc: 'https://dydx-testnet-rpc.polkachu.com',
    rest: 'https://dydx-testnet-api.polkachu.com',
    bech32Config: { bech32PrefixAccAddr: 'dydx' },
    currencies: [{ coinDenom: 'DYDX', coinMinimalDenom: 'adydx', coinDecimals: 18 }],
    logoUrl: 'https://raw.githubusercontent.com/cosmos/chain-registry/master/dydx/images/dydx.png',
  },
  {
    chainId: 'theta-testnet-001',
    chainName: 'Cosmos Hub Testnet',
    rpc: 'https://rpc.sentry-01.theta-testnet.polypore.xyz',
    rest: 'https://rest.sentry-01.theta-testnet.polypore.xyz',
    bech32Config: { bech32PrefixAccAddr: 'cosmos' },
    currencies: [{ coinDenom: 'ATOM', coinMinimalDenom: 'uatom', coinDecimals: 6 }],
    logoUrl:
      'https://raw.githubusercontent.com/cosmos/chain-registry/master/cosmoshub/images/atom.png',
  },
  {
    chainId: 'osmo-test-5',
    chainName: 'Osmosis Testnet',
    rpc: 'https://rpc.testnet.osmosis.zone',
    rest: 'https://lcd.testnet.osmosis.zone',
    bech32Config: { bech32PrefixAccAddr: 'osmo' },
    currencies: [{ coinDenom: 'OSMO', coinMinimalDenom: 'uosmo', coinDecimals: 6 }],
    logoUrl:
      'https://raw.githubusercontent.com/cosmos/chain-registry/master/osmosis/images/osmo.png',
  },
];

export const STELLAR_CONFIG_TESTNET: StellarChainConfig = {
  network: 'TESTNET',
  networkPassphrase: 'Test SDF Network ; September 2015',
  horizonUrl: 'https://horizon-testnet.stellar.org',
  chainId: 'testnet',
  logoUrl:
    'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/stellar/info/logo.png',
};

export const getEVMChains = (network: NetworkType): EVMChainConfig[] => {
  return network === 'mainnet' ? EVM_CHAINS_MAINNET : EVM_CHAINS_TESTNET;
};

export const getCosmosChains = (network: NetworkType): CosmosChainConfig[] => {
  return network === 'mainnet' ? COSMOS_CHAINS_MAINNET : COSMOS_CHAINS_TESTNET;
};

export const getStellarConfig = (network: NetworkType): StellarChainConfig => {
  return network === 'mainnet' ? STELLAR_CONFIG_MAINNET : STELLAR_CONFIG_TESTNET;
};

export const WALLETCONNECT_PROJECT_ID =
  import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || 'fe064714063c421e5cec1791c670bf57';

export const WALLETCONNECT_METADATA = {
  name: 'SwiftExchange',
  description: 'Trade Swiftly, Trade Securely',
  url: 'https://SwiftExchange.com',
  icons: ['/logo.png'],
};

export const buildUnifiedNamespaces = (
  network: NetworkType
): {
  requiredNamespaces: Record<string, unknown>;
  optionalNamespaces: Record<string, unknown>;
} => {
  const evmChains = getEVMChains(network).map(c => `eip155:${c.chainId}`);
  const stellarConfig = getStellarConfig(network);
  const stellarChain = `stellar:${stellarConfig.chainId}`;

  const evmNamespace = {
    methods: ['eth_sendTransaction', 'eth_signTypedData_v4', 'personal_sign'],
    chains: evmChains,
    events: ['chainChanged', 'accountsChanged'],
  };

  return {
    requiredNamespaces: {},
    optionalNamespaces: {
      eip155: evmNamespace,
      stellar: {
        methods: ['stellar_signTransaction', 'stellar_signAndSubmitXDR'],
        chains: [stellarChain],
        events: ['accountsChanged'],
      },
    },
  };
};
