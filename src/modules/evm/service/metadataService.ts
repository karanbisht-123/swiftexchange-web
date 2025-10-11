import { type NetworkKey } from '../../../config/swapConfigs';
import {
  CACHE_TTL,
  COINGECKO_BASE,
  PLATFORM_MAP,
  TESTNET_METADATA,
  isTestnetNetwork,
} from '../../../constants/assetConstants';
import type { CachedMetadata, TokenMetadata } from '../../../types/evm/swap.types';

export class MetadataService {
  private static cache = new Map<string, CachedMetadata>();

  private static getCacheKey(networkKey: NetworkKey, address: string): string {
    return `asset_metadata_${networkKey}_${address.toLowerCase()}`;
  }

  public static getCachedMetadata(networkKey: NetworkKey, address: string): TokenMetadata | null {
    try {
      const key = this.getCacheKey(networkKey, address);
      const cached = this.cache.get(key);

      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.data;
      }
      this.cache.delete(key);
    } catch (error) {
      console.warn(`Failed to get cached metadata for ${address}:`, error);
    }
    return null;
  }

  public static setCachedMetadata(
    networkKey: NetworkKey,
    address: string,
    metadata: TokenMetadata
  ): void {
    try {
      const key = this.getCacheKey(networkKey, address);
      this.cache.set(key, { data: metadata, timestamp: Date.now() });
    } catch (error) {
      console.warn(`Failed to cache metadata for ${address}:`, error);
    }
  }

  public static async fetchTokenMetadata(
    networkKey: NetworkKey,
    address: string
  ): Promise<TokenMetadata> {
    const cached = this.getCachedMetadata(networkKey, address);
    if (cached) {
      return cached;
    }

    const normalizedAddress = address.toLowerCase();
    if (isTestnetNetwork(networkKey)) {
      const testnetMeta = TESTNET_METADATA[networkKey]?.[normalizedAddress];
      if (testnetMeta) {
        this.setCachedMetadata(networkKey, address, testnetMeta);
        return testnetMeta;
      }
      return {
        name: 'Unknown Token',
        code: 'UNK',
        decimals: 18,
        logoUri: null,
      };
    }

    const platform = PLATFORM_MAP[networkKey];
    if (!platform) {
      throw new Error(`Unsupported network: ${networkKey}`);
    }

    try {
      const response = await fetch(`${COINGECKO_BASE}/coins/${platform}/contract/${address}`, {
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`CoinGecko API error: ${response.status}`);
      }

      const data = await response.json();
      const metadata: TokenMetadata = {
        name: data.name || 'Unknown Token',
        code: data.symbol?.toUpperCase() || 'UNK',
        decimals: data.detail_platforms?.[platform]?.decimals || 18,
        logoUri: data.image?.small || null,
      };

      this.setCachedMetadata(networkKey, address, metadata);
      return metadata;
    } catch (error) {
      console.error(`Failed to fetch metadata for ${address} on ${networkKey}:`, error);
      return {
        name: 'Unknown Token',
        code: 'UNK',
        decimals: 18,
        logoUri: null,
      };
    }
  }

  public static clearCache(networkKey?: NetworkKey): void {
    try {
      if (networkKey) {
        const keysToDelete: string[] = [];
        for (const key of this.cache.keys()) {
          if (key.startsWith(`asset_metadata_${networkKey}_`)) {
            keysToDelete.push(key);
          }
        }
        keysToDelete.forEach(key => this.cache.delete(key));
      } else {
        this.cache.clear();
      }
    } catch (error) {
      console.warn('Failed to clear metadata cache:', error);
    }
  }
}
