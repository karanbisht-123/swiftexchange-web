import { WalletConnectModal } from '@walletconnect/modal';
import type UniversalProviderType from '@walletconnect/universal-provider';

import {
  type NetworkType,
  WALLETCONNECT_METADATA,
  WALLETCONNECT_PROJECT_ID,
  getCosmosChains,
  getEVMChains,
  getStellarConfig,
} from '../config/chains';
import { encryptionService } from './encryptionService';

const { onboarding, LocalWallet, BECH32_PREFIX } = await import('@dydxprotocol/v4-client-js');

const CONNECTION_TIMEOUT = 120000;
const SESSION_KEY = 'wallet_sessions';
const ENCRYPTED_MNEMONIC_KEY = 'dydx_encrypted_mnemonic';

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
  dydxMnemonic?: string;
  stellarAddress?: string;
  stellarChainId?: string;
}

interface DydxDerivation {
  address: string;
  mnemonic: string;
}

function getDydxChainId(network: NetworkType): string {
  const chains = getCosmosChains(network);
  const dydxChain = chains.find(c => c.chainName === 'dYdX' || c.chainId.includes('dydx'));
  return dydxChain?.chainId || '';
}

async function signDydxMessage(evmAddress: string, provider: any): Promise<string> {
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

  const isWC = provider && provider.session;
  const dataToSign = isWC ? typedData : JSON.stringify(typedData);

  try {
    const signaturePromise = provider.request({
      method: 'eth_signTypedData_v4',
      params: [evmAddress, dataToSign],
    });
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('SIGNATURE_TIMEOUT')), 120000);
    });

    return await Promise.race([signaturePromise, timeoutPromise]);
  } catch (error: any) {
    if (error.code === 4001 || error.code === 'ACTION_REJECTED') {
      throw new Error('USER_REJECTED');
    }
    if (error.message === 'SIGNATURE_TIMEOUT') {
      throw new Error('USER_REJECTED');
    }
    throw new Error('Wallet does not support eth_signTypedData_v4');
  }
}

async function deriveDydxAddress(evmAddress: string, provider: any): Promise<DydxDerivation> {
  const signature = await signDydxMessage(evmAddress, provider);
  const derived = onboarding.deriveHDKeyFromEthereumSignature(signature);
  if (!derived.mnemonic) throw new Error('Failed to derive mnemonic');
  const wallet = await LocalWallet.fromMnemonic(derived.mnemonic, BECH32_PREFIX);
  try {
    const encryptedMnemonic = await encryptionService.encrypt(derived.mnemonic);
    localStorage.setItem(ENCRYPTED_MNEMONIC_KEY, encryptedMnemonic);
    // console.log('[WalletService] Mnemonic encrypted and stored securely');
  } catch (error) {
    console.error('[WalletService] Failed to encrypt mnemonic:', error);
  }

  // console.log('[WalletService] Wallet derived:', wallet.address);
  return { address: wallet.address || '', mnemonic: derived.mnemonic };
}

let UniversalProvider: typeof UniversalProviderType | null = null;

class WalletService {
  private sessions = new Map<WalletType, WalletSession>();
  private providers = new Map<string, any>();
  private modals = new Map<WalletType, WalletConnectModal>();
  private listeners = new Set<(type: WalletType, state: ConnectionState) => void>();
  private currentNetwork: NetworkType = 'mainnet';
  private derivationInProgress = false;

  private inMemoryMnemonics = new Map<string, string>();

  constructor() {
    this.loadNetwork();
  }

  private loadNetwork(): void {
    try {
      const stored = localStorage.getItem('network');
      this.currentNetwork = stored === 'testnet' ? 'testnet' : 'mainnet';
    } catch {
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

  async connectChainWallet(
    walletId: string,
    preferredType: 'evm' | 'cosmos' = 'evm',
    autoDeriveWallet: boolean = true
  ): Promise<WalletSession & { dydxMnemonic?: string; derivationSkipped?: boolean }> {
    const type: WalletType = preferredType;
    console.log(`[WalletService] Connecting ${type}:`, walletId);
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
        const result = await this.connectWalletConnect(walletId, preferredType);
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
        // console.log('[WalletService] Auto-deriving dYdX wallet...');
        this.emitState(type, 'signing');

        try {
          const isWC = provider && provider.session;
          if (isWC) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }

          const derived = await deriveDydxAddress(evmAddress, provider);
          session.dydxAddress = derived.address;
          this.inMemoryMnemonics.set(evmAddress.toLowerCase(), derived.mnemonic);

          this.sessions.set(type, session);
          // console.log('[WalletService] dYdX wallet derived:', derived.address);

          this.emitState(type, 'connected');
          this.saveSession();

          const mnemonic = this.inMemoryMnemonics.get(evmAddress.toLowerCase());
          return {
            ...session,
            dydxMnemonic: mnemonic,
          };
        } catch (error: any) {
          console.warn('[WalletService] dYdX derivation failed:', error);
          this.emitState(type, 'connected');
          this.saveSession();
          if (error.message === 'USER_REJECTED') {
            console.log('[WalletService] User rejected signature - can derive later');
            return {
              ...session,
              derivationSkipped: true,
            };
          }
          console.log('[WalletService] Derivation skipped due to error - can derive later');
          return {
            ...session,
            derivationSkipped: true,
          };
        }
      } else if (cosmosChainId === dydxChainId) {
        session.dydxAddress = cosmosAddress!;
        this.sessions.set(type, session);
      }

      this.emitState(type, 'connected');
      this.saveSession();

      const mnemonic = evmAddress
        ? this.inMemoryMnemonics.get(evmAddress.toLowerCase())
        : undefined;

      return {
        ...session,
        dydxMnemonic: mnemonic,
      };
    } catch (error: any) {
      console.error(`[WalletService] Connection failed:`, error);
      this.emitState(type, 'failed');
      throw error;
    }
  }

  async deriveDydx(): Promise<DydxDerivation> {
    const session = this.sessions.get('evm') || this.sessions.get('cosmos');
    if (!session) throw new Error('Wallet not connected');

    if (session.dydxAddress && session.evmAddress) {
      const mnemonic = this.inMemoryMnemonics.get(session.evmAddress.toLowerCase());
      if (mnemonic) {
        return { address: session.dydxAddress, mnemonic };
      }
    }

    const evmProvider = this.providers.get('evm');
    if (!evmProvider || !session.evmAddress) {
      throw new Error('EVM wallet required');
    }

    if (this.derivationInProgress) {
      throw new Error('Derivation already in progress');
    }

    try {
      this.derivationInProgress = true;
      console.log('[WalletService] Deriving dYdX wallet...');
      this.emitState(session.type, 'signing');

      const derived = await deriveDydxAddress(session.evmAddress, evmProvider);

      session.dydxAddress = derived.address;
      this.inMemoryMnemonics.set(session.evmAddress.toLowerCase(), derived.mnemonic);

      this.sessions.set(session.type, session);
      this.derivationInProgress = false;
      this.emitState(session.type, 'connected');
      this.saveSession();

      console.log('[WalletService] dYdX wallet derived:', derived.address);
      return derived;
    } catch (error: any) {
      this.derivationInProgress = false;
      this.emitState(session.type, 'connected');

      if (error.message === 'USER_REJECTED') {
        throw new Error('Signature rejected by user');
      }
      throw error;
    }
  }

  getMnemonic(evmAddress: string): string | undefined {
    return this.inMemoryMnemonics.get(evmAddress.toLowerCase());
  }

  async restoreMnemonicFromStorage(): Promise<string | null> {
    try {
      const encrypted = localStorage.getItem(ENCRYPTED_MNEMONIC_KEY);
      if (!encrypted) return null;

      const decrypted = await encryptionService.decrypt(encrypted);
      return decrypted;
    } catch (error) {
      console.error('[WalletService] Failed to restore mnemonic:', error);
      return null;
    }
  }

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
      phantom: win.phantom?.ethereum || null,
      rabby: win.ethereum?.isRabby ? win.ethereum : null,
      leap: win.leap?.ethereum || null,
    };
    const cosmosProviders: Record<string, any> = {
      keplr: win.keplr,
      leap: win.leap,
    };

    let evmProvider = preferredType === 'evm' ? evmProviders[walletId] || win.ethereum : null;
    let cosmosProvider = preferredType === 'cosmos' ? cosmosProviders[walletId] : null;

    if (!evmProvider && preferredType === 'evm') cosmosProvider = cosmosProviders[walletId];
    else if (!cosmosProvider && preferredType === 'cosmos')
      evmProvider = evmProviders[walletId] || win.ethereum;

    if (!evmProvider && !cosmosProvider) throw new Error('Wallet not found');

    let evmAddress, evmChainId, cosmosAddress, cosmosChainId;
    const provider = evmProvider || cosmosProvider;

    if (evmProvider) {
      const accounts = await evmProvider.request({ method: 'eth_requestAccounts' });
      const chainIdHex = await evmProvider.request({ method: 'eth_chainId' });
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
      } catch (e) {
        console.warn('[WalletService] Cosmos error:', e);
      }
    }

    if (!evmAddress && !cosmosAddress) throw new Error('No accounts found');
    return { provider, evmAddress, evmChainId, cosmosAddress, cosmosChainId };
  }

  private async connectWalletConnect(
    walletId: string,
    preferredType: 'evm' | 'cosmos'
  ): Promise<{
    provider: any;
    evmAddress?: string;
    evmChainId?: number;
    cosmosAddress?: string;
    cosmosChainId?: string;
  }> {
    if (!UniversalProvider) {
      const module = await import('@walletconnect/universal-provider');
      UniversalProvider = module.default;
    }

    console.log('[WalletService] Initializing WalletConnect...');
    const provider = await UniversalProvider.init({
      projectId: WALLETCONNECT_PROJECT_ID,
      metadata: WALLETCONNECT_METADATA,
    });

    const evmChains = getEVMChains(this.currentNetwork).map(c => `eip155:${c.chainId}`);
    const cosmosChains = getCosmosChains(this.currentNetwork);

    const modal = new WalletConnectModal({
      projectId: WALLETCONNECT_PROJECT_ID,
      chains: preferredType === 'evm' ? evmChains : cosmosChains.map(c => `cosmos:${c.chainId}`),
      themeMode: 'dark',
    });

    this.modals.set(preferredType, modal);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        modal.closeModal();
        reject(new Error('Connection timeout'));
      }, CONNECTION_TIMEOUT);

      provider.on('display_uri', (uri: string) => {
        // console.log('[WalletService] WalletConnect URI ready');
        this.openMobileDeepLink(walletId, uri);
        modal.openModal({ uri });
      });

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

      console.log('[WalletService] Requesting connection...');
      provider
        .connect({ namespaces: namespaces as any })
        .then((session: any) => {
          clearTimeout(timeout);
          modal.closeModal();
          console.log('[WalletService] Connected');

          let evmAccount =
            preferredType === 'evm' ? session.namespaces.eip155?.accounts[0] : undefined;
          let cosmosAccount =
            preferredType === 'cosmos' ? session.namespaces.cosmos?.accounts[0] : undefined;

          if (preferredType === 'evm' && !evmAccount) {
            reject(new Error('EVM account required'));
            return;
          }
          if (preferredType === 'cosmos' && !cosmosAccount) {
            reject(new Error('Cosmos account required'));
            return;
          }

          let evmAddress, evmChainId, cosmosAddress, cosmosChainId;

          if (evmAccount) {
            const [, chainIdStr, addr] = evmAccount.split(':');
            evmAddress = addr;
            evmChainId = parseInt(chainIdStr);
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
          console.error('[WalletService] Connection error:', error);
          reject(error);
        });
    });
  }

  private setupWalletConnectListeners(provider: any, type: WalletType): void {
    console.log('[WalletService] Setting up WalletConnect listeners for:', type);

    provider.on('session_ping', ({ id, topic }: { id: number; topic: string }) => {
      console.log('[WalletService] Session ping:', { id, topic, type });
    });

    // Session event - this is where chainChanged and accountsChanged come through
    provider.on(
      'session_event',
      ({ event, chainId }: { event: { name: string; data: any }; chainId: string }) => {
        console.log('[WalletService] Session event received:', { event, chainId, type });

        // Handle accountsChanged event
        if (event.name === 'accountsChanged') {
          console.log('[WalletService] Accounts changed:', event.data);
          this.handleAccountsChanged(type, event.data, chainId);
        }

        // Handle chainChanged event
        if (event.name === 'chainChanged') {
          console.log('[WalletService] Chain changed:', event.data);
          this.handleChainChanged(type, event.data);
        }
      }
    );

    // Session update - namespace changes
    provider.on('session_update', ({ topic, params }: { topic: string; params: any }) => {
      console.log('[WalletService] Session update:', { topic, params, type });

      if (params.namespaces) {
        this.handleSessionUpdate(type, params.namespaces);
      }
    });

    // Session extend - session lifetime extended
    provider.on('session_extend', ({ topic }: { topic: string }) => {
      console.log('[WalletService] Session extended:', { topic, type });
    });

    // Session expire - session expired
    provider.on('session_expire', ({ topic }: { topic: string }) => {
      console.log('[WalletService] Session expired:', { topic, type });
      this.handleDisconnect(type);
    });

    // Session delete
    provider.on('session_delete', ({ id, topic }: { id: number; topic: string }) => {
      console.log('[WalletService] Session deleted:', { id, topic, type });
      this.handleDisconnect(type);
    });
  }

  private handleAccountsChanged(type: WalletType, accounts: any, chainId?: string): void {
    console.log('[WalletService] Handling accounts changed:', { type, accounts, chainId });

    if (!accounts || (Array.isArray(accounts) && accounts.length === 0)) {
      // console.log('[WalletService] No accounts, disconnecting');
      this.handleDisconnect(type);
      return;
    }

    const session = this.sessions.get(type);
    if (!session) return;

    const oldEvmAddress = session.evmAddress?.toLowerCase();

    // Handle different account formats
    const firstAccount = Array.isArray(accounts) ? accounts[0] : accounts;

    if (type === 'evm') {
      // Could be just address or full CAIP-10 format (eip155:1:0x...)
      if (typeof firstAccount === 'string') {
        if (firstAccount.includes(':')) {
          const [, chainIdStr, address] = firstAccount.split(':');
          session.evmAddress = address;
          session.evmChainId = parseInt(chainIdStr);
        } else {
          session.evmAddress = firstAccount;
        }

        // Clear dYdX data on account change
        const newEvmAddress = session.evmAddress.toLowerCase();
        if (oldEvmAddress && oldEvmAddress !== newEvmAddress) {
          delete session.dydxAddress;
          this.inMemoryMnemonics.delete(oldEvmAddress);
        }
      }
    } else if (type === 'cosmos') {
      if (typeof firstAccount === 'string') {
        if (firstAccount.includes(':')) {
          const [, chainId, address] = firstAccount.split(':');
          session.cosmosAddress = address;
          session.cosmosChainId = chainId;
        } else {
          session.cosmosAddress = firstAccount;
        }
      }
    }

    this.sessions.set(type, session);
    this.saveSession();
    this.emitState(type, 'connected');
  }

  // Handle chain changes from session_event
  private handleChainChanged(type: WalletType, chainData: any): void {
    console.log('[WalletService] Handling chain changed:', { type, chainData });

    const session = this.sessions.get(type);
    if (!session) return;

    if (type === 'evm') {
      let parsedChainId: number;

      // chainData could be hex string, decimal string, or number
      if (typeof chainData === 'string') {
        parsedChainId = chainData.startsWith('0x')
          ? parseInt(chainData, 16)
          : parseInt(chainData, 10);
      } else if (typeof chainData === 'number') {
        parsedChainId = chainData;
      } else {
        console.warn('[WalletService] Unknown chain data format:', chainData);
        return;
      }

      session.evmChainId = parsedChainId;
      this.sessions.set(type, session);
      this.saveSession();
      this.emitState(type, 'connected');
    }
  }

  private handleSessionUpdate(type: WalletType, namespaces: any): void {
    console.log('[WalletService] Handling session update:', { type, namespaces });

    const session = this.sessions.get(type);
    if (!session) return;

    if (type === 'evm' && namespaces.eip155) {
      const account = namespaces.eip155.accounts[0];
      if (account) {
        const [, chainIdStr, address] = account.split(':');
        session.evmAddress = address;
        session.evmChainId = parseInt(chainIdStr);
      }
    } else if (type === 'cosmos' && namespaces.cosmos) {
      const account = namespaces.cosmos.accounts[0];
      if (account) {
        const [, chainId, address] = account.split(':');
        session.cosmosAddress = address;
        session.cosmosChainId = chainId;
      }
    } else if (type === 'stellar' && namespaces.stellar) {
      const account = namespaces.stellar.accounts[0];
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

  async connectStellar(walletId: string): Promise<WalletSession> {
    console.log('[WalletService] Connecting Stellar:', walletId);
    this.emitState('stellar', 'connecting');

    try {
      const win = window as any;
      if (walletId === 'freighter' && win.freighter) {
        return await this.connectStellarExtension(win.freighter);
      } else {
        return await this.connectStellarWalletConnect(walletId);
      }
    } catch (error: any) {
      console.error('[WalletService] Stellar failed:', error);
      this.emitState('stellar', 'failed');
      throw error;
    }
  }

  private async connectStellarExtension(freighter: any): Promise<WalletSession> {
    const isConnected = await freighter.isConnected();
    if (!isConnected) await freighter.connect();
    const publicKey = await freighter.getPublicKey();
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

  private async connectStellarWalletConnect(walletId: string): Promise<WalletSession> {
    if (!UniversalProvider) {
      const module = await import('@walletconnect/universal-provider');
      UniversalProvider = module.default;
    }

    console.log('[WalletService] Stellar WalletConnect init...');
    const provider = await UniversalProvider.init({
      projectId: WALLETCONNECT_PROJECT_ID,
      metadata: WALLETCONNECT_METADATA,
    });

    const config = getStellarConfig(this.currentNetwork);
    const stellarChain = `stellar:${config.chainId}`;
    console.log('[WalletService] Stellar chain:', stellarChain);

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
      }, CONNECTION_TIMEOUT);

      provider.on('display_uri', (uri: string) => {
        console.log('[WalletService] Stellar URI ready');
        modal.openModal({ uri });
      });

      console.log('[WalletService] Stellar connection request...');
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
          console.log('[WalletService] Stellar connected');

          const account = session.namespaces.stellar?.accounts[0];
          if (!account) {
            reject(new Error('No Stellar account'));
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

          // Setup WalletConnect event listeners for Stellar
          this.setupWalletConnectListeners(provider, 'stellar');

          this.emitState('stellar', 'connected');
          this.saveSession();
          resolve(walletSession);
        })
        .catch((error: any) => {
          clearTimeout(timeout);
          modal.closeModal();
          console.error('[WalletService] Stellar error:', error);
          reject(error);
        });
    });
  }

  // Disconnect wallet
  async disconnect(type: WalletType): Promise<void> {
    console.log('[WalletService] Disconnecting:', type);
    const provider = this.providers.get(type);
    const session = this.sessions.get(type);

    if (provider?.session) {
      try {
        await provider.disconnect();
      } catch (e) {
        console.error('[WalletService] Disconnect error:', e);
      }
    }

    // Clear in-memory mnemonic
    if (session?.evmAddress) {
      this.inMemoryMnemonics.delete(session.evmAddress.toLowerCase());
    }

    if (type === 'evm' || type === 'cosmos') {
      this.providers.delete('cosmos');
    }

    this.sessions.delete(type);
    this.providers.delete(type);
    this.modals.get(type)?.closeModal();
    this.modals.delete(type);

    if (type === 'evm') {
      this.derivationInProgress = false;
      // Clear encrypted mnemonic from storage on disconnect
      localStorage.removeItem(ENCRYPTED_MNEMONIC_KEY);
    }

    this.saveSession();
    this.emitState(type, 'disconnected');
  }

  private handleDisconnect(type: WalletType): void {
    this.disconnect(type);
  }

  private saveSession(): void {
    try {
      const data: Record<string, WalletSession> = {};
      this.sessions.forEach((session, type) => {
        const safeSession = {
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
        data[type] = safeSession;
      });
      localStorage.setItem(SESSION_KEY, JSON.stringify(data));
      console.log('[WalletService] Session saved (no sensitive data)');
    } catch (e) {
      console.error('[WalletService] Save error:', e);
    }
  }

  async restoreSessions(): Promise<WalletSession[]> {
    console.log('[WalletService] Restoring...');
    const restored: WalletSession[] = [];

    try {
      const stored = localStorage.getItem(SESSION_KEY);
      if (!stored) return [];

      const data = JSON.parse(stored);

      for (const [typeStr, savedSession] of Object.entries(data) as [string, WalletSession][]) {
        const type = typeStr as WalletType;
        try {
          let provider = this.providers.get(type);
          if (!provider) {
            provider = await this.initProvider(type);
            this.providers.set(type, provider);
          }

          if (provider.session) {
            // Setup event listeners for restored sessions
            this.setupWalletConnectListeners(provider, type);

            const refreshed = await this.refreshSessionFromProvider(provider, savedSession);
            this.sessions.set(type, refreshed);
            restored.push(refreshed);
            this.emitState(type, 'connected');
          }
        } catch (error) {
          console.error(`[WalletService] Restore ${type} failed:`, error);
        }
      }
    } catch (error) {
      console.error('[WalletService] Restore error:', error);
    }

    console.log(`[WalletService] Restored ${restored.length} sessions`);
    return restored;
  }

  private async initProvider(_type: WalletType) {
    if (!UniversalProvider) {
      const module = await import('@walletconnect/universal-provider');
      UniversalProvider = module.default;
    }
    return await UniversalProvider.init({
      projectId: WALLETCONNECT_PROJECT_ID,
      metadata: WALLETCONNECT_METADATA,
    });
  }

  private async refreshSessionFromProvider(
    provider: any,
    saved: WalletSession
  ): Promise<WalletSession> {
    const session = provider.session;
    let evmAddress, evmChainId, cosmosAddress, cosmosChainId, stellarAddress, stellarChainId;

    if (session.namespaces.eip155) {
      const evmAccount = session.namespaces.eip155.accounts[0];
      if (evmAccount) {
        const [, chainIdStr, addr] = evmAccount.split(':');
        evmAddress = addr;
        evmChainId = parseInt(chainIdStr);
      }
    }

    if (session.namespaces.cosmos) {
      const cosmosAccount = session.namespaces.cosmos.accounts[0];
      if (cosmosAccount) {
        const [, chainId, addr] = cosmosAccount.split(':');
        cosmosAddress = addr;
        cosmosChainId = chainId;
      }
    }

    if (session.namespaces.stellar) {
      const stellarAccount = session.namespaces.stellar.accounts[0];
      if (stellarAccount) {
        const [, chainId, addr] = stellarAccount.split(':');
        stellarAddress = addr;
        stellarChainId = chainId;
      }
    }

    const refreshed: WalletSession = {
      type: saved.type,
      walletId: saved.walletId,
      evmAddress,
      evmChainId,
      cosmosAddress,
      cosmosChainId,
      dydxAddress: saved.dydxAddress,
      stellarAddress,
      stellarChainId,
    };

    const dydxChainId = getDydxChainId(this.currentNetwork);
    if (cosmosChainId === dydxChainId) {
      refreshed.dydxAddress = cosmosAddress!;
    }

    return refreshed;
  }

  private clearSessionStorage(): void {
    try {
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(ENCRYPTED_MNEMONIC_KEY);
      this.inMemoryMnemonics.clear();
    } catch (e) {
      console.error('[WalletService] Clear error:', e);
    }
  }

  private openMobileDeepLink(walletId: string, uri: string): void {
    if (!/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) return;

    const deepLinks: Record<string, string> = {
      metamask: `https://metamask.app.link/wc?uri=${encodeURIComponent(uri)}`,
      trust: `https://link.trustwallet.com/wc?uri=${encodeURIComponent(uri)}`,
      coinbase: `https://go.cb-w.com/wc?uri=${encodeURIComponent(uri)}`,
      phantom: `https://phantom.app/ul/v1/connect?uri=${encodeURIComponent(uri)}`,
      keplr: `keplrwallet://wcV2?uri=${encodeURIComponent(uri)}`,
      leap: `leapcosmos://wcV2?uri=${encodeURIComponent(uri)}`,
    };

    const link = deepLinks[walletId];
    if (link) {
      setTimeout(() => {
        window.location.href = link;
      }, 100);
    }
  }

  private setupEVMListeners(provider: any): void {
    provider.on('accountsChanged', (accounts: string[]) => {
      if (accounts.length === 0) {
        this.handleDisconnect('evm');
      } else {
        const session = this.sessions.get('evm');
        if (session) {
          const oldAddress = session.evmAddress?.toLowerCase();
          session.evmAddress = accounts[0];

          // Clear dYdX data on account change
          const newAddress = session.evmAddress.toLowerCase();
          if (oldAddress && oldAddress !== newAddress) {
            delete session.dydxAddress;
            this.inMemoryMnemonics.delete(oldAddress);
          }

          this.sessions.set('evm', session);
          this.saveSession();
          this.emitState('evm', 'connected');
        }
      }
    });

    provider.on('chainChanged', (chainId: string) => {
      const session = this.sessions.get('evm');
      if (session) {
        session.evmChainId = parseInt(chainId, 16);
        this.sessions.set('evm', session);
        this.saveSession();
        this.emitState('evm', 'connected');
      }
    });

    provider.on('disconnect', () => {
      this.handleDisconnect('evm');
    });
  }

  getSession(type: WalletType): WalletSession | null {
    return this.sessions.get(type) || null;
  }

  getProvider(type: WalletType | 'cosmos' | 'evm' | 'stellar'): any {
    return this.providers.get(type);
  }

  isConnected(type: WalletType): boolean {
    return this.sessions.has(type);
  }

  hasDydxWallet(): boolean {
    const session = this.sessions.get('evm') || this.sessions.get('cosmos');
    return !!session?.dydxAddress;
  }

  private isExtensionInstalled(walletId: string): boolean {
    const win = window as any;
    const checks: Record<string, boolean> = {
      metamask: !!win.ethereum?.isMetaMask,
      trust: !!win.ethereum?.isTrust,
      coinbase: !!win.ethereum?.isCoinbaseWallet,
      phantom: !!win.phantom?.ethereum,
      rabby: !!win.ethereum?.isRabby,
      keplr: !!win.keplr,
      leap: !!win.leap,
      freighter: !!win.freighter,
    };
    return checks[walletId] || false;
  }

  getInstalledWallets(): string[] {
    const win = window as any;
    const wallets = [];
    if (win.ethereum?.isMetaMask) wallets.push('metamask');
    if (win.ethereum?.isTrust) wallets.push('trust');
    if (win.ethereum?.isCoinbaseWallet) wallets.push('coinbase');
    if (win.phantom?.ethereum) wallets.push('phantom');
    if (win.ethereum?.isRabby) wallets.push('rabby');
    if (win.keplr) wallets.push('keplr');
    if (win.leap) wallets.push('leap');
    if (win.freighter) wallets.push('freighter');
    return wallets;
  }

  onStateChange(callback: (type: WalletType, state: ConnectionState) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private emitState(type: WalletType, state: ConnectionState): void {
    this.listeners.forEach(cb => {
      try {
        cb(type, state);
      } catch (e) {
        console.error('[WalletService] Event error:', e);
      }
    });
  }
}

export const walletService = new WalletService();
