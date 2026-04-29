import { getChainById, isEvmChain } from './Chainregistry';

export async function switchOrAddChain(provider: any, chainId: number | string): Promise<void> {
  if (!provider) {
    throw new Error('No EVM provider found');
  }

  if (!isEvmChain(chainId)) {
    console.warn(`[switchOrAddChain] Skipping chain switch for non-EVM chain: ${chainId}`);
    return;
  }

  const targetChain = getChainById(chainId);
  if (!targetChain) {
    throw new Error(`Chain config not found for chainId: ${chainId}`);
  }

  const hexChainId = typeof chainId === 'number' ? `0x${chainId.toString(16)}` : chainId;

  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: hexChainId }],
    });
  } catch (error: any) {
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
      throw new Error(`Failed to switch network: ${error.message}`);
    }
  }
}
