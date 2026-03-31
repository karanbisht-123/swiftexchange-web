import { useCallback, useRef, useState } from 'react';

import { ethers } from 'ethers';

import type { SwapQuote, SwapQuoteRequest } from '../../../types/evm/swap.types';
import { WalletType } from '../../walletconnect/constants/Wallet';
import { addLocalTransaction } from '../service/localTransactionService';
import {
  type TokenInfo,
  fetchSingleTokenBalance,
  getTokensForChain,
} from '../service/tokenListService';
import { executeSwap, fetchEvmQuote } from '../utils/evmSwapUtils';

interface UseEvmSwapProps {
  chainId: number;
  senderAddress: string;
  getProvider: (type: WalletType) => any;
}

interface UseEvmSwapState {
  quote: SwapQuote | null;
  txHash: string | null;
  assets: TokenInfo[];
  loading: boolean;
  error: string | null;
  isFetchingAssets: boolean;
  quoteLoading: boolean;
}

interface UseEvmSwapActions {
  fetchTokenList: () => void;
  updateTokenBalances: (sellToken?: TokenInfo, buyToken?: TokenInfo) => Promise<void>;
  fetchQuote: (
    request: SwapQuoteRequest,
    sellAsset: TokenInfo,
    buyAsset: TokenInfo
  ) => Promise<SwapQuote>;
  performSwap: (
    quote: SwapQuote,
    sellAsset: TokenInfo,
    buyAsset: TokenInfo,
    sellAmount: string,
    slippageTolerance: number
  ) => Promise<string>;
  reset: () => void;
}

export const useEvmSwap = ({
  chainId,
  senderAddress,
  getProvider,
}: UseEvmSwapProps): UseEvmSwapState & UseEvmSwapActions => {
  const [state, setState] = useState<UseEvmSwapState>({
    quote: null,
    txHash: null,
    assets: [],
    loading: false,
    error: null,
    isFetchingAssets: false,
    quoteLoading: false,
  });

  const activeSwapId = useRef<string | null>(null);
  const quoteAbortController = useRef<AbortController | null>(null);

  const updateState = useCallback((updates: Partial<UseEvmSwapState>) => {
    setState(prev => ({ ...prev, ...updates }));
  }, []);

  const validateSenderAddress = useCallback((): boolean => {
    if (!senderAddress) {
      updateState({ error: 'No wallet address provided' });
      return false;
    }
    if (!ethers.isAddress(senderAddress)) {
      updateState({ error: 'Invalid wallet address format' });
      return false;
    }
    return true;
  }, [senderAddress, updateState]);

  const fetchTokenList = useCallback(() => {
    if (!chainId) return;

    updateState({ isFetchingAssets: true, error: null });

    try {
      const tokens = getTokensForChain(chainId);
      updateState({ assets: tokens, isFetchingAssets: false });
    } catch (err) {
      console.error('Failed to load token list:', err);
      updateState({
        error: 'Failed to load token list',
        assets: [],
        isFetchingAssets: false,
      });
    }
  }, [chainId, updateState]);

  const updateTokenBalances = useCallback(
    async (sellToken?: TokenInfo, buyToken?: TokenInfo) => {
      if (!senderAddress || !chainId) return;

      const provider = getProvider(WalletType.EVM);
      if (!provider) return;

      const ethersProvider = new ethers.BrowserProvider(provider);

      const tokensToFetch = [sellToken, buyToken].filter((t): t is TokenInfo => !!t);
      if (tokensToFetch.length === 0) return;
      const updates = await Promise.all(
        tokensToFetch.map(async token => {
          const bal = await fetchSingleTokenBalance(
            senderAddress,
            ethersProvider,
            token.address,
            !!token.isNative,
            token.decimals
          );
          return { address: token.address, balance: bal };
        })
      );
      setState(prev => {
        const newAssets = [...prev.assets];
        let hasChanges = false;

        updates.forEach(({ address, balance }) => {
          const index = newAssets.findIndex(a => a.address === address);
          if (index !== -1 && newAssets[index].balance !== balance) {
            newAssets[index] = { ...newAssets[index], balance };
            hasChanges = true;
          }
        });

        return hasChanges ? { ...prev, assets: newAssets } : prev;
      });
    },
    [chainId, senderAddress, getProvider]
  );

  const fetchQuote = useCallback(
    async (
      request: SwapQuoteRequest,
      sellAsset: TokenInfo,
      buyAsset: TokenInfo
    ): Promise<SwapQuote> => {
      if (quoteAbortController.current) {
        quoteAbortController.current.abort();
      }

      quoteAbortController.current = new AbortController();
      updateState({ quoteLoading: true, error: null, quote: null });

      try {
        if (!request.amount || parseFloat(request.amount) <= 0) {
          throw new Error('Invalid swap amount');
        }
        if (!sellAsset || !buyAsset) {
          throw new Error('Invalid assets selected');
        }
        if (sellAsset.address === buyAsset.address) {
          throw new Error('Cannot swap same token');
        }

        const quoteResponse = await fetchEvmQuote(chainId, request, sellAsset, buyAsset);

        if (!quoteAbortController.current.signal.aborted) {
          updateState({ quote: quoteResponse, quoteLoading: false });
        }
        return quoteResponse;
      } catch (err: any) {
        if (err.name === 'AbortError' || quoteAbortController.current?.signal.aborted) {
          return Promise.reject(new Error('Quote request cancelled'));
        }

        const errorMsg = err instanceof Error ? err.message : 'Failed to fetch quote';
        updateState({ error: errorMsg, quoteLoading: false, quote: null });
        throw new Error(errorMsg);
      }
    },
    [chainId, updateState]
  );

  const performSwap = useCallback(
    async (
      quote: SwapQuote,
      sellAsset: TokenInfo,
      buyAsset: TokenInfo,
      sellAmount: string,
      slippageTolerance: number
    ): Promise<string> => {
      if (!validateSenderAddress()) {
        throw new Error('Invalid sender address');
      }

      const swapId = Date.now().toString();
      activeSwapId.current = swapId;
      updateState({ loading: true, error: null, txHash: null });

      try {
        if (!quote) throw new Error('No quote available');

        const hash = await executeSwap(
          chainId,
          quote,
          sellAsset,
          buyAsset,
          senderAddress,
          sellAmount,
          slippageTolerance,
          getProvider
        );

        // Record in history regardless of whether the UI was cancelled
        addLocalTransaction({
          hash,
          chainId,
          type: 'swap',
          timestamp: Date.now(),
          description: `Swap ${sellAsset.symbol} → ${buyAsset.symbol}`,
          status: 'pending',
        });

        // Only update UI if this is still the active swap
        if (activeSwapId.current === swapId) {
          updateState({ txHash: hash, loading: false });
        }

        setTimeout(() => {
          updateTokenBalances(sellAsset, buyAsset);
        }, 8000);

        return hash;
      } catch (err: any) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to perform swap';
        
        // If it failed but wasn't explicitly cancelled by user, update UI error
        if (activeSwapId.current === swapId) {
          addLocalTransaction({
            hash: `failed-${Date.now()}`,
            chainId,
            type: 'swap',
            timestamp: Date.now(),
            description: `Swap ${sellAsset.symbol} → ${buyAsset.symbol}`,
            status: 'failed',
          });
          updateState({ error: errorMsg, loading: false, txHash: null });
        }
        
        throw new Error(errorMsg);
      }
    },
    [chainId, senderAddress, getProvider, updateTokenBalances, validateSenderAddress, updateState]
  );

  const reset = useCallback(() => {
    activeSwapId.current = null;
    if (quoteAbortController.current) {
      quoteAbortController.current.abort();
    }
    updateState({
      quote: null,
      txHash: null,
      error: null,
      loading: false,
      quoteLoading: false,
    });
  }, [updateState]);

  return {
    ...state,
    fetchTokenList,
    updateTokenBalances,
    fetchQuote,
    performSwap,
    reset,
  };
};
