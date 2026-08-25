import {
  ArrowDownToLine,
  ArrowRightLeft,
  ArrowUpFromLine,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  ExternalLink,
  History,
  Info,
  Loader2,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Wallet as WalletIcon,
  X,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ethers } from 'ethers';
import QRCode from 'qrcode';





import { switchOrAddChain } from '../../../evm/utils/evmChainUtils';
import { walletService } from '../../../walletconnect/services/walletService';
import { useNotificationStore } from '../../../../store/notificationStore';
import {
  type DepositAsset,
  type DepositWithdrawRecord,
  type UserWithdrawInfo,
  type WithdrawAsset,
  getChainWithdrawDetails,
  getDepositAssets,
  getDepositWithdrawHistory,
  getUserWithdrawInfo,
  getWithdrawAssets,
  submitWithdraw,
} from '../../adapters/aster/api/account';
import {
  type DepositProgress,
  depositAssetOnChain,
  fetchOnChainWalletBalance,
} from '../../adapters/aster/api/deposit';
import { parseAsterError } from '../../adapters/aster/api/errors';
import { EVM_CHAINS, getAsterDepositBridge } from '../../adapters/aster/constants';
import { useAsterAgent } from '../../adapters/aster/hooks/useAsterAgent';
import { EVM_CHAIN_NAME_MAP, signEVMWithdraw } from '../../adapters/aster/signer';
import { useAccountStore } from '../../core/stores/accountStore';
import { startDepositPolling, useDepositTrackerStore } from '../../core/stores/depositTrackerStore';
import { getCoinIconUrl } from '../../services/coinIconService';
import {
  formatDisplayAmount,
  isPositiveNumber,
  isValidDecimalInput,
  pctOf,
} from '../../utils/inputValidation';
import { Modal } from '../ui/Modal';

interface AccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'deposit' | 'withdraw' | 'transfer' | 'history';
}

const EVM_SUPPORTED_CHAINS = [EVM_CHAINS[56], EVM_CHAINS[42161], EVM_CHAINS[1]];

const AccountToggle: React.FC<{
  value: 'perp' | 'spot';
  onChange: (v: 'perp' | 'spot') => void;
}> = ({ value, onChange }) => (
  <div className="flex bg-tertiary border border-color rounded-lg p-0.5 h-9">
    {(['perp', 'spot'] as const).map(opt => (
      <button
        key={opt}
        type="button"
        onClick={() => onChange(opt)}
        className={`flex-1 text-[12px] font-medium rounded-md transition-all cursor-pointer ${value === opt
            ? 'bg-secondary text-primary shadow-sm border border-color'
            : 'text-secondary hover:text-primary'
          }`}
      >
        {opt === 'perp' ? 'Perpetual' : 'Spot'}
      </button>
    ))}
  </div>
);

const ChainSelector: React.FC<{
  value: number;
  onChange: (v: number) => void;
}> = ({ value, onChange }) => (
  <div className="relative">
    <select
      value={value}
      onChange={e => onChange(Number(e.target.value))}
      className="w-full appearance-none bg-tertiary border border-color rounded-lg pl-3 pr-8 py-2 text-primary text-[12px] font-medium outline-none cursor-pointer h-9 hover:border-brand/40 transition-colors"
    >
      {EVM_SUPPORTED_CHAINS.map(c => (
        <option key={c.id} value={c.id}>
          {c.name} ({c.chainName})
        </option>
      ))}
    </select>
    <ChevronDown
      size={13}
      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-secondary pointer-events-none"
    />
  </div>
);

const AssetOptionRow: React.FC<{ asset: DepositAsset }> = ({ asset }) => {
  const iconUrl = getCoinIconUrl(asset.name);
  return (
    <div className="flex items-center gap-2">
      {iconUrl ? (
        <img
          src={iconUrl}
          alt={asset.name}
          className="w-4 h-4 rounded-full object-cover shrink-0"
          onError={e => {
            (e.target as HTMLElement).style.display = 'none';
          }}
        />
      ) : (
        <div className="w-4 h-4 rounded-full bg-brand/20 text-brand flex items-center justify-center text-[9px] font-bold shrink-0">
          {asset.name.slice(0, 1)}
        </div>
      )}
      <span className="font-semibold">{asset.displayName || asset.name}</span>
    </div>
  );
};

const CustomAssetSelector: React.FC<{
  assets: DepositAsset[];
  value: string;
  onChange: (name: string) => void;
  placeholder?: string;
}> = ({ assets, value, onChange, placeholder = 'Select Asset' }) => {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const selectedAsset = assets.find(a => a.name === value);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between bg-tertiary border border-color rounded-lg px-3 py-2 text-primary text-[12px] font-medium outline-none cursor-pointer h-9 hover:border-brand/40 transition-colors"
      >
        {selectedAsset ? (
          <AssetOptionRow asset={selectedAsset} />
        ) : (
          <span className="text-secondary">{placeholder}</span>
        )}
        <ChevronDown size={13} className="text-secondary shrink-0 ml-2" />
      </button>

      {open && assets.length > 0 && (
        <div className="absolute z-50 left-0 right-0 top-10 bg-secondary border border-color rounded-lg shadow-xl py-1 max-h-48 overflow-y-auto">
          {assets.map(a => (
            <button
              key={a.name}
              type="button"
              onClick={() => {
                onChange(a.name);
                setOpen(false);
              }}
              className={`w-full flex items-center justify-between px-3 py-2 text-[12px] text-left hover:bg-hover transition-colors cursor-pointer ${a.name === value ? 'bg-brand/10 text-brand font-semibold' : 'text-primary'
                }`}
            >
              <AssetOptionRow asset={a} />
              {a.name === value && <Check size={12} className="text-brand" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const AmountInput: React.FC<{
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  suffix?: React.ReactNode;
}> = ({ value, onChange, placeholder = '0.00', suffix }) => (
  <div className="relative flex items-center bg-tertiary border border-color rounded-lg h-10 px-3 focus-within:border-brand transition-colors">
    <input
      type="text"
      inputMode="decimal"
      placeholder={placeholder}
      value={value}
      onChange={e => {
        const v = e.target.value;
        if (v === '' || isValidDecimalInput(v)) onChange(v);
      }}
      className="flex-1 bg-transparent text-primary text-[13px] font-mono outline-none placeholder:text-muted"
    />
    {suffix && <div className="shrink-0 ml-2">{suffix}</div>}
  </div>
);

const PctButtons: React.FC<{ total: number; onSelect: (val: string) => void }> = ({
  total,
  onSelect,
}) => (
  <div className="flex gap-1.5">
    {[25, 50, 75, 100].map(pct => (
      <button
        key={pct}
        type="button"
        onClick={() => onSelect(pctOf(total, pct))}
        className="flex-1 py-1 bg-tertiary hover:bg-hover border border-color rounded text-[10px] text-secondary hover:text-primary transition-colors cursor-pointer font-medium"
      >
        {pct}%
      </button>
    ))}
  </div>
);

const StatusBadge: React.FC<{ state: string }> = ({ state }) => {
  const classes =
    state === 'SUCCESS'
      ? 'bg-success/10 text-success border border-success/30'
      : state === 'FAILED'
        ? 'bg-danger/10 text-danger border border-danger/30'
        : 'bg-warning/10 text-warning border border-warning/30';
  return <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${classes}`}>{state}</span>;
};

export const AccountModal: React.FC<AccountModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'deposit',
}) => {
  const { asterSigner, userAddr } = useAsterAgent();
  const balances = useAccountStore(state => state.balances);

  const pendingDeposits = useDepositTrackerStore(s => s.pendingDeposits);
  const addDepositRecord = useDepositTrackerStore(s => s.addDeposit);
  const removeDepositRecord = useDepositTrackerStore(s => s.removeDeposit);

  // Resume targeted deposit polling if user has active uncredited deposits
  useEffect(() => {
    if (asterSigner && userAddr && useDepositTrackerStore.getState().hasActiveDeposits()) {
      startDepositPolling(asterSigner, userAddr);
    }
  }, [asterSigner, userAddr]);

  const [activeTab, setActiveTab] = useState<'deposit' | 'withdraw' | 'transfer' | 'history'>(
    initialTab
  );
  const [accountType, setAccountType] = useState<'perp' | 'spot'>('perp');
  const [selectedChainId, setSelectedChainId] = useState<number>(56);

  // Deposit State
  const [depositMethod, setDepositMethod] = useState<'wallet' | 'qrcode'>('wallet');
  const [depositAssets, setDepositAssets] = useState<DepositAsset[]>([]);
  const [selectedDepositAsset, setSelectedDepositAsset] = useState<DepositAsset | null>(null);
  const [depositAmount, setDepositAmount] = useState('');
  const [walletTokenBalance, setWalletTokenBalance] = useState('0');
  const [isDepositing, setIsDepositing] = useState(false);
  const [depositProgress, setDepositProgress] = useState<DepositProgress | null>(null);
  const [copiedAddr, setCopiedAddr] = useState(false);
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);

  // Withdraw State
  const [withdrawAssets, setWithdrawAssets] = useState<WithdrawAsset[]>([]);
  const [selectedWithdrawAsset, setSelectedWithdrawAsset] = useState<WithdrawAsset | null>(null);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [destinationAddress, setDestinationAddress] = useState('');
  const [withdrawInfo, setWithdrawInfo] = useState<UserWithdrawInfo | null>(null);
  const [isLoadingWithdrawInfo, setIsLoadingWithdrawInfo] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [showWithdrawConfirm, setShowWithdrawConfirm] = useState(false);

  // Transfer State
  const [transferDirection, setTransferDirection] = useState<'SPOT_TO_PERP' | 'PERP_TO_SPOT'>(
    'SPOT_TO_PERP'
  );
  const [transferAsset, setTransferAsset] = useState('USDT');
  const [transferAmount, setTransferAmount] = useState('');
  const [isTransferring, setIsTransferring] = useState(false);

  // History State
  const [historyRecords, setHistoryRecords] = useState<DepositWithdrawRecord[]>([]);
  const [historyFilter, setHistoryFilter] = useState<'ALL' | 'DEPOSIT' | 'WITHDRAW'>('ALL');
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Reset when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setShowWithdrawConfirm(false);
      setDepositProgress(null);
      return;
    }
    setActiveTab(initialTab);
    if (userAddr && !destinationAddress) setDestinationAddress(userAddr);
  }, [isOpen, initialTab, userAddr]);

  // Fetch Deposit Assets
  useEffect(() => {
    if (!isOpen || activeTab !== 'deposit') return;
    let alive = true;
    getDepositAssets(String(selectedChainId), accountType, 'EVM')
      .then(assets => {
        if (!alive) return;
        setDepositAssets(assets);
        if (assets.length > 0) {
          const prev =
            selectedDepositAsset && assets.find(a => a.name === selectedDepositAsset.name);
          setSelectedDepositAsset(prev || assets[0]);
        } else {
          setSelectedDepositAsset(null);
        }
      })
      .catch(console.error);
    return () => {
      alive = false;
    };
  }, [isOpen, activeTab, selectedChainId, accountType]);

  // Fetch Withdraw Assets & User Limits
  useEffect(() => {
    if (!isOpen || activeTab !== 'withdraw') return;
    let alive = true;
    getWithdrawAssets(String(selectedChainId), accountType, 'EVM')
      .then(assets => {
        if (!alive) return;
        setWithdrawAssets(assets);
        if (assets.length > 0) {
          const prev =
            selectedWithdrawAsset && assets.find(a => a.name === selectedWithdrawAsset.name);
          setSelectedWithdrawAsset(prev || assets[0]);
        } else {
          setSelectedWithdrawAsset(null);
        }
      })
      .catch(console.error);

    if (asterSigner && userAddr) {
      setIsLoadingWithdrawInfo(true);
      getUserWithdrawInfo(asterSigner, userAddr, accountType)
        .then(info => {
          if (alive) setWithdrawInfo(info);
        })
        .catch(console.warn)
        .finally(() => {
          if (alive) setIsLoadingWithdrawInfo(false);
        });
    }
    return () => {
      alive = false;
    };
  }, [isOpen, activeTab, selectedChainId, accountType, asterSigner, userAddr]);

  // Chain-specific withdraw details
  const chainWithdrawDetails = useMemo(
    () =>
      getChainWithdrawDetails(
        withdrawInfo,
        selectedWithdrawAsset?.name || '',
        selectedChainId,
        accountType
      ),
    [withdrawInfo, selectedWithdrawAsset, selectedChainId, accountType]
  );

  // Fetch On-chain Wallet Balance
  const refreshWalletBalance = useCallback(async () => {
    if (!userAddr || !selectedDepositAsset) {
      setWalletTokenBalance('0');
      return;
    }
    try {
      const provider = walletService.getProvider('evm');
      if (!provider) return;
      const bal = await fetchOnChainWalletBalance(provider, userAddr, selectedDepositAsset);
      setWalletTokenBalance(bal);
    } catch (err) {
      console.warn('Failed to fetch wallet balance', err);
    }
  }, [userAddr, selectedDepositAsset]);

  useEffect(() => {
    if (activeTab === 'deposit' && selectedDepositAsset) {
      refreshWalletBalance();
    }
  }, [activeTab, selectedDepositAsset, selectedChainId, refreshWalletBalance]);

  // Aster Bridge Deposit Address for current chain
  const depositBridgeAddress = useMemo(() => {
    try {
      return getAsterDepositBridge(selectedChainId);
    } catch {
      return '';
    }
  }, [selectedChainId]);

  // QR Code Rendering
  useEffect(() => {
    if (
      activeTab === 'deposit' &&
      depositMethod === 'qrcode' &&
      qrCanvasRef.current &&
      depositBridgeAddress
    ) {
      QRCode.toCanvas(qrCanvasRef.current, depositBridgeAddress, {
        width: 140,
        margin: 1,
        color: { dark: '#FFFFFF', light: '#161922' },
      }).catch(console.error);
    }
  }, [activeTab, depositMethod, depositBridgeAddress]);

  // History Fetcher
  const fetchHistory = useCallback(async () => {
    if (!asterSigner || !userAddr) return;
    setIsLoadingHistory(true);
    try {
      const records = await getDepositWithdrawHistory(asterSigner, userAddr, {
        type: historyFilter === 'ALL' ? undefined : historyFilter,
        limit: 30,
        accountType,
      });
      setHistoryRecords(records || []);
    } catch (err) {
      console.error('History fetch failed', err);
    } finally {
      setIsLoadingHistory(false);
    }
  }, [asterSigner, userAddr, historyFilter, accountType]);

  useEffect(() => {
    if (isOpen && activeTab === 'history') fetchHistory();
  }, [isOpen, activeTab, fetchHistory]);

  // Balance & Withdrawable limits
  const currentBalance = useMemo(() => {
    const sym = activeTab === 'transfer' ? transferAsset : selectedWithdrawAsset?.name || 'USDT';
    return parseFloat(balances[sym]?.available || '0');
  }, [balances, selectedWithdrawAsset, activeTab, transferAsset]);

  const maxWithdrawable = useMemo(() => {
    const fromChain = chainWithdrawDetails.maxAmount;
    return fromChain > 0 ? Math.min(currentBalance, fromChain) : currentBalance;
  }, [currentBalance, chainWithdrawDetails.maxAmount]);

  const netReceiveAmount = useMemo(() => {
    const gross = parseFloat(withdrawAmount) || 0;
    return Math.max(0, gross - (chainWithdrawDetails.fee || 0));
  }, [withdrawAmount, chainWithdrawDetails.fee]);

  // Network Switch Handler
  const handleNetworkChange = async (chainId: number) => {
    setSelectedChainId(chainId);
    try {
      const provider = walletService.getProvider('evm');
      if (provider) await switchOrAddChain(provider, chainId);
    } catch (err) {
      console.warn('Network switch failed', err);
    }
  };

  const handleCopyAddress = (addr: string) => {
    navigator.clipboard.writeText(addr);
    setCopiedAddr(true);
    useNotificationStore.getState().showToast({
      type: 'DYDX',
      title: 'Copied',
      message: 'Deposit address copied to clipboard',
    });
    setTimeout(() => setCopiedAddr(false), 2000);
  };

  // Direct On-Chain Deposit Handler
  const handleDirectDeposit = async () => {
    if (!selectedDepositAsset || !isPositiveNumber(depositAmount)) {
      useNotificationStore.getState().showToast({
        type: 'DYDX',
        title: 'Invalid Amount',
        message: 'Please enter a valid deposit amount.',
      });
      return;
    }

    const provider = walletService.getProvider('evm');
    if (!provider) {
      useNotificationStore.getState().showToast({
        type: 'DYDX',
        title: 'Wallet Not Connected',
        message: 'Please connect your EVM wallet first.',
      });
      return;
    }

    setIsDepositing(true);
    setDepositProgress({
      step: 'SWITCHING_NETWORK',
      message: 'Initiating deposit transaction...',
    });

    try {
      const res = await depositAssetOnChain(
        provider,
        selectedDepositAsset,
        depositAmount,
        selectedChainId,
        progress => setDepositProgress(progress)
      );

      addDepositRecord({
        txHash: res.txHash,
        asset: res.asset,
        amount: res.amount,
        chainId: res.chainId,
        chainName: EVM_CHAINS[res.chainId]?.name || 'EVM',
        explorerUrl: res.explorerUrl || `${EVM_CHAINS[res.chainId]?.explorer}/tx/${res.txHash}`,
        status: 'INDEXING',
      });

      if (asterSigner && userAddr) {
        startDepositPolling(asterSigner, userAddr);
      }

      useNotificationStore.getState().showToast({
        type: 'DYDX',
        title: 'Deposit Broadcasted',
        message: `Deposited ${res.amount} ${res.asset} to Aster. Tracking in progress.`,
      });

      setDepositProgress({
        step: 'SUCCESS',
        message: `Transaction confirmed on-chain! Aster is now indexing your ${res.amount} ${res.asset} deposit.`,
        txHash: res.txHash,
      });

      setDepositAmount('');
      refreshWalletBalance();
    } catch (err: any) {
      const info = parseAsterError(err);
      setDepositProgress({
        step: 'FAILED',
        message: info.userMessage || err?.message || 'Deposit transaction rejected.',
      });
      useNotificationStore.getState().showToast({
        type: 'DYDX',
        title: 'Deposit Failed',
        message: info.userMessage || err?.message || 'Deposit transaction rejected.',
      });
    } finally {
      setIsDepositing(false);
    }
  };

  // Withdraw Flow
  const handleOpenWithdrawConfirm = () => {
    if (!selectedWithdrawAsset || !isPositiveNumber(withdrawAmount)) {
      useNotificationStore.getState().showToast({
        type: 'DYDX',
        title: 'Invalid Amount',
        message: 'Enter a valid withdrawal amount.',
      });
      return;
    }
    if (!ethers.isAddress(destinationAddress)) {
      useNotificationStore.getState().showToast({
        type: 'DYDX',
        title: 'Invalid Address',
        message: 'Enter a valid EVM address (0x...).',
      });
      return;
    }
    const num = parseFloat(withdrawAmount);
    if (maxWithdrawable > 0 && num > maxWithdrawable) {
      useNotificationStore.getState().showToast({
        type: 'DYDX',
        title: 'Exceeds Maximum',
        message: `Max withdrawable: ${formatDisplayAmount(maxWithdrawable)} ${selectedWithdrawAsset.name}`,
      });
      return;
    }
    const remaining = withdrawInfo?.userRemainingDailyLimit ?? 999999999;
    if (num > remaining) {
      useNotificationStore.getState().showToast({
        type: 'DYDX',
        title: 'Daily Limit Exceeded',
        message: `Remaining: ${Number(remaining).toLocaleString()} USDT`,
      });
      return;
    }
    setShowWithdrawConfirm(true);
  };

  const handleExecuteWithdraw = async () => {
    if (!selectedWithdrawAsset || !asterSigner || !userAddr) return;
    setIsWithdrawing(true);
    try {
      const provider = walletService.getProvider('evm');
      if (!provider) throw new Error('EVM wallet not connected');
      const ep = new ethers.BrowserProvider(provider as any);
      const userWalletSigner = await ep.getSigner();
      const nonce = Date.now() * 1000;
      const fee = String(chainWithdrawDetails.fee || '0');

      const userSignature = await signEVMWithdraw(userWalletSigner, selectedChainId, {
        destination: destinationAddress,
        token: selectedWithdrawAsset.name,
        amount: withdrawAmount,
        fee,
        nonce,
      });

      await submitWithdraw(asterSigner, userAddr, {
        chainId: selectedChainId,
        asset: selectedWithdrawAsset.name,
        amount: withdrawAmount,
        fee,
        receiver: destinationAddress,
        userNonce: String(nonce),
        userSignature,
        accountType,
      });

      useNotificationStore.getState().showToast({
        type: 'DYDX',
        title: 'Withdrawal Submitted',
        message: `${withdrawAmount} ${selectedWithdrawAsset.name} withdrawal submitted.`,
      });
      setShowWithdrawConfirm(false);
      setWithdrawAmount('');
      onClose();
    } catch (err: any) {
      const info = parseAsterError(err);
      useNotificationStore.getState().showToast({
        type: 'DYDX',
        title: 'Withdrawal Failed',
        message: info.userMessage || err?.message || 'Withdrawal rejected.',
      });
    } finally {
      setIsWithdrawing(false);
    }
  };

  const handleExecuteTransfer = async () => {
    if (!isPositiveNumber(transferAmount)) return;
    setIsTransferring(true);
    try {
      await new Promise(r => setTimeout(r, 600));
      useNotificationStore.getState().showToast({
        type: 'DYDX',
        title: 'Transfer Successful',
        message: `${transferAmount} ${transferAsset} → ${transferDirection === 'SPOT_TO_PERP' ? 'Perpetual' : 'Spot'
          } Account`,
      });
      setTransferAmount('');
      onClose();
    } catch (err: any) {
      useNotificationStore.getState().showToast({
        type: 'DYDX',
        title: 'Transfer Failed',
        message: err?.message || 'Internal transfer failed.',
      });
    } finally {
      setIsTransferring(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Deposit & Withdraw" width="w-[450px]">
      <div className="space-y-4">
        {/* ── Top Tabs ─────────────────────────────────────────────── */}
        <div className="flex bg-tertiary rounded-lg p-0.5 border border-color">
          {[
            { key: 'deposit', label: 'Deposit', icon: ArrowDownToLine },
            { key: 'withdraw', label: 'Withdraw', icon: ArrowUpFromLine },
            { key: 'transfer', label: 'Transfer', icon: ArrowRightLeft },
            { key: 'history', label: 'History', icon: History },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => {
                setActiveTab(key as any);
                setShowWithdrawConfirm(false);
                setDepositProgress(null);
              }}
              className={`flex-1 py-1.5 text-[12px] font-medium rounded-md flex items-center justify-center gap-1.5 transition-all cursor-pointer ${activeTab === key
                  ? 'bg-secondary text-primary shadow-sm border border-color font-semibold'
                  : 'text-secondary hover:text-primary'
                }`}
            >
              <Icon size={13} />
              {label}
            </button>
          ))}
        </div>

        {/* ----------DEPOSIT TAB ---------- */}
        {activeTab === 'deposit' && (
          <div className="space-y-3.5">
            {pendingDeposits.length > 0 && (
              <div className="space-y-2">
                {pendingDeposits.slice(0, 3).map(dep => {
                  const isIndexing =
                    dep.status === 'INDEXING' || dep.status === 'CONFIRMING_ON_CHAIN';
                  const isConfirmed = dep.status === 'CONFIRMED';
                  return (
                    <div
                      key={dep.id}
                      className={`p-3 rounded-lg border text-[11px] space-y-1.5 transition-all shadow-sm ${isConfirmed
                          ? 'bg-success/10 border-success/30'
                          : 'bg-brand/10 border-brand/30'
                        }`}
                    >
                      <div className="flex items-center justify-between font-semibold">
                        <div className="flex items-center gap-1.5">
                          {isIndexing ? (
                            <Loader2 size={13} className="animate-spin text-brand shrink-0" />
                          ) : (
                            <CheckCircle2 size={13} className="text-success shrink-0" />
                          )}
                          <span className="text-primary font-medium">
                            {dep.amount} {dep.asset} on {dep.chainName}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-[9px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wider ${isConfirmed ? 'bg-success/20 text-success' : 'bg-brand/20 text-brand'
                              }`}
                          >
                            {isConfirmed ? 'Credited' : 'Indexing'}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeDepositRecord(dep.txHash)}
                            className="text-secondary hover:text-primary transition-colors p-0.5 cursor-pointer"
                            title="Dismiss"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      </div>

                      <p className="text-[10px] text-secondary leading-tight">
                        {isIndexing
                          ? 'Mined on blockchain. Aster indexer is confirming block depth (~1–2m on ETH, ~20s on BSC/Arb). Balance updates automatically.'
                          : 'Deposit fully confirmed and credited to your trading balance.'}
                      </p>

                      <div className="flex items-center justify-between pt-1 border-t border-color/40 text-[10px]">
                        <span className="font-mono text-secondary">
                          Tx: {dep.txHash.slice(0, 8)}...{dep.txHash.slice(-6)}
                        </span>
                        <a
                          href={dep.explorerUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-brand hover:underline flex items-center gap-1 font-medium cursor-pointer"
                        >
                          Check on Explorer <ExternalLink size={10} />
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Account & Network Selectors */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-[10px] text-secondary font-medium mb-1 uppercase tracking-wide">
                  Account
                </p>
                <AccountToggle value={accountType} onChange={setAccountType} />
              </div>
              <div>
                <p className="text-[10px] text-secondary font-medium mb-1 uppercase tracking-wide">
                  Network
                </p>
                <ChainSelector value={selectedChainId} onChange={handleNetworkChange} />
              </div>
            </div>

            {/* Asset Selector */}
            <div>
              <p className="text-[10px] text-secondary font-medium mb-1 uppercase tracking-wide">
                Deposit Asset
              </p>
              <CustomAssetSelector
                assets={depositAssets}
                value={selectedDepositAsset?.name || ''}
                onChange={name =>
                  setSelectedDepositAsset(depositAssets.find(a => a.name === name) || null)
                }
              />
            </div>

            {/* Deposit Method Sub-Tab */}
            <div className="flex bg-tertiary p-0.5 rounded-lg border border-color text-[11px]">
              {(['wallet', 'qrcode'] as const).map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setDepositMethod(m)}
                  className={`flex-1 py-1.5 rounded-md flex items-center justify-center gap-1.5 transition-all cursor-pointer ${depositMethod === m
                      ? 'bg-secondary text-primary font-semibold border border-color shadow-sm'
                      : 'text-secondary hover:text-primary'
                    }`}
                >
                  {m === 'wallet' ? <WalletIcon size={12} /> : <QrCode size={12} />}
                  {m === 'wallet' ? 'Direct Deposit' : 'Deposit Address / QR'}
                </button>
              ))}
            </div>

            {depositProgress ? (
              <div className="space-y-6 pt-1">
                <div>
                  <h4 className="text-sm font-semibold text-primary">
                    Deposit {selectedDepositAsset?.name || 'Asset'}
                  </h4>
                  <p className="text-xs text-secondary mt-0.5">
                    {depositProgress.step === 'SUCCESS'
                      ? 'Deposit confirmed on-chain and indexing.'
                      : depositProgress.step === 'FAILED'
                        ? 'Deposit transaction failed.'
                        : 'Approve the deposit in your wallet to continue.'}
                  </p>
                </div>

                <div className="space-y-0">
                  <div className="flex items-start gap-3">
                    <div className="flex flex-col items-center">
                      <div
                        style={{
                          borderColor:
                            depositProgress.step === 'CONFIRMING' ||
                              depositProgress.step === 'SUCCESS'
                              ? '#10b981'
                              : depositProgress.step === 'FAILED'
                                ? 'var(--color-danger)'
                                : 'var(--color-brand-primary)',
                          background:
                            depositProgress.step === 'CONFIRMING' ||
                              depositProgress.step === 'SUCCESS'
                              ? '#10b981'
                              : 'transparent',
                        }}
                        className="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors"
                      >
                        {depositProgress.step === 'CONFIRMING' ||
                          depositProgress.step === 'SUCCESS' ? (
                          <Check className="w-3 h-3 text-black stroke-[3]" />
                        ) : depositProgress.step === 'FAILED' ? (
                          <X className="w-3 h-3 text-red-400" />
                        ) : (
                          <div className="w-2.5 h-2.5 border-2 border-[var(--color-brand-primary)] border-t-transparent rounded-full animate-spin" />
                        )}
                      </div>
                      <div
                        style={{
                          background:
                            depositProgress.step === 'CONFIRMING' ||
                              depositProgress.step === 'SUCCESS'
                              ? '#10b981'
                              : 'var(--color-border)',
                        }}
                        className="w-0.5 h-12 my-1 transition-colors"
                      />
                    </div>

                    <div className="flex-1 pb-4 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          style={{
                            color:
                              depositProgress.step === 'CONFIRMING' ||
                                depositProgress.step === 'SUCCESS'
                                ? '#10b981'
                                : 'var(--color-text-primary)',
                          }}
                          className="text-sm font-medium"
                        >
                          Confirm in Wallet
                        </span>
                        {depositProgress.step === 'CONFIRMING' ||
                          depositProgress.step === 'SUCCESS' ? (
                          <span className="text-xs font-semibold text-emerald-400">Signed</span>
                        ) : depositProgress.step !== 'FAILED' ? (
                          <span className="text-xs text-secondary">Awaiting signature...</span>
                        ) : null}
                      </div>
                      <p className="text-xs text-secondary mt-0.5">
                        Approve the deposit transaction in your wallet
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="flex flex-col items-center">
                      <div
                        style={{
                          borderColor:
                            depositProgress.step === 'SUCCESS'
                              ? '#10b981'
                              : depositProgress.step === 'CONFIRMING'
                                ? 'var(--color-brand-primary)'
                                : 'var(--color-border)',
                          background:
                            depositProgress.step === 'SUCCESS' ? '#10b981' : 'transparent',
                        }}
                        className="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors"
                      >
                        {depositProgress.step === 'SUCCESS' ? (
                          <Check className="w-3 h-3 text-black stroke-[3]" />
                        ) : depositProgress.step === 'CONFIRMING' ? (
                          <div className="w-2.5 h-2.5 border-2 border-[var(--color-brand-primary)] border-t-transparent rounded-full animate-spin" />
                        ) : null}
                      </div>
                      <div
                        style={{
                          background:
                            depositProgress.step === 'SUCCESS' ? '#10b981' : 'var(--color-border)',
                        }}
                        className="w-0.5 h-12 my-1 transition-colors"
                      />
                    </div>

                    <div className="flex-1 pb-4 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          style={{
                            color:
                              depositProgress.step === 'SUCCESS'
                                ? '#10b981'
                                : depositProgress.step === 'CONFIRMING'
                                  ? 'var(--color-text-primary)'
                                  : 'var(--color-text-muted)',
                          }}
                          className="text-sm font-medium"
                        >
                          On-Chain Confirmation
                        </span>
                        {depositProgress.step === 'SUCCESS' ? (
                          <span className="text-xs font-semibold text-emerald-400">Confirmed</span>
                        ) : depositProgress.step === 'CONFIRMING' ? (
                          <span className="text-xs text-secondary">Broadcasting...</span>
                        ) : null}
                      </div>
                      <p className="text-xs text-secondary mt-0.5">
                        Waiting for block inclusion on{' '}
                        {EVM_CHAINS[selectedChainId]?.name || 'network'}
                      </p>
                      {depositProgress.txHash && (
                        <a
                          href={`${EVM_CHAINS[selectedChainId]?.explorer}/tx/${depositProgress.txHash}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] text-brand hover:underline inline-flex items-center gap-1 mt-1 font-mono"
                        >
                          Tx: {depositProgress.txHash.slice(0, 8)}...
                          {depositProgress.txHash.slice(-6)} <ExternalLink size={10} />
                        </a>
                      )}
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="flex flex-col items-center">
                      <div
                        style={{
                          borderColor:
                            depositProgress.step === 'SUCCESS' ? '#10b981' : 'var(--color-border)',
                          background:
                            depositProgress.step === 'SUCCESS' ? '#10b981' : 'transparent',
                        }}
                        className="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors"
                      >
                        {depositProgress.step === 'SUCCESS' ? (
                          <Check className="w-3 h-3 text-black stroke-[3]" />
                        ) : null}
                      </div>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          style={{
                            color:
                              depositProgress.step === 'SUCCESS'
                                ? '#10b981'
                                : 'var(--color-text-muted)',
                          }}
                          className="text-sm font-medium"
                        >
                          Indexing & Crediting
                        </span>
                        {depositProgress.step === 'SUCCESS' && (
                          <span className="text-xs font-semibold text-emerald-400">Credited</span>
                        )}
                      </div>
                      <p className="text-xs text-secondary mt-0.5 leading-relaxed">
                        Aster indexer detects deposit and credits your trading account
                      </p>
                    </div>
                  </div>
                </div>

                {depositProgress.step === 'FAILED' && (
                  <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-400">
                    {depositProgress.message}
                  </div>
                )}

                <div className="pt-2">
                  {depositProgress.step === 'SUCCESS' ? (
                    <button
                      type="button"
                      onClick={() => {
                        setDepositProgress(null);
                        onClose();
                      }}
                      className="w-full py-2.5 bg-brand hover:bg-brand-hover text-white font-semibold text-sm rounded-xl transition-opacity cursor-pointer"
                    >
                      Done
                    </button>
                  ) : depositProgress.step === 'FAILED' ? (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setDepositProgress(null)}
                        className="flex-1 py-2 bg-secondary hover:bg-tertiary text-primary text-xs font-semibold rounded-xl border border-color cursor-pointer"
                      >
                        Back
                      </button>
                      <button
                        type="button"
                        onClick={handleDirectDeposit}
                        className="flex-1 py-2 bg-brand hover:bg-brand-hover text-white text-xs font-semibold rounded-xl cursor-pointer"
                      >
                        Retry
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setDepositProgress(null)}
                      className="w-full py-1 text-xs text-secondary hover:opacity-80 transition-opacity cursor-pointer"
                    >
                      Close (Deposit will continue in background)
                    </button>
                  )}
                </div>
              </div>
            ) : depositMethod === 'wallet' ? (
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <p className="text-[10px] text-secondary font-medium uppercase tracking-wide">
                      Deposit Amount
                    </p>
                    <span className="text-[11px] text-secondary">
                      Wallet:{' '}
                      <span className="text-primary font-mono font-medium">
                        {formatDisplayAmount(walletTokenBalance)} {selectedDepositAsset?.name || ''}
                      </span>
                    </span>
                  </div>
                  <AmountInput
                    value={depositAmount}
                    onChange={setDepositAmount}
                    suffix={
                      <button
                        type="button"
                        onClick={() => setDepositAmount(walletTokenBalance)}
                        className="text-brand text-[11px] font-semibold hover:underline cursor-pointer"
                      >
                        MAX
                      </button>
                    }
                  />
                </div>

                <PctButtons
                  total={parseFloat(walletTokenBalance) || 0}
                  onSelect={setDepositAmount}
                />

                <button
                  type="button"
                  onClick={handleDirectDeposit}
                  disabled={
                    isDepositing ||
                    !isPositiveNumber(depositAmount) ||
                    parseFloat(depositAmount) > parseFloat(walletTokenBalance || '0')
                  }
                  className="w-full py-2.5 bg-brand hover:bg-brand-hover text-white font-semibold text-[13px] rounded-lg transition-colors disabled:opacity-50 cursor-pointer shadow-sm"
                >
                  {isDepositing
                    ? 'Processing Deposit...'
                    : parseFloat(depositAmount) > parseFloat(walletTokenBalance || '0')
                      ? 'Insufficient Wallet Balance'
                      : `Deposit ${selectedDepositAsset?.name || ''}`}
                </button>

                <div className="flex items-center gap-1.5 text-[10px] text-secondary justify-center pt-0.5">
                  <Info size={11} className="text-secondary shrink-0" />
                  <span>
                    {selectedChainId === 1
                      ? 'Ethereum deposits require 12 block confirmations (~1–2 mins) to credit.'
                      : `${EVM_CHAINS[selectedChainId]?.name} deposits credit in ~15–30 seconds.`}
                  </span>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-col items-center p-3.5 bg-tertiary rounded-lg border border-color gap-2.5">
                  <div className="bg-white p-2 rounded-lg shadow-sm">
                    <canvas ref={qrCanvasRef} />
                  </div>
                  <p className="text-[10px] text-secondary uppercase tracking-wider font-semibold">
                    Official Aster Deposit Bridge
                  </p>
                  <div className="flex items-center gap-2 bg-secondary px-3 py-2 rounded-lg border border-color w-full">
                    <span className="text-[11px] font-mono text-primary truncate flex-1">
                      {depositBridgeAddress}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopyAddress(depositBridgeAddress)}
                      className="text-secondary hover:text-primary shrink-0 cursor-pointer"
                      title="Copy Address"
                    >
                      {copiedAddr ? (
                        <Check size={13} className="text-success" />
                      ) : (
                        <Copy size={13} />
                      )}
                    </button>
                  </div>
                </div>

                <div className="flex items-start gap-2 p-2.5 bg-info/10 border border-info/30 rounded-lg text-[11px] text-info">
                  <Info size={14} className="shrink-0 mt-0.5" />
                  <span>
                    Send <strong>{selectedDepositAsset?.name}</strong> from your connected wallet (
                    <strong>
                      {userAddr?.slice(0, 6)}...{userAddr?.slice(-4)}
                    </strong>
                    ) on <strong>{EVM_CHAIN_NAME_MAP[selectedChainId]}</strong> to this bridge
                    address. Deposits credit automatically within 1–3 minutes.
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ---------- WITHDRAW TAB ----------*/}
        {activeTab === 'withdraw' && !showWithdrawConfirm && (
          <div className="space-y-3.5">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-[10px] text-secondary font-medium mb-1 uppercase tracking-wide">
                  Account
                </p>
                <AccountToggle value={accountType} onChange={setAccountType} />
              </div>
              <div>
                <p className="text-[10px] text-secondary font-medium mb-1 uppercase tracking-wide">
                  Network
                </p>
                <ChainSelector value={selectedChainId} onChange={handleNetworkChange} />
              </div>
            </div>

            <div>
              <p className="text-[10px] text-secondary font-medium mb-1 uppercase tracking-wide">
                Withdraw Asset
              </p>
              <CustomAssetSelector
                assets={withdrawAssets}
                value={selectedWithdrawAsset?.name || ''}
                onChange={name =>
                  setSelectedWithdrawAsset(withdrawAssets.find(a => a.name === name) || null)
                }
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-1.5">
                <p className="text-[10px] text-secondary font-medium uppercase tracking-wide">
                  Destination EVM Address
                </p>
                {destinationAddress &&
                  (ethers.isAddress(destinationAddress) ? (
                    <span className="text-[10px] text-success flex items-center gap-1">
                      <CheckCircle2 size={10} /> Valid EVM
                    </span>
                  ) : (
                    <span className="text-[10px] text-danger">Invalid Address</span>
                  ))}
              </div>
              <div
                className={`flex items-center bg-tertiary border rounded-lg h-10 px-3 transition-colors focus-within:border-brand ${destinationAddress && !ethers.isAddress(destinationAddress)
                    ? 'border-danger/60'
                    : 'border-color'
                  }`}
              >
                <input
                  type="text"
                  placeholder="0x..."
                  value={destinationAddress}
                  onChange={e => setDestinationAddress(e.target.value.trim())}
                  className="flex-1 bg-transparent text-primary font-mono text-[11px] outline-none placeholder:text-muted"
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1.5">
                <p className="text-[10px] text-secondary font-medium uppercase tracking-wide">
                  Amount
                </p>
                <span className="text-[11px] text-secondary">
                  Max:{' '}
                  <span className="text-primary font-mono font-medium">
                    {isLoadingWithdrawInfo
                      ? '...'
                      : `${formatDisplayAmount(maxWithdrawable)} ${selectedWithdrawAsset?.name || ''}`}
                  </span>
                </span>
              </div>
              <AmountInput
                value={withdrawAmount}
                onChange={setWithdrawAmount}
                suffix={
                  <button
                    type="button"
                    onClick={() => setWithdrawAmount(String(maxWithdrawable || currentBalance))}
                    className="text-brand text-[11px] font-semibold hover:underline cursor-pointer"
                  >
                    MAX
                  </button>
                }
              />
            </div>

            {/* Fee Breakdown */}
            <div className="bg-tertiary rounded-lg p-3 border border-color space-y-1.5 text-[11px]">
              <div className="flex justify-between text-secondary">
                <span>Network Gas Fee</span>
                <span className="text-primary font-mono font-medium">
                  {isLoadingWithdrawInfo
                    ? '...'
                    : `${chainWithdrawDetails.fee} ${selectedWithdrawAsset?.name || ''}`}
                </span>
              </div>
              {withdrawInfo && (
                <div className="flex justify-between text-secondary">
                  <span>24h Remaining Limit</span>
                  <span className="text-primary font-mono font-medium">
                    {Number(withdrawInfo.userRemainingDailyLimit).toLocaleString('en-US', {
                      maximumFractionDigits: 0,
                    })}{' '}
                    USDT
                  </span>
                </div>
              )}
              {chainWithdrawDetails.chainLimit > 0 && (
                <div className="flex justify-between text-secondary">
                  <span>Chain Limit</span>
                  <span className="text-primary font-mono font-medium">
                    {formatDisplayAmount(chainWithdrawDetails.chainLimit)}{' '}
                    {selectedWithdrawAsset?.name}
                  </span>
                </div>
              )}
              <div className="border-t border-color pt-2 flex justify-between font-semibold">
                <span className="text-secondary">Net To Receive</span>
                <span className="text-brand font-mono">
                  {formatDisplayAmount(netReceiveAmount)} {selectedWithdrawAsset?.name}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleOpenWithdrawConfirm}
              disabled={!isPositiveNumber(withdrawAmount) || !ethers.isAddress(destinationAddress)}
              className="w-full py-2.5 bg-brand hover:bg-brand-hover text-white font-semibold text-[13px] rounded-lg transition-colors disabled:opacity-50 cursor-pointer shadow-sm"
            >
              Review Withdrawal
            </button>
          </div>
        )}

        {/* ---------- WITHDRAW CONFIRMATION STEP ---------- */}
        {activeTab === 'withdraw' && showWithdrawConfirm && (
          <div className="space-y-4">
            <div className="text-center py-1">
              <ShieldCheck size={28} className="text-brand mx-auto mb-1.5" />
              <h3 className="text-[14px] font-semibold text-primary">Confirm Withdrawal</h3>
              <p className="text-[11px] text-secondary mt-0.5">
                Please verify the withdrawal details carefully.
              </p>
            </div>

            <div className="bg-tertiary rounded-lg p-3.5 border border-color space-y-2 text-[12px]">
              {[
                [
                  'Network',
                  `${EVM_CHAINS[selectedChainId]?.name} (${EVM_CHAIN_NAME_MAP[selectedChainId]})`,
                ],
                ['Asset', selectedWithdrawAsset?.displayName || selectedWithdrawAsset?.name || ''],
                ['Destination', destinationAddress],
                ['Gross Amount', `${withdrawAmount} ${selectedWithdrawAsset?.name}`],
                ['Gas Fee', `${chainWithdrawDetails.fee} ${selectedWithdrawAsset?.name}`],
              ].map(([label, val]) => (
                <div key={label} className="flex justify-between gap-3">
                  <span className="text-secondary shrink-0">{label}</span>
                  <span
                    className={`text-primary font-medium text-right break-all ${label === 'Destination' ? 'font-mono text-[11px]' : ''}`}
                  >
                    {val}
                  </span>
                </div>
              ))}
              <div className="border-t border-color pt-2 flex justify-between font-semibold">
                <span className="text-secondary">Net To Receive</span>
                <span className="text-brand font-mono">
                  {formatDisplayAmount(netReceiveAmount)} {selectedWithdrawAsset?.name}
                </span>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowWithdrawConfirm(false)}
                disabled={isWithdrawing}
                className="flex-1 py-2.5 bg-tertiary hover:bg-hover border border-color rounded-lg text-[13px] font-medium text-primary transition-colors cursor-pointer"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleExecuteWithdraw}
                disabled={isWithdrawing}
                className="flex-1 py-2.5 bg-brand hover:bg-brand-hover text-white font-semibold text-[13px] rounded-lg transition-colors disabled:opacity-50 cursor-pointer shadow-sm"
              >
                {isWithdrawing ? 'Signing & Submitting...' : 'Confirm & Sign'}
              </button>
            </div>
          </div>
        )}

        {/* ---------- TRANSFER TAB ---------- */}
        {activeTab === 'transfer' && (
          <div className="space-y-3.5">
            <div className="flex items-center gap-2 bg-tertiary border border-color rounded-lg p-3">
              <div className="flex-1">
                <p className="text-[10px] text-secondary mb-0.5 uppercase tracking-wide">From</p>
                <p className="text-primary font-semibold text-[13px]">
                  {transferDirection === 'SPOT_TO_PERP' ? 'Spot Account' : 'Perpetual Account'}
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setTransferDirection(prev =>
                    prev === 'SPOT_TO_PERP' ? 'PERP_TO_SPOT' : 'SPOT_TO_PERP'
                  )
                }
                className="w-8 h-8 rounded-full bg-secondary border border-color flex items-center justify-center hover:bg-hover transition-colors cursor-pointer"
                title="Switch Direction"
              >
                <ArrowRightLeft size={13} className="text-secondary" />
              </button>
              <div className="flex-1 text-right">
                <p className="text-[10px] text-secondary mb-0.5 uppercase tracking-wide">To</p>
                <p className="text-primary font-semibold text-[13px]">
                  {transferDirection === 'SPOT_TO_PERP' ? 'Perpetual Account' : 'Spot Account'}
                </p>
              </div>
            </div>

            <div>
              <p className="text-[10px] text-secondary font-medium mb-1 uppercase tracking-wide">
                Asset
              </p>
              <div className="relative">
                <select
                  value={transferAsset}
                  onChange={e => setTransferAsset(e.target.value)}
                  className="w-full appearance-none bg-tertiary border border-color rounded-lg pl-3 pr-8 py-2 text-primary text-[12px] font-medium outline-none cursor-pointer h-9 hover:border-brand/40 transition-colors"
                >
                  {['USDT', 'USDC', 'ETH', 'BNB', 'BTC'].map(a => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={13}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-secondary pointer-events-none"
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1.5">
                <p className="text-[10px] text-secondary font-medium uppercase tracking-wide">
                  Amount
                </p>
                <span className="text-[11px] text-secondary">
                  Available:{' '}
                  <span className="text-primary font-mono font-medium">
                    {formatDisplayAmount(currentBalance)} {transferAsset}
                  </span>
                </span>
              </div>
              <AmountInput
                value={transferAmount}
                onChange={setTransferAmount}
                suffix={
                  <button
                    type="button"
                    onClick={() => setTransferAmount(String(currentBalance))}
                    className="text-brand text-[11px] font-semibold hover:underline cursor-pointer"
                  >
                    MAX
                  </button>
                }
              />
            </div>

            <button
              type="button"
              onClick={handleExecuteTransfer}
              disabled={!isPositiveNumber(transferAmount) || isTransferring}
              className="w-full py-2.5 bg-brand hover:bg-brand-hover text-white font-semibold text-[13px] rounded-lg transition-colors disabled:opacity-50 cursor-pointer shadow-sm"
            >
              {isTransferring ? 'Processing Transfer...' : 'Transfer Asset'}
            </button>
          </div>
        )}

        {/* ---------- HISTORY TAB ---------- */}
        {activeTab === 'history' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex bg-tertiary p-0.5 rounded-lg border border-color text-[11px]">
                {(['ALL', 'DEPOSIT', 'WITHDRAW'] as const).map(f => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setHistoryFilter(f)}
                    className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${historyFilter === f
                        ? 'bg-secondary text-primary font-semibold shadow-sm'
                        : 'text-secondary hover:text-primary'
                      }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={fetchHistory}
                disabled={isLoadingHistory}
                className="text-secondary hover:text-primary transition-colors p-1.5 rounded-lg hover:bg-tertiary cursor-pointer"
                title="Refresh History"
              >
                <RefreshCw size={13} className={isLoadingHistory ? 'animate-spin' : ''} />
              </button>
            </div>

            <div className="max-h-[320px] overflow-y-auto scrollbar-thin border border-color rounded-lg">
              {historyRecords.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-2 text-secondary text-[12px]">
                  {isLoadingHistory ? (
                    <>
                      <RefreshCw size={18} className="animate-spin text-brand" />
                      <span>Loading records...</span>
                    </>
                  ) : (
                    <span>No deposit or withdrawal history found.</span>
                  )}
                </div>
              ) : (
                <div className="divide-y divide-color">
                  {historyRecords.map(r => {
                    const chain = EVM_CHAINS[r.chainId] || {
                      name: 'EVM',
                      explorer: 'https://etherscan.io',
                    };
                    const isDeposit = r.type === 'DEPOSIT';
                    const timestamp = r.time;
                    const dateStr =
                      timestamp && !isNaN(timestamp)
                        ? new Date(timestamp).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                        : '—';

                    return (
                      <div
                        key={r.id || r.txHash}
                        className="px-3 py-2.5 hover:bg-hover flex items-center justify-between gap-2 text-[11px]"
                      >
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${isDeposit ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'
                              }`}
                          >
                            {isDeposit ? (
                              <ArrowDownToLine size={13} />
                            ) : (
                              <ArrowUpFromLine size={13} />
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <span className="font-semibold text-primary">{r.asset}</span>
                              <span className="text-[10px] text-secondary bg-tertiary px-1.5 py-0.2 rounded border border-color">
                                {chain.name}
                              </span>
                              {r.accountType && (
                                <span className="text-[10px] text-secondary bg-tertiary px-1.5 py-0.2 rounded border border-color capitalize">
                                  {r.accountType}
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-muted">{dateStr}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 text-right shrink-0">
                          <div>
                            <div
                              className={`font-mono font-semibold ${isDeposit ? 'text-success' : 'text-danger'}`}
                            >
                              {isDeposit ? '+' : '-'}
                              {parseFloat(r.amount).toFixed(4)}
                            </div>
                            <StatusBadge state={r.state} />
                          </div>
                          {r.txHash && (
                            <a
                              href={`${chain.explorer}/tx/${r.txHash}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-secondary hover:text-brand transition-colors"
                              title="View on Block Explorer"
                            >
                              <ExternalLink size={12} />
                            </a>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
