import { AlertCircle, Copy, Loader2, RefreshCw } from 'lucide-react';
import React, { type ReactNode, useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import QRCode from 'qrcode';

import { Horizon } from '@stellar/stellar-sdk';

import { ROUTES } from '../../../constants/routes';
import { getStellarConfig } from '../config/chains';
import { useWalletStore } from '../store/walletConnectStore';

interface StellarActiveGuardProps {
  children: ReactNode;
  onSkip?: () => void;
  bypass?: boolean;
}

const StellarActiveGuard: React.FC<StellarActiveGuardProps> = ({ children, onSkip, bypass }) => {
  const navigate = useNavigate();
  const currentNetwork = useWalletStore(state => state.network);
  const stellarWallet = useWalletStore(state => state.connectedWallets.stellar);
  const openModal = useWalletStore(state => state.openModal);
  const isStellarConnected = !!stellarWallet?.address;

  const [accountActive, setAccountActive] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [showReceive, setShowReceive] = useState<boolean>(false);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  const checkAccountActivation = useCallback(async (force = false) => {
    if (!stellarWallet?.address) {
      setAccountActive(false);
      return;
    }

    const cacheKey = `stellar_active_${stellarWallet.address}_${currentNetwork}`;

    if (!force && localStorage.getItem(cacheKey) === 'true') {
      setAccountActive(true);
      return;
    }

    setIsLoading(true);
    setError(null);

    const config = getStellarConfig(currentNetwork);
    const horizon = new Horizon.Server(config.horizonUrl);

    try {
      const account = await horizon.loadAccount(stellarWallet.address);
      const hasPositiveBalance = account.balances.some(b => parseFloat(b.balance) > 0);

      if (hasPositiveBalance) {
        localStorage.setItem(cacheKey, 'true');
      }

      setAccountActive(hasPositiveBalance);
    } catch (err: any) {
      if (err?.response?.status === 404) {
        setAccountActive(false);
      } else {
        setError('Failed to fetch Stellar account status');
        setAccountActive(false);
      }
    } finally {
      setIsLoading(false);
    }
  }, [stellarWallet?.address, currentNetwork]);

  const handleCopy = useCallback(async () => {
    if (!stellarWallet?.address) return;
    try {
      await navigator.clipboard.writeText(stellarWallet.address);
      setCopyFeedback('Copied!');
      setTimeout(() => setCopyFeedback(null), 2000);
    } catch {
      setCopyFeedback('Failed to copy');
    }
  }, [stellarWallet?.address]);

  const canvasCallbackRef = useCallback(
    (canvas: HTMLCanvasElement | null) => {
      if (!canvas || !stellarWallet?.address) return;

      const size = 200;
      canvas.width = size;
      canvas.height = size;
      canvas.style.width = `${size}px`;
      canvas.style.height = `${size}px`;

      QRCode.toCanvas(
        canvas,
        stellarWallet.address,
        {
          width: size,
          margin: 2,
          errorCorrectionLevel: 'H',
          color: { dark: '#000000', light: '#ffffff' },
        },
        err => {
          if (err) console.error('QR error:', err);
        }
      );
    },
    [stellarWallet?.address]
  );

  useEffect(() => {
    if (bypass) return;
    checkAccountActivation(false);
  }, [checkAccountActivation, bypass]);

  if (bypass) {
    return <>{children}</>;
  }

  if (!isStellarConnected) {
    return (
      <div className="text-center h-full space-y-4 animate-slide-up p-4 flex flex-col items-center max-w-4xl mx-auto">
        <div className="flex justify-center items-center my-3 relative">
          <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-48 h-8 bg-brand/20 blur-2xl rounded-full" />
          <div className="rounded-full bg-info-bg relative overflow-hidden">
            <div className="absolute inset-0 animate-pulse-once" />
            <img
              src="/fundwaalet-Photoroom.png"
              alt="Connect wallet"
              className="relative z-10 w-full h-72 object-contain"
            />
          </div>
        </div>

        <div className="space-y-2">
          <h3 className="heading-3">Connect Your Stellar Wallet</h3>
          <p className="text-secondary max-w-xs mx-auto">
            Connect a Stellar wallet to start using this feature.
          </p>
        </div>

        <div className="flex flex-col w-full gap-3 pt-4">
          <button onClick={openModal} className="btn btn-primary w-full btn-lg">
            Connect Wallet
          </button>
        </div>
      </div>
    );
  }

  if (accountActive === null || isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-8 space-y-4">
        <Loader2 className="w-8 h-8 animate-spin text-brand" />
        <p className="text-secondary font-medium">Checking Stellar account status...</p>
      </div>
    );
  }

  if (accountActive === true) {
    return <>{children}</>;
  }

  return (
    <div className="text-center h-full space-y-4 animate-slide-up p-4 flex flex-col items-center max-w-4xl mx-auto">
      {!showReceive && (
        <div className="flex justify-center items-center my-3 relative">
          <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-48 h-8 bg-brand/20 blur-2xl rounded-full" />
          <div className="rounded-full bg-info-bg relative overflow-hidden">
            <div className="absolute inset-0 animate-pulse-once" />
            <img
              src="/fundwaalet-Photoroom.png"
              alt="Activate wallet"
              className="relative z-10 w-full h-72 object-contain"
            />
          </div>
        </div>
      )}

      {!showReceive && (
        <div className="space-y-2 animate-fade-in">
          <h3 className="heading-3">Activate Your Stellar Account</h3>
          <p className="text-secondary max-w-xs mx-auto">
            Your Stellar account is not activated yet. Please fund your account with any amount of XLM
            to activate it.
          </p>
        </div>
      )}

      {error && (
        <div className="card bg-danger-bg border border-red-300 text-left w-full">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {showReceive && stellarWallet?.address && (
        <div className="w-full bg-bg-tertiary rounded-2xl p-6 border border-divider space-y-6 animate-fade-in text-center">
          <h3 className="heading-3 mb-2">Receive XLM to Activate</h3>
          
          <div className="flex flex-col items-center gap-4">
            <div className="bg-white rounded-xl p-3 shadow-md ring-1 ring-black/5">
              <canvas ref={canvasCallbackRef} className="rounded-lg" />
            </div>
            <p className="text-xs text-text-secondary font-medium">
              Scan this QR code to send XLM to your wallet
            </p>
          </div>

          <div className="space-y-2 text-left">
            <label className="block text-[10px] font-black text-text-muted uppercase tracking-widest pl-1">
              Your Stellar Wallet Address
            </label>
            <div className="bg-bg-secondary rounded-xl p-4 relative flex items-center justify-between border border-divider group">
              <span className="text-xs font-mono text-text-primary truncate pr-16 select-all">
                {stellarWallet.address}
              </span>
              <button
                onClick={handleCopy}
                className="absolute right-3 p-1 rounded-lg text-text-muted hover:text-brand transition-colors hover:bg-bg-hover flex items-center gap-1.5"
                title="Copy Address"
              >
                {copyFeedback ? (
                  <span className="text-[10px] font-bold text-brand uppercase">{copyFeedback}</span>
                ) : (
                  <Copy size={16} />
                )}
              </button>
            </div>
          </div>

          <div className="bg-warning/10 border border-warning/20 rounded-xl p-3 flex gap-3 text-left">
            <AlertCircle size={18} className="text-warning shrink-0 mt-0.5" />
            <p className="text-[11px] text-text-secondary leading-normal">
              Send only <span className="font-bold text-text-primary">XLM (Stellar)</span> to this address. Sending other assets to an inactive account will result in loss of funds.
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-col w-full gap-3 pt-4">
        <div className="flex gap-2 w-full">
          <button
            onClick={() => {
              navigate(ROUTES.TRADING_EVM_FIAT, {
                state: {
                  defaultCrypto: 'XLM',
                  defaultNetwork: 'XLM',
                  defaultAddress: stellarWallet?.address,
                },
              });
              if (onSkip) onSkip();
            }}
            className="btn btn-primary flex-1 btn-lg"
          >
            Buy XLM
          </button>

          <button
            onClick={() => setShowReceive(!showReceive)}
            className={`btn flex-1 btn-lg ${showReceive ? 'btn-primary' : 'btn-secondary'}`}
          >
            {showReceive ? 'Hide Address' : 'Receive XLM'}
          </button>

          <button
            onClick={() => checkAccountActivation(true)}
            disabled={isLoading}
            className="btn btn-secondary btn-lg aspect-square p-0 flex items-center justify-center min-w-[56px]"
            title="Refresh"
          >
            {isLoading ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : (
              <RefreshCw className="w-6 h-6" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default StellarActiveGuard;
