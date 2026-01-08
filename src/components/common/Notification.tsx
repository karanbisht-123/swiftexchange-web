import React, { useEffect } from 'react';

export type NotificationType = 'success' | 'error' | 'warning' | 'info';

export interface NotificationProps {
  type: NotificationType;
  message: string;
  title?: string;
  onClose?: () => void;
  autoClose?: boolean;
  autoCloseDuration?: number;
  className?: string;
}

export const Notification: React.FC<NotificationProps> = ({
  type,
  message,
  title,
  onClose,
  autoClose = true,
  autoCloseDuration = 5000,
  className = '',
}) => {
  useEffect(() => {
    if (autoClose && onClose) {
      const timer = setTimeout(() => {
        onClose();
      }, autoCloseDuration);

      return () => clearTimeout(timer);
    }
  }, [autoClose, autoCloseDuration, onClose]);

  const styles = {
    success: {
      icon: '✓',
      iconColor: 'text-green-400',
    },
    error: {
      icon: '✕',
      iconColor: 'text-red-400',
    },
    warning: {
      icon: '⚠',
      iconColor: 'text-yellow-400',
    },
    info: {
      icon: 'ℹ',
      iconColor: 'text-blue-400',
    },
  };

  const style = styles[type];

  return (
    <div
      className={`fixed top-4 right-4 z-50 p-4 bg-gray-800 rounded-lg text-white text-sm flex items-start gap-3 shadow-xl max-w-md animate-slideIn ${className}`}
      role="alert"
    >
      <div
        className={`flex-shrink-0 w-6 h-6 flex items-center justify-center font-bold text-lg ${style.iconColor}`}
      >
        {style.icon}
      </div>

      <div className="flex-1 min-w-0">
        {title && <div className="font-semibold mb-1">{title}</div>}
        <div className="break-words opacity-90">{message}</div>
      </div>

      {onClose && (
        <button
          onClick={onClose}
          className="flex-shrink-0 ml-2 text-white hover:opacity-70 transition-opacity"
          aria-label="Close notification"
        >
          ✕
        </button>
      )}
    </div>
  );
};
