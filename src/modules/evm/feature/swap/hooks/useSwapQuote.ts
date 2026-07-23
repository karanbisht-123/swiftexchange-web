import { useCallback, useEffect, useRef, useState } from 'react';

import { ChainSymbol } from '@allbridge/bridge-core-sdk';
import { ethers } from 'ethers';

import { getChainById } from '../../../utils/Chainregistry';
import { getEvmChainId } from '../hooks/useNearIntentCrossChain';
import {
  fetchNearIntentTokens,
  getNearIntentQuote,
  isStellarBlockchain,
} from '../services/oneClickApi';
import type { ActiveQuote } from '../types/swap.types';
import { isStellar } from '../utils/swapAssetUtils';
import { parseSwapError } from '../utils/swapErrorHandler';

export interface UseSwapQuoteParams {
  sellAmount: string;
  isChainSwitching: boolean;
  showFusionScreen: boolean;
  actionType: 'SWAP' | 'BRIDGE';
  fromChainId: number | string;
  toChainId: number | string;
  ammService: any;
  selectedSellAsset: any;
  selectedBuyAsset: any;
  userSlippageTolerance: number;
  sellAssetSymbol: string;
  buyAssetSymbol: string;
  fromChainConfig: any;
  toChainConfig: any;
  fetchSwapQuoteInternal: (request: any, sellAsset: any, buyAsset: any) => Promise<any>;
  fetchFusionQuote: (sellAsset: any, buyAsset: any, amount: string) => Promise<any>;
  getEvmBridgeQuote: (
    fromChainId: any,
    toChainId: any,
    amount: string,
    sellSymbol: string,
    buySymbol: string
  ) => Promise<any>;
  getStellarBridgeQuote: (params: any) => Promise<any>;
  getSupportedTokens: () => Promise<any[]>;
  setFeePayType: (type: 'native' | 'stablecoin') => void;
  setCrossChainWarning: (warning: string | null) => void;
  setBridgeErrorMsg: (msg: string | null) => void;
  resetSwap: () => void;
  swapError: any;
  bridgeTxStatus: string;
  swapQuoteLoading: boolean;
  isSameAssetSelected: boolean;
  evmAddress?: string;
  stellarAddress?: string;
}

export function useSwapQuote(params: UseSwapQuoteParams) {
  const {
    sellAmount,
    isChainSwitching,
    showFusionScreen,
    actionType,
    fromChainId,
    toChainId,
    ammService,
    selectedSellAsset,
    selectedBuyAsset,
    userSlippageTolerance,
    sellAssetSymbol,
    buyAssetSymbol,
    fromChainConfig,
    toChainConfig,
    fetchSwapQuoteInternal,
    fetchFusionQuote,
    getEvmBridgeQuote,
    getStellarBridgeQuote,
    getSupportedTokens,
    setFeePayType,
    setCrossChainWarning,
    setBridgeErrorMsg,
    resetSwap,
    // swapError,
    bridgeTxStatus,
    swapQuoteLoading,
    isSameAssetSelected,
    evmAddress,
    stellarAddress,
  } = params;

  const [activeQuote, setActiveQuote] = useState<ActiveQuote>({
    source: null,
    data: null,
    error: null,
    loading: false,
  });
  const [timeLeft, setTimeToNextRefresh] = useState(30);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const latestRequestId = useRef(0);

  const getUsdValue = useCallback((amount: string, asset: any): number | null => {
    if (!amount || !asset) return null;
    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed <= 0) return null;
    const price = parseFloat(asset.price || asset.priceUSD || '0');
    if (price > 0) return parsed * price;
    return null;
  }, []);

  const isBridgeSupported = useCallback((symbol: string, chainId: number | string): boolean => {
    const chainConfig = getChainById(chainId);
    if (!chainConfig?.bridgeSupportTokens?.length) return false;
    return chainConfig.bridgeSupportTokens.some(
      (t: any) => t.symbol.toUpperCase() === symbol.toUpperCase()
    );
  }, []);

  const fetchUnifiedQuote = useCallback(async () => {
    if (!sellAmount || parseFloat(sellAmount) <= 0 || isChainSwitching || showFusionScreen) {
      setActiveQuote({ source: null, data: null, error: null, loading: false });
      return;
    }

    const requestId = ++latestRequestId.current;
    setCrossChainWarning(null);
    setBridgeErrorMsg(null);

    if (actionType === 'SWAP') {
      if (isStellar(fromChainId) && ammService) {
        if (!selectedSellAsset || !selectedBuyAsset) return;
        try {
          const fromAsset = (selectedSellAsset as any).asset;
          const toAsset = (selectedBuyAsset as any).asset;
          if (!fromAsset || !toAsset) return;

          setActiveQuote({ source: 'stellar', data: null, error: null, loading: true });
          const sq = await ammService.getSwapQuote(fromAsset, toAsset, sellAmount, {
            slippageTolerance: userSlippageTolerance,
          });

          if (requestId !== latestRequestId.current) return;

          setActiveQuote({ source: 'stellar', data: sq, error: null, loading: false });
        } catch (err) {
          if (requestId !== latestRequestId.current) return;
          console.error('Stellar quote error:', err);
          setActiveQuote({
            source: 'stellar',
            data: null,
            error: parseSwapError(err),
            loading: false,
          });
        }
      } else {
        if (
          !selectedSellAsset ||
          !selectedBuyAsset ||
          selectedSellAsset.address?.toLowerCase() === selectedBuyAsset.address?.toLowerCase()
        )
          return;
        try {
          const quoteRequest = {
            tokenIn: {
              symbol: selectedSellAsset.symbol,
              name: selectedSellAsset.symbol,
              decimals: (selectedSellAsset as any).decimals || 18,
              address: selectedSellAsset.address || '',
              balance: (selectedSellAsset as any).balance || '0',
              logoUri: null,
              chainId: fromChainId,
            },
            tokenOut: {
              symbol: selectedBuyAsset.symbol,
              name: selectedBuyAsset.symbol,
              decimals: (selectedBuyAsset as any).decimals || 18,
              address: selectedBuyAsset.address || '',
              balance: (selectedBuyAsset as any).balance || '0',
              logoUri: null,
              chainId: toChainId,
            },
            amount: sellAmount,
          };
          setActiveQuote(prev => ({ ...prev, source: 'swap', loading: false }));
          await fetchSwapQuoteInternal(
            quoteRequest,
            selectedSellAsset as any,
            selectedBuyAsset as any
          );
        } catch (err: any) {
          if (requestId !== latestRequestId.current) return;
          if (
            err?.message === 'Quote request cancelled' ||
            err?.message === 'Quote request superseded'
          )
            return;
          console.error('Swap quote error:', err);
        }
      }
    } else {
      if (!selectedSellAsset || !selectedBuyAsset) return;

      const createNearIntentPromise = async () => {
        try {
          const nearTokens = await fetchNearIntentTokens();
          const findNearToken = (symbol: string, cId: number | string) => {
            if (!symbol) return undefined;
            return nearTokens.find(t => {
              if (t.symbol.toUpperCase() !== symbol.toUpperCase()) return false;
              const tChainId = isStellarBlockchain(t.blockchain) ? 'stellar' : getEvmChainId(t);
              return String(tChainId) === String(isStellar(cId) ? 'stellar' : cId);
            });
          };

          const nearSellAsset = findNearToken(sellAssetSymbol, fromChainId);
          const nearBuyAsset = findNearToken(buyAssetSymbol, toChainId);

          if (nearSellAsset && nearBuyAsset) {
            const isStellarOrigin = isStellarBlockchain(nearSellAsset.blockchain);
            const isStellarDest = isStellarBlockchain(nearBuyAsset.blockchain);
            const recipient = isStellarDest ? stellarAddress : evmAddress;
            const refundTo = isStellarOrigin ? stellarAddress : evmAddress;

            if (recipient && refundTo) {
              const quotePayload = {
                dry: false,
                depositMode: (isStellarOrigin ? 'MEMO' : 'SIMPLE') as 'MEMO' | 'SIMPLE',
                swapType: 'EXACT_INPUT' as const,
                slippageTolerance: userSlippageTolerance * 100,
                originAsset: nearSellAsset.assetId,
                depositType: 'ORIGIN_CHAIN',
                destinationAsset: nearBuyAsset.assetId,
                amount: ethers.parseUnits(sellAmount, nearSellAsset.decimals).toString(),
                recipient: recipient as string,
                recipientType: 'DESTINATION_CHAIN' as const,
                refundTo: refundTo as string,
                refundType: 'ORIGIN_CHAIN',
                deadline: new Date(Date.now() + 1200000).toISOString(),
              };

              return await getNearIntentQuote(quotePayload).then(res => res.quote);
            }
          }
          return { error: 'Pair not supported by NEAR Intents' };
        } catch (err: any) {
          console.warn('Failed to setup NEAR intents quote', err);
          return { error: err.message || 'Intents setup failed' };
        }
      };

      const isFromStellar = isStellar(fromChainId);
      const isToStellar = isStellar(toChainId);

      const fromBridgeSupported = isBridgeSupported(sellAssetSymbol, fromChainId);
      const toBridgeSupported = isBridgeSupported(buyAssetSymbol, toChainId);
      const bothBridgeSupported = fromBridgeSupported && toBridgeSupported;

      const usdValue = getUsdValue(sellAmount, selectedSellAsset);
      const isBelow2Usd = usdValue !== null && usdValue < 2;
      const shouldUseBridge = isToStellar || (bothBridgeSupported && isBelow2Usd);

      setActiveQuote({
        source: isFromStellar || shouldUseBridge ? 'bridge' : 'fusion_plus',
        data: null,
        error: null,
        loading: true,
      });
      setCrossChainWarning(null);

      try {
        if (isFromStellar) {
          const tokens = await getSupportedTokens();
          const fromChainSym = ChainSymbol.SRB;
          const toChainSym = toChainConfig?.nativeCurrency.symbol;

          const src = tokens.find(
            t =>
              t.chainSymbol === fromChainSym &&
              t.symbol.toUpperCase() === sellAssetSymbol.toUpperCase()
          );
          const dst = tokens.find(
            t =>
              t.chainSymbol === toChainSym &&
              t.symbol.toUpperCase() === buyAssetSymbol.toUpperCase()
          );

          let allbridgePromise: Promise<any>;
          if (src && dst) {
            allbridgePromise = getStellarBridgeQuote({
              amount: sellAmount,
              sourceToken: src,
              destinationToken: dst,
              slippageTolerance: userSlippageTolerance,
            }).catch(err => ({ error: err.message || 'Bridge quote failed' }));
          } else {
            allbridgePromise = Promise.resolve({ error: 'Pair not supported by Allbridge' });
          }

          const intentsPromise = createNearIntentPromise();

          const [abRes, inRes] = await Promise.allSettled([allbridgePromise, intentsPromise]);

          if (requestId !== latestRequestId.current) return;

          const abQ =
            abRes.status === 'fulfilled' && !(abRes.value as any)?.error ? abRes.value : null;
          const inQ =
            inRes.status === 'fulfilled' && !(inRes.value as any)?.error ? inRes.value : null;

          if (!abQ && !inQ) {
            throw new Error('Tokens not supported by bridge');
          }

          // Bridge (Allbridge) is always the default route.
          // NEAR Intents, if available and supported, is offered as an alternative toggle.
          if (abQ) {
            if (!abQ.feeOptions?.stablecoin) {
              setFeePayType('native');
            }
            setActiveQuote({
              source: 'bridge',
              loading: false,
              error: null,
              data: {
                ...abQ,
                minimumAmountOut: abQ.amountToBeReceived,
                conversionRate: abQ.exchangeRate,
                completionTime: abQ.transferTimeMs,
                fee: {
                  native: {
                    amount: abQ.feeOptions.native.float,
                    symbol: fromChainConfig?.nativeCurrency.symbol,
                  },
                  stablecoin: abQ.feeOptions.stablecoin
                    ? { amount: abQ.feeOptions.stablecoin.float, symbol: 'USDC' }
                    : null,
                },
              },
              ...(inQ ? { alternativeQuote: { source: 'near_intent', data: inQ } } : {}),
            });
          } else if (inQ) {
            // Allbridge failed but NEAR Intents is available — use it as only route
            setActiveQuote({ source: 'near_intent', data: inQ, error: null, loading: false });
          }
        } else if (shouldUseBridge) {
          const bdgPromise = getEvmBridgeQuote(
            fromChainId,
            toChainId,
            sellAmount,
            sellAssetSymbol,
            buyAssetSymbol
          )
            .then(res => {
              if (
                !res ||
                (Array.isArray(res) && res.length === 0) ||
                (typeof res === 'object' && !res.minimumAmountOut && !res.quotes)
              ) {
                throw new Error('Bridge quotes empty');
              }
              return res;
            })
            .catch(err => ({ error: err.message || 'Bridge quote failed' }));

          const intentsPromise = createNearIntentPromise();

          const [bdgRes, inRes] = await Promise.allSettled([bdgPromise, intentsPromise]);

          if (requestId !== latestRequestId.current) return;

          const bdgQ =
            bdgRes.status === 'fulfilled' && !(bdgRes.value as any)?.error ? bdgRes.value : null;
          const inQ =
            inRes.status === 'fulfilled' && !(inRes.value as any)?.error ? inRes.value : null;

          if (!bdgQ && !inQ) {
            throw new Error('Bridge quotes empty');
          }

          // Bridge is always the default. NEAR Intents is the alternative toggle.
          if (bdgQ) {
            if (bdgQ.fee && !bdgQ.fee.stablecoin) {
              setFeePayType('native');
            }
            setActiveQuote({
              source: 'bridge',
              data: bdgQ,
              error: null,
              loading: false,
              ...(inQ ? { alternativeQuote: { source: 'near_intent', data: inQ } } : {}),
            });
          } else if (inQ) {
            // Bridge failed but NEAR Intents is available — fallback
            setActiveQuote({ source: 'near_intent', data: inQ, error: null, loading: false });
          }
        } else {
          // Fetch Fusion and NEAR Intents in parallel for EVM to EVM
          const fusionPromise = fetchFusionQuote(
            selectedSellAsset as any,
            selectedBuyAsset as any,
            sellAmount
          ).catch((err: any) => {
            if (
              err?.message === 'Quote request cancelled' ||
              err?.message === 'Quote request superseded'
            ) {
              throw err;
            }
            return { error: err.message || 'Fusion quote failed' };
          });

          const intentsPromise = createNearIntentPromise();

          const [fusionResult, intentsResult] = await Promise.allSettled([
            fusionPromise,
            intentsPromise,
          ]);

          if (requestId !== latestRequestId.current) return;

          const fusionQuote =
            fusionResult.status === 'fulfilled' && !(fusionResult.value as any)?.error
              ? fusionResult.value
              : null;
          const intentsQuote =
            intentsResult.status === 'fulfilled' && !(intentsResult.value as any)?.error
              ? intentsResult.value
              : null;

          if (!fusionQuote && !intentsQuote) {
            throw new Error('Pair not supported by available routes.');
          }

          if (fusionQuote && intentsQuote) {
            const fusionOut =
              parseFloat((fusionQuote as any).dstTokenAmount || '0') /
              10 ** (selectedBuyAsset as any).decimals;
            const intentsOut = parseFloat((intentsQuote as any).amountOutFormatted || '0');
            if (intentsOut > fusionOut) {
              setActiveQuote({
                source: 'fusion_plus',
                data: fusionQuote,
                error: null,
                loading: false,
                alternativeQuote: {
                  source: 'near_intent',
                  data: intentsQuote,
                },
              });
            } else {
              setActiveQuote({
                source: 'fusion_plus',
                data: fusionQuote,
                error: null,
                loading: false,
              });
            }
          } else if (fusionQuote) {
            setActiveQuote({
              source: 'fusion_plus',
              data: fusionQuote,
              error: null,
              loading: false,
            });
          } else if (intentsQuote) {
            setActiveQuote({
              source: 'near_intent',
              data: intentsQuote,
              error: null,
              loading: false,
            });
          }
        }
      } catch (err: any) {
        if (requestId !== latestRequestId.current) return;
        if (
          err?.message === 'Quote request cancelled' ||
          err?.message === 'Quote request superseded'
        )
          return;
        console.error('Cross-chain quote error:', err);
        setCrossChainWarning(parseSwapError(err));
        setActiveQuote({
          source: shouldUseBridge || isFromStellar ? 'bridge' : null,
          data: null,
          error: parseSwapError(err),
          loading: false,
        });
      }
    }
  }, [
    actionType,
    fromChainId,
    toChainId,
    selectedSellAsset,
    selectedBuyAsset,
    sellAmount,
    sellAssetSymbol,
    buyAssetSymbol,
    fetchSwapQuoteInternal,
    isChainSwitching,
    fromChainConfig,
    toChainConfig,
    userSlippageTolerance,
    showFusionScreen,
    isBridgeSupported,
    getUsdValue,
    ammService,
    fetchFusionQuote,
  ]);

  const isQuoteLoading = !!(activeQuote.loading || swapQuoteLoading || isRefreshing);

  useEffect(() => {
    setTimeToNextRefresh(30);
    resetSwap();
  }, [fromChainId, toChainId, sellAssetSymbol, buyAssetSymbol, resetSwap]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      fetchUnifiedQuote();
    }, 800);
    return () => clearTimeout(timeoutId);
  }, [fetchUnifiedQuote]);

  useEffect(() => {
    let timer: NodeJS.Timeout;

    const shouldPauseTimer =
      isChainSwitching ||
      showFusionScreen ||
      isSameAssetSelected ||
      isQuoteLoading ||
      (bridgeTxStatus && bridgeTxStatus !== 'idle');

    if (sellAmount && parseFloat(sellAmount) > 0 && !shouldPauseTimer) {
      timer = setInterval(() => {
        setTimeToNextRefresh(prev => {
          if (prev <= 1) {
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (isQuoteLoading) {
        setTimeToNextRefresh(30);
      } else if (!shouldPauseTimer) {
        setTimeToNextRefresh(30);
      }
    }

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [
    sellAmount,
    isChainSwitching,
    showFusionScreen,
    isSameAssetSelected,
    isQuoteLoading,
    bridgeTxStatus,
  ]);

  useEffect(() => {
    if (timeLeft <= 0) {
      setTimeToNextRefresh(30);
      fetchUnifiedQuote();
    }
  }, [timeLeft, fetchUnifiedQuote]);

  return {
    activeQuote,
    setActiveQuote,
    timeLeft,
    setTimeToNextRefresh,
    isRefreshing,
    setIsRefreshing,
    isQuoteLoading,
    fetchUnifiedQuote,
  };
}
