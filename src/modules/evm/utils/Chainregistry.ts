

export type NetworkKey = 'ethereum' | 'bsc' | 'polygon' | 'sepolia' | 'bscTestnet' | 'amoy';

export type NetworkType = 'mainnet' | 'testnet';

export type CoinGeckoPlatform =
    | 'ethereum'
    | 'bnb'
    | 'polygon-pos'
    | 'avalanche'
    | 'arbitrum-one'
    | 'optimistic-ethereum'
    | 'base'
    | string;

export type AssetType = 'ERC20' | 'BEP20' | 'MATIC' | 'AVAX' | 'NATIVE' | string;

export interface ChainAsset {
    asset: string;
    type: AssetType;
    address: string;
    name: string;
    symbol: string;
    decimals: number;
    logoURI: string;
    coingeckoId?: string;
    pairs?: string[];
}

export interface NativeCurrency {
    name: string;
    symbol: string;
    decimals: number;
    logoURI: string;
    wrappedAddress: string;
    coingeckoId: string;
}

export interface WellKnownTokens {
    USDT?: string;
    USDC?: string;
    DAI?: string;
    WBTC?: string;
    WETH?: string;
    [symbol: string]: string | undefined;
}

export interface ChainConfig {
    chainId: number;
    name: string;
    networkType: NetworkType;
    available: boolean;
    slug: string;
    rpcUrl: string;
    fallbackRpcUrls?: string[];
    blockExplorerUrl: string;
    nativeCurrency: NativeCurrency;
    logoURI: string;
    coingeckoPlatform: CoinGeckoPlatform;
    tokenListSource: 'uniswap' | 'pancakeswap' | 'custom';
    tokens: WellKnownTokens;
    assets: ChainAsset[];
    swapRouterAddress?: string;
    testnetTokenMetadata?: Record<
        string,
        { name: string; symbol: string; decimals: number; logoURI?: string }
    >;
}


import { CHAIN_CONFIGS } from './chains.ts';

export const CHAIN_REGISTRY: ChainConfig[] = CHAIN_CONFIGS;

// Lookup Maps
const BY_CHAIN_ID = new Map<number, ChainConfig>(
    CHAIN_REGISTRY.map((c) => [c.chainId, c])
);

const BY_SLUG = new Map<string, ChainConfig>(
    CHAIN_REGISTRY.map((c) => [`${c.slug}:${c.networkType}`, c])
);

// Core Functions
export function getChainById(chainId: number): ChainConfig | undefined {
    return BY_CHAIN_ID.get(chainId);
}

export function getChainBySlug(slug: string, networkType: NetworkType): ChainConfig | undefined {
    return BY_SLUG.get(`${slug}:${networkType}`);
}

export function getChainsForNetwork(networkType: NetworkType): ChainConfig[] {
    return CHAIN_REGISTRY.filter((c) => c.networkType === networkType && c.available);
}

export const MAINNET_CHAINS = getChainsForNetwork('mainnet');
export const TESTNET_CHAINS = getChainsForNetwork('testnet');

// Helper Functions
export function getTokenAddressesForChain(chainId: number): Record<string, string> {
    const chain = getChainById(chainId);
    if (!chain) return {};
    return Object.fromEntries(chain.assets.map((a) => [a.symbol, a.address]));
}

export function getAssetsForChain(chainId: number): ChainAsset[] {
    return getChainById(chainId)?.assets ?? [];
}

export function getAssetBySymbol(chainId: number, symbol: string): ChainAsset | undefined {
    return getChainById(chainId)?.assets.find((a) => a.symbol.toUpperCase() === symbol.toUpperCase());
}

export function getAssetByAddress(chainId: number, address: string): ChainAsset | undefined {
    return getChainById(chainId)?.assets.find((a) => a.address.toLowerCase() === address.toLowerCase());
}

export function getChainName(chainId: number): string {
    return getChainById(chainId)?.name ?? 'Unknown';
}

export function getChainNativeSymbol(chainId: number): string {
    return getChainById(chainId)?.nativeCurrency.symbol ?? 'ETH';
}

export function getChainLogoUrl(chainId: number): string | undefined {
    return getChainById(chainId)?.logoURI;
}

export function getTokenAddress(chainId: number, symbol: keyof WellKnownTokens): string | undefined {
    return getChainById(chainId)?.tokens[symbol];
}

export function getExplorerUrl(
    chainId: number,
    type: 'tx' | 'block' | 'address',
    value: string
): string {
    const base = getChainById(chainId)?.blockExplorerUrl ?? 'https://etherscan.io';
    return `${base}/${type}/${value}`;
}

export function chainTypeToId(slug: string, network: NetworkType): number {
    return getChainBySlug(slug, network)?.chainId ?? 1;
}