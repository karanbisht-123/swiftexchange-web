export interface StellarNetworkConfig {
  network: string;
  horizonUrl: string;
  explorerUrl: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  testnet: boolean;
}

const STELLAR_NETWORKS = {
  mainnet: {
    stellarMainnet: {
      network: 'mainnet',
      horizonUrl: 'https://horizon.stellar.org',
      explorerUrl: 'https://steexp.com',
      nativeCurrency: { name: 'Stellar Lumen', symbol: 'XLM', decimals: 7 },
      testnet: false,
    },
  },
  testnet: {
    stellar: {
      network: 'testnet',
      horizonUrl: 'https://horizon-testnet.stellar.org',
      explorerUrl: 'https://testnet.steexp.com',
      nativeCurrency: { name: 'Stellar Lumen', symbol: 'XLM', decimals: 7 },
      testnet: true,
    },
  },
};

export default STELLAR_NETWORKS;
