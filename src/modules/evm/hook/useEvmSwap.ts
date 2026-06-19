import { useCallback, useEffect, useRef, useState } from 'react';

import { ethers } from 'ethers';

import type { FusionQuote, SwapQuote, SwapQuoteRequest } from '../../../types/evm/swap.types';
import { WalletType } from '../../walletconnect/constants/Wallet';
import { usePortfolioStore } from '../../walletconnect/store/portfolioStore';
import { useWalletStore } from '../../walletconnect/store/walletConnectStore';
import { storeSwapOrder } from '../service/evmTransactionStatusService';
import { addLocalTransaction } from '../service/localTransactionService';
import {
  type TokenInfo,
  fetchSingleTokenBalance,
  getTokensForChain,
} from '../service/tokenListService';
import { getChainById, isEvmChain } from '../utils/Chainregistry';
import {
  execute1InchFusionSwap,
  executeSwap,
  fetch1InchFusionQuote,
  fetchEvmQuote,
} from '../utils/evmSwapUtils';
import { getEVMNetworkConfig } from '../utils/evmUtils';
import { rpcManager } from '../utils/rpcProvider';
import { parseSwapError } from '../utils/swapErrorHandler';

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

  userSlippageTolerance: number;
  recommendedSlippage: string | null;
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
    slippageTolerance: number,
    onBeforeSign?: () => void
  ) => Promise<string>;

  performFusionSwap: (
    sellAsset: TokenInfo,
    buyAsset: TokenInfo,
    sellAmount: string,
    preset?: string,
    onProgress?: (step: 'approving' | 'signing') => void,
    currentFusionQuote?: FusionQuote | null,
    onBeforeSign?: () => void
  ) => Promise<string>;

  setGasless: (enabled: boolean) => void;

  setUserSlippageTolerance: (slippage: number) => void;
  setRecommendedSlippage: (slippage: string | null) => void;
  reset: () => void;
}

export function toPlainString(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return '0';
  const num = typeof val === 'number' ? val : Number.parseFloat(val);
  if (Number.isNaN(num)) return '0';
  const str = String(val);
  if (!str.includes('e') && !str.includes('E')) {
    return str;
  }
  const match = new RegExp(/[eE]([-+]?\d+)/).exec(str);
  if (!match) return str;
  const exp = Math.abs(Number.parseInt(match[1], 10));
  return num.toFixed(Math.max(20, exp)).replace(/\.?0+$/, '');
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

    userSlippageTolerance: 1.0,
    recommendedSlippage: null,
  });

  const activeSwapId = useRef<string | null>(null);
  const quoteAbortController = useRef<AbortController | null>(null);

  const latestQuoteRequestId = useRef<number>(0);
  const isMounted = useRef<boolean>(true);
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      quoteAbortController.current?.abort();
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

      const storeAssets = usePortfolioStore.getState().assets;
      const tokensWithBalances = tokens.map(token => {
        const storeAsset = storeAssets.find(
          a =>
            a.chainId === chainId &&
            a.symbol === token.symbol &&
            (token.isNative
              ? a.isNative
              : (a.address || '').toLowerCase() === (token.address || '').toLowerCase())
        );
        return {
          ...token,
          balance:
            storeAsset && storeAsset.balance !== null
              ? toPlainString(storeAsset.balance)
              : undefined,
        };
      });

      updateState({ assets: tokensWithBalances, isFetchingAssets: false });
    } catch (err) {
      console.error('Failed to load token list:', err);
      updateState({
        error: 'Failed to load token list',
        assets: [],
        isFetchingAssets: false,
      });
    }
  }, [chainId, updateState]);

  useEffect(() => {
    const handleAssetsRegistered = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && String(detail.chainId) === String(chainId)) {
        fetchTokenList();
      }
    };

    globalThis.addEventListener('dynamic_assets_registered', handleAssetsRegistered);
    return () => {
      globalThis.removeEventListener('dynamic_assets_registered', handleAssetsRegistered);
    };
  }, [chainId, fetchTokenList]);

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
        } catch (error) {
          console.log('No provider', error);
        }

        const updates = await Promise.all(
          tokensToFetch.map(async token => {
            let bal = '0';

            if (provider) {
              try {
                const ethersProvider = new ethers.BrowserProvider(provider);
                const network = await ethersProvider.getNetwork();
                if (Number(network.chainId) === Number(chainId)) {
                  bal = await fetchSingleTokenBalance(
                    senderAddress,
                    ethersProvider,
                    token.address,
                    !!token.isNative,
                    token.decimals
                  );
                  if (bal !== '0') return { address: token.address, balance: bal };
                }
              } catch (err) {
                console.warn(`Provider balance fetch failed for ${token.symbol}:`, err);
              }
            }

            const storeAsset = storeAssets.find(
              a =>
                a.chainId === chainId &&
                a.symbol === token.symbol &&
                (token.isNative
                  ? a.isNative
                  : (a.address || '').toLowerCase() === (token.address || '').toLowerCase())
            );

            if (storeAsset && storeAsset.balance !== null) {
              bal = toPlainString(storeAsset.balance);
              if (bal !== '0') return { address: token.address, balance: bal };
            }

            try {
              const config = getEVMNetworkConfig(chainId);
              bal = await rpcManager.fetchWithFallback(chainId, config.rpcUrls, async rpcProvider =>
                fetchSingleTokenBalance(
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
      console.log(request, '+++++++++++++++++++++++++++');

      // Cancel any previous quote and create a new AbortController
      quoteAbortController.current?.abort();
      quoteAbortController.current = new AbortController();
      const signal = quoteAbortController.current.signal;

      const requestId = ++latestQuoteRequestId.current;

      updateState({ quoteLoading: true, error: null });

      try {
        if (!request.amount || Number.parseFloat(request.amount) <= 0) {
          throw new Error('Invalid swap amount');
        }
        if (!sellAsset || !buyAsset) {
          throw new Error('Invalid assets selected');
        }
        const bothNative = !!sellAsset.isNative && !!buyAsset.isNative;
        const addrA = (sellAsset.address || '').toLowerCase();
        const addrB = (buyAsset.address || '').toLowerCase();
        if (sellAsset.chainId === buyAsset.chainId && (bothNative || (addrA && addrA === addrB))) {
          throw new Error('Cannot swap same token');
        }

        const adjustedRequest: SwapQuoteRequest = {
          ...request,
          recipient: senderAddress,
          slippage: state.userSlippageTolerance.toString(),
        };

        // For routes, fetch quote directly
        const quoteResponse = await fetchEvmQuote(
          chainId,
          adjustedRequest,
          sellAsset,
          buyAsset,
          signal
        );

        if (requestId !== latestQuoteRequestId.current) {
          throw new Error('Quote request superseded');
        }

        if (!signal.aborted) {
          updateState({
            quote: quoteResponse,
            quoteLoading: false,
          });
        }
        return quoteResponse;
      } catch (err: any) {
        if (err.name === 'AbortError' || signal.aborted) {
          throw new Error('Quote request cancelled');
        }

        if (err.message === 'Quote request superseded') {
          throw err;
        }

        const errorMsg = parseSwapError(err);
        updateState({ error: errorMsg, quoteLoading: false, quote: null });
        throw new Error(errorMsg);
      }
    },
    [chainId, senderAddress, updateState, state.userSlippageTolerance]
  );

  const fetchFusionQuote = useCallback(
    async (sellAsset: TokenInfo, buyAsset: TokenInfo, amount: string): Promise<FusionQuote> => {
      // Fusion quote: use AbortController + stale-request guard
      quoteAbortController.current?.abort();
      quoteAbortController.current = new AbortController();
      const fusionSignal = quoteAbortController.current.signal;
      const myRequestId = ++latestQuoteRequestId.current;

      updateState({ quoteLoading: true, error: null });

      try {
        const fusionQuoteData = await fetch1InchFusionQuote(
          chainId,
          sellAsset.address,
          buyAsset.address,
          amount,
          senderAddress,
          sellAsset.decimals,
          buyAsset.chainId,
          fusionSignal
        );

        // Only accept result if this is the latest request
        if (myRequestId !== latestQuoteRequestId.current || fusionSignal.aborted) {
          throw new Error('Quote request superseded');
        }

        updateState({ fusionQuote: fusionQuoteData, quoteLoading: false, error: null });
        return fusionQuoteData;
      } catch (err: any) {
        if (err.name === 'AbortError' || fusionSignal.aborted) {
          throw new Error('Quote request cancelled');
        }
        const errorMsg = parseSwapError(err);
        updateState({ error: errorMsg, quoteLoading: false, fusionQuote: null });
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
      slippageTolerance: number,
      onBeforeSign?: () => void
    ): Promise<string> => {
      const swapId = Date.now().toString();
      activeSwapId.current = swapId;
      updateState({ loading: true, error: null, txHash: null });

      console.log(quote, '----------------- 987654321');
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
          getProvider,
          approvalHash => {
            storeSwapOrder({
              txHash: approvalHash,
              walletAddress: senderAddress,
              provider: 'EVMTX',
              fromChain: getChainById(chainId)?.symbol || '',
              fromToken: sellAsset.symbol,
              toChain: getChainById(buyAsset.chainId || chainId)?.symbol || '',
              toToken: buyAsset.symbol,
              amountIn: sellAmount,
              amountOut: quote.outputAmount,
              txType: 'Token Approval',
            } as any).catch(err =>
              console.error('Failed to store swap approval order on backend:', err)
            );
          },
          swapHash => {
            if (
              quote.provider === 'ONEINCH' ||
              quote.provider === 'UNISWAP' ||
              quote.provider === 'ALLBRIDGE'
            ) {
              storeSwapOrder({
                txHash: swapHash,
                walletAddress: senderAddress,
                provider: quote.provider,
                fromChain: getChainById(chainId)?.symbol || '',
                fromToken: sellAsset.symbol,
                toChain: getChainById(buyAsset.chainId || chainId)?.symbol || '',
                toToken: buyAsset.symbol,
                amountIn: sellAmount,
                amountOut: quote.outputAmount,
                txType: quote.provider === 'ALLBRIDGE' ? 'Bridge' : 'Swap',
              } as any).catch(err => console.error('Failed to store swap order on backend:', err));
            } else if (chainId !== 'pubnet' && chainId !== 'testnet' && chainId !== 'stellar') {
              addLocalTransaction({
                hash: swapHash,
                chainId,
                type: 'swap',
                timestamp: Date.now(),
                description: `Swap ${sellAsset.symbol} → ${buyAsset.symbol}`,
                status: 'pending',
                from: senderAddress,
                network: useWalletStore.getState().network,
              });
            }
          },
          onBeforeSign
        );

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
      onProgress?: (step: 'approving' | 'signing') => void,
      currentFusionQuote?: typeof state.fusionQuote,
      onBeforeSign?: () => void
    ): Promise<string> => {
      const fusionQuote = currentFusionQuote ?? state.fusionQuote;
      const swapId = Date.now().toString();
      activeSwapId.current = swapId;
      updateState({ loading: true, error: null, txHash: null });

      try {
        if (!fusionQuote) throw new Error('No fusion quote available');
        if (!senderAddress) throw new Error('No wallet connected');

        const hash = await execute1InchFusionSwap(
          chainId,
          fusionQuote,
          preset || 'fast',
          senderAddress,
          sellAsset,
          buyAsset,
          sellAmount,
          getProvider,
          onProgress,
          approvalHash => {
            storeSwapOrder({
              txHash: approvalHash,
              walletAddress: senderAddress,
              provider: 'EVMTX',
              fromChain: getChainById(chainId)?.symbol,
              fromToken: sellAsset.symbol,
              toChain: getChainById(buyAsset.chainId || chainId)?.symbol,
              toToken: buyAsset.symbol,
              quoteId: fusionQuote.quoteId,
              amountIn: sellAmount,
              amountOut:
                fusionQuote.toTokenAmount || fusionQuote.dstTokenAmount
                  ? ethers.formatUnits(
                      fusionQuote.toTokenAmount || fusionQuote.dstTokenAmount || '0',
                      buyAsset.decimals || 18
                    )
                  : '0',
              txType: 'Token Approval',
            } as any).catch(backendErr =>
              console.error('Failed to store fusion swap approval order on backend:', backendErr)
            );
          },
          onBeforeSign
        );

        // 1Inch Fusion swaps always go to backend
        const isCrossChain = String(chainId) !== String(buyAsset.chainId || chainId);
        try {
          await storeSwapOrder({
            txHash: hash,
            walletAddress: senderAddress,
            provider: isCrossChain ? 'ONEINCH_FUSION_PLUS' : 'ONEINCH_FUSION',
            fromChain: getChainById(chainId)?.symbol,
            fromToken: sellAsset.symbol,
            toChain: getChainById(buyAsset.chainId || chainId)?.symbol,
            toToken: buyAsset.symbol,
            quoteId: fusionQuote.quoteId,
            amountIn: sellAmount,
            amountOut:
              fusionQuote.toTokenAmount || fusionQuote.dstTokenAmount
                ? ethers.formatUnits(
                    fusionQuote.toTokenAmount || fusionQuote.dstTokenAmount || '0',
                    buyAsset.decimals || 18
                  )
                : '0',
            txType: 'Swap',
          } as any);
        } catch (backendErr) {
          console.error('Failed to store fusion swap order on backend:', backendErr);
        }

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

    updateState({
      quote: null,
      txHash: null,
      error: null,
      loading: false,
      quoteLoading: false,
      fusionQuote: null,
    });
  }, [updateState]);

  const setGasless = useCallback(
    (enabled: boolean) => {
      updateState({ isGasless: enabled });
    },
    [updateState]
  );

  const setUserSlippageTolerance = useCallback(
    (slippage: number) => {
      updateState({ userSlippageTolerance: slippage });
    },
    [updateState]
  );

  const setRecommendedSlippage = useCallback(
    (slippage: string | null) => {
      updateState({ recommendedSlippage: slippage });
    },
    [updateState]
  );

  return {
    ...state,
    fetchTokenList,
    updateTokenBalances,
    fetchQuote,
    fetchFusionQuote,
    performSwap,
    performFusionSwap,

    setGasless,
    setUserSlippageTolerance,
    setRecommendedSlippage,
    reset,
  };
};
