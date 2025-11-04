import { useCallback, useState } from 'react';

import { type NetworkKey } from '../../../config/swapConfigs';
import type { Asset, SwapQuote, SwapQuoteRequest } from '../../../types/evm/swap.types';
import { AssetUtils } from '../utils/assetUtils';
import { fetchEvmQuote, handleEvmSwap } from '../utils/evmSwapUtils';

interface UseEvmSwapProps {
  networkKey: NetworkKey;
  senderAddress: string;
  getPrivateKey: (chain: 'evm' | 'stellar') => Promise<string | null>;
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
  networkKey,
  senderAddress,
  getPrivateKey,
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

  const updateState = (updates: Partial<UseEvmSwapState>) => {
    setState(prev => ({ ...prev, ...updates }));
  };

  const validateSenderAddress = (): boolean => {
    if (!senderAddress) {
      updateState({ error: 'No wallet address provided' });
      return false;
    }
    if (!AssetUtils.isValidAddress(senderAddress)) {
      updateState({ error: 'Invalid wallet address format' });
      return false;
    }
    return true;
  };

  const fetchAssets = useCallback(async () => {
    if (!validateSenderAddress()) {
      updateState({ assets: [] });
      return;
    }

    updateState({ isFetchingAssets: true, error: null });

    try {
      const fetchedAssets = await AssetUtils.fetchAssets(networkKey, senderAddress);
      updateState({ assets: fetchedAssets, isFetchingAssets: false });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch assets';
      console.error('Asset fetch error:', err);
      updateState({
        error: errorMessage,
        assets: [],
        isFetchingAssets: false,
      });
    }
  }, [networkKey, senderAddress]);

  const fetchQuote = useCallback(
    async (request: SwapQuoteRequest, sellAsset: Asset, buyAsset: Asset): Promise<SwapQuote> => {
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

        const quoteResponse = await fetchEvmQuote(networkKey, request, sellAsset, buyAsset);

        updateState({ quote: quoteResponse, quoteLoading: false });
        return quoteResponse;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to fetch quote';
        console.error('Quote fetch error:', err);
        updateState({ error: errorMsg, quoteLoading: false, quote: null });
        throw new Error(errorMsg);
      }
    },
    [networkKey]
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

        const hash = await handleEvmSwap(
          networkKey,
          quote,
          sellAsset,
          buyAsset,
          senderAddress,
          sellAmount,
          slippageTolerance,
          getPrivateKey
        );

        updateState({ txHash: hash, loading: false });

        setTimeout(() => {
          fetchAssets();
        }, 3000);

        return hash;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to perform swap';
        console.error('Swap execution error:', err);
        updateState({ error: errorMsg, loading: false, txHash: null });
        throw new Error(errorMsg);
      }
    },
    [networkKey, senderAddress, getPrivateKey, fetchAssets]
  );

  const reset = useCallback(() => {
    updateState({
      quote: null,
      txHash: null,
      error: null,
      loading: false,
      quoteLoading: false,
    });
  }, []);

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
