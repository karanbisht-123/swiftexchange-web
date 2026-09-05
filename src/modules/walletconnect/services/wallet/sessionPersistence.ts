import { getStellarConfig } from '../../config/chains';
import { WALLET_METADATA_MAP } from '../../constants/Wallet';
import { setupEVMListeners, setupWalletConnectListeners } from './eventListeners';
import { resolveEvmProvider } from './providerRegistry';
import { getOrCreateProvider } from './providerRegistry';
import type { WalletServiceContext, WalletSession, WalletType } from './types';

const SESSION_STORAGE_KEY = 'wallet_sessions';

function getSessionMetadata(walletId: string, peerMetadata?: any) {
  const fallback = WALLET_METADATA_MAP[walletId] || WALLET_METADATA_MAP['walletconnect'];
  return {
    peerName: peerMetadata?.name || fallback?.name || walletId,
    peerIcon: peerMetadata?.icons?.[0] || fallback?.icon || '',
    peerRedirect: peerMetadata?.redirect || undefined,
  };
}

export function saveSession(ctx: WalletServiceContext): void {
  try {
    const data: Record<string, WalletSession> = {};
    ctx.sessions.forEach((session, type) => {
      data[type] = {
        type: session.type,
        walletId: session.walletId,
        evmAddress: session.evmAddress,
        evmChainId: session.evmChainId,
        stellarAddress: session.stellarAddress,
        stellarChainId: session.stellarChainId,
        connectionMode: session.connectionMode,
        peerName: session.peerName,
        peerIcon: session.peerIcon,
        peerRedirect: session.peerRedirect,
      };
    });
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(data));
  } catch (error: any) {
    console.error('[System] Session storage save failed:', error.message);
  }
}

export async function restoreSessions(ctx: WalletServiceContext): Promise<WalletSession[]> {
  const restored: WalletSession[] = [];

  try {
    const stored = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!stored) return [];

    let data: Record<string, WalletSession>;
    try {
      data = JSON.parse(stored);
    } catch {
      clearSessionStorage();
      return [];
    }

    for (const [typeStr, savedSession] of Object.entries(data)) {
      const type = typeStr as WalletType;
      try {
        const restoredSession = await restoreSession(ctx, type, savedSession);
        if (restoredSession) restored.push(restoredSession);
      } catch (error) {
        console.warn(`[WalletService] Failed to restore session for ${type}:`, error);
      }
    }
  } catch (error) {
    console.warn('[WalletService] Could not read stored sessions:', error);
  }

  return restored;
}

async function restoreSession(
  ctx: WalletServiceContext,
  type: WalletType,
  savedSession: WalletSession
): Promise<WalletSession | null> {
  const isWalletConnect =
    savedSession.connectionMode === 'unified' || savedSession.connectionMode === 'separate';

  if (!isWalletConnect) {
    return restoreExtensionSession(ctx, type, savedSession);
  }

  const providerKey = savedSession.connectionMode === 'unified' ? 'unified' : type;

  let provider = ctx.providers.get(providerKey);

  if (!provider) {
    try {
      provider = await getOrCreateProvider(ctx, providerKey);
    } catch (error) {
      console.warn(`[WalletService] Provider init failed for key '${providerKey}':`, error);
      return null;
    }
  }

  console.log(provider?.session, '---------- provider session');
  if (!provider?.session) return null;

  const expiry = provider.session?.expiry ?? 0;
  if (Date.now() / 1000 > expiry) {
    console.warn(`[WalletService] Restored session for '${providerKey}' is expired`);
    try {
      await provider.disconnect();
    } catch (err) {
      console.error('Disconnect error:', err);
    }
    ctx.providers.delete(providerKey);
    clearSessionStorage();
    return null;
  }

  ctx.providers.set(providerKey, provider);
  ctx.providers.set(type, provider);

  setupWalletConnectListeners(ctx, provider, type);

  const refreshed = await refreshSessionFromProvider(provider, savedSession);

  ctx.sessions.set(type, refreshed);
  ctx.emitState(type, 'connected');
  return refreshed;
}

async function restoreExtensionSession(
  ctx: WalletServiceContext,
  type: WalletType,
  savedSession: WalletSession
): Promise<WalletSession | null> {
  const win = window as any;

  if (type === 'stellar') {
    const stellarProviderMap: Record<string, any> = {
      freighter: win.freighterApi ?? win.freighter,
      lobstr: win.lobstr,
    };

    const extensionProvider = stellarProviderMap[savedSession.walletId];
    if (!extensionProvider) return null;

    try {
      if (typeof extensionProvider.isConnected === 'function') {
        const isConnected = await extensionProvider.isConnected();
        if (!isConnected) return null;
      }

      const publicKey: string = await extensionProvider.getPublicKey();
      const config = getStellarConfig(ctx.currentNetwork);
      const meta = getSessionMetadata(savedSession.walletId);

      const session: WalletSession = {
        type: 'stellar',
        walletId: savedSession.walletId,
        stellarAddress: publicKey,
        stellarChainId: config.chainId,
        peerName: savedSession.peerName || meta.peerName,
        peerIcon: savedSession.peerIcon || meta.peerIcon,
        peerRedirect: savedSession.peerRedirect || meta.peerRedirect,
      };

      ctx.sessions.set('stellar', session);
      ctx.providers.set('stellar', extensionProvider);
      ctx.emitState('stellar', 'connected');
      return session;
    } catch (error) {
      console.warn(`[WalletService] ${savedSession.walletId} Stellar restore failed:`, error);
      return null;
    }
  }

  if (type === 'evm') {
    try {
      const evmProvider = await resolveEvmProvider(ctx, savedSession.walletId);
      if (!evmProvider) return null;

      const accounts: string[] = await evmProvider.request({ method: 'eth_accounts' });
      if (!accounts?.length) return null;

      const chainIdHex: string = await evmProvider.request({ method: 'eth_chainId' });
      const meta = getSessionMetadata(savedSession.walletId);
      const session: WalletSession = {
        type: 'evm',
        walletId: savedSession.walletId,
        evmAddress: accounts[0],
        evmChainId: parseInt(chainIdHex, 16),
        peerName: savedSession.peerName || meta.peerName,
        peerIcon: savedSession.peerIcon || meta.peerIcon,
        peerRedirect: savedSession.peerRedirect || meta.peerRedirect,
      };

      ctx.sessions.set('evm', session);
      ctx.providers.set('evm', evmProvider);
      setupEVMListeners(ctx, evmProvider);
      ctx.emitState('evm', 'connected');
      return session;
    } catch (error) {
      console.warn('[WalletService] EVM extension restore failed:', error);
      return null;
    }
  }

  return null;
}

export async function refreshSessionFromProvider(
  provider: any,
  saved: WalletSession
): Promise<WalletSession> {
  const session = provider.session;
  let evmAddress: string | undefined;
  let evmChainId: number | undefined;
  let stellarAddress: string | undefined;
  let stellarChainId: string | undefined;

  const evmAccount: string | undefined = session.namespaces?.eip155?.accounts?.[0];
  if (evmAccount) {
    const [, chainIdStr, addr] = evmAccount.split(':');
    evmAddress = addr;
    evmChainId = parseInt(chainIdStr, 10);
  }

  const stellarAccount: string | undefined = session.namespaces?.stellar?.accounts?.[0];
  if (stellarAccount) {
    const [, chainId, addr] = stellarAccount.split(':');
    stellarAddress = addr;
    stellarChainId = chainId;
  }

  const peerMetadata = session?.peer?.metadata;
  const meta = getSessionMetadata(saved.walletId, peerMetadata);

  const refreshed: WalletSession = {
    type: saved.type,
    walletId: saved.walletId,
    connectionMode: saved.connectionMode,
    evmAddress,
    evmChainId,
    stellarAddress,
    stellarChainId,
    peerName: meta.peerName || saved.peerName,
    peerIcon: meta.peerIcon || saved.peerIcon,
    peerRedirect: meta.peerRedirect || saved.peerRedirect,
  };

  return refreshed;
}

export function clearSessionStorage(): void {
  try {
    const PRESERVE_KEYS = [
      'swiftex_local_transactions',
      'theme-storage',
      'network',
      'swiftex_pending_skip_txs_v2',
      'stellar_dydx_bridge_step',
    ];

    Object.keys(localStorage).forEach(key => {
      if (!PRESERVE_KEYS.includes(key)) {
        localStorage.removeItem(key);
      }
    });
  } catch (error) {
    console.warn('[WalletService] Session storage clear failed:', error);
  }
}
