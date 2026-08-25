import { ShieldCheck, Wallet } from 'lucide-react';
import React, { useMemo, useState } from 'react';

import { ConfirmationModal } from '../../../components/common/ConfirmationModal';
import { WalletType } from '../../walletconnect/constants/Wallet';
import { useWalletConnect } from '../../walletconnect/hooks/useWalletConnect';

interface ActionGuardProps {
  children: React.ReactElement;
  title?: string;
  message?: string;
  disabled?: boolean;
  requiredWallets?: WalletType[];
}

const WALLET_NAMES: Record<WalletType, string> = {
  [WalletType.EVM]: 'EVM',
  [WalletType.STELLAR]: 'Stellar',
};

export const ActionGuard: React.FC<ActionGuardProps> = ({
  children,
  title = 'Wallet Connection Required',
  message,
  disabled = false,
  requiredWallets = [WalletType.EVM],
}) => {
  const { connectedWallets, openModal } = useWalletConnect();
  const [showPrompt, setShowPrompt] = useState(false);

  const missingWallets = useMemo(() => {
    return requiredWallets.filter(type => !connectedWallets[type]);
  }, [requiredWallets, connectedWallets]);

  const isConnected = missingWallets.length === 0;

  const handleClick = (e: React.MouseEvent) => {
    if (disabled || isConnected) return;

    e.preventDefault();
    e.stopPropagation();
    setShowPrompt(true);
  };

  const handleConfirm = () => {
    setShowPrompt(false);
    openModal();
  };

  const confirmButtonText = useMemo(() => {
    if (missingWallets.length === 1) {
      return `Connect ${WALLET_NAMES[missingWallets[0]] || missingWallets[0]} Wallet`;
    }
    return 'Connect Wallets';
  }, [missingWallets]);

  const displayMessage = useMemo(() => {
    if (message) return message;
    if (missingWallets.length === 0) return '';

    const names = missingWallets.map(w => WALLET_NAMES[w] || w);
    if (names.length === 1) {
      return `Please connect your ${names[0]} wallet to proceed with this transaction.`;
    }
    return `Please connect both your ${names.join(' and ')} wallets to execute this cross-chain transaction.`;
  }, [message, missingWallets]);

  return (
    <>
      <div
        onClickCapture={handleClick}
        className={`contents ${!isConnected && !disabled ? 'cursor-pointer' : ''}`}
      >
        {children}
      </div>

      <ConfirmationModal
        isOpen={showPrompt}
        title={title}
        onConfirm={handleConfirm}
        onCancel={() => setShowPrompt(false)}
        confirmText={confirmButtonText}
        cancelText="Maybe Later"
        message={
          <div className="flex flex-col items-center text-center py-4">
            <div className="relative mb-6">
              <div className="w-20 h-20 rounded-3xl bg-brand/10 flex items-center justify-center rotate-3 group-hover:rotate-6 transition-transform">
                <Wallet className="w-10 h-10 text-brand" />
              </div>
              <div className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full bg-secondary border-4 border-bg-primary flex items-center justify-center shadow-lg">
                <ShieldCheck className="w-4 h-4 text-brand" />
              </div>
            </div>
            <h4 className="text-primary font-bold mb-2 tracking-tight">Almost there!</h4>
            <p className="text-secondary text-sm leading-relaxed max-w-[280px]">{displayMessage}</p>
          </div>
        }
      />
    </>
  );
};
