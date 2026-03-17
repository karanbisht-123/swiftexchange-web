import { useCallback, useEffect, useRef, useState } from 'react';

export type BridgeTxStatus = 'idle' | 'pending' | 'confirmed' | 'failed';

export interface BridgeTxState {
  status: BridgeTxStatus;
  confirmations: number;
  blockNumber: number | null;
  gasUsed: string | null;
}

const RPC_BY_CHAIN_ID: Record<number, string> = {
  1: 'https://eth.llamarpc.com',
  137: 'https://polygon.llamarpc.com',
  42161: 'https://arbitrum.llamarpc.com',
  10: 'https://optimism.llamarpc.com',
  8453: 'https://base.llamarpc.com',
  56: 'https://bsc.llamarpc.com',
};

const POLL_INTERVAL_MS = 4_000;
const POLL_TIMEOUT_MS = 10 * 60 * 1_000;

async function fetchReceipt(rpcUrl: string, txHash: string): Promise<any | null> {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_getTransactionReceipt',
      params: [txHash],
    }),
  });
  const json = await res.json();
  return json?.result ?? null;
}

async function fetchLatestBlock(rpcUrl: string): Promise<number> {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'eth_blockNumber', params: [] }),
  });
  const json = await res.json();
  return parseInt(json?.result ?? '0x0', 16);
}

export function useBridgeTxStatus(txHash: string | null, chainId: number) {
  const [state, setState] = useState<BridgeTxState>({
    status: 'idle',
    confirmations: 0,
    blockNumber: null,
    gasUsed: null,
  });

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    intervalRef.current = null;
    timeoutRef.current = null;
  }, []);

  useEffect(() => {
    if (!txHash) {
      stopPolling();
      setState({ status: 'idle', confirmations: 0, blockNumber: null, gasUsed: null });
    }
  }, [txHash, stopPolling]);

  useEffect(() => {
    if (!txHash) return;

    const rpcUrl = RPC_BY_CHAIN_ID[chainId] ?? RPC_BY_CHAIN_ID[1];

    setState(prev => ({ ...prev, status: 'pending' }));

    const poll = async () => {
      try {
        const [receipt, latestBlock] = await Promise.all([
          fetchReceipt(rpcUrl, txHash),
          fetchLatestBlock(rpcUrl),
        ]);

        if (!receipt) return;

        // receipt.status: "0x1" = success, "0x0" = reverted
        const succeeded = receipt.status === '0x1';
        const txBlock = parseInt(receipt.blockNumber, 16);
        const confs = Math.max(0, latestBlock - txBlock);

        setState({
          status: succeeded ? 'confirmed' : 'failed',
          confirmations: confs,
          blockNumber: txBlock,
          gasUsed: receipt.gasUsed ?? null,
        });

        stopPolling();
      } catch (e) {
        console.warn('[bridgeTxStatus] poll error:', e);
      }
    };

    poll();
    intervalRef.current = setInterval(poll, POLL_INTERVAL_MS);
    timeoutRef.current = setTimeout(() => {
      stopPolling();
      setState(prev => (prev.status === 'pending' ? { ...prev, status: 'failed' } : prev));
    }, POLL_TIMEOUT_MS);

    return stopPolling;
  }, [txHash, chainId, stopPolling]);

  return state;
}
