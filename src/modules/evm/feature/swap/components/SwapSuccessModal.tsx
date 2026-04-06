import React from 'react';
import { CheckCircle2, ExternalLink } from 'lucide-react';
import type { ChainConfig } from '../../../utils/Chainregistry';

interface SwapSuccessModalProps {
  txHash: string;
  networkConfig: ChainConfig;
  onReset: () => void;
}

export const SwapSuccessModal: React.FC<SwapSuccessModalProps> = ({
  txHash,
  networkConfig,
  onReset,
}) => {
  if (!txHash || !networkConfig) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-end sm:items-center justify-center z-50 p-0 sm:p-4 animate-fade-in">
      <div className="card max-w-md w-full animate-slide-up rounded-t-3xl sm:rounded-2xl border-t-4 border-green-500 shadow-2xl m-0 sm:m-4 overflow-hidden">
        <div className="flex items-center justify-center pt-8 pb-4 relative">
          <div className="relative">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center shadow-lg">
              <CheckCircle2 className="w-12 h-12 text-white" strokeWidth={2.5} />
            </div>
            <div className="absolute -inset-2 bg-green-400/20 rounded-full blur-xl animate-pulse"></div>
          </div>
        </div>

        <div className="px-6 pb-8">
          <h3 className="text-2xl font-bold text-center mb-2 text-primary">
            Swap Successful!
          </h3>
          <p className="text-secondary text-center mb-1 text-sm">
            Your transaction has been confirmed
          </p>
          <p className="text-center text-xs font-semibold text-green-600 mb-6">
            on {networkConfig.name}
          </p>

          <div className="bg-tertiary rounded-xl p-4 mb-6 border border-color">
            <p className="text-[10px] text-muted uppercase font-bold tracking-widest text-center mb-1">Transaction Hash</p>
            <p className="font-mono text-xs text-center text-primary break-all">
              {txHash.slice(0, 16)}...{txHash.slice(-12)}
            </p>
          </div>

          <div className="space-y-3">
            <a
              href={`${networkConfig.blockExplorerUrl}/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary w-full flex items-center justify-center gap-2 text-base py-3 rounded-xl shadow-md hover:shadow-lg transition-all"
            >
              View on Explorer
              <ExternalLink className="w-4 h-4" />
            </a>
            <button
              onClick={onReset}
              className="btn-secondary w-full text-base py-3 font-semibold rounded-xl"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
