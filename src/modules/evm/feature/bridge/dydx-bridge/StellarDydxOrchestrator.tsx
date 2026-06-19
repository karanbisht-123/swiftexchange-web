import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  ArrowUpDown,
  Clock,
  Layers,
  ChevronDown,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Info,
  RefreshCw,
  Wallet,
  ExternalLink,
  ArrowLeft,
  Lock,
  ArrowUpRight,
  X
} from 'lucide-react';
import { useWalletConnect } from '../../../../walletconnect/hooks/useWalletConnect';
import { WalletType } from '../../../../walletconnect/constants/Wallet';
import { useWalletStore } from '../../../../walletconnect/store/walletConnectStore';
import { getStellarConfig } from '../../../../walletconnect/config/chains';
import { FeePaymentMethod } from '@allbridge/bridge-core-sdk';
import { getChainById, getEvmChainsForNetwork, getExplorerUrl } from '../../../utils/Chainregistry';
import * as ChainUrlHelpers from '../../../utils/ChainUrlHelpers';
import TransactionButton from '../../../../commonfeature/components/TransactionButton';
import { portfolioUtils } from '../../../../walletconnect/utils/portfolioUtils';
import { ActionGuard } from '../../../../commonfeature/components/ActionGuard';
import { useAssetSelectorModal } from '../../../../commonfeature/components/useAssetSelectorModal';
import {
  useStellarDydxOrchestrator,
  type StellarToken,
  type BridgeSession,
  type SwapQuote,
  type BridgeQuote,
  type DepositQuote,
  type SigningStep
} from './useStellarDydxOrchestrator';
import { ConfirmationModal } from '../../../../../components/common/ConfirmationModal';
import StellarActiveGuard from '../../../../walletconnect/components/StellarActiveGuard';
import { type ChainConfig } from '../../../utils/Chainregistry';
import { EvmTransactionSuccessModal } from '../../../components/EvmTransactionSuccessModal';
import { useSwapStore } from '../../../../../store/swapStore';
import { isTxOwnedByCurrentUser } from '../../../../dydx/hooks/useTransactionTracker';

const STELLAR_CHAIN_ID = 'pubnet';
const DEFAULT_SLIPPAGE = 1.0;
const USDC_LOGO_URL = 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png';
const DYDX_LOGO_URL = 'https://raw.githubusercontent.com/cosmos/chain-registry/master/dydx/images/dydx.png';

type SDKAny = any;

const Shimmer: React.FC<{ className?: string }> = ({ className = 'h-4 w-16' }) => (
  <div className={`animate-pulse bg-white/5 rounded ${className}`} />
);

const SubStepPill = ({ state, label }: { state: 'active' | 'done' | 'waiting', label: string }) => (
  <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[9px] font-black uppercase tracking-widest transition-all ${state === 'active' ? 'bg-brand text-white border-brand' :
    state === 'done' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
      'bg-white/5 text-muted border-divider'
    }`}>
    {state === 'active' && <RefreshCw size={9} className="animate-spin" />}
    {state === 'done' && <CheckCircle2 size={9} />}
    {state === 'waiting' && <div className="w-2 h-2 rounded-full border border-current opacity-40" />}
    {label}
  </div>
);

const Connector = () => (
  <div className="w-4 h-0 border-t border-dotted border-brand/30 flex-shrink-0" />
);

interface WalletConnectionRequiredProps {
  openModal: () => void;
}

export const WalletConnectionRequired: React.FC<WalletConnectionRequiredProps> = ({ openModal }) => {
  return (
    <div className="w-full max-w-xl mx-auto lg:px-4 pb-4 animate-fade-in">
      <div className="bg-tertiary rounded-[2.5rem] border border-divider/50 p-12 text-center relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-32 h-32 bg-brand/5 rounded-full -mr-16 -mt-16 blur-3xl transition-all group-hover:bg-brand/10" />
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-brand/5 rounded-full -ml-16 -mb-16 blur-3xl transition-all group-hover:bg-brand/10" />

        <div className="relative mb-8 flex justify-center">
          <div className="relative">
            <div className="w-24 h-24 rounded-3xl bg-brand/10 flex items-center justify-center rotate-3 group-hover:rotate-6 transition-transform duration-500">
              <Layers className="w-12 h-12 text-brand" />
            </div>
          </div>
        </div>

        <h2 className="text-2xl font-black text-primary mb-4 uppercase tracking-tighter">
          Dual Connection Required
        </h2>

        <p className="text-muted text-sm leading-relaxed mb-10 max-w-[320px] mx-auto font-medium">
          To use the Stellar-dYdX bridge, you need to connect both your
          <span className="text-brand font-bold mx-1">Stellar</span>
          and
          <span className="text-brand font-bold mx-1">EVM</span>
          wallets simultaneously.
        </p>

        <div className="space-y-3">
          <button
            onClick={openModal}
            className="w-full btn btn-primary text font-black py-5 rounded-2xl tracking-[0.2em] hover:brightness-110 active:scale-[0.98] transition-all uppercase shadow-lg shadow-brand/20 flex items-center justify-center gap-3"
          >
            <Wallet size={20} />
            Connect Wallets
          </button>

          <p className="text-[10px] font-black text-muted/40 uppercase tracking-[0.3em]">
            Secure Multi-Chain Settlement
          </p>
        </div>
      </div>
    </div>
  );
};

interface SessionRoadmapProps {
  session: BridgeSession;
  evmChains: ChainConfig[];
  signingStep: SigningStep;
}

export const SessionRoadmap: React.FC<SessionRoadmapProps> = ({
  session,
  evmChains,
  signingStep,
}) => {
  const currentNetwork = useWalletStore(state => state.network) as 'mainnet' | 'testnet';
  const [, setTick] = useState<number>(0);

  useEffect(() => {
    if (session.phase === 'BRIDGE' && session.bridgeTx.status === 'PENDING') {
      const interval = setInterval(() => {
        setTick(t => t + 1);
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [session.phase, session.bridgeTx.status]);

  const getSubStepLabel = (type: string): string => {
    const map: Record<string, string> = {
      ibc_transfer: 'IBC Transfer',
      cctp_transfer: 'CCTP Bridge',
      go_fast_transfer: 'Go Fast',
      axelar_transfer: 'Axelar Bridge',
      hyperlane_transfer: 'Hyperlane Bridge',
      evm_swap: 'EVM Swap',
      swap: 'Swap',
      unknown: 'Hop',
    };
    return map[type] ?? type.replace(/_/g, ' ').replace('transfer', 'Transfer').trim();
  };

  const getSubStepStatePill = (state: string) => {
    switch (state) {
      case 'TRANSFER_SUCCESS':
        return { label: 'Success', className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' };
      case 'TRANSFER_RECEIVED':
        return { label: 'Finalizing', className: 'bg-blue-500/10 text-blue-400 border-blue-500/20 animate-pulse' };
      case 'TRANSFER_PENDING':
        return { label: 'Pending', className: 'bg-blue-500/10 text-blue-400 border-blue-500/20 animate-pulse' };
      case 'TRANSFER_FAILURE':
        return { label: 'Failed', className: 'bg-rose-500/10 text-rose-500 border-rose-500/20' };
      default:
        return { label: 'Waiting', className: 'bg-white/5 text-muted border-divider' };
    }
  };

  const isSessionUsdc = session.inputTokenSymbol === 'USDC';
  const activeChain = evmChains.find(c => c.chainId === session.destinationChainId);
  const sym = session.inputTokenSymbol;

  const steps = isSessionUsdc
    ? [
      {
        id: 'BRIDGE',
        label: `Bridge USDC → ${activeChain?.name || 'EVM'}`,
        activeLabel: 'Sign bridge transfer in Stellar wallet',
        description: `Sending USDC from Stellar to ${activeChain?.name || 'EVM'} via Allbridge. Takes 2–15 min once signed.`,
        color: 'text-blue-400',
        bg: 'bg-blue-400/20',
        border: 'border-blue-400/30',
      },
      {
        id: 'DEPOSIT',
        label: `Deposit USDC → dYdX`,
        activeLabel: 'Sign deposit in EVM wallet',
        description: `Depositing USDC from ${activeChain?.name || 'EVM'} into your dYdX trading account.`,
        color: 'text-brand',
        bg: 'bg-brand/20',
        border: 'border-brand/30',
      },
    ]
    : [
      {
        id: 'SWAP',
        label: `Swap ${sym} → USDC`,
        activeLabel: `Sign ${sym} → USDC swap in Stellar wallet`,
        description: `Swapping ${sym} to USDC on Stellar DEX. USDC is required for cross-chain bridging.`,
        color: 'text-emerald-400',
        bg: 'bg-emerald-400/20',
        border: 'border-emerald-400/30',
      },
      {
        id: 'BRIDGE',
        label: `Bridge USDC → ${activeChain?.name || 'EVM'}`,
        activeLabel: 'Sign bridge transfer in Stellar wallet',
        description: `Sending USDC from Stellar to ${activeChain?.name || 'EVM'} via Allbridge. Takes 2–15 min once signed.`,
        color: 'text-blue-400',
        bg: 'bg-blue-400/20',
        border: 'border-blue-400/30',
      },
      {
        id: 'DEPOSIT',
        label: `Deposit USDC → dYdX`,
        activeLabel: 'Sign deposit in EVM wallet',
        description: `Depositing USDC from ${activeChain?.name || 'EVM'} into your dYdX trading account.`,
        color: 'text-brand',
        bg: 'bg-brand/20',
        border: 'border-brand/30',
      },
    ];

  const currentStepIndex = session.phase === 'SETUP'
    ? -1
    : session.phase === 'SWAP'
      ? 0
      : session.phase === 'BRIDGE'
        ? isSessionUsdc ? 0 : 1
        : session.phase === 'DEPOSIT'
          ? isSessionUsdc ? 1 : 2
          : 3;

  // Helper: get the tx info for a given step id
  const getStepTx = (stepId: string) => {
    if (stepId === 'SWAP') return session.swapTx;
    if (stepId === 'BRIDGE') return session.bridgeTx;
    return session.depositTx;
  };

  const getStepExplorerUrl = (stepId: string) => {
    if (stepId === 'SWAP')
      return `https://stellar.expert/explorer/${currentNetwork === 'testnet' ? 'testnet' : 'public'}/tx/${session.swapTx.hash}`;
    if (stepId === 'BRIDGE')
      return `https://core.allbridge.io/explorer?search=${session.bridgeTx.hash}`;
    return getExplorerUrl(session.destinationChainId, 'tx', session.depositTx.hash || '');
  };

  return (
    <div className="bg-tertiary/90 backdrop-blur-2xl rounded-b-[3rem] mx-1 -mt-10 pt-12 pb-12 px-6 shadow-[0_10px_40px_-15px_rgba(0,0,0,0.4)] animate-slide-up relative z-0 overflow-hidden">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-64 bg-brand/5 blur-[120px] pointer-events-none opacity-60" />

      <div className="relative z-10">
        <div className="flex items-center gap-2 mb-10 opacity-80">
          <Info size={12} className="text-brand" />
          <h3 className="text-[10px] font-black text-brand uppercase tracking-[0.4em]">
            Execution Roadmap
          </h3>
        </div>

        <div className="relative space-y-12 ml-2">
          <div className="absolute top-4 left-[15px] bottom-4 w-0 border-l-2 border-dotted border-divider" />

          {steps.map((s, i) => {
            const stepTx = getStepTx(s.id);
            const stepTxStatus = stepTx.status;
            const isActive = i === currentStepIndex;
            const isCompleted = stepTxStatus === 'SUCCESS' || i < currentStepIndex;
            const isStepPending = stepTxStatus === 'PENDING';
            const isFailed = stepTxStatus === 'FAILED';
            const isLocked = i > currentStepIndex && !stepTxStatus;
            const explorerUrl = stepTx.hash ? getStepExplorerUrl(s.id) : null;

            return (
              <div
                key={s.id}
                className={`flex gap-6 transition-all duration-700 ${isLocked ? 'opacity-20 blur-[0.5px]' : 'opacity-100'}`}
              >
                <div className="relative z-10">
                  <div
                    className={`w-8 h-8 rounded-full z-20 flex items-center justify-center border-2 transition-all duration-700 ${isActive
                      ? `${s.bg} ${s.border} ${s.color} shadow-[0_0_20px_rgba(var(--brand-rgb),0.1)] scale-110`
                      : isCompleted
                        ? 'bg-brand border-brand text-white shadow-[0_0_15px_rgba(var(--brand-rgb),0.2)]'
                        : isFailed
                          ? 'bg-rose-500/20 border-rose-500 text-rose-500'
                          : 'bg-bg-primary border-divider text-muted'
                      }`}
                  >
                    {isCompleted ? (
                      <CheckCircle2 size={16} />
                    ) : isFailed ? (
                      <AlertCircle size={16} />
                    ) : isStepPending ? (
                      <RefreshCw size={14} className="animate-spin" />
                    ) : (
                      <span className="text-[10px] font-black">{i + 1}</span>
                    )}
                  </div>
                </div>

                <div className="flex-1 pt-1">
                  <div className="flex items-center justify-between gap-3 mb-2 w-full">
                    <div className="flex items-center gap-2">
                      <h4
                        className={`text-xs font-black uppercase tracking-widest transition-colors ${isActive
                          ? s.color
                          : isCompleted
                            ? 'text-primary'
                            : isFailed
                              ? 'text-rose-500'
                              : 'text-muted'
                          }`}
                      >
                        {isActive && signingStep.phase !== 'idle'
                          ? 'Wallet confirmation required'
                          : s.label
                        }
                      </h4>
                      {isStepPending && (
                        <span className="text-[8px] font-black bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded-full border border-blue-500/20 animate-pulse uppercase tracking-tighter">
                          Pending
                        </span>
                      )}
                      {isFailed && (
                        <span className="text-[8px] font-black bg-rose-500/10 text-rose-500 px-2 py-0.5 rounded-full border border-rose-500/20 uppercase tracking-tighter">
                          Failed
                        </span>
                      )}
                    </div>

                    {/* FIX: Single explorer link in header — removed duplicate in body */}
                    {explorerUrl && (
                      <a
                        href={explorerUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[8px] font-black text-brand/60 hover:text-brand flex items-center gap-1 transition-colors uppercase tracking-widest flex-shrink-0"
                      >
                        Explorer <ExternalLink size={8} />
                      </a>
                    )}
                  </div>

                  <p className="text-[10px] font-bold text-muted leading-relaxed max-w-[280px]">
                    {s.description}
                  </p>

                  {isActive && !isFailed && (
                    <div className="mt-3 space-y-3">
                      {/* Action hint for active step */}
                      <div className="flex items-center gap-2">
                        <div className="flex gap-0.5">
                          <div className="w-1 h-1 rounded-full bg-brand animate-bounce" />
                          <div className="w-1 h-1 rounded-full bg-brand animate-bounce delay-100" />
                          <div className="w-1 h-1 rounded-full bg-brand animate-bounce delay-200" />
                        </div>
                        <span className="text-[9px] font-black text-brand uppercase tracking-widest">
                          {isActive && signingStep.phase !== 'idle'
                            ? `Open your ${signingStep.walletType === 'stellar' ? 'Stellar' : 'EVM'} wallet to approve`
                            : s.activeLabel
                          }
                        </span>
                      </div>

                      {s.id === 'BRIDGE' && isStepPending && (
                        (() => {
                          const elapsedMs = Date.now() - (session.bridgeStartedAt ?? Date.now());
                          const expectedMs = session.expectedBridgeTimeMs || 600000;
                          const remainingMin = Math.max(0, Math.ceil((expectedMs - elapsedMs) / 60000));
                          const progressPercent = Math.min(100, (elapsedMs / expectedMs) * 100);
                          return (
                            <div className="mt-2 space-y-1.5 max-w-[280px]">
                              <span className="text-[9px] text-muted font-bold block leading-relaxed">
                                Estimated ~{remainingMin} min remaining. This page will update automatically.
                              </span>
                              <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-brand rounded-full transition-all duration-1000"
                                  style={{ width: `${progressPercent}%` }}
                                />
                              </div>
                            </div>
                          );
                        })()
                      )}

                      {s.id === 'DEPOSIT' && session.dydxSteps && session.dydxSteps.length > 0 && (
                        <div className="pl-3 border-l border-divider/40 space-y-3.5 ml-1 mt-2 mb-2">
                          {session.dydxSteps.map((step: SDKAny, idx: number) => {
                            const isStepSuccess = step.state === 'TRANSFER_SUCCESS';
                            const isStepFailure = step.state === 'TRANSFER_FAILURE';
                            const explorerLink = step.packet_txs?.send_tx?.explorer_link || step.packet_txs?.receive_tx?.explorer_link;
                            const pill = getSubStepStatePill(step.state);

                            return (
                              <div key={idx} className="flex flex-col gap-1.5 animate-fade-in">
                                <div className="flex items-center justify-between gap-4">
                                  <div className="flex items-center gap-2.5">
                                    <div
                                      className={`w-2 h-2 rounded-full ${isStepSuccess
                                        ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.4)]'
                                        : isStepFailure
                                          ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.4)]'
                                          : 'bg-brand animate-pulse'
                                        }`}
                                    />
                                    <span className="text-[10px] font-black text-primary tracking-wide uppercase">
                                      {getSubStepLabel(step.type)}
                                    </span>
                                    <span className={`px-2 py-0.5 rounded-full border text-[7px] font-black uppercase tracking-widest ${pill.className}`}>
                                      {pill.label}
                                    </span>
                                  </div>
                                  {explorerLink && (
                                    <a
                                      href={explorerLink}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-[8px] font-black text-brand/60 hover:text-brand flex items-center gap-1 transition-colors uppercase tracking-widest"
                                    >
                                      Explorer <ExternalLink size={8} />
                                    </a>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

interface RouteBreakdownPanelProps {
  routeBreakdown: {
    items: Array<{
      label: string;
      value: string;
      fee: string;
      amount: string;
      time?: string;
      icon: string;
      chainIcon: string | undefined;
      status: 'pending' | 'active' | 'done';
    }>;
    totalTime: number;
  } | null;
  nativeBalance: string;
  feePaymentMethod: FeePaymentMethod;
  setFeePaymentMethod: (m: FeePaymentMethod) => void;
  showFullDetails: boolean;
  rawQuotes: { swap: SwapQuote | null; bridge: BridgeQuote | null; dydx: DepositQuote | null } | null;
  inputToken: StellarToken | null;
  currentNetwork: 'mainnet' | 'testnet';
  destinationChain: ChainConfig | null;
}

export const RouteBreakdownPanel: React.FC<RouteBreakdownPanelProps> = ({
  routeBreakdown,
  nativeBalance,
  feePaymentMethod,
  setFeePaymentMethod,
  showFullDetails,
  rawQuotes,
  inputToken,
  currentNetwork,
  destinationChain,
}) => {
  if (!routeBreakdown) return null;
  const stellarConfig = getStellarConfig(currentNetwork);

  return (
    <div className="bg-tertiary rounded-xl border border-divider p-3 py-5 sm:p-4 sm:py-6 lg:p-6 pb-0 animate-fade-in relative">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-8">
        <div className="flex items-center gap-2">
          <Layers size={14} className="text-brand" />
          <h4 className="text-[10px] font-black text-primary uppercase tracking-widest">
            Route Details
          </h4>
        </div>
        <div className="flex items-center gap-4 w-full sm:w-auto">
          <div className="flex items-center gap-2 sm:gap-3 bg-secondary/80 backdrop-blur-md px-2.5 py-1.5 sm:px-4 sm:py-2 rounded-2xl border border-divider shadow-inner w-full justify-between sm:justify-start">
            <div className="flex flex-col">
              <span className="text-[8px] font-black text-muted uppercase tracking-tighter">
                XLM Balance
              </span>
              <span className="text-[10px] font-black text-primary tracking-tight">
                {portfolioUtils.formatBalance(nativeBalance)} XLM
              </span>
            </div>
            <div className="w-[1px] h-6 bg-divider/30" />
            <div className="flex flex-col gap-1">
              <span className="text-[8px] font-black text-muted uppercase tracking-tighter">
                Pay Fee In
              </span>
              <button
                onClick={() =>
                  setFeePaymentMethod(
                    feePaymentMethod === FeePaymentMethod.WITH_STABLECOIN
                      ? FeePaymentMethod.WITH_NATIVE_CURRENCY
                      : FeePaymentMethod.WITH_STABLECOIN
                  )
                }
                disabled={!rawQuotes?.bridge?.feeOptions?.stablecoin}
                className={`flex items-center gap-1.5 transition-opacity ${!rawQuotes?.bridge?.feeOptions?.stablecoin ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-80'}`}
              >
                <div
                  className={`flex items-center gap-1 px-1.5 py-0.5 rounded-lg border transition-all ${feePaymentMethod === FeePaymentMethod.WITH_STABLECOIN
                    ? 'bg-brand text-white border-brand shadow-lg shadow-brand/20'
                    : 'bg-tertiary border-divider text-muted opacity-50'
                    }`}
                >
                  <img src={USDC_LOGO_URL} className="w-2.5 h-2.5 rounded-full" alt="" />
                  <span className="text-[7px] font-black">USDC</span>
                </div>
                <div
                  className={`flex items-center gap-1 px-1.5 py-0.5 rounded-lg border transition-all ${feePaymentMethod === FeePaymentMethod.WITH_NATIVE_CURRENCY
                    ? 'bg-brand text-white border-brand shadow-lg shadow-brand/20'
                    : 'bg-tertiary border-divider text-muted opacity-50'
                    }`}
                >
                  <img
                    src={stellarConfig.logoUrl}
                    className="w-2.5 h-2.5 rounded-full"
                    alt=""
                  />
                  <span className="text-[7px] font-black">XLM</span>
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between px-2 mb-10 relative overflow-x-auto scrollbar-hide py-4 min-w-0 w-full">
        {routeBreakdown.items.map((item, idx) => (
          <React.Fragment key={idx}>
            <div className="flex flex-col items-center gap-1.5 sm:gap-3 relative z-10 flex-shrink-0">
              <div
                className={`w-11 h-11 sm:w-14 sm:h-14 relative rounded-2xl bg-tertiary flex items-center justify-center border transition-all duration-500 shadow-sm ${item.status === 'done'
                  ? 'border-success/50'
                  : item.status === 'active'
                    ? 'border-brand shadow-lg shadow-brand/10'
                    : 'border-divider'
                  }`}
              >
                <img src={item.icon} className="w-6 h-6 sm:w-8 sm:h-8 rounded-full shadow-sm" alt="" />
                <div className="absolute -bottom-1 -right-1 w-4.5 h-4.5 sm:w-5 sm:h-5 rounded-full border-2 border-secondary bg-bg-primary flex items-center justify-center p-0.5 shadow-sm">
                  <img
                    src={item.chainIcon}
                    className="w-full h-full object-contain"
                    alt=""
                  />
                </div>
              </div>
              <div className="flex flex-col items-center">
                <span
                  className={`text-[8px] sm:text-[9px] font-black uppercase tracking-widest ${item.status === 'active' ? 'text-brand' : 'text-muted'}`}
                >
                  {item.label}
                </span>
                <span className="text-[7px] sm:text-[8px] font-bold text-white/40 mt-0.5">
                  {item.amount ? `${item.amount} USDC` : '---'}
                </span>
                {item.time && (
                  <div className="flex items-center gap-0.5 sm:gap-1 mt-0.5 opacity-80">
                    <Clock size={8} className="text-brand" />
                    <span className="text-[8px] sm:text-[10px] font-black text-brand uppercase tracking-tighter">
                      {item.time}
                    </span>
                  </div>
                )}
              </div>
            </div>
            {idx < routeBreakdown.items.length - 1 && (
              <div
                className="flex-1 h-0 border-t-2 border-dotted mx-1 sm:mx-2 mb-8 sm:mb-12 transition-all duration-500 opacity-30 min-w-[15px] sm:min-w-[30px]"
                style={{
                  borderColor:
                    item.status === 'done' ? 'var(--success)' : 'var(--divider)',
                }}
              />
            )}
          </React.Fragment>
        ))}
      </div>

      <div className="space-y-2 py-4 border-t border-divider/50">
        {routeBreakdown.items.map(
          (item, idx) =>
            item.fee !== '---' && (
              <div key={idx} className="flex justify-between items-center text-[11px]">
                <div className="flex items-center gap-1.5">
                  <img src={item.icon} className="w-4 h-4 rounded-full" alt="" />
                  <span className="text-muted font-bold">{item.label}</span>
                  {item.time && (
                    <div className="flex items-center gap-0.5 opacity-40">
                      <Clock size={8} />
                      <span className="text-[8px] font-black uppercase">{item.time}</span>
                    </div>
                  )}
                </div>
                <span className="text-primary font-black">{item.fee}</span>
              </div>
            )
        )}
      </div>

      {showFullDetails && rawQuotes && (
        <div className="space-y-3 py-4 border-t border-divider/50 animate-fade-in">
          <p className="text-[9px] font-black text-brand uppercase tracking-[0.2em] mb-2">
            Full Quote Breakdown
          </p>

          {rawQuotes.swap && (
            <details className="group" open>
              <summary className="cursor-pointer flex justify-between items-center text-[9px] font-black uppercase tracking-widest text-muted hover:text-brand py-2.5 border-b border-divider/30 transition-colors">
                <span className="group-open:text-brand transition-colors">Stellar Swap</span>
                <ChevronDown
                  size={10}
                  className="group-open:rotate-180 group-open:text-brand transition-all duration-300"
                />
              </summary>
              <div className="mt-2 space-y-1.5 text-[9px] font-mono pl-2">
                <div className="flex justify-between">
                  <span className="text-muted">You Pay</span>
                  <span className="text-primary font-black">
                    {rawQuotes.swap.inputAmount}{' '}
                    {rawQuotes.swap.fromAsset?.code || inputToken?.symbol}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">You Get (USDC)</span>
                  <span className="text-brand font-black">
                    {parseFloat(rawQuotes.swap.estimatedOutput || '0').toFixed(6)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Min. Received</span>
                  <span className="text-primary">
                    {parseFloat(rawQuotes.swap.minimumOutput as string || '0').toFixed(6)} USDC
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Price Impact</span>
                  <span
                    className={`font-black ${(rawQuotes.swap.priceImpact || 0) > 1 ? 'text-red-400' : 'text-green-400'}`}
                  >
                    {(rawQuotes.swap.priceImpact || 0).toFixed(3)}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Route</span>
                  <span className="text-primary text-right max-w-[140px] truncate">
                    {Array.isArray(rawQuotes.swap.path?.path)
                      ? (rawQuotes.swap.path!.path as Array<{ code: string }>)
                        .map(p => p.code)
                        .join(' → ')
                      : 'AMM Pool'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Slippage</span>
                  <span>{DEFAULT_SLIPPAGE}%</span>
                </div>
              </div>
            </details>
          )}

          {rawQuotes.bridge && (
            <details className="group" open={!rawQuotes.swap}>
              <summary className="cursor-pointer flex justify-between items-center text-[9px] font-black uppercase tracking-widest text-muted hover:text-brand py-2.5 border-b border-divider/30 transition-colors">
                <span className="group-open:text-brand transition-colors">
                  Allbridge (Stellar → {rawQuotes.bridge.destinationToken?.chainName || destinationChain?.name})
                </span>
                <ChevronDown
                  size={10}
                  className="group-open:rotate-180 group-open:text-brand transition-all duration-300"
                />
              </summary>
              <div className="mt-2 space-y-1.5 text-[9px] font-mono pl-2">
                <div className="flex justify-between">
                  <span className="text-muted">Bridge Amount In</span>
                  <span className="text-primary font-black">
                    {rawQuotes.bridge.amountToBeReceived
                      ? parseFloat(rawQuotes.bridge.amountToBeReceived).toFixed(4)
                      : '—'}{' '}
                    USDC
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Amount Out</span>
                  <span className="text-brand font-black">
                    {(() => {
                      let amt = parseFloat(rawQuotes.bridge.amountToBeReceived || '0');
                      if (feePaymentMethod === FeePaymentMethod.WITH_STABLECOIN && rawQuotes.bridge.feeOptions?.stablecoin) {
                        amt = Math.max(0, amt - Number(rawQuotes.bridge.feeOptions.stablecoin.float));
                      }
                      return amt.toFixed(4);
                    })()} USDC
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Exchange Rate</span>
                  <span>{rawQuotes.bridge.exchangeRate}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Transfer Time</span>
                  <span>
                    {Math.round((rawQuotes.bridge.transferTimeMs || 0) / 60000)} min
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Fee (pay in USDC)</span>
                  <span className="text-yellow-400 font-black">
                    {rawQuotes.bridge.feeOptions?.stablecoin?.float} USDC{feePaymentMethod === FeePaymentMethod.WITH_STABLECOIN && ' (deducted from amount)'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Fee (pay in XLM)</span>
                  <span className="text-yellow-400">
                    {rawQuotes.bridge.feeOptions?.native?.float} XLM
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Source</span>
                  <span className="text-primary">
                    Stellar ({rawQuotes.bridge.sourceToken?.chainName})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Destination</span>
                  <span className="text-primary">
                    {rawQuotes.bridge.destinationToken?.chainName} ({rawQuotes.bridge.destinationToken?.symbol})
                  </span>
                </div>
              </div>
            </details>
          )}

          {rawQuotes.dydx && (
            <details className="group">
              <summary className="cursor-pointer flex justify-between items-center text-[9px] font-black uppercase tracking-widest text-muted hover:text-brand py-2.5 border-b border-divider/30 transition-colors">
                <span className="group-open:text-brand transition-colors">
                  dYdX Settlement (Skip / CCTP)
                </span>
                <ChevronDown
                  size={10}
                  className="group-open:rotate-180 group-open:text-brand transition-all duration-300"
                />
              </summary>
              <div className="mt-2 space-y-1.5 text-[9px] font-mono pl-2">
                <div className="flex justify-between">
                  <span className="text-muted">Bridge</span>
                  <span className="text-brand font-black">CCTP</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Est. Time</span>
                  <span>
                    {rawQuotes.dydx.estimatedTime ||
                      `~${Math.round((rawQuotes.dydx.estimatedDurationSeconds || 0) / 60)} min`}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Bridge Fee</span>
                  <span className="text-yellow-400 font-black">
                    ${(rawQuotes.dydx.fee || 0.02).toFixed(4)} USD
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Settled (USDC)</span>
                  <span className="text-brand font-black">
                    {(rawQuotes.dydx.receivedAmount || 0).toFixed(4)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">USD Value Out</span>
                  <span className="text-primary">${rawQuotes.dydx.usdAmountOut}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Settled On</span>
                  <span className="text-brand">dYdX Chain</span>
                </div>
              </div>
            </details>
          )}

          <p className="text-[10px] font-bold text-muted/30 uppercase text-center mt-2">
            * Quotes refresh every 30s. All fees included in final amount.
          </p>
        </div>
      )}
    </div>
  );
};

interface PendingSessionCardProps {
  session: BridgeSession;
  evmChains: ChainConfig[];
  updateSession: (id: string, updates: Partial<BridgeSession>) => void;
  setActiveSessionId: (id: string | null) => void;
  setRestoreInputsOnClear: (r: boolean) => void;
  setSessionToClear: (id: string | null) => void;
  isSigningInProgress: boolean;
}

export const PendingSessionCard: React.FC<PendingSessionCardProps> = ({
  session,
  evmChains,
  updateSession,
  setActiveSessionId,
  setRestoreInputsOnClear,
  setSessionToClear,
  isSigningInProgress
}) => {
  const chain = evmChains.find(c => c.chainId === session.destinationChainId);

  // FIX: A session is only safe to clear when there are no on-chain pending txs
  // AND it's not in a state where action is required but a tx is already in-flight.
  // Previously: DEPOSIT phase with bridgeTx=SUCCESS but no depositTx hash was
  // incorrectly considered "safe to clear" since no hash = no pending check.
  const hasPendingOnChain =
    session.bridgeTx?.status === 'PENDING' ||
    session.depositTx?.status === 'PENDING';

  const hasUnrecoverableFunds =
    (session.phase === 'DEPOSIT' && session.bridgeTx?.status === 'SUCCESS' && !session.depositTx?.hash);

  const isSafeToClear = !hasPendingOnChain && !hasUnrecoverableFunds;

  const getStepLabel = () => {
    if (session.phase === 'SWAP') return 'Swapping';
    if (session.phase === 'BRIDGE') {
      return session.bridgeTx?.status === 'PENDING' ? 'Crossing Bridge' : 'Ready to Bridge';
    }
    if (session.phase === 'DEPOSIT') {
      return session.depositTx?.status === 'PENDING' ? 'Settling' : 'Ready to Settle';
    }
    return session.phase;
  };

  return (
    <div
      className="rounded-2xl border animate-fade-in p-3"
      style={{
        borderColor: 'var(--color-border)',
        background: 'var(--color-bg-tertiary)'
      }}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          <div className="flex items-center gap-1.5">
            {hasPendingOnChain ? (
              <RefreshCw size={11} className="text-brand animate-spin" style={{ animationDuration: '2s' }} />
            ) : (
              <Clock size={11} className="text-brand" />
            )}
            <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: 'var(--color-text-primary)' }}>
              Active Transfer
            </span>
          </div>

          <div className="flex items-center gap-2 min-w-0 mt-0.5">
            <div className="relative flex-shrink-0">
              <img src={USDC_LOGO_URL} className="w-5 h-5 rounded-full" alt="USDC" />
              {chain?.logoURI && (
                <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border flex items-center justify-center p-0.5"
                  style={{ borderColor: 'var(--color-bg-secondary)', background: 'var(--color-bg-primary)' }}>
                  <img src={chain.logoURI} className="w-full h-full object-contain rounded-full" alt="" />
                </div>
              )}
            </div>
            <span className="text-[10px] font-black truncate" style={{ color: 'var(--color-text-primary)' }}>
              {session.inputAmount} {session.inputTokenSymbol} → {chain?.name || 'EVM'} → dYdX
            </span>
          </div>

          <div className="flex items-center gap-2.5 mt-0.5">
            <span className="text-[8px] font-bold" style={{ color: 'var(--color-text-muted)' }}>
              Started {new Date(session.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>

            <div className="flex items-center gap-1 flex-shrink-0">
              {session.inputTokenSymbol !== 'USDC' && (
                <>
                  <div
                    className="w-1.5 h-1.5 rounded-full transition-colors"
                    style={{
                      background: session.swapTx?.status === 'SUCCESS'
                        ? 'var(--color-success)'
                        : session.phase === 'SWAP'
                          ? 'var(--color-brand)'
                          : 'var(--color-text-muted)',
                      opacity: session.phase === 'SWAP' ? 1 : (session.swapTx?.status === 'SUCCESS' ? 1 : 0.3),
                    }}
                  />
                  <div className="w-2 h-0" style={{ borderTop: '1px dashed var(--color-border)' }} />
                </>
              )}
              <div
                className="w-1.5 h-1.5 rounded-full transition-colors"
                style={{
                  background: session.bridgeTx?.status === 'SUCCESS'
                    ? 'var(--color-success)'
                    : session.phase === 'BRIDGE'
                      ? 'var(--color-brand)'
                      : 'var(--color-text-muted)',
                  opacity: session.phase === 'BRIDGE' ? 1 : (session.bridgeTx?.status === 'SUCCESS' ? 1 : 0.3),
                }}
              />
              <div className="w-2 h-0" style={{ borderTop: '1px dashed var(--color-border)' }} />
              <div
                className="w-1.5 h-1.5 rounded-full transition-colors"
                style={{
                  background: session.depositTx?.status === 'SUCCESS'
                    ? 'var(--color-success)'
                    : session.phase === 'DEPOSIT'
                      ? 'var(--color-brand)'
                      : 'var(--color-text-muted)',
                  opacity: session.phase === 'DEPOSIT' ? 1 : (session.depositTx?.status === 'SUCCESS' ? 1 : 0.3),
                }}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          <span
            className="text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full"
            style={{
              background: 'color-mix(in srgb, var(--color-brand) 12%, transparent)',
              color: 'var(--color-brand)',
            }}
          >
            {getStepLabel()}
          </span>

          <div className="flex items-center gap-1.5 mt-1">
            <button
              onClick={() => {
                if (isSafeToClear && !isSigningInProgress) {
                  setRestoreInputsOnClear(false);
                  setSessionToClear(session.id);
                }
              }}
              disabled={!isSafeToClear || isSigningInProgress}
              className="w-[72px] h-[28px] rounded-lg text-[9px] font-black uppercase tracking-widest transition-all active:scale-[0.98]"
              style={{
                background: 'transparent',
                color: isSafeToClear ? 'var(--color-text-secondary)' : 'var(--color-text-muted)',
                border: '1px solid var(--color-border)',
                cursor: isSafeToClear ? 'pointer' : 'not-allowed',
                opacity: isSafeToClear ? 1 : 0.5,
              }}
            >
              Clear
            </button>
            <button
              onClick={() => {
                if (!isSigningInProgress) {
                  updateSession(session.id, { error: null });
                  setActiveSessionId(session.id);
                }
              }}
              disabled={isSigningInProgress}
              className="w-[72px] h-[28px] rounded-lg text-[9px] font-black uppercase tracking-widest transition-all active:scale-[0.98] hover:brightness-110"
              style={{
                background: isSigningInProgress ? 'var(--color-text-muted)' : 'var(--color-brand)',
                color: isSigningInProgress ? 'var(--color-text-secondary)' : '#fff',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Resume
            </button>
          </div>

          {!isSafeToClear && (
            <span className="text-[7px] font-black uppercase tracking-wider text-right block mt-0.5" style={{ color: 'color-mix(in srgb, var(--color-danger) 70%, transparent)' }}>
              {hasUnrecoverableFunds ? '⚠ Funds need deposit' : '⚠ Pending on-chain'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export const StellarDydxOrchestrator: React.FC = () => {
  const { connectedWallets, openModal } = useWalletConnect();
  const currentNetwork = useWalletStore(state => state.network) as 'mainnet' | 'testnet';

  const stellarWallet = connectedWallets[WalletType.STELLAR];
  const evmWallet = connectedWallets[WalletType.EVM];
  const stellarAddress = stellarWallet?.address;
  const evmAddress = evmWallet?.address;

  const { openAssetSelector } = useAssetSelectorModal();
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    inputAmount,
    setInputAmount,
    inputToken,
    setInputToken,
    destinationChain,
    setDestinationChain,
    feePaymentMethod,
    setFeePaymentMethod,
    stellarAssets,
    loadingAssets,
    nativeBalance,
    isUsdc,
    isQuoting,
    swapQuote,
    bridgeQuote,
    depositQuote,
    rawQuotes,
    setupError,
    clearSetupForm,
    sessions,
    activeSessionId,
    setActiveSessionId,
    createSession,
    dismissSession,
    executeSessionStep,
    updateSession,
    quoteTimestamp,
    signingStep,
    isSigningInProgress,
    destinationGasBalance,
    checkingGasBalance,
    evmUsdcBalance,
    checkingEvmUsdcBalance,
  } = useStellarDydxOrchestrator();

  const [showFullDetails, setShowFullDetails] = useState<boolean>(false);
  const [showAllSessions, setShowAllSessions] = useState<boolean>(false);
  const [sessionToClear, setSessionToClear] = useState<string | null>(null);
  const [restoreInputsOnClear, setRestoreInputsOnClear] = useState<boolean>(false);
  const [awaitingWalletConfirm, setAwaitingWalletConfirm] = useState<boolean>(false);
  const [quoteAge, setQuoteAge] = useState<number>(0);
  const [isGasWarningDismissed, setIsGasWarningDismissed] = useState<boolean>(false);

  useEffect(() => {
    setIsGasWarningDismissed(false);
  }, [destinationChain?.chainId]);

  const [successModalSessionId, setSuccessModalSessionId] = useState<string | null>(null);
  const shownSuccessRef = useRef<Set<string>>(new Set(
    (() => {
      try { return JSON.parse(localStorage.getItem('bridge_shown_success') || '[]') }
      catch { return [] }
    })()
  ));
  const [showBridgeRecoveryBanner, setShowBridgeRecoveryBanner] = useState<boolean>(() =>
    useSwapStore.getState().bridgePendingSignPhase !== 'idle'
  );
  const clearBridgePendingSign = useSwapStore(s => s.clearBridgePendingSign);
  const bridgePendingSignPhase = useSwapStore(s => s.bridgePendingSignPhase);
  const bridgePendingSignSessionId = useSwapStore(s => s.bridgePendingSignSessionId);

  const evmChains = useMemo(() => getEvmChainsForNetwork(currentNetwork), [currentNetwork]);
  const isBothConnected = !!evmAddress && !!stellarAddress;
  useEffect(() => {
    if (signingStep.phase !== 'idle') {
      setShowBridgeRecoveryBanner(false);
    }
  }, [signingStep.phase]);

  useEffect(() => {
    if (!showBridgeRecoveryBanner) return;
    const session = sessions.find(s => s.id === bridgePendingSignSessionId);
    if (!session) return;

    let isResolved = false;
    if (bridgePendingSignPhase?.startsWith('signing_swap')) {
      isResolved = session.swapTx.status === 'SUCCESS' || session.swapTx.status === 'FAILED' || session.phase !== 'SWAP';
    } else if (bridgePendingSignPhase?.startsWith('signing_bridge')) {
      isResolved = session.bridgeTx.status === 'SUCCESS' || session.bridgeTx.status === 'FAILED' || session.phase !== 'BRIDGE';
    } else if (bridgePendingSignPhase?.startsWith('signing_deposit')) {
      isResolved = session.depositTx.status === 'SUCCESS' || session.depositTx.status === 'FAILED' || session.phase !== 'DEPOSIT';
    } else {
      isResolved =
        session.bridgeTx.status === 'SUCCESS' ||
        session.bridgeTx.status === 'FAILED' ||
        session.depositTx.status === 'SUCCESS' ||
        session.depositTx.status === 'FAILED';
    }

    if (isResolved) {
      setShowBridgeRecoveryBanner(false);
      clearBridgePendingSign();
    }
  }, [sessions, showBridgeRecoveryBanner, bridgePendingSignSessionId, bridgePendingSignPhase, clearBridgePendingSign]);

  useEffect(() => {
    const doneSession = sessions.find(
      s => s.phase === 'DONE' && isTxOwnedByCurrentUser(s, connectedWallets) && !shownSuccessRef.current.has(s.id)
    );
    if (doneSession) {
      shownSuccessRef.current.add(doneSession.id);
      try {
        localStorage.setItem('bridge_shown_success',
          JSON.stringify([...shownSuccessRef.current].slice(-20))
        );
      } catch { }
      setSuccessModalSessionId(doneSession.id);
    }
  }, [sessions, connectedWallets]);

  const activeSession = useMemo(() => {
    const found = sessions.find(s => s.id === activeSessionId) || null;
    if (found && !isTxOwnedByCurrentUser(found, connectedWallets)) return null;
    return found;
  }, [sessions, activeSessionId, connectedWallets]);

  const hasPendingSession = useMemo(() => {
    return sessions.some(s => isTxOwnedByCurrentUser(s, connectedWallets) && s.loadingStep);
  }, [sessions, connectedWallets]);

  const tokenBalance = useMemo(() => {
    if (!inputToken) return '0';
    return inputToken.balance || '0';
  }, [inputToken]);

  const handleMaxAmount = () => {
    if (tokenBalance && parseFloat(tokenBalance) > 0) {
      setInputAmount(sanitizeAmount(tokenBalance));
    }
  };

  const sanitizeAmount = (val: string | number | null | undefined, decimals: number = 7): string => {
    if (val === null || val === undefined || val === '') return '';
    const str = String(val);
    const parts = str.split('.');
    if (parts.length <= 1) return str;
    return `${parts[0]}.${parts[1].slice(0, decimals)}`;
  };


  useEffect(() => {
    if (quoteTimestamp === null || activeSession) {
      setQuoteAge(0);
      return;
    }
    setQuoteAge(Math.round((Date.now() - quoteTimestamp) / 1000));
    const interval = setInterval(() => {
      setQuoteAge(Math.round((Date.now() - quoteTimestamp) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [quoteTimestamp, activeSession]);

  const displayState = useMemo(() => {
    const stellarConfig = getStellarConfig(currentNetwork);

    let title = 'Bridge to dYdX';
    let finalBottomAmt = '0.00';
    let isPending = false;

    if (activeSession) {
      if (activeSession.phase === 'SWAP') {
        title = 'Prepare USDC on Stellar';
        finalBottomAmt = activeSession.expectedSwapOutput || '0.00';
      } else if (activeSession.phase === 'BRIDGE') {
        const activeChain = evmChains.find(c => c.chainId === activeSession.destinationChainId);
        isPending = activeSession.bridgeTx.status !== 'SUCCESS';
        title = isPending ? 'Funds Crossing Bridge...' : `Bridge to ${activeChain?.name || 'EVM'}`;
        finalBottomAmt = activeSession.expectedBridgeOutput || activeSession.intermediateAmount || activeSession.expectedSwapOutput || '0.00';
      } else if (activeSession.phase === 'DEPOSIT' || activeSession.phase === 'DONE') {
        title = activeSession.phase === 'DONE' ? 'Transfer Successful' : 'Settle Funds to dYdX';
        finalBottomAmt = activeSession.expectedBridgeOutput || activeSession.intermediateAmount || '0.00';
      }
    } else if (depositQuote?.receivedAmount) {
      finalBottomAmt = depositQuote.receivedAmount.toString();
    } else if (bridgeQuote?.amountToBeReceived) {
      let amt = parseFloat(bridgeQuote.amountToBeReceived);
      if (feePaymentMethod === FeePaymentMethod.WITH_STABLECOIN && bridgeQuote.feeOptions?.stablecoin) {
        amt = Math.max(0, amt - Number(bridgeQuote.feeOptions.stablecoin.float));
      }
      finalBottomAmt = amt.toString();
    }

    const inputSym = activeSession ? activeSession.inputTokenSymbol : (inputToken?.symbol || 'Select');
    const inputAmt = activeSession ? activeSession.inputAmount : inputAmount;
    const topLogo = activeSession
      ? (stellarAssets.find(a => a.symbol === activeSession.inputTokenSymbol)?.logoURI || ChainUrlHelpers.getTokenIcon(activeSession.inputTokenSymbol, stellarConfig))
      : (inputToken?.logoURI || ChainUrlHelpers.getTokenIcon(inputToken?.symbol || '', stellarConfig));

    return {
      top: {
        symbol: inputSym,
        network: 'STELLAR',
        amount: inputAmt,
        logo: topLogo,
        balance: activeSession ? activeSession.inputAmount : tokenBalance,
      },
      bottom: {
        symbol: 'USDC',
        network: 'DYDX',
        amount: finalBottomAmt,
        logo: USDC_LOGO_URL,
        isPending,
      },
      title,
    };
  }, [
    activeSession,
    inputAmount,
    inputToken,
    swapQuote,
    bridgeQuote,
    depositQuote,
    tokenBalance,
    destinationChain,
    currentNetwork,
    stellarAssets,
    isUsdc,
    evmChains,
  ]);

  const stablecoinFeeError = useMemo(() => {
    if (activeSession) return null;
    if (isQuoting) return null;
    if (feePaymentMethod !== FeePaymentMethod.WITH_STABLECOIN) return null;
    if (!rawQuotes?.bridge?.feeOptions?.stablecoin) return null;

    const bridgedUsdcAmount = isUsdc
      ? parseFloat(inputAmount || '0')
      : parseFloat(swapQuote?.estimatedOutput || '0');

    if (isNaN(bridgedUsdcAmount) || bridgedUsdcAmount <= 0) return null;

    const stablecoinFee = Number(rawQuotes.bridge.feeOptions.stablecoin.float || 0);
    if (bridgedUsdcAmount <= stablecoinFee) {
      const missingAmount = (stablecoinFee - bridgedUsdcAmount).toFixed(6);
      return {
        message: `Bridged USDC amount is not enough to cover the stablecoin bridge fee. You need at least ${(stablecoinFee + 0.01).toFixed(2)} USDC (missing ${missingAmount} USDC).`,
        suggestion: `Please increase the transfer amount or switch the Bridge Fee Currency to XLM below.`,
      };
    }
    return null;
  }, [activeSession, isQuoting, feePaymentMethod, rawQuotes, inputAmount, swapQuote, isUsdc]);

  const buttonLabel = useMemo(() => {
    if (!evmAddress || !stellarAddress) return 'CONNECT WALLETS';

    if (signingStep.phase === 'signing_swap') return 'CONFIRMING IN WALLET...';
    if (signingStep.phase === 'signing_bridge_approve') return 'APPROVE IN WALLET...';
    if (signingStep.phase === 'signing_bridge_send') return 'CONFIRMING IN WALLET...';
    if (signingStep.phase === 'signing_deposit_approve') return 'APPROVE USDC IN WALLET...';
    if (signingStep.phase === 'signing_deposit_confirm') return 'CONFIRM DEPOSIT IN WALLET...';

    if (activeSession) {
      if (activeSession.error) return 'TRY AGAIN';

      if (activeSession.phase === 'BRIDGE') {
        if (activeSession.bridgeTx.status === 'PENDING') return 'BRIDGING...';
        if (activeSession.bridgeTx.status === 'FAILED') return 'TRY AGAIN';
        if (activeSession.loadingStep) return 'PREPARING...';
        if (!activeSession.bridgeTx.hash) return 'CONFIRM IN WALLET';
        return 'RETRY BRIDGE';
      }

      if (activeSession.phase === 'DEPOSIT') {
        if (activeSession.bridgeTx.status !== 'SUCCESS') return 'WAITING FOR BRIDGE...';
        if (activeSession.depositTx.status === 'PENDING') return 'DEPOSITING...';
        if (activeSession.depositTx.status === 'FAILED') return 'TRY AGAIN';
        if (activeSession.loadingStep) return 'PREPARING...';
        if (!activeSession.depositTx.hash) return 'DEPOSIT TO DYDX';
        return 'RETRY DEPOSIT';
      }

      if (activeSession.phase === 'DONE') return 'START NEW TRANSFER';
    }

    if (setupError) return 'TRY AGAIN';
    if (hasPendingSession) return 'TRANSFER IN PROGRESS...';
    if (!inputAmount || parseFloat(inputAmount) <= 0) return 'ENTER AMOUNT';
    if (stablecoinFeeError) return 'AMOUNT TOO SMALL TO COVER FEE';

    const requiredBalance = parseFloat(inputAmount);
    const isInsufficient = requiredBalance > parseFloat(tokenBalance);
    if (isInsufficient) return 'INSUFFICIENT BALANCE';

    let minXlm = feePaymentMethod === FeePaymentMethod.WITH_NATIVE_CURRENCY ? 5 : 1;
    if (feePaymentMethod === FeePaymentMethod.WITH_NATIVE_CURRENCY && rawQuotes?.bridge?.feeOptions?.native) {
      minXlm += Number(rawQuotes.bridge.feeOptions.native.float);
    }
    const isInsufficientXlm = parseFloat(nativeBalance) < minXlm;
    if (isInsufficientXlm) return 'INSUFFICIENT XLM FOR GAS';
    if (isQuoting) return 'FETCHING QUOTES...';

    return 'START BRIDGE';
  }, [
    signingStep, activeSession, evmAddress, stellarAddress, setupError,
    hasPendingSession, inputAmount, stablecoinFeeError, tokenBalance,
    feePaymentMethod, rawQuotes, nativeBalance, isQuoting
  ]);

  const isButtonDisabled = useMemo(() => {
    if (!evmAddress || !stellarAddress) return true;
    if (signingStep.phase !== 'idle') return true;
    if (showBridgeRecoveryBanner) return true;

    if (activeSession) {
      if (activeSession.loadingStep) return true;
      if (activeSession.phase === 'BRIDGE' && activeSession.bridgeTx.status === 'PENDING') return true;
      if (activeSession.phase === 'DEPOSIT' && activeSession.bridgeTx.status !== 'SUCCESS') return true;
      if (activeSession.phase === 'DEPOSIT' && activeSession.depositTx.status === 'PENDING') return true;
      return false;
    }

    if (hasPendingSession) return true;
    if (parseFloat(inputAmount) <= 0) return true;
    if (stablecoinFeeError) return true;

    const requiredBalance = parseFloat(inputAmount);
    const isInsufficient = requiredBalance > parseFloat(tokenBalance);

    let minXlm = feePaymentMethod === FeePaymentMethod.WITH_NATIVE_CURRENCY ? 5 : 1;
    if (feePaymentMethod === FeePaymentMethod.WITH_NATIVE_CURRENCY && rawQuotes?.bridge?.feeOptions?.native) {
      minXlm += Number(rawQuotes.bridge.feeOptions.native.float);
    }
    const isInsufficientXlm = parseFloat(nativeBalance) < minXlm;

    if (isInsufficient || isInsufficientXlm) return true;
    if (isQuoting) return true;

    return false;
  }, [
    evmAddress, stellarAddress, activeSession, inputAmount, tokenBalance,
    nativeBalance, feePaymentMethod, isQuoting, hasPendingSession, isUsdc,
    rawQuotes, stablecoinFeeError, signingStep, showBridgeRecoveryBanner
  ]);

  const customButtonClass = useMemo(() => {
    if (hasPendingSession && !activeSession) {
      return 'bg-blue-500/10 text-blue-400 border border-blue-500/20 shadow-none cursor-not-allowed opacity-60';
    }
    if (buttonLabel === 'START BRIDGE' && !activeSession) {
      return 'bg-gradient-to-r from-brand to-brand/80 hover:brightness-110 shadow-lg shadow-brand/20 text-white border-0';
    }
    return '';
  }, [hasPendingSession, activeSession, buttonLabel]);

  const handleActionClick = async () => {
    if (!evmAddress || !stellarAddress) {
      openModal();
      return;
    }

    setAwaitingWalletConfirm(true);
    try {
      if (activeSession) {
        if (activeSession.phase === 'DONE') {
          dismissSession(activeSession.id);
          setActiveSessionId(null);
          return;
        }
        await executeSessionStep(activeSession.id);
        return;
      }
      await createSession();
    } catch (err: unknown) {
      console.error('Bridge action failed:', err);
    } finally {
      setAwaitingWalletConfirm(false);
    }
  };

  const handleBack = () => {
    if (activeSession) {
      const hasTx = activeSession.swapTx?.hash || activeSession.bridgeTx?.hash || activeSession.depositTx?.hash;
      if (!hasTx) {
        setInputAmount(activeSession.inputAmount);
        const token = stellarAssets.find(a => a.symbol === activeSession.inputTokenSymbol);
        if (token) setInputToken(token);
        const chain = evmChains.find(c => c.chainId === activeSession.destinationChainId);
        if (chain) setDestinationChain(chain);
        setFeePaymentMethod(activeSession.feePaymentMethod);
        dismissSession(activeSession.id);
      }
      setActiveSessionId(null);
    }
  };

  const routeBreakdown = useMemo(() => {
    if (activeSession) return null;
    if (!bridgeQuote && !depositQuote && !swapQuote) return null;
    const stellarConfig = getStellarConfig(currentNetwork);

    const bridgeFee = bridgeQuote
      ? feePaymentMethod === FeePaymentMethod.WITH_STABLECOIN
        ? bridgeQuote.feeOptions.stablecoin?.float
        : bridgeQuote.feeOptions.native?.float
      : 0;
    const bridgeTime = Math.round((bridgeQuote?.transferTimeMs || 0) / 60000);
    const depositTime = Math.round((depositQuote?.estimatedDurationSeconds || 0) / 60);

    const items: Array<{
      label: string;
      value: string;
      fee: string;
      amount: string;
      time?: string;
      icon: string;
      chainIcon: string | undefined;
      status: 'pending' | 'active' | 'done';
    }> = [];

    if (swapQuote) {
      const inputLogo = stellarAssets.find(t => t.symbol === inputToken?.symbol)?.logoURI || ChainUrlHelpers.getTokenIcon(inputToken?.symbol || '', stellarConfig);
      items.push({
        label: 'Swap',
        value: `${inputToken?.symbol} → USDC`,
        fee: 'Variable',
        amount: swapQuote.estimatedOutput ? portfolioUtils.formatBalance(swapQuote.estimatedOutput) : '',
        icon: inputLogo,
        chainIcon: stellarConfig.logoUrl,
        status: 'pending',
      });
    }

    if (bridgeQuote) {
      let bridgeAmt = bridgeQuote.amountToBeReceived ? parseFloat(bridgeQuote.amountToBeReceived) : 0;
      if (feePaymentMethod === FeePaymentMethod.WITH_STABLECOIN && bridgeQuote.feeOptions?.stablecoin) {
        bridgeAmt = Math.max(0, bridgeAmt - Number(bridgeQuote.feeOptions.stablecoin.float));
      }
      items.push({
        label: 'Bridge',
        value: `Stellar → ${destinationChain?.name}`,
        fee: `${bridgeFee} ${feePaymentMethod === FeePaymentMethod.WITH_STABLECOIN ? 'USDC (deducted from amount)' : 'XLM'}`,
        amount: bridgeAmt ? portfolioUtils.formatBalance(bridgeAmt.toString()) : '',
        time: `${bridgeTime}m`,
        icon: USDC_LOGO_URL,
        chainIcon: stellarConfig.logoUrl,
        status: 'pending',
      });
    }

    if (depositQuote) {
      const rawFee = ((depositQuote.usd_amount_in ?? 0) - (depositQuote.usd_amount_out ?? 0)) || 0.02;
      items.push({
        label: 'Bridge',
        value: `${destinationChain?.name} → dYdX`,
        fee: `$${rawFee.toFixed(4)}`,
        amount: depositQuote.receivedAmount ? portfolioUtils.formatBalance(depositQuote.receivedAmount.toString()) : '',
        time: `${depositTime}m`,
        icon: USDC_LOGO_URL,
        chainIcon: destinationChain?.logoURI,
        status: 'pending',
      });
      items.push({
        label: 'Settled',
        value: 'dYdX Account',
        fee: '---',
        amount: depositQuote.receivedAmount ? portfolioUtils.formatBalance(depositQuote.receivedAmount.toString()) : '',
        icon: USDC_LOGO_URL,
        chainIcon: DYDX_LOGO_URL,
        status: 'pending',
      });
    }

    return { items, totalTime: bridgeTime + depositTime };
  }, [
    activeSession, bridgeQuote, depositQuote, swapQuote, inputToken, destinationChain,
    currentNetwork, stellarAssets, feePaymentMethod,
  ]);

  const activeChain = activeSession
    ? evmChains.find(c => c.chainId === activeSession.destinationChainId)
    : destinationChain;

  if (!isBothConnected && !activeSession) {
    return <WalletConnectionRequired openModal={openModal} />;
  }

  return (
    <StellarActiveGuard bypass={!!activeSession}>
      <div className="w-full mx-auto lg:px-4 pb-4 animate-fade-in">
        {activeSession && !isSigningInProgress && !showBridgeRecoveryBanner && (
          <div className="-mb-1 flex px-2 items-center justify-between">
            <button
              onClick={handleBack}
              className="flex items-center gap-2 bg-brand hover:brightness-110 px-5 py-2.5 rounded-xl rounded-b-none pb-5 border border-brand/20 shadow-lg shadow-brand/20 text-white transition-all group animate-fade-in"
            >
              <ArrowLeft size={12} className="group-hover:-translate-x-0.5 transition-transform text-white" />
              <span className="text-[9px] font-black uppercase tracking-widest text-white">
                Setup New Transfer
              </span>
            </button>
          </div>
        )}

        <div className="space-y-4 relative">
          <div className="space-y-1 relative z-10">
            <div className="bg-tertiary rounded-2xl p-4 py-6 lg:p-8 group transition-all duration-500 shadow-xl relative z-20 border border-divider/10">
              {/* Bridge Route: EVM Network Selection */}
              <div className="mb-6 pb-5 border-b border-divider/30 w-full max-w-full overflow-hidden min-w-0">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 mb-4">
                  <div className="flex items-center gap-2">
                    <Layers size={13} className="text-brand" />
                    <span className="text-[10px] font-black text-primary uppercase tracking-[0.2em]">
                      Bridge Routing Conduit
                    </span>
                  </div>

                  {/* Route Pathway Breadcrumb */}
                  <div className="flex items-center gap-1.5 text-[8.5px] font-black text-muted bg-secondary/60 border border-divider/30 px-3 py-1.5 rounded-full shadow-inner w-fit">
                    <img src={getStellarConfig(currentNetwork).logoUrl} className="w-3.5 h-3.5 rounded-full" alt="" />
                    <span className="text-muted/85">STELLAR</span>
                    <span className="text-brand/60">→</span>
                    <img src={activeChain?.logoURI} className="w-3.5 h-3.5 rounded-full transition-all duration-300" alt="" key={activeChain?.chainId} />
                    <span className="text-brand font-black">{activeChain?.name?.toUpperCase()}</span>
                    <span className="text-brand/60">→</span>
                    <div className="w-3.5 h-3.5 bg-black rounded-full flex items-center justify-center p-0.5">
                      <img src={DYDX_LOGO_URL} className="w-full h-full object-contain" alt="" />
                    </div>
                    <span className="text-muted/85">DYDX</span>
                  </div>
                </div>

                {activeSession ? (
                  /* During Active Session, show pinned active chain conduit badge */
                  <div className="flex items-center gap-2.5 bg-brand/5 border border-brand/20 px-4 py-2.5 rounded-2xl w-fit">
                    <div className="relative flex-shrink-0">
                      <img src={activeChain?.logoURI} className="w-5 h-5 rounded-full" alt="" />
                      <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border border-secondary animate-pulse" />
                    </div>
                    <span className="text-xs font-black text-brand uppercase tracking-wider">
                      Active Pathway: {activeChain?.name}
                    </span>
                  </div>
                ) : (
                  /* Prior to starting session, show Pinned selected chain and Scrollable unselected chains */
                  <div className="flex items-center gap-3 w-full min-w-0 overflow-hidden">
                    {destinationChain && (
                      <div className="flex-shrink-0 flex items-center gap-2 bg-brand border border-brand px-4 py-2.5 rounded-2xl shadow-lg shadow-brand/20 text-white">
                        <img src={destinationChain.logoURI} className="w-5 h-5 rounded-full" alt="" />
                        <span className="text-xs font-black uppercase tracking-wider">
                          {destinationChain.name}
                        </span>
                      </div>
                    )}

                    {evmChains.length > 1 && (
                      <div className="w-[1px] h-6 bg-divider/30 flex-shrink-0" />
                    )}

                    <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide py-0.5 flex-1 select-none min-w-0">
                      {evmChains
                        .filter(c => c.chainId !== destinationChain?.chainId)
                        .map(c => (
                          <button
                            key={c.chainId}
                            onClick={() => setDestinationChain(c)}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-secondary hover:bg-hover border border-divider/60 text-muted hover:text-primary hover:border-divider text-[10px] font-black uppercase tracking-wider transition-all flex-shrink-0 active:scale-[0.98]"
                          >
                            <img src={c.logoURI} className="w-3.5 h-3.5 rounded-full opacity-60 hover:opacity-100" alt="" />
                            <span>{c.name}</span>
                          </button>
                        ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="flex justify-between items-center mb-6">
                <span className="text-[10px] font-black text-muted uppercase tracking-[0.3em]">
                  You Pay
                </span>
                {!activeSession && (
                  <button
                    onClick={handleMaxAmount}
                    className="text-[10px] font-black text-brand bg-brand/10 px-4 py-1.5 rounded-full hover:bg-brand hover:text-white transition-all tracking-widest min-h-[24px] min-w-[100px] flex items-center justify-center"
                  >
                    {loadingAssets ? (
                      <Shimmer className="h-2 w-16" />
                    ) : (
                      `MAX: ${parseFloat(parseFloat(tokenBalance).toFixed(7)).toString()}`
                    )}
                  </button>
                )}
              </div>

              <div className="flex items-center gap-3 sm:gap-6">
                <button
                  onClick={() =>
                    !activeSession &&
                    openAssetSelector('BRIDGE', {
                      forceNetwork: STELLAR_CHAIN_ID,
                      showAllStellarAssets: true,
                      onSelect: (a: StellarToken) => {
                        const found = stellarAssets.find(s => s.symbol === a.symbol);
                        setInputToken(found || a);
                      },
                    })
                  }
                  className={`flex items-center gap-2 sm:gap-4 bg-secondary hover:bg-hover rounded-2xl px-3 py-3 sm:px-5 sm:py-4 transition-all border border-divider/50 shadow-sm min-w-[130px] sm:min-w-[190px] ${!activeSession ? 'active:scale-95' : 'pointer-events-none opacity-80'}`}
                >
                  {loadingAssets && !activeSession ? (
                    <div className="flex items-center gap-2 sm:gap-4">
                      <Shimmer className="w-8 h-8 sm:w-10 sm:h-10 rounded-full" />
                      <div className="flex flex-col gap-1 sm:gap-2">
                        <Shimmer className="h-4 w-12" />
                        <Shimmer className="h-2 w-8" />
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="relative">
                        <img
                          src={displayState.top.logo}
                          className="w-8 h-8 sm:w-10 sm:h-10 rounded-full object-cover shadow-md"
                          alt=""
                        />
                        <div className="absolute -bottom-1 -right-1 w-4.5 h-4.5 sm:w-5 sm:h-5 rounded-full border-2 border-secondary bg-primary flex items-center justify-center p-0.5 shadow-sm">
                          <img
                            src={
                              activeSession && (activeSession.phase === 'DEPOSIT' || activeSession.phase === 'DONE')
                                ? activeChain?.logoURI
                                : getStellarConfig(currentNetwork).logoUrl
                            }
                            className="w-full h-full object-contain rounded-full"
                            alt=""
                          />
                        </div>
                      </div>
                      <div className="flex flex-col items-start leading-tight">
                        <span className="font-black text-sm sm:text-lg text-primary uppercase tracking-tight">
                          {displayState.top.symbol}
                        </span>
                        <span className="text-[8px] sm:text-[9px] font-black text-muted uppercase tracking-tighter">
                          {activeSession && (activeSession.phase === 'DEPOSIT' || activeSession.phase === 'DONE')
                            ? activeChain?.name || 'EVM'
                            : 'Stellar'}
                        </span>
                      </div>
                      {!activeSession && <ChevronDown size={12} className="text-muted ml-auto" />}
                    </>
                  )}
                </button>

                <div className="flex-1 w-0 min-w-0 flex flex-col items-end">
                  {!activeSession ? (
                    <input
                      ref={inputRef}
                      type="text"
                      inputMode="decimal"
                      placeholder="0.00"
                      className="w-full bg-transparent border-none text-right text-3xl sm:text-5xl font-black focus:ring-0 p-0 placeholder:text-muted/10 outline-none text-primary tracking-tighter min-w-0"
                      value={inputAmount}
                      onChange={e => setInputAmount(sanitizeAmount(e.target.value.replace(/[^0-9.]/g, '')))}
                    />
                  ) : (
                    <div className="max-w-full overflow-x-auto whitespace-nowrap scrollbar-hide text-3xl sm:text-5xl font-black text-primary tracking-tighter">
                      {displayState.top.amount
                        ? parseFloat(parseFloat(displayState.top.amount).toFixed(7)).toString()
                        : '0.00'}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="absolute left-1/2  -translate-x-1/2 -translate-y-1/2 z-30 pointer-events-none">
              <div className="w-12 h-12 border border-brand bg-secondary rounded-full flex items-center justify-center shadow-2xl">
                <ArrowUpDown size={18} className="text-brand" />
              </div>
            </div>

            <div className="bg-tertiary rounded-2xl p-4 py-6 lg:p-8 group transition-all duration-500 shadow-xl relative overflow-hidden border border-divider/20 z-20 w-full max-w-full">
              <div className="flex justify-between items-center mb-6">
                <span className="text-[10px] font-black text-muted uppercase tracking-[0.3em]">
                  You Receive
                </span>
                {(!activeSession || activeSession.phase === 'SETUP' || activeSession.phase === 'SWAP' || activeSession.phase === 'BRIDGE') ? (
                  <div className="flex items-center gap-1.5 bg-brand/5 px-3 py-1 rounded-full border border-brand/10">
                    <span className="text-[9px] font-black text-brand uppercase tracking-tighter italic">
                      Pending Final Settlement
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 bg-brand/10 px-3 py-1 rounded-full border border-brand/20">
                    <CheckCircle2 size={10} className="text-brand" />
                    <span className="text-[9px] font-black text-brand uppercase tracking-tighter">
                      {activeSession?.phase === 'DONE' ? 'Settled on dYdX' : 'Crossing to dYdX'}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3 sm:gap-6">
                <div className="flex items-center gap-2 sm:gap-4 bg-secondary rounded-2xl px-3 py-3 sm:px-5 sm:py-4 border border-divider/50 shadow-sm min-w-[130px] sm:min-w-[190px] opacity-90">
                  <div className="relative">
                    <img
                      src={displayState.bottom.logo}
                      className="w-8 h-8 sm:w-10 sm:h-10 rounded-full object-cover shadow-md"
                      alt=""
                    />
                    <div className="absolute -bottom-1 -right-1 w-4.5 h-4.5 sm:w-5 sm:h-5 rounded-full border-2 border-secondary bg-bg-primary flex items-center justify-center p-0.5 shadow-sm">
                      {displayState.bottom.network === 'DYDX' ? (
                        <div className="w-full h-full bg-black rounded-full flex items-center justify-center p-1">
                          <img src={DYDX_LOGO_URL} className="w-full h-full object-contain" alt="" />
                        </div>
                      ) : (
                        <img
                          src={getChainById(
                            displayState.bottom.network === 'STELLAR'
                              ? STELLAR_CHAIN_ID
                              : activeChain?.chainId || 42161
                          )?.logoURI}
                          className="w-full h-full object-contain"
                          alt=""
                        />
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-start leading-tight">
                    <span className="font-black text-sm sm:text-lg text-primary uppercase tracking-tight">
                      {displayState.bottom.symbol}
                    </span>
                    <span className="text-[8px] sm:text-[9px] font-black text-muted uppercase tracking-tighter">
                      {displayState.bottom.network}
                    </span>
                  </div>
                </div>

                <div className="flex-1 w-0 min-w-0 flex flex-col items-end">
                  {isQuoting ? (
                    <Shimmer className="h-10 w-full mb-1" />
                  ) : (
                    <div className="max-w-full overflow-x-auto whitespace-nowrap scrollbar-hide text-3xl sm:text-5xl font-black text-primary tracking-tighter">
                      {displayState.bottom.amount
                        ? portfolioUtils.formatBalance(displayState.bottom.amount)
                        : '0.00'}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {quoteTimestamp !== null && !activeSession && !isQuoting && (
            <div className="flex items-center justify-end gap-1.5 px-4 mt-2">
              {quoteAge < 20 ? (
                <span className="text-[9px] font-black uppercase tracking-widest text-emerald-400">
                  Quote is fresh
                </span>
              ) : quoteAge < 45 ? (
                <span className="text-[9px] font-black uppercase tracking-widest text-muted">
                  Quote updated {quoteAge}s ago
                </span>
              ) : (
                <div className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-amber-400">
                  <RefreshCw size={10} className="animate-spin text-amber-400" />
                  <span>Refreshing quote…</span>
                </div>
              )}
            </div>
          )}

          {activeSession && (
            <SessionRoadmap session={activeSession} evmChains={evmChains} signingStep={signingStep} />
          )}

          {!activeSession && routeBreakdown && (
            <div className="flex justify-center -mt-2 -mb-1">
              <button
                onClick={() => setShowFullDetails(!showFullDetails)}
                className="text-[10px] bg-primary p-3 px-5 rounded-t-lg font-black text-muted hover:text-brand uppercase tracking-widest flex items-center gap-1.5 transition-colors"
              >
                {showFullDetails ? <EyeOff size={12} /> : <Eye size={12} />}
                {showFullDetails ? 'Hide Full Quote' : 'View Full Route Details'}
              </button>
            </div>
          )}

          {!activeSession && routeBreakdown && (
            <RouteBreakdownPanel
              routeBreakdown={routeBreakdown}
              nativeBalance={nativeBalance}
              feePaymentMethod={feePaymentMethod}
              setFeePaymentMethod={setFeePaymentMethod}
              showFullDetails={showFullDetails}
              rawQuotes={rawQuotes}
              inputToken={inputToken}
              currentNetwork={currentNetwork}
              destinationChain={destinationChain}
            />
          )}

          <div className="pt-2">
            {stablecoinFeeError && (
              <div
                className="rounded-2xl p-4 mb-4 animate-fade-in space-y-2"
                style={{
                  background: 'color-mix(in srgb, var(--color-warning, #eab308) 10%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--color-warning, #eab308) 35%, transparent)',
                }}
              >
                <div className="flex items-start gap-3">
                  <div
                    className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{ background: 'color-mix(in srgb, var(--color-warning, #eab308) 20%, transparent)' }}
                  >
                    <Info size={16} className="text-amber-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-widest mb-1 text-amber-500">
                      Insufficient Bridge Amount
                    </p>
                    <p className="text-xs font-bold leading-relaxed break-words" style={{ color: 'var(--color-text-secondary)' }}>
                      {stablecoinFeeError.message}
                    </p>
                    <p className="text-[10px] font-bold mt-1 opacity-80" style={{ color: 'var(--color-text-muted)' }}>
                      {stablecoinFeeError.suggestion}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {!activeSession && !isGasWarningDismissed && !checkingGasBalance && destinationGasBalance !== null && parseFloat(destinationGasBalance) < 0.0005 && destinationChain && (
              <div
                className="rounded-2xl p-4 mb-4 animate-fade-in space-y-2 relative"
                style={{
                  background: 'color-mix(in srgb, var(--color-warning, #eab308) 8%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--color-warning, #eab308) 25%, transparent)',
                }}
              >
                <button
                  onClick={() => setIsGasWarningDismissed(true)}
                  className="absolute top-3 right-3 text-muted hover:text-primary transition-colors p-1 rounded-lg hover:bg-white/5"
                  aria-label="Dismiss warning"
                >
                  <X size={14} className="text-amber-500/70 hover:text-amber-500 transition-colors" />
                </button>
                <div className="flex items-start gap-3 pr-6">
                  <div
                    className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{ background: 'color-mix(in srgb, var(--color-warning, #eab308) 15%, transparent)' }}
                  >
                    <Info size={16} className="text-amber-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-widest mb-1 text-amber-500">
                      Destination Gas Warning
                    </p>
                    <p className="text-xs font-bold leading-relaxed break-words" style={{ color: 'var(--color-text-secondary)' }}>
                      You need a small amount of {destinationChain.nativeCurrency.symbol} on {destinationChain.name} to complete the final deposit to dYdX.
                    </p>
                    <p className="text-[10px] font-bold mt-1 opacity-80" style={{ color: 'var(--color-text-muted)' }}>
                      Current balance: {parseFloat(destinationGasBalance).toFixed(5)} {destinationChain.nativeCurrency.symbol}. Please acquire gas before the deposit step.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* EVM USDC balance warning for DEPOSIT phase — catches the case where the user
                spent bridged funds on the destination chain before clicking Deposit */}
            {activeSession &&
              activeSession.phase === 'DEPOSIT' &&
              activeSession.bridgeTx.status === 'SUCCESS' &&
              !activeSession.depositTx.hash &&
              !checkingEvmUsdcBalance &&
              evmUsdcBalance !== null &&
              activeSession.intermediateAmount &&
              parseFloat(evmUsdcBalance) < parseFloat(activeSession.intermediateAmount) * 0.95 && (
              <div
                className="rounded-2xl p-4 mb-4 animate-fade-in space-y-2"
                style={{
                  background: 'color-mix(in srgb, #ef4444 8%, transparent)',
                  border: '1px solid color-mix(in srgb, #ef4444 30%, transparent)',
                }}
              >
                <div className="flex items-start gap-3">
                  <div
                    className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{ background: 'color-mix(in srgb, #ef4444 15%, transparent)' }}
                  >
                    <AlertCircle size={16} className="text-rose-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-widest mb-1 text-rose-400">
                      Insufficient USDC on {evmChains.find(c => c.chainId === activeSession.destinationChainId)?.name || 'EVM'}
                    </p>
                    <p className="text-xs font-bold leading-relaxed break-words" style={{ color: 'var(--color-text-secondary)' }}>
                      Your EVM wallet only has{' '}
                      <span className="text-rose-400 font-black">{parseFloat(evmUsdcBalance).toFixed(4)} USDC</span>{' '}
                      but the deposit requires ~{parseFloat(activeSession.intermediateAmount).toFixed(4)} USDC.
                      The bridged funds may have been spent or are still arriving.
                    </p>
                    <p className="text-[10px] font-bold mt-1 opacity-80" style={{ color: 'var(--color-text-muted)' }}>
                      Please ensure you have sufficient USDC on {evmChains.find(c => c.chainId === activeSession.destinationChainId)?.name || 'the destination chain'} before depositing.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {signingStep.phase !== 'idle' && (
              <div className="flex flex-col gap-1 bg-brand/10 border border-brand/20 rounded-2xl px-4 py-4 mb-3 animate-in fade-in slide-in-from-top-2 duration-300 animate-pulse">
                <div className="flex items-center gap-3">
                  <Wallet size={18} className="text-brand flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-black text-brand uppercase tracking-widest">
                      {signingStep.walletType === 'stellar'
                        ? 'Confirm in your Stellar wallet'
                        : 'Confirm in your EVM wallet'}
                    </p>
                    <p className="text-[10px] font-bold text-brand/70 mt-0.5">
                      Sending {signingStep.inputSymbol} to dYdX  •  Step {signingStep.stepNumber} of {signingStep.totalSteps}
                    </p>
                  </div>
                </div>
                {(signingStep.phase === 'signing_bridge_approve' || signingStep.phase === 'signing_bridge_send') && (
                  signingStep.phase === 'signing_bridge_approve' ? (
                    <div className="flex items-center gap-2 mt-2 pl-7">
                      <SubStepPill state="active" label="Approve bridge" />
                      <Connector />
                      <SubStepPill state="waiting" label="Send transaction" />
                    </div>
                  ) : null
                )}

                {(signingStep.phase === 'signing_deposit_approve' || signingStep.phase === 'signing_deposit_confirm') && (
                  <div className="flex items-center gap-2 mt-2 pl-7">
                    <SubStepPill
                      state={signingStep.phase === 'signing_deposit_approve' ? 'active' : 'done'}
                      label="Approve USDC spend"
                    />
                    <Connector />
                    <SubStepPill
                      state={signingStep.phase === 'signing_deposit_confirm' ? 'active' : 'waiting'}
                      label="Confirm deposit"
                    />
                  </div>
                )}
              </div>
            )}
            {showBridgeRecoveryBanner && signingStep.phase === 'idle' && (
              <div className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl px-4 py-3 mb-3 animate-in fade-in slide-in-from-top-2 duration-300">
                <span className="text-amber-400 text-base leading-none flex-shrink-0">⏳</span>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-black text-amber-400 uppercase tracking-widest">
                    {bridgePendingSignPhase === 'signing_swap'
                      ? 'Waiting for swap signature'
                      : bridgePendingSignPhase === 'signing_bridge' || bridgePendingSignPhase === 'signing_bridge_approve' || bridgePendingSignPhase === 'signing_bridge_send'
                        ? 'Waiting for bridge signature'
                        : bridgePendingSignPhase === 'signing_deposit' || bridgePendingSignPhase === 'signing_deposit_approve' || bridgePendingSignPhase === 'signing_deposit_confirm'
                          ? 'Waiting for deposit signature'
                          : 'Signature pending'}
                  </p>
                  <p className="text-[11px] text-amber-400/70 font-medium mt-0.5">
                    You navigated away while signing. Open your wallet app to approve the pending transaction.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShowBridgeRecoveryBanner(false);
                    clearBridgePendingSign();
                    if (bridgePendingSignSessionId) {
                      setActiveSessionId(bridgePendingSignSessionId);
                    }
                  }}
                  className="flex-shrink-0 text-[10px] font-bold text-amber-400/60 hover:text-amber-300 border border-amber-500/20 hover:border-amber-400/40 rounded-lg px-2 py-1 transition-colors duration-150 whitespace-nowrap"
                >
                  Dismiss
                </button>
              </div>
            )}
            {awaitingWalletConfirm && signingStep.phase === 'idle' && !showBridgeRecoveryBanner && (
              <div className="flex items-center gap-2 bg-blue-500/8 border border-blue-500/20 rounded-2xl px-4 py-2.5 mb-3 animate-in fade-in slide-in-from-top-2 duration-300">
                <span className="text-blue-400 text-sm leading-none animate-spin">⟳</span>
                <p className="text-[11px] font-semibold text-blue-400/80">
                  Building your request — please wait.
                </p>
              </div>
            )}

            {(activeSession?.error || setupError) && (() => {
              const isSafeToDiscard =
                !!setupError ||
                (activeSession?.phase === 'SWAP' && !activeSession?.swapTx?.hash) ||
                (activeSession?.phase === 'BRIDGE' && !activeSession?.bridgeTx?.hash) ||
                (activeSession?.phase === 'DEPOSIT' && !activeSession?.depositTx?.hash);

              return (
                <div
                  className="rounded-2xl p-4 mb-4 animate-fade-in space-y-3"
                  style={{
                    background: 'var(--color-danger-bg)',
                    border: '1px solid color-mix(in srgb, var(--color-danger) 30%, transparent)',
                  }}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
                      style={{ background: 'color-mix(in srgb, var(--color-danger) 20%, transparent)' }}
                    >
                      <AlertCircle size={16} style={{ color: 'var(--color-danger)' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p
                        className="text-[10px] font-black uppercase tracking-widest mb-1"
                        style={{ color: 'var(--color-danger)' }}
                      >
                        Transaction Failed
                      </p>
                      <p
                        className="text-xs font-bold leading-relaxed break-words"
                        style={{ color: 'var(--color-text-secondary)' }}
                      >
                        {activeSession?.error ? activeSession.error.message : setupError}
                      </p>
                      {activeSession?.error?.action && (
                        <p
                          className="text-[10px] font-bold mt-1 opacity-80"
                          style={{ color: 'var(--color-text-muted)' }}
                        >
                          {activeSession.error.action}
                        </p>
                      )}
                    </div>
                  </div>

                  {isSafeToDiscard && (
                    <button
                      onClick={() => {
                        if (activeSession) {
                          setRestoreInputsOnClear(true);
                          setSessionToClear(activeSession.id);
                        } else {
                          clearSetupForm();
                        }
                      }}
                      className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-[11px] font-black uppercase tracking-widest transition-all active:scale-[0.98] hover:opacity-80"
                      style={{
                        background: 'var(--color-bg-secondary)',
                        border: '1px solid var(--color-border)',
                        color: 'var(--color-text-primary)',
                      }}
                    >
                      Cancel &amp; Start Over
                    </button>
                  )}

                  {!isSafeToDiscard && (
                    <p
                      className="text-[9px] font-bold uppercase tracking-wider text-center"
                      style={{ color: 'color-mix(in srgb, var(--color-danger) 60%, transparent)' }}
                    >
                      ⚠ Funds are on-chain — tap "Try Again" below to retry safely.
                    </p>
                  )}
                </div>
              );
            })()}

            {activeSession && activeSession.phase === 'BRIDGE' && (
              <div className="mb-4 bg-secondary/50 p-4 rounded-2xl border border-divider flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-[10px] font-black text-muted uppercase tracking-widest">
                    Bridge Fee Currency
                  </span>
                  <span className="text-[11px] font-bold text-primary mt-1">
                    Select how you want to pay network fees:
                  </span>
                </div>
                <button
                  onClick={() =>
                    updateSession(activeSession.id, {
                      feePaymentMethod: activeSession.feePaymentMethod === FeePaymentMethod.WITH_STABLECOIN
                        ? FeePaymentMethod.WITH_NATIVE_CURRENCY
                        : FeePaymentMethod.WITH_STABLECOIN
                    })
                  }
                  className="flex items-center gap-2 bg-secondary p-1 rounded-xl border border-divider shadow-sm"
                >
                  <div
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all ${activeSession.feePaymentMethod === FeePaymentMethod.WITH_STABLECOIN
                      ? 'bg-brand text-white shadow-lg shadow-brand/20'
                      : 'text-muted opacity-50'
                      }`}
                  >
                    <img src={USDC_LOGO_URL} className="w-3.5 h-3.5 rounded-full" alt="" />
                    <span className="text-[10px] font-black">USDC</span>
                  </div>
                  <div
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all ${activeSession.feePaymentMethod === FeePaymentMethod.WITH_NATIVE_CURRENCY
                      ? 'bg-brand text-white shadow-lg shadow-brand/20'
                      : 'text-muted opacity-50'
                      }`}
                  >
                    <img
                      src={getStellarConfig(currentNetwork).logoUrl}
                      className="w-3.5 h-3.5 rounded-full"
                      alt=""
                    />
                    <span className="text-[10px] font-black">XLM</span>
                  </div>
                </button>
              </div>
            )}

            {activeSession?.phase === 'DONE' ? (
              <div className="bg-success/5 rounded-[2rem] border border-success/20 p-8 text-center animate-bounce-in shadow-xl">
                <div className="w-16 h-16 bg-success rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-success/20">
                  <CheckCircle2 size={32} className="text-white" />
                </div>
                <h3 className="text-xl font-bold text-primary mb-2 uppercase">Success!</h3>
                <p className="text-xs text-muted mb-6">Transfer executed successfully.</p>
                <button
                  onClick={handleActionClick}
                  className="w-full bg-success text-white font-bold py-4 rounded-2xl tracking-widest hover:brightness-110 transition-all uppercase"
                >
                  Back to Dashboard
                </button>
              </div>
            ) : (
              <div className="relative">
                {activeSession && activeSession.phase === 'DEPOSIT' && activeSession.bridgeTx.status !== 'SUCCESS' && (
                  <div className="mb-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 flex flex-col gap-3 animate-pulse">
                    <div className="flex items-center gap-3">
                      <RefreshCw size={16} className="text-amber-400 animate-spin flex-shrink-0" />
                      <h4 className="text-xs font-black uppercase tracking-widest text-amber-400">
                        Bridge transfer in progress
                      </h4>
                    </div>
                    <p className="text-[11px] font-medium leading-relaxed text-amber-400/90">
                      Your USDC is being transferred to {activeChain?.name}. The deposit step will unlock automatically when funds arrive — you can safely close this tab and return later.
                    </p>
                    {activeSession.bridgeTx.hash && (
                      <a
                        href={`https://core.allbridge.io/explorer/transfer/${activeSession.bridgeTx.hash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] font-black text-amber-400/80 hover:text-amber-400 flex items-center gap-1 uppercase tracking-widest mt-1"
                      >
                        Track on Allbridge Explorer <ExternalLink size={10} />
                      </a>
                    )}
                  </div>
                )}
                <ActionGuard requiredWallets={[WalletType.EVM, WalletType.STELLAR]}>
                  <TransactionButton
                    label={buttonLabel}
                    isLoading={
                      isQuoting ||
                      signingStep.phase !== 'idle' ||
                      activeSession?.loadingStep ||
                      (activeSession?.phase === 'BRIDGE' && activeSession?.bridgeTx.status === 'PENDING') ||
                      (activeSession?.phase === 'DEPOSIT' && activeSession?.depositTx.status === 'PENDING')
                    }
                    loadingLabel={
                      signingStep.phase === 'signing_swap'
                        ? 'SIGN SWAP IN WALLET...'
                        : signingStep.phase === 'signing_bridge_approve'
                          ? 'APPROVE BRIDGE...'
                          : signingStep.phase === 'signing_bridge_send'
                            ? 'SIGN BRIDGE IN WALLET...'
                            : signingStep.phase === 'signing_deposit_approve'
                              ? 'APPROVE USDC IN WALLET...'
                              : signingStep.phase === 'signing_deposit_confirm'
                                ? 'CONFIRM DEPOSIT IN WALLET...'
                                : activeSession?.loadingStep
                                  ? 'PREPARING REQUEST...'
                                  : activeSession?.phase === 'BRIDGE' && activeSession?.bridgeTx.status === 'PENDING'
                                    ? 'BRIDGING...'
                                    : activeSession?.phase === 'DEPOSIT' && activeSession?.depositTx.status === 'PENDING'
                                      ? 'SETTLING TO DYDX...'
                                      : isQuoting
                                        ? 'FETCHING QUOTES...'
                                        : 'PROCESSING...'
                    }
                    isDisabled={isButtonDisabled}
                    isError={!!(activeSession?.error || setupError || buttonLabel.includes('INSUFFICIENT'))}
                    icon={
                      !activeSession ? (
                        hasPendingSession ? (
                          <Lock size={18} className="animate-pulse" />
                        ) : buttonLabel === 'START BRIDGE' ? (
                          <ArrowUpRight size={18} />
                        ) : undefined
                      ) : undefined
                    }
                    onClick={handleActionClick}
                    className={`py-4 rounded-xl text-md font-bold tracking-widest shadow-xl uppercase ${customButtonClass}`}
                  />
                </ActionGuard>
              </div>
            )}
          </div>
        </div>

        {sessions.filter(s => {
          if (s.id === activeSessionId) return false;
          if (s.phase === 'DONE') return false;
          if (!isTxOwnedByCurrentUser(s, connectedWallets)) return false;
          const hasPending = s.swapTx?.status === 'PENDING' || s.bridgeTx?.status === 'PENDING' || s.depositTx?.status === 'PENDING';
          const needsAction =
            (s.phase === 'DEPOSIT' && !s.depositTx?.hash) ||
            (s.phase === 'BRIDGE' && !s.bridgeTx?.hash) ||
            (s.phase === 'SWAP' && !s.swapTx?.hash);
          return hasPending || needsAction || !!s.error;
        }).length > 0 && (
            <div className="space-y-3 mt-4 border-t border-divider/40 pt-4">
              {(() => {
                const otherSessions = sessions.filter(s => {
                  if (s.id === activeSessionId) return false;
                  if (s.phase === 'DONE') return false;
                  if (!isTxOwnedByCurrentUser(s, connectedWallets)) return false;
                  const hasPending =
                    s.swapTx?.status === 'PENDING' ||
                    s.bridgeTx?.status === 'PENDING' ||
                    s.depositTx?.status === 'PENDING';
                  const needsAction =
                    (s.phase === 'DEPOSIT' && !s.depositTx?.hash) ||
                    (s.phase === 'BRIDGE' && !s.bridgeTx?.hash) ||
                    (s.phase === 'SWAP' && !s.swapTx?.hash);
                  return hasPending || needsAction || !!s.error;
                });
                const displayedSessions = showAllSessions ? otherSessions : otherSessions.slice(0, 2);

                return (
                  <>
                    {displayedSessions.map(s => (
                      <PendingSessionCard
                        key={s.id}
                        session={s}
                        evmChains={evmChains}
                        updateSession={updateSession}
                        setActiveSessionId={setActiveSessionId}
                        setRestoreInputsOnClear={setRestoreInputsOnClear}
                        setSessionToClear={setSessionToClear}
                        isSigningInProgress={isSigningInProgress || showBridgeRecoveryBanner}
                      />
                    ))}

                    {otherSessions.length > 2 && (
                      <div className="flex justify-center mt-1">
                        <button
                          onClick={() => setShowAllSessions(prev => !prev)}
                          className="text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg transition-all active:scale-[0.98] hover:brightness-110 flex items-center justify-center gap-1"
                          style={{
                            background: 'transparent',
                            color: 'var(--color-brand)',
                            border: 'none',
                            cursor: 'pointer',
                          }}
                        >
                          <span>{showAllSessions ? 'Show Less' : `See All (${otherSessions.length})`}</span>
                          <ChevronDown
                            size={12}
                            className={`transition-transform duration-200 ${showAllSessions ? 'rotate-180' : ''}`}
                          />
                        </button>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          )}

        <ConfirmationModal
          isOpen={sessionToClear !== null}
          title="Clear Active Transfer"
          message="Are you sure you want to clear this active transfer? This action cannot be undone."
          confirmText="Clear"
          cancelText="Cancel"
          confirmButtonType="danger"
          onConfirm={() => {
            if (sessionToClear) {
              const targetSession = sessions.find(s => s.id === sessionToClear);
              if (targetSession && restoreInputsOnClear) {
                setInputAmount(targetSession.inputAmount);
                const token = stellarAssets.find(a => a.symbol === targetSession.inputTokenSymbol);
                if (token) setInputToken(token);
                const chain = evmChains.find(c => c.chainId === targetSession.destinationChainId);
                if (chain) setDestinationChain(chain);
                setFeePaymentMethod(targetSession.feePaymentMethod);
              }
              dismissSession(sessionToClear);
              setSessionToClear(null);
              setRestoreInputsOnClear(false);
            }
          }}
          onCancel={() => {
            setSessionToClear(null);
            setRestoreInputsOnClear(false);
          }}
        />
      </div>
      {(() => {
        if (!successModalSessionId) return null;
        const doneSession = sessions.find(s => s.id === successModalSessionId);
        if (!doneSession) return null;
        const txHash = doneSession.depositTx?.hash || doneSession.bridgeTx?.hash || '';
        const doneChain = evmChains.find(c => c.chainId === doneSession.destinationChainId);
        const explorerUrl = doneSession.depositTx?.hash && doneChain
          ? getExplorerUrl(doneSession.destinationChainId, 'tx', doneSession.depositTx.hash)
          : txHash
            ? `https://core.allbridge.io/explorer?search=${txHash}`
            : '';
        return (
          <EvmTransactionSuccessModal
            txHash={txHash}
            explorerUrl={explorerUrl || ''}
            title="Bridge Complete"
            subtitle="Your funds have been deposited"
            networkName="dYdX"
            onDone={() => {
              setSuccessModalSessionId(null);
              dismissSession(successModalSessionId);
              setActiveSessionId(null);
            }}
          />
        );
      })()}
    </StellarActiveGuard>
  );
};

export default StellarDydxOrchestrator;