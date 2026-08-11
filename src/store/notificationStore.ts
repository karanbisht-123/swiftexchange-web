import type React from 'react';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type NotificationType =
  'EVM_SWAP' | 'SEND' | 'RECEIVE' | 'BRIDGE' | 'STELLAR' | 'DYDX' | 'SYSTEM';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: React.ReactNode;
  timestamp: number;
  read: boolean;
  dontSave?: boolean;
  status?: 'success' | 'error' | 'warning' | 'info';
}

export type ToastNotification = AppNotification;

interface NotificationState {
  notifications: AppNotification[];
  activeToasts: ToastNotification[];
  enabledTypes: Record<NotificationType, boolean>;
  isGlobalPanelOpen: boolean;
  permission: NotificationPermission | 'default';
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
  requestPermission: () => Promise<NotificationPermission | undefined>;
  showBrowserNotification: (title: string, options?: NotificationOptions) => Promise<void>;
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
      permission:
        typeof window !== 'undefined' && 'Notification' in window
          ? Notification.permission
          : 'default',

      requestPermission: async () => {
        if (typeof window === 'undefined' || !('Notification' in window)) {
          return;
        }
        try {
          const result = await Notification.requestPermission();
          set({ permission: result });
          return result;
        } catch (err) {
          console.error(err);
        }
      },

      showBrowserNotification: async (title, options = {}) => {
        if (typeof window === 'undefined' || !('Notification' in window)) return;

        let currentPerm = get().permission;

        if (currentPerm === 'default') {
          const requested = await get().requestPermission();
          if (requested) currentPerm = requested;
        }

        if (Notification.permission === 'granted') {
          try {
            new Notification(title, {
              body: options.body,
              icon: options.icon || '/favicon.ico',
              tag: options.tag || '',
              ...options,
            });
          } catch (err) {
            console.error(err);
          }
        }
      },

      addNotification: notif => {
        const state = get();
        if (!state.enabledTypes[notif.type]) return;

        const newNotif = {
          ...notif,
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          read: false,
        };

        if (!notif.dontSave) {
          set(state => ({
            notifications: [newNotif, ...state.notifications],
          }));

          const bodyText =
            typeof notif.message === 'string'
              ? notif.message
              : 'Update regarding your wallet transfer/swap status.';

          get()
            .showBrowserNotification(notif.title, {
              body: bodyText,
              icon: '/favicon.ico',
              tag: notif.type,
            })
            .catch(() => {});
        }
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

        set(state => {
          const updates: Partial<NotificationState> = {
            activeToasts: [...state.activeToasts, newNotif],
          };
          if (!notif.dontSave) {
            updates.notifications = [newNotif, ...state.notifications];
          }
          return updates;
        });

        if (!notif.dontSave) {
          const bodyText =
            typeof notif.message === 'string'
              ? notif.message
              : 'Update regarding your wallet transfer/swap status.';

          get()
            .showBrowserNotification(notif.title, {
              body: bodyText,
              icon: '/favicon.ico',
              tag: notif.type,
            })
            .catch(() => {});
        }

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
