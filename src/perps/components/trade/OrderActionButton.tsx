import React from 'react';
import { useWalletStore } from '../../../modules/walletconnect/store/walletConnectStore';

import { useAsterAgent } from '../../adapters/aster/hooks/useAsterAgent';

interface OrderActionButtonProps {
  onSubmit: (side: 'BUY' | 'SELL') => void;
  isLoading?: boolean;
  validationError?: string;
  onOpenDepositModal: () => void;
  walletBalance: number;
  actionSubtext?: string;
}

export const OrderActionButton: React.FC<OrderActionButtonProps> = ({ onSubmit, isLoading, validationError, onOpenDepositModal, walletBalance, actionSubtext }) => {
  const isWalletConnected = useWalletStore((state) => Object.keys(state.connectedWallets).length > 0);
  const openWalletModal = useWalletStore((state) => state.openModal);

  const { isReady: isAsterReady, deriveAgentKey, deriveState } = useAsterAgent();
  const hasFunds = walletBalance > 0;

  // State 1: Wallet not connected
  if (!isWalletConnected) {
    return (
      <button
        type="button"
        onClick={openWalletModal}
        className="w-full bg-[#f0e6d2] hover:bg-[#e3d8c3] text-black rounded-md py-3 font-semibold text-[13px] transition-colors mt-4"
      >
        Connect Wallet
      </button>
    );
  }

  // State 2: Wallet connected, but Exchange Agent not ready
  if (!isAsterReady) {
    return (
      <button
        type="button"
        onClick={() => deriveAgentKey()}
        disabled={deriveState === 'signing'}
        className="w-full bg-brand/10 text-brand border border-brand/30 hover:bg-brand/20 rounded-md py-3 font-semibold text-[13px] transition-colors mt-4 disabled:opacity-50"
      >
        {deriveState === 'signing' ? 'Please Sign in Wallet...' : 'Enable Trading'}
      </button>
    );
  }

  // State 3: Agent ready, but no funds
  if (!hasFunds) {
    return (
      <button
        type="button"
        onClick={() => {
          console.log('Open Deposit Flow');
          onOpenDepositModal();
        }}
        className="w-full bg-[#f0e6d2] hover:bg-[#e3d8c3] text-black rounded-md py-3 font-semibold text-[13px] transition-colors mt-4"
      >
        Deposit
      </button>
    );
  }

  // State 4: Validation Failed (disabled buttons but still show them)
  const isInvalid = !!validationError;

  // State 5: Ready to trade - Render both Buy and Sell side by side
  return (
    <div className="flex gap-2 mt-4">
      <button
        type="button"
        onClick={() => !isInvalid && onSubmit('BUY')}
        disabled={isLoading || isInvalid}
        className="flex-1 flex flex-col items-center justify-center rounded-md py-2 font-semibold text-[13px] bg-success text-white hover:bg-success/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span>Buy / Long</span>
        {actionSubtext && <span className="text-[10px] font-medium opacity-90">{actionSubtext}</span>}
      </button>
      <button
        type="button"
        onClick={() => !isInvalid && onSubmit('SELL')}
        disabled={isLoading || isInvalid}
        className="flex-1 flex flex-col items-center justify-center rounded-md py-2 font-semibold text-[13px] bg-danger text-white hover:bg-danger/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span>Sell / Short</span>
        {actionSubtext && <span className="text-[10px] font-medium opacity-90">{actionSubtext}</span>}
      </button>
    </div>
  );
};
