import React from 'react';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type NotificationType =
  | 'EVM_SWAP'
  | 'SEND'
  | 'RECEIVE'
  | 'BRIDGE'
  | 'STELLAR'
  | 'DYDX'
  | 'SYSTEM';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: React.ReactNode;
  timestamp: number;
  read: boolean;
}

export interface ToastNotification extends AppNotification {}

interface NotificationState {
  notifications: AppNotification[];
  activeToasts: ToastNotification[];
  enabledTypes: Record<NotificationType, boolean>;
  isGlobalPanelOpen: boolean;
  addNotification: (notification: Omit<AppNotification, 'id' | 'timestamp' | 'read'>) => void;
  removeNotification: (id: string) => void;
  clearAll: () => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  toggleType: (type: NotificationType, enabled: boolean) => void;
  setGlobalPanelOpen: (isOpen: boolean) => void;
  disablePushNotifications: () => void;
  removeToast: (id: string) => void;
  showToast: (notification: Omit<AppNotification, 'id' | 'timestamp' | 'read'>) => void;
}

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set, get) => ({
      notifications: [],
      activeToasts: [],
      enabledTypes: {
        EVM_SWAP: true,
        SEND: true,
        RECEIVE: true,
        BRIDGE: true,
        STELLAR: true,
        DYDX: true,
        SYSTEM: true,
      },
      isGlobalPanelOpen: false,

      addNotification: notif => {
        const state = get();
        if (!state.enabledTypes[notif.type]) return;

        const newNotif = {
          ...notif,
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          read: false,
        };

        set(state => ({
          notifications: [newNotif, ...state.notifications],
        }));
      },

      removeNotification: id =>
        set(state => ({
          notifications: state.notifications.filter(n => n.id !== id),
        })),

      clearAll: () => set({ notifications: [] }),

      markAsRead: id =>
        set(state => ({
          notifications: state.notifications.map(n => (n.id === id ? { ...n, read: true } : n)),
        })),

      markAllAsRead: () =>
        set(state => ({
          notifications: state.notifications.map(n => ({ ...n, read: true })),
        })),

      toggleType: (type, enabled) =>
        set(state => ({
          enabledTypes: { ...state.enabledTypes, [type]: enabled },
        })),

      setGlobalPanelOpen: isOpen => set({ isGlobalPanelOpen: isOpen }),

      disablePushNotifications: () =>
        set(state => {
          const disabled: Record<string, boolean> = {};
          Object.keys(state.enabledTypes).forEach(key => {
            disabled[key] = false;
          });
          return { enabledTypes: disabled as Record<NotificationType, boolean> };
        }),

      removeToast: id =>
        set(state => ({
          activeToasts: state.activeToasts.filter(t => t.id !== id),
        })),

      showToast: notif => {
        const state = get();
        if (!state.enabledTypes[notif.type]) return;

        const newNotif = {
          ...notif,
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          read: false,
        };

        set(state => ({
          notifications: [newNotif, ...state.notifications],
          activeToasts: [...state.activeToasts, newNotif],
        }));

        setTimeout(() => {
          get().removeToast(newNotif.id);
        }, 5000);
      },
    }),
    {
      name: 'notification-storage',
      partialize: state => ({
        notifications: state.notifications,
        enabledTypes: state.enabledTypes,
      }),
    }
  )
);
