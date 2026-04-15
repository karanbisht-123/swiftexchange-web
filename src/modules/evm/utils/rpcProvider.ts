import { ethers } from 'ethers';

// Patterns that indicate a permanent infra-level failure (CORS / network unreachable).
// ethers.js wraps the raw browser error, so we must match BOTH the raw message
// (e.g. "Failed to fetch") AND the ethers re-throw (e.g. "NETWORK_ERROR",
// "could not detect network", "missing provider").
const PERMANENT_ERROR_PATTERNS = [
  'cors',
  'cross-origin',
  'access-control',
  'failed to fetch',       // Chrome/Firefox raw fetch rejection
  'load failed',           // Safari raw fetch rejection
  'network request failed',
  'networkerror',          // Firefox
  'net::err',              // Chrome devtools message leaking through
  'could not detect network', // ethers wraps CORS as this
  'network_error',         // ethers error code
  'timeout',               // treat node timeouts as permanent for this URL
];

function isPermanentError(error: any): boolean {
  const msg = (error?.message || String(error)).toLowerCase();
  const code = (error?.code || '').toLowerCase();
  return (
    PERMANENT_ERROR_PATTERNS.some(p => msg.includes(p)) ||
    code === 'network_error' ||
    code === 'timeout'
  );
}

class RPCManager {
  private roundRobinIndexByChain: Map<number, number> = new Map();
  private providerCache: Map<string, ethers.JsonRpcProvider> = new Map();
  private permanentlyFailedUrls: Set<string> = new Set();

  private getProvider(url: string): ethers.JsonRpcProvider {
    if (!this.providerCache.has(url)) {
      const req = new ethers.FetchRequest(url);
      req.retryFunc = async () => false; // no internal retries
      const provider = new ethers.JsonRpcProvider(req, undefined, { staticNetwork: true });
      // ← critical: disable ethers' automatic block-polling so cached providers
      //   never fire background requests to a CORS-blocked endpoint.
      provider.pollingInterval = 99_999_999;
      this.providerCache.set(url, provider);
    }
    return this.providerCache.get(url)!;
  }

  private evict(url: string): void {
    const p = this.providerCache.get(url);
    if (p) {
      try { p.destroy(); } catch { /* ignore */ }
      this.providerCache.delete(url);
    }
  }

  /** Returns true if every URL for a chain is permanently dead. */
  isChainDead(_chainId: number, urls: string[]): boolean {
    const unique = Array.from(new Set(urls.filter(Boolean)));
    return unique.length > 0 && unique.every(u => this.permanentlyFailedUrls.has(u));
  }

  clearFailedUrl(url: string) {
    this.permanentlyFailedUrls.delete(url);
    this.evict(url);
  }

  async fetchWithFallback<T>(
    chainId: number,
    urls: string[],
    action: (provider: ethers.JsonRpcProvider) => Promise<T>
  ): Promise<T> {
    if (!urls?.length) {
      throw new Error(`No RPC URLs provided for chain ${chainId}`);
    }

    const uniqueUrls = Array.from(new Set(urls.filter(Boolean)));
    const viableUrls = uniqueUrls.filter(url => !this.permanentlyFailedUrls.has(url));

    if (viableUrls.length === 0) {
      throw new Error(
        `All RPCs permanently failed for chain ${chainId}. ` +
          `Dead URLs: ${[...this.permanentlyFailedUrls].join(', ')}`
      );
    }

    const startIndex = this.roundRobinIndexByChain.get(chainId) ?? 0;
    let lastError: any;
    let skipped = 0;

    while (skipped < viableUrls.length) {
      const index = (startIndex + skipped) % viableUrls.length;
      const url = viableUrls[index];
      skipped++;
      this.roundRobinIndexByChain.set(chainId, (index + 1) % viableUrls.length);

      try {
        const provider = this.getProvider(url);

        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout after 8s on ${url}`)), 8000)
        );

        const result = await Promise.race([action(provider), timeoutPromise]);

        return result;
      } catch (error: any) {
        lastError = error;

        if (isPermanentError(error)) {
          console.warn(`[RPCManager] Permanent failure (CORS/network) — blacklisting ${url}:`, error?.message);
          this.permanentlyFailedUrls.add(url);
          this.evict(url); // destroy provider to kill its polling loop
        } else {
          console.warn(`[RPCManager] Transient failure on ${url} — trying next RPC`);
        }
      }
    }

    throw new Error(
      `All ${viableUrls.length} RPCs failed for chain ${chainId}. ` +
        `Last error: ${lastError?.message}`
    );
  }
}

export const rpcManager = new RPCManager();
