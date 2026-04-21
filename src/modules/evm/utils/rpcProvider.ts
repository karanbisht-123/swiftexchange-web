import { ethers } from 'ethers';

const PERMANENT_ERROR_PATTERNS = [
  'cors',
  'cross-origin',
  'access-control',
  'failed to fetch',
  'load failed',
  'network request failed',
  'networkerror',
  'net::err',
  'could not detect network',
  'network_error',
  'timeout',
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
  private failedUrls: Map<string, number> = new Map();
  private readonly COOLDOWN_MS = 6000;

  private getProvider(url: string): ethers.JsonRpcProvider {
    if (!this.providerCache.has(url)) {
      const req = new ethers.FetchRequest(url);
      req.retryFunc = async () => false;
      const provider = new ethers.JsonRpcProvider(req, undefined, { staticNetwork: true });
      provider.pollingInterval = 99_999_999;
      this.providerCache.set(url, provider);
    }
    return this.providerCache.get(url)!;
  }

  private evict(url: string): void {
    const p = this.providerCache.get(url);
    if (p) {
      try { p.destroy(); } catch { }
      this.providerCache.delete(url);
    }
  }

  private isUrlFailed(url: string): boolean {
    const ts = this.failedUrls.get(url);
    if (ts === undefined) return false;
    if (Date.now() - ts > this.COOLDOWN_MS) {
      this.failedUrls.delete(url);
      return false;
    }
    return true;
  }

  private markFailed(url: string): void {
    this.failedUrls.set(url, Date.now());
    this.evict(url);
  }

  isChainDead(_chainId: number, urls: string[]): boolean {
    const unique = Array.from(new Set(urls.filter(Boolean)));
    return unique.length > 0 && unique.every(u => this.isUrlFailed(u));
  }

  clearFailedUrl(url: string) {
    this.failedUrls.delete(url);
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
    const viableUrls = uniqueUrls.filter(url => !this.isUrlFailed(url));

    if (viableUrls.length === 0) {
      throw new Error(
        `All RPCs temporarily unavailable for chain ${chainId}. ` +
        `Please wait a few seconds and try again.`
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
          this.markFailed(url);
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