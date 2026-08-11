import { useCallback, useEffect, useMemo } from 'react';

import { getCosmosChains, getEVMChains, getStellarConfig } from '../config/chains';
import { WalletType } from '../constants/Wallet';
import { walletService } from '../services/walletService';
import {
  selectConnectedWallet,
  selectConnectionStatus,
  selectIsAnyWalletConnected,
  useWalletStore,
} from '../store/walletConnectStore';

export const useWalletConnect = () => {
  const connectedWallets = useWalletStore(state => state.connectedWallets);
  const connectionStatus = useWalletStore(state => state.connectionStatus);
  const isModalOpen = useWalletStore(state => state.isModalOpen);
  const network = useWalletStore(state => state.network);
  const isRestoringSession = useWalletStore(state => state.isRestoringSession);
  const session = useWalletStore(state => state.session);

  const isAuthenticated = useWalletStore(state => state.isAuthenticated);
  const isAuthenticating = useWalletStore(state => state.isAuthenticating);
  const authError = useWalletStore(state => state.authError);
  const authenticatedChain = useWalletStore(state => state.authenticatedChain);
  const linkedChains = useWalletStore(state => state.linkedChains);
  const tradingAuthEnabled = useWalletStore(state => state.tradingAuthEnabled);
  const setTradingAuthEnabled = useWalletStore(state => state.setTradingAuthEnabled);
  const authenticateEvm = useWalletStore(state => state.authenticateEvm);
  const logoutAuth = useWalletStore(state => state.logoutAuth);

  const connectWallet = useWalletStore(state => state.connectWallet);
  const connectUnified = useWalletStore(state => state.connectUnified);
  const disconnect = useWalletStore(state => state.disconnect);
  const restoreSessions = useWalletStore(state => state.restoreSessions);
  const setNetwork = useWalletStore(state => state.setNetwork);
  const openModal = useWalletStore(state => state.openModal);
  const closeModal = useWalletStore(state => state.closeModal);
  const isConnected = useWalletStore(state => state.isConnected);
  const isConnecting = useWalletStore(state => state.isConnecting);
  const deriveDydx = useWalletStore(state => state.deriveDydx);
  const checkSessionHealth = useWalletStore(state => state.checkSessionHealth);

  useEffect(() => {
    restoreSessions();
  }, []);

  const isAnyWalletConnected = useMemo(
    () => Object.keys(connectedWallets).length > 0,
    [connectedWallets]
  );

  const connectedCount = useMemo(() => Object.keys(connectedWallets).length, [connectedWallets]);

  const activeSessions = useMemo(
    () => Object.keys(connectedWallets) as WalletType[],
    [connectedWallets]
  );

  const getProvider = useCallback(
    (type: WalletType) => {
      if (!connectedWallets[type]) return null;
      return walletService.getProvider(type);
    },
    [connectedWallets]
  );

  const getWalletInfo = useCallback(
    (type: WalletType) => connectedWallets[type] || null,
    [connectedWallets]
  );

  const getConnectionStatus = useCallback(
    (type: WalletType) => connectionStatus[type] || { state: 'idle' as const },
    [connectionStatus]
  );

  const getInstalledWallets = useCallback(() => walletService.getInstalledWallets(), []);

  const disconnectAll = useWalletStore(state => state.disconnectAll);

  return {
    connectedWallets,
    connectionStatus,
    network,
    isRestoringSession,
    session,

    isAuthenticated,
    isAuthenticating,
    authError,
    authenticatedChain,
    linkedChains,
    tradingAuthEnabled,
    setTradingAuthEnabled,
    authenticateEvm,
    logoutAuth,

    isAnyWalletConnected,
    connectedCount,
    activeSessions,

    isModalOpen,
    connectWallet,
    connectUnified,
    disconnect,
    disconnectAll,
    restoreSessions,
    deriveDydx,
    checkSessionHealth,

    setNetwork,

    openModal,
    closeModal,

    isConnected,
    isConnecting,

    getProvider,
    getWalletInfo,
    getConnectionStatus,
    getInstalledWallets,
  };
};

export const useEVMWallet = () => {
  const wallet = useWalletStore(selectConnectedWallet('evm'));
  const status = useWalletStore(selectConnectionStatus('evm'));

  const connectWallet = useWalletStore(state => state.connectWallet);
  const disconnect = useWalletStore(state => state.disconnect);
  const isConnected = useWalletStore(state => state.isConnected);
  const isConnecting = useWalletStore(state => state.isConnecting);
  const deriveDydx = useWalletStore(state => state.deriveDydx);

  const connected = useMemo(() => isConnected('evm'), [isConnected]);
  const connecting = useMemo(() => isConnecting('evm'), [isConnecting]);

  const connect = useCallback(
    async (walletId: string) => {
      await connectWallet('evm', walletId);
    },
    [connectWallet]
  );

  const disconnectWallet = useCallback(async () => {
    try {
      await disconnect('evm');
    } catch (error: any) {
      console.error(error);
    }
  }, [disconnect]);

  const getProvider = useCallback(() => {
    if (!wallet) return null;
    return walletService.getProvider('evm');
  }, [wallet]);

  return {
    wallet,
    dydxAddress: wallet?.dydxAddress,
    status: status || { state: 'idle' as const },
    isConnected: connected,
    isConnecting: connecting,
    connect,
    disconnect: disconnectWallet,
    deriveDydx,
    getProvider,
  };
};

export const useCosmosWallet = () => {
  const wallet = useWalletStore(selectConnectedWallet('cosmos'));
  const status = useWalletStore(selectConnectionStatus('cosmos'));

  const connectWallet = useWalletStore(state => state.connectWallet);
  const disconnect = useWalletStore(state => state.disconnect);
  const isConnected = useWalletStore(state => state.isConnected);
  const isConnecting = useWalletStore(state => state.isConnecting);

  const connected = useMemo(() => isConnected('cosmos'), [isConnected]);
  const connecting = useMemo(() => isConnecting('cosmos'), [isConnecting]);

  const connect = useCallback(
    async (walletId: string) => {
      await connectWallet('cosmos', walletId);
    },
    [connectWallet]
  );

  const disconnectWallet = useCallback(async () => {
    try {
      await disconnect('cosmos');
    } catch (error: any) {
      console.error(error);
    }
  }, [disconnect]);

  const getProvider = useCallback(() => {
    if (!wallet) return null;
    return walletService.getProvider('cosmos');
  }, [wallet]);

  return {
    wallet,
    dydxAddress: wallet?.dydxAddress,
    status: status || { state: 'idle' as const },
    isConnected: connected,
    isConnecting: connecting,
    connect,
    disconnect: disconnectWallet,
    getProvider,
  };
};

export const useStellarWallet = () => {
  const wallet = useWalletStore(selectConnectedWallet('stellar'));
  const status = useWalletStore(selectConnectionStatus('stellar'));

  const connectWallet = useWalletStore(state => state.connectWallet);
  const disconnect = useWalletStore(state => state.disconnect);
  const isConnected = useWalletStore(state => state.isConnected);
  const isConnecting = useWalletStore(state => state.isConnecting);

  const connected = useMemo(() => isConnected('stellar'), [isConnected]);
  const connecting = useMemo(() => isConnecting('stellar'), [isConnecting]);

  const connect = useCallback(
    async (walletId: string) => {
      await connectWallet('stellar', walletId);
    },
    [connectWallet]
  );

  const disconnectWallet = useCallback(async () => {
    try {
      await disconnect('stellar');
    } catch (error: any) {
      console.error(error);
    }
  }, [disconnect]);

  const getProvider = useCallback(() => {
    if (!wallet) return null;
    return walletService.getProvider('stellar');
  }, [wallet]);

  return {
    wallet,
    status: status || { state: 'idle' as const },
    isConnected: connected,
    isConnecting: connecting,
    connect,
    disconnect: disconnectWallet,
    getProvider,
  };
};

export const useIsAnyWalletConnected = () => {
  return useWalletStore(selectIsAnyWalletConnected);
};

export const useInstalledWallets = () => {
  return useMemo(() => walletService.getInstalledWallets(), []);
};

export const useWalletNetwork = () => {
  const network = useWalletStore(state => state.network);
  const setNetwork = useWalletStore(state => state.setNetwork);

  const availableEVMChains = useMemo(() => getEVMChains(network), [network]);
  const availableCosmosChains = useMemo(() => getCosmosChains(network), [network]);
  const currentStellarConfig = useMemo(() => getStellarConfig(network), [network]);

  const switchNetwork = useCallback(
    async (newNetwork: 'mainnet' | 'testnet') => {
      if (network === newNetwork) return;
      await setNetwork(newNetwork);
    },
    [network, setNetwork]
  );

  return {
    network,
    switchNetwork,
    availableEVMChains,
    availableCosmosChains,
    currentStellarConfig,
  };
};

export const useWalletModal = () => {
  const isModalOpen = useWalletStore(state => state.isModalOpen);
  const openModal = useWalletStore(state => state.openModal);
  const closeModal = useWalletStore(state => state.closeModal);

  return {
    isModalOpen,
    openModal,
    closeModal,
  };
};

export const useWalletConnectionStatus = (type: WalletType) => {
  const status = useWalletStore(selectConnectionStatus(type));
  const isConnected = useWalletStore(state => state.isConnected);
  const isConnecting = useWalletStore(state => state.isConnecting);

  return useMemo(
    () => ({
      status: status || { state: 'idle' as const },
      isConnected: isConnected(type),
      isConnecting: isConnecting(type),
    }),
    [status, isConnected, isConnecting, type]
  );
};

export const useApiTradingKeys = () => {
  const keys = useWalletStore(state => state.apiTradingKeys);
  const isGenerating = useWalletStore(state => state.isGeneratingApiKey);
  const revokingKeyId = useWalletStore(state => state.revokingKeyId);
  const error = useWalletStore(state => state.apiKeyError);
  const isModalOpen = useWalletStore(state => state.isApiKeyModalOpen);
  const restrictWithdrawalToWebsite = useWalletStore(state => state.restrictWithdrawalToWebsite);

  const _generate = useWalletStore(state => state.generateApiTradingKey);
  const _revoke = useWalletStore(state => state.revokeApiTradingKey);
  const _load = useWalletStore(state => state.loadApiTradingKeys);
  const _open = useWalletStore(state => state.openApiKeyModal);
  const _close = useWalletStore(state => state.closeApiKeyModal);
  const _setRestrict = useWalletStore(state => state.setRestrictWithdrawalToWebsite);

  const generate = useCallback(
    async (label?: string) => {
      try {
        await _generate(label);
      } catch (err) {
        console.log(err, '[usewalletconnect] => key generation error');
      }
    },
    [_generate]
  );

  const revoke = useCallback(
    async (id: string) => {
      try {
        await _revoke(id);
      } catch (err) {
        console.log(err, '[usewalletconnect] => revoke id error');
      }
    },
    [_revoke]
  );

  const openModal = useCallback(() => {
    _load();
    _open();
  }, [_load, _open]);

  const closeModal = useCallback(() => _close(), [_close]);

  const setRestrictWithdrawalToWebsite = useCallback(
    (v: boolean) => _setRestrict(v),
    [_setRestrict]
  );

  return {
    keys,
    generate,
    revoke,
    isGenerating,
    revokingKeyId,
    error,
    isModalOpen,
    openModal,
    closeModal,
    restrictWithdrawalToWebsite,
    setRestrictWithdrawalToWebsite,
  };
};
