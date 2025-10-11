import { useEffect, useState } from 'react';

import WalletStepConnect from './WalletStepConnect';
import WalletStepSuccess from './WalletStepSuccess';
import { useWalletStore } from './store.ts/walletStore';

interface ConnectWalletModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ConnectWalletModal: React.FC<ConnectWalletModalProps> = ({ isOpen, onClose }) => {
  const { connectMultiChainWallet, isConnected, isSessionValid } = useWalletStore();
  const [step, setStep] = useState<'initial' | 'connecting' | 'success' | 'error'>('initial');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setStep('initial');
      setError(null);
    }
  }, [isOpen]);

  const handleConnect = async () => {
    setStep('connecting');
    setError(null);
    try {
      await new Promise(res => setTimeout(res, 1200));
      await connectMultiChainWallet();
      if (isConnected && isSessionValid()) {
        setStep('success');
      } else {
        throw new Error('Connection failed or session invalid');
      }
    } catch (err) {
      setError((err as Error).message || 'Failed to connect wallet');
      setStep('error');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-[var(--color-bg-secondary)] p-6 rounded-2xl shadow-lg w-80 text-center">
        {step === 'initial' && (
          <>
            <p className="text-[var(--color-text-primary)] font-medium mb-4">
              Connect your wallet to continue.
            </p>
            <button
              onClick={handleConnect}
              className="px-4 py-2 bg-[var(--color-brand-primary)] text-white rounded-lg hover:opacity-90 transition"
              disabled={step !== 'initial'}
            >
              Connect Wallet
            </button>
          </>
        )}
        {step === 'connecting' && <WalletStepConnect />}
        {step === 'success' && <WalletStepSuccess />}
        {step === 'error' && (
          <>
            <p className="text-[var(--color-text-error)] font-medium mb-4">Error: {error}</p>
            <button
              onClick={handleConnect}
              className="px-4 py-2 bg-[var(--color-brand-primary)] text-white rounded-lg hover:opacity-90 transition mr-2"
            >
              Retry
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:opacity-90 transition"
            >
              Close
            </button>
          </>
        )}
        {(step === 'success' || step === 'error') && (
          <button
            onClick={onClose}
            className="mt-4 px-4 py-2 bg-[var(--color-brand-primary)] text-white rounded-lg hover:opacity-90 transition"
          >
            Close
          </button>
        )}
      </div>
    </div>
  );
};

export default ConnectWalletModal;
