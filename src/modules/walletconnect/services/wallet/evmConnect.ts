import { WalletConnectModal } from '@walletconnect/modal';

import { sendCustomNotification } from '../../../../service/notificationService';
import { WALLETCONNECT_PROJECT_ID, getEVMChains } from '../../config/chains';
import { WALLET_METADATA_MAP } from '../../constants/Wallet';
import { setupEVMListeners, setupWalletConnectListeners } from './eventListeners';
import {
  getOrCreateProvider,
  isExtensionInstalled,
  resolveEvmProvider,
  wrapProviderRequests,
} from './providerRegistry';
import type { WalletServiceContext, WalletSession } from './types';

const CONNECTION_TIMEOUT_MS = 120_000;

function getSessionMetadata(walletId: string, peerMetadata?: any) {
  const fallback = WALLET_METADATA_MAP[walletId] || WALLET_METADATA_MAP['walletconnect'];
  return {
    peerName: peerMetadata?.name || fallback?.name || walletId,
    peerIcon: peerMetadata?.icons?.[0] || fallback?.icon || '',
    peerRedirect: peerMetadata?.redirect || undefined,
  };
}

// ---------------------------------------------------------------------------
// connectChainWallet — public entry point
// ---------------------------------------------------------------------------

export async function connectChainWallet(
  ctx: WalletServiceContext,
  walletId: string
): Promise<WalletSession> {
  const type = 'evm';
  ctx.emitState(type, 'connecting');

  try {
    let provider: any;
    let evmAddress: string | undefined;
    let evmChainId: number | undefined;
    let peerName: string | undefined;
    let peerIcon: string | undefined;
    let peerRedirect: { native?: string; universal?: string } | undefined;

    const isWalletConnectOrSwiftEx = walletId === 'walletconnect' || walletId === 'swiftex';
    const isExtension = isExtensionInstalled(ctx, walletId);

    // If the extension isn't installed, fall back to WalletConnect QR instead of throwing.
    // The user can scan the QR code with the mobile app of the wallet they clicked.
    if (!isWalletConnectOrSwiftEx && !isExtension) {
      console.info(
        `[WalletService] ${walletId} extension not detected — falling back to WalletConnect QR`
      );
    }

    // Use the extension if it's installed; otherwise fall through to WalletConnect QR.
    if (isExtension) {
      const result = await connectExtension(ctx, walletId);
      provider = result.provider;
      evmAddress = result.evmAddress;
      evmChainId = result.evmChainId;
      const meta = getSessionMetadata(walletId);
      peerName = meta.peerName;
      peerIcon = meta.peerIcon;
      peerRedirect = meta.peerRedirect;
    } else {
      const result = await connectWalletConnectSingle(ctx, walletId);
      provider = result.provider;
      evmAddress = result.evmAddress;
      evmChainId = result.evmChainId;
      peerName = result.peerName;
      peerIcon = result.peerIcon;
      peerRedirect = result.peerRedirect;
    }

    const session: WalletSession = {
      type,
      walletId,
      evmAddress,
      evmChainId,
      connectionMode: isExtension ? undefined : 'separate',
      peerName,
      peerIcon,
      peerRedirect,
    };

    ctx.sessions.set(type, session);
    ctx.providers.set(type, provider);
    ctx.emitState(type, 'connected');
    ctx.saveSession();
    return session;
  } catch (error: any) {
    ctx.emitState(type, 'failed');
    throw error;
  }
}

// ---------------------------------------------------------------------------
// connectExtension — uses resolveEvmProvider
// ---------------------------------------------------------------------------

export async function connectExtension(
  ctx: WalletServiceContext,
  walletId: string
): Promise<{ provider: any; evmAddress?: string; evmChainId?: number }> {
  const evmProvider = await resolveEvmProvider(ctx, walletId);

  if (!evmProvider) {
    throw new Error(
      `Provider for ${walletId} not found. Please ensure the extension is installed and active.`
    );
  }

  wrapProviderRequests(ctx, evmProvider);

  const accounts: string[] = await evmProvider.request({ method: 'eth_requestAccounts' });
  const chainIdHex: string = await evmProvider.request({ method: 'eth_chainId' });
  const evmAddress = accounts[0];
  const evmChainId = parseInt(chainIdHex, 16);
  setupEVMListeners(ctx, evmProvider);

  if (!evmAddress) throw new Error('No accounts returned from extension');
  return { provider: evmProvider, evmAddress, evmChainId };
}

// ---------------------------------------------------------------------------
// connectWalletConnectSingle — WC single-namespace EVM
// ---------------------------------------------------------------------------

export async function connectWalletConnectSingle(
  ctx: WalletServiceContext,
  walletId: string
): Promise<{
  provider: any;
  evmAddress?: string;
  evmChainId?: number;
  peerName?: string;
  peerIcon?: string;
  peerRedirect?: { native?: string; universal?: string };
}> {
  const provider = await getOrCreateProvider(ctx, 'evm');
  const evmChains = getEVMChains(ctx.currentNetwork).map(c => `eip155:${c.chainId}`);

  const modal = new WalletConnectModal({
    projectId: WALLETCONNECT_PROJECT_ID,
    chains: evmChains,
    themeMode: 'dark',
    explorerRecommendedWalletIds: [
      'a4604022bf9199ca6d762c5663d8a6186a9ca4b607b9dcb29bcb81054d6f1091', // SwiftEx Wallet
      '4622a2b2d6af1c9844944291e5e7351a6aa24cd7b23099efac1b2fd875da31a0', // Trust Wallet
      'c57ca95b47569778a828d19178114f4db188b89b763c899ba0be274e97267d96', // MetaMask
      'a797aa35c0fadbfc1a53e7f675162ed5226968b44a19ee3d24385c64d1d3c393', // Phantom
    ],
  });
  ctx.modals.set('evm', modal);

  const namespaces = {
    eip155: {
      methods: [
        'eth_sendTransaction',
        'eth_signTypedData_v4',
        'eth_signTypedData',
        'personal_sign',
      ],
      chains: evmChains,
      events: ['chainChanged', 'accountsChanged'],
    },
  };

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      modal.closeModal();
      reject(new Error('Connection timeout'));
    }, CONNECTION_TIMEOUT_MS);

    let modalOpened = false;
    const unsubscribe = modal.subscribeModal(state => {
      if (state.open) {
        modalOpened = true;
      } else if (modalOpened && !state.open) {
        clearTimeout(timeout);
        unsubscribe();
        provider.abortPairing?.();
        reject(new Error('User closed the modal'));
      }
    });

    provider.on('display_uri', (uri: string) => {
      ctx.openMobileDeepLink(walletId, uri);
      modal.openModal({ uri });
      const token = localStorage.getItem('device_token');
      if (token) {
        sendCustomNotification(token, {
          title: 'Connection Request',
          body: 'Please open your wallet to connect.',
        }).catch(err => {
          console.error(err);
        });
      }
    });

    provider
      .connect({ namespaces: namespaces as any })
      .then((session: any) => {
        clearTimeout(timeout);
        unsubscribe();
        modal.closeModal();

        const namespacesRes = session.namespaces;
        const eip155Acc = namespacesRes?.eip155?.accounts?.[0];

        if (!eip155Acc) {
          reject(new Error('EVM account not returned'));
          return;
        }

        let evmAddress: string | undefined;
        let evmChainId: number | undefined;
        if (eip155Acc) {
          const [, chainIdStr, addr] = eip155Acc.split(':');
          evmAddress = addr;
          evmChainId = parseInt(chainIdStr, 10);
        }
        setupWalletConnectListeners(ctx, provider, 'evm');
        const peerMetadata = session.peer?.metadata;
        const meta = getSessionMetadata(walletId, peerMetadata);
        resolve({
          provider,
          evmAddress,
          evmChainId,
          peerName: meta.peerName,
          peerIcon: meta.peerIcon,
          peerRedirect: meta.peerRedirect,
        });
      })
      .catch((error: any) => {
        clearTimeout(timeout);
        unsubscribe();
        modal.closeModal();
        reject(error);
      });
  });
}
