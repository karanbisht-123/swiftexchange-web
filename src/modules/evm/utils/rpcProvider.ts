import { JsonRpcProvider, ethers } from 'ethers';

import { RPC_URLS } from './assetmanagement/constants';

const RPC_CONFIG: Record<number, { name: string; rpcs: string[] }> = {
  1: { name: 'ethereum', rpcs: RPC_URLS.ETH },
  42161: { name: 'arbitrum', rpcs: RPC_URLS.ARB },
  137: { name: 'polygon', rpcs: RPC_URLS.POL },
  10: { name: 'optimism', rpcs: RPC_URLS.OPT },
  43114: { name: 'avalanche', rpcs: RPC_URLS.AVAX },
  8453: { name: 'base', rpcs: RPC_URLS.BASE },
  56: { name: 'bsc', rpcs: RPC_URLS.BNB },
  // Testnets
  11155111: { name: 'sepolia', rpcs: RPC_URLS.SEPOLIA },
  97: { name: 'bsc_testnet', rpcs: RPC_URLS.BSC_TESTNET },
  80002: { name: 'amoy', rpcs: RPC_URLS.AMOY },
};

class RPCManager {
  private providerCache: Map<number, JsonRpcProvider[]> = new Map();

  getProviders(chainId: number): JsonRpcProvider[] {
    if (this.providerCache.has(chainId)) {
      return this.providerCache.get(chainId)!;
    }

    const config = RPC_CONFIG[chainId];
    if (!config) {
      throw new Error(`Unsupported chain ID: ${chainId}`);
    }

    // Filter out known CORS-failing RPCs
    const filteredUrls = config.rpcs.filter(url => !url.includes('nodies.app'));
    if (filteredUrls.length === 0) {
      throw new Error(`No available RPC URLs for chain ID: ${chainId}`);
    }

    const providers = filteredUrls.map(url => {
      const req = new ethers.FetchRequest(url);
      // Disable internal fetch retries so we can jump to the next RPC faster
      req.retryFunc = async () => false;

      const provider = new JsonRpcProvider(req, chainId, { staticNetwork: true });
      provider.pollingInterval = 99_999_999;
      return provider;
    });

    this.providerCache.set(chainId, providers);
    return providers;
  }

  async fetchWithFallback<T>(
    chainId: number | string,
    _urls: string[] | undefined,
    action: (provider: ethers.AbstractProvider) => Promise<T>
  ): Promise<T> {
    const numChainId = Number(chainId);
    const config = RPC_CONFIG[numChainId];
    if (!config) throw new Error(`Unsupported chain ID: ${chainId}`);

    const providers = this.getProviders(numChainId);

    // Faster timeout for L2s, default 1000 for L1
    const stallTimeout = [42161, 10, 8453, 137, 43114].includes(numChainId) ? 700 : 1000;

    return new Promise<T>((resolve, reject) => {
      let resolved = false;
      let currentIndex = 0;
      let activePromises = 0;

      const tryNext = () => {
        if (resolved) return;

        // If we ran out of providers and none are actively pending, we fail completely.
        if (currentIndex >= providers.length) {
          if (activePromises === 0) {
            console.warn(`[RPC Error] All RPCs failed for ${config.name}`);
            reject(new Error(`Network issue on ${config.name}, please try again`));
          }
          return;
        }

        const provider = providers[currentIndex];
        const url = provider._getConnection().url;
        currentIndex++;
        activePromises++;

        let nextTimeout: any;

        // If this provider takes too long, start the next one in parallel (Racing)
        if (currentIndex < providers.length) {
          nextTimeout = setTimeout(() => {
            if (!resolved) {
              console.warn(`[RPC Stall] ${url} took longer than ${stallTimeout}ms, trying next...`);
              tryNext();
            }
          }, stallTimeout);
        }

        Promise.resolve()
          .then(() => action(provider))
          .then(res => {
            if (resolved) return;
            resolved = true;
            clearTimeout(nextTimeout);
            resolve(res);
          })
          .catch((error: any) => {
            activePromises--;
            clearTimeout(nextTimeout);

            const msg = (error?.message || String(error)).toLowerCase();
            const code = (error?.code || '').toUpperCase();

            // If it's a legitimate execution revert on-chain, we should NOT retry on other RPCs.
            // We immediately throw it so the app can show "Insufficient funds" etc.
            if (
              code === 'CALL_EXCEPTION' ||
              code === 'INSUFFICIENT_FUNDS' ||
              msg.includes('execution reverted') ||
              msg.includes('insufficient funds') ||
              msg.includes('gas required exceeds allowance')
            ) {
              if (!resolved) {
                resolved = true;
                reject(error);
              }
              return;
            }

            console.warn(`[RPC Failure] Failed on ${url}: ${msg}`);

            // If network failed instantly, trigger the next provider immediately
            if (!resolved) {
              tryNext();
            }
          });
      };
      tryNext();
    });
  }

  resetChain(chainId: number | string): void {
    this.providerCache.delete(Number(chainId));
  }
}

export const rpcManager = new RPCManager();
