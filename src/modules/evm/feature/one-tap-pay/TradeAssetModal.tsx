import { ShoppingCart, X } from 'lucide-react';
import { type FC, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import * as StellarSdk from 'stellar-sdk';

import { ROUTES } from '../../../../constants/routes';
import { getStellarConfig } from '../../../walletconnect/config/chains';
import { WalletType } from '../../../walletconnect/constants/Wallet';
import { useWalletConnect } from '../../../walletconnect/hooks/useWalletConnect';
import ActivateTrustStep from './ActivateTrustStep';
import AmountQuoteStep from './AmountQuoteStep';

interface Asset {
  id: string;
  symbol: string;
  name: string;
  image: string;
  balance: number;
  current_price: number;
  contractAddress?: string;
}

interface TradeAssetModalProps {
  isOpen: boolean;
  onClose: () => void;
  assetName: string;
  selectedAsset?: Asset;
}

const TradeAssetModal: FC<TradeAssetModalProps> = ({ isOpen, onClose, selectedAsset }) => {
  const navigate = useNavigate();
  const { connectedWallets } = useWalletConnect();

  const [step, setStep] = useState<'activate' | 'trade' | 'no-assets'>('activate');
  const [isActivated, setIsActivated] = useState(false);
  const [isWalletActive, setIsWalletActive] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasAssets, setHasAssets] = useState(true);

  const modalRef = useRef<HTMLDivElement>(null);

  // Get connected wallets
  const stellarWallet = connectedWallets[WalletType.STELLAR];
  const stellarAddress = stellarWallet?.address;
  const evmWallet = connectedWallets[WalletType.EVM];
  const evmAddress = evmWallet?.address;

  // Get network configuration
  // const network = getNetwork();
  const stellarConfig = getStellarConfig();

  useEffect(() => {
    const checkWalletActivation = async () => {
      // If no wallets connected, show no assets
      if (!stellarAddress && !evmAddress) {
        setIsLoading(false);
        setStep('no-assets');
        setHasAssets(false);
        return;
      }

      try {
        // Check Stellar wallet activation if connected
        if (stellarAddress) {
          try {
            const server = new StellarSdk.Horizon.Server(stellarConfig.horizonUrl);
            await server.loadAccount(stellarAddress);
            setIsWalletActive(true);
            setIsActivated(true);
          } catch (error) {
            console.error('Stellar wallet check failed:', error);
            setIsWalletActive(false);
            // If EVM wallet is connected, we can still trade
            if (evmAddress) {
              setIsActivated(true);
            }
          }
        } else if (evmAddress) {
          // Only EVM wallet connected, skip Stellar activation
          setIsActivated(true);
          setIsWalletActive(true);
        }

        // Check if user has ANY tradeable assets (not just the selected one)
        // For EVM: Check if they have native tokens (ETH/BNB) or USDT
        // For Stellar: Check if they have XLM or other assets
        let userHasTradableBalance = false;

        // If EVM wallet connected, assume they might have balance
        // The actual balance check will happen in AmountQuoteStep
        if (evmAddress) {
          userHasTradableBalance = true;
        }

        // If Stellar wallet connected and has the selected asset
        if (stellarAddress && selectedAsset && selectedAsset.balance > 0) {
          userHasTradableBalance = true;
        }

        setHasAssets(userHasTradableBalance);

        // Decide which step to show
        if (userHasTradableBalance) {
          setStep('trade');
        } else if (!isActivated && stellarAddress) {
          setStep('activate');
        } else {
          setStep('no-assets');
        }
      } catch (error) {
        console.error('Wallet check failed:', error);
        // If we have EVM wallet, still allow trade
        if (evmAddress) {
          setStep('trade');
          setHasAssets(true);
        } else {
          setStep('activate');
        }
      } finally {
        setIsLoading(false);
      }
    };

    if (isOpen) {
      checkWalletActivation();
    }
  }, [isOpen, selectedAsset, stellarAddress, evmAddress, stellarConfig.horizonUrl, isActivated]);

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
    if (evmAddress || hasAssets) {
      setStep('trade');
    } else {
      setStep('no-assets');
    }
  };

  const handleQuoteComplete = (data: {
    amount: number;
    quoteDetails: any;
    transactionHash: string;
    bridgeTransactionHash?: string;
  }) => {
    console.log('Swap completed:', data);
    alert(`Swap completed!\nAmount: ${data.amount}\nTx: ${data.transactionHash}`);
    onClose();
  };

  const handleQuoteBack = () => {
    // Only go back to activate if Stellar wallet needs activation
    if (stellarAddress && !isWalletActive) {
      setStep('activate');
    } else {
      onClose();
    }
  };

  const handleBuyAssets = () => {
    onClose();
    navigate(ROUTES.TRADING_EVM_FIAT);
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 animate-fadeIn">
      <div
        ref={modalRef}
        className="bg-secondary rounded-2xl shadow-xl w-full max-w-md max-h-[80vh] overflow-y-auto scrollbar-hide relative animate-neon-pulse"
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full hover:bg-gray-800 transition-colors duration-200 animate-float z-10"
          aria-label="Close modal"
        >
          <X size={20} />
        </button>
        <div className="p-6 flex flex-col gap-6">
          {step === 'no-assets' ? (
            <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center mb-6">
                <ShoppingCart size={40} className="text-blue-400" />
              </div>
              <h2 className="text-2xl font-bold text-primary mb-3">No Wallets Connected</h2>
              <p className="text-secondary text-sm mb-6 max-w-xs">
                Please connect an EVM wallet (MetaMask, Trust Wallet) or Stellar wallet to start
                trading.
              </p>
              <button
                onClick={handleBuyAssets}
                className="btn-primary px-8 py-3 rounded-xl font-semibold text-base shadow-lg hover:shadow-xl transition-all duration-200 flex items-center gap-2"
              >
                <ShoppingCart size={20} />
                Buy Crypto & Connect
              </button>
              <button
                onClick={onClose}
                className="mt-4 text-sm text-gray-400 hover:text-gray-300 transition-colors"
              >
                Maybe Later
              </button>
            </div>
          ) : step === 'activate' ? (
            <ActivateTrustStep
              onComplete={handleActivationComplete}
              onSkip={handleActivationSkip}
              isWalletActive={isWalletActive}
              stellarAddress={stellarAddress}
            />
          ) : (
            <AmountQuoteStep
              onComplete={handleQuoteComplete}
              onBack={handleQuoteBack}
              selectedAsset={selectedAsset}
              stellarAddress={stellarAddress}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default TradeAssetModal;
