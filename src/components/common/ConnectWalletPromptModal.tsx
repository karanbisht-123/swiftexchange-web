import { AlertCircle, Wallet, X } from 'lucide-react';
import React from 'react';

interface ConnectWalletPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnect: () => void;
  message?: string;
}

export const ConnectWalletPromptModal: React.FC<ConnectWalletPromptModalProps> = ({
  isOpen,
  onClose,
  onConnect,
  message = 'To use this feature, you need to connect your wallet.',
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="connect-wallet-title"
      aria-describedby="connect-wallet-desc"
    >
      <div className="bg-(--color-bg-secondary) rounded-3xl border border-(--color-border) w-full max-w-sm shadow-2xl overflow-hidden transform transition-all scale-100 flex flex-col p-6 space-y-6">
        <div className="flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 flex items-center justify-center border border-amber-500/20">
              <Wallet className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <h3
                id="connect-wallet-title"
                className="text-lg font-black tracking-tight text-(--color-text-primary)"
              >
                Connect Wallet
              </h3>
              <p className="text-[10px] font-bold text-(--color-text-secondary) uppercase tracking-widest">
                Action Required
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 transition-all text-(--color-text-secondary)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4">
          <p
            id="connect-wallet-desc"
            className="text-sm text-(--color-text-secondary) font-medium leading-relaxed"
          >
            {message}
          </p>

          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 flex gap-3 text-left">
            <AlertCircle size={18} className="text-amber-500 shrink-0 mt-0.5" />
            <p className="text-[11px] text-(--color-text-secondary) leading-normal">
              Connecting your wallet allows you to place orders, swap tokens, deposit funds, and
              view your active portfolio balance safely.
            </p>
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            onClick={onClose}
            className="flex-1 h-12 rounded-xl bg-white/5 hover:bg-white/10 text-(--color-text-primary) font-black uppercase tracking-widest text-xs border border-(--color-border) transition-all cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              onClose();
              onConnect();
            }}
            className="flex-1 h-12 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-black uppercase tracking-widest text-xs shadow-lg shadow-amber-500/20 transition-all cursor-pointer"
          >
            Connect
          </button>
        </div>
      </div>
    </div>
  );
};
