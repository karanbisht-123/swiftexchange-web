import { useCallback, useEffect, useMemo, useRef } from 'react';

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

  const connectWallet = useWalletStore(state => state.connectWallet);
  const disconnect = useWalletStore(state => state.disconnect);
  const restoreSessions = useWalletStore(state => state.restoreSessions);
  const setNetwork = useWalletStore(state => state.setNetwork);
  const openModal = useWalletStore(state => state.openModal);
  const closeModal = useWalletStore(state => state.closeModal);
  const isConnected = useWalletStore(state => state.isConnected);
  const isConnecting = useWalletStore(state => state.isConnecting);

  const restorationAttempted = useRef(false);

  useEffect(() => {
    if (!restorationAttempted.current) {
      restorationAttempted.current = true;

      const timeoutId = setTimeout(() => {
        if (isRestoringSession) {
          console.warn('Session restoration timed out, resetting flag');
          useWalletStore.setState({ isRestoringSession: false });
        }
      }, 5000);

      restoreSessions().finally(() => {
        clearTimeout(timeoutId);
      });
    }
  }, [restoreSessions, isRestoringSession]);

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

  const disconnectAll = useCallback(async () => {
    const types = Object.keys(connectedWallets) as WalletType[];
    await Promise.all(types.map(type => disconnect(type)));
  }, [connectedWallets, disconnect]);

  return {
    connectedWallets,
    connectionStatus,
    network,
    isRestoringSession,

    isAnyWalletConnected,
    connectedCount,
    activeSessions,

    isModalOpen,
    connectWallet,
    disconnect,
    disconnectAll,
    restoreSessions,

    setNetwork,
    getNetwork: useCallback(() => network, [network]),

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

// ==================== TYPE-SPECIFIC OPTIMIZED HOOKS ====================

// Optimized hook for EVM wallet management
export const useEVMWallet = () => {
  // Use specific selectors to prevent unnecessary rerenders
  const wallet = useWalletStore(selectConnectedWallet(WalletType.EVM));
  const status = useWalletStore(selectConnectionStatus(WalletType.EVM));

  const connectWallet = useWalletStore(state => state.connectWallet);
  const disconnect = useWalletStore(state => state.disconnect);
  const isConnected = useWalletStore(state => state.isConnected);
  const isConnecting = useWalletStore(state => state.isConnecting);

  // Memoized status checks
  const connected = useMemo(() => isConnected(WalletType.EVM), [isConnected]);

  const connecting = useMemo(() => isConnecting(WalletType.EVM), [isConnecting]);

  // Stable callbacks
  const connect = useCallback(
    (walletId: string) => connectWallet(WalletType.EVM, walletId),
    [connectWallet]
  );

  const disconnectWallet = useCallback(() => disconnect(WalletType.EVM), [disconnect]);

  const getProvider = useCallback(() => {
    if (!wallet) return null;
    return walletService.getProvider(WalletType.EVM);
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

//  Optimized hook for Cosmos wallet management

export const useCosmosWallet = () => {
  const wallet = useWalletStore(selectConnectedWallet(WalletType.COSMOS));
  const status = useWalletStore(selectConnectionStatus(WalletType.COSMOS));

  const connectWallet = useWalletStore(state => state.connectWallet);
  const disconnect = useWalletStore(state => state.disconnect);
  const isConnected = useWalletStore(state => state.isConnected);
  const isConnecting = useWalletStore(state => state.isConnecting);

  const connected = useMemo(() => isConnected(WalletType.COSMOS), [isConnected]);

  const connecting = useMemo(() => isConnecting(WalletType.COSMOS), [isConnecting]);

  const connect = useCallback(
    (walletId: string) => connectWallet(WalletType.COSMOS, walletId),
    [connectWallet]
  );

  const disconnectWallet = useCallback(() => disconnect(WalletType.COSMOS), [disconnect]);

  const getProvider = useCallback(() => {
    if (!wallet) return null;
    return walletService.getProvider(WalletType.COSMOS);
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

//  Optimized hook for Stellar wallet management

export const useStellarWallet = () => {
  const wallet = useWalletStore(selectConnectedWallet(WalletType.STELLAR));
  const status = useWalletStore(selectConnectionStatus(WalletType.STELLAR));

  const connectWallet = useWalletStore(state => state.connectWallet);
  const disconnect = useWalletStore(state => state.disconnect);
  const isConnected = useWalletStore(state => state.isConnected);
  const isConnecting = useWalletStore(state => state.isConnecting);

  const connected = useMemo(() => isConnected(WalletType.STELLAR), [isConnected]);

  const connecting = useMemo(() => isConnecting(WalletType.STELLAR), [isConnecting]);

  const connect = useCallback(
    (walletId: string) => connectWallet(WalletType.STELLAR, walletId),
    [connectWallet]
  );

  const disconnectWallet = useCallback(() => disconnect(WalletType.STELLAR), [disconnect]);

  const getProvider = useCallback(() => {
    if (!wallet) return null;
    return walletService.getProvider(WalletType.STELLAR);
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

// ==================== UTILITY HOOKS ====================

//  Hook for checking if any wallet is connected (lightweight)
export const useIsAnyWalletConnected = () => {
  return useWalletStore(selectIsAnyWalletConnected);
};

//  Hook for getting all installed wallets

export const useInstalledWallets = () => {
  return useMemo(() => walletService.getInstalledWallets(), []);
};

//  Hook for network management
export const useWalletNetwork = () => {
  const network = useWalletStore(state => state.network);
  const setNetwork = useWalletStore(state => state.setNetwork);
  const availableEVMChains = useWalletStore(state => state.availableEVMChains);
  const availableCosmosChains = useWalletStore(state => state.availableCosmosChains);
  const currentStellarConfig = useWalletStore(state => state.currentStellarConfig);

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

//Hook for modal control
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

//Hook for connection status of specific wallet type
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
