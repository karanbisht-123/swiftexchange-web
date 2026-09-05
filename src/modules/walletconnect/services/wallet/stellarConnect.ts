import { WalletConnectModal } from '@walletconnect/modal';

import { sendCustomNotification } from '../../../../service/notificationService';
import { isMobileDevice } from '../../../../utils/walletConnectUtils';
import { WALLETCONNECT_PROJECT_ID, getStellarConfig } from '../../config/chains';
import { WALLET_METADATA_MAP } from '../../constants/Wallet';
import { setupWalletConnectListeners } from './eventListeners';
import { getOrCreateProvider } from './providerRegistry';
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

export async function connectStellar(
  ctx: WalletServiceContext,
  walletId: string
): Promise<WalletSession> {
  ctx.emitState('stellar', 'connecting');

  try {
    if (walletId !== 'walletconnect' && walletId !== 'swiftex') {
      const win = window as any;

      const stellarProviderMap: Record<string, any> = {
        freighter: win.freighterApi ?? win.freighter,
        lobstr: win.lobstr,
      };

      const provider = stellarProviderMap[walletId];
      const isValid =
        provider &&
        (typeof provider.getPublicKey === 'function' ||
          typeof provider.signTransaction === 'function');

      if (isValid) {
        return connectStellarExtension(ctx, walletId, provider);
      }

      // Extension not installed — fall back to WalletConnect QR so the user
      // can connect via the mobile app of the wallet they clicked.
      console.info(
        `[WalletService] ${walletId} extension not detected — falling back to WalletConnect QR`
      );
    }

    return connectStellarWalletConnectSingle(ctx, walletId);
  } catch (error) {
    ctx.emitState('stellar', 'failed');
    throw error;
  }
}

export async function connectStellarExtension(
  ctx: WalletServiceContext,
  walletId: string,
  extensionProvider: any
): Promise<WalletSession> {
  if (typeof extensionProvider.isConnected === 'function') {
    const isConnected = await extensionProvider.isConnected();
    if (!isConnected && typeof extensionProvider.connect === 'function') {
      await extensionProvider.connect();
    }
  } else if (typeof extensionProvider.connect === 'function') {
    await extensionProvider.connect();
  } else if (typeof extensionProvider.requestAccess === 'function') {
    await extensionProvider.requestAccess();
  }

  const publicKey: string = await extensionProvider.getPublicKey();
  const config = getStellarConfig(ctx.currentNetwork);
  const meta = getSessionMetadata(walletId);

  const session: WalletSession = {
    type: 'stellar',
    walletId: walletId,
    stellarAddress: publicKey,
    stellarChainId: config.chainId,
    peerName: meta.peerName,
    peerIcon: meta.peerIcon,
    peerRedirect: meta.peerRedirect,
  };

  ctx.sessions.set('stellar', session);
  ctx.providers.set('stellar', extensionProvider);
  ctx.emitState('stellar', 'connected');
  ctx.saveSession();
  return session;
}

export async function connectStellarWalletConnectSingle(
  ctx: WalletServiceContext,
  walletId: string
): Promise<WalletSession> {
  const provider = await getOrCreateProvider(ctx, 'stellar');
  const config = getStellarConfig(ctx.currentNetwork);
  const stellarChain = `stellar:${config.chainId}`;

  const namespaces = {
    stellar: {
      methods: ['stellar_signXDR', 'stellar_signAndSubmitXDR'],
      chains: [stellarChain],
      events: ['accountsChanged'],
    },
  };

  const modal = new WalletConnectModal({
    projectId: WALLETCONNECT_PROJECT_ID,
    chains: [stellarChain],
    themeMode: 'dark',
    explorerRecommendedWalletIds: [
      'a4604022bf9199ca6d762c5663d8a6186a9ca4b607b9dcb29bcb81054d6f1091', // SwiftEx Wallet
      '76a3d548a08cf402f5c7d021f24fd2881d767084b387a5325df88bc3d4b6f21b', // Lobstr
      '997a355c8f682468706a76cff1b004a7115f505fb962dac54b6e9b442dd1c380', // Freighter
      'aee5083aac025c4c3f1c9afc31ea89dbddca0b1c248195bef469fc4886ae3ab2', //HOt Walet
    ],
  });
  ctx.modals.set('stellar', modal);

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
      if (!isMobileDevice() || walletId === 'walletconnect') {
        modal.openModal({ uri });
      }
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
      .connect({ namespaces })
      .then((session: any) => {
        clearTimeout(timeout);
        unsubscribe();
        modal.closeModal();

        const account: string | undefined = session.namespaces?.stellar?.accounts?.[0];
        if (!account) {
          reject(new Error('No Stellar account returned'));
          return;
        }

        const [, chainId, address] = account.split(':');
        const peerMetadata = session.peer?.metadata;
        const meta = getSessionMetadata(walletId, peerMetadata);

        const stellarSession: WalletSession = {
          type: 'stellar',
          walletId,
          stellarAddress: address,
          stellarChainId: chainId,
          connectionMode: 'separate',
          peerName: meta.peerName,
          peerIcon: meta.peerIcon,
          peerRedirect: meta.peerRedirect,
        };

        ctx.sessions.set('stellar', stellarSession);
        ctx.providers.set('stellar', provider);
        ctx.emitState('stellar', 'connected');
        ctx.saveSession();

        setupWalletConnectListeners(ctx, provider, 'stellar');
        resolve(stellarSession);
      })
      .catch((error: any) => {
        clearTimeout(timeout);
        unsubscribe();
        modal.closeModal();
        reject(error);
      });
  });
}
