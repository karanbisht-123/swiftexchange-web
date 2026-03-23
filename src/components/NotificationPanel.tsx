import { Search, Settings, X } from 'lucide-react';
import React, { useState } from 'react';

import { type NotificationType, useNotificationStore } from '../store/notificationStore';

interface NotificationPanelProps {
  isOpen: boolean;
  onClose: () => void;
  filterType?: NotificationType;
}

const typeConfig: Record<NotificationType, { icon: React.ReactNode; color: string }> = {
  EVM_SWAP: {
    icon: (
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500/10 text-sm text-blue-500">
        🔄
      </div>
    ),
    color: 'text-blue-500',
  },
  SEND: {
    icon: (
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-500/10 text-sm text-green-500">
        ↗️
      </div>
    ),
    color: 'text-green-500',
  },
  RECEIVE: {
    icon: (
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-500/10 text-sm text-purple-500">
        ↙️
      </div>
    ),
    color: 'text-purple-500',
  },
  BRIDGE: {
    icon: (
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-500/10 text-sm text-indigo-500">
        🌉
      </div>
    ),
    color: 'text-indigo-500',
  },
  STELLAR: {
    icon: (
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-yellow-500/10 text-sm text-yellow-500">
        ⭐
      </div>
    ),
    color: 'text-yellow-500',
  },
  DYDX: {
    icon: (
      <div className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-700 bg-gray-800">
        <svg viewBox="0 0 32 32" className="h-4 w-4 text-white" fill="currentColor">
          <path d="M15.925 23.95L23.85 19.325L15.925 32L8 19.325L15.925 23.95ZM16.075 0L24 18.05L16.075 22.5L8.15 18.05L16.075 0Z" />
        </svg>
      </div>
    ),
    color: 'text-orange-500',
  },
  SYSTEM: {
    icon: (
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-500/10 text-sm text-gray-400">
        ⚙️
      </div>
    ),
    color: 'text-gray-500',
  },
};

export const NotificationPanel: React.FC<NotificationPanelProps> = ({
  isOpen,
  onClose,
  filterType,
}) => {
  const [search, setSearch] = useState('');

  const { notifications, clearAll, markAsRead, disablePushNotifications } = useNotificationStore();

  if (!isOpen) return null;

  const displayNotifications = notifications.filter(n => {
    if (filterType && n.type !== filterType) return false;
    if (
      search &&
      !n.title.toLowerCase().includes(search.toLowerCase()) &&
      typeof n.message === 'string' &&
      !n.message.toLowerCase().includes(search.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  return (
    <div className="fixed right-0 top-0 z-50 flex h-full w-[360px] flex-col border-l border-gray-800 bg-[#12131a] font-sans shadow-2xl">
      <div className="flex flex-col gap-4 border-b border-gray-800 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-[17px] font-medium tracking-wide text-white">Notifications</h2>
          <div className="flex items-center gap-3">
            <button className="text-gray-400 transition-colors hover:text-white">
              <Settings size={18} />
            </button>
            <button onClick={onClose} className="text-gray-400 transition-colors hover:text-white">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="relative">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <Search size={14} className="text-gray-500" />
          </div>
          <input
            type="text"
            placeholder="Search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full rounded-md border border-transparent bg-[#1c1d25] py-2 pl-9 pr-3 text-sm text-white placeholder-gray-500 outline-none transition-colors focus:border-gray-700"
          />
        </div>
      </div>

      <div
        className="flex-1 overflow-y-auto overflow-x-hidden"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        <style dangerouslySetInnerHTML={{ __html: `::-webkit-scrollbar { display: none; }` }} />

        {displayNotifications.length > 0 ? (
          <div className="flex flex-col">
            <div className="px-5 py-3 text-[13px] font-medium text-gray-500">New</div>

            {displayNotifications.map(notif => (
              <div
                key={notif.id}
                onClick={() => markAsRead(notif.id)}
                className={`flex cursor-pointer gap-3 border-b border-gray-800/50 px-5 py-4 transition-colors hover:bg-[#1c1d25]/80 ${notif.read ? 'opacity-50' : ''}`}
              >
                <div className="mt-0.5 shrink-0">{typeConfig[notif.type]?.icon}</div>
                <div className="min-w-0 flex-1 relative group/item">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-sm font-medium text-white pr-6">{notif.title}</span>
                    <div className="flex items-center gap-2">
                      {notif.read ? null : (
                        <span className="flex items-center gap-1.5 text-xs text-gray-400">
                          Filled
                          <div className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="break-words text-[13px] text-gray-400 pr-6">{notif.message}</div>
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      useNotificationStore.getState().removeNotification(notif.id);
                    }}
                    className="absolute top-0 right-0 p-1 opacity-0 transition-opacity hover:text-white group-hover/item:opacity-100 text-gray-500"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-gray-500">
            No notifications matching criteria
          </div>
        )}
      </div>

      <div className="mt-auto flex gap-3 border-t border-gray-800 p-4">
        <button
          onClick={disablePushNotifications}
          className="flex-1 rounded border border-gray-700/50 py-2.5 px-4 text-sm font-medium text-gray-400 transition-colors hover:bg-[#1c1d25] hover:text-white"
        >
          Disable Push Notifications
        </button>
        <button
          onClick={clearAll}
          className="rounded border border-red-900/30 py-2.5 px-6 text-sm font-medium text-red-500 transition-colors hover:bg-red-500/10"
        >
          Clear All
        </button>
      </div>
    </div>
  );
};
