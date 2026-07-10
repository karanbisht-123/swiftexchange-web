import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type NotificationType, useNotificationStore } from '../notificationStore';

const ALL_TYPES: NotificationType[] = [
  'EVM_SWAP',
  'SEND',
  'RECEIVE',
  'BRIDGE',
  'STELLAR',
  'DYDX',
  'SYSTEM',
];

const defaultEnabledTypes = ALL_TYPES.reduce(
  (acc, type) => ({ ...acc, [type]: true }),
  {} as Record<NotificationType, boolean>
);

const resetStore = () => {
  useNotificationStore.setState({
    notifications: [],
    activeToasts: [],
    enabledTypes: { ...defaultEnabledTypes },
    isGlobalPanelOpen: false,
    permission: 'default',
  });
};

// Give crypto.randomUUID predictable, incrementing output
let uuidCounter = 0;
const mockUUID = () => `test-uuid-${++uuidCounter}`;

describe('notificationStore', () => {
  beforeEach(() => {
    resetStore();
    uuidCounter = 0;
    vi.spyOn(crypto, 'randomUUID').mockImplementation(mockUUID as any);
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('initial state', () => {
    it('starts with no notifications or toasts', () => {
      const state = useNotificationStore.getState();
      expect(state.notifications).toEqual([]);
      expect(state.activeToasts).toEqual([]);
    });

    it('starts with all notification types enabled', () => {
      const state = useNotificationStore.getState();
      ALL_TYPES.forEach(type => {
        expect(state.enabledTypes[type]).toBe(true);
      });
    });

    it('starts with the global panel closed', () => {
      expect(useNotificationStore.getState().isGlobalPanelOpen).toBe(false);
    });
  });

  describe('addNotification', () => {
    it('adds a notification with generated id, timestamp, and read: false', () => {
      useNotificationStore.getState().addNotification({
        type: 'SEND',
        title: 'Sent',
        message: 'You sent 1 ETH',
      });

      const { notifications } = useNotificationStore.getState();
      expect(notifications).toHaveLength(1);
      expect(notifications[0]).toMatchObject({
        type: 'SEND',
        title: 'Sent',
        message: 'You sent 1 ETH',
        read: false,
        timestamp: 1_000_000,
      });
      expect(notifications[0].id).toBeTruthy();
    });

    it('prepends new notifications (most recent first)', () => {
      const store = useNotificationStore.getState();
      store.addNotification({ type: 'SEND', title: 'First', message: 'a' });
      store.addNotification({ type: 'RECEIVE', title: 'Second', message: 'b' });

      const { notifications } = useNotificationStore.getState();
      expect(notifications[0].title).toBe('Second');
      expect(notifications[1].title).toBe('First');
    });

    it('does not add a notification when its type is disabled', () => {
      useNotificationStore.getState().toggleType('SEND', false);
      useNotificationStore.getState().addNotification({
        type: 'SEND',
        title: 'Sent',
        message: 'You sent 1 ETH',
      });

      expect(useNotificationStore.getState().notifications).toHaveLength(0);
    });

    it('does not persist the notification to state when dontSave is true', () => {
      useNotificationStore.getState().addNotification({
        type: 'SYSTEM',
        title: 'Ephemeral',
        message: 'Not saved',
        dontSave: true,
      });

      expect(useNotificationStore.getState().notifications).toHaveLength(0);
    });
  });

  describe('removeNotification', () => {
    it('removes only the notification with the matching id', () => {
      const store = useNotificationStore.getState();
      store.addNotification({ type: 'SEND', title: 'A', message: 'a' });
      store.addNotification({ type: 'RECEIVE', title: 'B', message: 'b' });

      const [second, first] = useNotificationStore.getState().notifications;
      useNotificationStore.getState().removeNotification(first.id);

      const { notifications } = useNotificationStore.getState();
      expect(notifications).toHaveLength(1);
      expect(notifications[0].id).toBe(second.id);
    });
  });

  describe('clearAll', () => {
    it('empties the notifications list', () => {
      const store = useNotificationStore.getState();
      store.addNotification({ type: 'SEND', title: 'A', message: 'a' });
      store.addNotification({ type: 'RECEIVE', title: 'B', message: 'b' });

      useNotificationStore.getState().clearAll();

      expect(useNotificationStore.getState().notifications).toEqual([]);
    });
  });

  describe('markAsRead', () => {
    it('marks only the matching notification as read', () => {
      const store = useNotificationStore.getState();
      store.addNotification({ type: 'SEND', title: 'A', message: 'a' });
      store.addNotification({ type: 'RECEIVE', title: 'B', message: 'b' });

      const [second, first] = useNotificationStore.getState().notifications;
      useNotificationStore.getState().markAsRead(first.id);

      const { notifications } = useNotificationStore.getState();
      const updatedFirst = notifications.find(n => n.id === first.id);
      const updatedSecond = notifications.find(n => n.id === second.id);

      expect(updatedFirst?.read).toBe(true);
      expect(updatedSecond?.read).toBe(false);
    });
  });

  describe('markAllAsRead', () => {
    it('marks every notification as read', () => {
      const store = useNotificationStore.getState();
      store.addNotification({ type: 'SEND', title: 'A', message: 'a' });
      store.addNotification({ type: 'RECEIVE', title: 'B', message: 'b' });

      useNotificationStore.getState().markAllAsRead();

      const { notifications } = useNotificationStore.getState();
      expect(notifications.every(n => n.read)).toBe(true);
    });
  });

  describe('toggleType', () => {
    it('disables a single notification type without affecting others', () => {
      useNotificationStore.getState().toggleType('BRIDGE', false);

      const { enabledTypes } = useNotificationStore.getState();
      expect(enabledTypes.BRIDGE).toBe(false);
      expect(enabledTypes.SEND).toBe(true);
    });

    it('re-enables a previously disabled type', () => {
      useNotificationStore.getState().toggleType('BRIDGE', false);
      useNotificationStore.getState().toggleType('BRIDGE', true);

      expect(useNotificationStore.getState().enabledTypes.BRIDGE).toBe(true);
    });
  });

  describe('disablePushNotifications', () => {
    it('sets every notification type to false', () => {
      useNotificationStore.getState().disablePushNotifications();

      const { enabledTypes } = useNotificationStore.getState();
      ALL_TYPES.forEach(type => {
        expect(enabledTypes[type]).toBe(false);
      });
    });
  });

  describe('setGlobalPanelOpen', () => {
    it('opens and closes the global panel', () => {
      useNotificationStore.getState().setGlobalPanelOpen(true);
      expect(useNotificationStore.getState().isGlobalPanelOpen).toBe(true);

      useNotificationStore.getState().setGlobalPanelOpen(false);
      expect(useNotificationStore.getState().isGlobalPanelOpen).toBe(false);
    });
  });

  describe('showToast', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    it('adds a toast to activeToasts', () => {
      useNotificationStore.getState().showToast({
        type: 'SEND',
        title: 'Sent',
        message: 'You sent 1 ETH',
      });

      expect(useNotificationStore.getState().activeToasts).toHaveLength(1);
    });

    it('also adds the toast to notifications when dontSave is not set', () => {
      useNotificationStore.getState().showToast({
        type: 'SEND',
        title: 'Sent',
        message: 'You sent 1 ETH',
      });

      expect(useNotificationStore.getState().notifications).toHaveLength(1);
    });

    it('does not add to notifications when dontSave is true', () => {
      useNotificationStore.getState().showToast({
        type: 'SEND',
        title: 'Sent',
        message: 'You sent 1 ETH',
        dontSave: true,
      });

      expect(useNotificationStore.getState().activeToasts).toHaveLength(1);
      expect(useNotificationStore.getState().notifications).toHaveLength(0);
    });

    it('does not show a toast when its type is disabled', () => {
      useNotificationStore.getState().toggleType('SEND', false);
      useNotificationStore.getState().showToast({
        type: 'SEND',
        title: 'Sent',
        message: 'You sent 1 ETH',
      });

      expect(useNotificationStore.getState().activeToasts).toHaveLength(0);
    });

    it('automatically removes the toast after 5 seconds', () => {
      useNotificationStore.getState().showToast({
        type: 'SEND',
        title: 'Sent',
        message: 'You sent 1 ETH',
      });

      expect(useNotificationStore.getState().activeToasts).toHaveLength(1);

      vi.advanceTimersByTime(5000);

      expect(useNotificationStore.getState().activeToasts).toHaveLength(0);
    });

    it('does not remove the toast before the timeout elapses', () => {
      useNotificationStore.getState().showToast({
        type: 'SEND',
        title: 'Sent',
        message: 'You sent 1 ETH',
      });

      vi.advanceTimersByTime(4999);

      expect(useNotificationStore.getState().activeToasts).toHaveLength(1);
    });
  });

  describe('removeToast', () => {
    it('removes only the toast with the matching id', () => {
      vi.useFakeTimers();
      const store = useNotificationStore.getState();
      store.showToast({ type: 'SEND', title: 'A', message: 'a' });
      store.showToast({ type: 'RECEIVE', title: 'B', message: 'b' });

      const [first, second] = useNotificationStore.getState().activeToasts;
      useNotificationStore.getState().removeToast(first.id);

      const { activeToasts } = useNotificationStore.getState();
      expect(activeToasts).toHaveLength(1);
      expect(activeToasts[0].id).toBe(second.id);
    });
  });

  describe('requestPermission', () => {
    it('updates permission state when granted', async () => {
      vi.stubGlobal('Notification', {
        permission: 'default',
        requestPermission: vi.fn().mockResolvedValue('granted'),
      });

      const result = await useNotificationStore.getState().requestPermission();

      expect(result).toBe('granted');
      expect(useNotificationStore.getState().permission).toBe('granted');
    });

    it('updates permission state when denied', async () => {
      vi.stubGlobal('Notification', {
        permission: 'default',
        requestPermission: vi.fn().mockResolvedValue('denied'),
      });

      const result = await useNotificationStore.getState().requestPermission();

      expect(result).toBe('denied');
      expect(useNotificationStore.getState().permission).toBe('denied');
    });

    it('does nothing when the Notification API is unavailable', async () => {
      vi.stubGlobal('Notification', undefined);

      const result = await useNotificationStore.getState().requestPermission();

      expect(result).toBeUndefined();
      expect(useNotificationStore.getState().permission).toBe('default');
    });
  });

  describe('showBrowserNotification', () => {
    it('creates a browser notification when permission is already granted', async () => {
      const notificationConstructor = vi.fn();
      vi.stubGlobal(
        'Notification',
        Object.assign(notificationConstructor, {
          permission: 'granted',
          requestPermission: vi.fn().mockResolvedValue('granted'),
        })
      );
      useNotificationStore.setState({ permission: 'granted' });

      await useNotificationStore.getState().showBrowserNotification('Title', { body: 'Body' });

      expect(notificationConstructor).toHaveBeenCalledWith(
        'Title',
        expect.objectContaining({ body: 'Body' })
      );
    });

    it('requests permission first when not already granted', async () => {
      const notificationConstructor = vi.fn();
      const requestPermission = vi.fn().mockResolvedValue('granted');
      vi.stubGlobal(
        'Notification',
        Object.assign(notificationConstructor, {
          permission: 'granted',
          requestPermission,
        })
      );
      useNotificationStore.setState({ permission: 'default' });

      await useNotificationStore.getState().showBrowserNotification('Title');

      expect(requestPermission).toHaveBeenCalled();
    });

    it('does not create a notification when permission is denied', async () => {
      const notificationConstructor = vi.fn();
      vi.stubGlobal(
        'Notification',
        Object.assign(notificationConstructor, {
          permission: 'denied',
          requestPermission: vi.fn().mockResolvedValue('denied'),
        })
      );
      useNotificationStore.setState({ permission: 'denied' });

      await useNotificationStore.getState().showBrowserNotification('Title');

      expect(notificationConstructor).not.toHaveBeenCalled();
    });

    it('does not throw when the Notification constructor throws', async () => {
      const notificationConstructor = vi.fn(() => {
        throw new Error('blocked');
      });
      vi.stubGlobal(
        'Notification',
        Object.assign(notificationConstructor, {
          permission: 'granted',
          requestPermission: vi.fn().mockResolvedValue('granted'),
        })
      );
      useNotificationStore.setState({ permission: 'granted' });

      await expect(
        useNotificationStore.getState().showBrowserNotification('Title')
      ).resolves.not.toThrow();
    });
  });
});
