import { AlertTriangle, CheckCircle2, Clock, ExternalLink, Loader2 } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';

import {
  PENDING_REQUEST_TTL_MS,
  useGlobalTxStore,
} from '@/modules/walletconnect/store/globalTxStore';

export const PendingTransactionBanner: React.FC = () => {
  const { status, pendingRequest, clearPending, isLocked } = useGlobalTxStore();
  const [secondsLeft, setSecondsLeft] = useState<number>(0);
  const [isDismissing, setIsDismissing] = useState(false);

  // Tick every second to update the countdown and auto-dismiss on expiry
  useEffect(() => {
    if (status !== 'pending' || !pendingRequest) return;

    const tick = () => {
      const elapsed = Date.now() - pendingRequest.createdAt;
      const remaining = Math.max(0, Math.ceil((PENDING_REQUEST_TTL_MS - elapsed) / 1000));
      setSecondsLeft(remaining);
      if (remaining === 0) {
        // TTL expired — clear the lock automatically
        clearPending();
      }
    };

    tick(); // run immediately
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [status, pendingRequest, clearPending]);

  // Only show when the lock is genuinely active and within TTL
  if (!isLocked()) return null;

  const isWalletConnect = pendingRequest?.topic !== 'injected';

  const handleIRejectedIt = () => {
    setIsDismissing(true);
    setTimeout(() => {
      clearPending();
      setIsDismissing(false);
    }, 300);
  };

  return ReactDOM.createPortal(
    <div
      className={`fixed bottom-6 right-6 z-[9999] transition-all duration-300 ${
        isDismissing ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0'
      } animate-in slide-in-from-bottom-4`}
    >
      <div className="bg-bg-secondary border border-warning/40 shadow-2xl shadow-black/40 rounded-2xl overflow-hidden w-[320px]">
        {/* Progress bar showing TTL countdown */}
        <div className="h-1 bg-bg-tertiary w-full">
          <div
            className="h-full bg-warning transition-all duration-1000 ease-linear"
            style={{ width: `${(secondsLeft / (PENDING_REQUEST_TTL_MS / 1000)) * 100}%` }}
          />
        </div>

        <div className="p-4 space-y-3">
          {/* Header */}
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-warning/10 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-4 h-4 text-warning" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-black text-primary">Wallet Request Pending</h4>
                <span className="flex items-center gap-1 text-[10px] font-bold text-muted">
                  <Clock className="w-3 h-3" /> {secondsLeft}s
                </span>
              </div>
              <p className="text-xs text-muted font-medium mt-0.5 leading-relaxed">
                {isWalletConnect
                  ? 'Open your wallet app and Approve or Reject the pending request.'
                  : 'Open your browser wallet extension and Approve or Reject the pending request.'}
              </p>
            </div>
          </div>

          {/* Instruction steps */}
          <div className="bg-bg-tertiary rounded-xl p-3 space-y-2">
            {(isWalletConnect
              ? [
                  'Open your wallet app (Trust Wallet, MetaMask Mobile, etc.)',
                  'Find the pending signing request',
                  'Tap Approve or Reject',
                ]
              : [
                  'Click your wallet extension icon in the browser toolbar',
                  'Find the pending signing request',
                  'Click Approve or Reject',
                ]
            ).map((step, i) => (
              <div key={i} className="flex items-center gap-2.5">
                <span className="w-5 h-5 rounded-full bg-warning/15 text-warning text-[10px] font-black flex items-center justify-center shrink-0">
                  {i + 1}
                </span>
                <span className="text-xs text-muted font-medium leading-tight">{step}</span>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={handleIRejectedIt}
              disabled={isDismissing}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-bg-tertiary hover:bg-bg-hover border border-divider/50 rounded-xl text-xs font-bold text-muted hover:text-primary transition-all active:scale-[0.98]"
            >
              {isDismissing ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <CheckCircle2 className="w-3 h-3" />
              )}
              I rejected it
            </button>
            {isWalletConnect && (
              <a
                href="https://support.walletconnect.com"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5 px-3 py-2 bg-bg-tertiary hover:bg-bg-hover border border-divider/50 rounded-xl text-xs font-bold text-muted hover:text-primary transition-all"
              >
                <ExternalLink className="w-3 h-3" />
                Help
              </a>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
