import { CheckCircle2, ExternalLink, History, X, XCircle } from 'lucide-react';
import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { ROUTES } from '../../../../constants/routes';
import { getExplorerUrl } from '../../../evm/utils/Chainregistry';
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
  const navigate = useNavigate();

  const handleGoToHistory = () => {
    if (hash) {
      navigate(`${ROUTES.TRANSACTIONS}?hash=${hash}&tab=stellar`);
      onClose();
    }
  };

  useEffect(() => {
    if (status === 'success' && hash && isOpen) {
      const timer = setTimeout(() => {
        handleGoToHistory();
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [status, hash, isOpen]);

  if (!isOpen) return null;

  const chainId = currentNetwork === 'mainnet' ? 'pubnet' : 'testnet';

  const isRejected =
    error?.toLowerCase().includes('reject') || error?.toLowerCase().includes('cancel');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-sm bg-secondary border border-color rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300"
        onClick={e => e.stopPropagation()}
      >
        {status === 'success' && (
          <div className="absolute top-0 left-0 h-1 bg-green-500/30 w-full z-10">
            <div
              className="h-full bg-green-500 animate-[progress_4s_linear]"
              style={{ width: '100%' }}
            />
          </div>
        )}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-muted hover:text-primary hover:bg-bg-hover rounded-full transition-all"
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
              <div className="p-4 rounded-2xl bg-tertiary border border-color text-xs text-muted text-center font-medium leading-relaxed">
                Transaction submitted successfully. Hash:{' '}
                <span className="font-mono text-primary font-semibold">
                  {hash.slice(0, 8)}...{hash.slice(-8)}
                </span>
              </div>
            )}

            {status === 'success' && hash && (
              <div className="grid grid-cols-2 gap-3 w-full">
                <a
                  href={getExplorerUrl(chainId, 'tx', hash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl bg-tertiary border border-color hover:bg-bg-hover transition-all group"
                >
                  <ExternalLink
                    size={20}
                    className="text-blue-500 group-hover:scale-110 transition-transform"
                  />
                  <span className="text-[13px] font-semibold text-primary">Explorer</span>
                </a>

                <button
                  onClick={handleGoToHistory}
                  className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl bg-tertiary border border-color hover:bg-bg-hover transition-all group"
                >
                  <History
                    size={20}
                    className="text-purple-500 group-hover:rotate-[-10deg] transition-transform"
                  />
                  <span className="text-[13px] font-semibold text-primary">History</span>
                </button>
              </div>
            )}

            {status === 'success' && !hash && (
              <div className="p-4 rounded-2xl bg-tertiary border border-color text-xs text-muted text-center font-medium leading-relaxed">
                Transaction submitted successfully. Your wallet did not return a tracking hash, but
                you can check your transaction history or account balance in a few moments.
              </div>
            )}

            <button
              onClick={onClose}
              className={`w-full h-12 rounded-2xl font-bold transition-all shadow-lg hover:shadow-xl active:scale-95 ${
                status === 'success'
                  ? 'bg-green-500 hover:bg-green-600 text-white shadow-green-500/20'
                  : 'bg-tertiary hover:bg-bg-hover text-primary border border-color'
              }`}
            >
              {status === 'success' ? 'Done' : 'Close'}
            </button>

            {status === 'success' && hash && (
              <p className="text-[10px] text-center text-muted animate-pulse pt-2">
                Redirecting to history in 4s...
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default StellarTransactionModal;
