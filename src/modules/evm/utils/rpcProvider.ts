import { ethers } from 'ethers';

class RPCManager {
    private workingIndexByChain: Map<number, number> = new Map();
    private providerCache: Map<string, ethers.JsonRpcProvider> = new Map();

    private getProvider(url: string): ethers.JsonRpcProvider {
        if (!this.providerCache.has(url)) {
            this.providerCache.set(url, new ethers.JsonRpcProvider(url, undefined, { staticNetwork: true }));
        }
        return this.providerCache.get(url)!;
    }
    async fetchWithFallback<T>(
        chainId: number,
        urls: string[],
        action: (provider: ethers.JsonRpcProvider) => Promise<T>
    ): Promise<T> {
        if (!urls || urls.length === 0) {
            throw new Error(`No RPC URLs provided for chain ${chainId}`);
        }

        const uniqueUrls = Array.from(new Set(urls.filter(Boolean)));
        if (uniqueUrls.length === 0) {
            throw new Error(`No valid RPC URLs provided for chain ${chainId}`);
        }

        let currentIndex = this.workingIndexByChain.get(chainId) || 0;
        if (currentIndex >= uniqueUrls.length) currentIndex = 0;

        let lastError: any;

        for (let attempts = 0; attempts < uniqueUrls.length; attempts++) {
            const index = (currentIndex + attempts) % uniqueUrls.length;
            const url = uniqueUrls[index];

            try {
                const provider = this.getProvider(url);
                const result = await action(provider);
                this.workingIndexByChain.set(chainId, index);
                return result;
            } catch (error: any) {
                console.warn(`[RPCManager] Call failed on ${url} for chain ${chainId}:`, error?.message || error);
                lastError = error;
            }
        }

        throw new Error(`All ${uniqueUrls.length} RPCs failed for chain ${chainId}. Last error: ${lastError?.message}`);
    }
}

export const rpcManager = new RPCManager();
