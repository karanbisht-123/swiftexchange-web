import { WalletConnectModal } from '@walletconnect/modal';
import type { WalletConnectModalConfig } from '@walletconnect/modal';
import type UniversalProviderType from '@walletconnect/universal-provider';

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
const MODAL_DELAY = 300;
const NETWORK_STORAGE_KEY = 'current_network';
const EXTENSION_STORAGE_PREFIX = 'wallet_extension_';

// Types
type ConnectionState = 'connecting' | 'connected' | 'failed' | 'cancelled' | 'disconnected';
type ConnectionCallback = (type: WalletType, state: ConnectionState) => void;

interface ConnectionResult {
  type: WalletType;
  address: string;
  chainId: string | number;
  walletId: string;
}

let UniversalProvider: typeof UniversalProviderType | null = null;
const loadWalletConnect = async (): Promise<typeof UniversalProviderType> => {
  if (!UniversalProvider) {
    const module = await import('@walletconnect/universal-provider');
    UniversalProvider = module.default;
  }
  return UniversalProvider;
};

class WalletService {
  private wcProviders: Map<WalletType, any> = new Map();
  private wcProviderPromises: Map<WalletType, Promise<any>> = new Map();
  private extensionProviders: Map<WalletType, any> = new Map();
  private modals: Map<WalletType, WalletConnectModal> = new Map();

  private connecting = new Set<WalletType>();
  private connectionQueue = new Map<WalletType, Promise<ConnectionResult>>();
  private timeouts = new Map<WalletType, number>();
  private listeners = new Set<ConnectionCallback>();
  private currentNetwork: NetworkType;
  private errorReporter?: (error: Error, context: any) => void;

  private extensionListeners = new Map<
    WalletType,
    {
      accountsChanged?: (accounts: string[]) => void;
      disconnect?: () => void;
      chainChanged?: (chainId: string) => void;
    }
  >();

  constructor() {
    this.currentNetwork = this.loadNetwork();
    console.log('[WalletService] Initialized with network:', this.currentNetwork);
  }

  setErrorReporter(reporter: (error: Error, context: any) => void): void {
    this.errorReporter = reporter;
  }

  private reportError(error: Error, context: any): void {
    console.error('[WalletService] Error:', context, error);
    if (this.errorReporter) {
      this.errorReporter(error, context);
    }
  }

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

    console.log('[WalletService] Switching network from', this.currentNetwork, 'to', network);

    try {
      localStorage.setItem(NETWORK_STORAGE_KEY, network);
    } catch (e) {
      console.error('[WalletService] Failed to save network:', e);
    }

    this.currentNetwork = network;
    transactionRouter.clearAllSessions();

    await Promise.all([
      this.disconnect(WalletType.EVM),
      this.disconnect(WalletType.COSMOS),
      this.disconnect(WalletType.STELLAR),
    ]);
    this.wcProviders.clear();
    this.wcProviderPromises.clear();
    this.extensionProviders.clear();

    console.log('[WalletService] Network switched successfully');
  }

  private saveExtensionConnection(type: WalletType, walletId: string): void {
    try {
      const key = `${EXTENSION_STORAGE_PREFIX}${type}`;
      localStorage.setItem(key, walletId);
      console.log('[WalletService] Saved extension connection:', type, walletId);
    } catch (e) {
      console.error('[WalletService] Failed to save extension connection:', e);
    }
  }

  private loadExtensionConnection(type: WalletType): string | null {
    try {
      const key = `${EXTENSION_STORAGE_PREFIX}${type}`;
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  private clearExtensionConnection(type: WalletType): void {
    try {
      const key = `${EXTENSION_STORAGE_PREFIX}${type}`;
      localStorage.removeItem(key);
      console.log('[WalletService] Cleared extension connection:', type);
    } catch (e) {
      console.error('[WalletService] Failed to clear extension connection:', e);
    }
  }

  async restoreSessions(): Promise<ConnectionResult[]> {
    console.log('[WalletService] Starting session restoration...');
    const results: ConnectionResult[] = [];

    const restorationPromises = [WalletType.EVM, WalletType.COSMOS, WalletType.STELLAR].map(
      async type => {
        try {
          const extensionResult = await this.tryRestoreExtension(type);
          if (extensionResult) {
            console.log('[WalletService] Restored extension session:', type, extensionResult);
            return extensionResult;
          }

          const wcResult = await this.tryRestoreWalletConnect(type);
          if (wcResult) {
            console.log('[WalletService] Restored WalletConnect session:', type, wcResult);
            return wcResult;
          }

          return null;
        } catch (error) {
          console.error(`[WalletService] Failed to restore ${type}:`, error);
          this.reportError(error as Error, {
            context: 'session_restoration',
            walletType: type,
          });
          return null;
        }
      }
    );

    const restoredSessions = await Promise.all(restorationPromises);

    restoredSessions.forEach(session => {
      if (session) results.push(session);
    });

    console.log('[WalletService] Session restoration complete. Restored:', results.length);
    return results;
  }

  private async tryRestoreExtension(type: WalletType): Promise<ConnectionResult | null> {
    const storedWalletId = this.loadExtensionConnection(type);
    if (!storedWalletId) return null;

    console.log('[WalletService] Attempting to restore extension:', type, storedWalletId);

    if (!this.isWalletInstalled(storedWalletId)) {
      console.log('[WalletService] Extension no longer installed:', storedWalletId);
      this.clearExtensionConnection(type);
      return null;
    }

    try {
      const result = await this.connectExtension(storedWalletId, type);

      transactionRouter.registerSession(type, null, result.address, result.chainId, storedWalletId);

      this.emitState(type, 'connected');

      return {
        type,
        address: result.address,
        chainId: result.chainId,
        walletId: storedWalletId,
      };
    } catch (error) {
      console.error(`[WalletService] Extension restoration failed for ${type}:`, error);
      this.clearExtensionConnection(type);
      return null;
    }
  }

  private async tryRestoreWalletConnect(type: WalletType): Promise<ConnectionResult | null> {
    try {
      console.log('[WalletService] Checking for WalletConnect session:', type);
      const provider = await this.getOrCreateWCProvider(type);
      if (!provider.session) {
        console.log('[WalletService] No WalletConnect session found for:', type);
        return null;
      }

      console.log('[WalletService] Found existing WalletConnect session:', type, provider.session);

      const namespace = this.getNamespace(type);
      const accounts = provider.session.namespaces[namespace]?.accounts || [];

      if (accounts.length === 0) {
        console.log('[WalletService] No accounts in session for:', type);
        return null;
      }

      const [chainId, address] = this.parseAccount(accounts[0], type);
      const walletId = provider.session.peer?.metadata?.name?.toLowerCase() || 'walletconnect';

      console.log('[WalletService] WalletConnect session details:', {
        type,
        address,
        chainId,
        walletId,
      });

      transactionRouter.registerSession(type, provider, address, chainId, walletId);
      this.emitState(type, 'connected');

      return { type, address, chainId, walletId };
    } catch (error) {
      console.error(`[WalletService] WalletConnect restoration failed for ${type}:`, error);
      return null;
    }
  }

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

  private async connectExtension(walletId: string, type: WalletType): Promise<ConnectionResult> {
    console.log('[WalletService] Connecting to extension:', type, walletId);
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

      this.extensionProviders.set(type, provider);
      this.setupExtensionListeners(provider, type);

      return {
        type,
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

      this.extensionProviders.set(type, cosmosProvider);

      return {
        type,
        address: account.bech32Address,
        chainId,
        walletId,
      };
    }

    throw new Error('Extension connection not supported for this wallet type');
  }

  private setupExtensionListeners(provider: any, type: WalletType): void {
    console.log('[WalletService] Setting up extension listeners for:', type);

    this.cleanupExtensionListeners(type);

    if (type === WalletType.EVM) {
      const onAccountsChanged = (accounts: string[]) => {
        console.log('[WalletService] Extension accounts changed:', type, accounts);
        if (accounts.length === 0) {
          this.handleSessionLost(type);
        }
      };

      const onDisconnect = () => {
        console.log('[WalletService] Extension disconnected:', type);
        this.handleSessionLost(type);
      };

      const onChainChanged = (chainId: string) => {
        console.log('[WalletService] Extension chain changed:', type, chainId);
      };

      provider.on('accountsChanged', onAccountsChanged);
      provider.on('disconnect', onDisconnect);
      provider.on('chainChanged', onChainChanged);

      this.extensionListeners.set(type, {
        accountsChanged: onAccountsChanged,
        disconnect: onDisconnect,
        chainChanged: onChainChanged,
      });
    }
  }

  private cleanupExtensionListeners(type: WalletType): void {
    const provider = this.extensionProviders.get(type);
    const listeners = this.extensionListeners.get(type);

    if (provider && listeners) {
      if (listeners.accountsChanged) {
        provider.removeListener('accountsChanged', listeners.accountsChanged);
      }
      if (listeners.disconnect) {
        provider.removeListener('disconnect', listeners.disconnect);
      }
      if (listeners.chainChanged) {
        provider.removeListener('chainChanged', listeners.chainChanged);
      }
    }

    this.extensionListeners.delete(type);
  }

  private async getOrCreateWCProvider(type: WalletType): Promise<any> {
    const existing = this.wcProviders.get(type);
    if (existing) {
      console.log('[WalletService] Using existing WalletConnect provider:', type);
      return existing;
    }

    const existingPromise = this.wcProviderPromises.get(type);
    if (existingPromise) {
      console.log('[WalletService] Waiting for existing WalletConnect initialization:', type);
      return existingPromise;
    }

    console.log('[WalletService] Initializing new WalletConnect provider:', type);
    const initPromise = this.initWalletConnectProvider(type);
    this.wcProviderPromises.set(type, initPromise);

    try {
      const provider = await initPromise;
      this.wcProviders.set(type, provider);
      this.wcProviderPromises.delete(type);
      console.log('[WalletConnect] Provider initialized:', type);
      return provider;
    } catch (error) {
      this.wcProviderPromises.delete(type);
      console.error('[WalletService] Failed to initialize WalletConnect provider:', type, error);
      throw error;
    }
  }

  private async initWalletConnectProvider(type: WalletType): Promise<any> {
    const UP = await loadWalletConnect();

    const provider = await UP.init({
      projectId: WALLETCONNECT_PROJECT_ID,
      metadata: WALLETCONNECT_METADATA,
      relayUrl: 'wss://relay.walletconnect.com',
    });

    this.setupProviderListeners(provider, type);

    return provider;
  }

  private setupProviderListeners(provider: any, type: WalletType): void {
    console.log('[WalletService] Setting up WalletConnect listeners for:', type);

    provider.on('display_uri', (uri: string) => {
      console.log('[WalletConnect] URI displayed:', type);
    });

    provider.on('session_ping', ({ id, topic }: { id: number; topic: string }) => {
      console.log('[WalletConnect] Session ping:', type, id, topic);
    });

    provider.on('session_event', ({ event, chainId }: { event: any; chainId: string }) => {
      console.log('[WalletConnect] Session event:', type, event, chainId);
    });

    provider.on('session_update', ({ topic, params }: { topic: string; params: any }) => {
      console.log('[WalletConnect] Session update:', type, topic, params);
    });

    provider.on('session_delete', ({ id, topic }: { id: number; topic: string }) => {
      console.log(
        '[WalletConnect] Session deleted (user disconnected from wallet):',
        type,
        id,
        topic
      );
      this.handleSessionLost(type);
    });
  }

  async handleSessionLost(type: WalletType): Promise<void> {
    console.log('[WalletService] Handling session lost for:', type);

    this.clearExtensionConnection(type);
    this.cleanupExtensionListeners(type);
    transactionRouter.unregisterSession(type);

    this.wcProviders.delete(type);
    this.extensionProviders.delete(type);

    this.emitState(type, 'disconnected');
  }

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
    console.log('[WalletService] Opening mobile wallet:', walletId, deepLink);
    window.open(deepLink, '_blank');
  }

  async connectWallet(type: WalletType, walletId: string): Promise<ConnectionResult> {
    console.log('[WalletService] Connect wallet requested:', type, walletId);

    const existingPromise = this.connectionQueue.get(type);
    if (existingPromise) {
      console.log('[WalletService] Using existing connection promise for:', type);
      return existingPromise;
    }

    if (this.isConnected(type)) {
      throw new Error(`${type} already connected. Disconnect first.`);
    }

    const promise = this._connectWallet(type, walletId).finally(() =>
      this.connectionQueue.delete(type)
    );

    this.connectionQueue.set(type, promise);
    return promise;
  }

  private async _connectWallet(type: WalletType, walletId: string): Promise<ConnectionResult> {
    const isMobileDevice = this.isMobile();
    const useWC = walletId === 'walletconnect';
    const hasExtension = !isMobileDevice && !useWC && this.isWalletInstalled(walletId);

    console.log('[WalletService] Connection strategy:', {
      type,
      walletId,
      isMobile: isMobileDevice,
      useWC,
      hasExtension,
    });

    if (hasExtension) {
      try {
        const result = await this.connectExtension(walletId, type);

        transactionRouter.registerSession(type, null, result.address, result.chainId, walletId);
        this.saveExtensionConnection(type, walletId);
        this.emitState(type, 'connected');

        return result;
      } catch (error) {
        console.error(
          '[WalletService] Extension connection failed, falling back to WalletConnect:',
          error
        );
      }
    }

    return this.connectWalletConnect(type, walletId, isMobileDevice, useWC);
  }

  private async connectWalletConnect(
    type: WalletType,
    walletId: string,
    isMobile: boolean,
    showModal: boolean
  ): Promise<ConnectionResult> {
    console.log('[WalletService] Starting WalletConnect connection:', type);

    this.connecting.add(type);
    this.emitState(type, 'connecting');

    try {
      if (!isMobile || showModal) {
        await this.setupModal(type);
      }

      const provider = await this.getOrCreateWCProvider(type);
      const chainConfig = this.getChainConfig(type);

      return await new Promise((resolve, reject) => {
        this.startConnectionTimeout(type, reject);

        let uriShown = false;
        const onUri = (uri: string) => {
          if (uriShown) return;
          uriShown = true;

          console.log('[WalletConnect] URI generated');

          if (isMobile && !showModal) {
            this.openMobileWallet(walletId, uri);
          } else {
            setTimeout(() => {
              this.modals.get(type)?.openModal({
                uri,
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
          .then(async (session: any) => {
            console.log('[WalletConnect] Connection successful:', type);

            const accounts = session.namespaces[chainConfig.namespace]?.accounts || [];
            if (accounts.length === 0) {
              throw new Error('No accounts found');
            }

            const [chainId, address] = this.parseAccount(accounts[0], type);
            const connectedWalletId = session.peer?.metadata?.name?.toLowerCase() || walletId;

            // if (type === WalletType.COSMOS) {
            //   try {
            //     await this.authenticateCosmos(provider, address, chainId as string);
            //   } catch (authError) {
            //     console.error('[WalletService] Cosmos authentication failed:', authError);
            //     throw new Error('Authentication signature rejected');
            //   }
            // }

            transactionRouter.registerSession(type, provider, address, chainId, connectedWalletId);

            this.cleanup(type);
            this.emitState(type, 'connected');

            resolve({ type, address, chainId, walletId: connectedWalletId });
          })
          .catch((error: any) => {
            console.error('[WalletConnect] Connection failed:', type, error);

            this.cleanup(type);
            this.emitState(type, 'failed');

            this.reportError(error, {
              context: 'walletconnect_connection',
              walletType: type,
              walletId,
            });

            reject(new Error(error.message || 'Connection failed'));
          });
      });
    } catch (error) {
      console.error('[WalletConnect] Setup failed:', type, error);
      this.cleanup(type);
      this.emitState(type, 'failed');
      throw error;
    }
  }

  // private async authenticateCosmos(provider: any, address: string, chainId: string): Promise<void> {
  //   console.log('[WalletService] Authenticating Cosmos wallet:', address);

  //   const timestamp = Date.now();
  //   const authMessage = {
  //     chain_id: chainId,
  //     account_number: '0',
  //     sequence: '0',
  //     fee: { amount: [], gas: '0' },
  //     msgs: [
  //       {
  //         type: 'sign/MsgSignData',
  //         value: {
  //           signer: address,
  //           data: btoa(`Authentication request at ${timestamp}`),
  //         },
  //       },
  //     ],
  //     memo: 'Authenticate wallet connection',
  //   };

  //   await provider.request(
  //     {
  //       method: 'cosmos_signAmino',
  //       params: {
  //         signerAddress: address,
  //         signDoc: authMessage,
  //       },
  //     },
  //     `cosmos:${chainId}`
  //   );

  //   console.log('[WalletService] Cosmos authentication successful');
  // }

  private async setupModal(type: WalletType): Promise<void> {
    if (this.modals.has(type)) return;

    console.log('[WalletService] Setting up WalletConnect modal for:', type);

    const config: WalletConnectModalConfig = {
      projectId: WALLETCONNECT_PROJECT_ID,
      chains: this.getChainConfig(type).chains,
      themeMode: 'dark',
    };

    this.modals.set(type, new WalletConnectModal(config));
  }

  private startConnectionTimeout(type: WalletType, reject: (error: Error) => void): void {
    this.clearConnectionTimeout(type);

    const timeout = window.setTimeout(() => {
      console.log('[WalletService] Connection timeout for:', type);
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
    setTimeout(() => this.modals.get(type)?.closeModal(), MODAL_DELAY);
  }

  async disconnect(type: WalletType): Promise<void> {
    console.log('[WalletService] Disconnecting:', type);

    try {
      this.clearConnectionTimeout(type);
      this.connecting.delete(type);
      this.clearExtensionConnection(type);
      this.cleanupExtensionListeners(type);

      transactionRouter.unregisterSession(type);

      this.extensionProviders.delete(type);

      const wcProvider = this.wcProviders.get(type);
      if (wcProvider?.session) {
        console.log('[WalletConnect] Disconnecting session:', type);
        try {
          await wcProvider.disconnect();
          console.log('[WalletConnect] Session disconnected successfully:', type);
        } catch (error) {
          console.error('[WalletConnect] Error disconnecting:', type, error);
        }
      }

      this.wcProviders.delete(type);
      this.wcProviderPromises.delete(type);

      this.modals.get(type)?.closeModal();

      this.emitState(type, 'disconnected');

      console.log('[WalletService] Disconnect complete:', type);
    } catch (error) {
      console.error('[WalletService] Disconnect error:', type, error);

      this.clearExtensionConnection(type);
      this.cleanupExtensionListeners(type);
      this.wcProviders.delete(type);
      this.wcProviderPromises.delete(type);
      this.extensionProviders.delete(type);

      throw error;
    }
  }

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
    return this.extensionProviders.get(type) || this.wcProviders.get(type);
  }

  isConnecting(type?: WalletType): boolean {
    return type ? this.connecting.has(type) : this.connecting.size > 0;
  }

  isConnected(type: WalletType): boolean {
    return !!(this.extensionProviders.has(type) || this.wcProviders.get(type)?.session);
  }

  getActiveSessions(): WalletType[] {
    return [WalletType.EVM, WalletType.COSMOS, WalletType.STELLAR].filter(type =>
      this.isConnected(type)
    );
  }

  onConnectionStateChange(callback: ConnectionCallback): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private emitState(type: WalletType, state: ConnectionState): void {
    this.listeners.forEach(listener => {
      try {
        listener(type, state);
      } catch (error) {
        console.error('[WalletService] Listener error:', error);
      }
    });
  }
}

export const walletService = new WalletService();
