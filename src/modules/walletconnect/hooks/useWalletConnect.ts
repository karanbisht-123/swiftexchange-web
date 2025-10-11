import { useCallback } from 'react';

import { WalletType } from '../constants/Wallet';
import { walletService } from '../services/walletService';
import { useWalletStore } from '../store/walletConnectStore';

export const useWalletConnect = () => {
  const connectedWallets = useWalletStore(state => state.connectedWallets);
  const isModalOpen = useWalletStore(state => state.isModalOpen);
  const setConnected = useWalletStore(state => state.setConnected);
  const disconnectType = useWalletStore(state => state.disconnectType);
  const openModal = useWalletStore(state => state.openModal);
  const closeModal = useWalletStore(state => state.closeModal);

  const connectWallet = useCallback(
    async (type: WalletType, id: string) => {
      try {
        let address: string;
        let chainId: string | number;
        let walletId: string;

        if (type === WalletType.EVM) {
          ({ address, chainId, walletId } = await walletService.connectEVM(id));
        } else if (type === WalletType.COSMOS) {
          ({ address, chainId, walletId } = await walletService.connectCosmos(id));
        } else {
          ({ address, walletId } = await walletService.connectStellar(id));
          chainId = 'stellar:pubnet';
        }

        setConnected(type, walletId, address, chainId);
        closeModal();
      } catch (error) {
        console.error('Connection error:', error);
        throw error; // Re-throw to let the component handle it
      }
    },
    [setConnected, closeModal]
  );

  const getProvider = useCallback(
    (type: WalletType) => {
      if (connectedWallets[type]) {
        return walletService.getProvider(type);
      }
      return null;
    },
    [connectedWallets]
  );

  return {
    connectedWallets,
    isModalOpen,
    connectWallet,
    disconnectType,
    openModal,
    closeModal,
    getProvider,
  };
};
