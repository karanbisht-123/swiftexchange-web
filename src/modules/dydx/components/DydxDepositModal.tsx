import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  Clock,
  Info,
  Loader2,
  X,
  Zap,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Tooltip } from '../../../components/common/Tooltip';
import { type Asset, useWalletAssets } from '../../walletconnect/hooks/useWalletAssets';
import { useWalletStore } from '../../walletconnect/store/walletConnectStore';
import { useDydxDeposit } from '../hooks/useDydxDeposit';
import { useSubaccounts } from '../hooks/useSubaccounts';
import {
  clearPendingTx,
  loadPendingTx,
  savePendingTx,
  useTransactionTracker,
} from '../hooks/useTransactionTracker';
import { TransactionTracker } from './TransactionTracker';
import { validateDepositAmount } from '../utils/inputValidation';
import { NATIVE_WALLET_GAS_RESERVE_USD } from '../utils/skipBridgeUtils';

// ─── Types ────────────────────────────────────────────────────────────────────

type ModalStep = 'form' | 'select_token' | 'tracker';

interface DydxDepositModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialAsset?: Asset | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PRIORITY_SYMBOLS = ['USDC', 'USDT', 'ETH'];

const CHAIN_ICONS: Record<string, string> = {
  ETH: 'https://coin-images.coingecko.com/coins/images/279/large/ethereum.png',
  BNB: 'https://tokens.pancakeswap.finance/images/0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c.png',
};

/**
 * The bridge route display: source chain → Noble → dYdX
 * Mirrors the withdrawal modal's RoutePill pattern.
 */
const DEPOSIT_ROUTE = ['Your Wallet', 'Noble', 'dYdX'] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getChainIconUrl = (asset: Asset): string | undefined => {
  if (asset.chainId === 1) return CHAIN_ICONS.ETH;
  if (asset.chainId === 56) return CHAIN_ICONS.BNB;
  if (asset.chainName?.includes('Ethereum')) return CHAIN_ICONS.ETH;
  if (asset.chainName?.includes('BNB')) return CHAIN_ICONS.BNB;
  return undefined;
};

// ─── Sub-components ───────────────────────────────────────────────────────────

const AssetIcon = ({ asset, size = 'md' }: { asset: Asset; size?: 'sm' | 'md' }) => {
  const chainIcon = getChainIconUrl(asset);
  const imgClass = size === 'sm' ? 'w-5 h-5 rounded-full' : 'w-8 h-8 rounded-full';
  const badgeClass = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';
  return (
    <div className="relative shrink-0">
      <img src={asset.image} alt={asset.symbol} className={imgClass} />
      <div
        className={`absolute -bottom-0.5 -right-0.5 ${badgeClass} rounded-full bg-primary border border-color flex items-center justify-center overflow-hidden`}
      >
        {chainIcon ? (
          <img src={chainIcon} alt={asset.chainName} className="w-full h-full rounded-full" />
        ) : (
          <span className="text-[6px] font-bold text-primary leading-none">
            {asset.chainName?.[0] || '?'}
          </span>
        )}
      </div>
    </div>
  );
};

const AssetRow = ({
  asset,
  isSelected,
  onSelect,
}: {
  asset: Asset;
  isSelected: boolean;
  onSelect: (asset: Asset) => void;
}) => {
  const usdValue = (asset.balance || 0) * (asset.current_price || 0);
  return (
    <button
      onClick={() => onSelect(asset)}
      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-colors ${isSelected ? 'bg-brand/10 border border-brand/30' : 'hover:bg-hover'
        }`}
    >
      <div className="flex items-center gap-3">
        <AssetIcon asset={asset} />
        <div className="text-left">
          <div className="text-sm font-semibold text-primary">{asset.symbol}</div>
          <div className="text-xs text-muted">{asset.chainName || 'Ethereum'}</div>
        </div>
      </div>
      <div className="text-right">
        <div className="text-sm font-medium text-primary">
          {asset.balance?.toLocaleString(undefined, { maximumFractionDigits: 6 })}
        </div>
        <div className="text-xs text-muted">
          $
          {usdValue.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </div>
      </div>
    </button>
  );
};

/**
 * Mirrors the withdrawal modal's RoutePill — shows the hop chain path.
 */
const RoutePill: React.FC = () => (
  <div className="flex items-center gap-1.5 text-[11px] text-muted bg-secondary border border-color rounded-full px-3 py-1.5 w-fit mx-auto">
    {DEPOSIT_ROUTE.map((chain, i) => (
      <React.Fragment key={chain}>
        <span
          className={
            i === 0
              ? 'text-secondary font-medium'
              : i === DEPOSIT_ROUTE.length - 1
                ? 'text-brand font-medium'
                : ''
          }
        >
          {chain}
        </span>
        {i < DEPOSIT_ROUTE.length - 1 && <ArrowRight className="w-2.5 h-2.5 opacity-40" />}
      </React.Fragment>
    ))}
  </div>
);

/**
 * Deposit progress steps — mirrors StepTracker in the withdrawal modal.
 * Maps to `DepositStep` from `useDydxDeposit`.
 */
const DEPOSIT_STEPS = [
  { key: 'routing', label: 'Route', sublabel: 'Find best path' },
  { key: 'signing_evm', label: 'Sign', sublabel: 'Approve in wallet' },
  { key: 'pending_bridge', label: 'Bridge', sublabel: 'Cross-chain hop' },
  { key: 'transferring', label: 'dYdX', sublabel: 'Enter account' },
] as const;

type DepositProgressStep = typeof DEPOSIT_STEPS[number]['key'];

const DepositStepTracker: React.FC<{ currentStep: string; isActive: boolean }> = ({
  currentStep,
  isActive,
}) => {
  const stepKeys = DEPOSIT_STEPS.map(s => s.key);
  const currentIdx = stepKeys.indexOf(currentStep as DepositProgressStep);
  const fillPct = currentIdx < 0 ? 0 : (currentIdx / (DEPOSIT_STEPS.length - 1)) * 100;

  return (
    <div className="w-full">
      <div className="relative pb-10">
        {/* Track */}
        <div className="absolute top-[18px] left-[10%] right-[10%] h-[2px] bg-color rounded-full z-0" />
        {/* Fill */}
        <div
          className="absolute top-[18px] left-[10%] h-[2px] bg-brand rounded-full z-0 transition-all duration-700 ease-out"
          style={{ width: `${fillPct * 0.8}%` }}
        />
        <div className="relative z-10 flex justify-between">
          {DEPOSIT_STEPS.map((s, i) => {
            const isPast = currentIdx > i;
            const isCurrent = currentIdx === i;
            return (
              <div
                key={s.key}
                className="flex flex-col items-center gap-2"
                style={{ width: `${100 / DEPOSIT_STEPS.length}%` }}
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
                  style={
                    isCurrent ? { boxShadow: '0 0 0 4px rgba(99,102,241,0.15)' } : undefined
                  }
                >
                  {isPast ? (
                    <CheckCircle2 className="w-[14px] h-[14px] text-white" />
                  ) : isCurrent && isActive ? (
                    s.key === 'pending_bridge' ? (
                      <Zap className="w-[14px] h-[14px] text-brand" />
                    ) : (
                      <Loader2 className="w-[14px] h-[14px] text-brand animate-spin" />
                    )
                  ) : (
                    <span
                      className={`text-[11px] font-semibold ${i > currentIdx ? 'text-muted' : 'text-brand'
                        }`}
                    >
                      {i + 1}
                    </span>
                  )}
                </div>
                <div className="text-center px-0.5">
                  <div
                    className={`text-[11px] font-semibold leading-none mb-0.5 ${isCurrent ? 'text-brand' : isPast ? 'text-secondary' : 'text-muted'
                      }`}
                  >
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

/**
 * ModalShell — bottom sheet on mobile, centered modal on desktop.
 * Mirrors DydxWithdrawModal's ModalShell exactly.
 */
const ModalShell: React.FC<{ onClose: () => void; children: React.ReactNode }> = ({
  onClose,
  children,
}) => (
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
        'max-h-[90dvh] sm:max-h-[640px]',
      ].join(' ')}
    >
      {children}
    </div>
  </div>
);

// ─── Main modal ───────────────────────────────────────────────────────────────

export const DydxDepositModal: React.FC<DydxDepositModalProps> = ({
  isOpen,
  onClose,
  initialAsset,
}) => {
  const { network } = useWalletStore();
  const { assets } = useWalletAssets(network);
  const evmWallet = useWalletStore(state => state.connectedWallets.evm);
  const evmAddress = evmWallet?.address || '';
  const { totalEquity } = useSubaccounts();

  const {
    deposit,
    getRoute,
    reset,
    checkPendingDeposit,
    isCheckingPending,
    step: depositStep,
    stepLabel,
    error: depositError,
    route,
    isLoading,
    MIN_DEPOSIT_USDC,
  } = useDydxDeposit();

  const evmChainId = Number(evmWallet?.chainId ?? 1);

  // ── Modal navigation ────────────────────────────────────────────────────────
  const [modalStep, setModalStep] = useState<ModalStep>('form');

  // ── Form state ──────────────────────────────────────────────────────────────
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [amount, setAmount] = useState('');
  const [goFast, setGoFast] = useState(false);
  const [slippage, setSlippage] = useState('1');
  const [showVolatilityWarning, setShowVolatilityWarning] = useState(true);

  // ── Tracker state ───────────────────────────────────────────────────────────
  // Initialise directly from localStorage so there is no render-cycle race.
  const [trackerTxHash, setTrackerTxHash] = useState<string | null>(() => loadPendingTx()?.txHash ?? null);
  const [trackerChainId, setTrackerChainId] = useState<string | null>(() => loadPendingTx()?.chainId ?? null);

  const tracker = useTransactionTracker(trackerTxHash, trackerChainId);

  /**
   * Whether a tracked transfer is still in-flight.
   * We treat the tracker as "pending" until it has actually resolved to a
   * terminal state — not just until it returns the default EMPTY_RESULT
   * (which has isTerminal: false before polling starts).
   *
   * We guard with `!!trackerTxHash` so we never lock when there's no tx.
   */
  const hasPendingTracker = !!trackerTxHash && !tracker.isTerminal;

  // ── Routing to tracker on open ──────────────────────────────────────────────
  // Use a ref so this runs only once per open event, not on every re-render.
  const hasRoutedOnOpenRef = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      // Reset everything when modal closes.
      hasRoutedOnOpenRef.current = false;
      setModalStep('form');
      setAmount('');
      setSelectedAsset(null);
      setGoFast(false);
      setSlippage('1');
      setShowVolatilityWarning(true);
      reset();
      return;
    }

    if (hasRoutedOnOpenRef.current) return;
    hasRoutedOnOpenRef.current = true;

    // On first open, check for a persisted pending tx.
    const pending = loadPendingTx();
    if (pending) {
      setTrackerTxHash(pending.txHash);
      setTrackerChainId(pending.chainId);
      // We route to tracker unconditionally here. The tracker itself will
      // immediately start polling and expose isTerminal = true if the tx has
      // already completed, at which point the Done/Dismiss button appears.
      setModalStep('tracker');
    }

    checkPendingDeposit();
  }, [isOpen, reset, checkPendingDeposit]);

  // ── Asset selection defaults ─────────────────────────────────────────────────
  useEffect(() => {
    if (isOpen) {
      if (initialAsset) {
        setSelectedAsset(initialAsset);
      } else if (assets.length > 0 && !selectedAsset) {
        const usdc = assets.find(a => a.symbol.toUpperCase() === 'USDC');
        const eth = assets.find(a => a.symbol.toUpperCase() === 'ETH');
        setSelectedAsset(usdc || eth || assets[0]);
      }
    }
  }, [isOpen, assets, initialAsset]);

  // ── Route fetching ───────────────────────────────────────────────────────────
  useEffect(() => {
    const parsed = parseFloat(amount);
    if (selectedAsset && parsed > 0) {
      const timer = setTimeout(() => {
        getRoute(selectedAsset.symbol, parsed, evmChainId, goFast);
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [amount, selectedAsset, getRoute, evmChainId, goFast]);

  // ── Handlers ─────────────────────────────────────────────────────────────────
  const handleSelectAsset = useCallback((asset: Asset) => {
    setSelectedAsset(asset);
    setAmount('');
    setModalStep('form');
  }, []);

  const handleSetMax = useCallback(() => {
    if (selectedAsset?.balance) {
      const truncated = Math.floor(selectedAsset.balance * 1e6) / 1e6;
      setAmount(truncated.toString());
    }
  }, [selectedAsset]);

  const handleDeposit = useCallback(async () => {
    if (!selectedAsset || !amount) return;
    const result = await deposit(
      selectedAsset.symbol,
      parseFloat(amount),
      evmChainId,
      goFast,
      slippage || '1'
    );

    if (result.txHash) {
      const cid = String(evmChainId);
      setTrackerTxHash(result.txHash);
      setTrackerChainId(cid);
      savePendingTx({ txHash: result.txHash, chainId: cid, startedAt: Date.now() });
      setModalStep('tracker');
    }
  }, [selectedAsset, amount, deposit, evmChainId, goFast, slippage]);

  const handleDismissTracker = useCallback(() => {
    clearPendingTx();
    setTrackerTxHash(null);
    setTrackerChainId(null);
  }, []);

  const handleShowTracker = useCallback(() => setModalStep('tracker'), []);

  // ── Derived values ───────────────────────────────────────────────────────────
  const sortedAssets = useMemo(() => {
    return [...assets].sort((a, b) => {
      const aIdx = PRIORITY_SYMBOLS.indexOf(a.symbol.toUpperCase());
      const bIdx = PRIORITY_SYMBOLS.indexOf(b.symbol.toUpperCase());
      if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
      if (aIdx !== -1) return -1;
      if (bIdx !== -1) return 1;
      return (b.balance || 0) * (b.current_price || 0) - (a.balance || 0) * (a.current_price || 0);
    });
  }, [assets]);

  const yourTokens = useMemo(() => sortedAssets.filter(a => (a.balance || 0) > 0), [sortedAssets]);
  const otherTokens = useMemo(() => sortedAssets.filter(a => (a.balance || 0) === 0), [sortedAssets]);

  const amountValue = parseFloat(amount) || 0;
  const walletBalance = selectedAsset?.balance || 0;
  const isStable = ['USDC', 'USDT'].includes(selectedAsset?.symbol?.toUpperCase() || '');
  const rawUsdEquivalent = isStable
    ? amountValue
    : amountValue * (selectedAsset?.current_price || 0);
  const usdEquivalent =
    !isStable && (selectedAsset?.current_price || 0) === 0 ? null : rawUsdEquivalent;
  const displayUsd = usdEquivalent ?? rawUsdEquivalent;

  const amountValidation = validateDepositAmount(
    amountValue,
    walletBalance,
    usdEquivalent,
    MIN_DEPOSIT_USDC
  );

  const equityAfter = parseFloat(totalEquity) + (route?.receivedAmount ?? displayUsd);
  const isDepositLocked = hasPendingTracker;

  // Auto-disable goFast if amount is too low.
  useEffect(() => {
    if (displayUsd > 0 && displayUsd < 20 && goFast) setGoFast(false);
  }, [displayUsd, goFast]);

  if (!isOpen) return null;

  // ── TRACKER SCREEN ──────────────────────────────────────────────────────────
  if (modalStep === 'tracker') {
    return (
      <ModalShell onClose={onClose}>
        {/* Fixed header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 shrink-0 border-b border-color">
          <div className="flex items-center gap-2.5">
            {hasPendingTracker ? (
              <Loader2 className="w-4 h-4 text-brand animate-spin" />
            ) : (
              <Activity className="w-4 h-4 text-brand" />
            )}
            <h3 className="text-base font-semibold text-primary">Transfer Status</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-muted hover:text-primary transition-colors rounded-lg hover:bg-hover"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-5 py-5 flex flex-col gap-4">
          {/* Amount card — if we have route data */}
          {trackerTxHash && (
            <div className="rounded-xl border border-color bg-tertiary p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-xs text-muted mb-0.5">Depositing</div>
                  <div className="text-2xl font-bold text-primary tracking-tight">
                    {amount ? (
                      <>
                        {parseFloat(amount).toLocaleString(undefined, {
                          maximumFractionDigits: 6,
                        })}
                        <span className="text-sm font-normal text-muted ml-1.5">
                          {selectedAsset?.symbol ?? 'USDC'}
                        </span>
                      </>
                    ) : (
                      <span className="text-base text-muted font-normal">In Progress</span>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-muted mb-0.5">Status</div>
                  <div
                    className={`text-xs font-semibold px-2 py-0.5 rounded-full inline-flex items-center gap-1.5 ${hasPendingTracker
                        ? 'bg-brand/10 text-brand'
                        : tracker.overallState === 'STATE_COMPLETED_SUCCESS'
                          ? 'bg-success-bg text-success'
                          : 'bg-danger-bg text-danger'
                      }`}
                  >
                    {hasPendingTracker && (
                      <span className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse inline-block shrink-0" />
                    )}
                    {hasPendingTracker
                      ? stepLabel || 'Bridging…'
                      : tracker.overallState === 'STATE_COMPLETED_SUCCESS'
                        ? 'Completed'
                        : 'Failed'}
                  </div>
                </div>
              </div>
              <RoutePill />
            </div>
          )}

          {/* Step tracker — shown while deposit hook is still running */}
          {isLoading && (
            <div className="rounded-xl border border-color bg-tertiary px-4 pt-4 pb-1">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted mb-3">
                Progress
              </p>
              <DepositStepTracker currentStep={depositStep} isActive={isLoading} />
            </div>
          )}

          {/* Skip cross-chain tracker */}
          {trackerTxHash && trackerChainId && (
            <TransactionTracker
              txHash={trackerTxHash}
              chainId={trackerChainId}
              overallState={tracker.overallState}
              steps={tracker.steps}
              activeStepIndex={tracker.activeStepIndex}
              assetRelease={tracker.assetRelease}
              isLoading={tracker.isLoading}
              isError={tracker.isError}
              errorMessage={tracker.errorMessage}
            />
          )}

          <p className="text-[11px] text-muted text-center leading-relaxed">
            Safe to close — we'll track progress in the background.
          </p>

          {/* Terminal actions */}
          {tracker.isTerminal && (
            <button
              onClick={() => {
                handleDismissTracker();
                setModalStep('form');
              }}
              className="w-full py-3 btn btn-primary rounded-xl font-semibold text-[15px]"
            >
              {tracker.overallState === 'STATE_COMPLETED_SUCCESS' ? 'Done' : 'Dismiss & Retry'}
            </button>
          )}

          {/* Back to form while still pending (non-locked state) */}
          {!tracker.isTerminal && !isLoading && (
            <button
              onClick={() => setModalStep('form')}
              className="w-full py-3 rounded-xl border border-color text-sm text-muted hover:text-primary hover:bg-hover transition-colors"
            >
              Back to form
            </button>
          )}
        </div>
      </ModalShell>
    );
  }

  // ── TOKEN SELECTOR SCREEN ───────────────────────────────────────────────────
  if (modalStep === 'select_token') {
    return (
      <ModalShell onClose={onClose}>
        {/* Fixed header */}
        <div className="flex items-center gap-3 px-5 pt-5 pb-3 shrink-0 border-b border-color">
          <button
            onClick={() => setModalStep('form')}
            className="p-1.5 -ml-1 text-muted hover:text-primary transition-colors rounded-lg hover:bg-hover"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h3 className="text-lg font-semibold text-primary">Select token</h3>
        </div>

        {/* Scrollable list */}
        <div className="overflow-y-auto flex-1 pb-4 px-3">
          {yourTokens.length > 0 && (
            <div className="mb-4 mt-2">
              <div className="text-xs font-semibold text-muted uppercase tracking-wider px-2 mb-2">
                Your tokens
              </div>
              <div className="space-y-0.5">
                {yourTokens.map(asset => (
                  <AssetRow
                    key={asset.id}
                    asset={asset}
                    isSelected={selectedAsset?.id === asset.id}
                    onSelect={handleSelectAsset}
                  />
                ))}
              </div>
            </div>
          )}

          {otherTokens.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-muted uppercase tracking-wider px-2 mb-2">
                Other tokens
              </div>
              <div className="space-y-0.5">
                {otherTokens.map(asset => (
                  <AssetRow
                    key={asset.id}
                    asset={asset}
                    isSelected={selectedAsset?.id === asset.id}
                    onSelect={handleSelectAsset}
                  />
                ))}
              </div>
            </div>
          )}

          {assets.length === 0 && (
            <div className="py-8 text-center text-sm text-muted">
              No assets found in connected wallets
            </div>
          )}
        </div>
      </ModalShell>
    );
  }

  // ── MAIN FORM SCREEN ────────────────────────────────────────────────────────
  return (
    <ModalShell onClose={onClose}>
      {/* Fixed header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0 border-b border-color">
        <h3 className="text-xl font-medium text-primary flex items-center gap-2">
          Deposit
          {isCheckingPending && <Loader2 className="w-4 h-4 animate-spin text-muted" />}
        </h3>
        <div className="flex items-center gap-2">
          {trackerTxHash && (
            <button
              onClick={handleShowTracker}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors
                text-brand border-brand/30 bg-brand/5 hover:bg-brand/15"
            >
              <Activity className="w-3.5 h-3.5" />
              {hasPendingTracker ? 'Tracking…' : 'View transfer'}
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

      {/* Scrollable body */}
      <div className="overflow-y-auto flex-1 px-5 py-5 space-y-3">

        {/* Pending transfer banner */}
        {isDepositLocked && (
          <div className="flex items-start gap-3 p-3 bg-brand/5 border border-brand/20 rounded-xl">
            <Loader2 className="w-4 h-4 text-brand animate-spin flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-primary">Transfer in progress</div>
              <div className="text-xs text-muted mt-0.5">
                Your previous deposit is still crossing chains. New deposits are locked until it
                completes.
              </div>
            </div>
            <button
              onClick={handleShowTracker}
              className="text-xs text-brand hover:underline shrink-0 mt-0.5"
            >
              Track →
            </button>
          </div>
        )}

        {/* Amount + token selector */}
        <div className="p-4 rounded-xl border border-color bg-tertiary">
          <div className="flex justify-between items-start mb-3">
            <div className="flex-1 mr-3">
              <div className="text-xs text-muted mb-0.5">Amount</div>
              <input
                type="text"
                value={amount}
                onChange={e => {
                  const val = e.target.value;
                  if (val === '' || /^\d*\.?\d*$/.test(val)) setAmount(val);
                }}
                placeholder="0.00"
                disabled={isLoading}
                className="w-full bg-transparent text-primary text-3xl font-semibold focus:outline-none placeholder-muted disabled:opacity-50"
              />
            </div>
            <button
              onClick={() => setModalStep('select_token')}
              disabled={isLoading}
              className="flex items-center gap-2 bg-secondary hover:bg-hover transition-colors pl-2 pr-2 py-2 rounded-xl border border-color shrink-0 disabled:opacity-50"
            >
              {selectedAsset ? (
                <AssetIcon asset={selectedAsset} size="sm" />
              ) : (
                <div className="w-5 h-5 rounded-full bg-hover" />
              )}
              <span className="text-sm font-semibold text-primary">
                {selectedAsset?.symbol || 'Select'}
              </span>
              <ChevronDown className="w-4 h-4 text-muted" />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs text-muted">
              {displayUsd > 0 && !isStable
                ? `≈ $${displayUsd.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}`
                : null}
            </span>
            <button
              onClick={handleSetMax}
              disabled={isLoading}
              className="text-xs text-muted hover:text-primary transition-colors disabled:opacity-50"
            >
              {walletBalance.toLocaleString(undefined, { maximumFractionDigits: 6 })} held
              &bull; <span className="text-brand font-medium">Max</span>
            </button>
          </div>

          {amountValidation.error && amountValue > 0 && (
            <p className="text-xs text-danger mt-1.5">{amountValidation.error}</p>
          )}
        </div>

        {/* Go Fast toggle */}
        <div className="flex items-center justify-between px-1">
          <label
            className={`flex items-center gap-2 ${displayUsd > 0 && displayUsd < 20 ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
              } select-none`}
          >
            <input
              type="checkbox"
              checked={goFast}
              onChange={e => {
                if (displayUsd > 0 && displayUsd < 20) return;
                setGoFast(e.target.checked);
              }}
              disabled={isLoading || (displayUsd > 0 && displayUsd < 20)}
              className="w-4 h-4 rounded border-color text-brand focus:ring-brand focus:ring-offset-0 bg-transparent disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <span className="text-sm text-primary">Go Fast</span>
          </label>
          {displayUsd > 0 && displayUsd < 20 && (
            <span className="text-xs text-brand">Min $20 required</span>
          )}
        </div>

        {/* Slippage */}
        <div className="p-4 rounded-xl border border-color bg-tertiary">
          <div className="flex justify-between items-center">
            <Tooltip
              content="Slippage determines the maximum price change you're willing to accept. Higher slippage increases execution chance in volatile markets."
              position="top"
            >
              <div className="flex flex-col">
                <span className="text-sm font-medium text-primary flex items-center gap-1.5 cursor-help">
                  Max Slippage (%)
                  <Info className="w-3.5 h-3.5 text-muted" />
                </span>
                <span className="text-[10px] text-muted font-medium mt-0.5">Max 6%</span>
              </div>
            </Tooltip>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={slippage}
                onChange={e => {
                  let val = e.target.value;
                  if (val === '') {
                    setSlippage('');
                    return;
                  }
                  if (/^\d*\.?\d*$/.test(val)) {
                    if (parseFloat(val) > 6) val = '6';
                    setSlippage(val);
                  }
                }}
                disabled={isLoading}
                className="w-16 bg-transparent text-right text-primary text-sm font-semibold focus:outline-none placeholder-muted border-b border-color focus:border-brand transition-colors disabled:opacity-50"
              />
              <span className="text-sm text-muted">%</span>
            </div>
          </div>
          {parseFloat(slippage) > 3 && (
            <div className="mt-2 text-xs text-brand">
              High slippage — transaction may execute at an unfavourable price.
            </div>
          )}
        </div>

        {/* Route summary */}
        {route && amountValue > 0 && (
          <div className="rounded-xl border border-color bg-tertiary px-4 py-3 space-y-2.5">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted">You'll receive</span>
              <span className="text-sm font-semibold text-primary">
                ~
                {route.receivedAmount.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{' '}
                USDC
              </span>
            </div>

            <div className="flex justify-between items-center">
              <Tooltip
                content={`dYdX keeps ~$${NATIVE_WALLET_GAS_RESERVE_USD.toFixed(2)} USDC in your wallet to pay network fees for withdrawals. This is required by the dYdX protocol.`}
                position="top"
              >
                <span className="text-sm text-muted flex items-center gap-1 cursor-help">
                  Network fee reserve
                  <Info className="w-3 h-3 text-muted" />
                </span>
              </Tooltip>
              <span className="text-sm text-secondary">
                ~${NATIVE_WALLET_GAS_RESERVE_USD.toFixed(2)} USDC
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-sm text-muted">Account after</span>
              <div className="text-sm font-medium text-primary flex items-center gap-1.5">
                <span className="text-muted">
                  $
                  {parseFloat(totalEquity).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
                <span className="text-muted">→</span>
                <span>
                  ~$
                  {equityAfter.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>
            </div>

            <div className="flex justify-between items-center">
              <div className="flex items-center gap-1.5 text-sm text-muted">
                <Clock className="w-3.5 h-3.5" />
                {goFast ? 'Go Fast route' : 'Est. time'}
              </div>
              <span className="text-sm text-secondary">{route.estimatedTime}</span>
            </div>

            {route.fee > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted">Bridge fee</span>
                <span className="text-sm text-primary">
                  ~$
                  {route.fee.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 4,
                  })}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Deposit error */}
        {depositError && (
          <div className="p-3 bg-danger-bg border border-danger rounded-xl flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-danger shrink-0 mt-0.5" />
            <p className="text-sm text-danger">{depositError}</p>
          </div>
        )}

        {/* Volatility warning */}
        {showVolatilityWarning && (
          <div className="flex items-start gap-3 p-3 bg-brand/10 border border-brand/30 rounded-xl relative">
            <AlertTriangle className="w-5 h-5 text-brand shrink-0 mt-0.5" />
            <div className="flex-1 pr-6">
              <h4 className="text-sm font-semibold text-primary mb-1">Market Volatility</h4>
              <p className="text-xs text-brand leading-relaxed">
                If the market is volatile, increase slippage tolerance to ensure your deposit
                succeeds.
              </p>
            </div>
            <button
              onClick={() => setShowVolatilityWarning(false)}
              className="absolute top-3 right-3 p-1 text-muted hover:text-primary transition-colors rounded-lg hover:bg-hover"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* CTA */}
        <button
          onClick={handleDeposit}
          disabled={isLoading || !amountValidation.valid || !evmAddress || isDepositLocked}
          className="w-full py-3.5 btn btn-primary rounded-xl font-semibold text-[15px] transition-all disabled:bg-hover disabled:text-muted disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              {stepLabel}
            </>
          ) : isDepositLocked ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Transfer pending…
            </>
          ) : !evmAddress ? (
            'Connect EVM Wallet'
          ) : (
            'Deposit'
          )}
        </button>

        <div className="h-2" />
      </div>
    </ModalShell>
  );
};