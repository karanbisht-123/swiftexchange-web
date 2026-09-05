import React from 'react';

import { useWalletStore } from '../../../walletconnect/store/walletConnectStore';
import { useAsterAgent } from '../../adapters/aster/hooks/useAsterAgent';
import { useHyperliquidAgent } from '../../adapters/hyperliquid/hooks/useHyperliquidAgent';
import { useExchangeManager } from '../../core/ExchangeManager';

interface OrderActionButtonProps {
  onSubmit: (side: 'BUY' | 'SELL') => void;
  isLoading?: boolean;
  isValid?: boolean;
  validationError?: string;
  onOpenDepositModal: () => void;
  walletBalance: number;
  actionSubtext?: string;
}

export const OrderActionButton: React.FC<OrderActionButtonProps> = ({
  onSubmit,
  isLoading,
  isValid = true,
  validationError,
  onOpenDepositModal,
  walletBalance,
  actionSubtext,
}) => {
  const isWalletConnected = useWalletStore(state => Object.keys(state.connectedWallets).length > 0);
  const openWalletModal = useWalletStore(state => state.openModal);

  const asterAgent = useAsterAgent();
  const hyperliquidAgent = useHyperliquidAgent();
  const currentExchange = useExchangeManager(s => s.currentExchange);
  const activeAgent = currentExchange === 'hyperliquid' ? hyperliquidAgent : asterAgent;
  const { isReady: isAgentReady, deriveAgentKey, deriveState } = activeAgent;
  const hasFunds = walletBalance > 0;

  if (!isWalletConnected) {
    return (
      <button
        type="button"
        onClick={openWalletModal}
        className="w-full bg-brand hover:bg-brand-hover text-white rounded-md py-2.5 font-semibold text-[13px] transition-colors mt-2"
      >
        Connect Wallet
      </button>
    );
  }

  if (!isAgentReady) {
    return (
      <button
        type="button"
        onClick={() => deriveAgentKey()}
        disabled={deriveState === 'signing'}
        className="w-full bg-brand/10 text-brand border border-brand/30 hover:bg-brand/20 rounded-md py-2.5 font-semibold text-[13px] transition-colors mt-2 disabled:opacity-50"
      >
        {deriveState === 'signing' ? 'Please Sign in Wallet...' : 'Enable Trading'}
      </button>
    );
  }

  if (!hasFunds) {
    return (
      <button
        type="button"
        onClick={onOpenDepositModal}
        className="w-full bg-brand hover:bg-brand-hover text-white rounded-md py-2.5 font-semibold text-[13px] transition-colors mt-2"
      >
        Deposit
      </button>
    );
  }

  const isInvalid = isValid === false || !!validationError;

  return (
    <div className="flex gap-2 mt-2">
      <button
        type="button"
        onClick={() => !isInvalid && onSubmit('BUY')}
        disabled={isLoading || isInvalid}
        className="flex-1 flex flex-col items-center justify-center rounded-md py-2 font-semibold text-[13px] bg-success text-white hover:bg-success/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span>{isLoading ? 'Placing...' : 'Buy / Long'}</span>
        {actionSubtext && (
          <span className="text-[10px] font-medium opacity-90">{actionSubtext}</span>
        )}
      </button>
      <button
        type="button"
        onClick={() => !isInvalid && onSubmit('SELL')}
        disabled={isLoading || isInvalid}
        className="flex-1 flex flex-col items-center justify-center rounded-md py-2 font-semibold text-[13px] bg-danger text-white hover:bg-danger/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span>{isLoading ? 'Placing...' : 'Sell / Short'}</span>
        {actionSubtext && (
          <span className="text-[10px] font-medium opacity-90">{actionSubtext}</span>
        )}
      </button>
    </div>
  );
};
