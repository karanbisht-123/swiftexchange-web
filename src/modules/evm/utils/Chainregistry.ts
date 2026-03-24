import {
    type EVMChainConfig,
    type NetworkType,
    getEVMChains,
} from '../../walletconnect/config/chains';

export type ChainType = 'eth' | 'bsc';

const CHAIN_TYPE_TO_ID: Record<ChainType, Record<NetworkType, number>> = {
    eth: { mainnet: 1, testnet: 11155111 },
    bsc: { mainnet: 56, testnet: 97 },
};

export function chainTypeToId(chain: ChainType, network: NetworkType): number {
    return CHAIN_TYPE_TO_ID[chain][network];
}

export function normalizeChainId(chainId: any): number {
    if (typeof chainId === 'number') return chainId;
    if (typeof chainId === 'string') {
        const n = parseInt(chainId, 10);
        return isNaN(n) ? 1 : n;
    }
    return 1;
}

export function getChainConfig(chainId: number, network: NetworkType): EVMChainConfig | undefined {
    return getEVMChains(network).find(c => c.chainId === chainId);
}

export function getChainName(chainId: number, network: NetworkType): string {
    return getChainConfig(chainId, network)?.nativeCurrency.symbol ?? 'EVM';
}

export function getExplorerUrl(
    chainId: number,
    network: NetworkType,
    type: 'tx' | 'block' | 'address',
    value: string
): string {
    const base = getChainConfig(chainId, network)?.blockExplorerUrl ?? 'https://etherscan.io';
    return `${base}/${type}/${value}`;
}

export function getChainLogoUrl(chainId: number, network: NetworkType): string | undefined {
    return getChainConfig(chainId, network)?.logoUrl;
}