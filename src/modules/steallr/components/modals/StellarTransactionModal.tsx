import { CheckCircle2, ExternalLink, X, XCircle } from 'lucide-react';
import React from 'react';

import { useWalletStore } from '../../../walletconnect/store/walletConnectStore';

interface StellarTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  status: 'success' | 'error';
  type: string;
  hash?: string;
  error?: string;
}

const StellarTransactionModal: React.FC<StellarTransactionModalProps> = ({
  isOpen,
  onClose,
  status,
  type,
  hash,
  error,
}) => {
  const currentNetwork = useWalletStore(state => state.network);

  if (!isOpen) return null;

  const getExplorerUrl = (txHash: string) => {
    const networkPath = currentNetwork === 'mainnet' ? 'public' : 'testnet';
    return `https://stellar.expert/explorer/${networkPath}/tx/${txHash}`;
  };

  const isRejected = error?.toLowerCase().includes('reject') || error?.toLowerCase().includes('cancel');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-sm bg-secondary border border-white/10 rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300"
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-muted hover:text-primary hover:bg-white/5 rounded-full transition-all"
        >
          <X size={20} />
        </button>

        <div className="p-8 flex flex-col items-center text-center">
          <div className="mb-6">
            {status === 'success' ? (
              <div className="relative">
                <div className="absolute inset-0 bg-green-500/20 blur-2xl rounded-full scale-150 animate-pulse" />
                <CheckCircle2 size={72} className="relative text-green-500" strokeWidth={1.5} />
              </div>
            ) : (
              <div className="relative">
                <div className="absolute inset-0 bg-red-500/20 blur-2xl rounded-full scale-150 animate-pulse" />
                <XCircle size={72} className="relative text-red-500" strokeWidth={1.5} />
              </div>
            )}
          </div>

          <h3 className="text-2xl font-bold mb-2">
            {status === 'success'
              ? `${type} Successful!`
              : isRejected
                ? 'Transaction Rejected'
                : `${type} Failed`}
          </h3>

          <p className="text-muted text-sm px-4 mb-6 leading-relaxed">
            {status === 'success'
              ? `Your ${type.toLowerCase()} has been processed by the Stellar network.`
              : isRejected
                ? "You rejected that transaction. That's okay, you can try again whenever you're ready."
                : error || 'An unexpected error occurred during the transaction.'}
          </p>

          <div className="w-full space-y-3">
            {status === 'success' && hash && (
              <a
                href={getExplorerUrl(hash)}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-outline w-full gap-2 border-white/5 hover:bg-white/5 text-sm h-12 rounded-2xl"
              >
                View on StellarExpert
                <ExternalLink size={16} />
              </a>
            )}
            
            <button
              onClick={onClose}
              className={`w-full h-12 rounded-2xl font-bold transition-all shadow-lg hover:shadow-xl active:scale-95 ${
                status === 'success'
                  ? 'bg-green-500 hover:bg-green-600 text-white shadow-green-500/20'
                  : 'bg-white/10 hover:bg-white/15 text-primary border border-white/5'
              }`}
            >
              {status === 'success' ? 'Back to Wallet' : 'Close'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StellarTransactionModal;
