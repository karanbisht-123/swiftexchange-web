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
  const numChainId = typeof chainId === 'string' && chainId.startsWith('0x') ? parseInt(chainId, 16) : Number(chainId);

  if (typeof provider.setDefaultChain === 'function') {
    try {
      provider.setDefaultChain(`eip155:${numChainId}`, targetChain.rpcUrl);
      // For WalletConnect, setDefaultChain is often enough
      return;
    } catch (e) {
      console.warn('[switchOrAddChain] Failed to setDefaultChain on UniversalProvider', e);
    }
  }

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
    } else {
      throw error;
    }
  }
}
