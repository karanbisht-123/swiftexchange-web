
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
  XCircle,
} from 'lucide-react';
import React from 'react';

import type {
  AssetRelease,
  OverallState,
  TransferState,
  TransferStep,
} from '../hooks/useTransactionTracker';

function shortChain(chainId: string): string {
  const map: Record<string, string> = {
    '1': 'Ethereum',
    '137': 'Polygon',
    '42161': 'Arbitrum',
    '10': 'Optimism',
    '8453': 'Base',
    '56': 'BNB',
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
    go_fast_transfer: '⚡ Go Fast',
    axelar_transfer: 'Axelar Bridge',
    hyperlane_transfer: 'Hyperlane Bridge',
    evm_swap: 'EVM Swap',
    swap: 'Swap',
    unknown: 'Hop',
  };
  return map[type] ?? type.replace(/_/g, ' ');
}

const OVERALL_PILL: Record<OverallState, { label: string; className: string; icon: React.ReactNode }> = {
  STATE_UNKNOWN: {
    label: 'Initialising',
    className: 'bg-white/5 text-muted border-white/10',
    icon: <Clock className="w-3.5 h-3.5" />,
  },
  STATE_SUBMITTED: {
    label: 'Submitted',
    className: 'bg-brand/10 text-brand border-brand/30',
    icon: <Loader2 className="w-3.5 h-3.5 animate-spin" />,
  },
  STATE_PENDING: {
    label: 'Processing',
    className: 'bg-brand/15 text-brand border-brand/40 shadow-[0_0_15px_rgba(var(--brand-rgb),0.2)]',
    icon: <Loader2 className="w-3.5 h-3.5 animate-spin" />,
  },
  STATE_COMPLETED_SUCCESS: {
    label: 'Success',
    className: 'bg-success/10 text-success border-success/30 shadow-[0_0_15px_rgba(var(--success-rgb),0.15)]',
    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
  },
  STATE_COMPLETED_ERROR: {
    label: 'Failed',
    className: 'bg-danger/10 text-danger border-danger/30',
    icon: <XCircle className="w-3.5 h-3.5" />,
  },
  STATE_ABANDONED: {
    label: 'Abandoned',
    className: 'bg-white/5 text-muted border-white/10',
    icon: <XCircle className="w-3.5 h-3.5" />,
  },
};

const TRANSFER_PILL: Record<TransferState, { label: string; className: string; icon: React.ReactNode }> = {
  TRANSFER_UNKNOWN: {
    label: 'Waiting',
    className: 'text-muted bg-white/5 border-white/10',
    icon: <Clock className="w-3 h-3" />,
  },
  TRANSFER_PENDING: {
    label: 'Pending',
    className: 'text-brand bg-brand/10 border-brand/20',
    icon: <Loader2 className="w-3 h-3 animate-spin" />,
  },
  TRANSFER_RECEIVED: {
    label: 'Finalizing',
    className: 'text-brand bg-brand/15 border-brand/30',
    icon: <Loader2 className="w-3 h-3 animate-spin" />,
  },
  TRANSFER_SUCCESS: {
    label: 'Completed',
    className: 'text-success bg-success/10 border-success/20',
    icon: <CheckCircle2 className="w-3 h-3" />,
  },
  TRANSFER_FAILURE: {
    label: 'Failed',
    className: 'text-danger bg-danger/10 border-danger/20',
    icon: <XCircle className="w-3 h-3" />,
  },
};

const StepRow: React.FC<{
  step: TransferStep;
  isActive: boolean;
  isLast: boolean;
  index: number;
}> = ({ step, isActive, isLast, index }) => {
  const explorerLink = step.packet_txs?.send_tx?.explorer_link ?? null;
  const isDone = step.state === 'TRANSFER_SUCCESS' || step.state === 'TRANSFER_RECEIVED';

  return (
    <div 
      className="relative flex gap-5 group transition-all duration-500 animate-in fade-in slide-in-from-bottom-2"
      style={{ animationDelay: `${index * 150}ms`, animationFillMode: 'both' }}
    >
      {!isLast && (
        <div className={`absolute left-[13px] top-8 bottom-[-20px] w-[2px] transition-all duration-1000 ${isDone ? 'bg-brand shadow-[0_0_8px_rgba(var(--brand-rgb),0.5)]' : 'bg-white/10'}`} />
      )}

      <div className="flex-shrink-0 mt-0.5 relative z-10">
        <div
          className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all duration-700 ${
            isActive
              ? 'border-brand bg-brand/20 shadow-[0_0_15px_rgba(var(--brand-rgb),0.5)] scale-110'
              : isDone
              ? 'border-brand bg-brand shadow-[0_0_10px_rgba(var(--brand-rgb),0.3)]'
              : step.state === 'TRANSFER_FAILURE'
              ? 'border-danger bg-danger/20'
              : 'border-white/10 bg-tertiary opacity-40'
          }`}
        >
          {isActive ? (
            <div className="w-2 h-2 rounded-full bg-brand animate-ping" />
          ) : isDone ? (
            <CheckCircle2 className="w-4 h-4 text-white" />
          ) : step.state === 'TRANSFER_FAILURE' ? (
            <XCircle className="w-4 h-4 text-danger" />
          ) : (
            <div className="w-1.5 h-1.5 rounded-full bg-white/20" />
          )}
        </div>
      </div>

      <div className={`flex-1 pb-10 min-w-0 transition-opacity duration-500 ${!isActive && !isDone ? 'opacity-50' : 'opacity-100'}`}>
        <div className="flex items-center justify-between mb-1.5">
          <h4 className={`text-sm font-bold tracking-tight transition-colors duration-500 ${isActive ? 'text-primary scale-105 origin-left' : 'text-primary/90'}`}>
            {typeLabel(step.type)}
          </h4>
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[10px] font-black uppercase tracking-widest ${
            (TRANSFER_PILL[step.state] ?? TRANSFER_PILL.TRANSFER_UNKNOWN).className
          }`}>
            {(TRANSFER_PILL[step.state] ?? TRANSFER_PILL.TRANSFER_UNKNOWN).icon}
            {(TRANSFER_PILL[step.state] ?? TRANSFER_PILL.TRANSFER_UNKNOWN).label}
          </span>
        </div>

        <div className="flex items-center gap-2.5 text-[11px] font-semibold text-muted mb-3">
          <span className="text-secondary">{shortChain(step.from_chain_id)}</span>
          <ArrowRight className="w-3 h-3 opacity-30" />
          <span className="text-secondary">{shortChain(step.to_chain_id)}</span>
          {step.asset_denom && (
            <span className="px-2 py-0.5 rounded bg-white/5 border border-white/5 text-[9px] text-muted-foreground uppercase">
              {shortDenom(step.asset_denom)}
            </span>
          )}
        </div>

        {explorerLink && (
          <a
            href={explorerLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-[11px] font-bold text-brand hover:brightness-125 transition-all group/link"
          >
            <span className="border-b border-brand/0 group-hover/link:border-brand/50 transition-all">Track Transaction</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        )}

        {step.packet_txs?.error && (
          <div className="mt-3 p-3 rounded-xl bg-danger/5 border border-danger/10">
            <p className="text-[10px] font-semibold text-danger/80 leading-relaxed">{step.packet_txs.error}</p>
          </div>
        )}
      </div>
    </div>
  );
};

const SuccessVictoryView: React.FC<{ assetRelease: AssetRelease | null }> = ({ assetRelease }) => (
  <div className="flex flex-col items-center justify-center py-8 px-4 animate-in fade-in zoom-in-95 duration-700">
    <div className="relative mb-6">
      <div className="absolute inset-0 bg-success/20 blur-3xl animate-pulse rounded-full" />
      <div className="relative w-20 h-20 rounded-full bg-success/20 border-2 border-success/40 flex items-center justify-center shadow-[0_0_30px_rgba(var(--success-rgb),0.3)]">
        <CheckCircle2 className="w-10 h-10 text-success" />
      </div>
    </div>
    <h2 className="text-2xl font-black text-primary mb-2 text-center tracking-tight">Transfer Complete!</h2>
    <p className="text-sm text-muted mb-8 text-center max-w-[260px] leading-relaxed">
      Your funds have been successfully released and are now available in your wallet.
    </p>
    
    {assetRelease && (
      <div className="w-full p-5 rounded-2xl bg-success/5 border-2 border-success/20 flex flex-col items-center gap-2 shadow-[inset_0_0_20px_rgba(var(--success-rgb),0.05)]">
        <span className="text-[10px] font-bold uppercase tracking-widest text-success/60">Released Asset</span>
        <div className="text-lg font-black text-primary flex items-center gap-2">
           {shortDenom(assetRelease.denom)}
           <span className="text-muted-foreground font-medium text-sm">on</span>
           {shortChain(assetRelease.chain_id)}
        </div>
      </div>
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
  const shortHash = txHash ? `${txHash.slice(0, 10)}...${txHash.slice(-6)}` : '';
  const isSuccess = overallState === 'STATE_COMPLETED_SUCCESS';
  const pill = OVERALL_PILL[overallState] || OVERALL_PILL.STATE_UNKNOWN;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-1000">
      <style>{`
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .animate-shimmer {
          background: linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.03) 50%, rgba(255,255,255,0) 100%);
          background-size: 200% 100%;
          animation: shimmer 2.5s infinite linear;
        }
      `}</style>

      {isSuccess ? (
        <SuccessVictoryView assetRelease={assetRelease} />
      ) : (
        <>
          <div className="flex items-center justify-between p-4 rounded-2xl bg-tertiary border border-color relative overflow-hidden group">
            <div className="absolute inset-0 animate-shimmer opacity-50" />
            <div className="relative z-10 flex flex-col gap-0.5">
              <span className="text-[10px] font-black uppercase tracking-[0.15em] text-muted/60">Transaction</span>
              <span className="text-sm font-bold text-primary font-mono tracking-tight">{shortHash || 'Preparing...'}</span>
            </div>
            <div className="relative z-10">
              <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-[11px] font-black uppercase tracking-wider transition-all duration-700 shadow-sm ${
                pill.className
              }`}>
                {pill.icon}
                {pill.label}
              </span>
            </div>
          </div>

          {isLoading && steps.length === 0 && (
            <div className="relative flex gap-5 animate-in fade-in slide-in-from-bottom-2 px-1">
              <div className="absolute left-[13px] top-8 bottom-[-10px] w-[2px] bg-white/5" />
              <div className="flex-shrink-0 mt-0.5 relative z-10">
                <div className="w-7 h-7 rounded-full border-2 border-brand bg-brand/20 shadow-[0_0_15px_rgba(var(--brand-rgb),0.5)] flex items-center justify-center scale-110">
                   <div className="w-2 h-2 rounded-full bg-brand animate-ping" />
                </div>
              </div>
              <div className="flex-1 pb-10">
                <h4 className="text-sm font-bold tracking-tight text-primary">Preparing Bridge</h4>
                <div className="flex items-center gap-2.5 text-[11px] font-semibold text-muted mt-1.5 flex-wrap">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border border-brand/30 bg-brand/10 text-brand text-[10px] font-black uppercase tracking-widest">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Checking Network
                  </span>
                  <span className="text-muted/60 lowercase font-medium italic">Matching transaction state…</span>
                </div>
              </div>
            </div>
          )}

          {steps.length > 0 && (
            <div className="px-1.5 pt-2">
              {steps.map((step, i) => (
                <StepRow
                  key={`${step.from_chain_id}-${step.to_chain_id}-${i}`}
                  step={step}
                  isActive={activeStepIndex === step.index}
                  isLast={i === steps.length - 1}
                  index={i}
                />
              ))}
            </div>
          )}

          {assetRelease && !isSuccess && (
            <div
              className={`rounded-2xl border-2 px-5 py-5 flex items-center gap-5 transition-all duration-700 ${
                assetRelease.released
                  ? 'bg-success/5 border-success/30 shadow-[0_0_25px_rgba(var(--success-rgb),0.1)]'
                  : 'bg-white/[0.02] border-white/5 opacity-60'
              }`}
            >
              <div className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all duration-700 ${
                assetRelease.released ? 'bg-success/20 rotate-0' : 'bg-white/5 -rotate-6'
              }`}>
                {assetRelease.released ? <CheckCircle2 className="w-6 h-6 text-success" /> : <Clock className="w-5 h-5 text-muted/40" />}
              </div>
              <div className="flex-1">
                <div className="text-[10px] font-bold uppercase tracking-widest text-primary/40 mb-1">Final Settlement</div>
                <div className="text-[14px] font-black text-primary tracking-tight">
                  {assetRelease.released ? 'Funds Successfully Released' : 'Awaiting Final Release'}
                </div>
                <div className="text-[10px] font-bold text-secondary mt-1 tracking-tight opacity-60">
                  {shortDenom(assetRelease.denom)} on {shortChain(assetRelease.chain_id)}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {errorMessage && (
        <div className="flex items-start gap-4 p-4 bg-danger/10 border border-danger/20 rounded-2xl animate-in fade-in slide-in-from-top-3">
          <div className="w-8 h-8 rounded-full bg-danger/20 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-5 h-5 text-danger" />
          </div>
          <div className="flex-1 min-w-0">
            <h5 className="text-xs font-black text-danger uppercase tracking-wider mb-1">Bridge Error</h5>
            <p className="text-[11px] font-bold text-danger/80 leading-relaxed break-words">{errorMessage}</p>
          </div>
        </div>
      )}
    </div>
  );
};
