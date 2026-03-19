import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock,
  Copy,
  ExternalLink,
  Fuel,
  Loader2,
  X,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { useWalletStore } from '../../walletconnect/store/walletConnectStore';
import { useDydxWithdraw } from '../hooks/useDydxWithdraw';
import { useSubaccounts } from '../hooks/useSubaccounts';
import { SUBACCOUNT_CONSTANTS } from '../types/trading.types';
import { validateWithdrawAmount } from '../utils/inputValidation';
import { NATIVE_WALLET_GAS_RESERVE_UUSDC } from '../utils/skipBridgeUtils';


interface DydxWithdrawModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const WITHDRAW_STORAGE_KEY = 'dydx_withdraw_in_progress';

/**
 * Derived from the single source of truth in skipBridgeUtils.
 * Never hardcode this separately — the two must stay in sync.
 */
const ESTIMATED_GAS_FEE_USDC = NATIVE_WALLET_GAS_RESERVE_UUSDC / 1e6;

interface PersistedWithdrawState {
  step: string;
  stepLabel: string;
  amount: string;
  startedAt: number;
}

const formatCurr = (val: number) => `$${val.toFixed(2)}`;
const formatPct = (val: number) => `${val.toFixed(2)}%`;

// Main Modal 

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
    reset,
    withdrawnAmount,
    txHash: withdrawTxHash,
    errorRetryable,
  } = useDydxWithdraw();

  //  Local state 
  const [fromSubaccount, setFromSubaccount] = useState<any>(
    SUBACCOUNT_CONSTANTS.DEFAULT_CROSS_SUBACCOUNT
  );
  const [amount, setAmount] = useState('');
  const [success, setSuccess] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  const [persistedState, setPersistedState] = useState<PersistedWithdrawState | null>(() => {
    try {
      const raw = localStorage.getItem(WITHDRAW_STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  // Persist withdraw state across refreshes 
  useEffect(() => {
    if (isWithdrawing && amount) {
      const state: PersistedWithdrawState = {
        step,
        stepLabel,
        amount,
        startedAt: persistedState?.startedAt ?? Date.now(),
      };
      localStorage.setItem(WITHDRAW_STORAGE_KEY, JSON.stringify(state));
      setPersistedState(state);
    }
  }, [isWithdrawing, step, stepLabel, amount]);

  useEffect(() => {
    if (step === 'success' || step === 'error') {
      localStorage.removeItem(WITHDRAW_STORAGE_KEY);
      setPersistedState(null);
    }
  }, [step]);

  const showProgressScreen = isWithdrawing || (persistedState !== null && step === 'idle');
  const activeStepLabel = isWithdrawing ? stepLabel : (persistedState?.stepLabel ?? '');
  const activeAmount = isWithdrawing ? amount : (persistedState?.amount ?? '');

  // Reset form on open
  useEffect(() => {
    if (isOpen && !showProgressScreen) {
      setAmount('');
      setSuccess(false);
      clearWithdrawError();
      setFromSubaccount(SUBACCOUNT_CONSTANTS.DEFAULT_CROSS_SUBACCOUNT);
    }
  }, [isOpen]);

  // Balance calculations
  const sourceBalance = useMemo(() => {
    if (fromSubaccount === SUBACCOUNT_CONSTANTS.DEFAULT_CROSS_SUBACCOUNT && crossSubaccount) {
      return parseFloat(crossSubaccount.freeCollateral);
    }
    const source = childSubaccounts.find(c => c.subaccountNumber === fromSubaccount);
    return source ? parseFloat(source.freeCollateral) : 0;
  }, [childSubaccounts, crossSubaccount, fromSubaccount]);

  const amountValue = parseFloat(amount) || 0;


  const amountValidation = validateWithdrawAmount(amountValue, sourceBalance, 1, 0.01);

  const baseFee = 0.05;
  const actualWithdrawAmount = Math.max(0, amountValue - baseFee);

  const freeCollateralBefore = sourceBalance;
  const freeCollateralAfter = Math.max(0, sourceBalance - amountValue);
  const equityBefore = parseFloat(totalEquity) || 0;
  const globalFreeCol = parseFloat(globalFreeCollateral) || 0;
  const equityAfter = Math.max(0, equityBefore - amountValue);
  const marginUsageAfter =
    equityAfter > 0 ? ((equityBefore - globalFreeCol) / equityAfter) * 100 : 0;


  const handleCopy = () => {
    if (!evmAddress) return;
    navigator.clipboard.writeText(evmAddress);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleSetMax = () => {
    setAmount(Math.max(0, sourceBalance - 0.01).toFixed(6));
  };

  const handleWithdraw = useCallback(async () => {
    if (!amountValidation.valid) return;
    clearWithdrawError();
    setSuccess(false);

    const result = await withdraw(amountValue.toString(), fromSubaccount, evmAddress);

    if (result.success) {
      localStorage.removeItem(WITHDRAW_STORAGE_KEY);
      setPersistedState(null);
      setSuccess(true);
    }
  }, [amountValidation.valid, withdraw, amountValue, fromSubaccount, evmAddress, clearWithdrawError]);

  const handleDismissProgress = () => {
    if (!isWithdrawing) {
      localStorage.removeItem(WITHDRAW_STORAGE_KEY);
      setPersistedState(null);
    }
  };

  if (!isOpen) return null;


  if (showProgressScreen) {
    const elapsedMinutes = persistedState
      ? Math.floor((Date.now() - persistedState.startedAt) / 60_000)
      : 0;

    const steps: Array<{ key: string; label: string }> = [
      { key: 'checking_gas', label: 'Preparing withdrawal' },
      { key: 'signing', label: 'Sign & settle on dYdX' },
      { key: 'ibc_to_noble', label: 'Send to Noble chain' },
      { key: 'waiting_noble', label: 'Wait for Noble' },
      { key: 'bridging', label: 'Bridge to Ethereum' },
    ];
    const stepOrder = steps.map(s => s.key);
    const currentIdx = stepOrder.indexOf(step);

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
            <div className="w-16 h-16 rounded-full bg-brand/10 flex items-center justify-center mt-2">
              {isWithdrawing ? (
                <Loader2 className="w-8 h-8 text-brand animate-spin" />
              ) : (
                <Clock className="w-8 h-8 text-brand" />
              )}
            </div>

            <div>
              <div className="text-lg font-semibold text-primary mb-1">Withdrawal In Progress</div>
              <div className="text-sm text-muted leading-relaxed">
                {isWithdrawing
                  ? 'Please keep this tab open. Your withdrawal is being processed across multiple chains.'
                  : 'A withdrawal was started in this session. It may still be processing on-chain.'}
              </div>
            </div>

            {/* Amount + status */}
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
                    {activeStepLabel || 'Processing…'}
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

            {/* Step timeline */}
            {isWithdrawing && (
              <div className="w-full rounded-xl border border-color bg-tertiary px-4 py-3 space-y-2">
                <p className="text-xs text-muted font-medium uppercase tracking-wider mb-1 text-left">
                  Steps
                </p>
                {steps.map((s, i) => {
                  const isPast = currentIdx > i;
                  const isCurrent = currentIdx === i;
                  if (!isPast && !isCurrent && i > currentIdx + 1) return null;
                  return (
                    <div key={s.key} className="flex items-center gap-2 text-left">
                      {isPast ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0" />
                      ) : isCurrent ? (
                        <Loader2 className="w-3.5 h-3.5 text-brand animate-spin shrink-0" />
                      ) : (
                        <div className="w-3.5 h-3.5 rounded-full border border-muted shrink-0" />
                      )}
                      <span
                        className={`text-sm ${isCurrent
                          ? 'text-brand font-medium'
                          : isPast
                            ? 'text-muted line-through'
                            : 'text-muted'
                          }`}
                      >
                        {s.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Error */}
            {withdrawError && (
              <div className="w-full p-3 bg-danger-bg border border-danger rounded-xl flex items-start gap-2 text-left">
                <AlertTriangle className="w-4 h-4 text-danger shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-danger font-medium mb-0.5">
                    {step === 'error' ? 'Withdrawal failed' : 'Error'}
                  </p>
                  <p className="text-xs text-danger/80">{withdrawError}</p>
                </div>
              </div>
            )}

            <p className="text-xs text-muted leading-relaxed">
              Funds travel dYdX → Noble → Ethereum. This typically takes 3–10 minutes. You can
              close this modal — the transaction continues on-chain.
            </p>

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
          {/* ── Destination address ───────── */}
          <div className="p-4 rounded-xl border border-color bg-tertiary">
            <div className="text-xs text-muted mb-1">Destination</div>
            <div className="flex items-start justify-between">
              <div className="overflow-hidden pr-4">
                <div className="text-primary font-medium text-[15px] truncate">
                  {evmAddress
                    ? `${evmAddress.slice(0, 18)}...${evmAddress.slice(-4)}`
                    : 'Connect EVM Wallet'}
                </div>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="text-xs text-muted font-mono">
                    {evmAddress ? `${evmAddress.slice(0, 6)}...${evmAddress.slice(-4)}` : '0x…'}
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

          {/* ── Amount input ── */}
          <div className="p-4 rounded-xl border border-color bg-tertiary">
            <div className="flex justify-between items-center mb-2">
              <div className="text-xs text-muted">
                Amount &bull;{' '}
                <span className="text-secondary">${sourceBalance.toFixed(2)} Available</span>
              </div>
              <button
                onClick={handleSetMax}
                className="text-xs font-medium text-brand hover:opacity-80 transition-colors"
              >
                Max
              </button>
            </div>
            <input
              type="text"
              value={amount}
              onChange={e => {
                const val = e.target.value;
                if (val === '' || /^\d*\.?\d*$/.test(val)) setAmount(val);
              }}
              placeholder="0.00"
              className="w-full bg-transparent text-primary text-2xl font-medium focus:outline-none placeholder-muted"
            />
            {amountValidation.error && amountValue > 0 && (
              <div className="flex items-center gap-1.5 mt-2">
                <AlertCircle className="w-3.5 h-3.5 text-danger shrink-0" />
                <p className="text-xs text-danger">{amountValidation.error}</p>
              </div>
            )}
          </div>

          {/* ── Summary rows ── */}
          <div className="space-y-3 pt-1">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted">You'll receive</span>
              <span className="text-sm text-primary font-medium">
                {formatCurr(actualWithdrawAmount)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted">Free Collateral</span>
              <div className="text-sm font-medium text-primary flex items-center gap-2">
                <span className="text-secondary">{formatCurr(freeCollateralBefore)}</span>
                <span className="text-muted">→</span>
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
                <span className="text-muted">→</span>
                <span>{formatCurr(equityAfter)}</span>
              </div>
            </div>

            {/* ── Gas fee row — informational only ────*/}
            <div className="flex justify-between items-center border-t border-color pt-3">
              <div className="flex items-center gap-1.5">
                <Fuel className="w-3.5 h-3.5 text-muted" />
                <span className="text-sm text-muted">Network Fee</span>
              </div>
              <span className="text-sm text-secondary">
                ~${ESTIMATED_GAS_FEE_USDC.toFixed(4)} USDC
              </span>
            </div>
          </div>

          {/* ── Error banner ── */}
          {withdrawError && (
            <div className="p-3 bg-danger-bg border border-danger rounded-xl flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-danger shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-danger font-medium mb-0.5">Transaction failed</p>
                <p className="text-xs text-danger/80">{withdrawError}</p>
                {errorRetryable && (
                  <button
                    onClick={handleWithdraw}
                    className="mt-2 text-xs text-brand underline hover:no-underline"
                  >
                    Try again
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── Success block ─ */}
          {success && (
            <div className="flex flex-col items-center text-center gap-3 py-4">
              <div className="w-12 h-12 rounded-full bg-success-bg flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-success" />
              </div>
              <div>
                <div className="text-base font-semibold text-primary mb-0.5">
                  Withdrawal Submitted!
                </div>
                {withdrawnAmount && (
                  <div className="text-sm text-muted">
                    ${withdrawnAmount.toFixed(2)} USDC is on its way
                  </div>
                )}
              </div>
              {withdrawTxHash && (
                <a
                  href={`https://www.mintscan.io/dydx/txs/${withdrawTxHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-brand hover:underline"
                >
                  View transaction <ExternalLink className="w-3 h-3" />
                </a>
              )}
              <div className="flex gap-2 w-full">
                <button
                  onClick={() => {
                    reset();
                    setSuccess(false);
                    setAmount('');
                  }}
                  className="flex-1 py-2.5 border border-color rounded-xl text-sm font-medium text-primary hover:bg-hover transition-colors"
                >
                  Withdraw Again
                </button>
                <button
                  onClick={onClose}
                  className="flex-1 py-2.5 btn btn-primary rounded-xl text-sm font-semibold"
                >
                  Close
                </button>
              </div>
            </div>
          )}

          {!success && (
            <button
              onClick={handleWithdraw}
              disabled={isWithdrawing || !amountValidation.valid || !evmAddress}
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
          )}

          <div className="h-2" />
        </div>
      </div>
    </div>
  );
};