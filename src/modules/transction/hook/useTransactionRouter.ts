import { useCallback, useEffect } from 'react';

import { WalletType } from '../../walletconnect/constants/Wallet';
import { useWalletConnect } from '../../walletconnect/hooks/useWalletConnect';
import {
  type TransactionRequest,
  type TransactionResponse,
  transactionRouter,
} from '../router/transactionRouter';

export const useTransactionRouter = () => {
  const { connectedWallets, getProvider } = useWalletConnect();
  useEffect(() => {
    console.group('[useTransactionRouter Syncing wallet sessions');
    console.log('Connected wallets:', {
      evm: !!connectedWallets[WalletType.EVM],
      stellar: !!connectedWallets[WalletType.STELLAR],
      cosmos: !!connectedWallets[WalletType.COSMOS],
    });

    const walletTypes = [WalletType.EVM, WalletType.STELLAR, WalletType.COSMOS];

    walletTypes.forEach(walletType => {
      const wallet = connectedWallets[walletType];

      if (wallet) {
        console.log(`[${walletType}] Wallet connected:`, {
          address: wallet.address,
          chainId: wallet.chainId,
          walletId: wallet.walletId,
        });

        const provider = getProvider(walletType);

        if (provider && wallet.chainId) {
          console.log(`${walletType}] Provider found, registering session...`);
          console.log(`Provider details:`, {
            hasProvider: !!provider,
            hasRequest: typeof provider.request === 'function',
            providerKeys: provider ? Object.keys(provider).slice(0, 10) : [],
          });

          transactionRouter.registerSession(
            walletType,
            provider,
            wallet.address,
            wallet.chainId,
            wallet.walletId
          );
        } else {
          console.warn(`[${walletType}] Wallet connected but provider or chainId not available`);
        }
      } else {
        const hadSession = transactionRouter.hasActiveSession(walletType);
        if (hadSession) {
          console.log(`[${walletType}] Wallet disconnected, unregistering session`);
          transactionRouter.unregisterSession(walletType);
        }
      }
    });

    console.groupEnd();
  }, [connectedWallets, getProvider]);

  const sendTransaction = useCallback(
    async (request: TransactionRequest): Promise<TransactionResponse> => {
      console.group('[useTransactionRouter] sendTransaction');
      console.log('Transaction request:', {
        type: request.type,
        network: request.network,
        networkKey: request.networkKey,
        from: request.from,
        to: request.to,
        amount: request.amount,
        hasData: !!request.data,
        memo: request.memo,
      });
      const walletType =
        request.type === 'evm'
          ? WalletType.EVM
          : request.type === 'stellar'
            ? WalletType.STELLAR
            : WalletType.COSMOS;

      const canHandle = transactionRouter.hasActiveSession(walletType);
      console.log(`Can handle ${request.type} transaction:`, canHandle ? 'Yes' : ' No');

      if (!canHandle) {
        const connectedWallet = connectedWallets[walletType];
        console.error('Transaction cannot be handled:', {
          requestedType: request.type,
          walletType,
          hasWalletInContext: !!connectedWallet,
          walletAddress: connectedWallet?.address || 'none',
          hasSession: canHandle,
        });
      }

      try {
        console.log('[useTransactionRouter] Routing transaction through transaction router...');
        const response = await transactionRouter.routeTransaction(request);

        console.log('[useTransactionRouter] Transaction successful!', {
          hash: response.hash,
          status: response.status,
        });
        console.groupEnd();

        return response;
      } catch (error: any) {
        console.error('[useTransactionRouter] sendTransaction caught error:', {
          message: error.message,
          code: error.code,
          name: error.name,
          errorObject: error, // Log full object for inspection
          stack: error.stack?.slice(0, 300),
        });
        console.groupEnd();
        throw error;
      }
    },
    [connectedWallets]
  );

  const canHandleTransaction = useCallback(
    (type: 'evm' | 'stellar' | 'cosmos'): boolean => {
      const walletType =
        type === 'evm'
          ? WalletType.EVM
          : type === 'stellar'
            ? WalletType.STELLAR
            : WalletType.COSMOS;

      const canHandle = transactionRouter.hasActiveSession(walletType);

      console.log(`[useTransactionRouter] canHandleTransaction(${type}):`, {
        type,
        walletType,
        canHandle,
        hasWallet: !!connectedWallets[walletType],
      });

      return canHandle;
    },
    [connectedWallets]
  );

  const getSessionInfo = useCallback((walletType: WalletType) => {
    const session = transactionRouter.getSession(walletType);
    console.log(`[useTransactionRouter] getSessionInfo(${walletType}):`, session);
    return session;
  }, []);

  const getAllSessions = useCallback(() => {
    const sessions = transactionRouter.getAllSessions();
    console.log('[useTransactionRouter] getAllSessions:', {
      count: sessions.size,
      types: Array.from(sessions.keys()),
    });
    return sessions;
  }, []);

  return {
    sendTransaction,
    canHandleTransaction,
    getSessionInfo,
    getAllSessions,
    activeTransactionsCount: 0,
  };
};
