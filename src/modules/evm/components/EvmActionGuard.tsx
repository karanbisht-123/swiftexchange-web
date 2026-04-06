import React, { useState } from 'react';
import { Wallet } from 'lucide-react';
import { useWalletConnect } from '../../walletconnect/hooks/useWalletConnect';
import { WalletType } from '../../walletconnect/constants/Wallet';
import { ConfirmationModal } from '../../../components/common/ConfirmationModal';

interface EvmActionGuardProps {
  children: React.ReactElement;
  title?: string;
  message?: string;
  disabled?: boolean;
}

export const EvmActionGuard: React.FC<EvmActionGuardProps> = ({
  children,
  title = 'Connection Required',
  message = 'Please connect your EVM wallet to proceed with this action.',
  disabled = false,
}) => {
  const { connectedWallets, openModal } = useWalletConnect();
  const [showPrompt, setShowPrompt] = useState(false);

  const isConnected = !!connectedWallets[WalletType.EVM];

  const handleClick = (e: React.MouseEvent) => {
    if (disabled) return;
    
    if (!isConnected) {
      e.preventDefault();
      e.stopPropagation();
      setShowPrompt(true);
    }
  };

  const handleConfirm = () => {
    setShowPrompt(false);
    openModal();
  };

  return (
    <>
      <div onClickCapture={handleClick} className="contents">
        {children}
      </div>

      <ConfirmationModal
        isOpen={showPrompt}
        title={title}
        onConfirm={handleConfirm}
        onCancel={() => setShowPrompt(false)}
        confirmText="Connect Wallet"
        cancelText="Cancel"
        message={
          <div className="flex flex-col items-center text-center py-2">
            <div className="w-16 h-16 rounded-full bg-brand/10 flex items-center justify-center mb-4">
              <Wallet className="w-8 h-8 text-brand" />
            </div>
            <p className="text-secondary">{message}</p>
          </div>
        }
      />
    </>
  );
};
