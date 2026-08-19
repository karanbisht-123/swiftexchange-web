

import { type NetworkType } from '../../config/chains';
import { WALLET_METADATA_MAP } from '../../constants/Wallet';


import { disconnect, disconnectAll } from './disconnect';
import { connectChainWallet } from './evmConnect';
import {
  getInstalledWallets,
  isExtensionInstalled,
  setupEIP6963Listener,
} from './providerRegistry';
import { clearSessionStorage, restoreSessions, saveSession } from './sessionPersistence';
import { signSiweMessage, signStellarChallenge } from './signing';
import { connectStellar } from './stellarConnect';
import type {
  ConnectionState,

  UnifiedConnectionResult,
  WalletServiceContext,
  WalletSession,
  WalletType,
} from './types';
import { connectUnified } from './unifiedConnect';

class WalletService {
  private ctx: WalletServiceContext;
  constructor() {
    // Build the shared context — all modules read/write this object
    this.ctx = {
      sessions: new Map(),
      providers: new Map(),
      modals: new Map(),
      eip6963Providers: new Map(),
      registeredProviders: new Set(),
      lastPingAt: new Map(),
      disconnecting: new Set(),
      isSignRequestInFlight: new Map(),
      derivationInProgress: false,
      currentNetwork: this.loadNetwork(),
      // Bound callbacks so modules can trigger them
      emitState: (type, state) => this.emitState(type, state),
      saveSession: () => saveSession(this.ctx),
      openMobileDeepLink: (walletId, uri) => this.openMobileDeepLink(walletId, uri),
      handleDisconnect: type => void disconnect(this.ctx, type),
    };

    setupEIP6963Listener(this.ctx);
    this.setupVisibilityHandler();
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private loadNetwork(): NetworkType {
    try {
      const stored = localStorage.getItem('network');
      return stored === 'testnet' ? 'testnet' : 'mainnet';
    } catch {
      return 'mainnet';
    }
  }

  private setupVisibilityHandler(): void {
    if (typeof document === 'undefined') return;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      const seen = new Set<any>();
      for (const provider of this.ctx.providers.values()) {
        if (!provider || seen.has(provider)) continue;
        seen.add(provider);
        if (!provider.session) continue;
        try {
          const relayer = provider.client?.core?.relayer;
          if (relayer && typeof relayer.transportOpen === 'function') {
            console.debug('[WalletService] Tab visible — reopening WC relay transport');
            relayer.transportOpen().catch((err: any) => {
              console.warn('[WalletService] Relay transportOpen error:', err);
            });
          }
        } catch (err) {
          console.warn('[WalletService] visibilitychange relay reopen error:', err);
        }
      }
    });
  }


  private openMobileDeepLink(walletId: string, uri: string): void {
    if (!/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) return;

    const isInAppBrowser =
      (typeof window !== 'undefined' && !!(window as any).ethereum) ||
      /Trust|MetaMask|Keplr|Freighter|LOBSTR/i.test(navigator.userAgent);
    if (isInAppBrowser) {
      console.log('[WalletService] In-app browser detected, skipping deep link redirect');
      return;
    }

    const meta = WALLET_METADATA_MAP[walletId];
    if (!meta || !meta.redirects) return;

    const { native, universal } = meta.redirects;
    let link = '';
    if (universal) {
      link = `${universal}?uri=${encodeURIComponent(uri)}`;
    } else if (native) {
      const separator = native.endsWith('://') ? '' : '/';
      link = `${native}${separator}wc?uri=${encodeURIComponent(uri)}`;
    }

    if (link) {
      console.log(`[WalletService] Redirecting to ${walletId} via:`, link);
      setTimeout(() => {
        window.location.href = link;
      }, 100);
    }
  }

  // ---------------------------------------------------------------------------
  // State listeners
  // ---------------------------------------------------------------------------

  private listeners = new Set<(type: WalletType, state: ConnectionState) => void>();

  private emitState(type: WalletType, state: ConnectionState): void {
    this.listeners.forEach(cb => {
      try {
        cb(type, state);
      } catch (error: any) {
        console.error(
          `[WalletService] Error in state listener for ${type} [${state}]:`,
          error.message
        );
      }
    });
  }

  onStateChange(callback: (type: WalletType, state: ConnectionState) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  // ---------------------------------------------------------------------------
  // Network
  // ---------------------------------------------------------------------------

  getNetwork(): NetworkType {
    return this.ctx.currentNetwork;
  }

  async setNetwork(network: NetworkType): Promise<void> {
    if (this.ctx.currentNetwork === network) return;
    this.ctx.currentNetwork = network;
    localStorage.setItem('network', network);
    await Promise.all([this.disconnect('evm'), this.disconnect('stellar')]);
    clearSessionStorage();
  }

  // ---------------------------------------------------------------------------
  // Connection
  // ---------------------------------------------------------------------------

  async connectUnified(walletId: string): Promise<UnifiedConnectionResult> {
    return connectUnified(this.ctx, walletId);
  }

  async connectChainWallet(walletId: string): Promise<WalletSession> {
    return connectChainWallet(this.ctx, walletId);
  }

  async connectStellar(walletId: string): Promise<WalletSession> {
    return connectStellar(this.ctx, walletId);
  }


  // ---------------------------------------------------------------------------
  // Signing pass-throughs
  // ---------------------------------------------------------------------------

  async signSiweMessage(evmAddress: string, provider: unknown, message: string): Promise<string> {
    return signSiweMessage(evmAddress, provider, message);
  }

  async signStellarChallenge(
    xdr: string,
    networkPassphrase: string,
    provider: unknown
  ): Promise<string> {
    return signStellarChallenge(xdr, networkPassphrase, provider);
  }

  // ---------------------------------------------------------------------------
  // Disconnect
  // ---------------------------------------------------------------------------

  async disconnect(type: WalletType): Promise<void> {
    return disconnect(this.ctx, type);
  }

  async disconnectAll(): Promise<void> {
    return disconnectAll(this.ctx);
  }

  // ---------------------------------------------------------------------------
  // Session persistence
  // ---------------------------------------------------------------------------

  async restoreSessions(): Promise<WalletSession[]> {
    return restoreSessions(this.ctx);
  }

  // ---------------------------------------------------------------------------
  // Session health
  // ---------------------------------------------------------------------------

  async checkSessionHealth(): Promise<{ type: WalletType; valid: boolean }[]> {
    const results: { type: WalletType; valid: boolean }[] = [];
    for (const [type] of this.ctx.sessions.entries()) {
      const provider = this.ctx.providers.get(type);
      const hasSession = !!provider?.session;
      const notExpired = hasSession
        ? !provider.session.expiry || Date.now() / 1000 < provider.session.expiry
        : false;
      const valid = hasSession && notExpired;
      results.push({ type, valid });
      if (!valid) void this.disconnect(type);
    }
    return results;
  }

  clearSignRequests(): void {
    this.ctx.isSignRequestInFlight.clear();
  }

  // ---------------------------------------------------------------------------
  // Public accessors
  // ---------------------------------------------------------------------------

  getSession(type: WalletType): WalletSession | null {
    return this.ctx.sessions.get(type) ?? null;
  }

  getProvider(type: WalletType): any {
    return this.ctx.providers.get(type) ?? null;
  }

  getLastPingAt(type: WalletType): number | null {
    return this.ctx.lastPingAt.get(type) ?? null;
  }

  isConnected(type: WalletType): boolean {
    return this.ctx.sessions.has(type);
  }


  isExtensionInstalled(walletId: string): boolean {
    return isExtensionInstalled(this.ctx, walletId);
  }

  getInstalledWallets(): string[] {
    return getInstalledWallets(this.ctx);
  }

  // ---------------------------------------------------------------------------
  updateSessionPing(type: WalletType): void {
    this.ctx.lastPingAt.set(type, Date.now());
  }
}

export const walletService = new WalletService();
