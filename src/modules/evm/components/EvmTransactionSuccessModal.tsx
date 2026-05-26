import React, { useEffect } from 'react';
import { CheckCircle2, ExternalLink, History, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../../../constants/routes';

interface EvmTransactionSuccessModalProps {
  txHash: string;
  explorerUrl: string;
  onDone: () => void;
  title?: string;
  subtitle?: string;
  networkName?: string;
}

export const EvmTransactionSuccessModal: React.FC<EvmTransactionSuccessModalProps> = ({
  txHash,
  explorerUrl,
  onDone,
  title = 'Success!',
  subtitle = 'Transaction confirmed',
  networkName,
}) => {
  const navigate = useNavigate();

  const handleGoToHistory = () => {
    navigate(`${ROUTES.TRANSACTIONS}?hash=${txHash}`);
    onDone();
  };

  useEffect(() => {
    if (!txHash) return;

    const timer = setTimeout(() => {
      handleGoToHistory();
    }, 4000);

    return () => clearTimeout(timer);
  }, [txHash]);

  if (!txHash) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300"
        onClick={onDone}
      />

      <div className="relative w-full max-w-[380px] bg-secondary border border-color rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
        <div className="absolute top-0 left-0 h-1 bg-green-500/30 w-full">
          <div className="h-full bg-green-500 animate-[progress_4s_linear]" style={{ width: '100%' }} />
        </div>

        <button
          onClick={onDone}
          className="absolute right-4 top-4 p-2 rounded-full hover:bg-bg-hover transition-colors text-muted hover:text-primary"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="pt-10 pb-6 px-6 flex flex-col items-center">
          <div className="relative mb-6">
            <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
              <CheckCircle2 className="w-10 h-10 text-green-500" strokeWidth={2} />
            </div>
            <div className="absolute -inset-1 border-2 border-green-500/20 rounded-full animate-ping [animation-duration:3s]" />
          </div>

          <h3 className="text-xl font-bold text-primary text-center">
            {title}
          </h3>
          <p className="mt-1 text-sm text-secondary text-center">
            {subtitle} {networkName && <span>on <span className="text-green-500 font-medium">{networkName}</span></span>}
          </p>
        </div>

        <div className="px-6 pb-8 space-y-3">
          <div className="bg-tertiary rounded-2xl p-3 border border-color flex items-center justify-between mb-2">
            <span className="text-[11px] font-medium text-muted uppercase tracking-tight">Hash</span>
            <span className="font-mono text-xs text-primary">
              {txHash.slice(0, 8)}...{txHash.slice(-8)}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <a
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl bg-tertiary border border-color hover:bg-bg-hover transition-all group"
            >
              <ExternalLink className="w-5 h-5 text-blue-500 group-hover:scale-110 transition-transform" />
              <span className="text-[13px] font-semibold text-primary">Explorer</span>
            </a>

            <button
              onClick={handleGoToHistory}
              className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl bg-tertiary border border-color hover:bg-bg-hover transition-all group"
            >
              <History className="w-5 h-5 text-purple-500 group-hover:rotate-[-10deg] transition-transform" />
              <span className="text-[13px] font-semibold text-primary">History</span>
            </button>
          </div>

          <button
            onClick={onDone}
            className="w-full mt-2 py-4 bg-green-500 hover:bg-green-600 text-white rounded-2xl font-bold text-sm hover:opacity-90 active:scale-[0.98] transition-all shadow-lg shadow-green-500/20"
          >
            Done
          </button>

          <p className="text-[10px] text-center text-muted animate-pulse">
            Redirecting to history in 4s...
          </p>
        </div>
      </div>
    </div>
  );
};