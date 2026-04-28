import React, { useState, useMemo } from 'react';
import { Wallet } from 'lucide-react';
import { useWalletConnect } from '../../walletconnect/hooks/useWalletConnect';
import { WalletType } from '../../walletconnect/constants/Wallet';
import { ConfirmationModal } from '../../../components/common/ConfirmationModal';

interface ActionGuardProps {
  children: React.ReactElement;
  title?: string;
  message?: string;
  disabled?: boolean;
  requiredWallets?: WalletType[];
}

export const ActionGuard: React.FC<ActionGuardProps> = ({
  children,
  title = 'Connection Required',
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

  const getWalletDisplayName = (type: WalletType) => {
    switch (type) {
      case WalletType.EVM: return 'EVM';
      case WalletType.STELLAR: return 'Stellar';
      case WalletType.COSMOS: return 'Cosmos';
      default: return type;
    }
  };

  const displayMessage = message || (
    missingWallets.length === 1 
      ? `Please connect your ${getWalletDisplayName(missingWallets[0])} wallet to proceed.`
      : `Please connect your ${missingWallets.map(getWalletDisplayName).join(' and ')} wallets to proceed.`
  );

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
            <p className="text-secondary">{displayMessage}</p>
          </div>
        }
      />
    </>
  );
};
