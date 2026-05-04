import React from 'react';
import { useNotificationStore } from '../store/notificationStore';
import { NotificationPanel } from './NotificationPanel';
import { ToastContainer } from './ToastContainer';
import { TransactionMonitor } from '../modules/evm/components/TransactionMonitor';

export const GlobalNotifications: React.FC = () => {
  const { isGlobalPanelOpen, setGlobalPanelOpen } = useNotificationStore();

  return (
    <>
      <TransactionMonitor />
      <ToastContainer />
      <NotificationPanel isOpen={isGlobalPanelOpen} onClose={() => setGlobalPanelOpen(false)} />
    </>
  );
};
