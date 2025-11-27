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
  setNetwork,
} from '../config/chains';
import { CHAIN_EVENTS, CHAIN_METHODS, WalletType } from '../constants/Wallet';

const CONNECTION_TIMEOUT = 120000;
const MODAL_CLOSE_DELAY = 300;
const SESSION_CLEANUP_DELAY = 1000;

type ConnectionEventCallback = (
  type: WalletType,
  state: 'connecting' | 'connected' | 'failed' | 'cancelled'
) => void;

class WalletService {
  private evmProvider: any = null;
  private cosmosProvider: any = null;
  private wcEvmProvider: any = null;
  private wcCosmosProvider: any = null;
  private wcStellarProvider: any = null;

  private evmWeb3Modal: Web3Modal | null = null;
  private cosmosWeb3Modal: Web3Modal | null = null;
  private stellarWeb3Modal: Web3Modal | null = null;

  private connectionInProgress: Set<WalletType> = new Set();
  private activeTimeouts: Map<WalletType, number> = new Map();
  private modalClosedByUser: Map<WalletType, boolean> = new Map();
  private connectionListeners: Set<ConnectionEventCallback> = new Set();
  private visibilityHandlers: Map<WalletType, () => void> = new Map();
  private pendingConnections: Map<WalletType, any> = new Map();

  private currentNetwork: NetworkType = 'mainnet';

  constructor() {
    console.debug('[WalletService] Initializing WalletService');
    this.setNetwork(this.currentNetwork);
    this.setupModalCloseListeners();
  }

  private setupModalCloseListeners(): void {
    const checkModalClosure = (type: WalletType, modal: Web3Modal | null) => {
      if (!modal) return;

      console.log(checkModalClosure);
      const observer = new MutationObserver(() => {
        const modalElement = document.querySelector('wcm-modal');
        if (!modalElement && this.connectionInProgress.has(type)) {
          console.debug(`[WalletService] Modal closed by user for ${type}`);
          this.handleModalClosure(type);
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });
    };
  }

  private async handleModalClosure(type: WalletType): Promise<void> {
    if (!this.connectionInProgress.has(type)) return;

    console.debug(`[WalletService] Handling modal closure for ${type}`);
    this.modalClosedByUser.set(type, true);
    await this.cancelConnection(type);
  }

  onConnectionStateChange(callback: ConnectionEventCallback): () => void {
    this.connectionListeners.add(callback);
    return () => this.connectionListeners.delete(callback);
  }

  private emitConnectionState(
    type: WalletType,
    state: 'connecting' | 'connected' | 'failed' | 'cancelled'
  ): void {
    console.debug(`[WalletService] State: ${type} -> ${state}`);
    this.connectionListeners.forEach(listener => {
      try {
        listener(type, state);
      } catch (error) {
        console.error('[WalletService] Listener error:', error);
      }
    });
  }

  async setNetwork(network: NetworkType): Promise<void> {
    if (this.currentNetwork === network) return;

    console.debug(`[WalletService] Network: ${network}`);
    this.currentNetwork = network;
    setNetwork(network);

    transactionRouter.clearAllSessions();

    await Promise.all([
      this.disconnect(WalletType.EVM),
      this.disconnect(WalletType.COSMOS),
      this.disconnect(WalletType.STELLAR),
    ]);

    this.wcEvmProvider = null;
    this.wcCosmosProvider = null;
    this.wcStellarProvider = null;
  }

  getNetwork(): NetworkType {
    return this.currentNetwork;
  }

  private isMobile(): boolean {
    const ua = navigator.userAgent || navigator.vendor || (window as any).opera;
    return /android/i.test(ua) || (/iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream);
  }

  private detectInstalledWallets(): { [key: string]: boolean } {
    const win = window as any;
    return {
      metamask: !!win.ethereum?.isMetaMask,
      trust: !!win.ethereum?.isTrust,
      coinbase: !!win.ethereum?.isCoinbaseWallet,
      phantom: !!(win.phantom?.ethereum || win.solana),
      rabby: !!win.ethereum?.isRabby,
      brave: !!win.ethereum?.isBraveWallet,
      keplr: !!win.keplr,
      leap: !!win.leap,
      freighter: !!win.freighter,
    };
  }

  private isWalletInstalled(walletId: string): boolean {
    const installed = this.detectInstalledWallets();
    const isInstalled = installed[walletId.toLowerCase()] || false;
    console.debug(`[WalletService] ${walletId} installed: ${isInstalled}`);
    return isInstalled;
  }

  private async connectViaExtension(
    walletId: string,
    type: WalletType
  ): Promise<{ address: string; chainId: string | number }> {
    const win = window as any;

    if (type === WalletType.EVM) {
      let provider = null;

      switch (walletId.toLowerCase()) {
        case 'metamask':
          provider = win.ethereum?.isMetaMask ? win.ethereum : null;
          break;
        case 'trust':
          provider = win.ethereum?.isTrust ? win.ethereum : null;
          break;
        case 'coinbase':
          provider = win.ethereum?.isCoinbaseWallet ? win.ethereum : null;
          break;
        case 'rabby':
          provider = win.ethereum?.isRabby ? win.ethereum : null;
          break;
        case 'brave':
          provider = win.ethereum?.isBraveWallet ? win.ethereum : null;
          break;
        default:
          provider = win.ethereum;
      }

      if (!provider) throw new Error('Extension not found');

      const accounts = await provider.request({ method: 'eth_requestAccounts' });
      const chainId = await provider.request({ method: 'eth_chainId' });
      console.log(chainId, 'chaind from wallet service ----');

      this.evmProvider = provider;
      return { address: accounts[0], chainId: parseInt(chainId, 16) };
    }

    if (type === WalletType.COSMOS) {
      if (walletId.toLowerCase() === 'keplr' && win.keplr) {
        const chainId = getCosmosChains()[0].chainId;
        await win.keplr.enable(chainId);
        const account = await win.keplr.getKey(chainId);
        this.cosmosProvider = win.keplr;
        return { address: account.bech32Address, chainId };
      }

      if (walletId.toLowerCase() === 'leap' && win.leap) {
        const chainId = getCosmosChains()[0].chainId;
        await win.leap.enable(chainId);
        const account = await win.leap.getKey(chainId);
        this.cosmosProvider = win.leap;
        return { address: account.bech32Address, chainId };
      }
    }

    throw new Error('Extension connection not supported');
  }

  private getWalletDeepLink(
    walletId: string,
    uri: string
  ): { deepLink: string; fallbackUrl?: string } {
    const encoded = encodeURIComponent(uri);
    const id = walletId.toLowerCase();

    const config: Record<string, { deepLink: string; fallbackUrl?: string }> = {
      metamask: {
        deepLink: `https://metamask.app.link/wc?uri=${encoded}`,
        fallbackUrl: 'https://metamask.io/download/',
      },
      trust: {
        deepLink: `https://link.trustwallet.com/wc?uri=${encoded}`,
        fallbackUrl: 'https://trustwallet.com/download',
      },
      rainbow: {
        deepLink: `https://rnbwapp.com/wc?uri=${encoded}`,
        fallbackUrl: 'https://rainbow.me/download',
      },
      coinbase: {
        deepLink: `https://go.cb-w.com/wc?uri=${encoded}`,
        fallbackUrl: 'https://www.coinbase.com/wallet',
      },
      keplr: {
        deepLink: `keplrwallet://wcV2?uri=${encoded}`,
        fallbackUrl: 'https://www.keplr.app/',
      },
      leap: {
        deepLink: `leapcosmos://wcV2?uri=${encoded}`,
        fallbackUrl: 'https://www.leapwallet.io/',
      },
      freighter: {
        deepLink: `freighter://wc?uri=${encoded}`,
        fallbackUrl: 'https://www.freighter.app/',
      },
    };

    return config[id] || { deepLink: uri };
  }

  private openMobileWallet(walletId: string, uri: string, type: WalletType): void {
    const { deepLink, fallbackUrl } = this.getWalletDeepLink(walletId, uri);

    const link = document.createElement('a');
    link.href = deepLink;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    const startTime = Date.now();
    const existingHandler = this.visibilityHandlers.get(type);
    if (existingHandler) {
      document.removeEventListener('visibilitychange', existingHandler);
    }

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        setTimeout(() => {
          const elapsed = Date.now() - startTime;
          if (elapsed < 2000 && this.connectionInProgress.has(type) && fallbackUrl) {
            const install = window.confirm(`${walletId} might not be installed. Install now?`);
            if (install) window.open(fallbackUrl, '_blank');
          }
        }, 500);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      this.visibilityHandlers.delete(type);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    this.visibilityHandlers.set(type, handleVisibilityChange);
  }

  private clearConnectionTimeout(type: WalletType): void {
    const timeout = this.activeTimeouts.get(type);
    if (timeout) {
      window.clearTimeout(timeout);
      this.activeTimeouts.delete(type);
    }
  }

  private setConnectionTimeout(type: WalletType, rejectFn: (error: Error) => void): void {
    this.clearConnectionTimeout(type);

    const timeout = window.setTimeout(() => {
      console.error(`[WalletService] Timeout: ${type}`);
      this.handleConnectionFailure(type, 'Connection timeout');
      rejectFn(new Error('Connection timeout. Please try again.'));
    }, CONNECTION_TIMEOUT);

    this.activeTimeouts.set(type, timeout);
  }

  private async handleConnectionFailure(type: WalletType, reason: string): Promise<void> {
    console.error(`[WalletService] Connection failed: ${type} - ${reason}`);

    this.connectionInProgress.delete(type);
    this.closeModalForType(type);

    await this.cleanupIncompleteSession(type);

    this.emitConnectionState(type, 'failed');
  }

  private async cleanupIncompleteSession(type: WalletType): Promise<void> {
    console.debug(`[WalletService] Cleaning incomplete session: ${type}`);

    try {
      const provider =
        type === WalletType.EVM
          ? this.wcEvmProvider
          : type === WalletType.COSMOS
            ? this.wcCosmosProvider
            : this.wcStellarProvider;

      if (provider) {
        if (provider.client) {
          const activeSessions = provider.client.session?.getAll() || [];
          for (const session of activeSessions) {
            try {
              await provider.client.disconnect({
                topic: session.topic,
                reason: { code: 6000, message: 'User cancelled connection' },
              });
            } catch (err) {
              console.warn('[WalletService] Session cleanup error:', err);
            }
          }
        }

        provider.removeAllListeners();

        if (type === WalletType.EVM) this.wcEvmProvider = null;
        else if (type === WalletType.COSMOS) this.wcCosmosProvider = null;
        else this.wcStellarProvider = null;
      }

      await new Promise(resolve => setTimeout(resolve, SESSION_CLEANUP_DELAY));
    } catch (error) {
      console.error(`[WalletService] Cleanup error for ${type}:`, error);
    }
  }

  private closeModalForType(type: WalletType): void {
    setTimeout(() => {
      if (type === WalletType.EVM) this.evmWeb3Modal?.closeModal();
      else if (type === WalletType.COSMOS) this.cosmosWeb3Modal?.closeModal();
      else if (type === WalletType.STELLAR) this.stellarWeb3Modal?.closeModal();
    }, MODAL_CLOSE_DELAY);
  }

  private hasActiveSession(type: WalletType): boolean {
    return (
      (type === WalletType.EVM && !!this.wcEvmProvider?.session) ||
      (type === WalletType.COSMOS && !!this.wcCosmosProvider?.session) ||
      (type === WalletType.STELLAR && !!this.wcStellarProvider?.session)
    );
  }

  private async initializeProvider(type: WalletType): Promise<any> {
    const config = {
      projectId: WALLETCONNECT_PROJECT_ID,
      metadata: WALLETCONNECT_METADATA,
      relayUrl: 'wss://relay.walletconnect.com',
    };

    let provider: any;

    if (type === WalletType.EVM) {
      if (this.wcEvmProvider?.client?.session) return this.wcEvmProvider;
      this.wcEvmProvider = await UniversalProvider.init(config);
      provider = this.wcEvmProvider;
    } else if (type === WalletType.COSMOS) {
      if (this.wcCosmosProvider?.client?.session) return this.wcCosmosProvider;
      this.wcCosmosProvider = await UniversalProvider.init(config);
      provider = this.wcCosmosProvider;
    } else {
      if (this.wcStellarProvider?.client?.session) return this.wcStellarProvider;
      this.wcStellarProvider = await UniversalProvider.init(config);
      provider = this.wcStellarProvider;
    }

    this.setupSessionListeners(provider, type);
    return provider;
  }

  private setupSessionListeners(provider: any, type: WalletType): void {
    if (!provider) return;

    provider.on('session_delete', () => {
      console.warn(`[WalletService] Session deleted: ${type}`);
      this.handleSessionLost(type);
    });

    provider.on('disconnect', () => {
      console.warn(`[WalletService] Disconnected: ${type}`);
      this.handleSessionLost(type);
    });
  }

  private async handleSessionLost(type: WalletType): Promise<void> {
    transactionRouter.unregisterSession(type);

    if (type === WalletType.EVM) this.wcEvmProvider = null;
    else if (type === WalletType.COSMOS) this.wcCosmosProvider = null;
    else if (type === WalletType.STELLAR) this.wcStellarProvider = null;
  }

  async connectWalletConnect(
    type: WalletType,
    walletId?: string
  ): Promise<{ address: string; chainId: string | number; walletId: string }> {
    if (this.connectionInProgress.has(type)) {
      throw new Error(`Connection already in progress for ${type}`);
    }

    if (this.hasActiveSession(type)) {
      throw new Error(`${type} already connected. Disconnect first.`);
    }

    const isMobileDevice = this.isMobile();
    const isWalletConnectOption = walletId === 'walletconnect';
    const walletInstalled = walletId && !isMobileDevice ? this.isWalletInstalled(walletId) : false;

    if (walletInstalled && !isWalletConnectOption) {
      console.debug(`[WalletService] Using extension: ${walletId}`);
      try {
        const result = await this.connectViaExtension(walletId!, type);
        transactionRouter.registerSession(type, null, result.address, result.chainId, walletId!);
        this.emitConnectionState(type, 'connected');
        return { ...result, walletId: walletId! };
      } catch (error) {
        console.error('[WalletService] Extension connection failed:', error);
      }
    }

    this.connectionInProgress.add(type);
    this.modalClosedByUser.set(type, false);
    this.emitConnectionState(type, 'connecting');

    let web3Modal: Web3Modal | null = null;
    let wcProvider: any = null;

    try {
      const shouldShowModal = !isMobileDevice || isWalletConnectOption;

      if (shouldShowModal) {
        const modalConfig: Web3ModalConfig = {
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

        if (type === WalletType.EVM && !this.evmWeb3Modal) {
          this.evmWeb3Modal = new Web3Modal(modalConfig);
        } else if (type === WalletType.COSMOS && !this.cosmosWeb3Modal) {
          this.cosmosWeb3Modal = new Web3Modal(modalConfig);
        } else if (type === WalletType.STELLAR && !this.stellarWeb3Modal) {
          this.stellarWeb3Modal = new Web3Modal(modalConfig);
        }

        web3Modal =
          type === WalletType.EVM
            ? this.evmWeb3Modal
            : type === WalletType.COSMOS
              ? this.cosmosWeb3Modal
              : this.stellarWeb3Modal;
      }

      wcProvider = await this.initializeProvider(type);

      let optionalNamespaces: any;
      let standaloneChains: string[];

      if (type === WalletType.EVM) {
        const rpcMap: Record<string, string> = {};
        getEVMChains().forEach(chain => {
          rpcMap[chain.chainId.toString()] = chain.rpcUrl;
        });

        optionalNamespaces = {
          eip155: {
            methods: CHAIN_METHODS.evm,
            chains: getEVMChains().map(chain => `eip155:${chain.chainId}`),
            events: CHAIN_EVENTS.evm,
            rpcMap,
          },
        };
        standaloneChains = getEVMChains().map(chain => `eip155:${chain.chainId}`);
      } else if (type === WalletType.COSMOS) {
        const rpcMap: Record<string, string> = {};
        getCosmosChains().forEach(chain => {
          rpcMap[chain.chainId] = chain.rpc;
        });

        optionalNamespaces = {
          cosmos: {
            methods: CHAIN_METHODS.cosmos,
            chains: getCosmosChains().map(chain => `cosmos:${chain.chainId}`),
            events: CHAIN_EVENTS.cosmos,
            rpcMap,
          },
        };
        standaloneChains = getCosmosChains().map(chain => `cosmos:${chain.chainId}`);
      } else {
        const stellarConfig = getStellarConfig();
        const chainId = `stellar:${stellarConfig.chainId}`;

        optionalNamespaces = {
          stellar: {
            methods: CHAIN_METHODS.stellar,
            chains: [chainId],
            events: CHAIN_EVENTS.stellar,
            rpcMap: { [stellarConfig.chainId]: stellarConfig.horizonUrl },
          },
        };
        standaloneChains = [chainId];
      }

      const namespaceKey =
        type === WalletType.EVM ? 'eip155' : type === WalletType.COSMOS ? 'cosmos' : 'stellar';

      return new Promise((resolve, reject) => {
        this.setConnectionTimeout(type, reject);
        this.pendingConnections.set(type, { resolve, reject });

        let uriDisplayed = false;

        const cleanup = () => {
          wcProvider?.removeListener('display_uri', onDisplayUri);
          this.clearConnectionTimeout(type);
          this.connectionInProgress.delete(type);
          this.pendingConnections.delete(type);

          const handler = this.visibilityHandlers.get(type);
          if (handler) {
            document.removeEventListener('visibilitychange', handler);
            this.visibilityHandlers.delete(type);
          }
        };

        const onDisplayUri = (uri: string) => {
          if (uriDisplayed) return;
          uriDisplayed = true;

          if (isMobileDevice && walletId && !isWalletConnectOption) {
            this.openMobileWallet(walletId, uri, type);
          } else if (web3Modal) {
            setTimeout(() => {
              try {
                web3Modal!.openModal({ uri, standaloneChains });
              } catch (err) {
                console.error('[WalletService] Modal error:', err);
              }
            }, 300);
          }
        };

        wcProvider.once('display_uri', onDisplayUri);

        wcProvider
          .connect({ optionalNamespaces })
          .then((session: any) => {
            if (this.modalClosedByUser.get(type)) {
              this.closeModalForType(type);
              cleanup();
              this.emitConnectionState(type, 'cancelled');
              reject(new Error('Connection cancelled by user'));
              return;
            }

            const accounts = session.namespaces[namespaceKey]?.accounts || [];
            if (accounts.length === 0) {
              throw new Error(`No accounts found for ${type}`);
            }

            const fullAccount = accounts[0];
            const parts = fullAccount.split(':');
            const address = parts[2] || '';
            const chainId = type === WalletType.EVM ? parseInt(parts[1]) : parts[1];

            transactionRouter.registerSession(
              type,
              wcProvider,
              address,
              chainId,
              walletId || 'walletconnect'
            );

            this.closeModalForType(type);
            cleanup();
            this.emitConnectionState(type, 'connected');

            resolve({ address, chainId, walletId: walletId || 'walletconnect' });
          })
          .catch(async (err: any) => {
            if (this.modalClosedByUser.get(type)) {
              this.closeModalForType(type);
              cleanup();
              await this.cleanupIncompleteSession(type);
              this.emitConnectionState(type, 'cancelled');
              reject(new Error('Connection cancelled by user'));
              return;
            }

            console.error(`[WalletService] Connection error: ${type}`, err);

            this.closeModalForType(type);
            cleanup();
            await this.cleanupIncompleteSession(type);
            this.emitConnectionState(type, 'failed');

            let errorMessage = 'Failed to connect wallet';
            if (
              err.message?.includes('User rejected') ||
              err.message?.includes('User disapproved')
            ) {
              errorMessage = 'Connection rejected by user';
            } else if (err.message?.includes('timeout')) {
              errorMessage = 'Connection timeout';
            } else if (err.message?.includes('Modal closed')) {
              errorMessage = 'Connection cancelled';
            } else if (err.message) {
              errorMessage = err.message;
            }

            reject(new Error(errorMessage));
          });
      });
    } catch (error) {
      console.error(`[WalletService] Init error: ${type}`, error);
      this.connectionInProgress.delete(type);
      this.clearConnectionTimeout(type);
      this.closeModalForType(type);
      await this.cleanupIncompleteSession(type);
      this.emitConnectionState(type, 'failed');
      throw new Error(`Failed to initialize: ${(error as Error).message}`);
    }
  }

  async connectEVM(
    walletId: string
  ): Promise<{ address: string; chainId: number; walletId: string }> {
    const { address, chainId } = await this.connectWalletConnect(WalletType.EVM, walletId);
    console.log(chainId, 'hii i am cahinid for -+=======');
    return { address, chainId: chainId as number, walletId };
  }

  async connectCosmos(
    walletId: string
  ): Promise<{ address: string; chainId: string; walletId: string }> {
    const { address, chainId } = await this.connectWalletConnect(WalletType.COSMOS, walletId);
    return { address, chainId: chainId as string, walletId };
  }

  async connectStellar(walletId: string): Promise<{ address: string; walletId: string }> {
    const { address } = await this.connectWalletConnect(WalletType.STELLAR, walletId);
    return { address, walletId };
  }

  async disconnect(walletType: WalletType) {
    try {
      this.clearConnectionTimeout(walletType);
      this.connectionInProgress.delete(walletType);
      this.pendingConnections.delete(walletType);

      const handler = this.visibilityHandlers.get(walletType);
      if (handler) {
        document.removeEventListener('visibilitychange', handler);
        this.visibilityHandlers.delete(walletType);
      }

      transactionRouter.unregisterSession(walletType);

      if (walletType === WalletType.EVM) {
        this.evmProvider = null;
        if (this.wcEvmProvider?.session) {
          await Promise.race([
            this.wcEvmProvider.disconnect(),
            new Promise(resolve => setTimeout(resolve, 3000)),
          ]);
          this.wcEvmProvider.removeAllListeners();
        }
        this.wcEvmProvider = null;
        this.evmWeb3Modal?.closeModal();
      } else if (walletType === WalletType.COSMOS) {
        this.cosmosProvider = null;
        if (this.wcCosmosProvider?.session) {
          await Promise.race([
            this.wcCosmosProvider.disconnect(),
            new Promise(resolve => setTimeout(resolve, 3000)),
          ]);
          this.wcCosmosProvider.removeAllListeners();
        }
        this.wcCosmosProvider = null;
        this.cosmosWeb3Modal?.closeModal();
      } else if (walletType === WalletType.STELLAR) {
        if (this.wcStellarProvider?.session) {
          await Promise.race([
            this.wcStellarProvider.disconnect(),
            new Promise(resolve => setTimeout(resolve, 3000)),
          ]);
          this.wcStellarProvider.removeAllListeners();
        }
        this.wcStellarProvider = null;
        this.stellarWeb3Modal?.closeModal();
      }
    } catch (error) {
      console.error('[WalletService] Disconnect error:', error);
      throw error;
    }
  }

  getProvider(walletType: WalletType) {
    return walletType === WalletType.EVM
      ? this.evmProvider || this.wcEvmProvider
      : walletType === WalletType.COSMOS
        ? this.cosmosProvider || this.wcCosmosProvider
        : this.wcStellarProvider;
  }

  isConnecting(walletType?: WalletType): boolean {
    return walletType
      ? this.connectionInProgress.has(walletType)
      : this.connectionInProgress.size > 0;
  }

  async cancelConnection(walletType: WalletType): Promise<void> {
    console.debug(`[WalletService] Cancel: ${walletType}`);

    this.modalClosedByUser.set(walletType, true);
    this.clearConnectionTimeout(walletType);
    this.connectionInProgress.delete(walletType);
    this.closeModalForType(walletType);

    const handler = this.visibilityHandlers.get(walletType);
    if (handler) {
      document.removeEventListener('visibilitychange', handler);
      this.visibilityHandlers.delete(walletType);
    }

    const pending = this.pendingConnections.get(walletType);
    if (pending) {
      pending.reject(new Error('Connection cancelled by user'));
      this.pendingConnections.delete(walletType);
    }

    await this.cleanupIncompleteSession(walletType);
    this.emitConnectionState(walletType, 'cancelled');
  }

  isConnected(walletType: WalletType): boolean {
    return this.hasActiveSession(walletType);
  }

  getActiveSessions(): WalletType[] {
    const active: WalletType[] = [];
    if (this.hasActiveSession(WalletType.EVM)) active.push(WalletType.EVM);
    if (this.hasActiveSession(WalletType.COSMOS)) active.push(WalletType.COSMOS);
    if (this.hasActiveSession(WalletType.STELLAR)) active.push(WalletType.STELLAR);
    return active;
  }

  getInstalledWallets(): string[] {
    const installed = this.detectInstalledWallets();
    return Object.keys(installed).filter(key => installed[key]);
  }
}

export const walletService = new WalletService();
