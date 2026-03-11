import React from 'react';
import { useNotificationStore } from '../store/notificationStore';
import { NotificationPanel } from './NotificationPanel';
import { ToastContainer } from './ToastContainer';

export const GlobalNotifications: React.FC = () => {
    const { isGlobalPanelOpen, setGlobalPanelOpen } = useNotificationStore();

    return (
        <>
            <ToastContainer />
            <NotificationPanel
                isOpen={isGlobalPanelOpen}
                onClose={() => setGlobalPanelOpen(false)}
            />
        </>
    );
};
