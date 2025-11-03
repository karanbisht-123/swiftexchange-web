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

  private currentNetwork: NetworkType = 'mainnet';

  constructor() {
    console.debug(
      '[WalletService] Initializing WalletService with default network:',
      this.currentNetwork
    );
    this.setNetwork(this.currentNetwork);
  }

  onConnectionStateChange(callback: ConnectionEventCallback): () => void {
    console.debug('[WalletService] Adding connection state change listener');
    this.connectionListeners.add(callback);
    return () => {
      console.debug('[WalletService] Removing connection state change listener');
      this.connectionListeners.delete(callback);
    };
  }

  private emitConnectionState(
    type: WalletType,
    state: 'connecting' | 'connected' | 'failed' | 'cancelled'
  ): void {
    console.debug(`[WalletService] Emitting connection state for ${type}: ${state}`);
    this.connectionListeners.forEach(listener => {
      try {
        listener(type, state);
      } catch (error) {
        console.error('[WalletService] Error in connection listener:', error);
      }
    });
  }

  async setNetwork(network: NetworkType): Promise<void> {
    if (this.currentNetwork === network) {
      console.debug(`[WalletService] Network already set to ${network}, skipping`);
      return;
    }

    console.debug(`[WalletService] Switching network to ${network}`);
    this.currentNetwork = network;
    setNetwork(network);

    console.debug('[WalletService] Clearing all sessions in transaction router');
    transactionRouter.clearAllSessions();

    console.debug('[WalletService] Disconnecting all existing sessions');
    await Promise.all([
      this.disconnect(WalletType.EVM),
      this.disconnect(WalletType.COSMOS),
      this.disconnect(WalletType.STELLAR),
    ]);

    console.debug('[WalletService] Resetting providers');
    this.wcEvmProvider = null;
    this.wcCosmosProvider = null;
    this.wcStellarProvider = null;
  }

  getNetwork(): NetworkType {
    console.debug('[WalletService] Retrieving current network:', this.currentNetwork);
    return this.currentNetwork;
  }

  private isMobile(): boolean {
    const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
    const isMobile =
      /android/i.test(userAgent) ||
      (/iPad|iPhone|iPod/.test(userAgent) && !(window as any).MSStream);
    console.debug('[WalletService] Checking if device is mobile:', isMobile);
    return isMobile;
  }

  private isWalletInstalled(walletId: string): boolean {
    const walletId_lower = walletId.toLowerCase();
    const isInstalled =
      (walletId_lower === 'metamask' && (window as any).ethereum?.isMetaMask) ||
      (walletId_lower === 'trust' && (window as any).ethereum?.isTrust) ||
      (walletId_lower === 'coinbase' && (window as any).ethereum?.isCoinbaseWallet);
    console.debug(`[WalletService] Checking if wallet ${walletId} is installed: ${isInstalled}`);
    return isInstalled;
  }

  private getWalletDeepLink(
    walletId: string,
    uri: string
  ): { deepLink: string; fallbackUrl?: string } {
    const encodedUri = encodeURIComponent(uri);
    const walletId_lower = walletId.toLowerCase();

    const walletConfig: Record<string, { deepLink: string; fallbackUrl?: string }> = {
      metamask: {
        deepLink: `https://metamask.app.link/wc?uri=${encodedUri}`,
        fallbackUrl: 'https://metamask.io/download/',
      },
      trust: {
        deepLink: `https://link.trustwallet.com/wc?uri=${encodedUri}`,
        fallbackUrl: 'https://trustwallet.com/download',
      },
      rainbow: {
        deepLink: `https://rnbwapp.com/wc?uri=${encodedUri}`,
        fallbackUrl: 'https://rainbow.me/download',
      },
      zerion: {
        deepLink: `https://wallet.zerion.io/wc?uri=${encodedUri}`,
        fallbackUrl: 'https://zerion.io/download',
      },
      coinbase: {
        deepLink: `https://go.cb-w.com/wc?uri=${encodedUri}`,
        fallbackUrl: 'https://www.coinbase.com/wallet',
      },
      freighter: {
        deepLink: `freighter://wc?uri=${encodedUri}`,
        fallbackUrl: 'https://www.freighter.app/',
      },
      keplr: {
        deepLink: `keplrwallet://wcV2?uri=${encodedUri}`,
        fallbackUrl: 'https://www.keplr.app/',
      },
      leap: {
        deepLink: `leapcosmos://wcV2?uri=${encodedUri}`,
        fallbackUrl: 'https://www.leapwallet.io/',
      },
      exodus: {
        deepLink: `exodus://wc?uri=${encodedUri}`,
        fallbackUrl: 'https://www.exodus.com/download',
      },
      argent: {
        deepLink: `https://argent.link/app/wc?uri=${encodedUri}`,
        fallbackUrl: 'https://www.argent.xyz/download',
      },
      safe: {
        deepLink: `https://app.safe.global/wc?uri=${encodedUri}`,
        fallbackUrl: 'https://safe.global/',
      },
      ambire: {
        deepLink: `https://wallet.ambire.com/wc?uri=${encodedUri}`,
        fallbackUrl: 'https://www.ambire.com/',
      },
      phantom: {
        deepLink: `https://phantom.app/ul/v1/browse/${encodedUri}?ref=https://yourapp.com`,
        fallbackUrl: 'https://phantom.app/download',
      },
    };

    const deepLinkConfig = walletConfig[walletId_lower] || { deepLink: uri };
    console.debug(`[WalletService] Generated deep link for ${walletId}:`, deepLinkConfig);
    return deepLinkConfig;
  }

  private openMobileWallet(walletId: string, uri: string, type: WalletType): void {
    const { deepLink, fallbackUrl } = this.getWalletDeepLink(walletId, uri);
    console.debug(`[WalletService] Opening ${walletId} deep link: ${deepLink}`);

    const link = document.createElement('a');
    link.href = deepLink;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    const startTime = Date.now();
    let checkTimer: number | undefined;
    const existingHandler = this.visibilityHandlers.get(type);
    if (existingHandler) {
      console.debug(`[WalletService] Removing existing visibility handler for ${type}`);
      document.removeEventListener('visibilitychange', existingHandler);
      this.visibilityHandlers.delete(type);
    }

    const handleVisibilityChange = () => {
      if (document.hidden) {
        console.debug('[WalletService] Visibility changed: User switched to wallet app');
        if (checkTimer) {
          window.clearTimeout(checkTimer);
        }
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        this.visibilityHandlers.delete(type);
      } else {
        console.debug('[WalletService] Visibility changed: User returned to the page');
        setTimeout(() => {
          if (this.connectionInProgress.has(type)) {
            console.debug('[WalletService] Connection still pending after user returned');
          }
        }, 500);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    this.visibilityHandlers.set(type, handleVisibilityChange);
    console.debug(`[WalletService] Set visibility handler for ${type}`);

    checkTimer = window.setTimeout(() => {
      const elapsed = Date.now() - startTime;

      if (elapsed >= 2500 && document.hasFocus() && fallbackUrl) {
        console.warn('[WalletService] Wallet app might not be installed');

        const shouldInstall = window.confirm(
          `${walletId} app might not be installed. Would you like to install it?`
        );

        if (shouldInstall) {
          console.debug(
            `[WalletService] User chose to install ${walletId}, redirecting to ${fallbackUrl}`
          );
          window.open(fallbackUrl, '_blank');
        }
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        this.visibilityHandlers.delete(type);
      }
    }, 2500);
  }

  private clearConnectionTimeout(type: WalletType): void {
    const timeout = this.activeTimeouts.get(type);
    if (timeout) {
      console.debug(`[WalletService] Clearing connection timeout for ${type}`);
      window.clearTimeout(timeout);
      this.activeTimeouts.delete(type);
    }
  }

  private setConnectionTimeout(type: WalletType, rejectFn: (error: Error) => void): void {
    this.clearConnectionTimeout(type);

    const timeout = window.setTimeout(() => {
      console.error(`[WalletService] Connection timeout for ${type}`);
      this.connectionInProgress.delete(type);
      this.closeModalForType(type);
      this.emitConnectionState(type, 'failed');
      rejectFn(new Error('Connection timeout. Please try again.'));
    }, CONNECTION_TIMEOUT);

    console.debug(`[WalletService] Set connection timeout for ${type}`);
    this.activeTimeouts.set(type, timeout);
  }

  private closeModalForType(type: WalletType): void {
    console.debug(`[WalletService] Closing modal for ${type}`);
    setTimeout(() => {
      if (type === WalletType.EVM) {
        this.evmWeb3Modal?.closeModal();
      } else if (type === WalletType.COSMOS) {
        this.cosmosWeb3Modal?.closeModal();
      } else if (type === WalletType.STELLAR) {
        this.stellarWeb3Modal?.closeModal();
      }
    }, MODAL_CLOSE_DELAY);
  }

  private async cleanupProviderSession(type: WalletType, force: boolean = false): Promise<void> {
    console.debug(`[WalletService] Cleaning up provider for ${type} (force: ${force})`);

    const hasActiveSession = this.hasActiveSession(type);
    if (!hasActiveSession && !force) {
      console.debug(`[WalletService] No active session for ${type}, skipping cleanup`);
      return;
    }

    try {
      console.debug(`[WalletService] Unregistering session for ${type} from transaction router`);
      transactionRouter.unregisterSession(type);

      if (type === WalletType.EVM && this.wcEvmProvider) {
        if (this.wcEvmProvider.session) {
          try {
            await this.wcEvmProvider.disconnect();
            console.debug('[WalletService] Successfully disconnected EVM provider');
          } catch (err) {
            console.warn('[WalletService] Error disconnecting EVM provider:', err);
          }
        }
        this.wcEvmProvider?.removeAllListeners();
        this.wcEvmProvider = null;
        console.debug('[WalletService] EVM provider reset');
      } else if (type === WalletType.COSMOS && this.wcCosmosProvider) {
        if (this.wcCosmosProvider.session) {
          try {
            await this.wcCosmosProvider.disconnect();
            console.debug('[WalletService] Successfully disconnected Cosmos provider');
          } catch (err) {
            console.warn('[WalletService] Error disconnecting Cosmos provider:', err);
          }
        }
        this.wcCosmosProvider?.removeAllListeners();
        this.wcCosmosProvider = null;
        console.debug('[WalletService] Cosmos provider reset');
      } else if (type === WalletType.STELLAR && this.wcStellarProvider) {
        if (this.wcStellarProvider.session) {
          try {
            await this.wcStellarProvider.disconnect();
            console.debug('[WalletService] Successfully disconnected Stellar provider');
          } catch (err) {
            console.warn('[WalletService] Error disconnecting Stellar provider:', err);
          }
        }
        this.wcStellarProvider?.removeAllListeners();
        this.wcStellarProvider = null;
        console.debug('[WalletService] Stellar provider reset');
      }

      await new Promise(resolve => setTimeout(resolve, 500));
      console.debug(`[WalletService] Provider cleanup complete for ${type}`);
    } catch (error) {
      console.error(`[WalletService] Error during cleanup for ${type}:`, error);
    }
  }

  private hasActiveSession(type: WalletType): boolean {
    const hasSession =
      (type === WalletType.EVM && !!(this.wcEvmProvider && this.wcEvmProvider.session)) ||
      (type === WalletType.COSMOS && !!(this.wcCosmosProvider && this.wcCosmosProvider.session)) ||
      (type === WalletType.STELLAR && !!(this.wcStellarProvider && this.wcStellarProvider.session));
    console.debug(`[WalletService] Checking active session for ${type}: ${hasSession}`);
    return hasSession;
  }

  private async initializeProvider(type: WalletType): Promise<any> {
    const providerConfig = {
      projectId: WALLETCONNECT_PROJECT_ID,
      metadata: WALLETCONNECT_METADATA,
      relayUrl: 'wss://relay.walletconnect.com',
    };

    let provider: any;

    if (type === WalletType.EVM) {
      if (this.wcEvmProvider && this.wcEvmProvider.client && this.wcEvmProvider.session) {
        console.debug('[WalletService] Reusing existing EVM provider with valid session');
        return this.wcEvmProvider;
      }
      console.debug('[WalletService] Creating new EVM provider');
      this.wcEvmProvider = await UniversalProvider.init(providerConfig);
      provider = this.wcEvmProvider;
    } else if (type === WalletType.COSMOS) {
      if (this.wcCosmosProvider && this.wcCosmosProvider.client && this.wcCosmosProvider.session) {
        console.debug('[WalletService] Reusing existing Cosmos provider with valid session');
        return this.wcCosmosProvider;
      }
      console.debug('[WalletService] Creating new Cosmos provider');
      this.wcCosmosProvider = await UniversalProvider.init(providerConfig);
      provider = this.wcCosmosProvider;
    } else {
      if (
        this.wcStellarProvider &&
        this.wcStellarProvider.client &&
        this.wcStellarProvider.session
      ) {
        console.debug('[WalletService] Reusing existing Stellar provider with valid session');
        return this.wcStellarProvider;
      }
      console.debug('[WalletService] Creating new Stellar provider');
      this.wcStellarProvider = await UniversalProvider.init(providerConfig);
      provider = this.wcStellarProvider;
    }

    console.debug(`[WalletService] Setting up session listeners for ${type} provider`);
    this.setupSessionListeners(provider, type);

    return provider;
  }

  private setupSessionListeners(provider: any, type: WalletType): void {
    if (!provider) {
      console.warn(`[WalletService] No provider available for ${type}, skipping session listeners`);
      return;
    }

    provider.on('session_delete', () => {
      console.warn(`[WalletService] Session deleted for ${type}`);
      this.handleSessionLost(type);
    });

    provider.on('disconnect', () => {
      console.warn(`[WalletService] Provider disconnected for ${type}`);
      this.handleSessionLost(type);
    });

    provider.on('session_event', (event: any) => {
      console.debug(`[WalletService] Session event for ${type}:`, event);
    });

    provider.on('session_update', ({ topic, params }: any) => {
      console.debug(`[WalletService] Session update for ${type}:`, { topic, params });
    });
  }

  private async handleSessionLost(type: WalletType): Promise<void> {
    console.warn(`[WalletService] Handling session loss for ${type}`);

    console.debug(`[WalletService] Unregistering session for ${type} from transaction router`);
    transactionRouter.unregisterSession(type);

    if (type === WalletType.EVM) {
      this.wcEvmProvider = null;
      console.debug('[WalletService] Cleared EVM provider');
    } else if (type === WalletType.COSMOS) {
      this.wcCosmosProvider = null;
      console.debug('[WalletService] Cleared Cosmos provider');
    } else if (type === WalletType.STELLAR) {
      this.wcStellarProvider = null;
      console.debug('[WalletService] Cleared Stellar provider');
    }

    console.error(`[WalletService] Session lost for ${type}. User needs to reconnect.`);
  }

  async connectWalletConnect(
    type: WalletType,
    walletId?: string
  ): Promise<{ address: string; chainId: string | number; walletId: string }> {
    if (this.connectionInProgress.has(type)) {
      console.error(`[WalletService] Connection already in progress for ${type}`);
      throw new Error(`Connection already in progress for ${type}`);
    }

    const alreadyConnected = this.hasActiveSession(type);
    if (alreadyConnected) {
      console.warn(
        `[WalletService] ${type} already has an active session. Please disconnect first.`
      );
      throw new Error(
        `${type} wallet already connected. Please disconnect before connecting a new wallet.`
      );
    }

    this.connectionInProgress.add(type);
    this.modalClosedByUser.set(type, false);
    this.emitConnectionState(type, 'connecting');

    let web3Modal: Web3Modal | null = null;
    let wcProvider: any = null;

    try {
      console.debug(
        `[WalletService] Initializing WalletConnect for ${type} at ${new Date().toISOString()}`
      );

      const isMobileDevice = this.isMobile();
      const isWalletConnectOption = walletId === 'walletconnect';
      const walletInstalled = walletId ? this.isWalletInstalled(walletId) : false;

      console.debug(
        `[WalletService] Device info - Mobile: ${isMobileDevice}, Wallet: ${walletId}, Installed: ${walletInstalled}, IsWalletConnect: ${isWalletConnectOption}`
      );
      const shouldShowModal = !isMobileDevice || isWalletConnectOption;

      if (shouldShowModal) {
        const modalConfig = {
          projectId: WALLETCONNECT_PROJECT_ID,
          walletConnectVersion: 2 as const,
          enableExplorer: true,
          explorerRecommendedWalletIds: [],
          explorerExcludedWalletIds: [],
          themeMode: 'dark' as const,
          themeVariables: {
            '--w3m-z-index': '9999',
          },
          mobileWallets: [] as any[],
          desktopWallets: [] as any[],
        } satisfies Web3ModalConfig;

        if (type === WalletType.EVM && !this.evmWeb3Modal) {
          console.debug('[WalletService] Creating new EVM Web3Modal');
          this.evmWeb3Modal = new Web3Modal(modalConfig);
        } else if (type === WalletType.COSMOS && !this.cosmosWeb3Modal) {
          console.debug('[WalletService] Creating new Cosmos Web3Modal');
          this.cosmosWeb3Modal = new Web3Modal(modalConfig);
        } else if (type === WalletType.STELLAR && !this.stellarWeb3Modal) {
          console.debug('[WalletService] Creating new Stellar Web3Modal');
          this.stellarWeb3Modal = new Web3Modal(modalConfig);
        }

        web3Modal =
          type === WalletType.EVM
            ? this.evmWeb3Modal
            : type === WalletType.COSMOS
              ? this.cosmosWeb3Modal
              : this.stellarWeb3Modal;
        console.debug(`[WalletService] Assigned Web3Modal for ${type}`);
      }

      wcProvider = await this.initializeProvider(type);
      console.debug(`[WalletService] Initialized provider for ${type}`);

      let optionalNamespaces: any;
      let standaloneChains: string[];

      if (type === WalletType.EVM) {
        const evmRpcMap: Record<string, string> = {};
        getEVMChains().forEach(chain => {
          evmRpcMap[chain.chainId.toString()] = chain.rpcUrl;
        });

        optionalNamespaces = {
          eip155: {
            methods: CHAIN_METHODS.evm,
            chains: getEVMChains().map(chain => `eip155:${chain.chainId}`),
            events: CHAIN_EVENTS.evm,
            rpcMap: evmRpcMap,
          },
        };
        standaloneChains = getEVMChains().map(chain => `eip155:${chain.chainId}`);
        console.debug('[WalletService] Configured EVM namespaces:', optionalNamespaces);
      } else if (type === WalletType.COSMOS) {
        const cosmosRpcMap: Record<string, string> = {};
        getCosmosChains().forEach(chain => {
          cosmosRpcMap[chain.chainId] = chain.rpc;
        });

        optionalNamespaces = {
          cosmos: {
            methods: CHAIN_METHODS.cosmos,
            chains: getCosmosChains().map(chain => `cosmos:${chain.chainId}`),
            events: CHAIN_EVENTS.cosmos,
            rpcMap: cosmosRpcMap,
          },
        };
        standaloneChains = getCosmosChains().map(chain => `cosmos:${chain.chainId}`);
        console.debug('[WalletService] Configured Cosmos namespaces:', optionalNamespaces);
      } else {
        const stellarRpcMap: Record<string, string> = {
          pubnet: getStellarConfig().horizonUrl,
        };

        optionalNamespaces = {
          stellar: {
            methods: CHAIN_METHODS.stellar,
            chains: ['stellar:pubnet'],
            events: CHAIN_EVENTS.stellar,
            rpcMap: stellarRpcMap,
          },
        };
        standaloneChains = ['stellar:pubnet'];
        console.debug('[WalletService] Configured Stellar namespaces:', optionalNamespaces);
      }

      const namespaceKey =
        type === WalletType.EVM ? 'eip155' : type === WalletType.COSMOS ? 'cosmos' : 'stellar';
      console.debug(`[WalletService] Namespace key for ${type}: ${namespaceKey}`);

      return new Promise((resolve, reject) => {
        this.setConnectionTimeout(type, reject);

        let uriDisplayed = false;

        const cleanup = () => {
          wcProvider?.removeListener('display_uri', onDisplayUri);
          this.clearConnectionTimeout(type);
          this.connectionInProgress.delete(type);

          const visibilityHandler = this.visibilityHandlers.get(type);
          if (visibilityHandler) {
            console.debug(`[WalletService] Removing visibility handler for ${type}`);
            document.removeEventListener('visibilitychange', visibilityHandler);
            this.visibilityHandlers.delete(type);
          }
        };

        const onDisplayUri = (uri: string) => {
          if (uriDisplayed) {
            console.debug(`[WalletService] URI already displayed for ${type}, ignoring`);
            return;
          }
          uriDisplayed = true;

          console.debug(`[WalletService] URI received for ${type}: ${uri}`);

          if (isMobileDevice && walletId && !isWalletConnectOption) {
            console.debug(`[WalletService] Opening ${walletId} on mobile device with deep link`);
            this.openMobileWallet(walletId, uri, type);
          } else if (web3Modal) {
            console.debug('[WalletService] Displaying Web3Modal with QR code and wallet options');
            setTimeout(() => {
              try {
                web3Modal!.openModal({
                  uri,
                  standaloneChains,
                });
                console.debug(`[WalletService] Opened Web3Modal for ${type}`);
              } catch (err) {
                console.error('[WalletService] Error opening modal:', err);
              }
            }, 300);
          }
        };

        wcProvider.once('display_uri', onDisplayUri);

        wcProvider
          .connect({
            optionalNamespaces,
          })
          .then((session: any) => {
            if (this.modalClosedByUser.get(type)) {
              console.debug(`[WalletService] Connection cancelled by user for ${type}`);
              this.closeModalForType(type);
              cleanup();
              this.emitConnectionState(type, 'cancelled');
              reject(new Error('Connection cancelled by user'));
              return;
            }

            console.log('[WalletService] Wallet Connection Session Details:', {
              session: JSON.parse(JSON.stringify(session)),
              namespace: namespaceKey,
              chains: session.namespaces[namespaceKey]?.chains || [],
              chainCount: session.namespaces[namespaceKey]?.chains?.length || 0,
              accounts: session.namespaces[namespaceKey]?.accounts || [],
              accountCount: session.namespaces[namespaceKey]?.accounts?.length || 0,
              methods: session.namespaces[namespaceKey]?.methods || [],
              events: session.namespaces[namespaceKey]?.events || [],
            });

            console.debug(`[WalletService] Session established for ${type}`);

            const accounts = session.namespaces[namespaceKey]?.accounts || [];
            if (accounts.length === 0) {
              console.error(`[WalletService] No accounts found for ${type}`);
              throw new Error(`No accounts found for ${type}`);
            }

            const fullAccount = accounts[0];
            const parts = fullAccount.split(':');
            const address = parts[2] || '';
            const chainId = type === WalletType.EVM ? parseInt(parts[1]) : parts[1];

            const sessionNamespaces = Object.keys(session.namespaces);

            if (sessionNamespaces.length !== 1 || sessionNamespaces[0] !== namespaceKey) {
              console.error(
                `[WalletService] Invalid namespace in session. Expected ${namespaceKey}, got ${sessionNamespaces.join(', ')}`
              );
              throw new Error(
                `Invalid namespace in session. Expected ${namespaceKey}, got ${sessionNamespaces.join(', ')}`
              );
            }

            console.debug(`[WalletService] Connection successful for ${type}. Address: ${address}`);

            console.debug(
              `[WalletService] Registering session for ${type} with transaction router`
            );
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

            resolve({
              address,
              chainId,
              walletId: walletId || 'walletconnect',
            });
          })
          .catch((err: any) => {
            if (this.modalClosedByUser.get(type)) {
              console.debug(`[WalletService] Connection cancelled by user for ${type}`);
              this.closeModalForType(type);
              cleanup();
              this.emitConnectionState(type, 'cancelled');
              reject(new Error('Connection cancelled by user'));
              return;
            }

            console.error(`[WalletService] Connection error for ${type}:`, err);

            this.closeModalForType(type);
            cleanup();
            this.emitConnectionState(type, 'failed');

            let errorMessage = 'Failed to connect wallet';
            if (
              err.message?.includes('User rejected') ||
              err.message?.includes('User disapproved')
            ) {
              errorMessage = 'Connection rejected by user';
            } else if (err.message?.includes('timeout')) {
              errorMessage = 'Connection timeout. Please try again';
            } else if (err.message?.includes('Modal closed')) {
              errorMessage = 'Connection cancelled';
            } else if (err.message) {
              errorMessage = err.message;
            }

            console.error(`[WalletService] Connection failed with message: ${errorMessage}`);
            reject(new Error(errorMessage));
          });
      });
    } catch (error) {
      console.error(`[WalletService] Initialization error for ${type}:`, error);

      this.connectionInProgress.delete(type);
      this.clearConnectionTimeout(type);
      this.closeModalForType(type);
      this.emitConnectionState(type, 'failed');

      throw new Error(`Failed to initialize: ${(error as Error).message}`);
    }
  }

  async connectEVM(
    walletId: string
  ): Promise<{ address: string; chainId: number; walletId: string }> {
    console.debug(`[WalletService] Connecting EVM wallet: ${walletId}`);
    const { address, chainId } = await this.connectWalletConnect(WalletType.EVM, walletId);
    console.debug(
      `[WalletService] EVM connection successful: Address=${address}, ChainId=${chainId}`
    );
    return { address, chainId: chainId as number, walletId };
  }

  async connectCosmos(
    walletId: string
  ): Promise<{ address: string; chainId: string; walletId: string }> {
    console.debug(`[WalletService] Connecting Cosmos wallet: ${walletId}`);
    const { address, chainId } = await this.connectWalletConnect(WalletType.COSMOS, walletId);
    console.debug(
      `[WalletService] Cosmos connection successful: Address=${address}, ChainId=${chainId}`
    );
    return { address, chainId: chainId as string, walletId };
  }

  async connectStellar(walletId: string): Promise<{ address: string; walletId: string }> {
    console.debug(`[WalletService] Connecting Stellar wallet: ${walletId}`);
    const { address } = await this.connectWalletConnect(WalletType.STELLAR, walletId);
    console.debug(`[WalletService] Stellar connection successful: Address=${address}`);
    return { address, walletId };
  }

  async disconnect(walletType: WalletType) {
    try {
      console.debug(`[WalletService] Disconnecting wallet type: ${walletType}`);

      this.clearConnectionTimeout(walletType);
      this.connectionInProgress.delete(walletType);

      const visibilityHandler = this.visibilityHandlers.get(walletType);
      if (visibilityHandler) {
        console.debug(`[WalletService] Removing visibility handler for ${walletType}`);
        document.removeEventListener('visibilitychange', visibilityHandler);
        this.visibilityHandlers.delete(walletType);
      }

      console.debug(
        `[WalletService] Unregistering session for ${walletType} from transaction router`
      );
      transactionRouter.unregisterSession(walletType);

      if (walletType === WalletType.EVM) {
        this.evmProvider = null;
        if (this.wcEvmProvider?.session) {
          await Promise.race([
            this.wcEvmProvider.disconnect(),
            new Promise(resolve => setTimeout(resolve, 3000)),
          ]);
          console.debug('[WalletService] Successfully disconnected EVM provider');
          this.wcEvmProvider.removeAllListeners();
        }
        this.wcEvmProvider = null;
        this.evmWeb3Modal?.closeModal();
        console.debug('[WalletService] EVM provider and modal reset');
      } else if (walletType === WalletType.COSMOS) {
        this.cosmosProvider = null;
        if (this.wcCosmosProvider?.session) {
          await Promise.race([
            this.wcCosmosProvider.disconnect(),
            new Promise(resolve => setTimeout(resolve, 3000)),
          ]);
          console.debug('[WalletService] Successfully disconnected Cosmos provider');
          this.wcCosmosProvider.removeAllListeners();
        }
        this.wcCosmosProvider = null;
        this.cosmosWeb3Modal?.closeModal();
        console.debug('[WalletService] Cosmos provider and modal reset');
      } else if (walletType === WalletType.STELLAR) {
        if (this.wcStellarProvider?.session) {
          await Promise.race([
            this.wcStellarProvider.disconnect(),
            new Promise(resolve => setTimeout(resolve, 3000)),
          ]);
          console.debug('[WalletService] Successfully disconnected Stellar provider');
          this.wcStellarProvider.removeAllListeners();
        }
        this.wcStellarProvider = null;
        this.stellarWeb3Modal?.closeModal();
        console.debug('[WalletService] Stellar provider and modal reset');
      }

      console.debug('[WalletService] Disconnection complete');
    } catch (error) {
      console.error('[WalletService] Disconnect error:', error);
      throw error;
    }
  }

  getProvider(walletType: WalletType) {
    const provider =
      walletType === WalletType.EVM
        ? this.evmProvider || this.wcEvmProvider
        : walletType === WalletType.COSMOS
          ? this.cosmosProvider || this.wcCosmosProvider
          : this.wcStellarProvider;
    console.debug(`[WalletService] Retrieving provider for ${walletType}:`, !!provider);
    return provider;
  }

  isConnecting(walletType?: WalletType): boolean {
    if (walletType) {
      const isConnecting = this.connectionInProgress.has(walletType);
      console.debug(`[WalletService] Checking if ${walletType} is connecting: ${isConnecting}`);
      return isConnecting;
    }
    const isAnyConnecting = this.connectionInProgress.size > 0;
    console.debug(`[WalletService] Checking if any wallet is connecting: ${isAnyConnecting}`);
    return isAnyConnecting;
  }

  async cancelConnection(walletType: WalletType): Promise<void> {
    console.debug(`[WalletService] Cancelling connection for ${walletType}`);

    this.modalClosedByUser.set(walletType, true);
    this.clearConnectionTimeout(walletType);
    this.connectionInProgress.delete(walletType);
    this.closeModalForType(walletType);

    const visibilityHandler = this.visibilityHandlers.get(walletType);
    if (visibilityHandler) {
      console.debug(`[WalletService] Removing visibility handler for ${walletType}`);
      document.removeEventListener('visibilitychange', visibilityHandler);
      this.visibilityHandlers.delete(walletType);
    }

    console.debug(`[WalletService] Forcing cleanup for ${walletType} during cancellation`);
    await this.cleanupProviderSession(walletType, true);
    this.emitConnectionState(walletType, 'cancelled');
  }

  isConnected(walletType: WalletType): boolean {
    const isConnected = this.hasActiveSession(walletType);
    console.debug(`[WalletService] Checking if ${walletType} is connected: ${isConnected}`);
    return isConnected;
  }

  getActiveSessions(): WalletType[] {
    const active: WalletType[] = [];
    if (this.hasActiveSession(WalletType.EVM)) active.push(WalletType.EVM);
    if (this.hasActiveSession(WalletType.COSMOS)) active.push(WalletType.COSMOS);
    if (this.hasActiveSession(WalletType.STELLAR)) active.push(WalletType.STELLAR);
    console.debug('[WalletService] Active sessions:', active);
    return active;
  }
}

export const walletService = new WalletService();
