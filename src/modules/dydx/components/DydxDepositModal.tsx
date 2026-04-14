import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ChevronDown,
  ChevronLeft,
  Clock,
  Info,
  Loader2,
  RefreshCw,
  X,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Notification } from '../../../components/common/Notification';

import { Tooltip } from '../../../components/common/Tooltip';
import { type Asset, useWalletAssets } from '../../walletconnect/hooks/useWalletAssets';
import { useWalletStore } from '../../walletconnect/store/walletConnectStore';
import { useDydxDeposit } from '../hooks/useDydxDeposit';
import { useSubaccounts } from '../hooks/useSubaccounts';
import {
  useHasActivePendingDeposit,
  useHasActivePendingWithdraw,
  useTransactionStore,
  useTransactionTracker,
} from '../hooks/useTransactionTracker';
import { validateDepositAmount } from '../utils/inputValidation';
import { NATIVE_WALLET_GAS_RESERVE_USD } from '../utils/skipBridgeUtils';
import { TransactionTracker } from './TransactionTracker';

type ModalStep = 'form' | 'select_token' | 'tracker';

interface DydxDepositModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialAsset?: Asset | null;
}

const PRIORITY_SYMBOLS = ['USDC', 'USDT', 'ETH'];

const CHAIN_ICONS: Record<string, string> = {
  ETH: 'https://coin-images.coingecko.com/coins/images/279/large/ethereum.png',
  BNB: 'https://tokens.pancakeswap.finance/images/0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c.png',
};

const DEPOSIT_ROUTE = ['Your Wallet', 'Noble', 'dYdX'] as const;

const getChainIconUrl = (asset: Asset): string | undefined => {
  if (asset.chainId === 1) return CHAIN_ICONS.ETH;
  if (asset.chainId === 56) return CHAIN_ICONS.BNB;
  if (asset.chainName?.includes('Ethereum')) return CHAIN_ICONS.ETH;
  if (asset.chainName?.includes('BNB')) return CHAIN_ICONS.BNB;
  return undefined;
};

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
        'max-h-[90dvh] sm:max-h-[640px] overflow-hidden',
        className,
      ].join(' ')}
    >
      {children}
    </div>
  </div>
);

const AUTO_CLEAR_DELAY_MS = 10_000;

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
    stepLabel,
    error: depositError,
    route,
    isLoading,
    MIN_DEPOSIT_USDC,
    notification,
    clearNotification,
  } = useDydxDeposit();

  const evmChainId = Number(evmWallet?.chainId ?? 1);
  const store = useTransactionStore();
  const depositIsPending = useHasActivePendingDeposit();
  const withdrawIsPending = useHasActivePendingWithdraw();
  const isDepositLocked = depositIsPending || withdrawIsPending;

  const [modalStep, setModalStep] = useState<ModalStep>(() => {
    const tx = useTransactionStore.getState().depositTx;
    return (tx && !tx.isAcknowledged) ? 'tracker' : 'form';
  });

  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [amount, setAmount] = useState('');

  const activeStepLabel = isLoading ? stepLabel : (store.depositTx?.stepLabel ?? '');
  const activeAmount = isLoading ? amount : (store.depositTx?.amount ?? '');
  const activeAssetSymbol = isLoading
    ? selectedAsset?.symbol
    : (store.depositTx?.assetSymbol ?? '');
  const [goFast, setGoFast] = useState(false);
  const [slippage, setSlippage] = useState('1');
  const [showVolatilityWarning, setShowVolatilityWarning] = useState(true);

  const tracker = useTransactionTracker('deposit');
  const trackerTxHash = tracker.txHash;
  const trackerChainId = tracker.chainId;
  const hasPendingTracker = !!trackerTxHash && tracker.hasPolledOnce && !tracker.isTerminal;

  const autoClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!tracker.isTerminal || !store.depositTx) return;

    autoClearRef.current = setTimeout(() => {
      tracker.acknowledge();
      setModalStep('form');
    }, AUTO_CLEAR_DELAY_MS);

    return () => {
      if (autoClearRef.current) clearTimeout(autoClearRef.current);
    };
  }, [tracker.isTerminal, store.depositTx]);

  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      wasOpenRef.current = false;
      setAmount('');
      setSelectedAsset(null);
      setGoFast(false);
      setSlippage('1');
      setShowVolatilityWarning(true);
      reset();
      return;
    }
    if (wasOpenRef.current) return;
    wasOpenRef.current = true;

    const tx = useTransactionStore.getState().depositTx;
    const shouldShowTracker = tx && !tx.isAcknowledged;
    setModalStep(shouldShowTracker ? 'tracker' : 'form');

    checkPendingDeposit();
  }, [isOpen, reset, checkPendingDeposit]);

  useEffect(() => {
    if (!isOpen) return;
    const tx = useTransactionStore.getState().depositTx;
    const shouldShowTracker = tx && !tx.isAcknowledged;
    if (shouldShowTracker && modalStep === 'form') {
      setModalStep('tracker');
    }
  }, [isOpen, depositIsPending, modalStep]);

  useEffect(() => {
    if (!isOpen) return;
    if (initialAsset) {
      setSelectedAsset(initialAsset);
    } else if (assets.length > 0 && !selectedAsset) {
      const usdc = assets.find(a => a.symbol.toUpperCase() === 'USDC');
      const eth = assets.find(a => a.symbol.toUpperCase() === 'ETH');
      setSelectedAsset(usdc || eth || assets[0]);
    }
  }, [isOpen, assets, initialAsset]);

  useEffect(() => {
    const parsed = parseFloat(amount);
    if (selectedAsset && parsed > 0) {
      const timer = setTimeout(() => {
        getRoute(selectedAsset.symbol, parsed, evmChainId, goFast);
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [amount, selectedAsset, getRoute, evmChainId, goFast]);

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
    await deposit(selectedAsset.symbol, parseFloat(amount), evmChainId, goFast, slippage || '1');
  }, [selectedAsset, amount, deposit, evmChainId, goFast, slippage]);

  const handleDismissTracker = useCallback(() => {
    if (autoClearRef.current) clearTimeout(autoClearRef.current);
    tracker.acknowledge();
  }, [tracker]);

  const handleShowTracker = useCallback(() => setModalStep('tracker'), []);

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
  const otherTokens = useMemo(
    () => sortedAssets.filter(a => (a.balance || 0) === 0),
    [sortedAssets]
  );

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

  useEffect(() => {
    if (displayUsd > 0 && displayUsd < 20 && goFast) setGoFast(false);
  }, [displayUsd, goFast]);

  if (!isOpen) return null;

  if (modalStep === 'tracker') {
    return (
      <ModalShell onClose={onClose} className="min-h-[500px] sm:min-h-[580px]">
        <div className="flex items-center justify-between px-5 pt-5 pb-4 shrink-0 border-b border-color">
          <div className="flex items-center gap-2.5">
            {hasPendingTracker ? (
              <Loader2 className="w-4 h-4 text-brand animate-spin" />
            ) : (
              <Activity className="w-4 h-4 text-brand" />
            )}
            <h3 className="text-base font-semibold text-primary">Transfer Status</h3>
          </div>
          <div className="flex items-center gap-2">
            {tracker.isTerminal && (
              <button
                onClick={tracker.refresh}
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
          {trackerTxHash && (
            <div className="rounded-xl border border-color bg-tertiary p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-xs text-muted mb-0.5">Depositing</div>
                  <div className="text-lg font-semibold text-primary tracking-tight">
                    {activeAmount
                      ? `${activeAmount} ${activeAssetSymbol}`
                      : 'In Progress'}
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
                    {!tracker.hasPolledOnce
                      ? (trackerTxHash ? 'Indexing…' : 'Signing…')
                      : hasPendingTracker
                        ? 'Bridging…'
                        : tracker.overallState === 'STATE_COMPLETED_SUCCESS'
                          ? 'Completed'
                          : 'Failed'}
                  </div>
                </div>
              </div>
              <RoutePill />
            </div>
          )}

          {(isLoading || (store.depositTx && !trackerTxHash)) && (
            <div className="relative flex gap-5 animate-in fade-in slide-in-from-bottom-2 px-1">
              <div className="absolute left-[13px] top-8 bottom-[-10px] w-[2px] bg-white/5" />
              <div className="flex-shrink-0 mt-0.5 relative z-10">
                <div className="w-7 h-7 rounded-full border-2 border-brand bg-brand/20 shadow-[0_0_15px_rgba(var(--brand-rgb),0.5)] flex items-center justify-center scale-110">
                   <div className="w-2 h-2 rounded-full bg-brand animate-ping" />
                </div>
              </div>
              <div className="flex-1 pb-10">
                <h4 className="text-sm font-bold tracking-tight text-primary">Initial Transaction</h4>
                <div className="flex items-center gap-2.5 text-[11px] font-semibold text-muted mt-1.5 flex-wrap">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border border-brand/30 bg-brand/10 text-brand text-[10px] font-black uppercase tracking-widest">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    {activeStepLabel || 'Signing...'}
                  </span>
                  <span className="text-muted/60 lowercase font-medium italic">Awaiting wallet confirmation…</span>
                </div>
              </div>
            </div>
          )}

          {!trackerTxHash && !isLoading && !store.depositTx && (
            <div className="flex-1 flex flex-col items-center justify-center py-10 px-6 text-center animate-in fade-in zoom-in-95">
              <div className="w-16 h-16 rounded-full bg-secondary border border-color flex items-center justify-center mb-4">
                <Activity className="w-8 h-8 text-muted/30" />
              </div>
              <h4 className="text-base font-bold text-primary mb-2">No active transfer found</h4>
              <p className="text-xs text-muted mb-6 max-w-[240px]">
                We couldn't find a pending deposit in your local session. It may have already completed or was cleared.
              </p>
              <button
                onClick={() => setModalStep('form')}
                className="px-6 py-2.5 rounded-xl bg-brand text-primary text-sm font-bold shadow-lg shadow-brand/20 hover:scale-105 transition-all"
              >
                Go to Deposit
              </button>
            </div>
          )}

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

          {trackerTxHash &&
            !tracker.hasPolledOnce &&
            !tracker.isTerminal &&
            store.depositTx?.status === 'pending' && (
              <div className="flex items-center gap-3 py-3 px-4 rounded-xl bg-brand/5 border border-brand/20">
                <Loader2 className="w-4 h-4 text-brand animate-spin flex-shrink-0" />
                <div className="text-sm text-muted">
                  {tracker.overallState === 'STATE_SUBMITTED'
                    ? 'Waiting for Skip to index the transaction…'
                    : 'Checking status…'}
                </div>
              </div>
            )}
            
          {tracker.isError && !hasPendingTracker && (
            <button
              onClick={tracker.refresh}
              className="w-full py-2.5 rounded-xl border border-color text-sm text-muted hover:text-primary hover:bg-hover transition-colors flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh status
            </button>
          )}

          {!tracker.isTerminal && (
            <p className="text-[11px] text-muted text-center leading-relaxed mt-4">
              Safe to close — we'll track progress in the background.
            </p>
          )}

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

          {!tracker.isTerminal && !isLoading && tracker.hasPolledOnce && (
            <button
              onClick={() => setModalStep('form')}
              className="w-full py-3 rounded-xl border border-color text-sm text-muted hover:text-primary hover:bg-hover transition-colors"
            >
              Back to form
            </button>
          )}
        </div>

        {notification && (
          <Notification
            type={notification.type}
            title={notification.title}
            message={notification.message}
            onClose={clearNotification}
            autoClose
            autoCloseDuration={6000}
          />
        )}
      </ModalShell>
    );
  }

  if (modalStep === 'select_token') {
    return (
      <ModalShell onClose={onClose}>
        <div className="flex items-center gap-3 px-5 pt-5 pb-3 shrink-0 border-b border-color">
          <button
            onClick={() => setModalStep('form')}
            className="p-1.5 -ml-1 text-muted hover:text-primary transition-colors rounded-lg hover:bg-hover"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h3 className="text-lg font-semibold text-primary">Select token</h3>
        </div>

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

  return (
    <ModalShell onClose={onClose}>
      <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0 border-b border-color">
        <h3 className="text-xl font-medium text-primary flex items-center gap-2">
          Deposit
          {isCheckingPending && <Loader2 className="w-4 h-4 animate-spin text-muted" />}
        </h3>
        <div className="flex items-center gap-2">
          {trackerTxHash && (
            <button
              onClick={handleShowTracker}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors text-brand border-brand/30 bg-brand/5 hover:bg-brand/15"
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

      <div className="overflow-y-auto flex-1 px-5 py-5 space-y-3">
        {depositIsPending && !withdrawIsPending && (
          <div className="flex items-start gap-3 p-3 bg-brand/5 border border-brand/20 rounded-xl">
            <Loader2 className="w-4 h-4 text-brand animate-spin flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-primary">Deposit in progress</div>
              <div className="text-xs text-muted mt-0.5">
                Your deposit is still crossing chains. A new deposit is locked until it completes.
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

        {withdrawIsPending && (
          <div className="flex items-start gap-3 p-3 bg-danger/10 border border-danger/20 rounded-xl">
            <Activity className="w-4 h-4 text-danger flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-danger">Withdrawal in progress</div>
              <div className="text-xs text-danger/80 mt-0.5">
                You cannot deposit while a withdrawal is processing. Please wait for it to complete.
              </div>
            </div>
          </div>
        )}

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
                ? `≈ $${displayUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : null}
            </span>
            <button
              onClick={handleSetMax}
              disabled={isLoading}
              className="text-xs text-muted hover:text-primary transition-colors disabled:opacity-50"
            >
              {walletBalance.toLocaleString(undefined, { maximumFractionDigits: 6 })} held &bull;{' '}
              <span className="text-brand font-medium">Max</span>
            </button>
          </div>
          {amountValidation.error && amountValue > 0 && (
            <p className="text-xs text-danger mt-1.5">{amountValidation.error}</p>
          )}
        </div>

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

        {/* Route Summary */}
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
                content={`dYdX keeps ~$${NATIVE_WALLET_GAS_RESERVE_USD.toFixed(2)} USDC in your wallet to pay network fees for withdrawals.`}
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

        {depositError && (
          <div className="p-3 bg-danger-bg border border-danger rounded-xl flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-danger shrink-0 mt-0.5" />
            <p className="text-sm text-danger">{depositError}</p>
          </div>
        )}

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
