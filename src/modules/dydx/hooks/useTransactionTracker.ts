import { useCallback, useEffect, useRef, useState } from 'react';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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
  hasPolledOnce: boolean;
  refresh: () => void;
  txHash: string | null;
  chainId: string | null;
}

const SKIP_STATUS_URL = 'https://api.skip.build/v2/tx/status';
const POLL_INTERVAL_MS = 60_000;
const TERMINAL_STATES: OverallState[] = [
  'STATE_COMPLETED_SUCCESS',
  'STATE_COMPLETED_ERROR',
  'STATE_ABANDONED',
];

export interface PendingTxInfo {
  txHash: string | null;
  chainId: string | null;
  startedAt: number;
  status: 'pending' | 'success' | 'failed';
  amount?: string;
  assetSymbol?: string;
  stepLabel?: string;

  isPreBridge?: boolean;
}

interface TransactionStore {
  depositTx: PendingTxInfo | null;
  withdrawTx: PendingTxInfo | null;
  setDepositTx: (tx: PendingTxInfo | null) => void;
  setWithdrawTx: (tx: PendingTxInfo | null) => void;
  clearDepositTx: () => void;
  clearWithdrawTx: () => void;
}

export const useTransactionStore = create<TransactionStore>()(
  persist(
    set => ({
      depositTx: null,
      withdrawTx: null,
      setDepositTx: tx => set({ depositTx: tx }),
      setWithdrawTx: tx => set({ withdrawTx: tx }),
      clearDepositTx: () => set({ depositTx: null }),
      clearWithdrawTx: () => set({ withdrawTx: null }),
    }),
    { name: 'swiftex_pending_skip_txs_v2' }
  )
);

export function useHasActivePendingDeposit(): boolean {
  return useTransactionStore(s => !!s.depositTx && s.depositTx.status === 'pending');
}

export function useHasActivePendingWithdraw(): boolean {
  return useTransactionStore(s => !!s.withdrawTx && s.withdrawTx.status === 'pending');
}

export function getIsDepositPending(): boolean {
  const tx = useTransactionStore.getState().depositTx;
  return !!tx && tx.status === 'pending';
}

export function getIsWithdrawPending(): boolean {
  const tx = useTransactionStore.getState().withdrawTx;
  return !!tx && tx.status === 'pending';
}

export const LS_PENDING_TX_KEY = 'swiftex_pending_skip_tx_v2';
export function savePendingTx(_info: any): void {}
export function loadPendingTx(): any | null {
  return null;
}
export function clearPendingTx(): void {}

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

function parsePacket(raw?: any | null): Packet | null {
  if (!raw) return null;
  const txs = raw.txs ?? raw;
  const toTx = (t?: any): PacketTx | null =>
    t
      ? {
          chain_id: t.chain_id ?? '',
          tx_hash: t.tx_hash ?? '',
          explorer_link: t.explorer_link ?? '',
        }
      : null;

  return {
    send_tx: toTx(txs.send_tx),
    receive_tx: toTx(txs.receive_tx),
    acknowledge_tx: toTx(txs.acknowledge_tx),
    timeout_tx: toTx(txs.timeout_tx),
    error: raw.error ?? null,
  };
}

function parseSteps(raw: any[] = []): TransferStep[] {
  return raw.map((s, i) => {
    const opKey = Object.keys(s).find(k => k.endsWith('_transfer')) ?? 'unknown';
    const inner = (s as any)[opKey] ?? s;

    return {
      index: i,
      state: (inner.state === 'CCTP_TRANSFER_RECEIVED'
        ? 'TRANSFER_RECEIVED'
        : (inner.state ?? 'TRANSFER_UNKNOWN')) as TransferState,
      packet_txs: parsePacket(inner.packet_txs ?? inner.txs),
      type: opKey,
      from_chain_id: inner.from_chain_id ?? inner.src_chain_id ?? '',
      to_chain_id: inner.to_chain_id ?? inner.dst_chain_id ?? '',
      asset_denom: inner.denom_in ?? '',
    };
  });
}

const EMPTY_RESULT: Omit<TxTrackerResult, 'refresh'> = {
  overallState: 'STATE_UNKNOWN',
  steps: [],
  activeStepIndex: null,
  assetRelease: null,
  isLoading: false,
  isError: false,
  errorMessage: null,
  isTerminal: false,
  hasPolledOnce: false,
  txHash: null,
  chainId: null,
};

export function useTransactionTracker(type: 'deposit' | 'withdraw'): TxTrackerResult {
  const store = useTransactionStore();
  const txInfo = type === 'deposit' ? store.depositTx : store.withdrawTx;
  const txHash = txInfo?.txHash || null;
  const chainId = txInfo?.chainId || null;

  const [result, setResult] = useState<Omit<TxTrackerResult, 'refresh'>>({
    ...EMPTY_RESULT,
    txHash,
    chainId,
  });

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const isTerminalRef = useRef(false);

  useEffect(() => {
    setResult(prev => ({ ...prev, txHash, chainId }));
  }, [txHash, chainId]);

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

  const updateStoreStatus = useCallback(
    (status: 'pending' | 'success' | 'failed') => {
      const currentState = useTransactionStore.getState();
      const currentTxInfo = type === 'deposit' ? currentState.depositTx : currentState.withdrawTx;
      if (!currentTxInfo) return;
      if (currentTxInfo.status === status) return; // Prevent unnecessary updates
      const updated = { ...currentTxInfo, status };
      type === 'deposit' ? currentState.setDepositTx(updated) : currentState.setWithdrawTx(updated);
    },
    [type]
  );

  const poll = useCallback(
    async (isManual = false) => {
      if (!txHash || !chainId) return;
      if (isTerminalRef.current && !isManual) return;

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const url = new URL(SKIP_STATUS_URL);
        url.searchParams.append('chain_id', chainId);
        url.searchParams.append('tx_hash', txHash);

        const res = await fetch(url.toString(), { method: 'GET', signal: controller.signal });

        console.log(res, 'skip go res[onse');

        if (!res.ok) {
          if (res.status === 404 || res.status === 400) {
            setResult(prev => ({ ...prev, hasPolledOnce: true }));
            return;
          }
          throw new Error(`Skip status API returned ${res.status}`);
        }

        const data: RawStatusResponse = await res.json();
        const state: OverallState = data.state ?? 'STATE_UNKNOWN';
        const steps = parseSteps(data.transfer_sequence);
        const activeStepIndex = data.next_blocking_transfer?.transfer_sequence_index ?? null;

        console.log(activeStepIndex, ' ustransction : activeStepIndex --------');
        const releaseRaw = data.transfer_asset_release;

        console.log(releaseRaw, 'relse Raw asset -----');
        const assetRelease: AssetRelease | null = releaseRaw
          ? {
              chain_id: releaseRaw.chain_id ?? '',
              denom: releaseRaw.denom ?? '',
              released: releaseRaw.released ?? false,
            }
          : null;
        const isTerminal = TERMINAL_STATES.includes(state);
        console.log(isTerminal, '--------');
        isTerminalRef.current = isTerminal;

        setResult(prev => ({
          ...prev,
          overallState: state,
          steps,
          activeStepIndex,
          assetRelease,
          isLoading: !isTerminal,
          isError: state === 'STATE_COMPLETED_ERROR' || state === 'STATE_ABANDONED',
          errorMessage: data.error?.message ?? null,
          isTerminal,
          hasPolledOnce: true,
        }));

        console.log(state);
        if (isTerminal) {
          console.log('stoppolling ------');
          stopPolling();
          updateStoreStatus(state === 'STATE_COMPLETED_SUCCESS' ? 'success' : 'failed');
        } else {
          updateStoreStatus('pending');
        }
      } catch (err: any) {
        if (err.name === 'AbortError') return;
        console.warn('[useTransactionTracker] poll error:', err);
        setResult(prev => ({
          ...prev,
          hasPolledOnce: true,
          isError: true,
          errorMessage: err.message ?? 'Network error polling transaction status',
        }));
      }
    },
    [txHash, chainId, stopPolling, updateStoreStatus]
  );

  const refresh = useCallback(() => poll(true), [poll]);

  useEffect(() => {
    const currentState = useTransactionStore.getState();
    const currentTxInfo = type === 'deposit' ? currentState.depositTx : currentState.withdrawTx;

    // Debug restored state on mount
    if (currentTxInfo) {
      console.log(`[useTransactionTracker] ${type} tx found in store:`, {
        hash: currentTxInfo.txHash,
        status: currentTxInfo.status,
        startedAt: new Date(currentTxInfo.startedAt).toLocaleTimeString(),
      });
    }

    if (!txHash || !chainId) {
      // If we are pending but have no hash yet, don't stop polling, but don't start the Skip poll either.
      // This allows the UI to stay in the 'Tracker' view while waiting for a hash.
      if (currentTxInfo?.status === 'pending') {
        setResult(prev => ({ ...prev, txHash: null, chainId: null, isLoading: true }));
        return;
      }

      stopPolling();
      isTerminalRef.current = false;
      setResult({ ...EMPTY_RESULT, txHash: null, chainId: null });
      return;
    }

    isTerminalRef.current = false;
    setResult(prev => ({
      ...prev,
      overallState: 'STATE_SUBMITTED',
      isLoading: true,
      isError: false,
      errorMessage: null,
      isTerminal: false,
      hasPolledOnce: false,
    }));

    poll();
    intervalRef.current = setInterval(() => poll(), POLL_INTERVAL_MS);
    return stopPolling;
  }, [txHash, chainId, poll, stopPolling, type]);

  return { ...result, refresh };
}
