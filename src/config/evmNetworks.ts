export interface EVMNetworkConfig {
  chainId: number;
  name: string;
  rpcUrl: string;
  explorerUrl: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  testnet: boolean;
}

const EVM_NETWORKS = {
  mainnet: {
    ethereum: {
      chainId: 1,
      name: 'Ethereum Mainnet',
      rpcUrl: 'https://ethereum-rpc.publicnode.com',
      explorerUrl: 'https://etherscan.io',
      nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
      testnet: false,
    },
    bsc: {
      chainId: 56,
      name: 'BNB Smart Chain',
      rpcUrl: 'https://bsc-dataseed.binance.org/',
      explorerUrl: 'https://bscscan.com',
      nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
      testnet: false,
    },
    polygon: {
      chainId: 137,
      name: 'Polygon',
      rpcUrl: 'https://polygon-rpc.com',
      explorerUrl: 'https://polygonscan.com',
      nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
      testnet: false,
    },
  },
  testnet: {
    sepolia: {
      chainId: 11155111,
      name: 'Sepolia Testnet',
      rpcUrl: 'https://sepolia.gateway.tenderly.co/',
      explorerUrl: 'https://sepolia.etherscan.io',
      nativeCurrency: { name: 'Sepolia Ether', symbol: 'ETH', decimals: 18 },
      testnet: true,
    },
    bscTestnet: {
      chainId: 97,
      name: 'BSC Testnet',
      rpcUrl: 'https://data-seed-prebsc-1-s1.binance.org:8545/',
      explorerUrl: 'https://testnet.bscscan.com',
      nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
      testnet: true,
    },
    amoy: {
      chainId: 80002,
      name: 'Polygon Amoy',
      rpcUrl: 'https://polygon-amoy-bor-rpc.publicnode.com',
      explorerUrl: 'https://amoy.polygonscan.com',
      nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
      testnet: true,
    },
  },
};

export default EVM_NETWORKS;
