import UniversalProvider from '@walletconnect/universal-provider';
import { Web3Modal } from '@web3modal/standalone';
import { type Web3ModalConfig } from '@web3modal/standalone';

import { transactionRouter } from '../../transction/router/transactionRouter';
import {
  type NetworkType,
  WALLETCONNECT_METADATA,
  WALLETCONNECT_PROJECT_ID,
  getCosmosChains,
  getEVMChains,
  getStellarConfig,
} from '../config/chains';
import { CHAIN_EVENTS, CHAIN_METHODS, WalletType } from '../constants/Wallet';

// Constants
const CONNECTION_TIMEOUT = 120000;
const DISCONNECT_TIMEOUT = 3000;
const MODAL_DELAY = 300;
// const SESSION_CLEANUP_DELAY = 1000;
const STORAGE_KEY = 'wallet_sessions';
const NETWORK_STORAGE_KEY = 'current_network';

// Types
type ConnectionState = 'connecting' | 'connected' | 'failed' | 'cancelled';
type ConnectionCallback = (type: WalletType, state: ConnectionState) => void;
type ConnectType = 'extension' | 'walletconnect';

interface StoredSession {
  walletId: string;
  type: WalletType;
  connectType: ConnectType;
}

interface ConnectionResult {
  address: string;
  chainId: string | number;
  walletId: string;
}

interface WalletProviders {
  evm: any;
  cosmos: any;
  stellar: any;
}

interface WCProviders {
  evm: any;
  cosmos: any;
  stellar: any;
}

class WalletService {
  // Providers
  private providers: WalletProviders = {
    evm: null,
    cosmos: null,
    stellar: null,
  };

  private wcProviders: WCProviders = {
    evm: null,
    cosmos: null,
    stellar: null,
  };

  // Modals
  private modals: Record<WalletType, Web3Modal | null> = {
    [WalletType.EVM]: null,
    [WalletType.COSMOS]: null,
    [WalletType.STELLAR]: null,
  };

  // Connection state
  private connecting = new Set<WalletType>();
  private timeouts = new Map<WalletType, number>();
  private listeners = new Set<ConnectionCallback>();

  // Network
  private currentNetwork: NetworkType;

  constructor() {
    this.currentNetwork = this.loadNetwork();
  }

  // ==================== NETWORK MANAGEMENT ====================

  private loadNetwork(): NetworkType {
    try {
      const stored = localStorage.getItem(NETWORK_STORAGE_KEY);
      return stored === 'testnet' ? 'testnet' : 'mainnet';
    } catch {
      return 'mainnet';
    }
  }

  getNetwork(): NetworkType {
    return this.currentNetwork;
  }

  async setNetwork(network: NetworkType): Promise<void> {
    if (this.currentNetwork === network) return;

    try {
      localStorage.setItem(NETWORK_STORAGE_KEY, network);
    } catch (e) {
      console.error('Failed to save network:', e);
    }

    this.currentNetwork = network;

    // Disconnect all and reset
    transactionRouter.clearAllSessions();
    await Promise.all([
      this.disconnect(WalletType.EVM),
      this.disconnect(WalletType.COSMOS),
      this.disconnect(WalletType.STELLAR),
    ]);

    this.wcProviders = { evm: null, cosmos: null, stellar: null };
  }

  // ==================== SESSION STORAGE ====================

  private loadSessions(): Record<string, StoredSession> {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  }

  private saveSession(type: WalletType, walletId: string, connectType: ConnectType): void {
    try {
      const sessions = this.loadSessions();
      sessions[type] = { walletId, type, connectType };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    } catch (e) {
      console.error('Failed to save session:', e);
    }
  }

  private deleteSession(type: WalletType): void {
    try {
      const sessions = this.loadSessions();
      delete sessions[type];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    } catch (e) {
      console.error('Failed to delete session:', e);
    }
  }

  // ==================== SESSION RESTORATION ====================

  async restoreSessions(): Promise<ConnectionResult[]> {
    const sessions = this.loadSessions();
    const results: ConnectionResult[] = [];

    for (const [key, session] of Object.entries(sessions)) {
      const type = key as WalletType;

      try {
        let result: ConnectionResult | null = null;

        if (session.connectType === 'extension') {
          // Extension connection
          if (this.isWalletInstalled(session.walletId)) {
            result = await this.connectExtension(session.walletId, type);
          }
        } else {
          // WalletConnect connection - VERIFY IT'S STILL ACTIVE
          const provider = await this.getOrCreateProvider(type);

          // CHECK: Does the provider actually have an active session?
          if (provider?.session) {
            const namespace = this.getNamespace(type);
            const accounts = provider.session.namespaces[namespace]?.accounts || [];

            if (accounts.length > 0) {
              const [chainPart, addressPart] = this.parseAccount(accounts[0], type);
              result = {
                address: addressPart,
                chainId: chainPart,
                walletId: session.walletId,
              };
            }
          }
        }

        // Only restore if we got valid data
        if (result) {
          const provider =
            session.connectType === 'extension'
              ? null
              : this.wcProviders[this.getProviderKey(type)];

          transactionRouter.registerSession(
            type,
            provider,
            result.address,
            result.chainId,
            session.walletId
          );

          results.push({ ...result, type } as any);
          this.emitState(type, 'connected');
        } else {
          // Session is invalid - remove it
          this.deleteSession(type);
        }
      } catch (error) {
        console.error(`Failed to restore ${type} session:`, error);
        this.deleteSession(type);
      }
    }

    return results;
  }

  // ==================== WALLET DETECTION ====================

  private isMobile(): boolean {
    const ua = navigator.userAgent || navigator.vendor || (window as any).opera;
    return /android/i.test(ua) || (/iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream);
  }

  private isWalletInstalled(walletId: string): boolean {
    const win = window as any;
    const checks: Record<string, boolean> = {
      metamask: !!win.ethereum?.isMetaMask,
      trust: !!win.ethereum?.isTrust,
      coinbase: !!win.ethereum?.isCoinbaseWallet,
      rabby: !!win.ethereum?.isRabby,
      brave: !!win.ethereum?.isBraveWallet,
      keplr: !!win.keplr,
      leap: !!win.leap,
      freighter: !!win.freighter,
    };
    return checks[walletId.toLowerCase()] || false;
  }

  getInstalledWallets(): string[] {
    const win = window as any;
    const installed: Record<string, boolean> = {
      metamask: !!win.ethereum?.isMetaMask,
      trust: !!win.ethereum?.isTrust,
      coinbase: !!win.ethereum?.isCoinbaseWallet,
      rabby: !!win.ethereum?.isRabby,
      brave: !!win.ethereum?.isBraveWallet,
      keplr: !!win.keplr,
      leap: !!win.leap,
      freighter: !!win.freighter,
    };
    return Object.keys(installed).filter(key => installed[key]);
  }

  // ==================== EXTENSION CONNECTION ====================

  private async connectExtension(walletId: string, type: WalletType): Promise<ConnectionResult> {
    const win = window as any;

    if (type === WalletType.EVM) {
      const providers: Record<string, any> = {
        metamask: win.ethereum?.isMetaMask ? win.ethereum : null,
        trust: win.ethereum?.isTrust ? win.ethereum : null,
        coinbase: win.ethereum?.isCoinbaseWallet ? win.ethereum : null,
        rabby: win.ethereum?.isRabby ? win.ethereum : null,
        brave: win.ethereum?.isBraveWallet ? win.ethereum : null,
      };

      const provider = providers[walletId.toLowerCase()] || win.ethereum;
      if (!provider) throw new Error('Wallet extension not found');

      const accounts = await provider.request({ method: 'eth_requestAccounts' });
      const chainId = await provider.request({ method: 'eth_chainId' });

      this.providers.evm = provider;
      return {
        address: accounts[0],
        chainId: parseInt(chainId, 16),
        walletId,
      };
    }

    if (type === WalletType.COSMOS) {
      const cosmosProvider = walletId.toLowerCase() === 'keplr' ? win.keplr : win.leap;
      if (!cosmosProvider) throw new Error('Wallet extension not found');

      const chainId = getCosmosChains(this.currentNetwork)[0].chainId;
      await cosmosProvider.enable(chainId);
      const account = await cosmosProvider.getKey(chainId);

      this.providers.cosmos = cosmosProvider;
      return {
        address: account.bech32Address,
        chainId,
        walletId,
      };
    }

    throw new Error('Extension connection not supported for this wallet type');
  }

  // ==================== WALLETCONNECT PROVIDER ====================

  private getProviderKey(type: WalletType): keyof WCProviders {
    return type === WalletType.EVM ? 'evm' : type === WalletType.COSMOS ? 'cosmos' : 'stellar';
  }

  private async getOrCreateProvider(type: WalletType): Promise<any> {
    const key = this.getProviderKey(type);

    // Return existing if valid
    if (this.wcProviders[key]?.client?.session) {
      return this.wcProviders[key];
    }

    // Create new provider
    const provider = await UniversalProvider.init({
      projectId: WALLETCONNECT_PROJECT_ID,
      metadata: WALLETCONNECT_METADATA,
      relayUrl: 'wss://relay.walletconnect.com',
    });

    this.setupProviderListeners(provider, type);
    this.wcProviders[key] = provider;

    return provider;
  }

  private setupProviderListeners(provider: any, type: WalletType): void {
    provider.on('session_delete', () => this.handleSessionLost(type));
    provider.on('disconnect', () => this.handleSessionLost(type));
  }

  private async handleSessionLost(type: WalletType): Promise<void> {
    this.deleteSession(type);
    transactionRouter.unregisterSession(type);
    this.wcProviders[this.getProviderKey(type)] = null;
  }

  // ==================== NAMESPACE & CHAIN CONFIG ====================

  private getNamespace(type: WalletType): string {
    return type === WalletType.EVM ? 'eip155' : type === WalletType.COSMOS ? 'cosmos' : 'stellar';
  }

  private parseAccount(fullAccount: string, type: WalletType): [string | number, string] {
    const parts = fullAccount.split(':');
    const address = parts[2] || '';
    const chainId = type === WalletType.EVM ? parseInt(parts[1]) : parts[1];
    return [chainId, address];
  }

  private getChainConfig(type: WalletType) {
    if (type === WalletType.EVM) {
      const chains = getEVMChains(this.currentNetwork);
      const rpcMap: Record<string, string> = {};
      chains.forEach(c => (rpcMap[c.chainId.toString()] = c.rpcUrl));

      return {
        namespace: 'eip155',
        chains: chains.map(c => `eip155:${c.chainId}`),
        methods: CHAIN_METHODS.evm,
        events: CHAIN_EVENTS.evm,
        rpcMap,
      };
    }

    if (type === WalletType.COSMOS) {
      const chains = getCosmosChains(this.currentNetwork);
      const rpcMap: Record<string, string> = {};
      chains.forEach(c => (rpcMap[c.chainId] = c.rpc));

      return {
        namespace: 'cosmos',
        chains: chains.map(c => `cosmos:${c.chainId}`),
        methods: CHAIN_METHODS.cosmos,
        events: CHAIN_EVENTS.cosmos,
        rpcMap,
      };
    }

    const config = getStellarConfig(this.currentNetwork);
    return {
      namespace: 'stellar',
      chains: [`stellar:${config.chainId}`],
      methods: CHAIN_METHODS.stellar,
      events: CHAIN_EVENTS.stellar,
      rpcMap: { [config.chainId]: config.horizonUrl },
    };
  }

  // ==================== MOBILE DEEP LINKS ====================

  private openMobileWallet(walletId: string, uri: string): void {
    const encoded = encodeURIComponent(uri);
    const deepLinks: Record<string, string> = {
      metamask: `https://metamask.app.link/wc?uri=${encoded}`,
      trust: `https://link.trustwallet.com/wc?uri=${encoded}`,
      rainbow: `https://rnbwapp.com/wc?uri=${encoded}`,
      coinbase: `https://go.cb-w.com/wc?uri=${encoded}`,
      keplr: `keplrwallet://wcV2?uri=${encoded}`,
      leap: `leapcosmos://wcV2?uri=${encoded}`,
      freighter: `freighter://wc?uri=${encoded}`,
    };

    const deepLink = deepLinks[walletId.toLowerCase()] || uri;
    window.open(deepLink, '_blank');
  }

  // ==================== CONNECTION FLOW ====================

  async connectWallet(type: WalletType, walletId: string): Promise<ConnectionResult> {
    // Prevent duplicate connections
    if (this.connecting.has(type)) {
      throw new Error(`${type} connection already in progress`);
    }

    if (this.isConnected(type)) {
      throw new Error(`${type} already connected. Disconnect first.`);
    }

    const isMobileDevice = this.isMobile();
    const useWC = walletId === 'walletconnect';
    const hasExtension = !isMobileDevice && !useWC && this.isWalletInstalled(walletId);

    // Try extension first if available
    if (hasExtension) {
      try {
        const result = await this.connectExtension(walletId, type);
        transactionRouter.registerSession(type, null, result.address, result.chainId, walletId);
        this.saveSession(type, walletId, 'extension');
        this.emitState(type, 'connected');
        return result;
      } catch (error) {
        console.error('Extension connection failed:', error);
      }
    }

    // Use WalletConnect
    return this.connectWalletConnect(type, walletId, isMobileDevice, useWC);
  }

  private async connectWalletConnect(
    type: WalletType,
    walletId: string,
    isMobile: boolean,
    showModal: boolean
  ): Promise<ConnectionResult> {
    this.connecting.add(type);
    this.emitState(type, 'connecting');

    try {
      // Setup modal if needed
      if (!isMobile || showModal) {
        await this.setupModal(type);
      }

      // Get provider
      const provider = await this.getOrCreateProvider(type);
      const chainConfig = this.getChainConfig(type);

      // Start connection
      return await new Promise((resolve, reject) => {
        this.startConnectionTimeout(type, reject);

        let uriShown = false;
        const onUri = (uri: string) => {
          if (uriShown) return;
          uriShown = true;

          if (isMobile && !showModal) {
            this.openMobileWallet(walletId, uri);
          } else {
            setTimeout(() => {
              this.modals[type]?.openModal({
                uri,
                standaloneChains: chainConfig.chains,
              });
            }, MODAL_DELAY);
          }
        };

        provider.once('display_uri', onUri);

        provider
          .connect({
            optionalNamespaces: {
              [chainConfig.namespace]: {
                methods: chainConfig.methods,
                chains: chainConfig.chains,
                events: chainConfig.events,
                rpcMap: chainConfig.rpcMap,
              },
            },
          })
          .then((session: any) => {
            const accounts = session.namespaces[chainConfig.namespace]?.accounts || [];
            if (accounts.length === 0) {
              throw new Error('No accounts found');
            }

            const [chainId, address] = this.parseAccount(accounts[0], type);

            transactionRouter.registerSession(type, provider, address, chainId, walletId);
            this.saveSession(type, walletId, 'walletconnect');

            this.cleanup(type);
            this.emitState(type, 'connected');

            resolve({ address, chainId, walletId });
          })
          .catch((error: any) => {
            this.cleanup(type);
            this.emitState(type, 'failed');
            reject(new Error(error.message || 'Connection failed'));
          });
      });
    } catch (error) {
      this.cleanup(type);
      this.emitState(type, 'failed');
      throw error;
    }
  }

  private async setupModal(type: WalletType): Promise<void> {
    if (this.modals[type]) return;

    const config: Web3ModalConfig = {
      projectId: WALLETCONNECT_PROJECT_ID,
      walletConnectVersion: 2,
      enableExplorer: true,
      explorerRecommendedWalletIds: [],
      explorerExcludedWalletIds: [],
      themeMode: 'dark',
      themeVariables: { '--w3m-z-index': '9999' },
      mobileWallets: [],
      desktopWallets: [],
    };

    this.modals[type] = new Web3Modal(config);
  }

  // ==================== TIMEOUT & CLEANUP ====================

  private startConnectionTimeout(type: WalletType, reject: (error: Error) => void): void {
    this.clearConnectionTimeout(type);

    const timeout = window.setTimeout(() => {
      this.cleanup(type);
      this.emitState(type, 'failed');
      reject(new Error('Connection timeout'));
    }, CONNECTION_TIMEOUT);

    this.timeouts.set(type, timeout);
  }

  private clearConnectionTimeout(type: WalletType): void {
    const timeout = this.timeouts.get(type);
    if (timeout) {
      clearTimeout(timeout);
      this.timeouts.delete(type);
    }
  }

  private cleanup(type: WalletType): void {
    this.clearConnectionTimeout(type);
    this.connecting.delete(type);
    setTimeout(() => this.modals[type]?.closeModal(), MODAL_DELAY);
  }

  // ==================== DISCONNECT ====================

  async disconnect(type: WalletType): Promise<void> {
    try {
      this.clearConnectionTimeout(type);
      this.connecting.delete(type);
      this.deleteSession(type);

      transactionRouter.unregisterSession(type);

      const key = this.getProviderKey(type);
      this.providers[key] = null;

      const wcProvider = this.wcProviders[key];
      if (wcProvider?.session) {
        await Promise.race([
          wcProvider.disconnect(),
          new Promise(resolve => setTimeout(resolve, DISCONNECT_TIMEOUT)),
        ]);
        wcProvider.removeAllListeners();
      }

      this.wcProviders[key] = null;
      this.modals[type]?.closeModal();
    } catch (error) {
      console.error(`Disconnect error for ${type}:`, error);
      throw error;
    }
  }

  // ==================== PUBLIC API ====================

  async connectEVM(
    walletId: string
  ): Promise<{ address: string; chainId: number; walletId: string }> {
    const result = await this.connectWallet(WalletType.EVM, walletId);
    return { ...result, chainId: result.chainId as number };
  }

  async connectCosmos(
    walletId: string
  ): Promise<{ address: string; chainId: string; walletId: string }> {
    const result = await this.connectWallet(WalletType.COSMOS, walletId);
    return { ...result, chainId: result.chainId as string };
  }

  async connectStellar(walletId: string): Promise<{ address: string; walletId: string }> {
    const result = await this.connectWallet(WalletType.STELLAR, walletId);
    return { address: result.address, walletId: result.walletId };
  }

  getProvider(type: WalletType): any {
    const key = this.getProviderKey(type);
    return this.providers[key] || this.wcProviders[key];
  }

  isConnecting(type?: WalletType): boolean {
    return type ? this.connecting.has(type) : this.connecting.size > 0;
  }

  isConnected(type: WalletType): boolean {
    const key = this.getProviderKey(type);
    return !!(this.providers[key] || this.wcProviders[key]?.session);
  }

  getActiveSessions(): WalletType[] {
    return [WalletType.EVM, WalletType.COSMOS, WalletType.STELLAR].filter(type =>
      this.isConnected(type)
    );
  }

  // ==================== EVENT LISTENERS ====================

  onConnectionStateChange(callback: ConnectionCallback): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private emitState(type: WalletType, state: ConnectionState): void {
    this.listeners.forEach(listener => {
      try {
        listener(type, state);
      } catch (error) {
        console.error('Listener error:', error);
      }
    });
  }
}

export const walletService = new WalletService();
