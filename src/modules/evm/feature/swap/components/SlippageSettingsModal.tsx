import { Infinity as InfinityIcon, Settings, ShieldAlert, ShieldCheck, X } from 'lucide-react';
import React, { useEffect, useState } from 'react';

import { useSwapStore } from '../../../../../store/swapStore';

interface SlippageSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  userSlippageTolerance: number;
  setUserSlippageTolerance: (val: number) => void;
  recommendedSlippage?: string | null;
}

const SlippageSettingsModal: React.FC<SlippageSettingsModalProps> = ({
  isOpen,
  onClose,
  userSlippageTolerance,
  setUserSlippageTolerance,
  recommendedSlippage,
}) => {
  const [inputValue, setInputValue] = useState(userSlippageTolerance.toString());

  const useUnlimitedApproval = useSwapStore(s => s.useUnlimitedApproval);
  const setUseUnlimitedApproval = useSwapStore(s => s.setUseUnlimitedApproval);

  useEffect(() => {
    if (isOpen) {
      setInputValue(userSlippageTolerance.toString());
    }
  }, [isOpen, userSlippageTolerance]);

  if (!isOpen) return null;

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val === '' || /^\d*\.?\d*$/.test(val)) {
      setInputValue(val);
      const parsed = parseFloat(val);
      if (!isNaN(parsed) && parsed > 0) {
        setUserSlippageTolerance(Math.min(parsed, 50));
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-tertiary border border-white/10 rounded-3xl p-5 shadow-2xl w-full max-w-sm relative animate-in zoom-in-95 duration-200">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 p-2 rounded-full hover:bg-white/10 text-muted hover:text-primary transition-all"
        >
          <X size={16} />
        </button>

        <div className="flex items-center gap-2 mb-6">
          <Settings size={18} className="text-brand" />
          <h2 className="text-lg font-black text-primary tracking-tight">Swap Settings</h2>
        </div>

        {/* ── Slippage section ── */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-widest text-muted">
              Tolerance level
            </span>
            {recommendedSlippage && (
              <button
                onClick={() => {
                  const val = parseFloat(recommendedSlippage);
                  if (!isNaN(val)) {
                    setInputValue(recommendedSlippage);
                    setUserSlippageTolerance(val);
                  }
                }}
                className="text-[10px] font-black text bg-blue-600/10 hover:bg-blue-600/20 px-2 py-1 rounded-full transition-all active:scale-95 cursor-pointer flex items-center gap-1"
              >
                Set Recommended: {recommendedSlippage}%
              </button>
            )}
          </div>

          <div className="flex gap-2">
            {[0.5, 1, 1.5, 2].map(val => (
              <button
                key={val}
                onClick={() => setUserSlippageTolerance(val)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${
                  userSlippageTolerance === val
                    ? 'bg-primary text-background ring-2 ring-primary/30'
                    : 'bg-secondary text-muted hover:text-primary hover:bg-white/5'
                }`}
              >
                {val}%
              </button>
            ))}
          </div>

          <div className="relative mt-2">
            <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
              <span className="text-xs font-bold text-muted uppercase tracking-widest">Custom</span>
            </div>
            <input
              type="text"
              value={inputValue}
              onChange={handleInputChange}
              className="w-full bg-secondary/50 rounded-xl pl-20 pr-8 py-3 text-right font-bold text-primary border border-white/5 focus:border-brand/50 focus:bg-secondary outline-none transition-all placeholder-white/20"
              placeholder="0.0"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-muted">
              %
            </span>
          </div>

          <div className="mt-4 bg-primary rounded-xl p-4">
            <p className="text-xs  leading-relaxed">
              Slippage is the difference between the expected price and the execution price. Setting
              this too low may cause your transaction to fail.
            </p>
          </div>
        </div>

        {/* ── Approval section ── */}
        <div className="mt-6 pt-5 border-t border-white/8">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <InfinityIcon
                size={15}
                className={useUnlimitedApproval ? 'text-orange-400' : 'text-muted'}
              />
              <span className="text-xs font-bold uppercase tracking-widest text-muted">
                Token Approval
              </span>
            </div>

            {/* Toggle */}
            <button
              id="unlimited-approval-toggle"
              role="switch"
              aria-checked={useUnlimitedApproval}
              onClick={() => setUseUnlimitedApproval(!useUnlimitedApproval)}
              className={`relative inline-flex h-[22px] w-[42px] shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
                useUnlimitedApproval ? 'bg-orange-500' : 'bg-white/15'
              }`}
            >
              <span
                aria-hidden="true"
                className={`pointer-events-none inline-block h-[18px] w-[18px] transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  useUnlimitedApproval ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Approval mode pill */}
          <div
            className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-[11px] font-bold transition-all duration-200 ${
              useUnlimitedApproval
                ? 'bg-orange-500/10 border-orange-500/30 text-orange-400'
                : 'bg-green-500/10 border-green-500/20 text-green-400'
            }`}
          >
            {useUnlimitedApproval ? (
              <ShieldAlert size={13} className="shrink-0" />
            ) : (
              <ShieldCheck size={13} className="shrink-0" />
            )}
            <span>
              {useUnlimitedApproval
                ? 'Unlimited — approve once, swap multiple times'
                : 'Exact — approve only the amount needed per swap'}
            </span>
          </div>

          {/* Warning when unlimited is on */}
          {useUnlimitedApproval && (
            <p className="mt-2 text-[10px] font-medium text-muted/70 leading-relaxed">
              You won't need to approve this token again for future swaps until the allowance is
              revoked.
            </p>
          )}

          {!useUnlimitedApproval && (
            <p className="mt-2 text-[10px] font-medium text-muted/70 leading-relaxed">
              A fresh approval is requested for each swap — one extra wallet confirmation per swap.
            </p>
          )}
        </div>

        <button
          onClick={onClose}
          className="w-full mt-6 bg-primary text-background font-black py-3 rounded-xl hover:opacity-90 active:scale-[0.98] transition-all"
        >
          Done
        </button>
      </div>
    </div>
  );
};

export default SlippageSettingsModal;
