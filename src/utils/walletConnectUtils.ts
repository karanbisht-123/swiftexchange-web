import { WALLET_METADATA_MAP } from '../modules/walletconnect/constants/Wallet';
import { useGlobalTxStore } from '../modules/walletconnect/store/globalTxStore';
import { sendCustomNotification } from '../service/notificationService';

export function isMobileDevice(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  const isIPadOS =
    typeof navigator.platform === 'string' &&
    navigator.platform === 'MacIntel' &&
    (navigator.maxTouchPoints || 0) > 1;
  return isMobileUA || isIPadOS;
}

export function isInAppBrowser(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /Trust|MetaMask|Keplr|Freighter|LOBSTR|CoinbaseWallet|TokenPocket|Rainbow/i.test(ua);
}

/**
 * Returns formatted Universal Link or Native Deep Link for a given wallet ID and WC pairing URI.
 */
export function formatWalletDeepLink(
  walletId: string,
  uri: string,
  preferUniversal = true
): string {
  if (!uri) return '';

  const meta = WALLET_METADATA_MAP[walletId];
  if (!meta || !meta.redirects) {
    return uri;
  }

  const { native, universal } = meta.redirects;
  const encodedUri = encodeURIComponent(uri);

  if (preferUniversal && universal) {
    const separator = universal.includes('?')
      ? '&'
      : universal.endsWith('/wc') || universal.endsWith('/')
        ? '?'
        : '/wc?';
    return `${universal}${separator}uri=${encodedUri}`;
  }

  if (native) {
    const separator = native.endsWith('://') ? '' : native.endsWith('/') ? '' : '/';
    return `${native}${separator}wc?uri=${encodedUri}`;
  }

  if (universal) {
    const separator = universal.includes('?')
      ? '&'
      : universal.endsWith('/wc') || universal.endsWith('/')
        ? '?'
        : '/wc?';
    return `${universal}${separator}uri=${encodedUri}`;
  }

  return uri;
}

/**
 * Returns both universal and native formatted links for the wallet.
 */
export function getWalletRedirectUrls(
  walletId: string,
  uri: string
): { universal?: string; native?: string; formattedUrl: string } {
  if (!uri) return { formattedUrl: '' };

  const meta = WALLET_METADATA_MAP[walletId];
  const encodedUri = encodeURIComponent(uri);

  let universalUrl: string | undefined;
  let nativeUrl: string | undefined;

  if (meta?.redirects?.universal) {
    const u = meta.redirects.universal;
    const separator = u.includes('?') ? '&' : u.endsWith('/wc') || u.endsWith('/') ? '?' : '/wc?';
    universalUrl = `${u}${separator}uri=${encodedUri}`;
  }

  if (meta?.redirects?.native) {
    const n = meta.redirects.native;
    const separator = n.endsWith('://') ? '' : n.endsWith('/') ? '' : '/';
    nativeUrl = `${n}${separator}wc?uri=${encodedUri}`;
  }

  const isIOS =
    typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent || '');
  const formattedUrl = isIOS ? universalUrl || nativeUrl || uri : universalUrl || nativeUrl || uri;

  return {
    universal: universalUrl,
    native: nativeUrl,
    formattedUrl,
  };
}

/**
 * Directly navigates to the mobile wallet using universal link / deep link.
 * Direct synchronous navigation avoids iOS Safari popup/redirect blocking.
 */
export function openMobileWallet(walletId: string, uri: string): void {
  if (!isMobileDevice() || isInAppBrowser()) return;

  const { formattedUrl } = getWalletRedirectUrls(walletId, uri);
  if (!formattedUrl) return;

  try {
    window.location.href = formattedUrl;
  } catch (err) {
    console.warn('[WalletService] Failed to open mobile wallet:', err);
  }
}

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
