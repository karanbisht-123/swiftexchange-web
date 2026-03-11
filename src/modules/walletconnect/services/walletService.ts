import { WalletConnectModal } from '@walletconnect/modal';
import type UniversalProviderType from '@walletconnect/universal-provider';
import type { LocalWallet } from '@dydxprotocol/v4-client-js';

import {
  type NetworkType,
  WALLETCONNECT_METADATA,
  WALLETCONNECT_PROJECT_ID,
  buildUnifiedNamespaces,
  getCosmosChains,
  getEVMChains,
  getStellarConfig,
} from '../config/chains';
import {
  decryptAndRestore,
  encryptAndStore,
  hasEncryptedBlob,
  purge,
} from './dydxKeyManager';
import { sessionVault } from './sessionVault';


const CONNECTION_TIMEOUT_MS = 120_000;

const SESSION_STORAGE_KEY = 'wallet_sessions';

type WalletType = 'evm' | 'cosmos' | 'stellar';

type ConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'signing'
  | 'deriving'
  | 'failed'
  | 'disconnected';

interface WalletSession {
  type: WalletType;
  walletId: string;
  evmAddress?: string;
  evmChainId?: number;
  cosmosAddress?: string;
  cosmosChainId?: string;
  dydxAddress?: string;
  stellarAddress?: string;
  stellarChainId?: string;
}

interface DydxDerivation {
  address: string;
  mnemonic: string;
}

export interface UnifiedConnectionResult {
  evm?: WalletSession;
  stellar?: WalletSession;
}

let UniversalProviderClass: typeof UniversalProviderType | null = null;

async function loadUniversalProvider(): Promise<typeof UniversalProviderType> {
  if (!UniversalProviderClass) {
    const mod = await import('@walletconnect/universal-provider');
    UniversalProviderClass = mod.default;
  }
  return UniversalProviderClass;
}

function getDydxChainId(network: NetworkType): string {
  const chains = getCosmosChains(network);
  const dydxChain = chains.find(c => c.chainName === 'dYdX' || c.chainId.includes('dydx'));
  return dydxChain?.chainId ?? '';
}

async function signDydxMessage(evmAddress: string, provider: unknown): Promise<string> {
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

  const isWalletConnect = !!(provider as any)?.session;
  const dataToSign = isWalletConnect ? typedData : JSON.stringify(typedData);

  try {
    const signaturePromise = (provider as any).request({
      method: 'eth_signTypedData_v4',
      params: [evmAddress, dataToSign],
    });
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('SIGNATURE_TIMEOUT')), CONNECTION_TIMEOUT_MS)
    );

    return await Promise.race([signaturePromise, timeoutPromise]);
  } catch (error: any) {
    if (error.code === 4001 || error.code === 'ACTION_REJECTED' || error.message === 'SIGNATURE_TIMEOUT') {
      throw new Error('USER_REJECTED');
    }
    throw new Error('Wallet does not support eth_signTypedData_v4');
  }
}

async function deriveDydxAddress(evmAddress: string, provider: unknown): Promise<DydxDerivation> {
  const { onboarding, LocalWallet: LW, BECH32_PREFIX } = await import('@dydxprotocol/v4-client-js');

  const signature = await signDydxMessage(evmAddress, provider);
  const derived = onboarding.deriveHDKeyFromEthereumSignature(signature);

  if (!derived.mnemonic) {
    throw new Error('Failed to derive mnemonic from signature');
  }

  const wallet = await LW.fromMnemonic(derived.mnemonic, BECH32_PREFIX);
  return { address: wallet.address ?? '', mnemonic: derived.mnemonic };
}

class WalletService {
  private sessions = new Map<WalletType, WalletSession>();
  private providers = new Map<string, any>();
  private modals = new Map<string, WalletConnectModal>();
  private listeners = new Set<(type: WalletType, state: ConnectionState) => void>();
  private currentNetwork: NetworkType = 'mainnet';
  private derivationInProgress = false;
  private registeredProviders = new Set<any>();
  private lastPingAt = new Map<WalletType, number>();
  private disconnecting = new Set<WalletType>();

  constructor() {
    this.loadNetwork();
  }

  private loadNetwork(): void {
    try {
      const stored = localStorage.getItem('network');
      this.currentNetwork = stored === 'testnet' ? 'testnet' : 'mainnet';
    } catch (error) {
      console.warn('[WalletService] Failed to read network from storage:', error);
      this.currentNetwork = 'mainnet';
    }
  }

  getNetwork(): NetworkType {
    return this.currentNetwork;
  }

  async setNetwork(network: NetworkType): Promise<void> {
    if (this.currentNetwork === network) return;
    this.currentNetwork = network;
    localStorage.setItem('network', network);
    await Promise.all([
      this.disconnect('evm'),
      this.disconnect('cosmos'),
      this.disconnect('stellar'),
    ]);
    this.clearSessionStorage();
  }

  private async getOrCreateProvider(key: string): Promise<any> {
    const existing = this.providers.get(key);
    if (existing?.session) return existing;

    const { Core } = await import('@walletconnect/core');
    const ProviderClass = await loadUniversalProvider();

    const core = new Core({
      projectId: WALLETCONNECT_PROJECT_ID,
      customStoragePrefix: `swiftex_${key}`,
    });

    const provider = await ProviderClass.init({
      projectId: WALLETCONNECT_PROJECT_ID,
      metadata: {
        ...WALLETCONNECT_METADATA,
        name: `${WALLETCONNECT_METADATA.name} (${key})`,
      },
      core,
    });

    this.providers.set(key, provider);
    return provider;
  }


  async connectUnified(walletId: string): Promise<UnifiedConnectionResult> {
    this.emitState('evm', 'connecting');

    let provider: any;
    let modal: WalletConnectModal | undefined;

    try {
      provider = await this.getOrCreateProvider('unified');
      const namespaces = buildUnifiedNamespaces(this.currentNetwork);

      const evmChains = getEVMChains(this.currentNetwork).map(c => `eip155:${c.chainId}`);
      const stellarConfig = getStellarConfig(this.currentNetwork);
      const stellarChain = `stellar:${stellarConfig.chainId}`;

      modal = new WalletConnectModal({
        projectId: WALLETCONNECT_PROJECT_ID,
        chains: [...evmChains, stellarChain],
        themeMode: 'dark',
      });
      this.modals.set('unified', modal);

      const session = await new Promise<any>((resolve, reject) => {
        const timeout = setTimeout(() => {
          modal!.closeModal();
          reject(new Error('Connection timeout'));
        }, CONNECTION_TIMEOUT_MS);

        provider.on('display_uri', (uri: string) => {
          this.openMobileDeepLink(walletId, uri);
          modal!.openModal({ uri });
        });

        provider
          .connect({ ...namespaces })
          .then((s: any) => {
            clearTimeout(timeout);
            modal!.closeModal();
            resolve(s);
          })
          .catch((err: any) => {
            clearTimeout(timeout);
            modal!.closeModal();
            reject(err);
          });
      });

      const result: UnifiedConnectionResult = {};


      const evmAccounts: string[] = session.namespaces?.eip155?.accounts ?? [];
      if (evmAccounts.length > 0) {
        const [, chainIdStr, address] = evmAccounts[0].split(':');
        const evmSession: WalletSession = {
          type: 'evm',
          walletId,
          evmAddress: address,
          evmChainId: parseInt(chainIdStr, 10),
        };
        this.sessions.set('evm', evmSession);
        this.providers.set('evm', provider);
        result.evm = evmSession;
        this.emitState('evm', 'connected');
      }


      const stellarAccounts: string[] = session.namespaces?.stellar?.accounts ?? [];
      if (stellarAccounts.length > 0) {
        const [, chainId, address] = stellarAccounts[0].split(':');
        const stellarSession: WalletSession = {
          type: 'stellar',
          walletId,
          stellarAddress: address,
          stellarChainId: chainId,
        };
        this.sessions.set('stellar', stellarSession);
        this.providers.set('stellar', provider);
        result.stellar = stellarSession;
        this.emitState('stellar', 'connected');
      }

      this.setupWalletConnectListeners(provider, 'evm');
      if (result.stellar) {
        this.setupWalletConnectListeners(provider, 'stellar');
      }

      this.saveSession();
      return result;
    } catch (error) {
      modal?.closeModal();
      if (provider && !provider.session) {
        this.providers.delete('unified');
      }
      this.emitState('evm', 'failed');
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // Individual chain connect (extension wallets + single-namespace WalletConnect)
  // ---------------------------------------------------------------------------

  async connectChainWallet(
    walletId: string,
    preferredType: 'evm' | 'cosmos' = 'evm',
    autoDeriveWallet = true
  ): Promise<WalletSession & { derivationSkipped?: boolean }> {
    const type: WalletType = preferredType;
    this.emitState(type, 'connecting');

    try {
      let provider: any;
      let evmAddress: string | undefined;
      let evmChainId: number | undefined;
      let cosmosAddress: string | undefined;
      let cosmosChainId: string | undefined;

      if (walletId !== 'walletconnect' && this.isExtensionInstalled(walletId)) {
        const result = await this.connectExtension(walletId, preferredType);
        provider = result.provider;
        evmAddress = result.evmAddress;
        evmChainId = result.evmChainId;
        cosmosAddress = result.cosmosAddress;
        cosmosChainId = result.cosmosChainId;
      } else {
        const result = await this.connectWalletConnectSingle(walletId, preferredType);
        provider = result.provider;
        evmAddress = result.evmAddress;
        evmChainId = result.evmChainId;
        cosmosAddress = result.cosmosAddress;
        cosmosChainId = result.cosmosChainId;
      }

      const session: WalletSession = {
        type,
        walletId,
        evmAddress,
        evmChainId,
        cosmosAddress,
        cosmosChainId,
      };

      this.sessions.set(type, session);
      this.providers.set(type, provider);
      this.emitState(type, 'connected');

      const dydxChainId = getDydxChainId(this.currentNetwork);

      if (evmAddress && autoDeriveWallet) {
        this.emitState(type, 'signing');

        try {
          // Give WalletConnect sessions a moment to settle before signing
          if (provider?.session) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }

          const derived = await deriveDydxAddress(evmAddress, provider);
          session.dydxAddress = await encryptAndStore(derived.mnemonic);
          // Zero out the mnemonic reference immediately after handing it off
          derived.mnemonic = '';

          this.sessions.set(type, session);
          this.emitState(type, 'connected');
          this.saveSession();
          return session;
        } catch (error: any) {
          this.emitState(type, 'connected');
          this.saveSession();
          // User rejected or timed out — not a hard failure. They can derive later.
          return { ...session, derivationSkipped: true };
        }
      } else if (cosmosChainId === dydxChainId) {
        session.dydxAddress = cosmosAddress!;
        this.sessions.set(type, session);
      }

      this.emitState(type, 'connected');
      this.saveSession();
      return session;
    } catch (error) {
      this.emitState(type, 'failed');
      throw error;
    }
  }

  async connectStellar(walletId: string): Promise<WalletSession> {
    this.emitState('stellar', 'connecting');

    try {
      const win = window as any;
      if (walletId === 'freighter' && win.freighter) {
        return await this.connectStellarExtension(win.freighter);
      }
      return await this.connectStellarWalletConnectSingle(walletId);
    } catch (error) {
      this.emitState('stellar', 'failed');
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // dYdX derivation
  // ---------------------------------------------------------------------------

  async deriveDydx(): Promise<DydxDerivation> {
    const session = this.sessions.get('evm') ?? this.sessions.get('cosmos');
    if (!session) throw new Error('Wallet not connected');

    if (session.dydxAddress && sessionVault.has()) {
      return { address: session.dydxAddress, mnemonic: '' };
    }

    const evmProvider = this.providers.get('evm');
    if (!evmProvider || !session.evmAddress) {
      throw new Error('EVM wallet required for dYdX derivation');
    }

    if (this.derivationInProgress) {
      throw new Error('Derivation already in progress');
    }

    try {
      this.derivationInProgress = true;
      this.emitState(session.type, 'signing');

      const derived = await deriveDydxAddress(session.evmAddress, evmProvider);
      session.dydxAddress = await encryptAndStore(derived.mnemonic);
      derived.mnemonic = '';

      this.sessions.set(session.type, session);
      this.derivationInProgress = false;
      this.emitState(session.type, 'connected');
      this.saveSession();

      return { address: session.dydxAddress, mnemonic: '' };
    } catch (error: any) {
      this.derivationInProgress = false;
      this.emitState(session.type, 'connected');

      if (error.message === 'USER_REJECTED') {
        throw new Error('Signature rejected by user');
      }
      throw error;
    }
  }

  getSigningWallet(): LocalWallet | null {
    return sessionVault.get();
  }

  // ---------------------------------------------------------------------------
  // Extension wallet helpers
  // ---------------------------------------------------------------------------

  private async connectExtension(
    walletId: string,
    preferredType: 'evm' | 'cosmos'
  ): Promise<{
    provider: any;
    evmAddress?: string;
    evmChainId?: number;
    cosmosAddress?: string;
    cosmosChainId?: string;
  }> {
    const win = window as any;

    const evmProviders: Record<string, any> = {
      metamask: win.ethereum?.isMetaMask ? win.ethereum : null,
      trust: win.ethereum?.isTrust ? win.ethereum : null,
      coinbase: win.ethereum?.isCoinbaseWallet ? win.ethereum : null,
      phantom: win.phantom?.ethereum ?? null,
      rabby: win.ethereum?.isRabby ? win.ethereum : null,
      leap: win.leap?.ethereum ?? null,
      rainbow: win.ethereum?.isRainbow ? win.ethereum : null,
    };

    const cosmosProviders: Record<string, any> = {
      keplr: win.keplr,
      leap: win.leap,
    };

    let evmProvider = preferredType === 'evm' ? (evmProviders[walletId] ?? win.ethereum) : null;
    let cosmosProvider = preferredType === 'cosmos' ? cosmosProviders[walletId] : null;

    if (!evmProvider && preferredType === 'evm') cosmosProvider = cosmosProviders[walletId];
    else if (!cosmosProvider && preferredType === 'cosmos') evmProvider = evmProviders[walletId] ?? win.ethereum;

    if (!evmProvider && !cosmosProvider) throw new Error('Wallet extension not found');

    const provider = evmProvider ?? cosmosProvider;
    let evmAddress: string | undefined;
    let evmChainId: number | undefined;
    let cosmosAddress: string | undefined;
    let cosmosChainId: string | undefined;

    if (evmProvider) {
      const accounts: string[] = await evmProvider.request({ method: 'eth_requestAccounts' });
      const chainIdHex: string = await evmProvider.request({ method: 'eth_chainId' });
      evmAddress = accounts[0];
      evmChainId = parseInt(chainIdHex, 16);
      this.setupEVMListeners(evmProvider);
    }

    if (cosmosProvider) {
      try {
        const chains = getCosmosChains(this.currentNetwork);
        const dydxChainId = getDydxChainId(this.currentNetwork);
        const targetChainId = dydxChainId || chains[0].chainId;
        await cosmosProvider.enable(targetChainId);
        const account = await cosmosProvider.getKey(targetChainId);
        cosmosAddress = account.bech32Address;
        cosmosChainId = targetChainId;
        this.providers.set('cosmos', cosmosProvider);
      } catch (error) {
        console.warn('[WalletService] Cosmos extension connection failed:', error);
      }
    }

    if (!evmAddress && !cosmosAddress) throw new Error('No accounts returned from extension');
    return { provider, evmAddress, evmChainId, cosmosAddress, cosmosChainId };
  }

  private async connectStellarExtension(freighter: any): Promise<WalletSession> {
    const isConnected = await freighter.isConnected();
    if (!isConnected) await freighter.connect();

    const publicKey: string = await freighter.getPublicKey();
    const config = getStellarConfig(this.currentNetwork);

    const session: WalletSession = {
      type: 'stellar',
      walletId: 'freighter',
      stellarAddress: publicKey,
      stellarChainId: config.chainId,
    };

    this.sessions.set('stellar', session);
    this.providers.set('stellar', freighter);
    this.emitState('stellar', 'connected');
    this.saveSession();
    return session;
  }

  // ---------------------------------------------------------------------------
  // WalletConnect single-namespace helpers (for individual chain connect)
  // ---------------------------------------------------------------------------

  private async connectWalletConnectSingle(
    walletId: string,
    preferredType: 'evm' | 'cosmos'
  ): Promise<{
    provider: any;
    evmAddress?: string;
    evmChainId?: number;
    cosmosAddress?: string;
    cosmosChainId?: string;
  }> {
    const provider = await this.getOrCreateProvider(preferredType);
    const evmChains = getEVMChains(this.currentNetwork).map(c => `eip155:${c.chainId}`);
    const cosmosChains = getCosmosChains(this.currentNetwork);

    const modal = new WalletConnectModal({
      projectId: WALLETCONNECT_PROJECT_ID,
      chains: preferredType === 'evm' ? evmChains : cosmosChains.map(c => `cosmos:${c.chainId}`),
      themeMode: 'dark',
    });
    this.modals.set(preferredType, modal);

    const namespaces =
      preferredType === 'evm'
        ? {
          eip155: {
            methods: ['eth_sendTransaction', 'eth_signTypedData_v4', 'personal_sign'],
            chains: evmChains,
            events: ['chainChanged', 'accountsChanged'],
          },
        }
        : {
          cosmos: {
            methods: ['cosmos_signDirect', 'cosmos_signAmino'],
            chains: cosmosChains.map(c => `cosmos:${c.chainId}`),
            events: ['accountsChanged'],
          },
        };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        modal.closeModal();
        reject(new Error('Connection timeout'));
      }, CONNECTION_TIMEOUT_MS);

      provider.on('display_uri', (uri: string) => {
        this.openMobileDeepLink(walletId, uri);
        modal.openModal({ uri });
      });

      provider
        .connect({ namespaces: namespaces as any })
        .then((session: any) => {
          clearTimeout(timeout);
          modal.closeModal();

          const evmAccount: string | undefined = session.namespaces?.eip155?.accounts?.[0];
          const cosmosAccount: string | undefined = session.namespaces?.cosmos?.accounts?.[0];

          if (preferredType === 'evm' && !evmAccount) {
            reject(new Error('EVM account not returned'));
            return;
          }
          if (preferredType === 'cosmos' && !cosmosAccount) {
            reject(new Error('Cosmos account not returned'));
            return;
          }

          let evmAddress: string | undefined;
          let evmChainId: number | undefined;
          let cosmosAddress: string | undefined;
          let cosmosChainId: string | undefined;

          if (evmAccount) {
            const [, chainIdStr, addr] = evmAccount.split(':');
            evmAddress = addr;
            evmChainId = parseInt(chainIdStr, 10);
          }
          if (cosmosAccount) {
            const [, chainId, addr] = cosmosAccount.split(':');
            cosmosAddress = addr;
            cosmosChainId = chainId;
          }

          this.setupWalletConnectListeners(provider, preferredType);
          resolve({ provider, evmAddress, evmChainId, cosmosAddress, cosmosChainId });
        })
        .catch((error: any) => {
          clearTimeout(timeout);
          modal.closeModal();
          reject(error);
        });
    });
  }

  private async connectStellarWalletConnectSingle(walletId: string): Promise<WalletSession> {
    const provider = await this.getOrCreateProvider('stellar');
    const config = getStellarConfig(this.currentNetwork);
    const stellarChain = `stellar:${config.chainId}`;

    const modal = new WalletConnectModal({
      projectId: WALLETCONNECT_PROJECT_ID,
      chains: [stellarChain],
      themeMode: 'dark',
    });
    this.modals.set('stellar', modal);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        modal.closeModal();
        reject(new Error('Connection timeout'));
      }, CONNECTION_TIMEOUT_MS);

      provider.on('display_uri', (uri: string) => {
        modal.openModal({ uri });
      });

      provider
        .connect({
          namespaces: {
            stellar: {
              methods: ['stellar_signTransaction', 'stellar_signAndSubmitXDR'],
              chains: [stellarChain],
              events: ['accountsChanged'],
            },
          },
        })
        .then((session: any) => {
          clearTimeout(timeout);
          modal.closeModal();

          const account: string | undefined = session.namespaces?.stellar?.accounts?.[0];
          if (!account) {
            reject(new Error('No Stellar account returned'));
            return;
          }

          const [, chainId, address] = account.split(':');
          const walletSession: WalletSession = {
            type: 'stellar',
            walletId,
            stellarAddress: address,
            stellarChainId: chainId,
          };

          this.sessions.set('stellar', walletSession);
          this.providers.set('stellar', provider);
          this.setupWalletConnectListeners(provider, 'stellar');
          this.emitState('stellar', 'connected');
          this.saveSession();
          resolve(walletSession);
        })
        .catch((error: any) => {
          clearTimeout(timeout);
          modal.closeModal();
          reject(error);
        });
    });
  }

  // ---------------------------------------------------------------------------
  // Disconnect
  // ---------------------------------------------------------------------------

  async disconnect(type: WalletType): Promise<void> {
    if (this.disconnecting.has(type)) return;
    this.disconnecting.add(type);

    const provider = this.providers.get(type);

    if (provider) {
      this.registeredProviders.delete(provider);

      if (provider.session) {
        const eventsToRemove = [
          'session_event',
          'session_update',
          'session_delete',
          'session_expire',
          'session_extend',
          'session_ping',
          'proposal_expire',
          'disconnect',
          'accountsChanged',
          'chainChanged',
          'display_uri',
        ];

        if (typeof provider.removeAllListeners === 'function') {
          provider.removeAllListeners();
        } else if (typeof provider.removeListener === 'function') {
          eventsToRemove.forEach(event => {
            try { provider.removeListener(event); } catch { }
          });
        }

        try {
          await provider.disconnect();
        } catch {
        }
      }
    }

    if (type === 'evm' || type === 'cosmos') {
      await purge();
    }
    if (type === 'evm') {
      this.providers.delete('cosmos');
      this.derivationInProgress = false;
    }

    this.sessions.delete(type);
    this.lastPingAt.delete(type);
    this.providers.delete(type);
    this.modals.get(type)?.closeModal();
    this.modals.delete(type);
    this.disconnecting.delete(type);

    this.saveSession();
    this.emitState(type, 'disconnected');
  }

  private handleDisconnect(type: WalletType): void {
    if (this.disconnecting.has(type)) return;
    void this.disconnect(type);
  }

  // ---------------------------------------------------------------------------
  // Session persistence
  // ---------------------------------------------------------------------------

  private saveSession(): void {
    try {
      const data: Record<string, WalletSession> = {};
      this.sessions.forEach((session, type) => {
        // only public addresses and IDs
        data[type] = {
          type: session.type,
          walletId: session.walletId,
          evmAddress: session.evmAddress,
          evmChainId: session.evmChainId,
          cosmosAddress: session.cosmosAddress,
          cosmosChainId: session.cosmosChainId,
          dydxAddress: session.dydxAddress,
          stellarAddress: session.stellarAddress,
          stellarChainId: session.stellarChainId,
        };
      });
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      console.warn('[WalletService] Session storage save failed:', error);
    }
  }

  async restoreSessions(): Promise<WalletSession[]> {
    const restored: WalletSession[] = [];

    try {
      const stored = localStorage.getItem(SESSION_STORAGE_KEY);
      if (!stored) return [];

      const data = JSON.parse(stored) as Record<string, WalletSession>;
      const hasDydxBlob = hasEncryptedBlob();

      for (const [typeStr, savedSession] of Object.entries(data)) {
        const type = typeStr as WalletType;
        try {
          // Try to restore via WalletConnect active session first
          let provider = this.providers.get(type) ?? this.providers.get('unified');
          if (!provider) {
            try {
              provider = await this.getOrCreateProvider(type);
              this.providers.set(type, provider);
            } catch (error) {
              console.warn(`[WalletService] Provider init failed for ${type}:`, error);
            }
          }

          if (provider?.session) {
            this.setupWalletConnectListeners(provider, type);
            const refreshed = await this.refreshSessionFromProvider(provider, savedSession);

            if (hasDydxBlob && savedSession.dydxAddress) {
              const didRestore = await decryptAndRestore();
              if (didRestore) {
                refreshed.dydxAddress = savedSession.dydxAddress;
              }
            }

            this.sessions.set(type, refreshed);
            restored.push(refreshed);
            this.emitState(type, 'connected');
          } else if (
            savedSession.walletId !== 'walletconnect' &&
            this.isExtensionInstalled(savedSession.walletId)
          ) {
            const restoredSession = await this.restoreExtensionSession(type, savedSession, hasDydxBlob);
            if (restoredSession) {
              restored.push(restoredSession);
            }
          }
        } catch (error) {
          console.warn(`[WalletService] Failed to restore session for ${type}:`, error);
        }
      }
    } catch (error) {
      console.warn('[WalletService] Could not read stored sessions:', error);
    }

    return restored;
  }

  private async restoreExtensionSession(
    type: WalletType,
    savedSession: WalletSession,
    hasDydxBlob: boolean
  ): Promise<WalletSession | null> {
    const win = window as any;

    if (type === 'stellar' && savedSession.walletId === 'freighter' && win.freighter) {
      try {
        const isConnected = await win.freighter.isConnected();
        if (!isConnected) return null;

        const publicKey: string = await win.freighter.getPublicKey();
        const config = getStellarConfig(this.currentNetwork);

        const session: WalletSession = {
          type: 'stellar',
          walletId: 'freighter',
          stellarAddress: publicKey,
          stellarChainId: config.chainId,
        };

        this.sessions.set('stellar', session);
        this.providers.set('stellar', win.freighter);
        this.emitState('stellar', 'connected');
        return session;
      } catch (error) {
        console.warn('[WalletService] Freighter restore failed:', error);
        return null;
      }
    }

    if (type === 'evm') {
      try {
        const evmProviders: Record<string, any> = {
          metamask: win.ethereum?.isMetaMask ? win.ethereum : null,
          trust: win.ethereum?.isTrust ? win.ethereum : null,
          coinbase: win.ethereum?.isCoinbaseWallet ? win.ethereum : null,
          phantom: win.phantom?.ethereum ?? null,
          rabby: win.ethereum?.isRabby ? win.ethereum : null,
          rainbow: win.ethereum?.isRainbow ? win.ethereum : null,
        };

        const evmProvider = evmProviders[savedSession.walletId] ?? win.ethereum;
        if (!evmProvider) return null;

        const accounts: string[] = await evmProvider.request({ method: 'eth_accounts' });
        if (!accounts?.length) return null;

        const chainIdHex: string = await evmProvider.request({ method: 'eth_chainId' });
        const session: WalletSession = {
          type: 'evm',
          walletId: savedSession.walletId,
          evmAddress: accounts[0],
          evmChainId: parseInt(chainIdHex, 16),
        };

        if (hasDydxBlob && savedSession.dydxAddress) {
          const didRestore = await decryptAndRestore();
          if (didRestore) session.dydxAddress = savedSession.dydxAddress;
        }

        this.sessions.set('evm', session);
        this.providers.set('evm', evmProvider);
        this.setupEVMListeners(evmProvider);
        this.emitState('evm', 'connected');
        return session;
      } catch (error) {
        console.warn('[WalletService] EVM extension restore failed:', error);
        return null;
      }
    }

    if (type === 'cosmos') {
      try {
        const cosmosProviders: Record<string, any> = {
          keplr: win.keplr,
          leap: win.leap,
        };

        const cosmosProvider = cosmosProviders[savedSession.walletId];
        if (!cosmosProvider) return null;

        const dydxChainId = getDydxChainId(this.currentNetwork);
        const chains = getCosmosChains(this.currentNetwork);
        const targetChainId = dydxChainId || chains[0].chainId;

        await cosmosProvider.enable(targetChainId);
        const account = await cosmosProvider.getKey(targetChainId);

        const session: WalletSession = {
          type: 'cosmos',
          walletId: savedSession.walletId,
          cosmosAddress: account.bech32Address,
          cosmosChainId: targetChainId,
        };

        if (targetChainId === dydxChainId) {
          session.dydxAddress = account.bech32Address;
        }

        this.sessions.set('cosmos', session);
        this.providers.set('cosmos', cosmosProvider);
        this.emitState('cosmos', 'connected');
        return session;
      } catch (error) {
        console.warn('[WalletService] Cosmos extension restore failed:', error);
        return null;
      }
    }

    return null;
  }

  private async refreshSessionFromProvider(
    provider: any,
    saved: WalletSession
  ): Promise<WalletSession> {
    const session = provider.session;
    let evmAddress: string | undefined;
    let evmChainId: number | undefined;
    let cosmosAddress: string | undefined;
    let cosmosChainId: string | undefined;
    let stellarAddress: string | undefined;
    let stellarChainId: string | undefined;

    const evmAccount: string | undefined = session.namespaces?.eip155?.accounts?.[0];
    if (evmAccount) {
      const [, chainIdStr, addr] = evmAccount.split(':');
      evmAddress = addr;
      evmChainId = parseInt(chainIdStr, 10);
    }

    const cosmosAccount: string | undefined = session.namespaces?.cosmos?.accounts?.[0];
    if (cosmosAccount) {
      const [, chainId, addr] = cosmosAccount.split(':');
      cosmosAddress = addr;
      cosmosChainId = chainId;
    }

    const stellarAccount: string | undefined = session.namespaces?.stellar?.accounts?.[0];
    if (stellarAccount) {
      const [, chainId, addr] = stellarAccount.split(':');
      stellarAddress = addr;
      stellarChainId = chainId;
    }

    const refreshed: WalletSession = {
      type: saved.type,
      walletId: saved.walletId,
      evmAddress,
      evmChainId,
      cosmosAddress,
      cosmosChainId,
      stellarAddress,
      stellarChainId,
    };

    const dydxChainId = getDydxChainId(this.currentNetwork);
    if (cosmosChainId === dydxChainId && cosmosAddress) {
      refreshed.dydxAddress = cosmosAddress;
    }

    return refreshed;
  }

  private clearSessionStorage(): void {
    try {
      localStorage.removeItem(SESSION_STORAGE_KEY);
      purge();
    } catch (error) {
      console.warn('[WalletService] Session storage clear failed:', error);
    }
  }

  // ---------------------------------------------------------------------------
  // EVM & WalletConnect event listeners
  // ---------------------------------------------------------------------------

  private setupEVMListeners(provider: any): void {
    provider.on('accountsChanged', (accounts: string[]) => {
      if (!accounts?.length) {
        this.handleDisconnect('evm');
        return;
      }

      const session = this.sessions.get('evm');
      if (!session) return;

      const oldAddress = session.evmAddress?.toLowerCase();
      session.evmAddress = accounts[0];

      if (oldAddress && oldAddress !== session.evmAddress.toLowerCase()) {
        delete session.dydxAddress;
        purge();
      }

      this.sessions.set('evm', session);
      this.saveSession();
      this.emitState('evm', 'connected');
    });

    provider.on('chainChanged', (chainId: string) => {
      const session = this.sessions.get('evm');
      if (!session) return;
      session.evmChainId = parseInt(chainId, 16);
      this.sessions.set('evm', session);
      this.saveSession();
      this.emitState('evm', 'connected');
    });

    provider.on('disconnect', () => {
      this.handleDisconnect('evm');
    });
  }

  private setupWalletConnectListeners(provider: any, type: WalletType): void {
    if (this.registeredProviders.has(provider)) return;
    this.registeredProviders.add(provider);

    provider.on('session_event', ({ event, chainId: _chainId }: { event: { name: string; data: any }; chainId: string }) => {
      if (event.name === 'accountsChanged') this.handleAccountsChanged(type, event.data);
      if (event.name === 'chainChanged') this.handleChainChanged(type, event.data);
    });

    provider.on('session_update', ({ params }: { topic: string; params: any }) => {
      if (params?.namespaces) this.handleSessionUpdate(type, params.namespaces);
    });

    provider.on('session_delete', () => this.handleDisconnect(type));

    provider.on('session_expire', () => this.handleDisconnect(type));

    provider.on('session_ping', () => {
      this.lastPingAt.set(type, Date.now());
    });

    provider.on('session_extend', () => {
      const session = this.sessions.get(type);
      if (session) {
        this.emitState(type, 'connected');
      }
    });

    provider.on('proposal_expire', () => {
    });

    provider.on('disconnect', () => this.handleDisconnect(type));
  }

  private handleAccountsChanged(type: WalletType, accounts: unknown): void {
    if (!accounts || (Array.isArray(accounts) && accounts.length === 0)) {
      this.handleDisconnect(type);
      return;
    }

    const session = this.sessions.get(type);
    if (!session) return;

    const firstAccount = Array.isArray(accounts) ? accounts[0] : accounts;
    if (typeof firstAccount !== 'string') return;

    const oldEvmAddress = session.evmAddress?.toLowerCase();

    if (type === 'evm') {
      if (firstAccount.includes(':')) {
        const [, chainIdStr, address] = firstAccount.split(':');
        session.evmAddress = address;
        session.evmChainId = parseInt(chainIdStr, 10);
      } else {
        session.evmAddress = firstAccount;
      }

      if (oldEvmAddress && oldEvmAddress !== session.evmAddress?.toLowerCase()) {
        delete session.dydxAddress;
        purge();
      }
    } else if (type === 'cosmos') {
      if (firstAccount.includes(':')) {
        const [, chainId, address] = firstAccount.split(':');
        session.cosmosAddress = address;
        session.cosmosChainId = chainId;
      } else {
        session.cosmosAddress = firstAccount;
      }
    } else if (type === 'stellar') {
      if (firstAccount.includes(':')) {
        const [, chainId, address] = firstAccount.split(':');
        session.stellarAddress = address;
        session.stellarChainId = chainId;
      } else {
        session.stellarAddress = firstAccount;
      }
    }

    this.sessions.set(type, session);
    this.saveSession();
    this.emitState(type, 'connected');
  }

  private handleChainChanged(type: WalletType, chainData: unknown): void {
    const session = this.sessions.get(type);
    if (!session || type !== 'evm') return;

    if (typeof chainData === 'string') {
      session.evmChainId = chainData.startsWith('0x')
        ? parseInt(chainData, 16)
        : parseInt(chainData, 10);
    } else if (typeof chainData === 'number') {
      session.evmChainId = chainData;
    } else {
      return;
    }

    this.sessions.set(type, session);
    this.saveSession();
    this.emitState(type, 'connected');
  }

  private handleSessionUpdate(type: WalletType, namespaces: any): void {
    const session = this.sessions.get(type);
    if (!session) return;

    if (type === 'evm' && namespaces.eip155) {
      const account: string | undefined = namespaces.eip155.accounts?.[0];
      if (account) {
        const [, chainIdStr, address] = account.split(':');
        session.evmAddress = address;
        session.evmChainId = parseInt(chainIdStr, 10);
      }
    } else if (type === 'cosmos' && namespaces.cosmos) {
      const account: string | undefined = namespaces.cosmos.accounts?.[0];
      if (account) {
        const [, chainId, address] = account.split(':');
        session.cosmosAddress = address;
        session.cosmosChainId = chainId;
      }
    } else if (type === 'stellar' && namespaces.stellar) {
      const account: string | undefined = namespaces.stellar.accounts?.[0];
      if (account) {
        const [, chainId, address] = account.split(':');
        session.stellarAddress = address;
        session.stellarChainId = chainId;
      }
    }

    this.sessions.set(type, session);
    this.saveSession();
    this.emitState(type, 'connected');
  }

  // ---------------------------------------------------------------------------
  // Mobile deep links
  // ---------------------------------------------------------------------------

  private openMobileDeepLink(walletId: string, uri: string): void {
    if (!/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) return;

    const deepLinks: Record<string, string> = {
      metamask: `https://metamask.app.link/wc?uri=${encodeURIComponent(uri)}`,
      trust: `https://link.trustwallet.com/wc?uri=${encodeURIComponent(uri)}`,
      coinbase: `https://go.cb-w.com/wc?uri=${encodeURIComponent(uri)}`,
      phantom: `https://phantom.app/ul/v1/connect?uri=${encodeURIComponent(uri)}`,
      keplr: `keplrwallet://wcV2?uri=${encodeURIComponent(uri)}`,
      leap: `leapcosmos://wcV2?uri=${encodeURIComponent(uri)}`,
      rainbow: `https://rnbwapp.com/wc?uri=${encodeURIComponent(uri)}`,
    };

    const link = deepLinks[walletId];
    if (link) {
      setTimeout(() => {
        window.location.href = link;
      }, 100);
    }
  }

  // ---------------------------------------------------------------------------
  // Session health
  // ---------------------------------------------------------------------------

  async checkSessionHealth(): Promise<{ type: WalletType; valid: boolean }[]> {
    const results: { type: WalletType; valid: boolean }[] = [];

    for (const [type] of this.sessions.entries()) {
      const provider = this.providers.get(type);
      const hasSession = !!provider?.session;
      const notExpired = hasSession
        ? !provider.session.expiry || Date.now() / 1000 < provider.session.expiry
        : false;

      const valid = hasSession && notExpired;
      results.push({ type, valid });

      if (!valid) {
        this.handleDisconnect(type);
      }
    }

    return results;
  }

  // ---------------------------------------------------------------------------
  // Public accessors
  // ---------------------------------------------------------------------------

  getSession(type: WalletType): WalletSession | null {
    return this.sessions.get(type) ?? null;
  }

  getProvider(type: WalletType): any {
    return this.providers.get(type) ?? null;
  }

  getLastPingAt(type: WalletType): number | null {
    return this.lastPingAt.get(type) ?? null;
  }

  isConnected(type: WalletType): boolean {
    return this.sessions.has(type);
  }

  hasDydxWallet(): boolean {
    const evm = this.sessions.get('evm');
    const cosmos = this.sessions.get('cosmos');
    return !!(evm?.dydxAddress ?? cosmos?.dydxAddress);
  }

  private isExtensionInstalled(walletId: string): boolean {
    const win = window as any;
    const checks: Record<string, boolean> = {
      metamask: !!win.ethereum?.isMetaMask,
      trust: !!win.ethereum?.isTrust,
      coinbase: !!win.ethereum?.isCoinbaseWallet,
      phantom: !!win.phantom?.ethereum,
      rabby: !!win.ethereum?.isRabby,
      rainbow: !!win.ethereum?.isRainbow,
      keplr: !!win.keplr,
      leap: !!win.leap,
      freighter: !!win.freighter,
    };
    return checks[walletId] ?? false;
  }

  getInstalledWallets(): string[] {
    const win = window as any;
    const installed: string[] = [];
    if (win.ethereum?.isMetaMask) installed.push('metamask');
    if (win.ethereum?.isTrust) installed.push('trust');
    if (win.ethereum?.isCoinbaseWallet) installed.push('coinbase');
    if (win.phantom?.ethereum) installed.push('phantom');
    if (win.ethereum?.isRabby) installed.push('rabby');
    if (win.ethereum?.isRainbow) installed.push('rainbow');
    if (win.keplr) installed.push('keplr');
    if (win.leap) installed.push('leap');
    if (win.freighter) installed.push('freighter');
    return installed;
  }

  onStateChange(callback: (type: WalletType, state: ConnectionState) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private emitState(type: WalletType, state: ConnectionState): void {
    this.listeners.forEach(cb => {
      try {
        cb(type, state);
      } catch {

      }
    });
  }
}

export const walletService = new WalletService();
