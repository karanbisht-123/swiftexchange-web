// import UniversalProvider from '@walletconnect/universal-provider';
// import { Web3Modal } from '@web3modal/standalone';
// import {
//   COSMOS_CHAINS,
//   EVM_CHAINS,
//   STELLAR_CONFIG,
//   WALLETCONNECT_METADATA,
//   WALLETCONNECT_PROJECT_ID,
// } from '../config/chains';
// import { CHAIN_EVENTS, CHAIN_METHODS, WalletType } from '../constants/Wallet';
// class WalletService {
//   private evmProvider: any = null;
//   private cosmosProvider: any = null;
//   private wcEvmProvider: any = null;
//   private wcCosmosProvider: any = null;
//   private wcStellarProvider: any = null;
//   private evmWeb3Modal: Web3Modal | null = null;
//   private cosmosWeb3Modal: Web3Modal | null = null;
//   private stellarWeb3Modal: Web3Modal | null = null;
//   private connectionInProgress: Set<WalletType> = new Set();
//   private async cleanupProvider(type: WalletType): Promise<void> {
//     console.log(`[WalletService] Cleaning up provider for ${type}`);
//     try {
//       if (type === WalletType.EVM && this.wcEvmProvider) {
//         if (this.wcEvmProvider.session) {
//           await this.wcEvmProvider.disconnect();
//         }
//         this.wcEvmProvider.removeAllListeners();
//         this.wcEvmProvider = null;
//       } else if (type === WalletType.COSMOS && this.wcCosmosProvider) {
//         if (this.wcCosmosProvider.session) {
//           await this.wcCosmosProvider.disconnect();
//         }
//         this.wcCosmosProvider.removeAllListeners();
//         this.wcCosmosProvider = null;
//       } else if (type === WalletType.STELLAR && this.wcStellarProvider) {
//         if (this.wcStellarProvider.session) {
//           await this.wcStellarProvider.disconnect();
//         }
//         this.wcStellarProvider.removeAllListeners();
//         this.wcStellarProvider = null;
//       }
//       await new Promise(resolve => setTimeout(resolve, 500));
//       console.log(`[WalletService] Provider cleanup complete for ${type}`);
//     } catch (error) {
//       console.error(`[WalletService] Error during cleanup for ${type}:`, error);
//     }
//   }
//   async connectWalletConnect(
//     type: WalletType
//   ): Promise<{ address: string; chainId: string | number; walletId: string }> {
//     if (this.connectionInProgress.has(type)) {
//       throw new Error(`Connection already in progress for ${type}`);
//     }
//     this.connectionInProgress.add(type);
//     try {
//       console.log(
//         `[WalletService] Initializing Web3Modal for ${type} at ${new Date().toISOString()}`
//       );
//       await this.cleanupProvider(type);
//       let web3Modal: Web3Modal;
//       if (type === WalletType.EVM) {
//         if (!this.evmWeb3Modal) {
//           this.evmWeb3Modal = new Web3Modal({
//             projectId: WALLETCONNECT_PROJECT_ID,
//             walletConnectVersion: 2,
//           });
//         }
//         web3Modal = this.evmWeb3Modal;
//       } else if (type === WalletType.COSMOS) {
//         if (!this.cosmosWeb3Modal) {
//           this.cosmosWeb3Modal = new Web3Modal({
//             projectId: WALLETCONNECT_PROJECT_ID,
//             walletConnectVersion: 2,
//           });
//         }
//         web3Modal = this.cosmosWeb3Modal;
//       } else {
//         if (!this.stellarWeb3Modal) {
//           this.stellarWeb3Modal = new Web3Modal({
//             projectId: WALLETCONNECT_PROJECT_ID,
//             walletConnectVersion: 2,
//           });
//         }
//         web3Modal = this.stellarWeb3Modal;
//       }
//       console.log(`[WalletService] Web3Modal initialized for ${type}`);
//       let wcProvider: any;
//       if (type === WalletType.EVM) {
//         console.log('[WalletService] Initializing WalletConnect UniversalProvider for EVM');
//         this.wcEvmProvider = await UniversalProvider.init({
//           projectId: WALLETCONNECT_PROJECT_ID,
//           metadata: WALLETCONNECT_METADATA,
//           relayUrl: 'wss://relay.walletconnect.com',
//         });
//         console.log('[WalletService] UniversalProvider initialized for EVM');
//         wcProvider = this.wcEvmProvider;
//       } else if (type === WalletType.COSMOS) {
//         console.log('[WalletService] Initializing WalletConnect UniversalProvider for Cosmos');
//         this.wcCosmosProvider = await UniversalProvider.init({
//           projectId: WALLETCONNECT_PROJECT_ID,
//           metadata: WALLETCONNECT_METADATA,
//           relayUrl: 'wss://relay.walletconnect.com',
//         });
//         console.log('[WalletService] UniversalProvider initialized for Cosmos');
//         wcProvider = this.wcCosmosProvider;
//       } else {
//         console.log('[WalletService] Initializing WalletConnect UniversalProvider for Stellar');
//         this.wcStellarProvider = await UniversalProvider.init({
//           projectId: WALLETCONNECT_PROJECT_ID,
//           metadata: WALLETCONNECT_METADATA,
//           relayUrl: 'wss://relay.walletconnect.com',
//         });
//         console.log('[WalletService] UniversalProvider initialized for Stellar');
//         wcProvider = this.wcStellarProvider;
//       }
//       let optionalNamespaces: any;
//       let standaloneChains: string[];
//       const evmRpcMap: Record<string, string> = {};
//       EVM_CHAINS.forEach(chain => {
//         evmRpcMap[chain.chainId.toString()] = chain.rpcUrl;
//       });
//       const cosmosRpcMap: Record<string, string> = {};
//       COSMOS_CHAINS.forEach(chain => {
//         cosmosRpcMap[chain.chainId] = chain.rpc;
//       });
//       const stellarRpcMap: Record<string, string> = {
//         pubnet: STELLAR_CONFIG.horizonUrl,
//       };
//       console.log(`[WalletService] Setting up namespaces for ${type}`);
//       if (type === WalletType.EVM) {
//         optionalNamespaces = {
//           eip155: {
//             methods: CHAIN_METHODS.evm,
//             chains: EVM_CHAINS.map(chain => `eip155:${chain.chainId}`),
//             events: CHAIN_EVENTS.evm,
//             rpcMap: evmRpcMap,
//           },
//         };
//         standaloneChains = EVM_CHAINS.map(chain => `eip155:${chain.chainId}`);
//       } else if (type === WalletType.COSMOS) {
//         optionalNamespaces = {
//           cosmos: {
//             methods: CHAIN_METHODS.cosmos,
//             chains: COSMOS_CHAINS.map(chain => `cosmos:${chain.chainId}`),
//             events: CHAIN_EVENTS.cosmos,
//             rpcMap: cosmosRpcMap,
//           },
//         };
//         standaloneChains = COSMOS_CHAINS.map(chain => `cosmos:${chain.chainId}`);
//       } else {
//         optionalNamespaces = {
//           stellar: {
//             methods: CHAIN_METHODS.stellar,
//             chains: ['stellar:pubnet'],
//             events: CHAIN_EVENTS.stellar,
//             rpcMap: stellarRpcMap,
//           },
//         };
//         standaloneChains = ['stellar:pubnet'];
//       }
//       console.log(
//         '[WalletService] Namespaces configured:',
//         JSON.stringify(optionalNamespaces, null, 2)
//       );
//       const validNamespaces = ['eip155', 'cosmos', 'stellar'];
//       const namespaceKey =
//         type === WalletType.EVM ? 'eip155' : type === WalletType.COSMOS ? 'cosmos' : 'stellar';
//       if (!validNamespaces.includes(namespaceKey)) {
//         console.error(`[WalletService] Invalid namespace for ${type}: ${namespaceKey}`);
//         throw new Error(`Invalid namespace for ${type}`);
//       }
//       return new Promise((resolve, reject) => {
//         console.log(`[WalletService] Setting up display_uri listener for ${type}`);
//         const onDisplayUri = (uri: string) => {
//           console.log(`[WalletService] Displaying URI for ${type}: ${uri}`);
//           setTimeout(() => {
//             web3Modal.openModal({
//               uri,
//               standaloneChains,
//             });
//           }, 300);
//         };
//         wcProvider.once('display_uri', onDisplayUri);
//         console.log(`[WalletService] Initiating WalletConnect connection for ${type}`);
//         wcProvider
//           .connect({
//             optionalNamespaces,
//           })
//           .then((session: any) => {
//             console.log(
//               `[WalletService] WalletConnect session established for ${type}:`,
//               JSON.stringify(session, null, 2)
//             );
//             const accounts = session.namespaces[namespaceKey]?.accounts || [];
//             if (accounts.length === 0) {
//               console.error(`[WalletService] No accounts found for ${type}`);
//               throw new Error(`No accounts found for ${type}`);
//             }
//             const fullAccount = accounts[0];
//             const parts = fullAccount.split(':');
//             const address = parts[2] || '';
//             const chainId = type === WalletType.EVM ? parseInt(parts[1]) : parts[1];
//             const sessionNamespaces = Object.keys(session.namespaces);
//             if (sessionNamespaces.length !== 1 || sessionNamespaces[0] !== namespaceKey) {
//               console.error(
//                 `[WalletService] Invalid namespace in session for ${type}. Expected only ${namespaceKey}, got ${sessionNamespaces}`
//               );
//               throw new Error(
//                 `Invalid namespace in session. Expected only ${namespaceKey}, got ${sessionNamespaces}`
//               );
//             }
//             console.log(`[WalletService] Active sessions after connecting ${type}:`, {
//               evmSession: !!this.wcEvmProvider?.session,
//               cosmosSession: !!this.wcCosmosProvider?.session,
//               stellarSession: !!this.wcStellarProvider?.session,
//             });
//             console.log(
//               `[WalletService] Connection successful for ${type}. Address: ${address}, ChainId: ${chainId}`
//             );
//             web3Modal.closeModal();
//             this.connectionInProgress.delete(type);
//             resolve({
//               address,
//               chainId,
//               walletId: 'walletconnect',
//             });
//           })
//           .catch((err: any) => {
//             console.error(`[WalletService] WalletConnect error for ${type}:`, err);
//             web3Modal.closeModal();
//             this.connectionInProgress.delete(type);
//             reject(new Error(`WalletConnect error: ${err.message}`));
//           })
//           .finally(() => {
//             console.log('[WalletService] Cleaning up display_uri listener');
//             wcProvider.removeListener('display_uri', onDisplayUri);
//           });
//       });
//     } catch (error) {
//       console.error(`[WalletService] WalletConnect initialization error for ${type}:`, error);
//       this.connectionInProgress.delete(type);
//       if (type === WalletType.EVM) {
//         this.evmWeb3Modal?.closeModal();
//       } else if (type === WalletType.COSMOS) {
//         this.cosmosWeb3Modal?.closeModal();
//       } else {
//         this.stellarWeb3Modal?.closeModal();
//       }
//       throw new Error(`WalletConnect initialization error: ${(error as Error).message}`);
//     }
//   }
//   async connectEVM(
//     walletId: string
//   ): Promise<{ address: string; chainId: number; walletId: string }> {
//     console.log(`[WalletService] Connecting EVM wallet with ID: ${walletId}`);
//     const { address, chainId } = await this.connectWalletConnect(WalletType.EVM);
//     return { address, chainId: chainId as number, walletId };
//   }
//   async connectCosmos(
//     walletId: string
//   ): Promise<{ address: string; chainId: string; walletId: string }> {
//     console.log(`[WalletService] Connecting Cosmos wallet with ID: ${walletId}`);
//     const { address, chainId } = await this.connectWalletConnect(WalletType.COSMOS);
//     return { address, chainId: chainId as string, walletId };
//   }
//   async connectStellar(walletId: string): Promise<{ address: string; walletId: string }> {
//     console.log(`[WalletService] Connecting Stellar wallet with ID: ${walletId}`);
//     const { address } = await this.connectWalletConnect(WalletType.STELLAR);
//     return { address, walletId };
//   }
//   async disconnect(walletType: WalletType) {
//     try {
//       console.log(`[WalletService] Disconnecting wallet type: ${walletType}`);
//       if (walletType === WalletType.EVM) {
//         this.evmProvider = null;
//         console.log('[WalletService] EVM provider cleared');
//         if (this.wcEvmProvider && this.wcEvmProvider.disconnect) {
//           await this.wcEvmProvider.disconnect();
//           this.wcEvmProvider.removeAllListeners();
//           this.wcEvmProvider = null;
//           console.log('[WalletService] WalletConnect EVM provider disconnected');
//         }
//         this.evmWeb3Modal?.closeModal();
//       } else if (walletType === WalletType.COSMOS) {
//         this.cosmosProvider = null;
//         console.log('[WalletService] Cosmos provider cleared');
//         if (this.wcCosmosProvider && this.wcCosmosProvider.disconnect) {
//           await this.wcCosmosProvider.disconnect();
//           this.wcCosmosProvider.removeAllListeners();
//           this.wcCosmosProvider = null;
//           console.log('[WalletService] WalletConnect Cosmos provider disconnected');
//         }
//         this.cosmosWeb3Modal?.closeModal();
//       } else if (walletType === WalletType.STELLAR) {
//         if (this.wcStellarProvider && this.wcStellarProvider.disconnect) {
//           await this.wcStellarProvider.disconnect();
//           this.wcStellarProvider.removeAllListeners();
//           this.wcStellarProvider = null;
//           console.log('[WalletService] WalletConnect Stellar provider disconnected');
//         }
//         this.stellarWeb3Modal?.closeModal();
//       }
//       console.log('[WalletService] Web3Modal closed for', walletType);
//       console.log('[WalletService] Active sessions after disconnection:', {
//         evmSession: !!this.wcEvmProvider?.session,
//         cosmosSession: !!this.wcCosmosProvider?.session,
//         stellarSession: !!this.wcStellarProvider?.session,
//       });
//     } catch (error) {
//       console.error('[WalletService] Disconnect error:', error);
//     }
//   }
//   getProvider(walletType: WalletType) {
//     console.log(`[WalletService] Getting provider for wallet type: ${walletType}`);
//     switch (walletType) {
//       case WalletType.EVM:
//         console.log(
//           '[WalletService] Returning EVM provider:',
//           !!this.evmProvider || !!this.wcEvmProvider
//         );
//         return this.evmProvider || this.wcEvmProvider;
//       case WalletType.COSMOS:
//         console.log(
//           '[WalletService] Returning Cosmos provider:',
//           !!this.cosmosProvider || !!this.wcCosmosProvider
//         );
//         return this.cosmosProvider || this.wcCosmosProvider;
//       case WalletType.STELLAR:
//         console.log('[WalletService] Returning Stellar provider:', !!this.wcStellarProvider);
//         return this.wcStellarProvider;
//       default:
//         console.warn(`[WalletService] No provider found for wallet type: ${walletType}`);
//         return null;
//     }
//   }
// }
// export const walletService = new WalletService();
//  conection with deep link
import UniversalProvider from '@walletconnect/universal-provider';
import { Web3Modal } from '@web3modal/standalone';
import { type Web3ModalConfig } from '@web3modal/standalone';

import {
  COSMOS_CHAINS,
  EVM_CHAINS,
  STELLAR_CONFIG,
  WALLETCONNECT_METADATA,
  WALLETCONNECT_PROJECT_ID,
} from '../config/chains';
import { CHAIN_EVENTS, CHAIN_METHODS, WalletType } from '../constants/Wallet';

const CONNECTION_TIMEOUT = 120000;
const MODAL_CLOSE_DELAY = 300;

// Event emitter for connection state changes
type ConnectionEventCallback = (
  type: WalletType,
  state: 'connecting' | 'connected' | 'failed' | 'cancelled'
) => void;

class WalletService {
  // Separate providers
  private evmProvider: any = null;
  private cosmosProvider: any = null;
  private wcEvmProvider: any = null;
  private wcCosmosProvider: any = null;
  private wcStellarProvider: any = null;

  // Separate modals for each type
  private evmWeb3Modal: Web3Modal | null = null;
  private cosmosWeb3Modal: Web3Modal | null = null;
  private stellarWeb3Modal: Web3Modal | null = null;

  // Connection state tracking
  private connectionInProgress: Set<WalletType> = new Set();
  private activeTimeouts: Map<WalletType, number> = new Map();
  private modalClosedByUser: Map<WalletType, boolean> = new Map();

  // Event listeners for connection state
  private connectionListeners: Set<ConnectionEventCallback> = new Set();

  // Track visibility change handlers
  private visibilityHandlers: Map<WalletType, () => void> = new Map();

  // Subscribe to connection events
  onConnectionStateChange(callback: ConnectionEventCallback): () => void {
    this.connectionListeners.add(callback);
    return () => this.connectionListeners.delete(callback);
  }

  private emitConnectionState(
    type: WalletType,
    state: 'connecting' | 'connected' | 'failed' | 'cancelled'
  ): void {
    this.connectionListeners.forEach(listener => {
      try {
        listener(type, state);
      } catch (error) {
        console.error('[WalletService] Error in connection listener:', error);
      }
    });
  }

  private isMobile(): boolean {
    const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
    if (/android/i.test(userAgent)) return true;
    if (/iPad|iPhone|iPod/.test(userAgent) && !(window as any).MSStream) return true;
    return false;
  }

  private isWalletInstalled(walletId: string): boolean {
    const walletId_lower = walletId.toLowerCase();

    if (walletId_lower === 'metamask' && (window as any).ethereum?.isMetaMask) {
      return true;
    }
    if (walletId_lower === 'trust' && (window as any).ethereum?.isTrust) {
      return true;
    }
    if (walletId_lower === 'coinbase' && (window as any).ethereum?.isCoinbaseWallet) {
      return true;
    }

    return false;
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
      // lobstr: {
      //   deepLink: `lobstr://wc?uri=${encodedUri}`,
      //   fallbackUrl: 'https://lobstr.co/',
      // },
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

    return walletConfig[walletId_lower] || { deepLink: uri };
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
    checkTimer = window.setTimeout(() => {
      const elapsed = Date.now() - startTime;

      if (elapsed >= 2500 && document.hasFocus() && fallbackUrl) {
        console.warn('[WalletService] Wallet app might not be installed');

        const shouldInstall = window.confirm(
          `${walletId} app might not be installed. Would you like to install it?`
        );

        if (shouldInstall) {
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

    this.activeTimeouts.set(type, timeout);
  }

  private closeModalForType(type: WalletType): void {
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

  private async cleanupProviderSession(type: WalletType): Promise<void> {
    console.debug(`[WalletService] Cleaning up provider for ${type}`);
    try {
      if (type === WalletType.EVM && this.wcEvmProvider) {
        if (this.wcEvmProvider.session) {
          await this.wcEvmProvider.disconnect();
        }
        this.wcEvmProvider?.removeAllListeners();
        this.wcEvmProvider = null;
      } else if (type === WalletType.COSMOS && this.wcCosmosProvider) {
        if (this.wcCosmosProvider.session) {
          await this.wcCosmosProvider.disconnect();
        }
        this.wcCosmosProvider?.removeAllListeners();
        this.wcCosmosProvider = null;
      } else if (type === WalletType.STELLAR && this.wcStellarProvider) {
        if (this.wcStellarProvider.session) {
          await this.wcStellarProvider.disconnect();
        }
        this.wcStellarProvider?.removeAllListeners();
        this.wcStellarProvider = null;
      }
      await new Promise(resolve => setTimeout(resolve, 500));
      console.debug(`[WalletService] Provider cleanup complete for ${type}`);
    } catch (error) {
      console.error(`[WalletService] Error during cleanup for ${type}:`, error);
    }
  }

  // private getProviderForType(type: WalletType): any {
  //   switch (type) {
  //     case WalletType.EVM:
  //       return this.wcEvmProvider;
  //     case WalletType.COSMOS:
  //       return this.wcCosmosProvider;
  //     case WalletType.STELLAR:
  //       return this.wcStellarProvider;
  //     default:
  //       return null;
  //   }
  // }

  private async initializeProvider(type: WalletType): Promise<any> {
    const providerConfig = {
      projectId: WALLETCONNECT_PROJECT_ID,
      metadata: WALLETCONNECT_METADATA,
      relayUrl: 'wss://relay.walletconnect.com',
    };
    let provider: any;
    if (type === WalletType.EVM) {
      if (!this.wcEvmProvider || !this.wcEvmProvider.client) {
        console.debug('[WalletService] Creating new EVM provider');
        this.wcEvmProvider = await UniversalProvider.init(providerConfig);
      }
      provider = this.wcEvmProvider;
    } else if (type === WalletType.COSMOS) {
      if (!this.wcCosmosProvider || !this.wcCosmosProvider.client) {
        console.debug('[WalletService] Creating new Cosmos provider');
        this.wcCosmosProvider = await UniversalProvider.init(providerConfig);
      }
      provider = this.wcCosmosProvider;
    } else {
      if (!this.wcStellarProvider || !this.wcStellarProvider.client) {
        console.debug('[WalletService] Creating new Stellar provider');
        this.wcStellarProvider = await UniversalProvider.init(providerConfig);
      }
      provider = this.wcStellarProvider;
    }

    return provider;
  }

  async connectWalletConnect(
    type: WalletType,
    walletId?: string
  ): Promise<{ address: string; chainId: string | number; walletId: string }> {
    if (this.connectionInProgress.has(type)) {
      throw new Error(`Connection already in progress for ${type}`);
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

      // Clean up any pending session
      await this.cleanupProviderSession(type);

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
        const evmRpcMap: Record<string, string> = {};
        EVM_CHAINS.forEach(chain => {
          evmRpcMap[chain.chainId.toString()] = chain.rpcUrl;
        });

        optionalNamespaces = {
          eip155: {
            methods: CHAIN_METHODS.evm,
            chains: EVM_CHAINS.map(chain => `eip155:${chain.chainId}`),
            events: CHAIN_EVENTS.evm,
            rpcMap: evmRpcMap,
          },
        };
        standaloneChains = EVM_CHAINS.map(chain => `eip155:${chain.chainId}`);
      } else if (type === WalletType.COSMOS) {
        const cosmosRpcMap: Record<string, string> = {};
        COSMOS_CHAINS.forEach(chain => {
          cosmosRpcMap[chain.chainId] = chain.rpc;
        });

        optionalNamespaces = {
          cosmos: {
            methods: CHAIN_METHODS.cosmos,
            chains: COSMOS_CHAINS.map(chain => `cosmos:${chain.chainId}`),
            events: CHAIN_EVENTS.cosmos,
            rpcMap: cosmosRpcMap,
          },
        };
        standaloneChains = COSMOS_CHAINS.map(chain => `cosmos:${chain.chainId}`);
      } else {
        const stellarRpcMap: Record<string, string> = {
          pubnet: STELLAR_CONFIG.horizonUrl,
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
      }

      const namespaceKey =
        type === WalletType.EVM ? 'eip155' : type === WalletType.COSMOS ? 'cosmos' : 'stellar';

      return new Promise((resolve, reject) => {
        this.setConnectionTimeout(type, reject);

        let uriDisplayed = false;

        const cleanup = () => {
          wcProvider?.removeListener('display_uri', onDisplayUri);
          this.clearConnectionTimeout(type);
          this.connectionInProgress.delete(type);

          const visibilityHandler = this.visibilityHandlers.get(type);
          if (visibilityHandler) {
            document.removeEventListener('visibilitychange', visibilityHandler);
            this.visibilityHandlers.delete(type);
          }
        };

        const onDisplayUri = (uri: string) => {
          if (uriDisplayed) return;
          uriDisplayed = true;

          console.debug(`[WalletService] URI received for ${type}`);

          // For specific wallet use deep link
          if (isMobileDevice && walletId && !isWalletConnectOption) {
            console.debug(`[WalletService] Opening ${walletId} on mobile device with deep link`);
            this.openMobileWallet(walletId, uri, type);
          }
          // desktop, show Web3Modal
          else if (web3Modal) {
            console.debug('[WalletService] Displaying Web3Modal with QR code and wallet options');
            setTimeout(() => {
              try {
                web3Modal!.openModal({
                  uri,
                  standaloneChains,
                });
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
            // Check if modal was closed by user
            if (this.modalClosedByUser.get(type)) {
              console.debug(`[WalletService] Connection cancelled by user for ${type}`);
              this.closeModalForType(type);
              cleanup();
              this.emitConnectionState(type, 'cancelled');
              reject(new Error('Connection cancelled by user'));
              return;
            }

            console.debug(`[WalletService] Session established for ${type}`);

            const accounts = session.namespaces[namespaceKey]?.accounts || [];
            if (accounts.length === 0) {
              throw new Error(`No accounts found for ${type}`);
            }

            const fullAccount = accounts[0];
            const parts = fullAccount.split(':');
            const address = parts[2] || '';
            const chainId = type === WalletType.EVM ? parseInt(parts[1]) : parts[1];

            const sessionNamespaces = Object.keys(session.namespaces);
            if (sessionNamespaces.length !== 1 || sessionNamespaces[0] !== namespaceKey) {
              throw new Error(
                `Invalid namespace in session. Expected ${namespaceKey}, got ${sessionNamespaces.join(', ')}`
              );
            }

            console.debug(`[WalletService] Connection successful for ${type}. Address: ${address}`);

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
    return { address, chainId: chainId as number, walletId };
  }

  async connectCosmos(
    walletId: string
  ): Promise<{ address: string; chainId: string; walletId: string }> {
    console.debug(`[WalletService] Connecting Cosmos wallet: ${walletId}`);
    const { address, chainId } = await this.connectWalletConnect(WalletType.COSMOS, walletId);
    return { address, chainId: chainId as string, walletId };
  }

  async connectStellar(walletId: string): Promise<{ address: string; walletId: string }> {
    console.debug(`[WalletService] Connecting Stellar wallet: ${walletId}`);
    const { address } = await this.connectWalletConnect(WalletType.STELLAR, walletId);
    return { address, walletId };
  }

  async disconnect(walletType: WalletType) {
    try {
      console.debug(`[WalletService] Disconnecting wallet type: ${walletType}`);

      this.clearConnectionTimeout(walletType);
      this.connectionInProgress.delete(walletType);

      const visibilityHandler = this.visibilityHandlers.get(walletType);
      if (visibilityHandler) {
        document.removeEventListener('visibilitychange', visibilityHandler);
        this.visibilityHandlers.delete(walletType);
      }

      if (walletType === WalletType.EVM) {
        this.evmProvider = null;
        if (this.wcEvmProvider?.session) {
          await Promise.race([
            this.wcEvmProvider.disconnect(),
            new Promise(resolve => setTimeout(resolve, 3000)),
          ]);
          this.wcEvmProvider.removeAllListeners();
        }
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
        this.cosmosWeb3Modal?.closeModal();
      } else if (walletType === WalletType.STELLAR) {
        if (this.wcStellarProvider?.session) {
          await Promise.race([
            this.wcStellarProvider.disconnect(),
            new Promise(resolve => setTimeout(resolve, 3000)),
          ]);
          this.wcStellarProvider.removeAllListeners();
        }
        this.stellarWeb3Modal?.closeModal();
      }

      console.debug('[WalletService] Disconnection complete');
    } catch (error) {
      console.error('[WalletService] Disconnect error:', error);
      throw error;
    }
  }

  getProvider(walletType: WalletType) {
    switch (walletType) {
      case WalletType.EVM:
        return this.evmProvider || this.wcEvmProvider;
      case WalletType.COSMOS:
        return this.cosmosProvider || this.wcCosmosProvider;
      case WalletType.STELLAR:
        return this.wcStellarProvider;
      default:
        return null;
    }
  }

  isConnecting(walletType?: WalletType): boolean {
    if (walletType) {
      return this.connectionInProgress.has(walletType);
    }
    return this.connectionInProgress.size > 0;
  }

  async cancelConnection(walletType: WalletType): Promise<void> {
    console.debug(`[WalletService] Cancelling connection for ${walletType}`);

    this.modalClosedByUser.set(walletType, true);
    this.clearConnectionTimeout(walletType);
    this.connectionInProgress.delete(walletType);
    this.closeModalForType(walletType);

    // Clear visibility handler
    const visibilityHandler = this.visibilityHandlers.get(walletType);
    if (visibilityHandler) {
      document.removeEventListener('visibilitychange', visibilityHandler);
      this.visibilityHandlers.delete(walletType);
    }

    await this.cleanupProviderSession(walletType);
    this.emitConnectionState(walletType, 'cancelled');
  }
}

export const walletService = new WalletService();
