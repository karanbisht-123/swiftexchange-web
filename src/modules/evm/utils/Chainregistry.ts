import { CHAINS } from './assetmanagement/chains';
import { mapIChainToChainConfig } from './assetmanagement/mapper';
import { GET_TOKEN_LOGO_URL } from './assetmanagement/constants';

export type NetworkKey = string;
export type NetworkType = 'mainnet' | 'testnet';
export type CoinGeckoPlatform = string;
export type AssetType = 'ERC20' | 'BEP20' | 'MATIC' | 'AVAX' | 'NATIVE' | string;

export interface AssetPair {
    base: string;
}

export interface ChainAsset {
    asset: string;
    type: AssetType;
    address: string;
    name: string;
    symbol: string;
    decimals: number;
    logoURI: string;
    coingeckoId?: string;
    pairs?: AssetPair[];
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

export interface ChainLink {
    name: string;
    url: string;
}

export interface ChainConfig {
    chainId: number;
    name: string;
    symbol?: string;
    networkType: NetworkType;
    available: boolean;
    swapEnabled: boolean;
    slug: string;
    rpcUrl: string;
    rpcUrls: string[];
    fallbackRpcUrls?: string[];
    blockExplorerUrl: string;
    nativeCurrency: NativeCurrency;
    logoURI: string;
    coingeckoPlatform: CoinGeckoPlatform;
    tokens: WellKnownTokens;
    assets: ChainAsset[];
    swapRouterAddress?: string;
    website?: string;
    description?: string;
    status?: string;
    tags?: string[];
    links?: ChainLink[];
    skipChainName?: string;
    testnetTokenMetadata?: Record<
        string,
        { name: string; symbol: string; decimals: number; logoURI?: string }
    >;
    nativeChainKey?: string;
    minGasGwei?: number;
    imageUrl?: string;
    chainName?: string;
    subName?: string;
    rangoSymbol?: string;
    gasLimit?: number;
    supportedTokenList?: string | any[];
    nativeToken?: any;
    bridgeSupportTokens?: any;
    sendEnable?: boolean;
    receiveEnable?: boolean;
    bridgeEnable?: boolean;
    swapEnable?: boolean;
    importForSetupApp?: boolean;
    importForSetupedApp?: boolean;
}

export const CHAIN_REGISTRY: ChainConfig[] = Object.values(CHAINS).map(mapIChainToChainConfig);

const BY_CHAIN_ID = new Map<number, ChainConfig>(
    CHAIN_REGISTRY.map((c) => [c.chainId, c])
);

const BY_SLUG = new Map<string, ChainConfig>(
    CHAIN_REGISTRY.map((c) => [`${c.slug}:${c.networkType}`, c])
);

export function getChainById(chainId: number): ChainConfig | undefined {
    return BY_CHAIN_ID.get(chainId);
}

export function getChainBySlug(slug: string, networkType: NetworkType): ChainConfig | undefined {
    return BY_SLUG.get(`${slug}:${networkType}`);
}


export function findChain(identifier: string, networkType: NetworkType): ChainConfig | undefined {
    const id = identifier.toLowerCase();

    const exactMatch = getChainBySlug(id, networkType);
    if (exactMatch) return exactMatch;

    return CHAIN_REGISTRY.find(c => 
        c.networkType === networkType && (
            c.slug.toLowerCase() === id ||
            (c.nativeChainKey?.toLowerCase().includes(id) ?? false) ||
            c.name.toLowerCase().includes(id)
        )
    );
}


export function getChainsForNetwork(networkType: NetworkType): ChainConfig[] {
    return CHAIN_REGISTRY.filter((c) => c.networkType === networkType && c.available);
}

export function isEvmChain(chainId: number): boolean {
    return chainId !== 9000000 && chainId !== 9000001 && chainId !== 0;
}

export function getEvmChainsForNetwork(networkType: NetworkType): ChainConfig[] {
    return getChainsForNetwork(networkType).filter((c) => isEvmChain(c.chainId));
}

export function getSwapEnabledChains(networkType: NetworkType): ChainConfig[] {
    return CHAIN_REGISTRY.filter((c) => c.networkType === networkType && c.available && c.swapEnabled);
}

export function getEvmSwapEnabledChains(networkType: NetworkType): ChainConfig[] {
    return getSwapEnabledChains(networkType).filter((c) => isEvmChain(c.chainId));
}

export const MAINNET_CHAINS = getChainsForNetwork('mainnet');
export const TESTNET_CHAINS = getChainsForNetwork('testnet');

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

export function getChainRangoSymbol(chainId: number): string {
    const chain = getChainById(chainId);
    return (chain as any)?.rangoSymbol || chain?.symbol || 'ETH';
}

export function getTokenAddress(chainId: number, symbol: keyof WellKnownTokens): string | undefined {
    return getChainById(chainId)?.tokens[symbol];
}

export function getGlobalAssetMetadata(symbol: string): { logoURI?: string } | undefined {
    for (const chain of CHAIN_REGISTRY) {
        const asset = chain.assets.find(a => a.symbol.toUpperCase() === symbol.toUpperCase());
        if (asset?.logoURI) return { logoURI: asset.logoURI };
        if (chain.nativeCurrency.symbol.toUpperCase() === symbol.toUpperCase()) {
            return { logoURI: chain.nativeCurrency.logoURI };
        }
    }
    return undefined;
}

export function getExplorerUrl(
    chainId: number,
    type: 'tx' | 'block' | 'address',
    value: string
): string {
    const base = getChainById(chainId)?.blockExplorerUrl ?? 'https://etherscan.io';
    return `${base}/${type}/${value}`;
}

export function registerDynamicAssets(
    chainId: number,
    newAssets: ChainAsset[],
    newTokens?: WellKnownTokens
) {
    const chain = getChainById(chainId);
    if (!chain) return;

    const existingAddresses = new Set(chain.assets.map(a => a.address.toLowerCase()));
    const assetsToAdd = newAssets.filter(a => !existingAddresses.has(a.address.toLowerCase()));

    chain.assets = [...chain.assets, ...assetsToAdd];

    if (newTokens) {
        chain.tokens = { ...chain.tokens, ...newTokens };
    }
}

export function chainTypeToId(slug: string, network: NetworkType): number {
    return getChainBySlug(slug, network)?.chainId ?? 1;
}

export async function initDynamicTokenLists() {
    for (const chain of CHAIN_REGISTRY) {
        if (typeof chain.supportedTokenList === 'string') {
            try {
                const response = await fetch(chain.supportedTokenList);
                if (!response.ok) continue;
                const tokens = await response.json();

                if (Array.isArray(tokens.assets) && (chain.chainId === 9000000 || chain.chainId === 9000001)) {
                    const dynamicAssets: ChainAsset[] = tokens.assets.map((asset: any) => ({
                        asset: `${asset.code}-${asset.issuer}`,
                        type: 'STELLAR',
                        address: asset.issuer,
                        name: asset.name || asset.code,
                        symbol: asset.code,
                        decimals: asset.decimals,
                        logoURI: asset.icon,
                    }));

                    const hasNative = dynamicAssets.some(a => a.symbol.toUpperCase() === chain.nativeCurrency.symbol.toUpperCase());
                    if (!hasNative && chain.nativeToken) {
                        dynamicAssets.unshift({
                            asset: chain.nativeToken.symbol,
                            type: chain.nativeToken.type || 'NATIVE',
                            address: chain.nativeToken.address || 'NATIVE',
                            name: chain.nativeToken.name,
                            symbol: chain.nativeToken.symbol,
                            decimals: chain.nativeToken.decimals,
                            logoURI: chain.nativeToken.logoURI,
                        });
                    }

                    registerDynamicAssets(chain.chainId, dynamicAssets);
                } else if (Array.isArray(tokens)) {
                    const dynamicAssets: ChainAsset[] = tokens.map((t: any) => ({
                        asset: t.asset || `c${chain.chainId}_t${t.address}`,
                        type: 'ERC20',
                        address: t.address,
                        name: t.name,
                        symbol: t.symbol,
                        decimals: t.decimals,
                        logoURI: t.logoURI || GET_TOKEN_LOGO_URL(chain.slug, t.address),
                    }));
                    registerDynamicAssets(chain.chainId, dynamicAssets);
                }
            } catch (error) {
                console.error(`[Chainregistry] Failed to fetch token list for ${chain.name}:`, error);
            }
        }
    }
}