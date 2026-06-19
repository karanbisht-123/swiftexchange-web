import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
  Sparkles,
  XCircle,
  Zap,
} from 'lucide-react';
import React from 'react';

import type {
  AssetRelease,
  OverallState,
  TransferState,
  TransferStep,
} from '../hooks/useTransactionTracker';
import { getChainName } from '../../evm/utils/Chainregistry';

//Helpers
function shortChain(chainId: string): string {
  const numId = parseInt(chainId, 10);
  if (!isNaN(numId)) {
    const name = getChainName(numId);
    if (name && name !== 'Unknown') return name;
  }
  const map: Record<string, string> = {
    'noble-1': 'Noble',
    'dydx-mainnet-1': 'dYdX',
    'osmosis-1': 'Osmosis',
  };
  return map[chainId] ?? chainId;
}

function shortDenom(denom: string): string {
  if (!denom) return '';
  if (denom.startsWith('0x')) return `${denom.slice(0, 6)}…${denom.slice(-4)}`;
  if (denom.startsWith('ibc/')) return 'USDC';
  if (denom === 'uusdc') return 'USDC';
  if (denom === 'ethereum-native') return 'ETH';
  return denom.length > 12 ? denom.slice(0, 10) + '…' : denom;
}

function typeLabel(type: string): string {
  const map: Record<string, string> = {
    ibc_transfer: 'IBC Transfer',
    cctp_transfer: 'CCTP Bridge',
    go_fast_transfer: 'Go Fast',
    axelar_transfer: 'Axelar Bridge',
    hyperlane_transfer: 'Hyperlane',
    evm_swap: 'EVM Swap',
    swap: 'Swap',
    unknown: 'Transfer',
  };
  return map[type] ?? type.replace(/_/g, ' ');
}

function typeIcon(type: string): React.ReactNode {
  if (type === 'go_fast_transfer') return <Zap className="w-3 h-3" />;
  return null;
}

// Status configs 
const OVERALL_CONFIG: Record<
  OverallState,
  { label: string; color: string; bg: string; border: string; icon: React.ReactNode }
> = {
  STATE_UNKNOWN: {
    label: 'Initialising',
    color: 'text-slate-400',
    bg: 'bg-slate-400/8',
    border: 'border-slate-400/15',
    icon: <Clock className="w-3.5 h-3.5" />,
  },
  STATE_SUBMITTED: {
    label: 'Submitted',
    color: 'text-violet-400',
    bg: 'bg-violet-400/10',
    border: 'border-violet-400/25',
    icon: <Loader2 className="w-3.5 h-3.5 animate-spin" />,
  },
  STATE_PENDING: {
    label: 'In Transit',
    color: 'text-brand',
    bg: 'bg-brand/10',
    border: 'border-brand/30',
    icon: <Loader2 className="w-3.5 h-3.5 animate-spin" />,
  },
  STATE_COMPLETED_SUCCESS: {
    label: 'Complete',
    color: 'text-emerald-400',
    bg: 'bg-emerald-400/10',
    border: 'border-emerald-400/25',
    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
  },
  STATE_COMPLETED_ERROR: {
    label: 'Failed',
    color: 'text-rose-400',
    bg: 'bg-rose-400/10',
    border: 'border-rose-400/25',
    icon: <XCircle className="w-3.5 h-3.5" />,
  },
  STATE_ABANDONED: {
    label: 'Abandoned',
    color: 'text-slate-400',
    bg: 'bg-slate-400/8',
    border: 'border-slate-400/15',
    icon: <XCircle className="w-3.5 h-3.5" />,
  },
};

const STEP_CONFIG: Record<
  TransferState,
  { label: string; color: string; dotColor: string; ring: string; icon: React.ReactNode }
> = {
  TRANSFER_UNKNOWN: {
    label: 'Queued',
    color: 'text-slate-500',
    dotColor: 'bg-slate-600',
    ring: 'ring-slate-600/30',
    icon: <Clock className="w-3 h-3" />,
  },
  TRANSFER_PENDING: {
    label: 'Pending',
    color: 'text-amber-400',
    dotColor: 'bg-amber-400',
    ring: 'ring-amber-400/30',
    icon: <Loader2 className="w-3 h-3 animate-spin" />,
  },
  TRANSFER_RECEIVED: {
    label: 'Finalising',
    color: 'text-violet-400',
    dotColor: 'bg-violet-400',
    ring: 'ring-violet-400/30',
    icon: <Loader2 className="w-3 h-3 animate-spin" />,
  },
  TRANSFER_SUCCESS: {
    label: 'Done',
    color: 'text-emerald-400',
    dotColor: 'bg-emerald-400',
    ring: 'ring-emerald-400/20',
    icon: <CheckCircle2 className="w-3 h-3" />,
  },
  TRANSFER_FAILURE: {
    label: 'Failed',
    color: 'text-rose-400',
    dotColor: 'bg-rose-500',
    ring: 'ring-rose-500/30',
    icon: <XCircle className="w-3 h-3" />,
  },
};

// CSS injection

const TRACKER_STYLES = `
@keyframes tt-shimmer {
  0%   { transform: translateX(-100%); }
  100% { transform: translateX(300%); }
}
@keyframes tt-pulse-ring {
  0%   { transform: scale(1); opacity: 0.7; }
  100% { transform: scale(2.2); opacity: 0; }
}
@keyframes tt-slide-in {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes tt-fade-up {
  from { opacity: 0; transform: translateY(12px) scale(0.97); }
  to   { opacity: 1; transform: translateY(0)   scale(1);    }
}
@keyframes tt-glow-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(var(--brand-rgb), 0.4); }
  50%       { box-shadow: 0 0 0 6px rgba(var(--brand-rgb), 0); }
}
.tt-shimmer-bar::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.06) 50%, transparent 100%);
  animation: tt-shimmer 2.2s ease-in-out infinite;
}
.tt-slide-in  { animation: tt-slide-in  0.4s ease both; }
.tt-fade-up   { animation: tt-fade-up   0.5s ease both; }
.tt-pulse-ring::before {
  content: '';
  position: absolute;
  inset: -4px;
  border-radius: 50%;
  border: 2px solid currentColor;
  animation: tt-pulse-ring 1.6s ease-out infinite;
}
.tt-glow-pulse { animation: tt-glow-pulse 2s ease-in-out infinite; }
`;

// Step row 

const StepRow: React.FC<{
  step: TransferStep;
  isActive: boolean;
  isLast: boolean;
  index: number;
}> = ({ step, isActive, isLast, index }) => {
  const cfg = STEP_CONFIG[step.state] ?? STEP_CONFIG.TRANSFER_UNKNOWN;
  const isDone = step.state === 'TRANSFER_SUCCESS';
  const isFailed = step.state === 'TRANSFER_FAILURE';
  const isMoving = step.state === 'TRANSFER_PENDING' || step.state === 'TRANSFER_RECEIVED';
  const explorerLink = step.packet_txs?.send_tx?.explorer_link ?? null;
  const fastIcon = typeIcon(step.type);

  const nodeColor = isActive
    ? 'border-brand bg-brand/15 tt-glow-pulse'
    : isDone
      ? 'border-emerald-400 bg-emerald-400/15'
      : isFailed
        ? 'border-rose-500 bg-rose-500/15'
        : isMoving
          ? 'border-amber-400/70 bg-amber-400/10'
          : 'border-white/10 bg-white/[0.03]';

  const lineColor = isDone
    ? 'bg-gradient-to-b from-emerald-400 to-emerald-400/30'
    : isActive || isMoving
      ? 'bg-gradient-to-b from-brand to-brand/20'
      : 'bg-white/[0.06]';

  return (
    <div
      className="tt-slide-in relative flex gap-4 group"
      style={{ animationDelay: `${index * 120}ms` }}
    >
      {/* Connector line */}
      {!isLast && (
        <div
          className={`absolute left-[13px] top-8 bottom-[-16px] w-[2px] transition-all duration-700 ${lineColor}`}
        />
      )}

      {/* Node */}
      <div className="flex-shrink-0 z-10 mt-0.5">
        <div
          className={`relative w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all duration-500 ${nodeColor}`}
        >
          {(isActive || isMoving) && (
            <span className="tt-pulse-ring absolute inset-0 rounded-full text-brand" />
          )}
          {isDone ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          ) : isFailed ? (
            <XCircle className="w-3.5 h-3.5 text-rose-400" />
          ) : isActive || isMoving ? (
            <div className="w-2 h-2 rounded-full bg-brand animate-ping" />
          ) : (
            <div className="w-1.5 h-1.5 rounded-full bg-white/20" />
          )}
        </div>
      </div>

      {/* Content */}
      <div
        className={`flex-1 pb-8 min-w-0 transition-all duration-500 ${!isActive && !isDone && !isMoving ? 'opacity-35' : 'opacity-100'
          }`}
      >
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1.5">
            {fastIcon && (
              <span className={`${cfg.color} opacity-80`}>{fastIcon}</span>
            )}
            <h4
              className={`text-[13px] font-bold tracking-tight transition-colors duration-300 ${isActive ? 'text-white' : isDone ? 'text-white/80' : 'text-white/60'
                }`}
            >
              {typeLabel(step.type)}
            </h4>
          </div>

          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border ${cfg.color} ${cfg.ring ? `ring-1 ${cfg.ring}` : ''}`}
            style={{ backgroundColor: 'transparent', borderColor: 'currentColor', opacity: 0.85 }}
          >
            {cfg.icon}
            {cfg.label}
          </span>
        </div>

        {/* Chain route */}
        <div className="flex items-center gap-2 text-[11px] font-medium text-white/40 mb-2">
          <span className="text-white/55">{shortChain(step.from_chain_id)}</span>
          <ArrowRight className="w-2.5 h-2.5 opacity-30" />
          <span className="text-white/55">{shortChain(step.to_chain_id)}</span>
          {step.asset_denom && (
            <span className="px-1.5 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.06] text-[9px] uppercase tracking-wide text-white/35">
              {shortDenom(step.asset_denom)}
            </span>
          )}
        </div>

        {/* Explorer link */}
        {explorerLink && (
          <a
            href={explorerLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-brand/70 hover:text-brand transition-colors group/link"
          >
            <span className="border-b border-transparent group-hover/link:border-brand/40 transition-colors">
              View on explorer
            </span>
            <ExternalLink className="w-2.5 h-2.5" />
          </a>
        )}

        {/* Step error */}
        {step.packet_txs?.error && (
          <div className="mt-2 px-3 py-2 rounded-xl bg-rose-500/8 border border-rose-500/15">
            <p className="text-[10px] font-medium text-rose-400/80 leading-relaxed break-words">
              {step.packet_txs.error}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};


const SuccessView: React.FC<{ assetRelease: AssetRelease | null }> = ({ assetRelease }) => (
  <div className="tt-fade-up flex flex-col items-center justify-center py-6 px-2">
    {/* Glowing check */}
    <div className="relative mb-5">
      <div className="absolute inset-0 bg-emerald-400/20 blur-2xl rounded-full scale-150 animate-pulse" />
      <div className="relative w-16 h-16 rounded-full bg-emerald-400/15 border border-emerald-400/30 flex items-center justify-center shadow-[0_0_40px_rgba(52,211,153,0.25)]">
        <CheckCircle2 className="w-8 h-8 text-emerald-400" />
      </div>
    </div>

    <div className="flex items-center gap-2 mb-1.5">
      <Sparkles className="w-3.5 h-3.5 text-emerald-400/70" />
      <h2 className="text-xl font-black text-white tracking-tight">Transfer Complete</h2>
      <Sparkles className="w-3.5 h-3.5 text-emerald-400/70" />
    </div>
    <p className="text-[12px] text-white/40 text-center max-w-[220px] leading-relaxed mb-6">
      Your funds have been successfully delivered and are ready to use.
    </p>

    {assetRelease && (
      <div className="w-full px-4 py-3.5 rounded-2xl bg-emerald-400/6 border border-emerald-400/20 flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl bg-emerald-400/15 flex items-center justify-center flex-shrink-0">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
        </div>
        <div>
          <div className="text-[9px] font-bold uppercase tracking-widest text-emerald-400/50 mb-0.5">
            Released
          </div>
          <div className="text-[13px] font-bold text-white/85">
            {shortDenom(assetRelease.denom)}{' '}
            <span className="text-white/35 font-medium text-xs">on</span>{' '}
            {shortChain(assetRelease.chain_id)}
          </div>
        </div>
      </div>
    )}
  </div>
);

const SkeletonStep: React.FC = () => (
  <div className="relative flex gap-4">
    <div className="absolute left-[13px] top-8 bottom-[-16px] w-[2px] bg-white/[0.04]" />
    <div className="flex-shrink-0 z-10 mt-0.5">
      <div className="w-7 h-7 rounded-full border-2 border-brand/40 bg-brand/10 flex items-center justify-center tt-glow-pulse">
        <div className="w-2 h-2 rounded-full bg-brand animate-ping" />
      </div>
    </div>
    <div className="flex-1 pb-8 space-y-2">
      <div className="flex items-center justify-between">
        <div className="h-3.5 w-28 rounded-md bg-white/[0.06] animate-pulse" />
        <div className="h-4 w-16 rounded-full bg-white/[0.04] animate-pulse" />
      </div>
      <div className="flex items-center gap-2">
        <div className="h-2.5 w-14 rounded bg-white/[0.04] animate-pulse" />
        <div className="h-2 w-2 rounded bg-white/[0.03] animate-pulse" />
        <div className="h-2.5 w-14 rounded bg-white/[0.04] animate-pulse" />
      </div>
      <div className="h-2.5 w-36 rounded bg-brand/10 animate-pulse" />
    </div>
  </div>
);

const SettlementCard: React.FC<{ assetRelease: AssetRelease }> = ({ assetRelease }) => (
  <div
    className={`tt-slide-in rounded-2xl border px-4 py-4 flex items-center gap-4 transition-all duration-700 ${assetRelease.released
      ? 'bg-emerald-400/5 border-emerald-400/25 shadow-[0_0_30px_rgba(52,211,153,0.08)]'
      : 'bg-white/[0.02] border-white/[0.05] opacity-50'
      }`}
  >
    <div
      className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-500 ${assetRelease.released ? 'bg-emerald-400/15' : 'bg-white/[0.04]'
        }`}
    >
      {assetRelease.released ? (
        <CheckCircle2 className="w-5 h-5 text-emerald-400" />
      ) : (
        <Clock className="w-4.5 h-4.5 text-white/25" />
      )}
    </div>
    <div className="flex-1 min-w-0">
      <div className="text-[9px] font-bold uppercase tracking-widest text-white/30 mb-0.5">
        Final Settlement
      </div>
      <div className="text-[13px] font-bold text-white/80 tracking-tight">
        {assetRelease.released ? 'Funds Released' : 'Awaiting Release'}
      </div>
      <div className="text-[10px] text-white/35 mt-0.5">
        {shortDenom(assetRelease.denom)} · {shortChain(assetRelease.chain_id)}
      </div>
    </div>
    {assetRelease.released && (
      <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
    )}
  </div>
);

export interface TransactionTrackerProps {
  txHash: string;
  chainId?: string;
  overallState: OverallState;
  steps: TransferStep[];
  activeStepIndex: number | null;
  assetRelease: AssetRelease | null;
  isLoading: boolean;
  isError: boolean;
  errorMessage: string | null;
}

export const TransactionTracker: React.FC<TransactionTrackerProps> = ({
  txHash,
  overallState,
  steps,
  activeStepIndex,
  assetRelease,
  isLoading,
  errorMessage,
}) => {
  const shortHash = txHash ? `${txHash.slice(0, 8)}…${txHash.slice(-6)}` : '';
  const isSuccess = overallState === 'STATE_COMPLETED_SUCCESS';
  const cfg = OVERALL_CONFIG[overallState] ?? OVERALL_CONFIG.STATE_UNKNOWN;

  return (
    <div className="tt-fade-up space-y-4 font-sans">
      <style>{TRACKER_STYLES}</style>
      <div className="tt-shimmer-bar relative overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3.5 flex items-center justify-between">
        <div className="absolute inset-0 bg-gradient-to-r from-brand/[0.04] via-transparent to-transparent pointer-events-none" />

        <div className="relative z-10 min-w-0">
          <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-white/30 mb-0.5">
            Transaction
          </div>
          <div className="text-[13px] font-bold text-white/80 font-mono tracking-tight truncate">
            {shortHash || 'Preparing…'}
          </div>
        </div>

        <div className="relative z-10 flex-shrink-0 ml-3">
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-[10px] font-black uppercase tracking-wider transition-all duration-500 ${cfg.color} ${cfg.bg} ${cfg.border}`}
          >
            {cfg.icon}
            {cfg.label}
          </span>
        </div>
      </div>
      {isSuccess ? (
        <SuccessView assetRelease={assetRelease} />
      ) : (
        <>
          <div className="px-1 pt-1">
            {isLoading && steps.length === 0 ? (
              <>
                <SkeletonStep />
                <div className="relative flex gap-4 opacity-40">
                  <div className="flex-shrink-0 z-10 mt-0.5">
                    <div className="w-7 h-7 rounded-full border-2 border-white/10 bg-white/[0.03]" />
                  </div>
                  <div className="flex-1 pb-6">
                    <div className="h-3 w-24 rounded-md bg-white/[0.04] animate-pulse" />
                  </div>
                </div>
              </>
            ) : (
              steps.map((step, i) => (
                <StepRow
                  key={`${step.from_chain_id}-${step.to_chain_id}-${i}`}
                  step={step}
                  isActive={activeStepIndex === step.index}
                  isLast={i === steps.length - 1}
                  index={i}
                />
              ))
            )}
          </div>
          {assetRelease && (
            <SettlementCard assetRelease={assetRelease} />
          )}
        </>
      )}

      {errorMessage && (
        <div className="tt-slide-in flex items-start gap-3 px-4 py-3.5 bg-rose-500/8 border border-rose-500/20 rounded-2xl">
          <div className="w-7 h-7 rounded-xl bg-rose-500/15 flex items-center justify-center flex-shrink-0 mt-0.5">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[9px] font-black uppercase tracking-widest text-rose-400/70 mb-1">
              Bridge Error
            </div>
            <p className="text-[11px] font-medium text-rose-400/80 leading-relaxed break-words">
              {errorMessage}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
