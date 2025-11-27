import { useCallback, useRef, useState } from 'react';

import type { Asset, SwapQuote, SwapQuoteRequest } from '../../../types/evm/swap.types';
import { WalletType } from '../../walletconnect/constants/Wallet';
import { AssetUtils } from '../utils/assetUtils';
import { executeSwap, fetchEvmQuote } from '../utils/evmSwapUtils';

interface UseEvmSwapProps {
  chainId: number;
  senderAddress: string;
  getProvider: (type: WalletType) => any;
}

interface UseEvmSwapState {
  quote: SwapQuote | null;
  txHash: string | null;
  assets: Asset[];
  loading: boolean;
  error: string | null;
  isFetchingAssets: boolean;
  quoteLoading: boolean;
}

interface UseEvmSwapActions {
  fetchAssets: () => Promise<void>;
  fetchQuote: (request: SwapQuoteRequest, sellAsset: Asset, buyAsset: Asset) => Promise<SwapQuote>;
  performSwap: (
    quote: SwapQuote,
    sellAsset: Asset,
    buyAsset: Asset,
    sellAmount: string,
    slippageTolerance: number
  ) => Promise<string>;
  reset: () => void;
  clearCache: () => void;
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
    if (!AssetUtils.isValidAddress(senderAddress)) {
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
      const fetchedAssets = await AssetUtils.fetchAssets(chainId, senderAddress);

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
  }, [chainId, senderAddress, updateState]);

  const fetchQuote = useCallback(
    async (request: SwapQuoteRequest, sellAsset: Asset, buyAsset: Asset): Promise<SwapQuote> => {
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
        if (parseFloat(request.amount) > sellAsset.balance) {
          throw new Error(`Insufficient ${sellAsset.code} balance`);
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
      sellAsset: Asset,
      buyAsset: Asset,
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
        if (parseFloat(sellAmount) > sellAsset.balance) {
          throw new Error(`Insufficient ${sellAsset.code} balance`);
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

  const clearCache = useCallback(() => {
    AssetUtils.clearMetadataCache();
  }, []);

  return {
    quote: state.quote,
    txHash: state.txHash,
    assets: state.assets,
    loading: state.loading,
    error: state.error,
    isFetchingAssets: state.isFetchingAssets,
    quoteLoading: state.quoteLoading,
    fetchAssets,
    fetchQuote,
    performSwap,
    reset,
    clearCache,
  };
};
