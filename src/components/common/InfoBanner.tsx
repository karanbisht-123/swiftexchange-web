import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import React from 'react';

type BannerVariant = 'warning' | 'info' | 'success' | 'danger';

interface InfoBannerProps {
  message: string;
  label?: string;
  variant?: BannerVariant;
  className?: string;
  margin?: string;
  padding?: string;
}

const variantStyles: Record<
  BannerVariant,
  { wrapper: string; icon: string; text: string; Icon: React.ElementType }
> = {
  warning: {
    wrapper: 'border-yellow-300 bg-yellow-50',
    icon: 'text-yellow-600 ',
    text: 'text-yellow-800 ',
    Icon: AlertTriangle,
  },
  info: {
    wrapper: 'border-blue-300 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-700/50',
    icon: 'text-blue-600 dark:text-blue-400',
    text: 'text-blue-800 dark:text-blue-300',
    Icon: Info,
  },
  success: {
    wrapper: 'border-green-300 bg-green-50 dark:bg-green-900/20 dark:border-green-700/50',
    icon: 'text-green-600 dark:text-green-400',
    text: 'text-green-800 dark:text-green-300',
    Icon: CheckCircle2,
  },
  danger: {
    wrapper: 'border-red-300 bg-red-50 dark:bg-red-900/20 dark:border-red-700/50',
    icon: 'text-red-600 dark:text-red-400',
    text: 'text-red-800 dark:text-red-300',
    Icon: XCircle,
  },
};

const InfoBanner: React.FC<InfoBannerProps> = ({
  message,
  label,
  variant = 'info',
  className = '',
  margin = 'mx-3 md:mx-6 mt-3 mb-1',
  padding = 'px-3 py-2',
}) => {
  const styles = variantStyles[variant];
  const { Icon } = styles;

  return (
    <div
      className={`shrink-0 flex items-start gap-2 rounded-lg border ${margin} ${padding} ${styles.wrapper} ${className}`}
    >
      <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${styles.icon}`} />
      <p className={`text-sm ${styles.text}`}>
        {label && <span className="font-semibold">{label} </span>}
        {message}
      </p>
    </div>
  );
};

export default InfoBanner;
