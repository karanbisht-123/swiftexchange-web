
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
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
  if (denom.startsWith('ibc/')) return 'USDC (IBC)';

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
    label: 'Unknown',
    className: 'bg-hover text-muted border-color',
    icon: <Clock className="w-3.5 h-3.5" />,
  },
  STATE_SUBMITTED: {
    label: 'Submitted',
    className: 'bg-brand/10 text-brand border-brand/30',
    icon: <Loader2 className="w-3.5 h-3.5 animate-spin" />,
  },
  STATE_PENDING: {
    label: 'In Progress',
    className: 'bg-brand/10 text-brand border-brand/30',
    icon: <Loader2 className="w-3.5 h-3.5 animate-spin" />,
  },
  STATE_COMPLETED_SUCCESS: {
    label: 'Completed',
    className: 'bg-success-bg text-success border-success/30',
    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
  },
  STATE_COMPLETED_ERROR: {
    label: 'Failed',
    className: 'bg-danger-bg text-danger border-danger/30',
    icon: <XCircle className="w-3.5 h-3.5" />,
  },
  STATE_ABANDONED: {
    label: 'Abandoned',
    className: 'bg-danger-bg text-danger border-danger/30',
    icon: <XCircle className="w-3.5 h-3.5" />,
  },
};

const TRANSFER_PILL: Record<TransferState, { label: string; className: string; icon: React.ReactNode }> = {
  TRANSFER_UNKNOWN: {
    label: 'Waiting',
    className: 'text-muted bg-hover border-color',
    icon: <Clock className="w-3 h-3" />,
  },
  TRANSFER_PENDING: {
    label: 'Pending',
    className: 'text-brand bg-brand/10 border-brand/30',
    icon: <Loader2 className="w-3 h-3 animate-spin" />,
  },
  TRANSFER_RECEIVED: {
    label: 'Received',
    className: 'text-brand bg-brand/15 border-brand/40',
    icon: <Loader2 className="w-3 h-3 animate-spin" />,
  },
  TRANSFER_SUCCESS: {
    label: 'Success',
    className: 'text-success bg-success-bg border-success/30',
    icon: <CheckCircle2 className="w-3 h-3" />,
  },
  TRANSFER_FAILURE: {
    label: 'Failed',
    className: 'text-danger bg-danger-bg border-danger/30',
    icon: <XCircle className="w-3 h-3" />,
  },
};


const OverallStatePill: React.FC<{ state: OverallState }> = ({ state }) => {
  const pill = OVERALL_PILL[state] ?? OVERALL_PILL.STATE_UNKNOWN;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-semibold ${pill.className}`}
    >
      {pill.icon}
      {pill.label}
    </span>
  );
};

const TransferPill: React.FC<{ state: TransferState }> = ({ state }) => {
  const pill = TRANSFER_PILL[state] ?? TRANSFER_PILL.TRANSFER_UNKNOWN;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-semibold ${pill.className}`}
    >
      {pill.icon}
      {pill.label}
    </span>
  );
};

const StepRow: React.FC<{
  step: TransferStep;
  isActive: boolean;
  isLast: boolean;
}> = ({ step, isActive, isLast }) => {
  const explorerLink = step.packet_txs?.send_tx?.explorer_link ?? null;
  const isGoFast = step.type.includes('go_fast');
  const isDone =
    step.state === 'TRANSFER_SUCCESS' ||
    step.state === 'TRANSFER_RECEIVED';

  return (
    <div className="relative flex gap-3">
      {!isLast && (
        <div className="absolute left-[15px] top-8 bottom-0 w-px bg-border-color opacity-40" />
      )}

      <div className="flex-shrink-0 mt-0.5">
        <div
          className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all ${isActive
            ? 'border-brand bg-brand/15 shadow-sm shadow-brand/30'
            : isDone
              ? 'border-success bg-success-bg'
              : step.state === 'TRANSFER_FAILURE'
                ? 'border-danger bg-danger-bg'
                : 'border-color bg-tertiary'
            }`}
        >
          {isActive ? (
            isGoFast ? (
              <Zap className="w-4 h-4 text-brand" />
            ) : (
              <Loader2 className="w-4 h-4 text-brand animate-spin" />
            )
          ) : isDone ? (
            <CheckCircle2 className="w-4 h-4 text-success" />
          ) : step.state === 'TRANSFER_FAILURE' ? (
            <XCircle className="w-4 h-4 text-danger" />
          ) : isGoFast ? (
            <Zap className="w-4 h-4 text-muted" />
          ) : (
            <ArrowRight className="w-4 h-4 text-muted" />
          )}
        </div>
      </div>

      <div className={`flex-1 pb-5 min-w-0 ${isActive ? 'opacity-100' : 'opacity-75'}`}>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span
            className={`text-sm font-semibold ${isActive ? 'text-primary' : isDone ? 'text-primary' : 'text-muted'
              }`}
          >
            {typeLabel(step.type)}
          </span>
          <TransferPill state={step.state} />
        </div>

        <div className="flex items-center gap-1 mt-0.5 flex-wrap">
          <span className="text-xs text-muted">{shortChain(step.from_chain_id)}</span>
          <ArrowRight className="w-3 h-3 text-muted flex-shrink-0" />
          <span className="text-xs text-muted">{shortChain(step.to_chain_id)}</span>
          {step.asset_denom && (
            <>
              <span className="text-xs text-muted">·</span>
              <span className="text-xs text-muted">{shortDenom(step.asset_denom)}</span>
            </>
          )}
        </div>


        {explorerLink && (
          <a
            href={explorerLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 mt-1.5 text-xs text-brand hover:underline"
          >
            View tx <ExternalLink className="w-3 h-3" />
          </a>
        )}


        {step.packet_txs?.error && (
          <p className="mt-1 text-xs text-danger">{step.packet_txs.error}</p>
        )}
      </div>
    </div>
  );
};


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
  const shortHash = txHash ? `${txHash.slice(0, 10)}…${txHash.slice(-6)}` : '';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-sm font-semibold text-primary mb-0.5">Cross-chain Transfer</div>
          {shortHash && (
            <span className="font-mono text-xs text-muted">{shortHash}</span>
          )}
        </div>
        <OverallStatePill state={overallState} />
      </div>
      {isLoading && steps.length === 0 && (
        <div className="flex items-center gap-3 py-4 px-4 rounded-xl bg-brand/5 border border-brand/20">
          <Loader2 className="w-5 h-5 text-brand animate-spin flex-shrink-0" />
          <div>
            <div className="text-sm font-medium text-primary">Indexing transaction…</div>
            <div className="text-xs text-muted mt-0.5">
              Waiting for Skip to pick up your transaction
            </div>
          </div>
        </div>
      )}
      {steps.length > 0 && (
        <div className="pt-1">
          {steps.map((step, i) => (
            <StepRow
              key={step.index}
              step={step}
              isActive={activeStepIndex === step.index}
              isLast={i === steps.length - 1}
            />
          ))}
        </div>
      )}

      {assetRelease && (
        <div
          className={`rounded-xl border px-4 py-3 flex items-center gap-3 ${assetRelease.released
            ? 'bg-success-bg border-success/30'
            : 'bg-tertiary border-color'
            }`}
        >
          {assetRelease.released ? (
            <CheckCircle2 className="w-5 h-5 text-success flex-shrink-0" />
          ) : (
            <Clock className="w-5 h-5 text-muted flex-shrink-0" />
          )}
          <div>
            <div className="text-sm font-medium text-primary">
              {assetRelease.released ? 'Funds Released' : 'Awaiting Release'}
            </div>
            <div className="text-xs text-muted mt-0.5">
              {shortDenom(assetRelease.denom)} on {shortChain(assetRelease.chain_id)}
            </div>
          </div>
        </div>
      )}
      {errorMessage && (
        <div className="flex items-start gap-2 p-3 bg-danger-bg border border-danger/40 rounded-xl">
          <AlertTriangle className="w-4 h-4 text-danger flex-shrink-0 mt-0.5" />
          <p className="text-xs text-danger leading-relaxed">{errorMessage}</p>
        </div>
      )}
    </div>
  );
};
