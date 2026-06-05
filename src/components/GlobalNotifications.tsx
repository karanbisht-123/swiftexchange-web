import React from 'react';
import { useNotificationStore } from '../store/notificationStore';
import { useTransactionModalStore } from '../store/transactionModalStore';
import { NotificationPanel } from './NotificationPanel';
import { ToastContainer } from './ToastContainer';
import { TransactionMonitor } from '../modules/evm/components/TransactionMonitor';
import { EvmTransactionSuccessModal } from '../modules/evm/components/EvmTransactionSuccessModal';
import StellarTransactionModal from '../modules/steallr/components/modals/StellarTransactionModal';

export const GlobalNotifications: React.FC = () => {
  const { isGlobalPanelOpen, setGlobalPanelOpen } = useNotificationStore();
  const { isOpen, modalParams, closeModal } = useTransactionModalStore();

  return (
    <>
      <TransactionMonitor />
      <ToastContainer />
      <NotificationPanel isOpen={isGlobalPanelOpen} onClose={() => setGlobalPanelOpen(false)} />

      {isOpen && modalParams && (
        modalParams.isStellar ? (
          <StellarTransactionModal
            isOpen={isOpen}
            onClose={closeModal}
            status={modalParams.status}
            type={modalParams.type}
            hash={modalParams.hash}
            error={modalParams.error}
          />
        ) : modalParams.status === 'success' && modalParams.hash ? (
          <EvmTransactionSuccessModal
            txHash={modalParams.hash}
            explorerUrl={modalParams.explorerUrl || ''}
            onDone={closeModal}
            networkName={modalParams.networkName}
            title={`${modalParams.type} Successful!`}
          />
        ) : null
      )}
    </>
  );
};
