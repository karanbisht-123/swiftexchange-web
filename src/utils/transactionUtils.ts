import { NETWORK_CONFIGS } from '../config';
import type { EVMNetworkConfig } from '../config/evmNetworks';
import type { StellarNetworkConfig } from '../config/stellarNetworks';

export function isEVMNetwork(
  config: EVMNetworkConfig | StellarNetworkConfig
): config is EVMNetworkConfig {
  return 'chainId' in config;
}

export function isStellarNetwork(
  config: EVMNetworkConfig | StellarNetworkConfig
): config is StellarNetworkConfig {
  return 'horizonUrl' in config;
}

export function getNetworkPrefix(networkKey: any): string {
  const config = NETWORK_CONFIGS[networkKey];
  if (!config) {
    throw new Error(`Unsupported network: ${networkKey}`);
  }
  if (isEVMNetwork(config)) {
    if (networkKey === 'sepolia') return '/eth';
    if (networkKey === 'bscTestnet') return '/bsc';
    return `/${networkKey}`;
  }
  if (isStellarNetwork(config)) {
    return '/stellar';
  }
  throw new Error('Unsupported network type');
}

export function generateTransactionId(type: 'evm' | 'stellar'): string {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).slice(2, 11);
  return `${type}_${timestamp}_${randomStr}`;
}

export function isValidTransactionId(id: string): boolean {
  const idParts = id.split('_');
  if (idParts.length !== 3) return false;
  const [type, timestamp, random] = idParts;
  return (type === 'evm' || type === 'stellar') && !isNaN(Number(timestamp)) && random.length === 9;
}
