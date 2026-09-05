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
        className={`neon-card neon-sheen w-full bg-secondary border rounded-2xl p-4 transition-all animate-fade-in flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${className}`}
      >
        <div className="relative flex items-start gap-4 min-w-0">
          <div className="neon-badge w-9 h-9 rounded-xl bg-info/10 border flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
            <Zap className="w-4 h-4 text-info" strokeWidth={2.5} />
          </div>
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2.5">
              <span className="neon-text text-sm font-extrabold text-primary tracking-tight">
                Stellar wallet not activated
              </span>
              <span className="neon-badge bg-info/10 text-info border text-[9px] font-bold uppercase tracking-widest rounded-md px-1.5 py-0.5">
                1 XLM req
              </span>
            </div>
            <p className="text-xs text-muted font-medium leading-relaxed">
              Stellar network requires a minimum 1 XLM base reserve to initialize new accounts
              on-chain.
            </p>
          </div>
        </div>

        <div className="relative flex items-center gap-2.5 self-end sm:self-center shrink-0">
          <button
            onClick={() => setModalOpen(true)}
            className="neon-btn btn-sm py-2 px-4 text-xs font-bold flex items-center gap-1.5 cursor-pointer rounded-xl active:scale-95 transition-transform"
          >
            <span>Activate</span>
            <ArrowRight size={14} strokeWidth={2.5} />
          </button>

          <button
            onClick={() => checkStatus(true)}
            disabled={isChecking}
            className="btn btn-secondary btn-sm p-2 rounded-xl flex items-center justify-center border border-color shadow-sm active:scale-95 transition-transform"
            title="Refresh Stellar account status"
          >
            {isChecking ? (
              <Loader2 size={14} className="animate-spin text-brand" />
            ) : (
              <RefreshCw size={14} className="text-muted" />
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
