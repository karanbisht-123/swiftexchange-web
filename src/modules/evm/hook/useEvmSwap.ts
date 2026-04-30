import { useCallback, useEffect, useRef, useState } from 'react';

import { ethers } from 'ethers';

import type { SwapQuote, SwapQuoteRequest, FusionQuote } from '../../../types/evm/swap.types';
import { WalletType } from '../../walletconnect/constants/Wallet';
import { addLocalTransaction } from '../service/localTransactionService';
import {
  type TokenInfo,
  fetchSingleTokenBalance,
  getTokensForChain,
} from '../service/tokenListService';
import { useWalletStore } from '../../walletconnect/store/walletConnectStore';
import { usePortfolioStore } from '../../walletconnect/store/portfolioStore';
import { executeSwap, fetchEvmQuote, fetch1InchFusionQuote, execute1InchFusionSwap, fetchRangoBestRoute, fetchRangoConfirmRoute, fetchRangoCheckApproval, fetchRangoPrepareTx } from '../utils/evmSwapUtils';
import { rpcManager } from '../utils/rpcProvider';
import { getEVMNetworkConfig } from '../utils/evmUtils';
import { parseSwapError } from '../utils/swapErrorHandler';
import { isEvmChain } from '../utils/Chainregistry';

interface UseEvmSwapProps {
  chainId: number | string;
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
  isGasless: boolean;
  fusionQuote: FusionQuote | null;
  rangoQuote: any | null;
}

interface UseEvmSwapActions {
  fetchTokenList: () => void;
  updateTokenBalances: (sellToken?: TokenInfo) => Promise<void>;
  fetchQuote: (
    request: SwapQuoteRequest,
    sellAsset: TokenInfo,
    buyAsset: TokenInfo
  ) => Promise<SwapQuote>;

  fetchFusionQuote: (
    sellAsset: TokenInfo,
    buyAsset: TokenInfo,
    amount: string,
    decimals?: number
  ) => Promise<FusionQuote>;

  performSwap: (
    quote: SwapQuote,
    sellAsset: TokenInfo,
    buyAsset: TokenInfo,
    sellAmount: string,
    slippageTolerance: number
  ) => Promise<string>;

  performFusionSwap: (
    sellAsset: TokenInfo,
    buyAsset: TokenInfo,
    sellAmount: string,
    preset?: string,
    onProgress?: (step: 'approving' | 'signing') => void
  ) => Promise<string>;

  setGasless: (enabled: boolean) => void;
  fetchRangoQuote: (
    fromChainId: number | string,
    toChainId: number | string,
    sellAsset: TokenInfo,
    buyAsset: TokenInfo,
    amount: string,
    slippage?: string
  ) => Promise<any>;
  confirmRangoRoute: (
    requestId: string,
    fromChainId: number | string,
    toChainId: number | string,
    fromAddress: string,
    toAddress: string
  ) => Promise<any>;
  checkRangoApproval: (requestId: string, txId?: string) => Promise<any>;
  prepareRangoTx: (requestId: string, swapsIndex?: number) => Promise<any>;
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
    isGasless: false,
    fusionQuote: null,
    rangoQuote: null,
  });

  const activeSwapId = useRef<string | null>(null);
  const quoteAbortController = useRef<AbortController | null>(null);
  const rangoAbortController = useRef<AbortController | null>(null);
  const latestQuoteRequestId = useRef<number>(0);
  const isMounted = useRef<boolean>(true);
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      quoteAbortController.current?.abort();
      rangoAbortController.current?.abort();
    };
  }, []);

  const updateState = useCallback((updates: Partial<UseEvmSwapState>) => {
    if (!isMounted.current) return;
    setState(prev => ({ ...prev, ...updates }));
  }, []);

  const fetchTokenList = useCallback(() => {
    if (!chainId || !isEvmChain(chainId)) {
      updateState({
        error: 'Unsupported network for EVM swap',
        assets: [],
        isFetchingAssets: false,
      });
      return;
    }

    updateState({ isFetchingAssets: true, error: null });

    try {
      const tokens = getTokensForChain(chainId);
      if (!tokens.length) {
        updateState({
          error: 'No tokens available for this network',
          assets: [],
          isFetchingAssets: false,
        });
        return;
      }
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
    async (sellToken?: TokenInfo) => {
      if (!senderAddress || !chainId) return;

      const tokensToFetch = [sellToken].filter((t): t is TokenInfo => !!t);
      if (tokensToFetch.length === 0) return;

      try {
        const storeAssets = usePortfolioStore.getState().assets;
        let provider: any;
        try {
          provider = getProvider(WalletType.EVM);
        } catch {
          // No provider
        }

        const updates = await Promise.all(
          tokensToFetch.map(async (token) => {
            let bal = '0';

            if (provider) {
              try {
                const ethersProvider = new ethers.BrowserProvider(provider);
                bal = await fetchSingleTokenBalance(
                  senderAddress,
                  ethersProvider,
                  token.address,
                  !!token.isNative,
                  token.decimals
                );
                if (bal !== '0') return { address: token.address, balance: bal };
              } catch (err) {
                console.warn(`Provider balance fetch failed for ${token.symbol}:`, err);
              }
            }

            const storeAsset = storeAssets.find(a =>
              a.chainId === chainId &&
              a.symbol === token.symbol &&
              (token.isNative ? a.isNative : a.address?.toLowerCase() === token.address.toLowerCase())
            );

            if (storeAsset && storeAsset.balance !== null) {
              bal = storeAsset.balance.toString();
              if (bal !== '0') return { address: token.address, balance: bal };
            }

            try {
              const config = getEVMNetworkConfig(chainId);
              bal = await rpcManager.fetchWithFallback(
                chainId,
                config.rpcUrls,
                async (rpcProvider) => fetchSingleTokenBalance(
                  senderAddress,
                  rpcProvider,
                  token.address,
                  !!token.isNative,
                  token.decimals
                )
              );
            } catch (err) {
              console.error(`Final RPC fallback failed for ${token.symbol}:`, err);
            }

            return { address: token.address, balance: bal };
          })
        );

        if (!isMounted.current) return;

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
      } catch (err) {
        console.error('Balance update process failed:', err);
      }
    },
    [chainId, senderAddress, getProvider, updateState]
  );

  const fetchQuote = useCallback(
    async (
      request: SwapQuoteRequest,
      sellAsset: TokenInfo,
      buyAsset: TokenInfo
    ): Promise<SwapQuote> => {
      quoteAbortController.current?.abort();
      quoteAbortController.current = new AbortController();

      const requestId = ++latestQuoteRequestId.current;

      updateState({ quoteLoading: true, error: null, quote: null });

      try {
        if (!request.amount || parseFloat(request.amount) <= 0) {
          throw new Error('Invalid swap amount');
        }
        if (!sellAsset || !buyAsset) {
          throw new Error('Invalid assets selected');
        }
        if (sellAsset.address.toLowerCase() === buyAsset.address.toLowerCase()) {
          throw new Error('Cannot swap same token');
        }

        const adjustedRequest = {
          ...request,
          recipient: senderAddress,
        } as any;

        const quoteResponse = await fetchEvmQuote(chainId, adjustedRequest, sellAsset, buyAsset);
        if (requestId !== latestQuoteRequestId.current) {
          return Promise.reject(new Error('Quote request superseded'));
        }

        if (!quoteAbortController.current.signal.aborted) {
          updateState({ quote: quoteResponse, quoteLoading: false });
        }
        return quoteResponse;
      } catch (err: any) {
        if (err.name === 'AbortError' || quoteAbortController.current?.signal.aborted) {
          return Promise.reject(new Error('Quote request cancelled'));
        }

        if (err.message === 'Quote request superseded') {
          return Promise.reject(err);
        }

        const errorMsg = parseSwapError(err);
        updateState({ error: errorMsg, quoteLoading: false, quote: null });
        throw new Error(errorMsg);
      }
    },
    [chainId, senderAddress, updateState]
  );

  const fetchFusionQuote = useCallback(
    async (
      sellAsset: TokenInfo,
      buyAsset: TokenInfo,
      amount: string
    ): Promise<FusionQuote> => {
      // Cancel any in-flight normal quote so it can't overwrite state after fusion resolves
      quoteAbortController.current?.abort();
      quoteAbortController.current = new AbortController();
      latestQuoteRequestId.current++;

      updateState({ quoteLoading: true, error: null, quote: null });

      try {
        const fusionQuoteData = await fetch1InchFusionQuote(
          chainId,
          sellAsset.address,
          buyAsset.address,
          amount,
          senderAddress,
          sellAsset.decimals
        );

        updateState({ fusionQuote: fusionQuoteData, quoteLoading: false, error: null });
        return fusionQuoteData;
      } catch (err: any) {
        const errorMsg = parseSwapError(err);
        updateState({ error: errorMsg, quoteLoading: false });
        throw new Error(errorMsg);
      }
    },
    [chainId, senderAddress, updateState]
  );

  const performSwap = useCallback(
    async (
      quote: SwapQuote,
      sellAsset: TokenInfo,
      buyAsset: TokenInfo,
      sellAmount: string,
      slippageTolerance: number
    ): Promise<string> => {
      const swapId = Date.now().toString();
      activeSwapId.current = swapId;
      updateState({ loading: true, error: null, txHash: null });

      try {
        if (!quote) throw new Error('No quote available');
        if (!senderAddress) throw new Error('No wallet connected');

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

        const currentNetwork = useWalletStore.getState().network;

        addLocalTransaction({
          hash,
          chainId,
          type: 'swap',
          timestamp: Date.now(),
          description: `Swap ${sellAsset.symbol} \u2192 ${buyAsset.symbol}`,
          status: 'pending',
          from: senderAddress,
          network: currentNetwork,
        });

        if (activeSwapId.current === swapId) {
          activeSwapId.current = null;
          updateState({ txHash: hash, loading: false });
        }

        setTimeout(() => {
          if (isMounted.current) {
            updateTokenBalances(sellAsset);
          }
        }, 8000);

        return hash;
      } catch (err: any) {
        const errorMsg = parseSwapError(err);
        if (activeSwapId.current === swapId) {
          activeSwapId.current = null;
          updateState({ error: errorMsg, loading: false, txHash: null });
        }
        throw new Error(errorMsg);
      }
    },
    [chainId, senderAddress, getProvider, updateTokenBalances, updateState]
  );

  const performFusionSwap = useCallback(
    async (
      sellAsset: TokenInfo,
      buyAsset: TokenInfo,
      sellAmount: string,
      preset?: string,
      onProgress?: (step: 'approving' | 'signing') => void
    ): Promise<string> => {
      const swapId = Date.now().toString();
      activeSwapId.current = swapId;
      updateState({ loading: true, error: null, txHash: null });

      try {
        if (!state.fusionQuote) throw new Error('No fusion quote available');
        if (!senderAddress) throw new Error('No wallet connected');

        const hash = await execute1InchFusionSwap(
          chainId,
          state.fusionQuote,
          preset || 'fast',
          senderAddress,
          sellAsset,
          buyAsset,
          sellAmount,
          getProvider,
          onProgress
        );

        const currentNetwork = useWalletStore.getState().network;

        addLocalTransaction({
          hash,
          chainId,
          type: 'swap',
          timestamp: Date.now(),
          description: `Swap (Gasless) ${sellAsset.symbol} \u2192 ${buyAsset.symbol}`,
          status: 'pending',
          from: senderAddress,
          network: currentNetwork,
        });

        if (activeSwapId.current === swapId) {
          activeSwapId.current = null;
          updateState({ txHash: hash, loading: false });
        }

        setTimeout(() => {
          if (isMounted.current) {
            updateTokenBalances(sellAsset);
          }
        }, 8000);

        return hash;
      } catch (err: any) {
        const errorMsg = parseSwapError(err);
        if (activeSwapId.current === swapId) {
          activeSwapId.current = null;
          updateState({ error: errorMsg, loading: false, txHash: null });
        }
        throw new Error(errorMsg);
      }
    },
    [chainId, senderAddress, getProvider, updateTokenBalances, updateState, state.fusionQuote]
  );

  const reset = useCallback(() => {
    activeSwapId.current = null;
    latestQuoteRequestId.current++;
    quoteAbortController.current?.abort();
    rangoAbortController.current?.abort();
    updateState({
      quote: null,
      txHash: null,
      error: null,
      loading: false,
      quoteLoading: false,
      fusionQuote: null,
      rangoQuote: null,
    });
  }, [updateState]);

  const fetchRangoQuote = useCallback(
    async (
      fromChainId: number | string,
      toChainId: number | string,
      sellAsset: TokenInfo,
      buyAsset: TokenInfo,
      amount: string,
      slippage: string = "1.0"
    ): Promise<any> => {
      rangoAbortController.current?.abort();
      rangoAbortController.current = new AbortController();

      updateState({ quoteLoading: true, error: null, rangoQuote: null });

      try {
        const toChainTokens = getTokensForChain(toChainId);
        const toChainAsset = buyAsset.address
          ? toChainTokens.find((t: any) => t.address.toLowerCase() === buyAsset.address.toLowerCase())
          : toChainTokens.find((t: any) => t.symbol.toUpperCase() === buyAsset.symbol.toUpperCase());

        const fromAddress = sellAsset.address || null;
        const toAddress = toChainAsset?.address || buyAsset.address || null;

        const rangoData = await fetchRangoBestRoute(
          fromChainId,
          sellAsset.symbol,
          fromAddress,
          toChainId,
          buyAsset.symbol,
          toAddress,
          amount,
          slippage
        );

        if (rangoAbortController.current.signal.aborted) {
          throw new Error('Quote request cancelled');
        }

        if ((!rangoData.result || (Array.isArray(rangoData.result) && rangoData.result.length === 0)) && rangoData.diagnosisMessages) {
          throw rangoData;
        }

        updateState({ rangoQuote: rangoData, quoteLoading: false });
        return rangoData;
      } catch (err: any) {
        if (err?.message === 'Quote request cancelled' || rangoAbortController.current?.signal.aborted) {
          // Silent return for cancelled requests
          return;
        }
        const errorMsg = parseSwapError(err);
        updateState({ error: errorMsg, quoteLoading: false, rangoQuote: null });
        throw new Error(errorMsg);
      }
    },
    [updateState]
  );


  const confirmRangoRoute = useCallback(
    async (
      requestId: string,
      fromChainId: number | string,
      toChainId: number | string,
      fromAddress: string,
      toAddress: string
    ): Promise<any> => {
      updateState({ loading: true, error: null });

      try {
        const result = await fetchRangoConfirmRoute(
          requestId,
          fromChainId,
          toChainId,
          fromAddress,
          toAddress
        );

        updateState({ loading: false });
        return result;
      } catch (err: any) {
        const errorMsg = parseSwapError(err);
        updateState({ error: errorMsg, loading: false });
        throw new Error(errorMsg);
      }
    },
    [updateState]
  );

  const checkRangoApprovalAction = useCallback(
    async (requestId: string, txId: string = ""): Promise<any> => {
      try {
        return await fetchRangoCheckApproval(requestId, txId);
      } catch (err: any) {
        const errorMsg = parseSwapError(err);
        throw new Error(errorMsg);
      }
    },
    []
  );

  const prepareRangoTxAction = useCallback(
    async (requestId: string, swapsIndex: number = 1): Promise<any> => {
      try {
        return await fetchRangoPrepareTx(requestId, swapsIndex);
      } catch (err: any) {
        const errorMsg = parseSwapError(err);
        throw new Error(errorMsg);
      }
    },
    []
  );

  const setGasless = useCallback((enabled: boolean) => {
    updateState({ isGasless: enabled });
  }, [updateState]);

  return {
    ...state,
    fetchTokenList,
    updateTokenBalances,
    fetchQuote,
    fetchFusionQuote,
    performSwap,
    performFusionSwap,
    fetchRangoQuote,
    confirmRangoRoute,
    checkRangoApproval: checkRangoApprovalAction,
    prepareRangoTx: prepareRangoTxAction,
    setGasless,
    reset,
  };
};