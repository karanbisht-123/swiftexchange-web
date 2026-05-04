import {
  type EVMChainConfig,
  type StellarChainConfig,
} from '../modules/walletconnect/config/chains';
import { getChainById } from '../modules/evm/utils/Chainregistry';

export function isEVMNetwork(
  config: EVMChainConfig | StellarChainConfig
): config is EVMChainConfig {
  return 'chainId' in config && typeof config.chainId === 'number';
}

export function isStellarNetwork(
  config: EVMChainConfig | StellarChainConfig
): config is StellarChainConfig {
  return 'horizonUrl' in config;
}

export function getNetworkPrefix(networkKey: any): string {
  if (networkKey === 'stellar' || networkKey === 'pubnet' || networkKey === 'testnet') {
    return '/stellar';
  }

  if (typeof networkKey === 'number') {
    const chain = getChainById(networkKey);
    if (!chain) throw new Error(`Unsupported EVM network: ${networkKey}`);

    const symbol = chain.symbol;
    if (symbol) {
      return `/${symbol.toLowerCase()}`;
    }

    return `/${chain.slug || chain.name.toLowerCase().replace(/\s+/g, '')}`;
  }

  if (typeof networkKey === 'string') {
    if (networkKey === 'sepolia') return '/eth';
    if (networkKey === 'bscTestnet') return '/bsc';
    return `/${networkKey}`;
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
