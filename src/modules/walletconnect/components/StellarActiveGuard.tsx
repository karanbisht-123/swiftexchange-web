import {
  AlertCircle,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  Coins,
  Copy,
  CreditCard,
  HelpCircle,
  Loader2,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react';
import React, { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import QRCode from 'qrcode';

import { ROUTES } from '../../../constants/routes';
import { useStellarAccountStatus } from '../hooks/useStellarAccountStatus';
import { useWalletStore } from '../store/walletConnectStore';

interface StellarActiveGuardProps {
  children: ReactNode;
  onSkip?: () => void;
  bypass?: boolean;
  onSwitchToEVM?: () => void;
  requireConnected?: boolean;
}

const StellarActiveGuard: React.FC<StellarActiveGuardProps> = ({
  children,
  onSkip,
  bypass = false,
  onSwitchToEVM,
  requireConnected = false,
}) => {
  const navigate = useNavigate();
  const stellarWallet = useWalletStore(state => state.connectedWallets.stellar);
  const openModal = useWalletStore(state => state.openModal);
  const isStellarConnected = !!stellarWallet?.address;
  const address = stellarWallet?.address || '';

  const { isActive, isChecking, error, checkStatus } = useStellarAccountStatus(address);

  const [activeTab, setActiveTab] = useState<'receive' | 'buy'>('receive');
  const [copied, setCopied] = useState(false);
  const [showWhyDetails, setShowWhyDetails] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (bypass || !isStellarConnected || isActive === true || activeTab !== 'receive') return;

    const timer = setTimeout(() => {
      if (canvasRef.current && address) {
        const size = 150;
        canvasRef.current.width = size;
        canvasRef.current.height = size;
        QRCode.toCanvas(
          canvasRef.current,
          address,
          {
            width: size,
            margin: 1,
            errorCorrectionLevel: 'M',
            color: { dark: '#000000', light: '#ffffff' },
          },
          err => {
            if (err) console.error('QR code error:', err);
          }
        );
      }
    }, 50);

    return () => clearTimeout(timer);
  }, [bypass, isStellarConnected, isActive, activeTab, address]);

  const handleCopy = useCallback(async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }, [address]);

  // Bypass if requested
  if (bypass) {
    return <>{children}</>;
  }

  // If not connected
  if (!isStellarConnected) {
    if (!requireConnected) {
      return <>{children}</>;
    }

    return (
      <div className="w-full max-w-md mx-auto p-6 bg-secondary border border-color rounded-2xl shadow-sm text-center space-y-4 animate-fade-in">
        <div className="w-12 h-12 rounded-xl bg-tertiary border border-color flex items-center justify-center mx-auto text-brand">
          <Zap className="w-6 h-6" />
        </div>

        <div className="space-y-1">
          <h3 className="text-base font-bold text-primary">Connect Stellar Wallet</h3>
          <p className="text-xs text-muted max-w-xs mx-auto">
            Connect your Stellar wallet to view balances and trade.
          </p>
        </div>

        <div className="flex flex-col w-full gap-2 pt-2">
          <button
            onClick={openModal}
            className="btn btn-primary w-full py-2.5 text-xs font-semibold rounded-xl"
          >
            Connect Wallet
          </button>
          {onSwitchToEVM && (
            <button
              onClick={onSwitchToEVM}
              className="py-1 text-xs text-muted hover:text-primary transition-colors"
            >
              Continue with EVM Swap instead
            </button>
          )}
        </div>
      </div>
    );
  }

  // If account is active, show children
  if (isActive === true) {
    return <>{children}</>;
  }

  // If still checking on initial render
  if (isActive === null && isChecking) {
    return <>{children}</>;
  }

  // Account is INACTIVE: Render clean themed activation card
  return (
    <div className="w-full max-w-lg mx-auto bg-secondary border border-color rounded-2xl shadow-sm overflow-hidden text-left animate-fade-in">
      {/* Header */}
      <div className="p-5 border-b border-color flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-tertiary border border-color flex items-center justify-center shrink-0">
            <Zap className="w-5 h-5 text-brand" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-primary">Activate Stellar Account</h2>
              <span className="badge badge-warning text-[10px]">1 XLM Required</span>
            </div>
            <p className="text-xs text-muted mt-0.5">
              Your account needs ~1 XLM base reserve to be initialized on-chain.
            </p>
          </div>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* Educational Info Box */}
        <div className="bg-tertiary border border-color rounded-xl p-3.5 transition-all">
          <button
            onClick={() => setShowWhyDetails(!showWhyDetails)}
            className="w-full flex items-center justify-between text-left group cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <HelpCircle size={14} className="text-brand" />
              <span className="text-xs font-semibold text-primary group-hover:text-brand transition-colors">
                Why is account activation required on Stellar?
              </span>
            </div>
            {showWhyDetails ? (
              <ChevronUp size={14} className="text-muted" />
            ) : (
              <ChevronDown size={14} className="text-muted" />
            )}
          </button>

          {showWhyDetails && (
            <div className="mt-3 pt-3 border-t border-color space-y-2 text-xs text-secondary leading-relaxed animate-fade-in">
              <div className="flex items-start gap-2">
                <ShieldCheck size={14} className="text-brand shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-primary">Base Reserve Protocol:</span> Stellar
                  requires a 1 XLM minimum reserve to prevent network spam and maintain your account
                  entry.
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Coins size={14} className="text-success shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-primary">100% Retained:</span> The 1 XLM
                  remains in your wallet as your reserve. Swiftex charges 0 fees.
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Sparkles size={14} className="text-brand shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-primary">One-Time Activation:</span> Once
                  funded, you can freely hold USDC, add trustlines, and trade.
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Tab Selectors */}
        <div className="flex p-1 bg-primary border border-color rounded-xl gap-1">
          <button
            onClick={() => setActiveTab('receive')}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'receive'
                ? 'bg-secondary text-primary shadow-sm border border-color'
                : 'text-muted hover:text-primary'
            }`}
          >
            <QrCode size={13} />
            <span>Receive XLM</span>
          </button>
          <button
            onClick={() => setActiveTab('buy')}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'buy'
                ? 'bg-secondary text-primary shadow-sm border border-color'
                : 'text-muted hover:text-primary'
            }`}
          >
            <CreditCard size={13} />
            <span>Buy XLM</span>
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'receive' && (
          <div className="space-y-3.5 animate-fade-in">
            <div className="flex flex-col sm:flex-row items-center gap-4 bg-tertiary p-4 rounded-xl border border-color">
              <div className="p-2 bg-white rounded-xl shadow-sm shrink-0 flex items-center justify-center">
                <canvas ref={canvasRef} className="rounded-lg" />
              </div>
              <div className="flex-1 space-y-2 text-center sm:text-left min-w-0">
                <span className="text-[10px] font-bold text-muted uppercase tracking-wider block">
                  Your Stellar Address
                </span>
                <div className="bg-secondary border border-color rounded-lg p-2 flex items-center justify-between gap-2">
                  <span className="text-xs font-mono-tabular text-primary truncate select-all flex-1 min-w-0">
                    {address}
                  </span>
                  <button
                    onClick={handleCopy}
                    className="btn btn-secondary btn-sm py-1 px-2.5 text-xs flex items-center gap-1 shrink-0"
                  >
                    {copied ? (
                      <>
                        <Check size={12} className="text-success" />
                        <span className="text-success font-medium">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy size={12} />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>
                <p className="text-[11px] text-muted">
                  Send at least <strong>1 XLM</strong> from any exchange or wallet.
                </p>
              </div>
            </div>

            <div className="bg-warning-bg/40 border border-warning/30 rounded-xl p-3 flex items-start gap-2.5 text-xs text-secondary leading-relaxed">
              <AlertCircle size={14} className="text-warning shrink-0 mt-0.5" />
              <div>
                <strong className="text-primary">Notice:</strong> Send native{' '}
                <strong>XLM (Stellar)</strong> only. No memo is required for self-custody.
              </div>
            </div>
          </div>
        )}

        {activeTab === 'buy' && (
          <div className="space-y-3 animate-fade-in text-center p-5 bg-tertiary rounded-xl border border-color">
            <div className="w-10 h-10 rounded-full bg-secondary border border-color flex items-center justify-center mx-auto text-brand mb-1">
              <CreditCard size={18} />
            </div>
            <h3 className="text-sm font-semibold text-primary">Buy XLM with Card</h3>
            <p className="text-xs text-muted max-w-sm mx-auto">
              Purchase XLM instantly via our integrated on-ramp. Funds will be deposited directly to
              your Stellar address.
            </p>
            <button
              onClick={() => {
                navigate(ROUTES.TRADING_EVM_FIAT, {
                  state: {
                    defaultCrypto: 'XLM',
                    defaultNetwork: 'XLM',
                    defaultAddress: address,
                  },
                });
                if (onSkip) onSkip();
              }}
              className="btn btn-primary w-full py-2.5 text-xs font-semibold rounded-xl flex items-center justify-center gap-2 mt-2"
            >
              <span>Proceed to Buy XLM</span>
              <ArrowRight size={14} />
            </button>
          </div>
        )}

        {error && (
          <div className="bg-danger-bg border border-danger/30 text-danger rounded-xl p-3 text-xs">
            {error}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-color bg-tertiary flex flex-col sm:flex-row items-center justify-between gap-3">
        <button
          onClick={() => checkStatus(true)}
          disabled={isChecking}
          className="btn btn-secondary btn-sm w-full sm:w-auto py-2 px-3.5 text-xs flex items-center justify-center gap-2"
        >
          {isChecking ? (
            <>
              <Loader2 size={13} className="animate-spin text-brand" />
              <span>Checking Ledger...</span>
            </>
          ) : (
            <>
              <RefreshCw size={13} className="text-muted" />
              <span>Check Status</span>
            </>
          )}
        </button>

        {onSwitchToEVM && (
          <button
            onClick={onSwitchToEVM}
            className="text-xs text-muted hover:text-primary transition-colors underline underline-offset-4"
          >
            Continue with EVM Swap instead
          </button>
        )}
      </div>
    </div>
  );
};

export default StellarActiveGuard;
