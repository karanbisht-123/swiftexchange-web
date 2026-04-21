import { Loader2 } from 'lucide-react';
import React from 'react';

interface TransactionButtonProps {
  label: React.ReactNode;
  loadingLabel?: React.ReactNode;
  successLabel?: React.ReactNode;

  isLoading?: boolean;
  isSuccess?: boolean;
  isError?: boolean;
  isDisabled?: boolean;

  onClick: () => void;
  className?: string;
  icon?: React.ReactNode;
}

const TransactionButton: React.FC<TransactionButtonProps> = ({
  label,
  loadingLabel = 'PROCESSING...',
  successLabel = 'COMPLETE!',
  isLoading = false,
  isSuccess = false,
  isError = false,
  isDisabled = false,
  onClick,
  className = '',
  icon,
}) => {
  const baseStyles =
    'w-full py-5 btn font-bold text-xl transition-all shadow-xl active:scale-95 flex items-center justify-center gap-3 rounded-xl min-h-[64px]';

  const stateStyles = isError
    ? 'bg-red-600 text-white hover:bg-red-700'
    : isSuccess
      ? 'btn-success text-white'
      : isDisabled && !isLoading
        ? 'bg-primary text-muted cursor-not-allowed opacity-70'
        : 'btn-primary hover:shadow-brand/20';

  return (
    <button
      onClick={onClick}
      disabled={isDisabled || isLoading || isSuccess}
      className={`${baseStyles} ${stateStyles} ${className}`}
    >
      {isLoading ? (
        <>
          <Loader2 className="w-6 h-6 animate-spin" />
          {loadingLabel}
        </>
      ) : isSuccess ? (
        <>
          {successLabel}
        </>
      ) : (
        <>
          {icon}
          {label}
        </>
      )}
    </button>
  );
};

export default TransactionButton;
