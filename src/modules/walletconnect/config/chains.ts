import { getEvmChainsForNetwork } from '../../evm/utils/Chainregistry';

export interface EVMChainConfig {
  chainId: number | string;
  name: string;
  rpcUrls: string[];
  nativeCurrency: {
    coingeckoId: any;
    logoURI: any;
    name: string;
    symbol: string;
    decimals: number;
  };
  blockExplorerUrl: string;
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

export const getEVMChains = (network: NetworkType): EVMChainConfig[] => {
  const chains = getEvmChainsForNetwork(network);

  return chains.map(c => ({
    chainId: c.chainId,
    name: c.name,
    rpcUrls: c.rpcUrls,
    nativeCurrency: {
      name: c.nativeCurrency.name,
      symbol: c.nativeCurrency.symbol,
      decimals: c.nativeCurrency.decimals,
      coingeckoId: c.nativeCurrency.coingeckoId,
      logoURI: c.nativeCurrency.logoURI,
    },
    blockExplorerUrl: c.blockExplorerUrl,
    logoUrl: c.logoURI || 'https://coin-images.coingecko.com/coins/images/279/large/ethereum.png',
  }));
};

export const STELLAR_CONFIG_MAINNET: StellarChainConfig = {
  network: 'PUBLIC',
  networkPassphrase: 'Public Global Stellar Network ; September 2015',
  horizonUrl: 'https://horizon.stellar.org',
  chainId: 'pubnet',
  logoUrl:
    'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/stellar/info/logo.png',
};

export const STELLAR_CONFIG_TESTNET: StellarChainConfig = {
  network: 'TESTNET',
  networkPassphrase: 'Test SDF Network ; September 2015',
  horizonUrl: 'https://horizon-testnet.stellar.org',
  chainId: 'testnet',
  logoUrl:
    'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/stellar/info/logo.png',
};

export const getStellarConfig = (network: NetworkType | string): StellarChainConfig => {
  return network === 'mainnet' || network === 'pubnet'
    ? STELLAR_CONFIG_MAINNET
    : STELLAR_CONFIG_TESTNET;
};

export const WALLETCONNECT_PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID;

export const WALLETCONNECT_METADATA = {
  name: 'SwiftExchange',
  description: 'Trade Swiftly, Trade Securely',
  url: 'https://app.swiftexchange.io',
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
    methods: ['eth_sendTransaction', 'eth_signTypedData_v4', 'eth_signTypedData', 'personal_sign'],
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
