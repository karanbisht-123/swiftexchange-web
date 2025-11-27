import React from 'react';

export type NotificationType = 'success' | 'error' | 'warning' | 'info';

export interface NotificationProps {
  type: NotificationType;
  message: string;
  title?: string;
  onClose?: () => void;
  autoClose?: boolean;
  autoCloseDuration?: number;
}

export const Notification: React.FC<NotificationProps> = ({
  type,
  message,
  title,
  onClose,
  autoClose = true,
  autoCloseDuration = 5000,
}) => {
  React.useEffect(() => {
    if (autoClose && onClose) {
      const timer = setTimeout(() => {
        onClose();
      }, autoCloseDuration);

      return () => clearTimeout(timer);
    }
  }, [autoClose, autoCloseDuration, onClose]);

  const styles = {
    success: {
      bg: 'bg-green-900/50',
      border: 'border-green-500/50',
      text: 'text-green-300',
      icon: '✓',
      iconBg: 'bg-green-500/20',
    },
    error: {
      bg: 'bg-red-900/50',
      border: 'border-red-500/50',
      text: 'text-red-300',
      icon: '✕',
      iconBg: 'bg-red-500/20',
    },
    warning: {
      bg: 'bg-yellow-900/50',
      border: 'border-yellow-500/50',
      text: 'text-yellow-300',
      icon: '⚠',
      iconBg: 'bg-yellow-500/20',
    },
    info: {
      bg: 'bg-blue-900/50',
      border: 'border-blue-500/50',
      text: 'text-blue-300',
      icon: 'ℹ',
      iconBg: 'bg-blue-500/20',
    },
  };

  const style = styles[type];

  return (
    <div
      className={`mx-3 mt-3 p-3 ${style.bg} border ${style.border} rounded-lg ${style.text} text-xs flex items-start gap-3 animate-slideIn`}
    >
      <div
        className={`flex-shrink-0 w-5 h-5 ${style.iconBg} rounded-full flex items-center justify-center font-bold`}
      >
        {style.icon}
      </div>

      <div className="flex-1 min-w-0">
        {title && <div className="font-semibold mb-1">{title}</div>}
        <div className="break-words">{message}</div>
      </div>

      {onClose && (
        <button
          onClick={onClose}
          className={`flex-shrink-0 ml-2 ${style.text} hover:opacity-70 transition-opacity`}
          aria-label="Close notification"
        >
          ✕
        </button>
      )}
    </div>
  );
};
