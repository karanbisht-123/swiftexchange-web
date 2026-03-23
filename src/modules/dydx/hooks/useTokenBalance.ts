import { useCallback, useEffect, useRef, useState } from 'react';

import { rpcManager } from '../../evm/utils/rpcProvider';
import { RPC_BY_CHAIN_ID } from './useBridgeTxStatus';

// ERC-20 balanceOf selector: bytes4(keccak256("balanceOf(address)"))
const BALANCE_OF_SELECTOR = '0x70a08231';
// ERC-20 decimals selector: bytes4(keccak256("decimals()"))
const DECIMALS_SELECTOR = '0x313ce567';
// ETH native sentinel address — not a real token
const NATIVE_ETH = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

function encodeBalanceOfCall(ownerAddress: string): string {
  // pad address to 32 bytes
  const padded = ownerAddress.toLowerCase().replace(/^0x/, '').padStart(64, '0');
  return `${BALANCE_OF_SELECTOR}${padded}`;
}

async function fetchErc20Decimals(
  chainId: number,
  urls: string[],
  tokenAddress: string
): Promise<number> {
  try {
    const result = await rpcManager.fetchWithFallback(chainId, urls, provider =>
      provider.send('eth_call', [{ to: tokenAddress, data: DECIMALS_SELECTOR }, 'latest'])
    );
    return result ? parseInt(result as string, 16) : 18;
  } catch {
    return 18;
  }
}

async function fetchErc20Balance(
  chainId: number,
  urls: string[],
  tokenAddress: string,
  walletAddress: string
): Promise<{ raw: string; formatted: number }> {
  const [rawHex, decimals] = await Promise.all([
    rpcManager.fetchWithFallback(chainId, urls, provider =>
      provider.send('eth_call', [
        { to: tokenAddress, data: encodeBalanceOfCall(walletAddress) },
        'latest',
      ])
    ),
    fetchErc20Decimals(chainId, urls, tokenAddress),
  ]);

  const raw = rawHex ? BigInt(rawHex as string).toString() : '0';
  const formatted = Number(raw) / 10 ** decimals;
  return { raw, formatted };
}

async function fetchNativeBalance(
  chainId: number,
  urls: string[],
  walletAddress: string
): Promise<{ raw: string; formatted: number }> {
  const rawHex = await rpcManager.fetchWithFallback(chainId, urls, provider =>
    provider.send('eth_getBalance', [walletAddress, 'latest'])
  );
  const raw = rawHex ? BigInt(rawHex as string).toString() : '0';
  const formatted = Number(raw) / 1e18;
  return { raw, formatted };
}

export interface TokenBalanceState {
  balance: string;
  balanceFormatted: number;
  isLoading: boolean;
  error: string | null;
}

/**
 * Reusable hook to fetch an EVM token (or native ETH) balance.
 *
 * - Uses `rpcManager` for round-robin RPC fallback
 * - Debounces input changes (300ms)
 * - Pass `refreshTrigger` (e.g. a txHash) to trigger a refetch after a tx
 *
 * @param chainId       - EVM chain ID
 * @param walletAddress - User's EVM wallet address
 * @param tokenAddress  - ERC-20 contract address, or '0xeeee…eeee' for native ETH
 * @param refreshTrigger - Optional value that triggers a refetch when it changes (e.g. txHash)
 */
export function useTokenBalance(
  chainId: number | undefined,
  walletAddress: string | undefined,
  tokenAddress: string | undefined,
  refreshTrigger?: string | null
): TokenBalanceState & { refetch: () => void } {
  const [state, setState] = useState<TokenBalanceState>({
    balance: '0',
    balanceFormatted: 0,
    isLoading: false,
    error: null,
  });

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchRef = useRef(0);

  const doFetch = useCallback(async () => {
    if (!chainId || !walletAddress || !tokenAddress) {
      setState(prev => ({ ...prev, isLoading: false }));
      return;
    }

    const fetchId = ++fetchRef.current;
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const urls = RPC_BY_CHAIN_ID[chainId] ?? RPC_BY_CHAIN_ID[1];

      const result =
        tokenAddress.toLowerCase() === NATIVE_ETH
          ? await fetchNativeBalance(chainId, urls, walletAddress)
          : await fetchErc20Balance(chainId, urls, tokenAddress, walletAddress);

      if (fetchRef.current !== fetchId) return;

      setState({
        balance: result.raw,
        balanceFormatted: result.formatted,
        isLoading: false,
        error: null,
      });
    } catch (err: any) {
      if (fetchRef.current !== fetchId) return;
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: err?.message ?? 'Failed to fetch balance',
      }));
    }
  }, [chainId, walletAddress, tokenAddress]);

  // Debounced auto-fetch whenever inputs change
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(doFetch, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [doFetch]);

  // Re-fetch when a transaction completes (e.g. refreshTrigger = txHash)
  useEffect(() => {
    if (!refreshTrigger) return;
    // Small delay to let the chain mine the tx before polling
    const timer = setTimeout(doFetch, 3_000);
    return () => clearTimeout(timer);
  }, [refreshTrigger, doFetch]);

  return { ...state, refetch: doFetch };
}
