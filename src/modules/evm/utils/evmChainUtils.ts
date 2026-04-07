import { getChainById } from './Chainregistry';

/**
 * Utility to switch the Ethereum chain in the wallet, or add it if not present.
 * @param provider The EVM provider (usually from getProvider or window.ethereum)
 * @param chainId The numeric chain ID to switch to
 */
export async function switchOrAddChain(provider: any, chainId: number): Promise<void> {
  if (!provider) {
    throw new Error('No EVM provider found');
  }

  const targetChain = getChainById(chainId);
  if (!targetChain) {
    throw new Error(`Chain config not found for chainId: ${chainId}`);
  }

  const hexChainId = `0x${chainId.toString(16)}`;

  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: hexChainId }],
    });
  } catch (error: any) {
    // Error code 4902 means the chain has not been added to the wallet
    if (error.code === 4902) {
      try {
        await provider.request({
          method: 'wallet_addEthereumChain',
          params: [
            {
              chainId: hexChainId,
              chainName: targetChain.name,
              nativeCurrency: targetChain.nativeCurrency,
              rpcUrls: [targetChain.rpcUrl, ...(targetChain.fallbackRpcUrls || [])],
              blockExplorerUrls: [targetChain.blockExplorerUrl],
            },
          ],
        });
      } catch (addError: any) {
        throw new Error(`Failed to add network: ${addError.message}`);
      }
    } else if (error.code !== 4001) {
      // 4001 is User Rejected Request, no need to throw an error for that
      throw new Error(`Failed to switch network: ${error.message}`);
    }
  }
}
