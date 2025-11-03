import EVM_NETWORKS from './evmNetworks';
import type { EVMNetworkConfig } from './evmNetworks';
import STELLAR_NETWORKS from './stellarNetworks';
import type { StellarNetworkConfig } from './stellarNetworks';

const ENVIRONMENT = process.env.NODE_ENV || 'development';
const isTestnet = ENVIRONMENT === 'development' || ENVIRONMENT === 'test';

export const NETWORK_CONFIGS: Record<string, EVMNetworkConfig | StellarNetworkConfig> = {
  ...(!isTestnet ? EVM_NETWORKS.mainnet : EVM_NETWORKS.testnet),
  ...(!isTestnet ? STELLAR_NETWORKS.mainnet : STELLAR_NETWORKS.testnet),
};
