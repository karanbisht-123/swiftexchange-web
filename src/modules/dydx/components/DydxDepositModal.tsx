import {
  Activity,
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronLeft,
  Clock,
  Copy,
  Info,
  Loader2,
  RefreshCw,
  Search,
  SearchX,
  X,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../../../constants/routes';
import { AutoSizer } from 'react-virtualized-auto-sizer';
import { FixedSizeList } from 'react-window';
import { Notification } from '../../../components/common/Notification';
import { Tooltip } from '../../../components/common/Tooltip';
import { getChainById, getChainLogoUrl } from '../../evm/utils/Chainregistry';
import { switchOrAddChain } from '../../evm/utils/evmChainUtils';
import { getEVMChains, getStellarConfig } from '../../walletconnect/config/chains';
import { useWalletAssets } from '../../walletconnect/hooks/useWalletAssets';
import { walletService } from '../../walletconnect/services/walletService';
import { type Asset } from '../../walletconnect/store/portfolioStore';
import { useWalletStore } from '../../walletconnect/store/walletConnectStore';
import { useDydxDeposit } from '../hooks/useDydxDeposit';
import { useSubaccounts } from '../hooks/useSubaccounts';
import {
  useHasActivePendingDeposit,
  useHasActivePendingWithdraw,
  getCurrentDepositTx,
  useCurrentDepositTx,
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


// const DEPOSIT_ROUTE = ['Your Wallet', 'Noble', 'dYdX'] as const;
const getChainIconUrl = (asset: Asset): string | undefined => {
  if (asset.chainId) return getChainLogoUrl(asset.chainId);
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
  const navigate = useNavigate();
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
  } = useDydxDeposit();

  const evmChainId = (evmWallet?.chainId as number | string ?? 1);
  const currentDepositTx = useCurrentDepositTx();
  const depositIsPending = useHasActivePendingDeposit();
  const withdrawIsPending = useHasActivePendingWithdraw();
  const isDepositLocked = depositIsPending || withdrawIsPending;

  const [modalStep, setModalStep] = useState<ModalStep>(() => {
    const tx = getCurrentDepositTx();
    return (tx && !tx.isAcknowledged) ? 'tracker' : 'form';
  });

  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [amount, setAmount] = useState('');

  const activeAmount = isLoading ? amount : (currentDepositTx?.amount ?? '');
  const activeAssetSymbol = isLoading
    ? selectedAsset?.symbol
    : (currentDepositTx?.assetSymbol ?? '');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNetwork, setSelectedNetwork] = useState<string | number>('all');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const [slippage, setSlippage] = useState('1');
  const [showVolatilityWarning, setShowVolatilityWarning] = useState(true);

  const amountValue = parseFloat(amount) || 0;
  const isStable = ['USDC', 'USDT'].includes(selectedAsset?.symbol?.toUpperCase() || '');
  const rawUsdEquivalent = isStable
    ? amountValue
    : amountValue * (selectedAsset?.current_price || 0);
  const usdEquivalent =
    !isStable && (selectedAsset?.current_price || 0) === 0 ? null : rawUsdEquivalent;
  const displayUsd = usdEquivalent ?? rawUsdEquivalent;

  const goFast = displayUsd >= 20;

  const tracker = useTransactionTracker('deposit');
  const trackerTxHash = tracker.txHash;
  const trackerChainId = tracker.chainId;
  const hasPendingTracker = !!trackerTxHash && tracker.hasPolledOnce && !tracker.isTerminal;

  const handleSwitchNetwork = async () => {
    if (!selectedAsset) return;
    const provider = walletService.getProvider('evm');
    if (provider) {
      try {
        await switchOrAddChain(provider, Number(selectedAsset.chainId));
      } catch (err) {
        console.error('Failed to switch network:', err);
      }
    }
  };

  const renderStepper = () => {
    const isChainMismatch = evmWallet && selectedAsset && Number(evmWallet.chainId) !== Number(selectedAsset.chainId);

    let step1Status: 'pending' | 'active' | 'completed' = 'completed';
    if (isChainMismatch && !trackerTxHash && step === 'idle') {
      step1Status = 'active';
    } else if (step === 'routing') {
      step1Status = 'active';
    } else {
      step1Status = 'completed';
    }

    let step2Status: 'pending' | 'active' | 'completed' = 'pending';
    const isNativeToken = selectedAsset?.isNative;
    if (trackerTxHash || step === 'pending_bridge' || step === 'transferring' || step === 'success') {
      step2Status = 'completed';
    } else if (step === 'signing_evm' && step1Status === 'completed') {
      step2Status = 'active';
    }

    let step3Status: 'pending' | 'active' | 'completed' = 'pending';
    if (trackerTxHash || step === 'transferring' || step === 'success') {
      step3Status = 'completed';
    } else if (step === 'pending_bridge') {
      step3Status = 'active';
    }

    let step4Status: 'pending' | 'active' | 'completed' | 'error' = 'pending';
    if (step === 'success' || tracker.overallState === 'STATE_COMPLETED_SUCCESS') {
      step4Status = 'completed';
    } else if (step === 'error' || tracker.isError) {
      step4Status = 'error';
    } else if (step === 'transferring' || trackerTxHash) {
      step4Status = 'active';
    }

    const steps = [
      {
        id: 1,
        title: 'Switch Network & Prepare',
        desc: isChainMismatch
          ? `Switch your wallet network to ${getChainById(selectedAsset?.chainId || 1)?.name || 'source chain'}`
          : 'Check connection and transaction route',
        status: step1Status,
        action: isChainMismatch && step1Status === 'active' ? (
          <button
            onClick={handleSwitchNetwork}
            className="mt-2 px-3 py-1.5 bg-brand hover:brightness-110 text-white text-[11px] font-bold rounded-lg shadow-md transition-all active:scale-95 cursor-pointer"
          >
            Switch Network
          </button>
        ) : null
      },
      {
        id: 2,
        title: `Approve ${selectedAsset?.symbol || 'USDC'}`,
        desc: isNativeToken
          ? 'Native asset - no approval needed'
          : `Authorize bridge to transfer your ${selectedAsset?.symbol || 'USDC'}`,
        status: isNativeToken ? 'completed' : step2Status,
      },
      {
        id: 3,
        title: 'Confirm Deposit',
        desc: 'Sign the deposit transaction in your wallet',
        status: step3Status,
      },
      {
        id: 4,
        title: 'Bridge Transfer',
        desc: 'Moving funds to your dYdX subaccount (typically 3-10 mins)',
        status: step4Status,
      }
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
                  className={`absolute left-[15px] top-8 bottom-[-24px] w-[2px] transition-all duration-500 ${isDone ? 'bg-brand' : 'bg-white/10'
                    }`}
                />
              )}

              <div className="shrink-0 z-10">
                <div
                  className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${isActive
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

              <div className={`flex-1 pb-4 transition-opacity duration-300 ${!isActive && !isDone ? 'opacity-40' : 'opacity-100'}`}>
                <h4 className="text-sm font-bold text-primary">{s.title}</h4>
                <p className="text-xs text-muted mt-0.5 leading-relaxed">{s.desc}</p>
                {s.action}

                {s.id === 4 && trackerTxHash && trackerChainId && (
                  <div className="mt-4 border border-color rounded-xl p-4 bg-tertiary/50 animate-in fade-in duration-500">
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
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const autoClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!tracker.isTerminal || !getCurrentDepositTx()) return;

    autoClearRef.current = setTimeout(() => {
      tracker.acknowledge();
      setModalStep('form');
    }, AUTO_CLEAR_DELAY_MS);

    return () => {
      if (autoClearRef.current) clearTimeout(autoClearRef.current);
    };
  }, [tracker.isTerminal, currentDepositTx]);

  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      wasOpenRef.current = false;
      setAmount('');
      setSelectedAsset(null);
      setSlippage('1');
      setShowVolatilityWarning(true);
      reset();
      return;
    }
    if (wasOpenRef.current) return;
    wasOpenRef.current = true;

    const tx = getCurrentDepositTx();
    const shouldShowTracker = tx && !tx.isAcknowledged;
    setModalStep(shouldShowTracker ? 'tracker' : 'form');

    checkPendingDeposit();
  }, [isOpen, reset, checkPendingDeposit]);

  useEffect(() => {
    if (!isOpen) return;
    const tx = getCurrentDepositTx();
    const shouldShowTracker = tx && !tx.isAcknowledged;
    if (shouldShowTracker && modalStep === 'form') {
      setModalStep('tracker');
    }
  }, [isOpen, depositIsPending, modalStep]);

  useEffect(() => {
    if (!isOpen) return;
    if (initialAsset && (initialAsset.chainType === 'stellar' || initialAsset.chainId === 'pubnet' || initialAsset.chainId === 'testnet')) {
      navigate(`${ROUTES.BRIDGE}?asset=${initialAsset.symbol}&type=perp`);
      onClose();
      return;
    }
    const isDydxChain = (cid: any) => typeof cid === 'string' && cid.startsWith('dydx-');
    if (initialAsset && initialAsset.chainId !== 'pubnet' && initialAsset.chainId !== 'testnet' && !isDydxChain(initialAsset.chainId)) {
      setSelectedAsset(initialAsset);
    } else if (assets.length > 0 && !selectedAsset) {
      const evmAssets = assets.filter(a => a.chainId !== 'pubnet' && a.chainId !== 'testnet' && !isDydxChain(a.chainId));
      const evmBalAssets = evmAssets.filter(a => (a.balance || 0) > 0);
      const candidates = evmBalAssets.length > 0 ? evmBalAssets : evmAssets;
      const usdc = candidates.find(a => a.symbol.toUpperCase() === 'USDC');
      const eth = candidates.find(a => a.symbol.toUpperCase() === 'ETH');
      setSelectedAsset(usdc || eth || candidates[0] || null);
    }
  }, [isOpen, assets, initialAsset, navigate, onClose]);

  useEffect(() => {
    const parsed = parseFloat(amount);
    if (selectedAsset && parsed > 0) {
      const timer = setTimeout(() => {
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
      return () => clearTimeout(timer);
    }
  }, [amount, selectedAsset, getRoute, evmChainId, goFast]);

  const handleSelectAsset = useCallback((asset: Asset) => {
    if (asset.chainType === 'stellar' || asset.chainId === 'pubnet' || asset.chainId === 'testnet') {
      navigate(`${ROUTES.BRIDGE}?asset=${asset.symbol}&type=perp`);
      onClose();
      return;
    }
    setSelectedAsset(asset);
    setAmount('');
    setModalStep('form');
  }, [navigate, onClose]);

  const handleSetMax = useCallback(() => {
    if (selectedAsset?.balance) {
      const truncated = Math.floor(selectedAsset.balance * 1e6) / 1e6;
      setAmount(truncated.toString());
    }
  }, [selectedAsset]);

  const handleDeposit = useCallback(async () => {
    if (!selectedAsset || !amount) return;
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

  const handleDismissTracker = useCallback(() => {
    if (autoClearRef.current) clearTimeout(autoClearRef.current);
    tracker.acknowledge();
  }, [tracker]);

  const handleShowTracker = useCallback(() => setModalStep('tracker'), []);

  const evmNetworks = useMemo<{ id: string | number; name: string; logo?: string }[]>(() => {
    const evmVals = getEVMChains(network).map(c => ({
      id: c.chainId,
      name: c.name,
      logo: c.logoUrl,
    }));
    const stellarConfig = getStellarConfig(network);
    const stellarVal = {
      id: stellarConfig.chainId,
      name: 'Stellar',
      logo: stellarConfig.logoUrl,
    };
    return [{ id: 'all', name: 'All Networks' }, ...evmVals, stellarVal];
  }, [network]);

  const filteredAssets = useMemo(() => {
    let result = assets.filter(a => {
      if (typeof a.chainId === 'string' && a.chainId.startsWith('dydx-')) return false;
      if (selectedNetwork !== 'all' && a.chainId !== selectedNetwork) return false;
      if ((a.balance || 0) <= 0) return false;
      return true;
    });

    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase();
      result = result.filter(a => a.symbol.toLowerCase().includes(q) || a.name?.toLowerCase().includes(q));
    }

    return result.sort((a, b) => {
      const aBal = a.balance || 0;
      const bBal = b.balance || 0;
      const aUsd = aBal * (a.current_price || 0);
      const bUsd = bBal * (b.current_price || 0);

      if (aBal > 0 && bBal === 0) return -1;
      if (bBal > 0 && aBal === 0) return 1;
      if (aUsd !== bUsd) return bUsd - aUsd;

      const aIdx = PRIORITY_SYMBOLS.indexOf(a.symbol.toUpperCase());
      const bIdx = PRIORITY_SYMBOLS.indexOf(b.symbol.toUpperCase());
      if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
      if (aIdx !== -1) return -1;
      if (bIdx !== -1) return 1;
      return bBal - aBal;
    });
  }, [assets, selectedNetwork, debouncedSearch]);

  const handleCopyAddress = useCallback((e: React.MouseEvent, asset: Asset) => {
    e.stopPropagation();
    if (!asset.address) return;
    navigator.clipboard.writeText(asset.address);
    setCopiedId(asset.id || asset.address);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  const VirtualAssetRow = useCallback(({ index, style }: any) => {
    const asset = filteredAssets[index];
    const chainConfig = getChainById(asset.chainId || 0);
    const usdValue = (asset.balance || 0) * (asset.current_price || 0);

    return (
      <div style={{ ...style, padding: '0 16px' }}>
        <button
          onClick={() => handleSelectAsset(asset)}
          className="group flex w-full items-center justify-between px-3 py-3 rounded-2xl hover:bg-hover transition-all text-left"
        >
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="relative flex-shrink-0">
              <img
                src={asset.image || chainConfig?.logoURI}
                alt=""
                className="w-10 h-10 rounded-full bg-hover object-cover"
              />
              {chainConfig?.logoURI && (
                <img
                  src={chainConfig.logoURI}
                  alt=""
                  className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-secondary"
                />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-bold text-primary">{asset.symbol}</span>
                {asset.isNative ? (
                  <span className="text-[10px] bg-primary text-brand px-1.5 py-1 rounded-md font-black uppercase">
                    Native
                  </span>
                ) : (
                  <span className="text-[10px] bg-tertiary text-muted px-1.5 py-0.5 rounded-md font-bold uppercase overflow-hidden text-ellipsis whitespace-nowrap max-w-[80px]">
                    {asset.address?.slice(0, 6)}...{asset.address?.slice(-4)}
                  </span>
                )}
                {asset.address && !asset.isNative && (
                  <button
                    onClick={e => handleCopyAddress(e, asset)}
                    className="p-1 hover:bg-tertiary rounded-md text-muted transition-colors"
                  >
                    {copiedId === (asset.id || asset.address) ? (
                      <Check className="w-3 h-3 text-success" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </button>
                )}
              </div>
              <div className="text-xs text-muted truncate">{asset.name || asset.symbol}</div>
            </div>
          </div>
          <div className="text-right ml-4">
            <div className="text-[14px] font-bold text-primary">
              {asset.balance?.toLocaleString(undefined, { maximumFractionDigits: 6 })}
            </div>
            <div className="text-xs text-muted">
              ${usdValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
        </button>
      </div>
    );
  }, [filteredAssets, handleSelectAsset, copiedId, handleCopyAddress]);

  const walletBalance = selectedAsset?.balance || 0;

  const amountValidation = validateDepositAmount(
    amountValue,
    walletBalance,
    usdEquivalent,
    MIN_DEPOSIT_USDC
  );
  const equityAfter = parseFloat(totalEquity) + (route?.receivedAmount ?? displayUsd);

  if (!isOpen) return null;

  if (modalStep === 'tracker') {
    const bridgeSucceeded =
      tracker.overallState === 'STATE_COMPLETED_SUCCESS' ||
      currentDepositTx?.status === 'success';

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
            {trackerTxHash && tracker.isTerminal && (
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
          {/* Large Amount Display */}
          <div className="flex flex-col items-center justify-center py-6 border-b border-color/40">
            <div className="text-3xl font-black text-primary flex items-center gap-2 font-mono">
              {activeAmount || amount}
              <span className="text-sm font-bold text-muted uppercase">
                {activeAssetSymbol || selectedAsset?.symbol || 'USDC'}
              </span>
            </div>
            <div className="text-xs text-muted mt-1.5 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse inline-block" />
              dYdX Deposit
            </div>
          </div>

          {/* Stepper Checklist */}
          {renderStepper()}

          {/* Error Details */}
          {(depositError || (tracker.isError && tracker.errorMessage)) && (
            <div className="p-3 bg-danger/10 border border-danger/20 rounded-xl flex items-start gap-2 animate-in fade-in duration-300">
              <AlertTriangle className="w-4 h-4 text-danger shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-xs font-black text-danger uppercase mb-1">
                  Error Details
                </p>
                <p className="text-[11px] font-bold text-danger/80 break-words">
                  {depositError || tracker.errorMessage}
                </p>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="mt-auto pt-4 space-y-2">
            {tracker.isTerminal || step === 'success' ? (
              <button
                onClick={() => {
                  handleDismissTracker();
                  setModalStep('form');
                }}
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

            {/* Cancel & Clear Option */}
            <button
              onClick={() => {
                if (
                  confirm(
                    "Are you sure you want to clear this transaction? This won't cancel the on-chain transfer, but will let you initiate a new one."
                  )
                ) {
                  handleDismissTracker();
                  reset();
                  setModalStep('form');
                }
              }}
              className="w-full py-2.5 rounded-xl border border-color text-xs text-muted hover:text-danger hover:bg-danger/5 transition-colors font-semibold"
            >
              Clear Stated Transaction
            </button>
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

  if (modalStep === 'select_token') {
    return (
      <ModalShell onClose={onClose} className="!max-h-[85vh] h-[85vh] sm:h-[640px]">
        <div className="flex items-center gap-3 px-5 pt-5 pb-3 shrink-0 border-b border-color">
          <button
            onClick={() => {
              setModalStep('form');
              setSearchQuery('');
              setSelectedNetwork('all');
            }}
            className="p-1.5 -ml-1 text-muted hover:text-primary transition-colors rounded-lg hover:bg-hover"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h3 className="text-lg font-semibold text-primary">Select token</h3>
        </div>

        <div className="px-5 pt-3 pb-3">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" size={16} />
            <input
              type="text"
              placeholder="Search tokens"
              className="w-full bg-secondary border border-color pl-11 pr-4 py-2.5 rounded-xl text-sm focus:ring-1 focus:ring-brand/20 transition-all text-primary"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
        <div className="pb-3 flex items-center border-b border-color">
          <div className="pl-5 pr-3 flex-shrink-0">
            <button
              onClick={() => setSelectedNetwork('all')}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all"
              style={
                selectedNetwork === 'all'
                  ? { backgroundColor: '#3b4fd9', color: '#fff', boxShadow: '0 4px 12px #3b4fd940' }
                  : undefined
              }
            >
              All
            </button>
          </div>
          <div className="w-px self-stretch bg-color flex-shrink-0 my-1" />
          <div className="flex gap-2 px-3 flex-1 hide-scrollbar" style={{ overflowX: 'auto', minWidth: 0 }}>
            {evmNetworks.slice(1).map(net => (
              <button
                key={net.id}
                onClick={() => setSelectedNetwork(net.id)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex-shrink-0"
                style={
                  selectedNetwork === net.id
                    ? { backgroundColor: '#3b4fd9', color: '#fff', boxShadow: '0 4px 12px #3b4fd940' }
                    : undefined
                }
              >
                {net.logo && <img src={net.logo} alt="" className="w-4 h-4 rounded-full" />}
                {net.name}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-hidden">
          {filteredAssets.length > 0 ? (
            <AutoSizer
              renderProp={({ height, width }) => (
                <FixedSizeList
                  height={height || 0}
                  itemCount={filteredAssets.length}
                  itemSize={72}
                  width={width || 0}
                >
                  {VirtualAssetRow}
                </FixedSizeList>
              )}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center px-10">
              <div className="w-16 h-16 bg-tertiary rounded-full flex items-center justify-center mb-4">
                <SearchX size={32} className="text-muted opacity-25" />
              </div>
              <h3 className="text-base font-bold text-primary mb-1">No assets found</h3>
              <p className="text-sm text-muted leading-relaxed">
                {searchQuery ? `No results for "${searchQuery}" on this network.` : 'No assets available on this network.'}
              </p>
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="mt-6 text-brand font-bold text-xs uppercase tracking-widest hover:underline"
                >
                  Clear search
                </button>
              )}
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
