import { useCallback, useEffect, useMemo } from 'react';

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
  const deriveDydx = useWalletStore(state => state.deriveDydx);
  const checkSessionHealth = useWalletStore(state => state.checkSessionHealth);

  useEffect(() => {
    restoreSessions();
  }, [restoreSessions]);

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
    (walletId: string) => connectWallet('evm', walletId),
    [connectWallet]
  );

  const disconnectWallet = useCallback(() => disconnect('evm'), [disconnect]);

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
    (walletId: string) => connectWallet('cosmos', walletId),
    [connectWallet]
  );

  const disconnectWallet = useCallback(() => disconnect('cosmos'), [disconnect]);

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
    (walletId: string) => connectWallet('stellar', walletId),
    [connectWallet]
  );

  const disconnectWallet = useCallback(() => disconnect('stellar'), [disconnect]);

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
