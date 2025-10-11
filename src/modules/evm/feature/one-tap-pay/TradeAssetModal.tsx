import { X } from 'lucide-react';
import { type FC, useEffect, useRef, useState } from 'react';

import * as StellarSdk from 'stellar-sdk';

import ActivateTrustStep from './ActivateTrustStep';
// import SwapFlowAnimation from "./SwapFlowAnimation";
import AmountQuoteStep from './AmountQuoteStep';

const STELLAR_PUBLIC_KEY = import.meta.env.VITE_DEMO_WALLET_STELLAR_PUBLIC_KEY as string;
const STELLAR_BASE_URL = 'https://horizon-testnet.stellar.org';

interface TradeAssetModalProps {
  isOpen: boolean;
  onClose: () => void;
  assetName: string;
}

const TradeAssetModal: FC<TradeAssetModalProps> = ({
  isOpen,
  onClose,
  // assetName,
}) => {
  const [step, setStep] = useState<'activate' | 'trade'>('activate');
  const [isActivated, setIsActivated] = useState(false);
  console.log(isActivated);
  const [isWalletActive, setIsWalletActive] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const checkWalletActivation = async () => {
      try {
        const server = new StellarSdk.Horizon.Server(STELLAR_BASE_URL);
        await server.loadAccount(STELLAR_PUBLIC_KEY);
        setIsWalletActive(true);
        setIsActivated(true);
        setStep('trade');
      } catch (error) {
        console.error('Wallet check failed:', error);
        setIsWalletActive(false);
      } finally {
        setIsLoading(false);
      }
    };

    if (isOpen) {
      checkWalletActivation();
    }
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 animate-fadeIn">
        <div className="bg-gray-900 rounded-2xl shadow-xl w-full max-w-md p-6 text-center animate-neon-pulse">
          <p className="text-blue-400 font-medium">Checking wallet status...</p>
        </div>
      </div>
    );
  }

  const handleActivationComplete = (data: { claimedXLM: boolean }) => {
    if (data.claimedXLM) {
      setIsActivated(true);
      setIsWalletActive(true);
      setStep('trade');
    } else {
      alert('Activation failed. Please try again.');
    }
  };

  const handleActivationSkip = () => {
    setStep('trade');
  };

  // Define the onComplete handler for AmountQuoteStep
  const handleQuoteComplete = (data: {
    amount: number;
    quoteDetails: any; // Replace 'any' with the actual QuoteDetails type if available
    transactionHash: string;
    bridgeTransactionHash?: string;
  }) => {
    // Handle the completion of the swap
    alert(`Swap completed: ${data.amount} swapped, tx: ${data.transactionHash}`);
    onClose();
  };

  // Define the onBack handler for AmountQuoteStep
  const handleQuoteBack = () => {
    setStep('activate');
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 animate-fadeIn">
      <div
        ref={modalRef}
        className="bg-secondary rounded-2xl shadow-xl w-full max-w-md max-h-[80vh] overflow-y-auto scrollbar-hide relative animate-neon-pulse"
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full hover:bg-gray-800 transition-colors duration-200 animate-float"
          aria-label="Close modal"
        >
          <X size={20} className="" />
        </button>

        {/* Modal Content */}
        <div className="p-6 flex flex-col gap-6">
          {step === 'activate' ? (
            <ActivateTrustStep
              onComplete={handleActivationComplete}
              onSkip={handleActivationSkip}
              isWalletActive={isWalletActive}
            />
          ) : (
            <AmountQuoteStep onComplete={handleQuoteComplete} onBack={handleQuoteBack} />
          )}
        </div>
      </div>
    </div>
  );
};

export default TradeAssetModal;
