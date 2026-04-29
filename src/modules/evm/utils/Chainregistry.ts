import { CHAINS } from './assetmanagement/chains';
import { mapIChainToChainConfig } from './assetmanagement/mapper';
import { GET_TOKEN_LOGO_URL, NATIVE_ADDRESS, AGGREGATOR_NATIVE_ADDRESS } from './assetmanagement/constants';

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
    isNative?: boolean;
}

export interface NativeCurrency {
    name: string;
    symbol: string;
    decimals: number;
    logoURI: string;
    wrappedAddress: string;
    coingeckoId: string;
    address?: string;
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
    chainId: number | string;
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

const BY_CHAIN_ID = new Map<number | string, ChainConfig>(
    CHAIN_REGISTRY.map((c) => [c.chainId, c])
);

const BY_SLUG = new Map<string, ChainConfig>(
    CHAIN_REGISTRY.map((c) => [`${c.slug}:${c.networkType}`, c])
);

const CACHE_KEY_PREFIX = 'swift_token_cache_';
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

interface TokenCache {
    timestamp: number;
    assets: ChainAsset[];
}

function getCachedTokenList(chainId: number | string): ChainAsset[] | null {
    if (typeof localStorage === 'undefined') return null;
    try {
        const cached = localStorage.getItem(`${CACHE_KEY_PREFIX}${chainId}`);
        if (!cached) return null;

        const { timestamp, assets } = JSON.parse(cached) as TokenCache;
        if (Date.now() - timestamp > CACHE_TTL) {
            return null; // Expired
        }

        return assets;
    } catch (e) {
        console.error(`[Chainregistry] Failed to parse cache for chain ${chainId}`, e);
        return null;
    }
}

function setCachedTokenList(chainId: number | string, assets: ChainAsset[]) {
    if (typeof localStorage === 'undefined') return;
    try {
        const cacheData: TokenCache = {
            timestamp: Date.now(),
            assets
        };
        localStorage.setItem(`${CACHE_KEY_PREFIX}${chainId}`, JSON.stringify(cacheData));
    } catch (e) {
        console.error(`[Chainregistry] Failed to save cache for chain ${chainId}`, e);
    }
}

export function getChainById(chainId: number | string): ChainConfig | undefined {
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

export function isEvmChain(chainId: number | string): boolean {
    return (
        chainId !== 'pubnet' &&
        chainId !== 'testnet' &&
        !(typeof chainId === 'string' && chainId.startsWith('dydx-')) &&
        chainId !== 0
    );
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

export function getTokenAddressesForChain(chainId: number | string): Record<string, string> {
    const chain = getChainById(chainId);
    if (!chain) return {};
    return Object.fromEntries(chain.assets.map((a) => [a.symbol, a.address]));
}

export function getAssetsForChain(chainId: number | string): ChainAsset[] {
    return getChainById(chainId)?.assets ?? [];
}

export function getAssetBySymbol(chainId: number | string, symbol: string): ChainAsset | undefined {
    return getChainById(chainId)?.assets.find((a) => a.symbol.toUpperCase() === symbol.toUpperCase());
}

export function getAssetByAddress(chainId: number | string, address: string): ChainAsset | undefined {
    const chain = getChainById(chainId);
    if (!chain) return undefined;

    const addr = address.toLowerCase();
    if (addr === NATIVE_ADDRESS.toLowerCase() || addr === AGGREGATOR_NATIVE_ADDRESS.toLowerCase()) {
        return {
            asset: chain.nativeCurrency.symbol,
            type: 'NATIVE',
            name: chain.nativeCurrency.name,
            symbol: chain.nativeCurrency.symbol,
            decimals: chain.nativeCurrency.decimals,
            address: NATIVE_ADDRESS,
            logoURI: chain.nativeCurrency.logoURI,
            isNative: true
        };
    }

    return chain.assets.find((a) => a.address.toLowerCase() === addr);
}

export function getChainName(chainId: number | string): string {
    return getChainById(chainId)?.name ?? 'Unknown';
}

export function getChainNativeSymbol(chainId: number | string): string {
    return getChainById(chainId)?.nativeCurrency.symbol ?? 'ETH';
}

export function getChainLogoUrl(chainId: number | string): string | undefined {
    return getChainById(chainId)?.logoURI;
}

export function getChainRangoSymbol(chainId: number | string): string {
    const chain = getChainById(chainId);
    return (chain as any)?.rangoSymbol || chain?.symbol || 'ETH';
}

export function getTokenAddress(chainId: number | string, symbol: keyof WellKnownTokens): string | undefined {
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
    chainId: number | string,
    type: 'tx' | 'block' | 'address',
    value: string
): string {
    const base = getChainById(chainId)?.blockExplorerUrl ?? 'https://etherscan.io';
    return `${base}/${type}/${value}`;
}

export function registerDynamicAssets(
    chainId: number | string,
    newAssets: ChainAsset[],
    newTokens?: WellKnownTokens
): ChainConfig | undefined {
    const chain = getChainById(chainId);
    if (!chain) return;

    const existingAddresses = new Set(chain.assets.map((a) => a.address.toLowerCase()));
    const assetsToAdd = newAssets.filter((a) => !existingAddresses.has(a.address.toLowerCase()));

    if (assetsToAdd.length === 0 && !newTokens) return chain;

    const updatedChain: ChainConfig = {
        ...chain,
        assets: [...chain.assets, ...assetsToAdd],
        tokens: newTokens ? { ...chain.tokens, ...newTokens } : chain.tokens,
    };

    BY_CHAIN_ID.set(chainId, updatedChain);
    BY_SLUG.set(`${updatedChain.slug}:${updatedChain.networkType}`, updatedChain);

    const index = CHAIN_REGISTRY.findIndex((c) => c.chainId === chainId);
    if (index !== -1) {
        CHAIN_REGISTRY[index] = updatedChain;
    }

    return updatedChain;
}

export function chainTypeToId(slug: string, network: NetworkType): number | string {
    return getChainBySlug(slug, network)?.chainId ?? 1;
}

export async function initDynamicTokenLists() {
    for (const chain of CHAIN_REGISTRY) {
        if (typeof chain.supportedTokenList === 'string') {
            // Try Cache First
            const cachedAssets = getCachedTokenList(chain.chainId);
            if (cachedAssets) {
                registerDynamicAssets(chain.chainId, cachedAssets);
                continue;
            }

            // Fetch from Network
            try {
                const response = await fetch(chain.supportedTokenList);
                if (!response.ok) continue;
                const tokens = await response.json();

                let dynamicAssets: ChainAsset[] = [];
                if (Array.isArray(tokens.assets) && (chain.chainId === 'pubnet' || chain.chainId === 'testnet')) {
                    dynamicAssets = tokens.assets.map((asset: any) => ({
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
                } else if (Array.isArray(tokens)) {
                    dynamicAssets = tokens.map((t: any) => ({
                        asset: t.asset || `c${chain.chainId}_t${t.address}`,
                        type: 'ERC20',
                        address: t.address,
                        name: t.name,
                        symbol: t.symbol,
                        decimals: t.decimals,
                        logoURI: t.logoURI || GET_TOKEN_LOGO_URL(chain.slug, t.address),
                    }));
                }

                if (dynamicAssets.length > 0) {
                    registerDynamicAssets(chain.chainId, dynamicAssets);
                    setCachedTokenList(chain.chainId, dynamicAssets);
                }
            } catch (error) {
                console.error(`[Chainregistry] Failed to fetch token list for ${chain.name}:`, error);
            }
        }
    }
}