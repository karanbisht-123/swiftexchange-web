import { useState, useEffect, useCallback, useRef } from 'react';
import type { ActiveQuote } from '../types/swap.types';
import { isStellar } from '../utils/swapAssetUtils';
import { parseSwapError } from '../utils/swapErrorHandler';
import { getChainById } from '../../../utils/Chainregistry';
import { ChainSymbol } from '@allbridge/bridge-core-sdk';

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
  getEvmBridgeQuote: (fromChainId: any, toChainId: any, amount: string, sellSymbol: string, buySymbol: string) => Promise<any>;
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
    swapError,
    bridgeTxStatus,
    swapQuoteLoading,
    isSameAssetSelected,
  } = params;

  const [activeQuote, setActiveQuote] = useState<ActiveQuote>({ source: null, data: null, error: null, loading: false });
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
    return chainConfig.bridgeSupportTokens.some((t: any) => t.symbol.toUpperCase() === symbol.toUpperCase());
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
          const sq = await ammService.getSwapQuote(fromAsset, toAsset, sellAmount, { slippageTolerance: userSlippageTolerance });

          if (requestId !== latestRequestId.current) return;
          console.log(sq, "=================")
          setActiveQuote({ source: 'stellar', data: sq, error: null, loading: false });
        } catch (err) {
          if (requestId !== latestRequestId.current) return;
          console.error('Stellar quote error:', err);
          setActiveQuote({ source: 'stellar', data: null, error: parseSwapError(err), loading: false });
        }
      } else {
        if (!selectedSellAsset || !selectedBuyAsset || selectedSellAsset.address?.toLowerCase() === selectedBuyAsset.address?.toLowerCase()) return;
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
          await fetchSwapQuoteInternal(quoteRequest, selectedSellAsset as any, selectedBuyAsset as any);
        } catch (err: any) {
          if (requestId !== latestRequestId.current) return;
          if (err?.message === 'Quote request cancelled' || err?.message === 'Quote request superseded') return;
          console.error('Swap quote error:', err);
        }
      }
    } else {
      if (!selectedSellAsset || !selectedBuyAsset) return;

      if (isStellar(fromChainId)) {
        setActiveQuote({ source: 'bridge', data: null, error: null, loading: true });
        try {
          const tokens = await getSupportedTokens();
          const fromChainSym = ChainSymbol.SRB;
          const toChainSym = toChainConfig?.nativeCurrency.symbol;

          const src = tokens.find(t => t.chainSymbol === fromChainSym && t.symbol.toUpperCase() === sellAssetSymbol.toUpperCase());
          const dst = tokens.find(t => t.chainSymbol === toChainSym && t.symbol.toUpperCase() === buyAssetSymbol.toUpperCase());

          if (src && dst) {
            const sq = await getStellarBridgeQuote({ amount: sellAmount, sourceToken: src, destinationToken: dst, slippageTolerance: userSlippageTolerance });
            if (requestId !== latestRequestId.current) return;
            if (!sq.feeOptions?.stablecoin) {
              setFeePayType('native');
            }
            setActiveQuote({
              source: 'bridge',
              loading: false,
              error: null,
              data: {
                ...sq,
                minimumAmountOut: sq.amountToBeReceived,
                conversionRate: sq.exchangeRate,
                completionTime: sq.transferTimeMs,
                fee: {
                  native: { amount: sq.feeOptions.native.float, symbol: fromChainConfig?.nativeCurrency.symbol },
                  stablecoin: sq.feeOptions.stablecoin ? { amount: sq.feeOptions.stablecoin.float, symbol: 'USDC' } : null
                }
              }
            });
          }
        } catch (err) {
          if (requestId !== latestRequestId.current) return;
          console.error('Bridge quote error:', err);
          setActiveQuote({ source: 'bridge', data: null, error: parseSwapError(err), loading: false });
        }
        return;
      }

      const fromBridgeSupported = isBridgeSupported(sellAssetSymbol, fromChainId);
      const toBridgeSupported = isBridgeSupported(buyAssetSymbol, toChainId);
      const bothBridgeSupported = fromBridgeSupported && toBridgeSupported;
      const isToStellar = isStellar(toChainId);
      const usdValue = getUsdValue(sellAmount, selectedSellAsset);
      const isBelow2Usd = usdValue !== null && usdValue < 2;
      const shouldUseBridge = isToStellar || (bothBridgeSupported && isBelow2Usd);

      setActiveQuote({ source: shouldUseBridge ? 'bridge' : 'fusion_plus', data: null, error: null, loading: true });
      setCrossChainWarning(null);

      try {
        if (shouldUseBridge) {
          const bdgQ = await getEvmBridgeQuote(fromChainId, toChainId, sellAmount, sellAssetSymbol, buyAssetSymbol);
          if (requestId !== latestRequestId.current) return;
          if (!bdgQ || (Array.isArray(bdgQ) && bdgQ.length === 0) || (bdgQ && typeof bdgQ === 'object' && !bdgQ.minimumAmountOut && !bdgQ.quotes)) {
            throw new Error('Bridge quotes empty');
          }
          if (bdgQ && bdgQ.fee && !bdgQ.fee.stablecoin) {
            setFeePayType('native');
          }
          setActiveQuote({ source: 'bridge', data: bdgQ, error: null, loading: false });
        } else {
          const fq = await fetchFusionQuote(selectedSellAsset as any, selectedBuyAsset as any, sellAmount);
          if (requestId !== latestRequestId.current) return;
          setActiveQuote({ source: 'fusion_plus', data: fq, error: null, loading: false });
        }
      } catch (err: any) {
        if (requestId !== latestRequestId.current) return;
        if (err?.message === 'Quote request cancelled' || err?.message === 'Quote request superseded') return;
        console.error('Cross-chain quote error:', err);
        setCrossChainWarning(parseSwapError(err));
        setActiveQuote({ source: shouldUseBridge ? 'bridge' : 'fusion_plus', data: null, error: parseSwapError(err), loading: false });
      }
    }
  }, [actionType, fromChainId, toChainId, selectedSellAsset, selectedBuyAsset, sellAmount, sellAssetSymbol, buyAssetSymbol, fetchSwapQuoteInternal, isChainSwitching, fromChainConfig, toChainConfig, userSlippageTolerance, showFusionScreen, isBridgeSupported, getUsdValue, ammService, fetchFusionQuote]);

  const isQuoteLoading = !!(activeQuote.loading || swapQuoteLoading || isRefreshing);

  useEffect(() => {
    setTimeToNextRefresh(30);
    resetSwap();
  }, [fromChainId, toChainId, sellAssetSymbol, buyAssetSymbol, resetSwap]);

  useEffect(() => {
    const timeoutId = setTimeout(() => { fetchUnifiedQuote(); }, 800);
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
        setTimeToNextRefresh((prev) => {
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
  }, [sellAmount, isChainSwitching, showFusionScreen, isSameAssetSelected, isQuoteLoading, bridgeTxStatus]);

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
