import { ethers } from 'ethers';

class RPCManager {
    private workingIndexByChain: Map<number, number> = new Map();
    private providerCache: Map<string, ethers.JsonRpcProvider> = new Map();
    private penaltyBox: Map<string, number> = new Map();

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

        const now = Date.now();
        let targetUrls = uniqueUrls.filter(url => (this.penaltyBox.get(url) || 0) < now);

        let currentIndex = this.workingIndexByChain.get(chainId) || 0;
        if (currentIndex >= uniqueUrls.length) currentIndex = 0;

        if (targetUrls.length === 0) {
            targetUrls = [uniqueUrls[currentIndex]];
            currentIndex = 0;
        } else {
            const preferredUrl = uniqueUrls[currentIndex];
            currentIndex = targetUrls.includes(preferredUrl) ? targetUrls.indexOf(preferredUrl) : 0;
        }

        let lastError: any;

        for (let attempts = 0; attempts < targetUrls.length; attempts++) {
            const index = (currentIndex + attempts) % targetUrls.length;
            const url = targetUrls[index];

            try {
                const provider = this.getProvider(url);
                const result = await action(provider);

                this.workingIndexByChain.set(chainId, uniqueUrls.indexOf(url));
                this.penaltyBox.delete(url);

                return result;
            } catch (error: any) {
                console.warn(`[RPCManager] Call failed on ${url} for chain ${chainId}:`, error?.message || error);
                lastError = error;
                this.penaltyBox.set(url, Date.now() + 30000);
            }
        }

        throw new Error(`All ${uniqueUrls.length} RPCs failed for chain ${chainId}. Last error: ${lastError?.message}`);
    }
}

export const rpcManager = new RPCManager();
