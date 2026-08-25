import { useGlobalTxStore } from '../modules/walletconnect/store/globalTxStore';
import { sendCustomNotification } from '../service/notificationService';

export function getRequestExpiry(minutes = 2): number {
  return Math.floor(Date.now() / 1000) + minutes * 60;
}

function isWalletConnectProvider(provider: any): boolean {
  return !!(provider?.client && provider?.session && typeof provider.client.request === 'function');
}

/**
 * Attempts to respond to a pending WalletConnect session request with an error.
 * NOTE: This works for session-level requests routed through the WC relay.
 * For in-flight signing requests already shown inside a mobile wallet app (e.g. Trust Wallet),
 * the user must manually reject inside the wallet — this is a wallet security constraint.
 */
export async function rejectPendingWCRequest(
  provider: any,
  id: number,
  topic: string
): Promise<void> {
  if (!isWalletConnectProvider(provider)) return;
  try {
    await provider.client.respond({
      topic,
      response: {
        id,
        jsonrpc: '2.0',
        error: { code: 5000, message: 'User rejected the request' },
      },
    });
  } catch {
    // Silently ignore — the request may already be resolved on the relay side
  }
}

export async function notifyWalletSignRequest(to?: string): Promise<void> {
  const token = localStorage.getItem('device_token');
  if (!token) return;

  await sendCustomNotification(token, {
    title: 'Wallet Signature Required',
    body: `Open your wallet to sign the EVM transaction${to ? ` to ${to}` : ''}.`,
  }).catch(console.error);
}

export async function sendEVMTransaction(
  provider: any,
  chainId: number | string,
  txParams: Record<string, any>
): Promise<string> {
  const store = useGlobalTxStore.getState();

  // Use isLocked() which also auto-expires stale requests older than 90s
  if (store.isLocked()) {
    throw new Error('WALLET_PENDING');
  }

  const numericChainId = Number(chainId);

  if (isWalletConnectProvider(provider)) {
    const topic = provider.session?.topic;
    if (!topic) throw new Error('No WalletConnect session topic');

    const requestId = Date.now() * 1000 + Math.floor(Math.random() * 1000);
    store.setPending({ id: requestId, topic, type: 'send' });

    try {
      await notifyWalletSignRequest(txParams.to);
      const result = await provider.client.request({
        topic,
        chainId: `eip155:${numericChainId}`,
        request: {
          id: requestId,
          method: 'eth_sendTransaction',
          params: [txParams],
        },
      });

      if (typeof result === 'string') return result;
      if (result && typeof result === 'object' && result.hash) return result.hash;

      throw new Error('Transaction succeeded but wallet did not return a transaction hash');
    } finally {
      // Only clear if WE are still the owner of the pending slot
      if (useGlobalTxStore.getState().pendingRequest?.id === requestId) {
        useGlobalTxStore.getState().clearPending();
      }
    }
  }

  // ── Injected wallet fallback (MetaMask extension, Rabby, etc.) ──────────────
  const fallbackId = Date.now();
  useGlobalTxStore.getState().setPending({ id: fallbackId, topic: 'injected', type: 'send' });
  try {
    await notifyWalletSignRequest(txParams.to);
    const result = await provider.request({
      method: 'eth_sendTransaction',
      params: [txParams],
    });

    if (typeof result === 'string') return result;
    if (result && typeof result === 'object' && result.hash) return result.hash;

    throw new Error('Transaction succeeded but wallet did not return a transaction hash');
  } finally {
    if (useGlobalTxStore.getState().pendingRequest?.id === fallbackId) {
      useGlobalTxStore.getState().clearPending();
    }
  }
}
