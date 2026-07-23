import { CHAINS } from './assetmanagement/chains';
import {
  AGGREGATOR_NATIVE_ADDRESS,
  GET_TOKEN_LOGO_URL,
  NATIVE_ADDRESS,
} from './assetmanagement/constants';
import { mapIChainToChainConfig } from './assetmanagement/mapper';

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
  domain?: string;
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

const BY_CHAIN_ID = new Map<number | string, ChainConfig>(CHAIN_REGISTRY.map(c => [c.chainId, c]));

const BY_SLUG = new Map<string, ChainConfig>(
  CHAIN_REGISTRY.map(c => [`${c.slug}:${c.networkType}`, c])
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
      assets,
    };
    localStorage.setItem(`${CACHE_KEY_PREFIX}${chainId}`, JSON.stringify(cacheData));
  } catch (e) {
    console.error(`[Chainregistry] Failed to save cache for chain ${chainId}`, e);
  }
}

export function getChainById(chainId: number | string): ChainConfig | undefined {
  if (BY_CHAIN_ID.has(chainId)) return BY_CHAIN_ID.get(chainId);
  const numericId = Number(chainId);
  if (!isNaN(numericId) && BY_CHAIN_ID.has(numericId)) return BY_CHAIN_ID.get(numericId);
  return CHAIN_REGISTRY.find(c => String(c.chainId) === String(chainId));
}

export function getChainBySlug(slug: string, networkType: NetworkType): ChainConfig | undefined {
  return BY_SLUG.get(`${slug}:${networkType}`);
}

export function findChain(
  identifier: string | undefined | null,
  networkType: NetworkType
): ChainConfig | undefined {
  if (!identifier || typeof identifier !== 'string') return undefined;
  const id = identifier.toLowerCase();

  const exactMatch = getChainBySlug(id, networkType);
  if (exactMatch) return exactMatch;

  return CHAIN_REGISTRY.find(
    c =>
      c.networkType === networkType &&
      (c.slug.toLowerCase() === id ||
        (c.nativeChainKey?.toLowerCase().includes(id) ?? false) ||
        c.name.toLowerCase().includes(id))
  );
}

export function getChainsForNetwork(networkType: NetworkType): ChainConfig[] {
  return CHAIN_REGISTRY.filter(c => c.networkType === networkType && c.available);
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
  return getChainsForNetwork(networkType).filter(c => isEvmChain(c.chainId));
}

export function getSwapEnabledChains(networkType: NetworkType): ChainConfig[] {
  return CHAIN_REGISTRY.filter(c => c.networkType === networkType && c.available && c.swapEnabled);
}

export function getEvmSwapEnabledChains(networkType: NetworkType): ChainConfig[] {
  return getSwapEnabledChains(networkType).filter(c => isEvmChain(c.chainId));
}

export const MAINNET_CHAINS = getChainsForNetwork('mainnet');
export const TESTNET_CHAINS = getChainsForNetwork('testnet');

export function getTokenAddressesForChain(chainId: number | string): Record<string, string> {
  const chain = getChainById(chainId);
  if (!chain) return {};
  return Object.fromEntries(chain.assets.map(a => [a.symbol, a.address]));
}

export function getAssetsForChain(chainId: number | string): ChainAsset[] {
  return getChainById(chainId)?.assets ?? [];
}

export function getAssetBySymbol(chainId: number | string, symbol: string): ChainAsset | undefined {
  return getChainById(chainId)?.assets.find(a => a.symbol?.toUpperCase() === symbol?.toUpperCase());
}

export function getAssetByAddress(
  chainId: number | string,
  address: string
): ChainAsset | undefined {
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
      isNative: true,
    };
  }

  return chain.assets.find(a => a.address.toLowerCase() === addr);
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

export function getTokenAddress(
  chainId: number | string,
  symbol: keyof WellKnownTokens
): string | undefined {
  return getChainById(chainId)?.tokens[symbol];
}

export function getGlobalAssetMetadata(symbol: string): { logoURI?: string } | undefined {
  for (const chain of CHAIN_REGISTRY) {
    const asset = chain.assets.find(a => a.symbol?.toUpperCase() === symbol?.toUpperCase());
    if (asset?.logoURI) return { logoURI: asset.logoURI };
    if (chain.nativeCurrency.symbol?.toUpperCase() === symbol?.toUpperCase()) {
      return { logoURI: chain.nativeCurrency.logoURI };
    }
  }
  return undefined;
}

/**
 * ETH logo — used when correcting native-address tokens on ETH L2 chains.
 */
export const ETH_LOGO_URI =
  'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png';

/**
 * Chain IDs where the native gas token is ETH but the chain has its own
 * identifier symbol (ARB, OP, BASE).  The token source may return the
 * zero/native address labelled with those chain symbols — we must show ETH.
 */
const ETH_GAS_L2_CHAIN_IDS = new Set<number | string>([
  42161, // Arbitrum One  — gas = ETH, governance token = ARB (0x912CE5…)
  10, // Optimism      — gas = ETH, governance token = OP
  8453, // Base          — gas = ETH
]);

const NATIVE_ADDRESSES = new Set<string>([
  '0x0000000000000000000000000000000000000000',
  '0X0000000000000000000000000000000000000000',
  '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
  'native',
  '',
]);

function isNativeAddress(address: string | undefined | null): boolean {
  if (!address) return true;
  return NATIVE_ADDRESSES.has(address) || NATIVE_ADDRESSES.has(address.toLowerCase());
}

export interface NormalizedToken {
  symbol: string;
  name: string;
  logoURI: string;
  isNative: boolean;
  /** True when we corrected the display from a wrong chain-identifier symbol */
  wasCorrected: boolean;
}

/**
 * Normalizes a token's display metadata for a given chain.
 *
 * Problem: Token sources (1inch, Uniswap, etc.) sometimes label the native
 * address (0x0000…) on Arbitrum as "ARB", on Optimism as "OPT", etc. —
 * which is **wrong**. The actual gas token paid on all three ETH L2s is ETH.
 *
 * This function detects that case and returns corrected ETH display data
 * without modifying the underlying token source.
 *
 * @param token   Raw token object from any source.
 * @param chainId The chain the token belongs to.
 */
export function normalizeTokenForDisplay(
  token: {
    symbol?: string;
    name?: string;
    logoURI?: string;
    image?: string;
    address?: string;
    isNative?: boolean;
    type?: string;
  },
  chainId: number | string
): NormalizedToken {
  const isNative = !!token.isNative || token.type === 'NATIVE' || isNativeAddress(token.address);

  // On ETH L2 chains the zero-address IS ETH, regardless of what the API says
  if (isNative && ETH_GAS_L2_CHAIN_IDS.has(Number(chainId) || chainId)) {
    return {
      symbol: 'ETH',
      name: 'Ether',
      logoURI: ETH_LOGO_URI,
      isNative: true,
      wasCorrected: true,
    };
  }

  // Also correct the Ethereum chain itself (safety)
  if (isNative && (chainId === 1 || chainId === '1')) {
    return {
      symbol: 'ETH',
      name: 'Ether',
      logoURI: token.logoURI || token.image || ETH_LOGO_URI,
      isNative: true,
      wasCorrected: false,
    };
  }

  return {
    symbol: token.symbol || '',
    name: token.name || token.symbol || '',
    logoURI: token.logoURI || token.image || '',
    isNative,
    wasCorrected: false,
  };
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

  const existingAddresses = new Set(chain.assets.map(a => a.address.toLowerCase()));
  const assetsToAdd = newAssets.filter(a => !existingAddresses.has(a.address.toLowerCase()));

  if (assetsToAdd.length === 0 && !newTokens) return chain;

  const updatedChain: ChainConfig = {
    ...chain,
    assets: [...chain.assets, ...assetsToAdd],
    tokens: newTokens ? { ...chain.tokens, ...newTokens } : chain.tokens,
  };

  BY_CHAIN_ID.set(chainId, updatedChain);
  BY_SLUG.set(`${updatedChain.slug}:${updatedChain.networkType}`, updatedChain);

  const index = CHAIN_REGISTRY.findIndex(c => c.chainId === chainId);
  if (index !== -1) {
    CHAIN_REGISTRY[index] = updatedChain;
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('dynamic_assets_registered', { detail: { chainId } }));
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
        if (
          Array.isArray(tokens.assets) &&
          (chain.chainId === 'pubnet' || chain.chainId === 'testnet')
        ) {
          dynamicAssets = tokens.assets.map((asset: any) => ({
            asset: `${asset.code}-${asset.issuer}`,
            type: 'STELLAR',
            address: asset.issuer,
            name: asset.name || asset.code,
            symbol: asset.code,
            decimals: asset.decimals,
            logoURI: asset.icon,
            domain: asset.domain,
          }));

          const hasNative = dynamicAssets.some(
            a => a.symbol.toUpperCase() === chain.nativeCurrency.symbol.toUpperCase()
          );
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
