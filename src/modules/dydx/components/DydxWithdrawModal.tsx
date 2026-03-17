import { AlertTriangle, ChevronRight, Clock, Copy, Loader2, X } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { useWalletStore } from '../../walletconnect/store/walletConnectStore';
import { useDydxWithdraw } from '../hooks/useDydxWithdraw';
import { useSubaccounts } from '../hooks/useSubaccounts';
import { SUBACCOUNT_CONSTANTS } from '../types/trading.types';

interface DydxWithdrawModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const WITHDRAW_STORAGE_KEY = 'dydx_withdraw_in_progress';

interface PersistedWithdrawState {
  step: string;
  stepLabel: string;
  amount: string;
  startedAt: number;
}

export const DydxWithdrawModal: React.FC<DydxWithdrawModalProps> = ({ isOpen, onClose }) => {
  const {
    childSubaccounts,
    crossSubaccount,
    totalEquity,
    totalFreeCollateral: globalFreeCollateral,
  } = useSubaccounts();

  const evmWallet = useWalletStore(state => state.connectedWallets.evm);
  const evmAddress = evmWallet?.address || '';

  const {
    withdraw,
    isWithdrawing,
    withdrawError,
    clearWithdrawError,
    stepLabel,
    step,
    // recoverNobleBalance,
  } = useDydxWithdraw();

  const [fromSubaccount, setFromSubaccount] = useState<any>(
    SUBACCOUNT_CONSTANTS.DEFAULT_CROSS_SUBACCOUNT
  );
  const [amount, setAmount] = useState('');
  const [success, setSuccess] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  const [persistedState, setPersistedState] = useState<PersistedWithdrawState | null>(() => {
    try {
      const raw = sessionStorage.getItem(WITHDRAW_STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  // Write to sessionStorage whenever a withdrawal is in progress
  useEffect(() => {
    if (isWithdrawing && amount) {
      const state: PersistedWithdrawState = {
        step,
        stepLabel,
        amount,
        startedAt: persistedState?.startedAt ?? Date.now(),
      };
      sessionStorage.setItem(WITHDRAW_STORAGE_KEY, JSON.stringify(state));
      setPersistedState(state);
    }
  }, [isWithdrawing, step, stepLabel, amount]);

  // Clear persisted state on success or error
  useEffect(() => {
    if (step === 'success' || step === 'error') {
      sessionStorage.removeItem(WITHDRAW_STORAGE_KEY);
      setPersistedState(null);
    }
  }, [step]);

  // Determine which view to show
  // If there's a persisted in-progress withdrawal (and hook isn't actively running),
  // show the progress screen rather than the form
  const showProgressScreen = isWithdrawing || (persistedState !== null && step === 'idle');
  const activeStepLabel = isWithdrawing ? stepLabel : (persistedState?.stepLabel ?? '');
  const activeAmount = isWithdrawing ? amount : (persistedState?.amount ?? '');

  // Reset form state on open — but only if there's no in-progress withdrawal
  useEffect(() => {
    if (isOpen && !showProgressScreen) {
      setAmount('');
      setSuccess(false);
      clearWithdrawError();
      setFromSubaccount(SUBACCOUNT_CONSTANTS.DEFAULT_CROSS_SUBACCOUNT);
    }
  }, [isOpen]);

  const sourceBalance = useMemo(() => {
    if (fromSubaccount === SUBACCOUNT_CONSTANTS.DEFAULT_CROSS_SUBACCOUNT && crossSubaccount) {
      return parseFloat(crossSubaccount.freeCollateral);
    }
    const source = childSubaccounts.find(c => c.subaccountNumber === fromSubaccount);
    return source ? parseFloat(source.freeCollateral) : 0;
  }, [childSubaccounts, crossSubaccount, fromSubaccount]);

  const amountValue = parseFloat(amount) || 0;

  const baseFee = 0.05;
  const totalDeduction = amountValue > 0 ? amountValue : 0;
  const actualWidthdrawAmount = Math.max(0, amountValue - baseFee);

  const isValidAmount = amountValue > 0 && amountValue <= sourceBalance;

  const freeCollateralBefore = sourceBalance;
  const freeCollateralAfter = Math.max(0, sourceBalance - totalDeduction);

  const equityBefore = parseFloat(totalEquity) || 0;
  const globalFreeCol = parseFloat(globalFreeCollateral) || 0;
  const equityAfter = Math.max(0, equityBefore - totalDeduction);

  const marginUsageAfter =
    equityAfter > 0 ? ((equityBefore - globalFreeCol) / equityAfter) * 100 : 0;

  const handleCopy = () => {
    if (!evmAddress) return;
    navigator.clipboard.writeText(evmAddress);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleSetMax = () => {
    setAmount(sourceBalance.toFixed(6));
  };

  const handleWithdraw = useCallback(async () => {
    if (!isValidAmount) return;

    clearWithdrawError();
    setSuccess(false);

    const result = await withdraw(amountValue.toString(), fromSubaccount, evmAddress);

    if (result.success) {
      sessionStorage.removeItem(WITHDRAW_STORAGE_KEY);
      setPersistedState(null);
      setSuccess(true);
      setTimeout(() => {
        onClose();
      }, 2000);
    }
  }, [isValidAmount, withdraw, amountValue, fromSubaccount, evmAddress, clearWithdrawError, onClose]);

  const handleDismissProgress = () => {
    // Only allow dismissing if not actively running (i.e. it's a stale persisted state)
    if (!isWithdrawing) {
      sessionStorage.removeItem(WITHDRAW_STORAGE_KEY);
      setPersistedState(null);
    }
  };

  if (!isOpen) return null;

  const formatCurr = (val: number) => `$${val.toFixed(2)}`;
  const formatPct = (val: number) => `${val.toFixed(2)}%`;

  // ── In-progress / persisted withdrawal screen ─────────────────────────────
  if (showProgressScreen) {
    const elapsedMinutes = persistedState
      ? Math.floor((Date.now() - persistedState.startedAt) / 60_000)
      : 0;

    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-secondary rounded-2xl border border-color w-full max-w-[440px] shadow-2xl overflow-hidden font-sans">
          <div className="flex items-center justify-between p-5 pb-3">
            <h3 className="text-xl font-medium text-primary">Withdraw</h3>
            <button
              onClick={onClose}
              className="p-1.5 text-muted hover:text-primary transition-colors rounded-lg hover:bg-hover"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="px-5 pb-6 flex flex-col items-center text-center gap-5">
            {/* Animated spinner or success icon */}
            <div className="w-16 h-16 rounded-full bg-brand/10 flex items-center justify-center mt-2">
              {isWithdrawing ? (
                <Loader2 className="w-8 h-8 text-brand animate-spin" />
              ) : (
                <Clock className="w-8 h-8 text-brand" />
              )}
            </div>

            <div>
              <div className="text-lg font-semibold text-primary mb-1">
                Withdrawal In Progress
              </div>
              <div className="text-sm text-muted leading-relaxed">
                {isWithdrawing
                  ? 'Please keep this tab open. Your withdrawal is being processed across multiple chains.'
                  : 'A withdrawal was started in this session. It may still be processing on-chain.'}
              </div>
            </div>

            {/* Current step */}
            <div className="w-full rounded-xl border border-color bg-tertiary px-4 py-3 space-y-2.5">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted">Amount</span>
                <span className="text-sm font-semibold text-primary">
                  ${parseFloat(activeAmount || '0').toFixed(2)} USDC
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted">Status</span>
                <div className="flex items-center gap-1.5">
                  {isWithdrawing && <Loader2 className="w-3.5 h-3.5 text-brand animate-spin" />}
                  <span className="text-sm text-brand font-medium">
                    {activeStepLabel || 'Processing...'}
                  </span>
                </div>
              </div>
              {!isWithdrawing && elapsedMinutes > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted">Started</span>
                  <span className="text-sm text-secondary">{elapsedMinutes}m ago</span>
                </div>
              )}
            </div>

            {withdrawError && (
              <div className="w-full p-3 bg-danger-bg border border-danger rounded-xl flex items-start gap-2 text-left">
                <AlertTriangle className="w-4 h-4 text-danger shrink-0 mt-0.5" />
                <p className="text-sm text-danger">{withdrawError}</p>
              </div>
            )}

            <p className="text-xs text-muted leading-relaxed">
              Funds travel from dYdX → Noble → Ethereum. This typically takes 3–10 minutes.
              You can close this modal — the transaction continues on-chain.
            </p>

            {/* Only show dismiss if not actively running */}
            {!isWithdrawing && (
              <button
                onClick={handleDismissProgress}
                className="w-full py-3 rounded-xl border border-color text-sm text-muted hover:text-primary hover:bg-hover transition-colors"
              >
                Start a new withdrawal
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Normal form ───────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-secondary rounded-2xl border border-color w-full max-w-[440px] shadow-2xl overflow-hidden font-sans">
        <div className="flex items-center justify-between p-5 pb-3">
          <h3 className="text-xl font-medium text-primary">Withdraw</h3>
          <button
            onClick={onClose}
            className="p-1.5 text-muted hover:text-primary transition-colors rounded-lg hover:bg-hover"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 pb-5 space-y-4">
          {/* DEV ONLY — uncomment to show development warning banner
          <div className="flex items-start gap-2 p-3 bg-brand/10 border border-brand/20 rounded-xl">
            <AlertTriangle className="w-4 h-4 text-brand shrink-0 mt-0.5" />
            <p className="text-xs text-brand leading-relaxed">
              Not recommended for use yet. This feature is currently in development mode.
            </p>
          </div>
          */}

          {/* Address Block */}
          <div className="p-4 rounded-xl border border-color bg-tertiary">
            <div className="text-xs text-muted mb-1">Address</div>
            <div className="flex items-start justify-between">
              <div className="overflow-hidden pr-4">
                <div className="text-primary font-medium text-[15px] truncate">
                  {evmAddress
                    ? `${evmAddress.slice(0, 18)}...${evmAddress.slice(-4)}`
                    : 'Connect EVM Wallet'}
                </div>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="text-xs text-muted font-mono">
                    {evmAddress ? `${evmAddress.slice(0, 6)}...${evmAddress.slice(-4)}` : '0x...'}
                  </span>
                  <button
                    onClick={handleCopy}
                    className="text-muted hover:text-primary transition-colors"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  {isCopied && <span className="text-[10px] text-success">Copied!</span>}
                </div>
              </div>
              <button className="flex items-center gap-2 bg-secondary hover:bg-hover transition-colors pl-2.5 pr-2 py-1.5 rounded-lg border border-color">
                <img
                  src="https://cryptologos.cc/logos/ethereum-eth-logo.svg?v=029"
                  alt="ETH"
                  className="w-4 h-4"
                />
                <span className="text-sm font-medium text-primary">Ethereum</span>
                <ChevronRight className="w-4 h-4 text-muted" />
              </button>
            </div>
          </div>

          {/* Amount Block */}
          <div className="p-4 rounded-xl border border-color bg-tertiary">
            <div className="flex justify-between items-center mb-2">
              <div className="text-xs text-muted">
                Amount &bull;{' '}
                <span className="text-secondary">${sourceBalance.toFixed(6)} Available</span>
              </div>
              <button
                onClick={handleSetMax}
                className="text-xs font-medium text-brand hover:text-opacity-80 transition-colors"
              >
                Max
              </button>
            </div>
            <input
              type="text"
              value={amount}
              onChange={e => {
                const val = e.target.value;
                if (val === '' || /^\d*\.?\d*$/.test(val)) {
                  setAmount(val);
                }
              }}
              placeholder="0.00"
              className="w-full bg-transparent text-primary text-2xl font-medium focus:outline-none placeholder-muted"
            />
            {amountValue > sourceBalance && (
              <p className="text-xs text-danger mt-2">Insufficient available balance</p>
            )}
          </div>

          {/* Summary rows */}
          <div className="space-y-3 pt-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted">Withdraw</span>
              <span className="text-sm text-primary font-medium">
                {formatCurr(actualWidthdrawAmount)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted">Free Collateral</span>
              <div className="text-sm font-medium text-primary flex items-center gap-2">
                <span className="text-secondary">{formatCurr(freeCollateralBefore)}</span>
                <span className="text-muted">&rarr;</span>
                <span>{formatCurr(freeCollateralAfter)}</span>
              </div>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted">Margin Usage</span>
              <span className="text-sm text-primary font-medium">
                {formatPct(marginUsageAfter)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted">Equity</span>
              <div className="text-sm font-medium text-primary flex items-center gap-2">
                <span className="text-secondary">{formatCurr(equityBefore)}</span>
                <span className="text-muted">&rarr;</span>
                <span>{formatCurr(equityAfter)}</span>
              </div>
            </div>
          </div>

          {withdrawError && (
            <div className="p-3 bg-danger-bg border border-danger rounded-lg">
              <p className="text-sm text-danger">{withdrawError}</p>
            </div>
          )}

          {success && (
            <div className="p-3 bg-success-bg border border-success rounded-lg">
              <p className="text-sm text-success">Withdrawal initiated successfully! ✓</p>
            </div>
          )}

          <button
            onClick={handleWithdraw}
            disabled={isWithdrawing || !isValidAmount || amountValue <= 0 || !evmAddress}
            className="w-full py-3.5 btn btn-primary rounded-xl font-medium text-[15px] transition-all bg-brand text-white hover:opacity-90 disabled:bg-hover disabled:text-muted disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
          >
            {isWithdrawing ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                {stepLabel}
              </>
            ) : !evmAddress ? (
              'Connect EVM Wallet'
            ) : (
              'Withdraw'
            )}
          </button>

          {/* DEV ONLY — uncomment to enable Noble stuck funds recovery
          <button
            onClick={() => recoverNobleBalance(evmAddress)}
            className="w-full py-3.5 btn btn-secondary rounded-xl font-medium text-[15px] transition-all bg-secondary text-white hover:opacity-90 disabled:bg-hover disabled:text-muted disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
          >
            Recover stuck Noble funds
          </button>
          */}

          <div className="h-2"></div>
        </div>
      </div>
    </div>
  );
};