import { useCallback, useEffect, useRef, useState } from 'react';

import { getChainById } from '../../../utils/Chainregistry';
import {
  DUMMY_EVM_ADDRESS,
  DUMMY_STELLAR_ADDRESS,
  fetchNearIntentTokens,
  getNearIntentQuote,
  isStellarBlockchain,
  matchNearIntentToken,
  safeParseUnits,
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
  // getEvmBridgeQuote: (fromChainId: any, toChainId: any, amount: string, sellSymbol: string, buySymbol: string) => Promise<any>;
  // getStellarBridgeQuote: (params: any) => Promise<any>;
  // getSupportedTokens: () => Promise<any[]>;
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
    fetchSwapQuoteInternal,
    fetchFusionQuote,
    // getEvmBridgeQuote,
    // getStellarBridgeQuote,
    // getSupportedTokens,
    // setFeePayType,
    setCrossChainWarning,
    setBridgeErrorMsg,
    resetSwap,
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

      const fetchNearIntentQuote = async () => {
        try {
          const nearTokens = await fetchNearIntentTokens();
          const nearSellAsset = matchNearIntentToken(
            nearTokens,
            sellAssetSymbol,
            (selectedSellAsset as any)?.address,
            fromChainId
          );
          const nearBuyAsset = matchNearIntentToken(
            nearTokens,
            buyAssetSymbol,
            (selectedBuyAsset as any)?.address,
            toChainId
          );

          if (nearSellAsset && nearBuyAsset) {
            const isStellarOrigin = isStellarBlockchain(nearSellAsset.blockchain);
            const isStellarDest = isStellarBlockchain(nearBuyAsset.blockchain);

            const originWalletConnected = isStellarOrigin ? !!stellarAddress : !!evmAddress;
            const destWalletConnected = isStellarDest ? !!stellarAddress : !!evmAddress;
            const isDryRun = !originWalletConnected || !destWalletConnected;

            const recipient = isStellarDest
              ? stellarAddress || DUMMY_STELLAR_ADDRESS
              : evmAddress || DUMMY_EVM_ADDRESS;
            const refundTo = isStellarOrigin
              ? stellarAddress || DUMMY_STELLAR_ADDRESS
              : evmAddress || DUMMY_EVM_ADDRESS;

            const quotePayload = {
              dry: isDryRun,
              depositMode: (isStellarOrigin ? 'MEMO' : 'SIMPLE') as 'MEMO' | 'SIMPLE',
              swapType: 'EXACT_INPUT' as const,
              slippageTolerance: userSlippageTolerance * 100,
              originAsset: nearSellAsset.assetId,
              depositType: 'ORIGIN_CHAIN',
              destinationAsset: nearBuyAsset.assetId,
              amount: safeParseUnits(sellAmount, nearSellAsset.decimals),
              recipient: recipient as string,
              recipientType: 'DESTINATION_CHAIN' as const,
              refundTo: refundTo as string,
              refundType: 'ORIGIN_CHAIN',
              deadline: new Date(Date.now() + 1200000).toISOString(),
            };

            return await getNearIntentQuote(quotePayload).then(res => res.quote);
          }
          return { error: 'Pair not supported by NEAR Intents' };
        } catch (err: any) {
          console.warn('NEAR Intents quote failed', err);
          return { error: err.message || 'Intents setup failed' };
        }
      };

      // ── Allbridge (Stellar→EVM) commented out ──────────────────────────────
      // const isFromStellar = isStellar(fromChainId);
      // const tokens = await getSupportedTokens();
      // const fromChainSym = ChainSymbol.SRB;
      // const src = tokens.find(t => t.chainSymbol === fromChainSym && t.symbol.toUpperCase() === sellAssetSymbol.toUpperCase());
      // const dst = tokens.find(t => t.chainSymbol === toChainConfig?.nativeCurrency.symbol && t.symbol.toUpperCase() === buyAssetSymbol.toUpperCase());
      // const allbridgePromise = src && dst ? getStellarBridgeQuote({...}) : Promise.resolve({error:'Pair not supported by Allbridge'});
      // ─────────────────────────────────────────────────────────────────────────

      // ── Allbridge EVM→Stellar / EVM→EVM bridge commented out ─────────────
      // const fromBridgeSupported = isBridgeSupported(sellAssetSymbol, fromChainId);
      // const toBridgeSupported = isBridgeSupported(buyAssetSymbol, toChainId);
      // const shouldUseBridge = isToStellar || (bothBridgeSupported && isBelow2Usd);
      // const bdgPromise = getEvmBridgeQuote(fromChainId, toChainId, sellAmount, sellAssetSymbol, buyAssetSymbol);
      // ─────────────────────────────────────────────────────────────────────────

      const isFromStellar = isStellar(fromChainId);
      const isToStellar = isStellar(toChainId);

      if (isFromStellar || isToStellar) {
        setActiveQuote({ source: 'near_intent', data: null, error: null, loading: true });
        setCrossChainWarning(null);

        try {
          const inQ = await fetchNearIntentQuote();

          if (requestId !== latestRequestId.current) return;

          if (!inQ || (inQ as any).error) {
            throw new Error((inQ as any)?.error || 'Pair not supported by NEAR Intents');
          }

          setActiveQuote({ source: 'near_intent', data: inQ, error: null, loading: false });
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
            source: 'near_intent',
            data: null,
            error: parseSwapError(err),
            loading: false,
          });
        }
      } else {
        // EVM to EVM cross-chain -> Fusion Plus (1inch)
        setActiveQuote({ source: 'fusion_plus', data: null, error: null, loading: true });
        setCrossChainWarning(null);

        try {
          const fusionQuote = await fetchFusionQuote(
            selectedSellAsset as any,
            selectedBuyAsset as any,
            sellAmount
          );

          if (requestId !== latestRequestId.current) return;

          if (!fusionQuote || (fusionQuote as any).error) {
            throw new Error((fusionQuote as any)?.error || 'Pair not supported by Fusion Plus');
          }

          setActiveQuote({
            source: 'fusion_plus',
            data: fusionQuote,
            error: null,
            loading: false,
          });
        } catch (err: any) {
          if (requestId !== latestRequestId.current) return;
          if (
            err?.message === 'Quote request cancelled' ||
            err?.message === 'Quote request superseded'
          )
            return;
          console.error('Fusion Plus quote error:', err);
          setCrossChainWarning(parseSwapError(err));
          setActiveQuote({
            source: 'fusion_plus',
            data: null,
            error: parseSwapError(err),
            loading: false,
          });
        }
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
    userSlippageTolerance,
    showFusionScreen,
    isBridgeSupported,
    getUsdValue,
    ammService,
    fetchFusionQuote,
    evmAddress,
    stellarAddress,
    setCrossChainWarning,
    setBridgeErrorMsg,
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
          if (prev <= 1) return 0;
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
