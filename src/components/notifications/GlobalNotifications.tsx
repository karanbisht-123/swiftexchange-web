import React from 'react';

import { EvmTransactionModal } from '@/modules/evm/components/EvmTransactionModal';
import { TransactionMonitor } from '@/modules/evm/components/TransactionMonitor';
import StellarTransactionModal from '@/modules/stellar/components/modals/StellarTransactionModal';
import { useNotificationStore } from '@/store/notificationStore';
import { useTransactionModalStore } from '@/store/transactionModalStore';

import { NotificationPanel } from './NotificationPanel';
import { PendingTransactionBanner } from './PendingTransactionBanner';
import { ToastContainer } from './ToastContainer';

export const GlobalNotifications: React.FC = () => {
  const { isGlobalPanelOpen, setGlobalPanelOpen } = useNotificationStore();
  const { isOpen, modalParams, closeModal } = useTransactionModalStore();

  return (
    <>
      <TransactionMonitor />
      <ToastContainer />
      <PendingTransactionBanner />
      <NotificationPanel isOpen={isGlobalPanelOpen} onClose={() => setGlobalPanelOpen(false)} />

      {isOpen &&
        modalParams &&
        (modalParams.isStellar ? (
          <StellarTransactionModal
            isOpen={isOpen}
            onClose={closeModal}
            status={modalParams.status}
            type={modalParams.type}
            hash={modalParams.hash}
            error={modalParams.error}
          />
        ) : (
          <EvmTransactionModal
            status={modalParams.status}
            type={modalParams.type}
            txHash={modalParams.hash}
            error={modalParams.error}
            explorerUrl={modalParams.explorerUrl || ''}
            networkName={modalParams.networkName}
            onDone={closeModal}
          />
        ))}
    </>
  );
};
