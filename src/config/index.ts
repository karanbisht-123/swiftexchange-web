import EVM_NETWORKS from './evmNetworks';
import type { EVMNetworkConfig } from './evmNetworks';
import STELLAR_NETWORKS from './stellarNetworks';
import type { StellarNetworkConfig } from './stellarNetworks';

const ENVIRONMENT = import.meta.env.MODE;
const isTestnet = ENVIRONMENT !== 'production';

export const NETWORK_CONFIGS: Record<string, EVMNetworkConfig | StellarNetworkConfig> = {
  ...(isTestnet ? EVM_NETWORKS.testnet : EVM_NETWORKS.mainnet),
  ...(isTestnet ? STELLAR_NETWORKS.testnet : STELLAR_NETWORKS.mainnet),
};
