import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Clock,
  Copy,
  ExternalLink,
  Fuel,
  Loader2,
  RefreshCw,
  X,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useWalletStore } from '../../walletconnect/store/walletConnectStore';
import { useDydxWithdraw } from '../hooks/useDydxWithdraw';
import { useSubaccounts } from '../hooks/useSubaccounts';
import {
  getIsWithdrawPending,
  useHasActivePendingDeposit,
  useHasActivePendingWithdraw,
  useTransactionStore,
  useTransactionTracker,
} from '../hooks/useTransactionTracker';
import { TransactionTracker } from './TransactionTracker';
import { SUBACCOUNT_CONSTANTS } from '../types/trading.types';
import { validateWithdrawAmount } from '../utils/inputValidation';
import { NATIVE_WALLET_GAS_RESERVE_UUSDC } from '../utils/skipBridgeUtils';

interface DydxWithdrawModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ESTIMATED_GAS_FEE_USDC = NATIVE_WALLET_GAS_RESERVE_UUSDC / 1e6;

const formatCurr = (val: number) => `$${val.toFixed(2)}`;
const formatPct = (val: number) => `${val.toFixed(2)}%`;

const STEPS = [
  { key: 'checking_gas', label: 'Prepare', sublabel: 'Gas & validation' },
  { key: 'signing', label: 'Sign', sublabel: 'Settle on dYdX' },
  { key: 'ibc_to_noble', label: 'Noble', sublabel: 'IBC transfer' },
  { key: 'waiting_noble', label: 'Confirm', sublabel: 'Noble chain' },
  { key: 'bridging', label: 'Bridge', sublabel: 'Reach Ethereum' },
] as const;

const ROUTE = ['dYdX', 'Noble', 'Ethereum'] as const;

const StepTracker: React.FC<{ currentStep: string; isActive: boolean }> = ({
  currentStep,
  isActive,
}) => {
  const stepKeys = STEPS.map((s) => s.key);
  const currentIdx = stepKeys.indexOf(currentStep as (typeof stepKeys)[number]);
  const fillPct = currentIdx < 0 ? 0 : (currentIdx / (STEPS.length - 1)) * 100;

  return (
    <div className="w-full">
      <div className="relative pb-10">
        <div className="absolute top-[18px] left-[10%] right-[10%] h-[2px] bg-color rounded-full z-0" />
        <div
          className="absolute top-[18px] left-[10%] h-[2px] bg-brand rounded-full z-0 transition-all duration-700 ease-out"
          style={{ width: `${fillPct * 0.8}%` }}
        />
        <div className="relative z-10 flex justify-between">
          {STEPS.map((s, i) => {
            const isPast = currentIdx > i;
            const isCurrent = currentIdx === i;
            return (
              <div
                key={s.key}
                className="flex flex-col items-center gap-2"
                style={{ width: `${100 / STEPS.length}%` }}
              >
                <div
                  className={[
                    'w-9 h-9 rounded-full flex items-center justify-center border-2 transition-all duration-500',
                    isPast
                      ? 'bg-brand border-brand'
                      : isCurrent
                        ? 'bg-secondary border-brand'
                        : 'bg-secondary border-color',
                  ].join(' ')}
                  style={isCurrent ? { boxShadow: '0 0 0 4px rgba(99,102,241,0.15)' } : undefined}
                >
                  {isPast ? (
                    <svg className="w-[14px] h-[14px] text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : isCurrent && isActive ? (
                    <Loader2 className="w-[14px] h-[14px] text-brand animate-spin" />
                  ) : (
                    <span className={`text-[11px] font-semibold ${i > currentIdx ? 'text-muted' : 'text-brand'}`}>
                      {i + 1}
                    </span>
                  )}
                </div>
                <div className="text-center px-0.5">
                  <div className={`text-[11px] font-semibold leading-none mb-0.5 ${isCurrent ? 'text-brand' : isPast ? 'text-secondary' : 'text-muted'}`}>
                    {s.label}
                  </div>
                  <div className="text-[10px] text-muted leading-none hidden sm:block opacity-70">
                    {s.sublabel}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const RoutePill: React.FC = () => (
  <div className="flex items-center gap-1.5 text-[11px] text-muted bg-secondary border border-color rounded-full px-3 py-1.5 w-fit mx-auto">
    {ROUTE.map((chain, i) => (
      <React.Fragment key={chain}>
        <span className={i === 0 ? 'text-secondary font-medium' : i === ROUTE.length - 1 ? 'text-brand font-medium' : ''}>
          {chain}
        </span>
        {i < ROUTE.length - 1 && <ArrowRight className="w-2.5 h-2.5 opacity-40" />}
      </React.Fragment>
    ))}
  </div>
);

const ModalShell: React.FC<{ onClose: () => void; children: React.ReactNode }> = ({ onClose, children }) => (
  <div
    className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center sm:p-4"
    onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
  >
    <div className={[
      'bg-secondary w-full sm:max-w-[440px]',
      'rounded-t-2xl sm:rounded-2xl',
      'border border-color shadow-2xl font-sans',
      'flex flex-col',
      'max-h-[90dvh] sm:max-h-[680px]',
    ].join(' ')}>
      {children}
    </div>
  </div>
);

export const DydxWithdrawModal: React.FC<DydxWithdrawModalProps> = ({ isOpen, onClose }) => {
  const { childSubaccounts, crossSubaccount, totalEquity, totalFreeCollateral: globalFreeCollateral } =
    useSubaccounts();

  const evmWallet = useWalletStore((state) => state.connectedWallets.evm);
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


  const bridgeTracker = useTransactionTracker('withdraw');
  const trackerTxHash = bridgeTracker.txHash;
  const trackerChainId = bridgeTracker.chainId;

  const persistedTx = store.withdrawTx;

  const activeStepLabel = isWithdrawing ? stepLabel : (persistedTx?.stepLabel ?? '');
  const activeAmount = isWithdrawing ? amount : (persistedTx?.amount ?? '');


  const isPostRefreshBridgePhase =
    !isWithdrawing &&
    !!persistedTx &&
    !persistedTx.isPreBridge &&
    !!persistedTx.txHash;


  const [showProgress, setShowProgress] = useState<boolean>(() => getIsWithdrawPending());

  const wasOpenRef = useRef(false);

  const amountRef = useRef(amount);
  useEffect(() => { amountRef.current = amount; }, [amount]);

  useEffect(() => {
    if (!isWithdrawing) return;

    store.setWithdrawTx({
      status: 'pending',
      startedAt: persistedTx?.startedAt ?? Date.now(),
      txHash: liveBridgeTxHash ?? persistedTx?.txHash ?? null,
      chainId: liveBridgeChainId ?? persistedTx?.chainId ?? null,
      amount: amountRef.current,
      stepLabel,
      isPreBridge: !liveBridgeTxHash,
    });
  }, [isWithdrawing, step, stepLabel, liveBridgeTxHash, liveBridgeChainId]);


  useEffect(() => {
    if (!bridgeTracker.isTerminal || !store.withdrawTx) return;
    store.setWithdrawTx({
      ...store.withdrawTx,
      status: bridgeTracker.overallState === 'STATE_COMPLETED_SUCCESS' ? 'success' : 'failed',
    });
  }, [bridgeTracker.isTerminal, bridgeTracker.overallState]);

  useEffect(() => {
    if (!isOpen) {
      wasOpenRef.current = false;
      if (!isWithdrawing) {
        setAmount('');
        setSuccess(false);
        clearWithdrawError();
        setFromSubaccount(SUBACCOUNT_CONSTANTS.DEFAULT_CROSS_SUBACCOUNT);
      }
      return;
    }

    if (wasOpenRef.current) return;
    wasOpenRef.current = true;

    const shouldShowProgress = getIsWithdrawPending();
    setShowProgress(shouldShowProgress);

    if (!shouldShowProgress && !isWithdrawing) {
      setAmount('');
      setSuccess(false);
      clearWithdrawError();
      setFromSubaccount(SUBACCOUNT_CONSTANTS.DEFAULT_CROSS_SUBACCOUNT);
    }
  }, [isOpen, isWithdrawing, clearWithdrawError]);

  useEffect(() => {
    if (isWithdrawing) setShowProgress(true);
  }, [isWithdrawing]);


  const sourceBalance = useMemo(() => {
    if (fromSubaccount === SUBACCOUNT_CONSTANTS.DEFAULT_CROSS_SUBACCOUNT && crossSubaccount)
      return parseFloat(crossSubaccount.freeCollateral);
    const source = childSubaccounts.find((c) => c.subaccountNumber === fromSubaccount);
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
  const marginUsageAfter = equityAfter > 0 ? ((equityBefore - globalFreeCol) / equityAfter) * 100 : 0;

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
    store.setWithdrawTx({
      txHash: null,
      chainId: null,
      startedAt: Date.now(),
      status: 'pending',
      amount: amountValue.toString(),
      isPreBridge: true,
    });

    const result = await withdraw(amountValue.toString(), fromSubaccount, evmAddress);
    if (result.success) {
      setSuccess(true);
    } else {
      store.clearWithdrawTx();
    }
  }, [amountValidation.valid, withdraw, amountValue, fromSubaccount, evmAddress, clearWithdrawError, store]);

  const handleDismissProgress = useCallback(() => {
    if (isWithdrawing) return;
    store.clearWithdrawTx();
    reset();
    setSuccess(false);
    setAmount('');
    setShowProgress(false);
  }, [isWithdrawing, reset, store]);

  if (!isOpen) return null;
  if (showProgress || isWithdrawing) {
    const elapsedMinutes = persistedTx
      ? Math.floor((Date.now() - persistedTx.startedAt) / 60_000)
      : 0;

    const bridgeIsTerminal = bridgeTracker.isTerminal;
    const bridgeSucceeded =
      bridgeTracker.overallState === 'STATE_COMPLETED_SUCCESS' ||
      persistedTx?.status === 'success';
    const bridgeFailed =
      bridgeTracker.overallState === 'STATE_COMPLETED_ERROR' ||
      bridgeTracker.overallState === 'STATE_ABANDONED' ||
      persistedTx?.status === 'failed';

    return (
      <ModalShell onClose={onClose}>
        <div className="flex items-center justify-between px-5 pt-5 pb-4 shrink-0 border-b border-color">
          <div className="flex items-center gap-2.5">
            {isWithdrawing
              ? <Loader2 className="w-4 h-4 text-brand animate-spin" />
              : bridgeSucceeded
                ? <CheckCircle2 className="w-4 h-4 text-success" />
                : <Clock className="w-4 h-4 text-brand" />}
            <h3 className="text-base font-semibold text-primary">
              {bridgeSucceeded ? 'Withdrawal Complete' : 'Withdrawal In Progress'}
            </h3>
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
          <div className="rounded-xl border border-color bg-tertiary p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-xs text-muted mb-0.5">Withdrawing</div>
                <div className="text-2xl font-bold text-primary tracking-tight">
                  ${parseFloat(activeAmount || '0').toFixed(2)}
                  <span className="text-sm font-normal text-muted ml-1.5">USDC</span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-muted mb-0.5">Status</div>
                <div
                  className={`text-xs font-semibold px-2 py-0.5 rounded-full inline-flex items-center gap-1.5 ${bridgeSucceeded
                    ? 'bg-success-bg text-success'
                    : bridgeFailed
                      ? 'bg-danger-bg text-danger'
                      : 'bg-brand/10 text-brand'
                    }`}
                >
                  {(isWithdrawing || (!bridgeIsTerminal && trackerTxHash)) && (
                    <span className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse inline-block shrink-0" />
                  )}
                  {bridgeSucceeded
                    ? 'Completed'
                    : bridgeFailed
                      ? 'Failed'
                      : activeStepLabel || 'Processing…'}
                </div>
              </div>
            </div>
            <RoutePill />
          </div>

          {(isWithdrawing || (persistedTx && !isPostRefreshBridgePhase)) && !bridgeSucceeded && (
            <div className="rounded-xl border border-color bg-tertiary px-4 pt-4 pb-1">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted mb-3">
                Progress
              </p>
              <StepTracker currentStep={step} isActive={isWithdrawing} />
            </div>
          )}
          {!isWithdrawing && persistedTx && !trackerTxHash && (
            <div className="flex items-start gap-3 p-3 bg-brand/5 border border-brand/20 rounded-xl">
              <AlertCircle className="w-4 h-4 text-brand flex-shrink-0 mt-0.5" />
              <div>
                <div className="text-sm font-semibold text-primary mb-0.5">
                  Withdrawal was in progress
                </div>
                <div className="text-xs text-muted leading-relaxed">
                  You closed or refreshed during the dYdX → Noble transfer. The transaction may
                  have completed on-chain. Check{' '}
                  <a
                    href="https://www.mintscan.io/dydx"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand hover:underline inline-flex items-center gap-0.5"
                  >
                    Mintscan <ExternalLink className="w-3 h-3" />
                  </a>{' '}
                  to verify, then use the button below if funds arrived on Noble.
                </div>
              </div>
            </div>
          )}

          {/* Skip bridge tracker */}
          {trackerTxHash && trackerChainId && (
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
          )}

          {!bridgeTracker.hasPolledOnce && trackerTxHash && (
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
              Started {elapsedMinutes} minute{elapsedMinutes !== 1 ? 's' : ''} ago — may still be processing on-chain.
            </div>
          )}

          {withdrawError && (
            <div className="p-3 bg-danger-bg border border-danger rounded-xl flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-danger shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-danger font-medium mb-0.5">
                  {step === 'error' ? 'Withdrawal failed' : 'Error'}
                </p>
                <p className="text-xs text-danger/80">{withdrawError}</p>
              </div>
            </div>
          )}

          <p className="text-[11px] text-muted text-center leading-relaxed">
            dYdX → Noble → Ethereum · typically 3–10 min · safe to close
          </p>

          {bridgeSucceeded && (
            <div className="flex flex-col items-center text-center gap-3 py-2">
              <div className="w-12 h-12 rounded-full bg-success-bg flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-success" />
              </div>
              <div>
                <div className="text-base font-semibold text-primary mb-0.5">Funds Arrived!</div>
                <div className="text-sm text-muted">
                  ${parseFloat(activeAmount || '0').toFixed(2)} USDC is in your EVM wallet
                </div>
              </div>
            </div>
          )}

          {!isWithdrawing && (bridgeIsTerminal || !trackerTxHash) && (
            <button
              onClick={handleDismissProgress}
              className="w-full py-3 btn btn-primary rounded-xl font-semibold text-[15px]"
            >
              {bridgeSucceeded
                ? 'Done'
                : !trackerTxHash
                  ? 'Check Noble & retry'
                  : 'Dismiss & start new'}
            </button>
          )}

          {!isWithdrawing && trackerTxHash && !bridgeIsTerminal && (
            <button
              onClick={handleDismissProgress}
              className="w-full py-3 rounded-xl border border-color text-sm text-muted hover:text-primary hover:bg-hover transition-colors"
            >
              Start a new withdrawal
            </button>
          )}
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
                <button onClick={handleCopy} className="text-muted hover:text-primary transition-colors">
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
            onChange={(e) => {
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
            <span className="text-sm text-primary font-medium">{formatCurr(actualWithdrawAmount)}</span>
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
          <div className="flex justify-between items-center border-t border-color pt-3">
            <div className="flex items-center gap-1.5">
              <Fuel className="w-3.5 h-3.5 text-muted" />
              <span className="text-sm text-muted">Network Fee</span>
            </div>
            <span className="text-sm text-secondary">~${ESTIMATED_GAS_FEE_USDC.toFixed(4)} USDC</span>
          </div>
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
              <div className="text-base font-semibold text-primary mb-0.5">Withdrawal Submitted!</div>
              {withdrawnAmount && (
                <div className="text-sm text-muted">${withdrawnAmount.toFixed(2)} USDC is on its way</div>
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
                onClick={() => { reset(); setSuccess(false); setAmount(''); store.clearWithdrawTx(); }}
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
            disabled={isWithdrawing || !amountValidation.valid || !evmAddress || isWithdrawLocked}
            className="w-full py-3.5 btn btn-primary rounded-xl font-medium text-[15px] transition-all bg-brand text-white hover:opacity-90 disabled:bg-hover disabled:text-muted disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
          >
            {isWithdrawing ? (
              <><Loader2 className="w-5 h-5 animate-spin" />{stepLabel}</>
            ) : isWithdrawLocked ? (
              <><Loader2 className="w-5 h-5 animate-spin" />Transfer in progress…</>
            ) : (
              'Withdraw'
            )}
          </button>
        )}
      </div>
    </ModalShell>
  );
};