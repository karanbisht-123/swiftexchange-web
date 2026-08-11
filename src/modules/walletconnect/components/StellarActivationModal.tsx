import {
  AlertCircle,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  CreditCard,
  HelpCircle,
  Loader2,
  QrCode,
  RefreshCw,
  X,
} from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import QRCode from 'qrcode';

import { ROUTES } from '../../../constants/routes';
import { useStellarAccountStatus } from '../hooks/useStellarAccountStatus';
import { useWalletStore } from '../store/walletConnectStore';

interface StellarActivationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onActivated?: () => void;
  onSwitchToEVM?: () => void;
}

export const StellarActivationModal: React.FC<StellarActivationModalProps> = ({
  isOpen,
  onClose,
  onActivated,
  onSwitchToEVM,
}) => {
  const navigate = useNavigate();
  const stellarWallet = useWalletStore(state => state.connectedWallets.stellar);
  const address = stellarWallet?.address || '';

  const { isActive, isChecking, error, checkStatus } = useStellarAccountStatus(address);
  const [activeTab, setActiveTab] = useState<'receive' | 'buy'>('receive');
  const [copied, setCopied] = useState(false);
  const [showWhyDetails, setShowWhyDetails] = useState(false);
  const [activationSuccess, setActivationSuccess] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!isOpen || !address || activeTab !== 'receive') return;

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
            if (err) console.error('QR code generation error:', err);
          }
        );
      }
    }, 50);

    return () => clearTimeout(timer);
  }, [isOpen, address, activeTab]);

  useEffect(() => {
    if (isActive === true) {
      setActivationSuccess(true);
      const timer = setTimeout(() => {
        if (onActivated) onActivated();
        onClose();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [isActive, onActivated, onClose]);

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

  const handleManualCheck = async () => {
    const active = await checkStatus(true);
    if (active) {
      setActivationSuccess(true);
      setTimeout(() => {
        if (onActivated) onActivated();
        onClose();
      }, 1200);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div
        className="relative w-full max-w-lg bg-secondary border border-color rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        <div className="relative px-6 py-5 border-b border-color flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-primary">Activate Stellar Account</h2>
                <span className="badge badge-warning text-[10px]">1 XLM Required</span>
              </div>
              <p className="text-xs text-muted mt-0.5">
                Send ~1 XLM to initialize your wallet on the Stellar ledger
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted hover:text-primary hover:bg-hover transition-colors"
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 overflow-y-auto space-y-4 text-left">
          {/* Success Banner if activated */}
          {activationSuccess && (
            <div className="p-3.5 bg-success-bg border border-success/30 rounded-xl flex items-center gap-3 animate-fade-in">
              <div className="w-7 h-7 rounded-full bg-success/20 flex items-center justify-center shrink-0">
                <Check className="w-4 h-4 text-success" />
              </div>
              <div>
                <p className="font-semibold text-xs text-success">Account Activated Successfully</p>
                <p className="text-[11px] text-muted">
                  Your Stellar account is now live and ready to trade.
                </p>
              </div>
            </div>
          )}

          {/* Educational "Why is this required?" Accordion */}
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
                  <div>
                    <span className="font-semibold text-primary">Base Reserve Protocol:</span>{' '}
                    Stellar requires a 1 XLM minimum reserve to prevent network ledger spam.
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <div>
                    <span className="font-semibold text-primary">100% Retained:</span> The 1 XLM
                    remains securely in your wallet as your reserve balance. Swiftex charges 0 fees.
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <div>
                    <span className="font-semibold text-primary">One-Time Activation:</span> Once
                    funded, you can freely hold tokens (USDC, EURC) and execute swaps.
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Action Tabs */}
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

          {/* Tab 1: Receive XLM */}
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
                      {address || 'Not connected'}
                    </span>
                    <button
                      onClick={handleCopy}
                      disabled={!address}
                      className="btn btn-secondary btn-sm py-1 px-2.5 text-xs flex items-center gap-1 shrink-0"
                      title="Copy Address"
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
                  <p className="text-[11px] text-muted leading-tight">
                    Send at least <strong>1 XLM</strong> from any exchange or wallet.
                  </p>
                </div>
              </div>

              <div className="bg-warning-bg/40 border border-warning/30 rounded-xl p-3 flex items-start gap-2.5 text-xs text-secondary leading-relaxed">
                <AlertCircle size={14} className="text-warning shrink-0 mt-0.5" />
                <div>
                  <strong className="text-primary">Important:</strong> Send native{' '}
                  <strong>XLM (Stellar)</strong> only. No memo is required for self-custody wallets.
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: Buy XLM */}
          {activeTab === 'buy' && (
            <div className="space-y-3 animate-fade-in text-center p-5 bg-tertiary rounded-xl border border-color">
              <div className="w-10 h-10 rounded-full bg-secondary border border-color flex items-center justify-center mx-auto text-brand mb-1">
                <CreditCard size={18} />
              </div>
              <h3 className="text-sm font-semibold text-primary">Buy XLM with Card</h3>
              <p className="text-xs text-muted max-w-sm mx-auto">
                Purchase XLM instantly via our integrated fiat on-ramp. Funds will arrive directly
                in your Stellar wallet.
              </p>
              <button
                onClick={() => {
                  onClose();
                  navigate(ROUTES.TRADING_EVM_FIAT, {
                    state: {
                      defaultCrypto: 'XLM',
                      defaultNetwork: 'XLM',
                      defaultAddress: address,
                    },
                  });
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

        {/* Modal Footer */}
        <div className="p-4 border-t border-color bg-tertiary flex flex-col sm:flex-row items-center justify-between gap-3">
          <button
            onClick={handleManualCheck}
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

          {onSwitchToEVM ? (
            <button
              onClick={() => {
                onClose();
                onSwitchToEVM();
              }}
              className="text-xs text-muted hover:text-primary transition-colors underline underline-offset-4"
            >
              Continue with EVM Swap instead
            </button>
          ) : (
            <button
              onClick={onClose}
              className="text-xs text-muted hover:text-primary transition-colors"
            >
              Dismiss
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
