import { getChainById, isEvmChain } from './Chainregistry';

/**
 * Parses a chain ID from the raw value returned by `eth_chainId`.
 *
 * The EIP-1193 spec mandates a hex string (e.g. "0x89" for Polygon 137),
 * but some wallets — especially WalletConnect-based ones — return a plain
 * decimal string ("137"). Blindly calling `parseInt(value, 16)` on "137"
 * gives 311 (treating it as hexadecimal), which causes spurious chain-switch
 * failures. This helper handles both formats safely.
 */
export function parseRawChainId(raw: string | number): number {
  if (typeof raw === 'number') return raw;
  const s = String(raw).trim();
  if (s.startsWith('0x') || s.startsWith('0X')) return parseInt(s, 16);
  const n = parseInt(s, 10);
  return isNaN(n) ? 0 : n;
}

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

  const numChainId =
    typeof chainId === 'string' && chainId.startsWith('0x')
      ? parseInt(chainId, 16)
      : Number(chainId);
  const hexChainId = `0x${numChainId.toString(16)}`;

  // WalletConnect UniversalProvider exposes setDefaultChain to switch the
  // active chain. We call it but do NOT return early — we also send
  // wallet_switchEthereumChain so the wallet's UI reflects the switch and
  // subsequent RPC calls are routed to the correct chain.
  if (typeof provider.setDefaultChain === 'function') {
    try {
      provider.setDefaultChain(`eip155:${numChainId}`, targetChain.rpcUrl);
    } catch (e) {
      console.warn('[switchOrAddChain] setDefaultChain failed (non-fatal):', e);
    }
  }

  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: hexChainId }],
    });
  } catch (error: any) {
    if (error.code === 4902) {
      // Chain not added to the wallet — add it first
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
    } else if (
      // WalletConnect sometimes throws when calling wallet_switchEthereumChain
      // even though setDefaultChain already handled the switch. Treat these
      // as non-fatal so we still proceed to signing.
      error.code === -32601 || // method not found
      error.code === -32603 || // generic internal error
      /method.*not.*found|not.*supported/i.test(error.message ?? '')
    ) {
      console.warn(
        '[switchOrAddChain] wallet_switchEthereumChain not supported by this provider (likely WalletConnect). ' +
          'Proceeding — setDefaultChain was already called.'
      );
    } else {
      throw error;
    }
  }
}
