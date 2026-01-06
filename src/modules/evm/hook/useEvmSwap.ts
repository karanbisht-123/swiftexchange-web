// hook/useEvmSwap.ts
import { useCallback, useRef, useState } from 'react';

import { ethers } from 'ethers';

import type { SwapQuote, SwapQuoteRequest } from '../../../types/evm/swap.types';
import { WalletType } from '../../walletconnect/constants/Wallet';
import { type TokenInfo, fetchAssetsWithBalances } from '../service/tokenListService';
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
  fetchAssets: () => Promise<void>;
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

  const quoteAbortController = useRef<AbortController | null>(null);
  const assetsAbortController = useRef<AbortController | null>(null);

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

  const fetchAssets = useCallback(async () => {
    if (!senderAddress || !chainId) {
      return;
    }

    if (assetsAbortController.current) {
      assetsAbortController.current.abort();
    }

    assetsAbortController.current = new AbortController();
    updateState({ isFetchingAssets: true, error: null });

    try {
      const provider = getProvider(WalletType.EVM);
      if (!provider) {
        throw new Error('Wallet not connected');
      }

      const ethersProvider = new ethers.BrowserProvider(provider);
      const fetchedAssets = await fetchAssetsWithBalances(chainId, senderAddress, ethersProvider);

      if (!assetsAbortController.current.signal.aborted) {
        updateState({ assets: fetchedAssets, isFetchingAssets: false });
      }
    } catch (err: any) {
      if (err.name === 'AbortError' || assetsAbortController.current?.signal.aborted) {
        return;
      }

      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch assets';
      console.error('Asset fetch error:', err);
      updateState({
        error: errorMessage,
        assets: [],
        isFetchingAssets: false,
      });
    }
  }, [chainId, senderAddress, getProvider, updateState]);

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
        if (parseFloat(request.amount) > parseFloat(sellAsset.balance || '0')) {
          throw new Error(`Insufficient ${sellAsset.symbol} balance`);
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
        console.error('Quote fetch error:', err);
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

      updateState({ loading: true, error: null, txHash: null });

      try {
        if (!quote) {
          throw new Error('No quote available for swap');
        }
        if (!sellAsset || !buyAsset) {
          throw new Error('Invalid assets for swap');
        }
        if (!sellAmount || parseFloat(sellAmount) <= 0) {
          throw new Error('Invalid sell amount');
        }
        if (slippageTolerance < 0 || slippageTolerance > 50) {
          throw new Error('Invalid slippage tolerance (must be 0-50%)');
        }
        if (parseFloat(sellAmount) > parseFloat(sellAsset.balance || '0')) {
          throw new Error(`Insufficient ${sellAsset.symbol} balance`);
        }

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

        updateState({ txHash: hash, loading: false });

        // Refresh assets after successful swap
        setTimeout(() => {
          fetchAssets();
        }, 3000);

        return hash;
      } catch (err: any) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to perform swap';
        console.error('Swap execution error:', err);
        updateState({ error: errorMsg, loading: false, txHash: null });
        throw new Error(errorMsg);
      }
    },
    [chainId, senderAddress, getProvider, fetchAssets, validateSenderAddress, updateState]
  );

  const reset = useCallback(() => {
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
    fetchAssets,
    fetchQuote,
    performSwap,
    reset,
  };
};
