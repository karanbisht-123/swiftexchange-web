import { CheckCircle2, X, XCircle } from 'lucide-react';
import React from 'react';

import { useNotificationStore } from '@/store/notificationStore';

const typeConfig: Record<string, { icon: React.ReactNode; color: string }> = {
  EVM_SWAP: {
    icon: (
      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-500/10 text-xs text-blue-500">
        🔄
      </div>
    ),
    color: 'text-blue-500',
  },
  SEND: {
    icon: (
      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-green-500/10 text-xs text-green-500">
        ↗️
      </div>
    ),
    color: 'text-green-500',
  },
  RECEIVE: {
    icon: (
      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-purple-500/10 text-xs text-purple-500">
        ↙️
      </div>
    ),
    color: 'text-purple-500',
  },
  BRIDGE: {
    icon: (
      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-500/10 text-xs text-indigo-500">
        🌉
      </div>
    ),
    color: 'text-indigo-500',
  },
  STELLAR: {
    icon: (
      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-yellow-500/10 text-xs text-yellow-500">
        ⭐
      </div>
    ),
    color: 'text-yellow-500',
  },
  DYDX: {
    icon: (
      <div className="flex h-6 w-6 items-center justify-center rounded-full border border-gray-700 bg-gray-800">
        <svg viewBox="0 0 32 32" className="h-3 w-3 text-white" fill="currentColor">
          <path d="M15.925 23.95L23.85 19.325L15.925 32L8 19.325L15.925 23.95ZM16.075 0L24 18.05L16.075 22.5L8.15 18.05L16.075 0Z" />
        </svg>
      </div>
    ),
    color: 'text-orange-500',
  },
  SYSTEM: {
    icon: (
      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-500/10 text-xs text-gray-400">
        ⚙️
      </div>
    ),
    color: 'text-gray-500',
  },
};

export const ToastContainer: React.FC = () => {
  const { activeToasts, removeToast } = useNotificationStore();

  if (activeToasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[60] flex flex-col gap-2 pointer-events-none">
      {activeToasts.map(toast => {
        const isSuccess = toast.status === 'success';
        const isError = toast.status === 'error';

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex w-80 max-w-full items-start gap-3 rounded-lg border bg-[#12131a] p-4 shadow-xl transition-all duration-300 translate-x-0 ${
              isSuccess ? 'border-green-500/30' : isError ? 'border-red-500/30' : 'border-gray-800'
            }`}
          >
            <div className="mt-0.5 shrink-0">
              {isSuccess ? (
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-green-500/10">
                  <CheckCircle2 size={14} className="text-green-500" />
                </div>
              ) : isError ? (
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-red-500/10">
                  <XCircle size={14} className="text-red-500" />
                </div>
              ) : (
                typeConfig[toast.type]?.icon
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between">
                <span
                  className={`text-sm font-medium ${isSuccess ? 'text-green-400' : isError ? 'text-red-400' : 'text-white'}`}
                >
                  {toast.title}
                </span>
                <button
                  onClick={() => removeToast(toast.id)}
                  className="text-gray-500 hover:text-white transition-colors ml-2"
                >
                  <X size={14} />
                </button>
              </div>
              <div className="mt-1 break-words text-xs text-gray-400">{toast.message}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
