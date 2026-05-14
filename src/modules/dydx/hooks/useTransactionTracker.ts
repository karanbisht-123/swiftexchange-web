import { useCallback, useEffect, useRef, useState } from 'react';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useWalletStore } from '../../walletconnect/store/walletConnectStore';

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
  acknowledge: () => void;
  txHash: string | null;
  chainId: string | null;
}

const SKIP_STATUS_URL = 'https://api.skip.build/v2/tx/status';
const INITIAL_POLL_DELAY_MS = 10_000;
const MAX_POLL_DELAY_MS = 30_000;
const POLL_MULTIPLIER = 1.5;

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
  isAcknowledged?: boolean;
  ownerAddresses?: string[]; // Deprecated, use requiredWallets
  requiredWallets?: {
    evm?: string;
    stellar?: string;
    cosmos?: string;
    dydx?: string;
  };
}

interface TransactionStore {
  depositTxs: PendingTxInfo[];
  withdrawTxs: PendingTxInfo[];
  setDepositTx: (tx: PendingTxInfo | null) => void;
  setWithdrawTx: (tx: PendingTxInfo | null) => void;
  acknowledgeDeposit: () => void;
  acknowledgeWithdraw: () => void;
  clearDepositTx: () => void;
  clearWithdrawTx: () => void;
  
  // Legacy fields for backward compatibility
  depositTx?: PendingTxInfo | null;
  withdrawTx?: PendingTxInfo | null;
}

export const useTransactionStore = create<TransactionStore>()(
  persist(
    set => ({
      depositTxs: [],
      withdrawTxs: [],
      depositTx: null,
      withdrawTx: null,
      setDepositTx: tx => set(state => {
        const wallets = useWalletStore.getState().connectedWallets;
        if (!tx) {
          return { depositTxs: state.depositTxs.filter(t => !isTxOwnedByCurrentUser(t, wallets)) };
        }
        const exists = state.depositTxs.findIndex(t => isTxOwnedByCurrentUser(t, wallets));
        if (exists >= 0) {
          const newTxs = [...state.depositTxs];
          newTxs[exists] = { ...newTxs[exists], ...tx };
          return { depositTxs: newTxs };
        }
        return { depositTxs: [...state.depositTxs, tx] };
      }),
      setWithdrawTx: tx => set(state => {
        const wallets = useWalletStore.getState().connectedWallets;
        if (!tx) {
          return { withdrawTxs: state.withdrawTxs.filter(t => !isTxOwnedByCurrentUser(t, wallets)) };
        }
        const exists = state.withdrawTxs.findIndex(t => isTxOwnedByCurrentUser(t, wallets));
        if (exists >= 0) {
          const newTxs = [...state.withdrawTxs];
          newTxs[exists] = { ...newTxs[exists], ...tx };
          return { withdrawTxs: newTxs };
        }
        return { withdrawTxs: [...state.withdrawTxs, tx] };
      }),
      acknowledgeDeposit: () => set(state => {
        const wallets = useWalletStore.getState().connectedWallets;
        return { depositTxs: state.depositTxs.filter(t => !isTxOwnedByCurrentUser(t, wallets)) };
      }),
      acknowledgeWithdraw: () => set(state => {
        const wallets = useWalletStore.getState().connectedWallets;
        return { withdrawTxs: state.withdrawTxs.filter(t => !isTxOwnedByCurrentUser(t, wallets)) };
      }),
      clearDepositTx: () => set(state => {
        const wallets = useWalletStore.getState().connectedWallets;
        return { depositTxs: state.depositTxs.filter(t => !isTxOwnedByCurrentUser(t, wallets)) };
      }),
      clearWithdrawTx: () => set(state => {
        const wallets = useWalletStore.getState().connectedWallets;
        return { withdrawTxs: state.withdrawTxs.filter(t => !isTxOwnedByCurrentUser(t, wallets)) };
      }),
    }),
    { 
      name: 'swiftex_pending_skip_txs_v2',
      onRehydrateStorage: () => (state) => {
        // Migrate legacy single objects to arrays if needed
        if (state) {
          if (state.depositTx && !state.depositTxs?.some(t => t.txHash === state.depositTx!.txHash)) {
            state.depositTxs = [...(state.depositTxs || []), state.depositTx];
          }
          if (state.withdrawTx && !state.withdrawTxs?.some(t => t.txHash === state.withdrawTx!.txHash)) {
            state.withdrawTxs = [...(state.withdrawTxs || []), state.withdrawTx];
          }
        }
      }
    }
  )
);

export function isTxOwnedByCurrentUser(tx: PendingTxInfo | any, wallets: any): boolean {
  if (!tx) return false;
  
  if (tx.requiredWallets) {
    if (tx.requiredWallets.evm && wallets.evm?.address?.toLowerCase() !== tx.requiredWallets.evm.toLowerCase()) return false;
    if (tx.requiredWallets.stellar && wallets.stellar?.address?.toLowerCase() !== tx.requiredWallets.stellar.toLowerCase()) return false;
    if (tx.requiredWallets.cosmos && wallets.cosmos?.address?.toLowerCase() !== tx.requiredWallets.cosmos.toLowerCase()) return false;
    
    // Check if dYdX address matches either EVM or Cosmos
    if (tx.requiredWallets.dydx) {
      const activeDydx = [wallets.evm?.dydxAddress, wallets.cosmos?.dydxAddress]
        .filter(Boolean)
        .map(a => a!.toLowerCase());
      if (!activeDydx.includes(tx.requiredWallets.dydx.toLowerCase())) return false;
    }
    return true;
  }

  // Fallback for older txs
  if (!tx.ownerAddresses || tx.ownerAddresses.length === 0) return true;
  
  const activeAddresses = [
    wallets.evm?.address,
    wallets.evm?.dydxAddress,
    wallets.stellar?.address,
    wallets.cosmos?.address,
    wallets.cosmos?.dydxAddress
  ].filter(Boolean).map(a => a!.toLowerCase());

  // Require EVERY original owner address to be present
  return tx.ownerAddresses.every((addr: string) => activeAddresses.includes(addr.toLowerCase()));
}

export function getCurrentDepositTx(): PendingTxInfo | null {
  const store = useTransactionStore.getState();
  const wallets = useWalletStore.getState().connectedWallets;
  return store.depositTxs?.find(t => isTxOwnedByCurrentUser(t, wallets)) || null;
}

export function getCurrentWithdrawTx(): PendingTxInfo | null {
  const store = useTransactionStore.getState();
  const wallets = useWalletStore.getState().connectedWallets;
  return store.withdrawTxs?.find(t => isTxOwnedByCurrentUser(t, wallets)) || null;
}

export function useCurrentDepositTx(): PendingTxInfo | null {
  const depositTxs = useTransactionStore(s => s.depositTxs);
  const wallets = useWalletStore(s => s.connectedWallets);
  return depositTxs?.find(t => isTxOwnedByCurrentUser(t, wallets)) || null;
}

export function useCurrentWithdrawTx(): PendingTxInfo | null {
  const withdrawTxs = useTransactionStore(s => s.withdrawTxs);
  const wallets = useWalletStore(s => s.connectedWallets);
  return withdrawTxs?.find(t => isTxOwnedByCurrentUser(t, wallets)) || null;
}

export function useHasActivePendingDeposit(): boolean {
  const depositTxs = useTransactionStore(s => s.depositTxs);
  const wallets = useWalletStore(s => s.connectedWallets);
  const activeTx = depositTxs?.find(t => isTxOwnedByCurrentUser(t, wallets));
  return !!activeTx && activeTx.status === 'pending';
}

export function useHasActivePendingWithdraw(): boolean {
  const withdrawTxs = useTransactionStore(s => s.withdrawTxs);
  const wallets = useWalletStore(s => s.connectedWallets);
  const activeTx = withdrawTxs?.find(t => isTxOwnedByCurrentUser(t, wallets));
  return !!activeTx && activeTx.status === 'pending';
}

export function getIsDepositPending(): boolean {
  const tx = getCurrentDepositTx();
  return !!tx && tx.status === 'pending';
}

export function getIsWithdrawPending(): boolean {
  const tx = getCurrentWithdrawTx();
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

const EMPTY_RESULT: Omit<TxTrackerResult, 'refresh' | 'acknowledge'> = {
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
  const wallets = useWalletStore(s => s.connectedWallets);
  const txs = type === 'deposit' ? store.depositTxs : store.withdrawTxs;
  const txInfo = txs?.find(t => isTxOwnedByCurrentUser(t, wallets)) || null;
  const txHash = txInfo?.txHash || null;
  const chainId = txInfo?.chainId || null;

  const [result, setResult] = useState<Omit<TxTrackerResult, 'refresh' | 'acknowledge'>>({
    ...EMPTY_RESULT,
    txHash,
    chainId,
  });

  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentDelayRef = useRef(INITIAL_POLL_DELAY_MS);
  const abortRef = useRef<AbortController | null>(null);
  const isTerminalRef = useRef(false);

  useEffect(() => {
    setResult(prev => ({ ...prev, txHash, chainId }));
  }, [txHash, chainId]);

  const stopPolling = useCallback(() => {
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, []);

  const updateStoreStatus = useCallback(
    (status: 'pending' | 'success' | 'failed') => {
      const currentState = useTransactionStore.getState();
      const wallets = useWalletStore.getState().connectedWallets;
      const txs = type === 'deposit' ? currentState.depositTxs : currentState.withdrawTxs;
      const currentTxInfo = txs?.find(t => isTxOwnedByCurrentUser(t, wallets));
      if (!currentTxInfo || currentTxInfo.status === status) return;
      const updated = { ...currentTxInfo, status };
      type === 'deposit' ? currentState.setDepositTx(updated) : currentState.setWithdrawTx(updated);
    },
    [type]
  );

  const poll = useCallback(
    async (isManual = false) => {
      if (!txHash || !chainId) return;
      if (isTerminalRef.current && !isManual) return;

      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const url = new URL(SKIP_STATUS_URL);
        url.searchParams.append('chain_id', chainId);
        url.searchParams.append('tx_hash', txHash);

        const res = await fetch(url.toString(), { method: 'GET', signal: controller.signal });

        if (!res.ok) {
          if (res.status === 404 || res.status === 400) {
            setResult(prev => ({ ...prev, hasPolledOnce: true }));
            scheduleNextPoll();
            return;
          }
          throw new Error(`Skip status API returned ${res.status}`);
        }

        const data: RawStatusResponse = await res.json();
        const state: OverallState = data.state ?? 'STATE_UNKNOWN';
        const steps = parseSteps(data.transfer_sequence);
        const activeStepIndex = data.next_blocking_transfer?.transfer_sequence_index ?? null;
        const releaseRaw = data.transfer_asset_release;

        const assetRelease: AssetRelease | null = releaseRaw
          ? {
              chain_id: releaseRaw.chain_id ?? '',
              denom: releaseRaw.denom ?? '',
              released: releaseRaw.released ?? false,
            }
          : null;

        const isTerminal = TERMINAL_STATES.includes(state);
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

        if (isTerminal) {
          stopPolling();
          updateStoreStatus(state === 'STATE_COMPLETED_SUCCESS' ? 'success' : 'failed');
        } else {
          updateStoreStatus('pending');
          scheduleNextPoll();
        }
      } catch (err: any) {
        if (err.name === 'AbortError') return;
        setResult(prev => ({
          ...prev,
          hasPolledOnce: true,
          isError: true,
          errorMessage: err.message ?? 'Network error polling transaction status',
        }));
        scheduleNextPoll();
      }
    },
    [txHash, chainId, stopPolling, updateStoreStatus]
  );

  function scheduleNextPoll() {
    if (isTerminalRef.current) return;
    if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);

    pollTimeoutRef.current = setTimeout(() => {
      currentDelayRef.current = Math.min(currentDelayRef.current * POLL_MULTIPLIER, MAX_POLL_DELAY_MS);
      poll();
    }, currentDelayRef.current);
  }

  const refresh = useCallback(() => {
    currentDelayRef.current = INITIAL_POLL_DELAY_MS;
    poll(true);
  }, [poll]);

  const acknowledge = useCallback(() => {
    type === 'deposit' ? store.acknowledgeDeposit() : store.acknowledgeWithdraw();
  }, [type, store]);

  useEffect(() => {
    if (!txHash || !chainId) {
      const currentState = useTransactionStore.getState();
      const currentTxInfo = type === 'deposit' ? currentState.depositTx : currentState.withdrawTx;

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
    currentDelayRef.current = INITIAL_POLL_DELAY_MS;
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

    return stopPolling;
  }, [txHash, chainId, poll, stopPolling, type]);

  return { ...result, refresh, acknowledge };
}
