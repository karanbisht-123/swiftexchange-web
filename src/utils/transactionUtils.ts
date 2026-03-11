import { getEVMChains, type EVMChainConfig, type StellarChainConfig } from '../modules/walletconnect/config/chains';
import { useWalletStore } from '../modules/walletconnect/store/walletConnectStore';

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
  const currentNetwork = useWalletStore.getState().network;

  if (typeof networkKey === 'number') {
    const evmChains = getEVMChains(currentNetwork);
    const evmChain = evmChains.find(c => c.chainId === networkKey);
    if (!evmChain) throw new Error(`Unsupported EVM network: ${networkKey}`);

    if (evmChain.chainId === 1 || evmChain.chainId === 11155111) return '/eth';
    if (evmChain.chainId === 56 || evmChain.chainId === 97) return '/bsc';
    if (evmChain.chainId === 137 || evmChain.chainId === 80002) return '/polygon';
    if (evmChain.chainId === 43114 || evmChain.chainId === 43113) return '/avalanche';
    if (evmChain.chainId === 10 || evmChain.chainId === 11155420) return '/optimism';
    if (evmChain.chainId === 42161 || evmChain.chainId === 421614) return '/arbitrum';

    return `/${evmChain.name.toLowerCase().replace(/\s+/g, '')}`;
  }

  if (networkKey === 'stellar' || networkKey === 'pubnet' || networkKey === 'testnet') {
    return '/stellar';
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
