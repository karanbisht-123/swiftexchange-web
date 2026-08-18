import { purgeApiTradingKeys } from '../apiTradingKeyService';
import { purge } from '../dydxKeyManager';
import { sessionVault } from '../sessionVault';
import { saveSession } from './sessionPersistence';
import type { WalletServiceContext, WalletType } from './types';

// ---------------------------------------------------------------------------
// disconnect (single wallet type)
// ---------------------------------------------------------------------------

export async function disconnect(ctx: WalletServiceContext, type: WalletType): Promise<void> {
  if (ctx.disconnecting.has(type)) return;
  ctx.disconnecting.add(type);

  const provider = ctx.providers.get(type);
  const sharedTypes: WalletType[] = [type];

  if (provider) {
    for (const [key, p] of Array.from(ctx.providers.entries())) {
      const k = key as WalletType;
      if (k !== type && p === provider && (k === 'evm' || k === 'stellar')) {
        if (!ctx.disconnecting.has(k)) {
          ctx.disconnecting.add(k);
          sharedTypes.push(k);
        }
      }
    }
  }

  console.log('[WC] DISCONNECT START', {
    providerInstanceId: (provider as any)?.__debugProviderId,
    topic: provider?.session?.topic,
  });

  if (provider) {
    ctx.registeredProviders.delete(provider);

    if (provider.session) {
      try {
        await provider.disconnect();
      } catch (err: any) {
        console.warn('[WalletService] Error during provider disconnect:', err);
      }
    }

    console.log('[WC] DISCONNECT COMPLETE', {
      providerInstanceId: (provider as any).__debugProviderId,
      topic: provider.session?.topic,
    });
  }

  // Clear per-type in-flight signing flags for all affected types.
  for (const t of sharedTypes) {
    ctx.isSignRequestInFlight.set(t, false);
  }

  for (const t of sharedTypes) {
    if (t === 'evm') {
      await purge();
      ctx.derivationInProgress = false;
    }

    ctx.sessions.delete(t);
    ctx.lastPingAt.delete(t);
    ctx.modals.get(t)?.closeModal();
    ctx.modals.delete(t);
    ctx.disconnecting.delete(t);
  }

  saveSession(ctx);

  if (ctx.sessions.size === 0) {
    await clearAppData();
  }

  for (const t of sharedTypes) {
    ctx.emitState(t, 'disconnected');
  }
}

// ---------------------------------------------------------------------------
// disconnectAll
// ---------------------------------------------------------------------------

export async function disconnectAll(ctx: WalletServiceContext): Promise<void> {
  console.log('[WalletService] Disconnecting all wallets...');

  const providers = new Set(ctx.providers.values());
  for (const provider of providers) {
    if (provider?.session) {
      try {
        await provider.disconnect();
      } catch (err) {
        console.warn('[WalletService] Error disconnecting provider:', err);
      }
    }
  }

  ctx.isSignRequestInFlight.clear();
  ctx.sessions.clear();
  ctx.modals.clear();
  ctx.lastPingAt.clear();
  ctx.disconnecting.clear();
  ctx.registeredProviders.clear();

  await clearAppData();
  saveSession(ctx);
}

// ---------------------------------------------------------------------------
// clearAppData — localStorage + IndexedDB + API keys + dYdX vault
// ---------------------------------------------------------------------------

export async function clearAppData(): Promise<void> {
  const PRESERVE_KEYS = [
    'swiftex_local_transactions',
    'theme-storage',
    'network',
    'swiftex_pending_skip_txs_v2',
    'stellar_dydx_bridge_step',
  ];

  Object.keys(localStorage).forEach(key => {
    if (
      !PRESERVE_KEYS.includes(key) &&
      !key.startsWith('swiftex_unified') &&
      !key.startsWith('swiftex_evm') &&
      !key.startsWith('swiftex_stellar') &&
      !key.startsWith('wc@2')
    ) {
      localStorage.removeItem(key);
    }
  });

  try {
    if (typeof indexedDB !== 'undefined' && indexedDB.databases) {
      const dbs = await indexedDB.databases();
      for (const db of dbs) {
        if (db.name && db.name !== 'WALLET_CONNECT_V2_INDEXED_DB') {
          indexedDB.deleteDatabase(db.name);
        }
      }
    }
  } catch (error) {
    console.error('[WalletService] Failed to clear IndexedDB:', error);
  }

  purgeApiTradingKeys();
  await purge();
  sessionVault.clear();
}
