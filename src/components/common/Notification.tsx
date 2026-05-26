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
      iconColor: 'text-green-500 dark:text-green-400',
      iconBg: 'bg-green-500/10 border border-green-500/20',
    },
    error: {
      icon: '✕',
      iconColor: 'text-red-500 dark:text-red-400',
      iconBg: 'bg-red-500/10 border border-red-500/20',
    },
    warning: {
      icon: '⚠',
      iconColor: 'text-yellow-500 dark:text-yellow-400',
      iconBg: 'bg-yellow-500/10 border border-yellow-500/20',
    },
    info: {
      icon: 'ℹ',
      iconColor: 'text-blue-500 dark:text-blue-400',
      iconBg: 'bg-blue-500/10 border border-blue-500/20',
    },
  };

  const style = styles[type];

  return (
    <div
      className={`fixed top-4 right-4 z-50 p-4 bg-secondary border border-color rounded-xl text-primary text-sm flex items-start gap-3 shadow-premium max-w-md animate-slideIn ${className}`}
      role="alert"
    >
      <div
        className={`flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold ${style.iconBg} ${style.iconColor}`}
      >
        {style.icon}
      </div>

      <div className="flex-1 min-w-0">
        {title && <div className="font-semibold text-primary mb-1">{title}</div>}
        <div className="break-words text-secondary">{message}</div>
      </div>

      {onClose && (
        <button
          onClick={onClose}
          className="flex-shrink-0 ml-2 text-secondary hover:text-primary transition-colors cursor-pointer"
          aria-label="Close notification"
        >
          ✕
        </button>
      )}
    </div>
  );
};
