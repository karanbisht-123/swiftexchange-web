import { ethers } from 'ethers';

const PERMANENT_ERROR_PATTERNS = [
    'cors',
    'cross-origin',
    'access-control',
    'failed to fetch',
    'network request failed',
    'load failed',
];

function isPermanentError(error: any): boolean {
    const msg = (error?.message || String(error)).toLowerCase();
    return PERMANENT_ERROR_PATTERNS.some(pattern => msg.includes(pattern));
}

class RPCManager {

    private roundRobinIndexByChain: Map<number, number> = new Map();
    private providerCache: Map<string, ethers.JsonRpcProvider> = new Map();
    private permanentlyFailedUrls: Set<string> = new Set();

    private getProvider(url: string): ethers.JsonRpcProvider {
        if (!this.providerCache.has(url)) {
            const req = new ethers.FetchRequest(url);
            req.retryFunc = async () => false;
            this.providerCache.set(
                url,
                new ethers.JsonRpcProvider(req, undefined, { staticNetwork: true })
            );
        }
        return this.providerCache.get(url)!;
    }

    clearFailedUrl(url: string) {
        this.permanentlyFailedUrls.delete(url);
        this.providerCache.delete(url);
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

                console.log(`[RPCManager] ✓ Success on ${url} (chain ${chainId})`);
                return result;

            } catch (error: any) {
                lastError = error;

                if (isPermanentError(error)) {
                    console.error(`[RPCManager] ✗ Permanent failure (CORS/network) — blacklisting ${url}`);
                    this.permanentlyFailedUrls.add(url);
                    this.providerCache.delete(url);
                } else {
                    console.warn(`[RPCManager] ✗ Transient failure on ${url} — jumping to next RPC`);
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
