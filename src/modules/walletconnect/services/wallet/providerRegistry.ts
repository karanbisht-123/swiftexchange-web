import { Core } from '@walletconnect/core';
import UniversalProviderType from '@walletconnect/universal-provider';

import { WALLETCONNECT_METADATA, WALLETCONNECT_PROJECT_ID } from '../../config/chains';
import { extractErrorMessage, isUserRejection } from '../../utils/walletErrorHandler';
import type { WalletServiceContext, WalletType } from './types';

// ---------------------------------------------------------------------------
// EIP-6963 rdns → walletId mapping
// ---------------------------------------------------------------------------

const EIP6963_RDNS_MAP: Record<string, string[]> = {
  metamask: ['io.metamask'],
  trust: ['com.trustwallet.app'],
  phantom: ['app.phantom'],
  rabby: ['io.rabby'],
  coinbase: ['com.coinbase.wallet'],
  rainbow: ['me.rainbow'],
};

// Reverse map: rdns → walletId
const RDNS_TO_WALLET_ID: Record<string, string> = {};
for (const [walletId, rdnsList] of Object.entries(EIP6963_RDNS_MAP)) {
  for (const rdns of rdnsList) {
    RDNS_TO_WALLET_ID[rdns] = walletId;
  }
}

// ---------------------------------------------------------------------------
// EIP-6963 listener setup
// ---------------------------------------------------------------------------

export function setupEIP6963Listener(ctx: WalletServiceContext): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('eip6963:announceProvider', (event: any) => {
    const detail = event.detail;
    console.log('eip6963:announceProvider', detail);
    if (detail?.info?.rdns && detail.provider) {
      ctx.eip6963Providers.set(detail.info.rdns, detail.provider);
    }
  });
  window.dispatchEvent(new Event('eip6963:requestProvider'));
}

export async function resolveEvmProvider(
  ctx: WalletServiceContext,
  walletId: string
): Promise<any | null> {
  const win = window as any;

  // re-dispatch EIP-6963 discovery and wait briefly for late injectors
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('eip6963:requestProvider'));
    await new Promise(r => setTimeout(r, 50));
  }

  // Check EIP-6963 first
  if (walletId in EIP6963_RDNS_MAP) {
    for (const rdns of EIP6963_RDNS_MAP[walletId]) {
      if (ctx.eip6963Providers.has(rdns)) {
        return ctx.eip6963Providers.get(rdns);
      }
    }
  }

  // EIP-5749: window.ethereum.providers[] multi-injection array
  const injectedProviders: any[] | undefined = win.ethereum?.providers;
  if (Array.isArray(injectedProviders)) {
    const found = findInProvidersArray(injectedProviders, walletId);
    if (found) return found;
  }

  // dedicated globals exposed outside window.ethereum
  switch (walletId) {
    case 'trust':
      if (win.trustwallet) return win.trustwallet;
      break;
    case 'phantom':
      if (win.phantom?.ethereum) return win.phantom.ethereum;
      break;
  }

  //single-injection flags (only when providers[] isn't present)

  if (!Array.isArray(injectedProviders) && win.ethereum) {
    switch (walletId) {
      case 'metamask':
        if (
          win.ethereum.isMetaMask &&
          !win.ethereum.isTrust &&
          !win.ethereum.isRabby &&
          !win.ethereum.isPhantom
        )
          return win.ethereum;
        break;
      case 'trust':
        if (win.ethereum.isTrust || win.ethereum.isTrustWallet) return win.ethereum;
        break;
      case 'coinbase':
        if (win.ethereum.isCoinbaseWallet) return win.ethereum;
        break;
      case 'rabby':
        if (win.ethereum.isRabby) return win.ethereum;
        break;
      case 'rainbow':
        if (win.ethereum.isRainbow) return win.ethereum;
        break;
      case 'phantom':
        if (win.ethereum.isPhantom) return win.ethereum;
        break;
    }
  }

  return null;
}

/**
 * Scans the EIP-5749 providers[] array with spoofer-aware flag checks.
  */
function findInProvidersArray(providers: any[], walletId: string): any | null {
  switch (walletId) {
    case 'metamask':
      return (
        providers.find(
          p => p.isMetaMask && !p.isTrust && !p.isTrustWallet && !p.isRabby && !p.isPhantom
        ) ?? null
      );
    case 'trust':
      return providers.find(p => p.isTrust || p.isTrustWallet) ?? null;
    case 'coinbase':
      return providers.find(p => p.isCoinbaseWallet) ?? null;
    case 'rabby':
      return providers.find(p => p.isRabby) ?? null;
    case 'rainbow':
      return providers.find(p => p.isRainbow) ?? null;
    case 'phantom':
      return providers.find(p => p.isPhantom) ?? null;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// isExtensionInstalled / getInstalledWallets
// ---------------------------------------------------------------------------

export function isExtensionInstalled(ctx: WalletServiceContext, walletId: string): boolean {
  if (walletId === 'walletconnect' || walletId === 'swiftex') return false;
  const win = window as any;

  // Check EIP-6963 synchronously
  if (walletId in EIP6963_RDNS_MAP) {
    if (EIP6963_RDNS_MAP[walletId].some(rdns => ctx.eip6963Providers.has(rdns))) return true;
  }

  // Stellar wallets
  if (walletId === 'freighter') return !!(win.freighterApi || win.freighter);
  if (walletId === 'lobstr') return !!win.lobstr;

  // EVM flags
  const win_ = win;
  switch (walletId) {
    case 'metamask':
      return !!win_.ethereum?.isMetaMask;
    case 'trust':
      return !!(win_.trustwallet || win_.ethereum?.isTrust || win_.ethereum?.isTrustWallet);
    case 'coinbase':
      return !!win_.ethereum?.isCoinbaseWallet;
    case 'phantom':
      return !!(win_.phantom?.ethereum || win_.ethereum?.isPhantom);
    case 'rabby':
      return !!win_.ethereum?.isRabby;
    case 'rainbow':
      return !!win_.ethereum?.isRainbow;
  }
  return false;
}

export function getInstalledWallets(ctx: WalletServiceContext): string[] {
  const win = window as any;
  const installed = new Set<string>();

  // EIP-6963 discovered wallets (authoritative)
  for (const [rdns] of ctx.eip6963Providers.entries()) {
    const walletId = RDNS_TO_WALLET_ID[rdns];
    if (walletId) installed.add(walletId);
  }

  if (win.ethereum?.isMetaMask) installed.add('metamask');
  if (win.ethereum?.isTrust || win.trustwallet) installed.add('trust');
  if (win.ethereum?.isCoinbaseWallet) installed.add('coinbase');
  if (win.phantom?.ethereum || win.ethereum?.isPhantom) installed.add('phantom');
  if (win.ethereum?.isRabby) installed.add('rabby');
  if (win.ethereum?.isRainbow) installed.add('rainbow');
  if (win.freighter || win.freighterApi) installed.add('freighter');
  if (win.lobstr) installed.add('lobstr');
  if (win.ethereum?.isSwiftEx || win.swiftex) installed.add('swiftex');

  return Array.from(installed);
}

// ---------------------------------------------------------------------------
// WalletConnect Universal Provider creation / caching
// ---------------------------------------------------------------------------

async function loadUniversalProvider(): Promise<typeof UniversalProviderType> {
  return UniversalProviderType;
}

export async function getOrCreateProvider(ctx: WalletServiceContext, key: string): Promise<any> {
  const debugProviderId = crypto.randomUUID();
  console.log('[WC] PROVIDER INIT', { key, providerInstanceId: debugProviderId });

  const existing = ctx.providers.get(key);
  if (existing && (existing as any).__providerKey === key) {
    if (existing.session) {
      const expiry = existing.session?.expiry ?? 0;
      const isExpired = Date.now() / 1000 > expiry;
      if (isExpired) {
        console.warn(
          `[WalletService] Provider '${key}' session is expired — evicting stale provider from cache`
        );
        try {
          existing.removeAllListeners?.();
          await existing.disconnect();
        } catch (err) {
          console.error('[WalletService] Error disconnecting expired provider:', err);
        }
        for (const [k, p] of ctx.providers.entries()) {
          if (p === existing) ctx.providers.delete(k);
        }
      } else {
        return existing;
      }
    } else {
      return existing;
    }
  }

  const ProviderClass = await loadUniversalProvider();

  const core = new Core({
    projectId: WALLETCONNECT_PROJECT_ID,
    customStoragePrefix: `swiftex_${key}`,
  });

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Provider init timeout')), 20000)
  );

  const provider = await Promise.race([
    ProviderClass.init({
      projectId: WALLETCONNECT_PROJECT_ID,
      metadata: {
        ...WALLETCONNECT_METADATA,
        name: `${WALLETCONNECT_METADATA.name} (${key})`,
      },
      core,
    }),
    timeoutPromise,
  ]);

  wrapProviderRequests(ctx, provider);

  console.log('[WC] provider created', debugProviderId);
  (provider as any).__debugProviderId = debugProviderId;
  (provider as any).__providerKey = key;

  ctx.providers.set(key, provider);
  return provider;
}

// ---------------------------------------------------------------------------
// Request wrapping (signing intercept + redirect + in-flight guard)
// ---------------------------------------------------------------------------

export function wrapProviderRequests(ctx: WalletServiceContext, provider: any): void {
  if (!provider) return;

  const wrapMethod = (target: any) => {
    if (!target || typeof target.request !== 'function' || target.request.__isWrapped) return;
    const originalRequest = target.request;

    target.request = async function (this: any, ...args: any[]) {
      const method = args[0]?.method;
      const SIGNING_METHODS = [
        'eth_sendTransaction',
        'eth_signTypedData_v4',
        'eth_signTypedData',
        'personal_sign',
        'stellar_signXDR',
        'stellar_signAndSubmitXDR',
      ];

      if (SIGNING_METHODS.includes(method)) {
        let signingType: WalletType = 'evm';
        if (method.startsWith('stellar_')) {
          signingType = 'stellar';
        } else {
          signingType = 'evm';
        }

        if (ctx.isSignRequestInFlight.get(signingType)) {
          const error = new Error(
            'A signing request is already in progress. Please wait or check your wallet.'
          ) as any;
          error.code = -32002;
          throw error;
        }
        ctx.isSignRequestInFlight.set(signingType, true);

        try {
          try {
            const session = provider.session;
            const storedSession = Array.from(ctx.sessions.values()).find(s => s.peerRedirect);
            const redirect = session?.peer?.metadata?.redirect || storedSession?.peerRedirect;
            const isAndroid = /Android/i.test(navigator.userAgent);
            const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
            const isInAppBrowser =
              (typeof window !== 'undefined' && !!(window as any).ethereum) ||
              /Trust|MetaMask|Keplr|Freighter|LOBSTR/i.test(navigator.userAgent);

            if (redirect && !isInAppBrowser && (isAndroid || isIOS)) {
              const href = isAndroid
                ? redirect.native || redirect.universal
                : redirect.universal || redirect.native;

              if (href) {
                console.log('[WalletService] Opening wallet for signing', method, '::', href);
                try {
                  window.open(href, '_blank', 'noopener');
                } catch {
                  window.location.href = href;
                }
              }
            }
          } catch (e) {
            console.error('[WalletService] Auto-redirect error:', e);
          }

          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('SIGNATURE_TIMEOUT')), 120_000)
          );

          const result = await Promise.race([originalRequest.apply(this, args), timeoutPromise]);
          return result;
        } catch (error: any) {
          if (isUserRejection(error)) {
            const rejectError = new Error('USER_REJECTED') as any;
            rejectError.code = 4001;
            throw rejectError;
          }
          const cleanMsg = extractErrorMessage(error);
          const newErr = new Error(cleanMsg) as any;
          newErr.code = error?.code || -32603;
          throw newErr;
        } finally {
          ctx.isSignRequestInFlight.set(signingType, false);
        }
      }

      return originalRequest.apply(this, args);
    };
    target.request.__isWrapped = true;
  };

  wrapMethod(provider);
  if (provider.client) {
    wrapMethod(provider.client);
  }
}
