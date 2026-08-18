import {
  Activity,
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Copy,
  ExternalLink,
  // Fuel,
  Loader2,
  RefreshCw,
  X,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useWalletStore } from '../../walletconnect/store/walletConnectStore';
import { useDydxWithdraw } from '../hooks/useDydxWithdraw';
import { useSubaccounts } from '../hooks/useSubaccounts';
import {
  getCurrentWithdrawTx,
  useCurrentWithdrawTx,
  useHasActivePendingDeposit,
  useHasActivePendingWithdraw,
  useTransactionStore,
  useTransactionTracker,
} from '../hooks/useTransactionTracker';
import { SUBACCOUNT_CONSTANTS } from '../types/trading.types';
import { validateWithdrawAmount } from '../utils/inputValidation';
import { TransactionTracker } from './TransactionTracker';

// import { NATIVE_WALLET_GAS_RESERVE_UUSDC } from '../utils/skipBridgeUtils';

interface DydxWithdrawModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// const ESTIMATED_GAS_FEE_USDC = NATIVE_WALLET_GAS_RESERVE_UUSDC / 1e6;

const formatCurr = (val: number) => `$${val.toFixed(2)}`;
const formatPct = (val: number) => `${val.toFixed(2)}%`;

const ModalShell: React.FC<{
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}> = ({ onClose, children, className }) => (
  <div
    className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center sm:p-4"
    onClick={e => {
      if (e.target === e.currentTarget) onClose();
    }}
  >
    <div
      className={[
        'bg-secondary w-full sm:max-w-[440px]',
        'rounded-t-2xl sm:rounded-2xl',
        'border border-color shadow-2xl font-sans',
        'flex flex-col',
        'max-h-[90dvh] sm:max-h-[680px] overflow-hidden',
        className,
      ].join(' ')}
    >
      {children}
    </div>
  </div>
);

const AUTO_CLEAR_DELAY_MS = 10_000;

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
    bridgeTxHash: liveBridgeTxHash,
    bridgeTxChainId: liveBridgeChainId,
    errorRetryable,
    nobleBalance,
  } = useDydxWithdraw();
  const store = useTransactionStore();
  const depositIsPending = useHasActivePendingDeposit();
  const withdrawIsPending = useHasActivePendingWithdraw();
  const isWithdrawLocked = depositIsPending || withdrawIsPending;

  const [fromSubaccount, setFromSubaccount] = useState<any>(
    SUBACCOUNT_CONSTANTS.DEFAULT_CROSS_SUBACCOUNT
  );
  const [amount, setAmount] = useState('');
  const [success, setSuccess] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  const [showProgress, setShowProgress] = useState<boolean>(() => {
    const tx = getCurrentWithdrawTx();
    return !!tx && !tx.isAcknowledged;
  });

  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      wasOpenRef.current = false;
      if (!isWithdrawing) {
        setAmount('');
        setSuccess(false);
        setShowProgress(false);
        clearWithdrawError();
        setFromSubaccount(SUBACCOUNT_CONSTANTS.DEFAULT_CROSS_SUBACCOUNT);

        const tx = getCurrentWithdrawTx();
        if (tx && (tx.status === 'success' || tx.status === 'failed')) {
          useTransactionStore.getState().clearWithdrawTx();
        }
        reset();
      }
      return;
    }
    if (wasOpenRef.current) return;
    wasOpenRef.current = true;

    const tx = getCurrentWithdrawTx();
    const shouldShowProgress = tx && !tx.isAcknowledged;
    setShowProgress(!!shouldShowProgress);

    if (!shouldShowProgress && !isWithdrawing) {
      setAmount('');
      setSuccess(false);
      clearWithdrawError();
      setFromSubaccount(SUBACCOUNT_CONSTANTS.DEFAULT_CROSS_SUBACCOUNT);
    }
  }, [isOpen, isWithdrawing, reset, clearWithdrawError]);

  const bridgeTracker = useTransactionTracker('withdraw');
  const trackerTxHash = bridgeTracker.txHash;
  const trackerChainId = bridgeTracker.chainId;

  const currentWithdrawTx = useCurrentWithdrawTx();
  const persistedTx = currentWithdrawTx;

  const activeAmount = isWithdrawing ? amount : (persistedTx?.amount ?? '');

  const autoClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!bridgeTracker.isTerminal || !getCurrentWithdrawTx()) return;

    autoClearRef.current = setTimeout(() => {
      bridgeTracker.acknowledge();
      setShowProgress(false); // Return to form step
    }, AUTO_CLEAR_DELAY_MS);

    return () => {
      if (autoClearRef.current) clearTimeout(autoClearRef.current);
    };
  }, [bridgeTracker.isTerminal, currentWithdrawTx]);

  const amountRef = useRef(amount);
  useEffect(() => {
    amountRef.current = amount;
  }, [amount]);

  useEffect(() => {
    if (!isWithdrawing) return;

    const currentWallets = useWalletStore.getState().connectedWallets;
    const requiredWallets = {
      evm: currentWallets.evm?.address,
      dydx: currentWallets.evm?.dydxAddress,
    };

    store.setWithdrawTx({
      status: 'pending',
      startedAt: persistedTx?.startedAt ?? Date.now(),
      txHash: liveBridgeTxHash ?? persistedTx?.txHash ?? null,
      chainId: liveBridgeChainId ?? persistedTx?.chainId ?? null,
      amount: amountRef.current,
      stepLabel,
      isPreBridge: !liveBridgeTxHash,
      requiredWallets,
    });
  }, [isWithdrawing, step, stepLabel, liveBridgeTxHash, liveBridgeChainId]);

  useEffect(() => {
    if (!bridgeTracker.isTerminal || !currentWithdrawTx) return;
    store.setWithdrawTx({
      ...currentWithdrawTx,
      status: bridgeTracker.overallState === 'STATE_COMPLETED_SUCCESS' ? 'success' : 'failed',
    });
  }, [bridgeTracker.isTerminal, bridgeTracker.overallState]);

  useEffect(() => {
    if (isWithdrawing) setShowProgress(true);
  }, [isWithdrawing]);

  const sourceBalance = useMemo(() => {
    if (fromSubaccount === SUBACCOUNT_CONSTANTS.DEFAULT_CROSS_SUBACCOUNT && crossSubaccount)
      return parseFloat(crossSubaccount.freeCollateral);
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

  const handleSetMax = () => setAmount(Math.max(0, sourceBalance - 0.01).toFixed(6));

  const handleWithdraw = useCallback(async () => {
    if (!amountValidation.valid) return;
    clearWithdrawError();
    setSuccess(false);
    const currentWallets = useWalletStore.getState().connectedWallets;
    const requiredWallets = {
      evm: currentWallets.evm?.address,
      dydx: currentWallets.evm?.dydxAddress,
    };

    store.setWithdrawTx({
      txHash: null,
      chainId: null,
      startedAt: Date.now(),
      status: 'pending',
      amount: amountValue.toString(),
      isPreBridge: true,
      requiredWallets,
    });

    const result = await withdraw(amountValue.toString(), fromSubaccount, evmAddress);
    if (result.success) {
      setSuccess(true);
    } else {
      store.clearWithdrawTx();
    }
  }, [
    amountValidation.valid,
    withdraw,
    amountValue,
    fromSubaccount,
    evmAddress,
    clearWithdrawError,
    store,
  ]);

  const handleDismissProgress = useCallback(() => {
    if (isWithdrawing) return;
    bridgeTracker.acknowledge();
    reset();
    setSuccess(false);
    setAmount('');
    setShowProgress(false);
  }, [isWithdrawing, reset, bridgeTracker]);

  const handleForceClear = useCallback(() => {
    if (
      confirm(
        "Are you sure you want to clear this transaction? This won't cancel the on-chain transfer, but will let you initiate a new one."
      )
    ) {
      bridgeTracker.acknowledge();
      reset();
      setSuccess(false);
      setAmount('');
      setShowProgress(false);
      store.clearWithdrawTx();
    }
  }, [bridgeTracker, reset, store]);

  const renderStepper = () => {
    let step1Status: 'pending' | 'active' | 'completed' | 'error' = 'pending';
    let step2Status: 'pending' | 'active' | 'completed' | 'error' = 'pending';
    let step3Status: 'pending' | 'active' | 'completed' | 'error' = 'pending';

    const isStep1Active = ['checking_gas', 'transferring_to_main', 'signing'].includes(step);
    const isStep2Active = ['ibc_to_noble', 'waiting_noble'].includes(step);
    const isStep3Active = ['bridging', 'pending'].includes(step) || !!trackerTxHash;

    const isStep1Done =
      ['ibc_to_noble', 'waiting_noble', 'bridging', 'pending', 'success'].includes(step) ||
      !!trackerTxHash;
    const isStep2Done = ['bridging', 'pending', 'success'].includes(step) || !!trackerTxHash;
    const isStep3Done =
      step === 'success' || bridgeTracker.overallState === 'STATE_COMPLETED_SUCCESS';

    if (isStep3Done) {
      step1Status = 'completed';
      step2Status = 'completed';
      step3Status = 'completed';
    } else if (step === 'error' || bridgeTracker.isError) {
      if (
        isStep1Active ||
        step === 'checking_gas' ||
        step === 'transferring_to_main' ||
        step === 'signing'
      ) {
        step1Status = 'error';
      } else if (isStep2Active || step === 'ibc_to_noble' || step === 'waiting_noble') {
        step1Status = 'completed';
        step2Status = 'error';
      } else {
        step1Status = 'completed';
        step2Status = 'completed';
        step3Status = 'error';
      }
    } else {
      if (isStep1Done) {
        step1Status = 'completed';
      } else if (isStep1Active) {
        step1Status = 'active';
      }

      if (isStep2Done) {
        step2Status = 'completed';
      } else if (isStep2Active) {
        step2Status = 'active';
      }

      if (isStep3Done) {
        step3Status = 'completed';
      } else if (isStep3Active) {
        step3Status = 'active';
      }
    }

    const steps = [
      {
        id: 1,
        title: 'Settle on dYdX',
        desc: 'Sign the transaction and withdraw funds from your dYdX subaccount to your native wallet.',
        status: step1Status,
      },
      {
        id: 2,
        title: 'Transfer to Noble',
        desc: `Send USDC via IBC from dYdX to Noble chain. Noble Balance: ${nobleBalance ? (nobleBalance / 1e6).toFixed(2) : '0.00'} USDC.`,
        status: step2Status,
      },
      {
        id: 3,
        title: 'Bridge to Destination',
        desc: 'Bridge USDC from Noble to Ethereum/EVM via CCTP/Skip bridge.',
        status: step3Status,
      },
    ];

    return (
      <div className="space-y-6 my-2">
        {steps.map((s, idx) => {
          const isActive = s.status === 'active';
          const isDone = s.status === 'completed';
          const isErr = s.status === 'error';
          const isLast = idx === steps.length - 1;

          return (
            <div key={s.id} className="relative flex gap-4">
              {!isLast && (
                <div
                  className={`absolute left-[15px] top-8 bottom-[-24px] w-[2px] transition-all duration-500 ${
                    isDone ? 'bg-brand' : 'bg-white/10'
                  }`}
                />
              )}

              <div className="shrink-0 z-10">
                <div
                  className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${
                    isActive
                      ? 'border-brand bg-brand/20 shadow-[0_0_12px_rgba(var(--brand-rgb),0.4)] scale-105'
                      : isDone
                        ? 'border-brand bg-brand text-white'
                        : isErr
                          ? 'border-danger bg-danger/20 text-danger'
                          : 'border-white/10 bg-secondary text-muted opacity-40'
                  }`}
                >
                  {isActive ? (
                    <Loader2 className="w-4 h-4 text-brand animate-spin" />
                  ) : isDone ? (
                    <Check className="w-4 h-4 text-white" />
                  ) : isErr ? (
                    <X className="w-4 h-4 text-danger" />
                  ) : (
                    <span className="text-xs font-bold">{s.id}</span>
                  )}
                </div>
              </div>

              <div
                className={`flex-1 pb-4 transition-opacity duration-300 ${!isActive && !isDone ? 'opacity-40' : 'opacity-100'}`}
              >
                <h4 className="text-sm font-bold text-primary">{s.title}</h4>
                <p className="text-xs text-muted mt-0.5 leading-relaxed">{s.desc}</p>

                {s.id === 3 && trackerTxHash && trackerChainId && (
                  <div className="mt-4 border border-color rounded-xl p-4 bg-tertiary/50 animate-in fade-in duration-500">
                    <TransactionTracker
                      txHash={trackerTxHash}
                      chainId={trackerChainId}
                      overallState={bridgeTracker.overallState}
                      steps={bridgeTracker.steps}
                      activeStepIndex={bridgeTracker.activeStepIndex}
                      assetRelease={bridgeTracker.assetRelease}
                      isLoading={bridgeTracker.isLoading}
                      isError={bridgeTracker.isError}
                      errorMessage={bridgeTracker.errorMessage}
                    />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  if (!isOpen) return null;
  if (showProgress || isWithdrawing) {
    const elapsedMinutes = persistedTx
      ? Math.floor((Date.now() - persistedTx.startedAt) / 60_000)
      : 0;

    const bridgeIsTerminal = bridgeTracker.isTerminal;
    const bridgeSucceeded =
      bridgeTracker.overallState === 'STATE_COMPLETED_SUCCESS' || persistedTx?.status === 'success';

    return (
      <ModalShell onClose={onClose} className="min-h-[500px] sm:min-h-[580px]">
        <div className="flex items-center justify-between px-5 pt-5 pb-4 shrink-0 border-b border-color">
          <div className="flex items-center gap-2.5">
            {isWithdrawing || (!bridgeIsTerminal && trackerTxHash) ? (
              <Loader2 className="w-4 h-4 text-brand animate-spin" />
            ) : bridgeSucceeded ? (
              <CheckCircle2 className="w-4 h-4 text-success" />
            ) : (
              <Clock className="w-4 h-4 text-brand" />
            )}
            <h3 className="text-base font-semibold text-primary">Transfer Status</h3>
          </div>
          <div className="flex items-center gap-2">
            {trackerTxHash && bridgeTracker.isTerminal && (
              <button
                onClick={bridgeTracker.refresh}
                className="p-1.5 text-muted hover:text-primary transition-colors rounded-lg hover:bg-hover"
                title="Refresh status"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 text-muted hover:text-primary transition-colors rounded-lg hover:bg-hover"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-5 flex flex-col gap-4">
          {/* Large Amount Display */}
          <div className="flex flex-col items-center justify-center py-6 border-b border-color/40">
            <div className="text-3xl font-black text-primary flex items-center gap-2 font-mono">
              ${parseFloat(activeAmount || amount || '0').toFixed(2)}
              <span className="text-sm font-bold text-muted uppercase">USDC</span>
            </div>
            <div className="text-xs text-muted mt-1.5 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse inline-block" />
              dYdX Withdrawal
            </div>
          </div>

          {/* Stepper Checklist */}
          {renderStepper()}

          {/* Fallback info when tracker not started yet */}
          {!trackerTxHash && !isWithdrawing && persistedTx && !bridgeSucceeded && (
            <div className="flex items-start gap-4 p-4 bg-brand/5 border border-brand/20 rounded-2xl animate-in fade-in">
              <AlertCircle className="w-5 h-5 text-brand flex-shrink-0" />
              <div>
                <div className="text-xs font-black text-brand uppercase tracking-wider mb-1">
                  Status Update
                </div>
                <div className="text-[11px] font-bold text-muted leading-relaxed">
                  Your dYdX → Noble transfer was initiated. If progress doesn't appear soon, check{' '}
                  <a
                    href="https://www.mintscan.io/dydx"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand hover:underline inline-flex items-center gap-1"
                  >
                    Mintscan <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            </div>
          )}

          {!bridgeTracker.hasPolledOnce && trackerTxHash && !bridgeIsTerminal && (
            <div className="flex items-center gap-3 py-3 px-4 rounded-xl bg-brand/5 border border-brand/20">
              <Loader2 className="w-4 h-4 text-brand animate-spin flex-shrink-0" />
              <div className="text-sm text-muted">
                Waiting for Skip to index the bridge transaction…
              </div>
            </div>
          )}

          {bridgeTracker.isError && !isWithdrawing && trackerTxHash && (
            <button
              onClick={bridgeTracker.refresh}
              className="w-full py-2.5 rounded-xl border border-color text-sm text-muted hover:text-primary hover:bg-hover transition-colors flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh bridge status
            </button>
          )}

          {!isWithdrawing && elapsedMinutes > 0 && !bridgeIsTerminal && (
            <div className="flex items-center gap-2 text-xs text-muted bg-tertiary border border-color rounded-lg px-3 py-2">
              <Clock className="w-3.5 h-3.5 shrink-0" />
              Started {elapsedMinutes} minute{elapsedMinutes !== 1 ? 's' : ''} ago — may still be
              processing on-chain.
            </div>
          )}

          {/* Error Details */}
          {(withdrawError || (bridgeTracker.isError && bridgeTracker.errorMessage)) && (
            <div className="p-3 bg-danger/10 border border-danger/20 rounded-xl flex items-start gap-2 animate-in fade-in duration-300">
              <AlertTriangle className="w-4 h-4 text-danger shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-xs font-black text-danger uppercase mb-1">Error Details</p>
                <p className="text-[11px] font-bold text-danger/80 break-words">
                  {withdrawError || bridgeTracker.errorMessage}
                </p>
              </div>
            </div>
          )}

          {!bridgeIsTerminal && (
            <p className="text-[11px] text-muted text-center leading-relaxed mt-4">
              dYdX → Noble → Ethereum · typically 3–10 min · safe to close
            </p>
          )}

          {/* Actions */}
          <div className="mt-auto pt-4 space-y-2">
            {bridgeTracker.isTerminal || step === 'success' || step === 'error' ? (
              <button
                onClick={handleDismissProgress}
                className="w-full py-3 btn btn-primary rounded-xl font-semibold text-[15px]"
              >
                {bridgeSucceeded ? 'Done' : 'Dismiss & Retry'}
              </button>
            ) : (
              <button
                onClick={onClose}
                className="w-full py-3 rounded-xl border border-color text-sm text-muted hover:text-primary hover:bg-hover transition-colors font-medium"
              >
                Close Modal
              </button>
            )}

            {/* Clear Stuck Transaction */}
            <button
              onClick={handleForceClear}
              className="w-full py-2.5 rounded-xl border border-color text-xs text-muted hover:text-danger hover:bg-danger/5 transition-colors font-semibold"
            >
              Clear Stated Transaction
            </button>
          </div>
        </div>
      </ModalShell>
    );
  }
  return (
    <ModalShell onClose={onClose}>
      <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0 border-b border-color">
        <h3 className="text-xl font-medium text-primary">Withdraw</h3>
        <button
          onClick={onClose}
          className="p-1.5 text-muted hover:text-primary transition-colors rounded-lg hover:bg-hover"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="overflow-y-auto flex-1 px-5 py-5 space-y-4">
        {depositIsPending && (
          <div className="flex items-start gap-3 p-3 bg-danger/10 border border-danger/20 rounded-xl">
            <Activity className="w-4 h-4 text-danger flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-danger">Deposit in progress</div>
              <div className="text-xs text-danger/80 mt-0.5">
                You cannot withdraw while a deposit is processing. Please wait for it to complete.
              </div>
            </div>
          </div>
        )}

        {withdrawIsPending && !depositIsPending && (
          <div className="flex items-start gap-3 p-3 bg-brand/5 border border-brand/20 rounded-xl">
            <Loader2 className="w-4 h-4 text-brand animate-spin flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-primary">Withdrawal in progress</div>
              <div className="text-xs text-muted mt-0.5">
                Your previous withdrawal is still processing.
              </div>
            </div>
          </div>
        )}

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
                src="https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png"
                alt="ETH"
                className="w-4 h-4"
              />
              <span className="text-sm font-medium text-primary">Ethereum</span>
              <ChevronRight className="w-4 h-4 text-muted" />
            </button>
          </div>
        </div>

        {/* Amount input */}
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

        {/* Summary */}
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
            <span className="text-sm text-primary font-medium">{formatPct(marginUsageAfter)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted">Equity</span>
            <div className="text-sm font-medium text-primary flex items-center gap-2">
              <span className="text-secondary">{formatCurr(equityBefore)}</span>
              <span className="text-muted">→</span>
              <span>{formatCurr(equityAfter)}</span>
            </div>
          </div>
          {/* <div className="flex justify-between items-center border-t border-color pt-3">
            <div className="flex items-center gap-1.5">
              <Fuel className="w-3.5 h-3.5 text-muted" />
              <span className="text-sm text-muted">Network Fee</span>
            </div>
            <span className="text-sm text-secondary">~${ESTIMATED_GAS_FEE_USDC.toFixed(4)} USDC</span>
          </div> */}
        </div>

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
                href={`https://www.mintscan.io/noble/tx/${withdrawTxHash}`}
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
                  bridgeTracker.acknowledge();
                }}
                className="flex-1 py-2.5 border border-color rounded-xl text-sm font-medium text-primary hover:bg-hover transition-colors"
              >
                Withdraw Again
              </button>
              <button
                onClick={() => {
                  bridgeTracker.acknowledge();
                  onClose();
                }}
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
            disabled={isWithdrawing || !amountValidation.valid || !evmAddress || isWithdrawLocked}
            className="w-full py-3.5 btn btn-primary rounded-xl font-medium text-[15px] transition-all bg-brand text-white hover:opacity-90 disabled:bg-hover disabled:text-muted disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
          >
            {isWithdrawing ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                {stepLabel}
              </>
            ) : isWithdrawLocked ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Transfer in progress…
              </>
            ) : (
              'Withdraw'
            )}
          </button>
        )}
      </div>
    </ModalShell>
  );
};
