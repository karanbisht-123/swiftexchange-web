import { useCallback, useEffect, useRef, useState } from 'react';

import { rpcManager } from '../../evm/utils/rpcProvider';

export const RPC_BY_CHAIN_ID: Record<number, string[]> = {
  1: ['https://eth.llamarpc.com'],
  137: ['https://polygon.llamarpc.com'],
  42161: ['https://arbitrum.llamarpc.com'],
  10: ['https://optimism.llamarpc.com'],
  8453: ['https://base.llamarpc.com'],
  56: ['https://bsc.llamarpc.com'],
};

export const EXPLORER_BY_CHAIN_ID: Record<number, string> = {
  1: 'https://etherscan.io',
  137: 'https://polygonscan.com',
  42161: 'https://arbiscan.io',
  10: 'https://optimistic.etherscan.io',
  8453: 'https://basescan.org',
  56: 'https://bscscan.com',
};

export type BridgeTxStatus = 'idle' | 'pending' | 'confirmed' | 'failed';

export interface BridgeTxState {
  status: BridgeTxStatus;
  confirmations: number;
  blockNumber: number | null;
  gasUsed: string | null;
  isPolling: boolean;
}

export function getExplorerUrl(txHash: string, chainId: number): string {
  const base = EXPLORER_BY_CHAIN_ID[chainId] ?? 'https://etherscan.io';
  return `${base}/tx/${txHash}`;
}

const POLL_INTERVAL_MS = 4_000;
const POLL_TIMEOUT_MS = 10 * 60 * 1_000;

export function useBridgeTxStatus(txHash: string | null, chainId: number) {
  const [state, setState] = useState<BridgeTxState>({
    status: 'idle',
    confirmations: 0,
    blockNumber: null,
    gasUsed: null,
    isPolling: false,
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
      setState({ status: 'idle', confirmations: 0, blockNumber: null, gasUsed: null, isPolling: false });
    }
  }, [txHash, stopPolling]);

  useEffect(() => {
    if (!txHash) return;

    const urls = RPC_BY_CHAIN_ID[chainId] ?? RPC_BY_CHAIN_ID[1];
    setState(prev => ({ ...prev, status: 'pending', isPolling: true }));

    const poll = async () => {
      try {
        const [receipt, latestBlockHex] = await Promise.all([
          rpcManager.fetchWithFallback(chainId, urls, provider =>
            provider.send('eth_getTransactionReceipt', [txHash])
          ),
          rpcManager.fetchWithFallback(chainId, urls, provider =>
            provider.send('eth_blockNumber', [])
          ),
        ]);

        if (!receipt) return;

        const succeeded = receipt.status === '0x1';
        const txBlock = parseInt(receipt.blockNumber, 16);
        const latestBlock = parseInt(latestBlockHex as string, 16);
        const confs = Math.max(0, latestBlock - txBlock);

        setState({
          status: succeeded ? 'confirmed' : 'failed',
          confirmations: confs,
          blockNumber: txBlock,
          gasUsed: receipt.gasUsed ?? null,
          isPolling: false,
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
      setState(prev =>
        prev.status === 'pending'
          ? { ...prev, status: 'failed', isPolling: false }
          : prev
      );
    }, POLL_TIMEOUT_MS);

    return stopPolling;
  }, [txHash, chainId, stopPolling]);

  return state;
}
