import { ArrowRight, Loader2, RefreshCw, Zap } from 'lucide-react';
import React, { useState } from 'react';

import { useStellarAccountStatus } from '../hooks/useStellarAccountStatus';
import { useWalletStore } from '../store/walletConnectStore';
import { StellarActivationModal } from './StellarActivationModal';

interface StellarActivationBannerProps {
  className?: string;
  onSwitchToEVM?: () => void;
}

export const StellarActivationBanner: React.FC<StellarActivationBannerProps> = ({
  className = '',
  onSwitchToEVM,
}) => {
  const stellarWallet = useWalletStore(state => state.connectedWallets.stellar);
  const address = stellarWallet?.address;
  const { isActive, isChecking, checkStatus } = useStellarAccountStatus(address);
  const [modalOpen, setModalOpen] = useState(false);

  if (!address || isActive === true || isActive === null) {
    return null;
  }

  return (
    <>
      <div
        className={`w-full bg-secondary border border-warning/30 rounded-xl p-3 sm:p-4 text-left transition-all animate-fade-in flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${className}`}
      >
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-warning-bg border border-warning/20 flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
            <Zap className="w-4 h-4 text-warning" />
          </div>
          <div className="min-w-0 space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-primary tracking-wide">
                Stellar Account Not Activated
              </span>
              <span className="badge badge-warning text-[10px]">1 XLM Reserve Needed</span>
            </div>
            <p className="text-[11px] text-muted leading-tight">
              Stellar network requires a minimum 1 XLM base reserve to initialize new accounts
              on-chain.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
          <button
            onClick={() => setModalOpen(true)}
            className="btn btn-primary btn-sm py-1.5 px-3 text-xs font-semibold flex items-center gap-1 cursor-pointer"
          >
            <span>Activate</span>
            <ArrowRight size={13} />
          </button>

          <button
            onClick={() => checkStatus(true)}
            disabled={isChecking}
            className="btn btn-secondary btn-sm p-1.5 rounded-lg flex items-center justify-center"
            title="Refresh Stellar Account Status"
          >
            {isChecking ? (
              <Loader2 size={13} className="animate-spin text-brand" />
            ) : (
              <RefreshCw size={13} className="text-muted" />
            )}
          </button>
        </div>
      </div>

      <StellarActivationModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSwitchToEVM={onSwitchToEVM}
      />
    </>
  );
};
