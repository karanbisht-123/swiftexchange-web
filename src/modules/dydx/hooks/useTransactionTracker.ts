import { useCallback, useEffect, useRef, useState } from 'react';


export type OverallState =
  | 'STATE_UNKNOWN'
  | 'STATE_SUBMITTED'
  | 'STATE_PENDING'
  | 'STATE_COMPLETED_SUCCESS'
  | 'STATE_COMPLETED_ERROR'
  | 'STATE_ABANDONED';

export type TransferState =
  | 'TRANSFER_UNKNOWN'
  | 'TRANSFER_PENDING'
  | 'TRANSFER_RECEIVED'
  | 'TRANSFER_SUCCESS'
  | 'TRANSFER_FAILURE';

export interface PacketTx {
  chain_id: string;
  tx_hash: string;
  explorer_link: string;
}

export interface Packet {
  send_tx: PacketTx | null;
  receive_tx: PacketTx | null;
  acknowledge_tx: PacketTx | null;
  timeout_tx: PacketTx | null;
  error: string | null;
}

export interface TransferStep {
  index: number;
  state: TransferState;
  packet_txs: Packet | null;
  type: string;
  from_chain_id: string;
  to_chain_id: string;
  asset_denom: string;
}

export interface AssetRelease {
  chain_id: string;
  denom: string;
  released: boolean;
}

export interface TxTrackerResult {
  overallState: OverallState;
  steps: TransferStep[];
  activeStepIndex: number | null;
  assetRelease: AssetRelease | null;
  isLoading: boolean;
  isError: boolean;
  errorMessage: string | null;
  isTerminal: boolean;
}



const SKIP_STATUS_URL = 'https://api.skip.build/v2/tx/status';
const POLL_INTERVAL_MS = 5_000;
const TERMINAL_STATES: OverallState[] = [
  'STATE_COMPLETED_SUCCESS',
  'STATE_COMPLETED_ERROR',
  'STATE_ABANDONED',
];

export const LS_PENDING_TX_KEY = 'swiftex_pending_skip_tx';

export interface PendingTxInfo {
  txHash: string;
  chainId: string;
  startedAt: number;
}



export function savePendingTx(info: PendingTxInfo): void {
  try {
    localStorage.setItem(LS_PENDING_TX_KEY, JSON.stringify(info));
  } catch {
  }
}

export function loadPendingTx(): PendingTxInfo | null {
  try {
    const raw = localStorage.getItem(LS_PENDING_TX_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PendingTxInfo;
  } catch {
    return null;
  }
}

export function clearPendingTx(): void {
  try {
    localStorage.removeItem(LS_PENDING_TX_KEY);
  } catch {
  }
}


interface RawPacketTx {
  chain_id?: string;
  tx_hash?: string;
  explorer_link?: string;
}

interface RawPacket {
  send_tx?: RawPacketTx | null;
  receive_tx?: RawPacketTx | null;
  acknowledge_tx?: RawPacketTx | null;
  timeout_tx?: RawPacketTx | null;
  error?: string | null;
}

interface RawTransferStep {
  transfer_sequence_index?: number;
  state?: TransferState;
  packet_txs?: RawPacket | null;
  operation_type?: string;
  from_chain_id?: string;
  to_chain_id?: string;
  denom_in?: string;
}

interface RawStatusResponse {
  state?: OverallState;
  transfer_sequence?: RawTransferStep[];
  next_blocking_transfer?: { transfer_sequence_index: number } | null;
  transfer_asset_release?: { chain_id?: string; denom?: string; released?: boolean } | null;
  error?: { message?: string } | null;
}


function parsePacket(raw?: RawPacket | null): Packet | null {
  if (!raw) return null;
  const toTx = (t?: RawPacketTx | null): PacketTx | null =>
    t ? { chain_id: t.chain_id ?? '', tx_hash: t.tx_hash ?? '', explorer_link: t.explorer_link ?? '' } : null;
  return {
    send_tx: toTx(raw.send_tx),
    receive_tx: toTx(raw.receive_tx),
    acknowledge_tx: toTx(raw.acknowledge_tx),
    timeout_tx: toTx(raw.timeout_tx),
    error: raw.error ?? null,
  };
}

function parseSteps(raw: RawTransferStep[] = []): TransferStep[] {
  return raw.map((s, i) => ({
    index: s.transfer_sequence_index ?? i,
    state: s.state ?? 'TRANSFER_UNKNOWN',
    packet_txs: parsePacket(s.packet_txs),
    type: s.operation_type ?? 'unknown',
    from_chain_id: s.from_chain_id ?? '',
    to_chain_id: s.to_chain_id ?? '',
    asset_denom: s.denom_in ?? '',
  }));
}


const EMPTY_RESULT: TxTrackerResult = {
  overallState: 'STATE_UNKNOWN',
  steps: [],
  activeStepIndex: null,
  assetRelease: null,
  isLoading: false,
  isError: false,
  errorMessage: null,
  isTerminal: false,
};

export function useTransactionTracker(
  txHash: string | null,
  chainId: string | null
): TxTrackerResult {
  const [result, setResult] = useState<TxTrackerResult>(EMPTY_RESULT);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, []);

  const poll = useCallback(async () => {
    if (!txHash || !chainId) return;

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(SKIP_STATUS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tx_hash: txHash, chain_id: chainId }),
        signal: controller.signal,
      });

      if (!res.ok) {
        if (res.status === 404) return;
        throw new Error(`Skip status API returned ${res.status}`);
      }

      const data: RawStatusResponse = await res.json();
      const state: OverallState = data.state ?? 'STATE_UNKNOWN';
      const steps = parseSteps(data.transfer_sequence);
      const activeStepIndex = data.next_blocking_transfer?.transfer_sequence_index ?? null;
      const releaseRaw = data.transfer_asset_release;
      const assetRelease: AssetRelease | null = releaseRaw
        ? { chain_id: releaseRaw.chain_id ?? '', denom: releaseRaw.denom ?? '', released: releaseRaw.released ?? false }
        : null;
      const isTerminal = TERMINAL_STATES.includes(state);

      setResult({
        overallState: state,
        steps,
        activeStepIndex,
        assetRelease,
        isLoading: !isTerminal,
        isError: state === 'STATE_COMPLETED_ERROR' || state === 'STATE_ABANDONED',
        errorMessage: data.error?.message ?? null,
        isTerminal,
      });

      if (isTerminal) {
        stopPolling();
        if (state === 'STATE_COMPLETED_SUCCESS') {
          clearPendingTx();
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      console.warn('[useTransactionTracker] poll error:', err);
      setResult(prev => ({
        ...prev,
        isError: true,
        errorMessage: err.message ?? 'Network error polling transaction status',
      }));
    }
  }, [txHash, chainId, stopPolling]);

  useEffect(() => {
    if (!txHash || !chainId) {
      stopPolling();
      setResult(EMPTY_RESULT);
      return;
    }

    setResult(prev => ({
      ...prev,
      overallState: 'STATE_SUBMITTED',
      isLoading: true,
      isError: false,
      errorMessage: null,
      isTerminal: false,
    }));

    savePendingTx({ txHash, chainId, startedAt: Date.now() });

    poll();
    intervalRef.current = setInterval(poll, POLL_INTERVAL_MS);

    return stopPolling;
  }, [txHash, chainId, poll, stopPolling]);

  return result;
}
