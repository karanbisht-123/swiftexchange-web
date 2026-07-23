import { AlertCircle, Check, Copy, Loader2, RefreshCw } from 'lucide-react';
import React, { type ReactNode, useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Horizon } from '@stellar/stellar-sdk';
import QRCode from 'qrcode';

import { ROUTES } from '../../../constants/routes';
import { getStellarConfig } from '../config/chains';
import { useWalletStore } from '../store/walletConnectStore';

interface StellarActiveGuardProps {
  children: ReactNode;
  onSkip?: () => void;
  bypass?: boolean;
  onSwitchToEVM?: () => void;
}

const StellarActiveGuard: React.FC<StellarActiveGuardProps> = ({
  children,
  onSkip,
  bypass,
  onSwitchToEVM,
}) => {
  const navigate = useNavigate();
  const currentNetwork = useWalletStore(state => state.network);
  const stellarWallet = useWalletStore(state => state.connectedWallets.stellar);
  const openModal = useWalletStore(state => state.openModal);
  const isStellarConnected = !!stellarWallet?.address;

  const [accountActive, setAccountActive] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [showReceive, setShowReceive] = useState<boolean>(false);
  const [copyFeedback, setCopyFeedback] = useState<boolean>(false);

  const checkAccountActivation = useCallback(
    async (isManualRefresh = false) => {
      if (!stellarWallet?.address) {
        setAccountActive(false);
        return;
      }

      const cacheKey = `stellar_active_${stellarWallet.address}_${currentNetwork}`;

      if (!isManualRefresh && localStorage.getItem(cacheKey) === 'true') {
        setAccountActive(true);
        return;
      }

      if (isManualRefresh) {
        setIsLoading(true);
      }
      setError(null);

      const config = getStellarConfig(currentNetwork);
      const horizon = new Horizon.Server(config.horizonUrl);

      try {
        const account = await horizon.loadAccount(stellarWallet.address);
        const hasBalance = account.balances.some(b => parseFloat(b.balance) > 0);

        if (hasBalance) {
          localStorage.setItem(cacheKey, 'true');
          setAccountActive(true);
        } else {
          setAccountActive(false);
        }
      } catch (err: any) {
        if (err?.response?.status === 404) {
          setAccountActive(false);
        } else {
          if (isManualRefresh) {
            setError('Failed to fetch Stellar account status');
          }
          setAccountActive(false);
        }
      } finally {
        if (isManualRefresh) {
          setIsLoading(false);
        }
      }
    },
    [stellarWallet?.address, currentNetwork]
  );

  const handleCopy = useCallback(async () => {
    if (!stellarWallet?.address) return;
    try {
      await navigator.clipboard.writeText(stellarWallet.address);
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    } catch {
      setCopyFeedback(false);
    }
  }, [stellarWallet?.address]);

  const canvasCallbackRef = useCallback(
    (canvas: HTMLCanvasElement | null) => {
      if (!canvas || !stellarWallet?.address) return;

      const size = 150;
      canvas.width = size;
      canvas.height = size;
      canvas.style.width = `${size}px`;
      canvas.style.height = `${size}px`;

      QRCode.toCanvas(
        canvas,
        stellarWallet.address,
        {
          width: size,
          margin: 1,
          errorCorrectionLevel: 'M',
          color: { dark: '#000000', light: '#ffffff' },
        },
        err => {
          if (err) console.error(err);
        }
      );
    },
    [stellarWallet?.address]
  );

  useEffect(() => {
    if (bypass) return;
    checkAccountActivation(false);
  }, [checkAccountActivation, bypass]);

  useEffect(() => {
    if (bypass || !stellarWallet?.address || accountActive === true) return;

    const interval = setInterval(() => {
      checkAccountActivation(false);
    }, 4000);

    return () => clearInterval(interval);
  }, [bypass, stellarWallet?.address, accountActive, checkAccountActivation]);

  if (bypass) {
    return <>{children}</>;
  }

  if (!isStellarConnected) {
    return (
      <div className="w-full max-w-lg mx-auto p-4 sm:p-6 bg-bg-tertiary/70 backdrop-blur-md border border-divider rounded-2xl shadow-lg text-center space-y-4 animate-fade-in">
        <div className="flex justify-center items-center relative py-2">
          <div className="absolute w-28 h-28 bg-brand/20 blur-xl rounded-full" />
          <img
            src="/fundwaalet-Photoroom.png"
            alt="Connect wallet"
            className="relative z-10 w-28 h-28 sm:w-36 sm:h-36 object-contain"
          />
        </div>

        <div className="space-y-1">
          <h3 className="text-base sm:text-lg font-bold text-text-primary">
            Connect Your Stellar Wallet
          </h3>
          <p className="text-xs sm:text-sm text-text-secondary max-w-xs mx-auto">
            Connect a Stellar wallet to continue with this feature.
          </p>
        </div>

        <div className="flex flex-col w-full gap-2 pt-2">
          <button
            onClick={openModal}
            className="btn btn-primary w-full py-3 text-sm font-semibold rounded-xl"
          >
            Connect Wallet
          </button>
          {onSwitchToEVM && (
            <button
              onClick={onSwitchToEVM}
              className="btn btn-secondary w-full py-2.5 text-xs text-text-muted hover:text-text-primary transition-colors border-none bg-transparent hover:bg-bg-secondary"
            >
              Continue with EVM Swap
            </button>
          )}
        </div>
      </div>
    );
  }

  if (accountActive === null || (isLoading && accountActive === false && !showReceive)) {
    return (
      <div className="flex flex-col items-center justify-center p-8 space-y-3">
        <Loader2 className="w-8 h-8 animate-spin text-brand" />
        <p className="text-xs sm:text-sm text-text-secondary font-medium">
          Checking Stellar account status...
        </p>
      </div>
    );
  }

  if (accountActive === true) {
    return <>{children}</>;
  }

  return (
    <div className="w-full max-w-md mx-auto p-4 sm:p-5 bg-bg-tertiary/70 backdrop-blur-md border border-divider rounded-2xl shadow-lg text-center space-y-4 animate-fade-in overflow-hidden">
      {!showReceive && (
        <div className="flex justify-center items-center relative py-1">
          <div className="absolute w-24 h-24 bg-brand/20 blur-xl rounded-full" />
          <img
            src="/fundwaalet-Photoroom.png"
            alt="Activate wallet"
            className="relative z-10 w-28 h-28 sm:w-32 sm:h-32 object-contain"
          />
        </div>
      )}

      {!showReceive && (
        <div className="space-y-1">
          <h3 className="text-base sm:text-lg font-bold text-text-primary">
            Activate Your Stellar Account
          </h3>
          <p className="text-xs sm:text-sm text-text-secondary max-w-xs mx-auto leading-relaxed">
            Your Stellar account needs activation. Send any amount of XLM to activate it and
            proceed.
          </p>
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-500 rounded-xl p-3 text-xs text-left">
          {error}
        </div>
      )}

      {showReceive && stellarWallet?.address && (
        <div className="w-full bg-bg-secondary/60 rounded-xl p-4 border border-divider space-y-4 text-center animate-fade-in">
          <h3 className="text-sm font-bold text-text-primary">Receive XLM to Activate</h3>

          <div className="flex flex-col items-center gap-2">
            <div className="p-2 bg-white rounded-xl shadow-inner inline-block">
              <canvas ref={canvasCallbackRef} className="rounded-lg" />
            </div>
            <p className="text-[11px] text-text-secondary font-medium">
              Scan QR code to send XLM to your address
            </p>
          </div>

          <div className="space-y-1 text-left">
            <label className="text-[10px] font-bold text-text-muted uppercase tracking-wider block">
              Your Stellar Wallet Address
            </label>
            <div className="bg-bg-primary rounded-xl p-2.5 flex items-center justify-between border border-divider gap-2">
              <span className="text-xs font-mono text-text-primary truncate select-all flex-1 min-w-0">
                {stellarWallet.address}
              </span>
              <button
                onClick={handleCopy}
                className="btn btn-secondary py-1 px-2.5 text-xs flex items-center gap-1 shrink-0 rounded-lg hover:text-brand transition-colors"
                title="Copy Address"
              >
                {copyFeedback ? (
                  <>
                    <Check size={14} className="text-green-500" />
                    <span className="text-[10px] font-bold text-green-500">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy size={14} />
                    <span className="text-[10px] font-medium">Copy</span>
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-2.5 flex gap-2 text-left items-start">
            <AlertCircle size={16} className="text-amber-500 shrink-0 mt-0.5" />
            <p className="text-[11px] text-text-secondary leading-normal">
              Send only <strong className="text-text-primary">XLM (Stellar)</strong> to this
              address. Sending other assets to an inactive account will result in loss of funds.
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-col w-full gap-2.5 pt-1">
        <div className="flex items-center gap-2 w-full">
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
            className="btn btn-primary flex-1 py-2.5 text-xs sm:text-sm font-semibold rounded-xl"
          >
            Buy XLM
          </button>

          <button
            onClick={() => setShowReceive(!showReceive)}
            className={`btn flex-1 py-2.5 text-xs sm:text-sm font-semibold rounded-xl ${
              showReceive ? 'btn-primary' : 'btn-secondary'
            }`}
          >
            {showReceive ? 'Hide QR' : 'Receive XLM'}
          </button>

          <button
            onClick={() => checkAccountActivation(true)}
            disabled={isLoading}
            className="btn btn-secondary p-2.5 rounded-xl flex items-center justify-center shrink-0"
            title="Refresh Status"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin text-brand" />
            ) : (
              <RefreshCw className="w-4 h-4 text-text-secondary" />
            )}
          </button>
        </div>

        {onSwitchToEVM && (
          <button
            onClick={onSwitchToEVM}
            className="btn btn-primary w-full py-4 text-xs text-text-muted text-white transition-colors"
          >
            Continue with EVM Swap
          </button>
        )}
      </div>
    </div>
  );
};

export default StellarActiveGuard;
