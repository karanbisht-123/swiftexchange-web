import { AlertTriangle, CheckCircle2, Loader2, X } from 'lucide-react';
import React from 'react';

import { getChainById } from '../../../utils/Chainregistry';

interface SwapExecutionScreenProps {
  actionType: 'SWAP' | 'BRIDGE';
  fromChainId: number | string;
  toChainId: number | string;
  sellAsset: any;
  buyAsset: any;
  sellAmount: string;
  calculatedBuyAmount: string;
  isWaitingForWallet: boolean;
  signingWallet: any;
  onDismiss: () => void;
  isApprovalRequired: boolean | null;
  currentStep: 'preparing' | 'approving' | 'signing';
  status?: 'pending' | 'error' | 'success';
  errorMsg?: string | null;
}

export const SwapExecutionScreen: React.FC<SwapExecutionScreenProps> = ({
  actionType,
  fromChainId,
  toChainId,
  sellAsset,
  buyAsset,
  sellAmount,
  calculatedBuyAmount,
  isWaitingForWallet,
  signingWallet,
  onDismiss,
  isApprovalRequired,
  currentStep,
  status = 'pending',
  errorMsg,
}) => {
  console.log(isApprovalRequired, '------ is aproval Required ------');

  const fromChainConfig = getChainById(fromChainId);
  const toChainConfig = getChainById(toChainId);

  const steps = React.useMemo(() => {
    if (isApprovalRequired) {
      return [
        {
          title: 'Approve Token Spend',
          description: signingWallet?.peerName
            ? `Approve token spend in your ${signingWallet.peerName} wallet`
            : 'Approve token spend in your connected wallet',
          status:
            currentStep === 'approving' ? 'active' : currentStep === 'signing' ? 'done' : 'waiting',
        },
        {
          title: 'Confirm Transaction',
          description: signingWallet?.peerName
            ? `Sign the final transaction in your ${signingWallet.peerName} wallet`
            : 'Sign the final transaction in your connected wallet',
          status: currentStep === 'signing' ? 'active' : 'waiting',
        },
      ];
    } else {
      return [
        {
          title: 'Build Swap Order',
          description: 'Building swap route and contract arguments...',
          status: currentStep === 'preparing' ? 'active' : 'done',
        },
        {
          title: 'Confirm Transaction',
          description: signingWallet?.peerName
            ? `Approve and sign in your ${signingWallet.peerName} wallet`
            : 'Sign transaction in your connected wallet',
          status: currentStep === 'signing' ? 'active' : 'waiting',
        },
      ];
    }
  }, [isApprovalRequired, currentStep, signingWallet]);

  return (
    <div className="bg-tertiary rounded-3xl p-6 border border-divider/50 w-full max-w-full flex flex-col items-center animate-in fade-in duration-300 relative overflow-hidden min-h-[480px] justify-between">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-32 bg-brand/5 blur-[80px] pointer-events-none opacity-60" />
      <div className="w-full flex justify-between items-center z-10">
        <div className="flex items-center gap-2">
          {status === 'error' ? (
            <AlertTriangle className="w-4 h-4 text-red-500" />
          ) : (
            <Loader2 className="w-4 h-4 text-brand animate-spin" />
          )}
          <span
            className={`text-[10px] font-black uppercase tracking-[0.3em] ${status === 'error' ? 'text-red-500' : 'text-brand'}`}
          >
            {status === 'error' ? 'Transaction Failed' : 'Transaction Pending'}
          </span>
        </div>
        <button
          onClick={onDismiss}
          className="p-1.5 text-muted hover:text-primary hover:bg-bg-hover rounded-full transition-all"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="w-full bg-secondary border border-color rounded-2xl p-5 mt-6 z-10 flex items-center justify-between shadow-sm relative group overflow-hidden">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="relative flex-shrink-0">
            <img
              src={
                sellAsset?.logoURI ||
                `https://ui-avatars.com/api/?name=${sellAsset?.symbol || 'Token'}&background=random`
              }
              className="w-11 h-11 rounded-full bg-tertiary object-cover border border-color shadow-sm"
              alt=""
            />
            {fromChainConfig?.nativeCurrency?.logoURI && (
              <img
                src={fromChainConfig.nativeCurrency.logoURI}
                className="absolute -bottom-1 -right-1 w-4.5 h-4.5 rounded-full border-2 border-secondary bg-secondary"
                alt=""
              />
            )}
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-xl font-black text-primary leading-tight truncate">
              {sellAmount}{' '}
              <span className="text-xs text-muted font-bold tracking-normal">
                {sellAsset?.symbol}
              </span>
            </span>
            <span className="text-[10px] text-muted font-black uppercase tracking-wider mt-0.5">
              {actionType === 'SWAP' ? 'Swap' : 'Bridge'} from {fromChainConfig?.name}
            </span>
          </div>
        </div>
        <div className="text-right flex flex-col items-end min-w-0">
          <span className="text-base font-black text-brand leading-none">
            {calculatedBuyAmount}{' '}
            <span className="text-[10px] text-brand/80 font-bold">{buyAsset?.symbol}</span>
          </span>
          <span className="text-[8px] text-muted font-black uppercase tracking-wider mt-1">
            To {toChainConfig?.name}
          </span>
        </div>
      </div>
      <div className="w-full flex-1 flex flex-col justify-center py-8 z-10 pl-2">
        <div className="flex items-center gap-2 mb-6 opacity-80">
          <span className="text-[9px] font-black text-primary uppercase tracking-[0.2em]">
            Execution Roadmap
          </span>
        </div>

        <div className="relative space-y-6 pl-2">
          <div className="absolute top-3 left-[11px] bottom-3 w-[2px] bg-divider/30" />

          {steps.map((step, idx) => {
            const isActive = step.status === 'active';
            const isCompleted = step.status === 'done';

            return (
              <div key={idx} className="flex gap-4 items-start relative z-10">
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center border-2 transition-all duration-300 ${
                    isActive
                      ? 'bg-brand/10 border-brand text-brand shadow-lg shadow-brand/20 scale-105 animate-pulse'
                      : isCompleted
                        ? 'bg-success border-success text-white'
                        : 'bg-secondary border-divider text-muted'
                  }`}
                >
                  {isCompleted ? (
                    <CheckCircle2 size={12} strokeWidth={2.5} />
                  ) : isActive ? (
                    <Loader2 size={10} className="animate-spin text-brand" strokeWidth={2.5} />
                  ) : (
                    <span className="text-[8px] font-black">{idx + 1}</span>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <h4
                    className={`text-xs font-black uppercase tracking-wider leading-none transition-colors ${
                      isActive ? 'text-brand' : isCompleted ? 'text-primary' : 'text-muted'
                    }`}
                  >
                    {step.title}
                  </h4>
                  <p className="text-[10px] font-semibold text-muted/80 mt-1 leading-normal">
                    {step.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {status === 'error' && errorMsg && (
        <div className="w-full z-10 px-4 py-3 mb-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
          <p className="text-xs font-medium text-red-400 leading-relaxed">{errorMsg}</p>
        </div>
      )}

      <div className="w-full z-10 pt-4 border-t border-white/5 space-y-4">
        {status === 'pending' &&
          (isWaitingForWallet || currentStep === 'approving' || currentStep === 'signing') && (
            <div className="flex items-center gap-2 justify-center py-1">
              <div className="flex gap-0.5">
                <div className="w-1 h-1 rounded-full bg-brand animate-bounce" />
                <div className="w-1 h-1 rounded-full bg-brand animate-bounce delay-100" />
                <div className="w-1 h-1 rounded-full bg-brand animate-bounce delay-200" />
              </div>
              <span className="text-[9px] font-black text-brand uppercase tracking-widest">
                Please check your connected wallet...
              </span>
            </div>
          )}

        <button
          onClick={onDismiss}
          className={`w-full py-4 bg-secondary hover:bg-hover border border-color rounded-2xl font-bold text-sm transition-all active:scale-[0.98] ${status === 'error' ? 'text-red-400' : 'text-primary'}`}
        >
          {status === 'error' ? 'Close & Try Again' : 'Dismiss & Abort'}
        </button>

        {status !== 'error' && (
          <p className="text-[9px] text-center text-muted font-semibold tracking-normal block leading-tight">
            Please do not close this window until the transaction completes.
          </p>
        )}
      </div>
    </div>
  );
};
