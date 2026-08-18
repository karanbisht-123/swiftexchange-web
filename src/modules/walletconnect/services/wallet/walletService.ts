import { type LocalWallet } from '@dydxprotocol/v4-client-js';
import { CompositeClient, Network, onboarding } from '@dydxprotocol/v4-client-js';

import { type NetworkType } from '../../config/chains';
import { WALLET_METADATA_MAP } from '../../constants/Wallet';
import { type ApiTradingKey } from '../apiTradingKeyService';
import {
  generateApiTradingKey as _generateApiTradingKey,
  listApiTradingKeys as _listApiTradingKeys,
  revokeApiTradingKey as _revokeApiTradingKey,
} from '../apiTradingKeyService';
import { decryptStoredMnemonic, encryptAndStore } from '../dydxKeyManager';
import { sessionVault } from '../sessionVault';
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
  DydxDerivation,
  UnifiedConnectionResult,
  WalletServiceContext,
  WalletSession,
  WalletType,
} from './types';
import { connectUnified } from './unifiedConnect';

class WalletService {
  private ctx: WalletServiceContext;
  private _compositeClient: CompositeClient | null = null;
  private _compositeClientNetwork: NetworkType | null = null;

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

  private async getOrCreateCompositeClient(): Promise<CompositeClient> {
    if (this._compositeClient && this._compositeClientNetwork === this.ctx.currentNetwork) {
      return this._compositeClient;
    }
    const networkObj =
      this.ctx.currentNetwork === 'testnet' ? Network.testnet() : Network.mainnet();
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('CompositeClient connection timeout')), 15000)
    );
    this._compositeClient = await Promise.race([
      CompositeClient.connect(networkObj),
      timeoutPromise,
    ]);
    this._compositeClientNetwork = this.ctx.currentNetwork;
    return this._compositeClient;
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
    this._compositeClient = null;
    this._compositeClientNetwork = null;
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
  // dYdX derivation
  // ---------------------------------------------------------------------------

  async deriveDydx(): Promise<DydxDerivation> {
    const session = this.ctx.sessions.get('evm');
    if (!session) throw new Error('Wallet not connected');

    if (session.dydxAddress && sessionVault.has()) {
      return { address: session.dydxAddress, mnemonic: '' };
    }

    const evmProvider = this.ctx.providers.get('evm');
    if (!evmProvider || !session.evmAddress) {
      throw new Error('EVM wallet required for dYdX derivation');
    }

    if (this.ctx.derivationInProgress) {
      throw new Error('Derivation already in progress');
    }

    try {
      this.ctx.derivationInProgress = true;
      this.emitState(session.type, 'signing');

      // Inline the typed-data sign + key derivation
      const typedData = {
        domain: { name: 'dYdX Chain', chainId: 1 },
        primaryType: 'dYdX',
        types: {
          EIP712Domain: [
            { name: 'name', type: 'string' },
            { name: 'chainId', type: 'uint256' },
          ],
          dYdX: [{ name: 'action', type: 'string' }],
        },
        message: { action: 'dYdX Chain Onboarding' },
      };

      const trySign = async (addr: string, data: any) =>
        (evmProvider as any).request({
          method: 'eth_signTypedData_v4',
          params: [addr, data],
        });

      const lowerAddr = session.evmAddress.toLowerCase();
      const dataStr = JSON.stringify(typedData);
      let signature: string;
      try {
        signature = await trySign(lowerAddr, dataStr);
      } catch {
        try {
          signature = await trySign(session.evmAddress, dataStr);
        } catch {
          signature = await trySign(lowerAddr, typedData);
        }
      }

      const derived = onboarding.deriveHDKeyFromEthereumSignature(signature);
      if (!derived.mnemonic) throw new Error('Failed to derive mnemonic from signature');

      const dydxAddress = await encryptAndStore(derived.mnemonic);

      session.dydxAddress = dydxAddress;
      this.ctx.sessions.set(session.type, session);
      this.ctx.derivationInProgress = false;
      this.emitState(session.type, 'connected');
      saveSession(this.ctx);

      return { address: dydxAddress, mnemonic: '' };
    } catch (error: any) {
      this.ctx.derivationInProgress = false;
      this.emitState(session.type, 'connected');

      if (error.message === 'USER_REJECTED') {
        throw new Error('Signature rejected by user');
      }
      throw error;
    }
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

  getSigningWallet(): LocalWallet | null {
    return sessionVault.get();
  }

  hasDydxWallet(): boolean {
    return !!this.ctx.sessions.get('evm')?.dydxAddress;
  }

  isExtensionInstalled(walletId: string): boolean {
    return isExtensionInstalled(this.ctx, walletId);
  }

  getInstalledWallets(): string[] {
    return getInstalledWallets(this.ctx);
  }

  // ---------------------------------------------------------------------------
  // API Trading Keys
  // ---------------------------------------------------------------------------

  async generateApiTradingKey(label?: string): Promise<ApiTradingKey> {
    const client = await this.getOrCreateCompositeClient();
    return _generateApiTradingKey(label, client);
  }

  async revokeApiTradingKey(id: string): Promise<void> {
    const client = await this.getOrCreateCompositeClient();
    return _revokeApiTradingKey(id, client);
  }

  listApiTradingKeys(): ApiTradingKey[] {
    return _listApiTradingKeys();
  }

  async getOwnerSecretPhrase(): Promise<string | null> {
    return decryptStoredMnemonic();
  }

  updateSessionPing(type: WalletType): void {
    this.ctx.lastPingAt.set(type, Date.now());
  }
}

export const walletService = new WalletService();
