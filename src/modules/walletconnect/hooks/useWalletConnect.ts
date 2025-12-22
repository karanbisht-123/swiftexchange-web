import { useCallback, useEffect } from 'react';

import { WalletType } from '../constants/Wallet';
import { walletService } from '../services/walletService';
import { useWalletStore } from '../store/walletConnectStore';

export const useWalletConnect = () => {
  // ==================== STATE SELECTORS ====================
  const connectedWallets = useWalletStore(state => state.connectedWallets);
  const connectionStatus = useWalletStore(state => state.connectionStatus);
  const isModalOpen = useWalletStore(state => state.isModalOpen);
  const network = useWalletStore(state => state.network);

  // ==================== ACTIONS ====================
  const connectWallet = useWalletStore(state => state.connectWallet);
  const disconnect = useWalletStore(state => state.disconnect);
  const restoreSessions = useWalletStore(state => state.restoreSessions);
  const setNetwork = useWalletStore(state => state.setNetwork);
  const openModal = useWalletStore(state => state.openModal);
  const closeModal = useWalletStore(state => state.closeModal);
  const isConnected = useWalletStore(state => state.isConnected);
  const isConnecting = useWalletStore(state => state.isConnecting);

  // ==================== RESTORE SESSIONS ON MOUNT ====================
  useEffect(() => {
    restoreSessions();
  }, [restoreSessions]);

  // ==================== HELPER METHODS ====================

  const getProvider = useCallback(
    (type: WalletType) => {
      if (!connectedWallets[type]) return null;
      return walletService.getProvider(type);
    },
    [connectedWallets]
  );

  const getWalletInfo = useCallback(
    (type: WalletType) => {
      return connectedWallets[type] || null;
    },
    [connectedWallets]
  );

  const getConnectionStatus = useCallback(
    (type: WalletType) => {
      return connectionStatus[type] || { state: 'idle' };
    },
    [connectionStatus]
  );

  const getInstalledWallets = useCallback(() => {
    return walletService.getInstalledWallets();
  }, []);

  const getActiveSessions = useCallback(() => {
    return walletService.getActiveSessions();
  }, []);

  const isAnyWalletConnected = useCallback(() => {
    return Object.keys(connectedWallets).length > 0;
  }, [connectedWallets]);

  // ==================== RETURN API ====================
  return {
    // Connection data
    connectedWallets,
    connectionStatus,
    network,

    // UI state
    isModalOpen,

    // Connection methods
    connectWallet,
    disconnect,
    restoreSessions,

    // Network
    setNetwork,
    getNetwork: () => network,

    // UI controls
    openModal,
    closeModal,

    // Status checks
    isConnected,
    isConnecting,
    isAnyWalletConnected,

    // Helpers
    getProvider,
    getWalletInfo,
    getConnectionStatus,
    getInstalledWallets,
    getActiveSessions,
  };
};

// ==================== TYPE-SPECIFIC HOOKS (OPTIONAL) ====================

/**
 * Hook specifically for EVM wallet management
 */
export const useEVMWallet = () => {
  const hook = useWalletConnect();
  const evmWallet = hook.connectedWallets[WalletType.EVM];
  const evmStatus = hook.connectionStatus[WalletType.EVM];

  return {
    wallet: evmWallet,
    status: evmStatus,
    isConnected: hook.isConnected(WalletType.EVM),
    isConnecting: hook.isConnecting(WalletType.EVM),
    connect: (walletId: string) => hook.connectWallet(WalletType.EVM, walletId),
    disconnect: () => hook.disconnect(WalletType.EVM),
    getProvider: () => hook.getProvider(WalletType.EVM),
  };
};

/**
 * Hook specifically for Cosmos wallet management
 */
export const useCosmosWallet = () => {
  const hook = useWalletConnect();
  const cosmosWallet = hook.connectedWallets[WalletType.COSMOS];
  const cosmosStatus = hook.connectionStatus[WalletType.COSMOS];

  return {
    wallet: cosmosWallet,
    status: cosmosStatus,
    isConnected: hook.isConnected(WalletType.COSMOS),
    isConnecting: hook.isConnecting(WalletType.COSMOS),
    connect: (walletId: string) => hook.connectWallet(WalletType.COSMOS, walletId),
    disconnect: () => hook.disconnect(WalletType.COSMOS),
    getProvider: () => hook.getProvider(WalletType.COSMOS),
  };
};

/**
 * Hook specifically for Stellar wallet management
 */
export const useStellarWallet = () => {
  const hook = useWalletConnect();
  const stellarWallet = hook.connectedWallets[WalletType.STELLAR];
  const stellarStatus = hook.connectionStatus[WalletType.STELLAR];

  return {
    wallet: stellarWallet,
    status: stellarStatus,
    isConnected: hook.isConnected(WalletType.STELLAR),
    isConnecting: hook.isConnecting(WalletType.STELLAR),
    connect: (walletId: string) => hook.connectWallet(WalletType.STELLAR, walletId),
    disconnect: () => hook.disconnect(WalletType.STELLAR),
    getProvider: () => hook.getProvider(WalletType.STELLAR),
  };
};
