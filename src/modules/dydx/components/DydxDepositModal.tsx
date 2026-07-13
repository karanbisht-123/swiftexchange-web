import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronDown,
  Clock,
  ExternalLink,
  Info,
  Loader2,
  RefreshCw,
  Sparkles,
  X,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Notification } from '../../../components/common/Notification';
import { Tooltip } from '../../../components/common/Tooltip';
import { getChainById, getChainLogoUrl } from '../../evm/utils/Chainregistry';
import { useWalletAssets } from '../../walletconnect/hooks/useWalletAssets';
import { type Asset } from '../../walletconnect/store/portfolioStore';
import { useWalletStore } from '../../walletconnect/store/walletConnectStore';
import { type DepositPhase, useDydxDeposit } from '../hooks/useDydxDeposit';
import { useSubaccounts } from '../hooks/useSubaccounts';
import {
  getCurrentDepositTx,
  useCurrentDepositTx,
  useHasActivePendingDeposit,
  useHasActivePendingWithdraw,
  useTransactionStore,
  useTransactionTracker,
} from '../hooks/useTransactionTracker';
import {
  type AssetInfoContext,
  EXCLUDED_CHAIN_IDS,
  type ModalStep,
  isDydxChain,
  isPriorityAsset,
  isStellarAsset,
  needsSwapToUsdc,
} from '../utils/Depositassetutils';
import { validateDepositAmount } from '../utils/inputValidation';
import { NATIVE_WALLET_GAS_RESERVE_USD } from '../utils/skipBridgeUtils';
import { AssetInfoStep } from './Assetinfostep';
import { TokenSelectStep } from './Tokenselectstep';

interface DydxDepositModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialAsset?: Asset | null;
  initialAmount?: string;
}

function getExplorerTxUrl(chainId: string | number, txHash: string): string {
  const id = Number(chainId);
  const explorers: Record<number, string> = {
    1: 'https://etherscan.io/tx/',
    137: 'https://polygonscan.com/tx/',
    10: 'https://optimistic.etherscan.io/tx/',
    42161: 'https://arbiscan.io/tx/',
    8453: 'https://basescan.org/tx/',
    43114: 'https://snowtrace.io/tx/',
  };
  const base = explorers[id] ?? `https://etherscan.io/tx/`;
  return `${base}${txHash}`;
}

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

const AssetIcon: React.FC<{ asset: Asset; size?: 'sm' | 'md' }> = ({ asset, size = 'md' }) => {
  const chainIcon = asset.chainId ? getChainLogoUrl(asset.chainId) : undefined;
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
type StepStatus = 'pending' | 'active' | 'complete' | 'error';

interface DepositStepDef {
  id: string;
  label: string;
  sublabel?: string;
}

const StepIndicator: React.FC<{
  steps: DepositStepDef[];
  statuses: Record<string, StepStatus>;
}> = ({ steps, statuses }) => {
  return (
    <div className="flex flex-col gap-0 select-none">
      {steps.map((s, idx) => {
        const status = statuses[s.id] ?? 'pending';
        const isActive = status === 'active';
        const isDone = status === 'complete';
        const isErr = status === 'error';
        const isLast = idx === steps.length - 1;

        return (
          <div key={s.id} className="relative flex gap-4">
            <div className="relative flex flex-col items-center shrink-0 w-6">
              {!isLast && (
                <div
                  className={`absolute left-1/2 -translate-x-1/2 top-6 bottom-[-12px] border-l-2 border-dashed ${
                    isDone ? 'border-emerald-500/80' : 'border-white/20'
                  }`}
                />
              )}
              <div
                className={`w-6 h-6 rounded-full border flex items-center justify-center z-10 mt-0.5 transition-colors duration-200 ${
                  isActive
                    ? 'border-brand bg-brand/10 text-brand'
                    : isDone
                      ? 'border-emerald-500 bg-emerald-500 text-white'
                      : isErr
                        ? 'border-danger bg-danger/10 text-danger'
                        : 'border-white/10 bg-secondary text-muted opacity-40'
                }`}
              >
                {isActive ? (
                  <Loader2 className="w-3 h-3 text-brand animate-spin" />
                ) : isDone ? (
                  <Check className="w-3 h-3 text-white" />
                ) : isErr ? (
                  <X className="w-3 h-3 text-danger" />
                ) : (
                  <span className="text-[9px] font-bold">{idx + 1}</span>
                )}
              </div>
            </div>

            {/* Right Column: Text and message */}
            <div
              className={`flex-1 ${isLast ? 'pb-1' : 'pb-8'} transition-opacity duration-200 ${
                !isActive && !isDone && !isErr ? 'opacity-40' : 'opacity-100'
              }`}
            >
              <p
                className={`text-xs font-semibold leading-tight ${
                  isErr
                    ? 'text-danger'
                    : isActive
                      ? 'text-brand'
                      : isDone
                        ? 'text-emerald-500'
                        : 'text-muted'
                }`}
              >
                {s.label}
              </p>
              {s.sublabel && (
                <p className="text-[11px] text-muted mt-1 leading-relaxed">{s.sublabel}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
const AUTO_CLEAR_DELAY_MS = 10_000;

export const DydxDepositModal: React.FC<DydxDepositModalProps> = ({
  isOpen,
  onClose,
  initialAsset,
  initialAmount,
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
    step,
    depositPhase,
    failedPhase,
    depositedAmount,
  } = useDydxDeposit();

  const bridgeTracker = useTransactionTracker('deposit');

  const evmChainId = (evmWallet?.chainId as number | string) ?? 1;
  const currentDepositTx = useCurrentDepositTx();
  const depositIsPending = useHasActivePendingDeposit();
  const withdrawIsPending = useHasActivePendingWithdraw();
  const isDepositLocked = depositIsPending || withdrawIsPending;

  const effectiveDepositPhase = useMemo<DepositPhase>(() => {
    if (depositPhase !== 'idle') return depositPhase;
    if (currentDepositTx) {
      if (currentDepositTx.status === 'success') return 'success';
      if (currentDepositTx.status === 'failed') return 'error';
      if (currentDepositTx.status === 'pending') {
        return 'depositing';
      }
    }
    return 'idle';
  }, [depositPhase, currentDepositTx]);

  const displayError =
    depositError ||
    (effectiveDepositPhase === 'error' && bridgeTracker.errorMessage) ||
    'Deposit failed';

  // Modal step state
  const [modalStep, setModalStep] = useState<ModalStep>(() => {
    const tx = getCurrentDepositTx();
    return tx && !tx.isAcknowledged ? 'tracker' : 'form';
  });
  const [assetInfoContext, setAssetInfoContext] = useState<AssetInfoContext>(null);

  // Form state
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [amount, setAmount] = useState('');
  const [slippage, setSlippage] = useState('1');
  const [showVolatilityWarning, setShowVolatilityWarning] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const displayAsset = useMemo(() => {
    const pendingSymbol = currentDepositTx?.assetSymbol;
    const pendingChainId = currentDepositTx?.chainId;
    if (pendingSymbol) {
      return (
        assets.find(
          a =>
            a.symbol.toUpperCase() === pendingSymbol.toUpperCase() &&
            (!pendingChainId || String(a.chainId) === String(pendingChainId))
        ) || selectedAsset
      );
    }
    return selectedAsset;
  }, [selectedAsset, currentDepositTx?.assetSymbol, currentDepositTx?.chainId, assets]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const amountValue = parseFloat(amount) || 0;
  const isStable = ['USDC', 'USDT'].includes(selectedAsset?.symbol?.toUpperCase() || '');
  const rawUsdEquivalent = isStable
    ? amountValue
    : amountValue * (selectedAsset?.current_price || 0);
  const usdEquivalent =
    !isStable && (selectedAsset?.current_price || 0) === 0 ? null : rawUsdEquivalent;
  const displayUsd = usdEquivalent ?? rawUsdEquivalent;
  const goFast = displayUsd >= 20;

  const eligibleAssets = useMemo(() => {
    let result = assets.filter(a => {
      if (isDydxChain(a.chainId)) return false;
      if (EXCLUDED_CHAIN_IDS.has(Number(a.chainId))) return false;
      if ((a.balance || 0) <= 0) return false;
      if (isStellarAsset(a) && a.symbol.toUpperCase() !== 'USDC') return false;
      return true;
    });

    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase();
      result = result.filter(
        a => a.symbol.toLowerCase().includes(q) || a.name?.toLowerCase().includes(q)
      );
    }

    result.sort((a, b) => {
      const aUsd = (a.balance || 0) * (a.current_price || 0);
      const bUsd = (b.balance || 0) * (b.current_price || 0);
      return bUsd - aUsd;
    });

    return result;
  }, [assets, debouncedSearch]);

  const priorityAssets = useMemo(() => eligibleAssets.filter(isPriorityAsset), [eligibleAssets]);
  const otherAssets = useMemo(
    () => eligibleAssets.filter(a => !isPriorityAsset(a)),
    [eligibleAssets]
  );

  const handleSelectAsset = useCallback((asset: Asset) => {
    if (isStellarAsset(asset)) {
      setSelectedAsset(asset);
      setAssetInfoContext('stellar');
      setModalStep('asset_info');
      return;
    }
    if (needsSwapToUsdc(asset)) {
      setSelectedAsset(asset);
      setAssetInfoContext('swap_needed');
      setModalStep('asset_info');
      return;
    }
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
    setModalStep('tracker');
    await deposit(
      selectedAsset.symbol,
      parseFloat(amount),
      selectedAsset.chainId || evmChainId,
      goFast,
      slippage || '1',
      selectedAsset.address,
      selectedAsset.isNative,
      selectedAsset.decimals
    );
  }, [selectedAsset, amount, deposit, evmChainId, goFast, slippage]);

  const autoClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      wasOpenRef.current = false;
      setAmount('');
      setSelectedAsset(null);
      setSlippage('1');
      setShowVolatilityWarning(true);
      setAssetInfoContext(null);

      const tx = getCurrentDepositTx();
      if (tx && (tx.status === 'success' || tx.status === 'failed')) {
        useTransactionStore.getState().clearDepositTx();
      }

      reset();
      return;
    }
    if (wasOpenRef.current) return;
    wasOpenRef.current = true;

    const tx = getCurrentDepositTx();
    setModalStep(tx && !tx.isAcknowledged ? 'tracker' : 'form');
    checkPendingDeposit();
  }, [isOpen, reset, checkPendingDeposit]);
  useEffect(() => {
    if (!isOpen) return;
    const tx = getCurrentDepositTx();
    if (tx && !tx.isAcknowledged && modalStep === 'form') setModalStep('tracker');
  }, [isOpen, depositIsPending, modalStep]);

  useEffect(() => {
    if (!isOpen) return;
    const pendingTx = getCurrentDepositTx();
    if (pendingTx && !pendingTx.isAcknowledged) return;

    if (initialAsset) {
      if (isStellarAsset(initialAsset)) {
        setSelectedAsset(initialAsset);
        setAssetInfoContext('stellar');
        setModalStep('asset_info');
        return;
      }
      if (needsSwapToUsdc(initialAsset)) {
        setSelectedAsset(initialAsset);
        setAssetInfoContext('swap_needed');
        setModalStep('asset_info');
        return;
      }
      if (!isDydxChain(initialAsset.chainId)) {
        setSelectedAsset(initialAsset);
        return;
      }
    }

    if (assets.length > 0 && !selectedAsset) {
      const evmAssets = assets.filter(a => !isDydxChain(a.chainId) && !isStellarAsset(a));
      const withBalance = evmAssets.filter(a => (a.balance || 0) > 0);
      const candidates = withBalance.length > 0 ? withBalance : evmAssets;
      const usdc = candidates.find(a => a.symbol.toUpperCase() === 'USDC');
      const eth = candidates.find(a => a.symbol.toUpperCase() === 'ETH');
      setSelectedAsset(usdc || eth || candidates[0] || null);
    }
  }, [isOpen, assets, initialAsset]);

  // Sync initial amount if provided
  useEffect(() => {
    if (isOpen && initialAmount) {
      setAmount(initialAmount);
    }
  }, [isOpen, initialAmount]);

  // Auto-clear success state
  useEffect(() => {
    if (effectiveDepositPhase === 'success' && modalStep === 'tracker') {
      autoClearRef.current = setTimeout(() => {
        useTransactionStore.getState().clearDepositTx();
        reset();
        setModalStep('form');
      }, AUTO_CLEAR_DELAY_MS);
      return () => {
        if (autoClearRef.current) clearTimeout(autoClearRef.current);
      };
    }
  }, [effectiveDepositPhase, modalStep]);

  // Debounce route fetch
  useEffect(() => {
    const parsed = parseFloat(amount);
    if (selectedAsset && parsed > 0) {
      const t = setTimeout(() => {
        getRoute(
          selectedAsset.symbol,
          parsed,
          selectedAsset.chainId || evmChainId,
          goFast,
          selectedAsset.address,
          selectedAsset.isNative,
          selectedAsset.decimals
        );
      }, 400);
      return () => clearTimeout(t);
    }
  }, [amount, selectedAsset, getRoute, evmChainId, goFast]);
  const isChainMismatch = !!(
    evmWallet &&
    displayAsset &&
    Number(evmWallet.chainId) !== Number(displayAsset.chainId)
  );

  const { stepDefs, stepStatuses } = useMemo(() => {
    const defs: DepositStepDef[] = [];
    const hasApprovalStep = displayAsset && !displayAsset.isNative;

    if (isChainMismatch) {
      defs.push({
        id: 'chain-switch',
        label: `Switch to ${getChainById(displayAsset?.chainId || 1)?.name || 'source chain'}`,
        sublabel: 'Switching network in wallet...',
      });
    }

    if (hasApprovalStep) {
      defs.push({
        id: 'approval',
        label: 'Approve token',
        sublabel: 'Approve token spend in wallet',
      });
    }

    defs.push({
      id: 'confirm-deposit',
      label: 'Confirm deposit',
      sublabel:
        effectiveDepositPhase === 'depositing' || effectiveDepositPhase === 'polling'
          ? currentDepositTx?.estimatedTime
            ? `Waiting for funds to arrive on dYdX (approx. ${currentDepositTx.estimatedTime})...`
            : 'Waiting for funds to arrive on dYdX...'
          : 'Confirm the deposit transaction in your wallet',
    });

    const statuses: Record<string, StepStatus> = {};

    if (effectiveDepositPhase === 'idle') {
      defs.forEach(d => (statuses[d.id] = 'pending'));
    } else if (effectiveDepositPhase === 'switching-chain') {
      if (isChainMismatch) statuses['chain-switch'] = 'active';
      if (hasApprovalStep) statuses['approval'] = 'pending';
      statuses['confirm-deposit'] = 'pending';
    } else if (effectiveDepositPhase === 'approving') {
      if (isChainMismatch) statuses['chain-switch'] = 'complete';
      if (hasApprovalStep) statuses['approval'] = 'active';
      statuses['confirm-deposit'] = 'pending';
    } else if (effectiveDepositPhase === 'approved') {
      if (isChainMismatch) statuses['chain-switch'] = 'complete';
      if (hasApprovalStep) statuses['approval'] = 'complete';
      statuses['confirm-deposit'] = 'active';
    } else if (effectiveDepositPhase === 'depositing' || effectiveDepositPhase === 'polling') {
      if (isChainMismatch) statuses['chain-switch'] = 'complete';
      if (hasApprovalStep) statuses['approval'] = 'complete';
      statuses['confirm-deposit'] = 'active';
    } else if (effectiveDepositPhase === 'success') {
      if (isChainMismatch) statuses['chain-switch'] = 'complete';
      if (hasApprovalStep) statuses['approval'] = 'complete';
      statuses['confirm-deposit'] = 'complete';
    } else if (effectiveDepositPhase === 'error') {
      if (failedPhase === 'switching-chain') {
        if (isChainMismatch) statuses['chain-switch'] = 'error';
        if (hasApprovalStep) statuses['approval'] = 'pending';
        statuses['confirm-deposit'] = 'pending';
      } else if (failedPhase === 'approving') {
        if (isChainMismatch) statuses['chain-switch'] = 'complete';
        if (hasApprovalStep) statuses['approval'] = 'error';
        statuses['confirm-deposit'] = 'pending';
      } else {
        if (isChainMismatch) statuses['chain-switch'] = 'complete';
        if (hasApprovalStep) statuses['approval'] = 'complete';
        statuses['confirm-deposit'] = 'error';
      }
    }

    return { stepDefs: defs, stepStatuses: statuses };
  }, [effectiveDepositPhase, step, isChainMismatch, displayAsset, failedPhase, currentDepositTx]);

  const walletBalance = selectedAsset?.balance || 0;
  const amountValidation = validateDepositAmount(
    amountValue,
    walletBalance,
    usdEquivalent,
    MIN_DEPOSIT_USDC
  );
  const equityAfter = parseFloat(totalEquity) + (route?.receivedAmount ?? displayUsd);

  const phaseLabel: Record<DepositPhase, string> = {
    idle: 'Deposit',
    'switching-chain': 'Switching network...',
    approving: 'Approve token spend...',
    approved: 'Confirm in wallet...',
    depositing: 'Broadcasting deposit...',
    polling: 'Crediting account...',
    success: 'Deposit complete!',
    error: 'Deposit failed',
  };

  if (!isOpen) return null;

  if (modalStep === 'asset_info' && selectedAsset) {
    return (
      <ModalShell onClose={onClose}>
        <AssetInfoStep
          asset={selectedAsset}
          context={assetInfoContext}
          onBack={() => setModalStep('select_token')}
          onClose={onClose}
          onPickDifferent={() => {
            setSelectedAsset(null);
            setAssetInfoContext(null);
            setModalStep('select_token');
          }}
        />
      </ModalShell>
    );
  }

  if (modalStep === 'select_token') {
    return (
      <ModalShell onClose={onClose} className="!max-h-[85vh] h-[85vh] sm:h-[640px]">
        <TokenSelectStep
          priorityAssets={priorityAssets}
          otherAssets={otherAssets}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onSelectAsset={handleSelectAsset}
          onBack={() => {
            setModalStep('form');
            setSearchQuery('');
          }}
        />
      </ModalShell>
    );
  }

  if (modalStep === 'tracker') {
    const txHash = currentDepositTx?.txHash;
    const txChainId = currentDepositTx?.chainId;
    const isSuccess = effectiveDepositPhase === 'success';
    const isError = effectiveDepositPhase === 'error';

    return (
      <ModalShell onClose={onClose} className="min-h-[480px] sm:min-h-[520px]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 shrink-0 border-b border-color">
          <div className="flex items-center gap-2.5">
            {isSuccess ? (
              <Sparkles className="w-4 h-4 text-brand" />
            ) : isError ? (
              <AlertTriangle className="w-4 h-4 text-danger" />
            ) : (
              <Loader2 className="w-4 h-4 text-brand animate-spin" />
            )}
            <h3 className="text-base font-semibold text-primary">
              {phaseLabel[effectiveDepositPhase]}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-muted hover:text-primary transition-colors rounded-lg hover:bg-hover"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-5 flex flex-col gap-5">
          {/* Amount summary */}
          {!isSuccess && (
            <div className="flex items-center gap-3.5 p-4 border border-color bg-tertiary rounded-xl">
              {displayAsset ? (
                <AssetIcon asset={displayAsset} size="md" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-brand/10 border border-brand/20 flex items-center justify-center font-bold text-brand text-sm">
                  $
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-2xl font-black text-primary flex items-baseline gap-1.5 font-mono">
                  {amount || currentDepositTx?.amount || '—'}
                  <span className="text-sm font-bold text-muted uppercase">
                    {selectedAsset?.symbol || currentDepositTx?.assetSymbol || 'USDC'}
                  </span>
                </div>
                <p className="text-[11px] text-muted mt-0.5 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse inline-block" />
                  Deposit to dYdX
                </p>
              </div>
            </div>
          )}

          {/* Step indicator */}
          {!isSuccess && (
            <div className="px-1 space-y-4">
              <div className="text-[10px] font-bold text-muted uppercase tracking-widest flex items-center gap-1.5 opacity-60">
                <Clock className="w-3.5 h-3.5" />
                Execution Roadmap
              </div>
              <StepIndicator steps={stepDefs} statuses={stepStatuses} />
            </div>
          )}

          {/* Tx hash (shown once deposit is broadcast) */}
          {!isSuccess && txHash && txChainId && (
            <a
              href={getExplorerTxUrl(txChainId, txHash)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between p-3 rounded-xl border border-color bg-tertiary hover:bg-hover transition-colors group"
            >
              <div>
                <p className="text-[10px] text-muted uppercase tracking-wide font-medium">
                  Deposit Transaction
                </p>
                <p className="text-xs font-mono text-primary mt-0.5">
                  {txHash.slice(0, 12)}…{txHash.slice(-8)}
                </p>
              </div>
              <ExternalLink className="w-3.5 h-3.5 text-muted group-hover:text-brand transition-colors" />
            </a>
          )}

          {/* Polling message */}
          {(effectiveDepositPhase === 'depositing' || effectiveDepositPhase === 'polling') && (
            <div className="flex items-center gap-3 p-3 rounded-xl border border-brand/20 bg-brand/5">
              <Loader2 className="w-4 h-4 text-brand animate-spin shrink-0" />
              <div>
                <p className="text-sm font-medium text-primary">Crediting your trading account</p>
                <p className="text-xs text-muted mt-0.5">
                  This can take up to 25 min. You can close this modal — your funds are safe.
                </p>
              </div>
            </div>
          )}

          {/* Success state */}
          {isSuccess && (
            <div className="flex flex-col items-center gap-5 py-8 animate-in fade-in duration-500">
              <div className="relative">
                <div className="absolute inset-0 rounded-full bg-emerald-500/20 blur-md animate-pulse" />
                <div className="w-20 h-20 rounded-full bg-emerald-500/10 border-2 border-emerald-500 flex items-center justify-center shadow-[0_0_24px_rgba(16,185,129,0.2)]">
                  <Check className="w-10 h-10 text-emerald-500" />
                </div>
              </div>

              <div className="text-center space-y-1">
                <h4 className="text-3xl font-black text-primary font-mono tracking-tight">
                  {depositedAmount !== null
                    ? `${depositedAmount.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}`
                    : `${amount || currentDepositTx?.amount || '0.00'}`}
                  <span className="text-base font-bold text-muted ml-1.5 uppercase">
                    {selectedAsset?.symbol || currentDepositTx?.assetSymbol || 'USDC'}
                  </span>
                </h4>
                <p className="text-sm font-semibold text-emerald-500">Deposit complete!</p>
                <p className="text-xs text-muted">Added to your trading account</p>
              </div>

              {txHash && txChainId && (
                <a
                  href={getExplorerTxUrl(txChainId, txHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2 mt-4 rounded-full border border-color bg-tertiary hover:bg-hover transition-colors text-xs text-muted hover:text-primary group"
                >
                  <span className="font-mono">
                    {txHash.slice(0, 8)}…{txHash.slice(-8)}
                  </span>
                  <ExternalLink className="w-3.5 h-3.5 text-muted group-hover:text-brand transition-colors" />
                </a>
              )}
            </div>
          )}

          {/* Error */}
          {isError && displayError && (
            <div className="p-3 bg-danger/10 border border-danger/20 rounded-xl flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-danger shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-xs font-black text-danger uppercase mb-1">Error</p>
                <p className="text-[11px] font-bold text-danger/80 break-words">{displayError}</p>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="mt-auto pt-2 space-y-2">
            {isSuccess ? (
              <button
                onClick={() => {
                  if (autoClearRef.current) clearTimeout(autoClearRef.current);
                  useTransactionStore.getState().clearDepositTx();
                  reset();
                  setModalStep('form');
                  onClose();
                }}
                className="w-full py-3 btn btn-primary rounded-xl font-semibold text-[15px]"
              >
                Done
              </button>
            ) : isError ? (
              <button
                onClick={() => {
                  useTransactionStore.getState().clearDepositTx();
                  reset();
                  setModalStep('form');
                }}
                className="w-full py-3 btn btn-primary rounded-xl font-semibold text-[15px]"
              >
                Try again
              </button>
            ) : !txHash ? (
              <div className="flex flex-col gap-2 pt-2">
                <button
                  onClick={onClose}
                  className="w-full py-3 rounded-xl border border-color text-sm text-muted hover:text-primary hover:bg-hover transition-colors font-semibold text-[15px]"
                >
                  Close
                </button>
                <p className="text-[10px] text-muted text-center px-4 leading-normal font-medium mt-1">
                  Please do not close this window until the transaction completes.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2 pt-2">
                <button
                  onClick={onClose}
                  className="w-full py-3 rounded-xl border border-color text-sm text-muted hover:text-primary hover:bg-hover transition-colors font-semibold text-[15px]"
                >
                  Close
                </button>
                <p className="text-[10px] text-muted text-center px-4 leading-normal font-medium mt-1">
                  We are tracking your transaction. You can close this modal if you want.
                </p>
                <button
                  onClick={() => {
                    useTransactionStore.getState().clearDepositTx();
                    reset();
                    setModalStep('form');
                  }}
                  className="text-xs text-muted hover:text-danger hover:underline transition-colors font-medium pt-1 mt-1 self-center"
                >
                  Dismiss & Reset stuck request
                </button>
              </div>
            )}
          </div>
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

  return (
    <ModalShell onClose={onClose}>
      <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0 border-b border-color">
        <h3 className="text-xl font-medium text-primary flex items-center gap-2">
          Deposit
          {isCheckingPending && <Loader2 className="w-4 h-4 animate-spin text-muted" />}
        </h3>
        <div className="flex items-center gap-2">
          {currentDepositTx?.txHash && (
            <button
              onClick={() => setModalStep('tracker')}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors text-brand border-brand/30 bg-brand/5 hover:bg-brand/15"
            >
              <Activity className="w-3.5 h-3.5" />
              View transfer
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
        {/* Pending banners */}
        {depositIsPending && !withdrawIsPending && (
          <div className="flex items-start gap-3 p-3 bg-brand/5 border border-brand/20 rounded-xl">
            <Loader2 className="w-4 h-4 text-brand animate-spin shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-primary">Deposit in progress</div>
              <div className="text-xs text-muted mt-0.5">
                Locked until the current deposit completes.
              </div>
            </div>
            <div className="flex flex-col items-end gap-1.5 shrink-0">
              <button
                onClick={() => setModalStep('tracker')}
                className="text-xs text-brand hover:underline font-semibold"
              >
                Track →
              </button>
              <button
                onClick={() => {
                  useTransactionStore.getState().clearDepositTx();
                  reset();
                }}
                className="text-xs text-muted hover:text-danger font-medium transition-colors"
              >
                Dismiss request
              </button>
            </div>
          </div>
        )}
        {withdrawIsPending && (
          <div className="flex items-start gap-3 p-3 bg-danger/10 border border-danger/20 rounded-xl">
            <Activity className="w-4 h-4 text-danger shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-danger">Withdrawal in progress</div>
              <div className="text-xs text-danger/80 mt-0.5">
                Cannot deposit while a withdrawal is processing.
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
              {walletBalance.toLocaleString(undefined, { maximumFractionDigits: 6 })} held &bull;{' '}
              <span className="text-brand font-medium">Max</span>
            </button>
          </div>
          {amountValidation.error && amountValue > 0 && (
            <p className="text-xs text-danger mt-1.5">{amountValidation.error}</p>
          )}
        </div>

        <div className="p-4 rounded-xl border border-color bg-tertiary">
          <div className="flex justify-between items-center">
            <Tooltip
              content="Slippage is the max price change you'll accept. Higher = better fill rate in volatile markets."
              position="top"
            >
              <div className="flex flex-col">
                <span className="text-sm font-medium text-primary flex items-center gap-1.5 cursor-help">
                  Max slippage (%)
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
                className="w-16 bg-transparent text-right text-primary text-sm font-semibold focus:outline-none border-b border-color focus:border-brand transition-colors disabled:opacity-50"
              />
              <span className="text-sm text-muted">%</span>
            </div>
          </div>
          {parseFloat(slippage) > 3 && (
            <div className="mt-2 text-xs text-brand">
              High slippage — may execute at an unfavourable price.
            </div>
          )}
        </div>
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
                content={`~$${NATIVE_WALLET_GAS_RESERVE_USD.toFixed(2)} USDC kept for withdrawal gas fees.`}
                position="top"
              >
                <span className="text-sm text-muted flex items-center gap-1 cursor-help">
                  Gas reserve
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
                <ArrowRight className="w-3 h-3 text-muted" />
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

        {depositError && !isLoading && (
          <div className="p-3 bg-danger-bg border border-danger rounded-xl flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-danger shrink-0 mt-0.5" />
            <p className="text-sm text-danger">{depositError}</p>
          </div>
        )}
        {showVolatilityWarning && (
          <div className="flex items-start gap-3 p-3 bg-brand/10 border border-brand/30 rounded-xl relative">
            <AlertTriangle className="w-5 h-5 text-brand shrink-0 mt-0.5" />
            <div className="flex-1 pr-6">
              <h4 className="text-sm font-semibold text-primary mb-1">Market volatility</h4>
              <p className="text-xs text-brand leading-relaxed">
                In volatile markets, increase slippage tolerance to ensure your deposit succeeds.
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

        {isChainMismatch && amountValue > 0 && (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-brand/5 border border-brand/20">
            <RefreshCw className="w-3.5 h-3.5 text-brand shrink-0" />
            <p className="text-xs text-brand">
              Network will auto-switch to{' '}
              <span className="font-semibold">
                {getChainById(selectedAsset?.chainId || 1)?.name || 'source chain'}
              </span>{' '}
              when you click Deposit.
            </p>
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
            'Connect EVM wallet'
          ) : (
            'Deposit'
          )}
        </button>

        <div className="h-2" />
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
};
