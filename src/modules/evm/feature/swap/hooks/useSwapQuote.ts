import { useCallback, useEffect, useRef, useState } from 'react';

import { useTransactionModalStore } from '../../../../../store/transactionModalStore';
import { getChainById } from '../../../utils/Chainregistry';
import { getSwapQuote } from '../services/evmSwapService';
import { get1InchFusionQuote } from '../services/fusionOrderService';
import {
  DUMMY_EVM_ADDRESS,
  DUMMY_STELLAR_ADDRESS,
  fetchNearIntentTokens,
  getNearIntentQuote,
  isStellarBlockchain,
  matchNearIntentToken,
  safeParseUnits,
} from '../services/oneClickApi';
import type { UnifiedAsset, UnifiedQuote } from '../types/swap.types';
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
  selectedSellAsset: UnifiedAsset | null;
  selectedBuyAsset: UnifiedAsset | null;
  userSlippageTolerance: number;
  sellAssetSymbol: string;
  buyAssetSymbol: string;
  fromChainConfig: any;
  toChainConfig: any;
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
  isStellarAccountActive?: boolean | null;
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
    setCrossChainWarning,
    setBridgeErrorMsg,
    resetSwap,
    bridgeTxStatus,
    swapQuoteLoading,
    isSameAssetSelected,
    evmAddress,
    stellarAddress,
    isStellarAccountActive,
  } = params;

  const [currentQuote, setCurrentQuote] = useState<UnifiedQuote>({
    source: null,
    data: null,
    error: null,
    loading: false,
  });
  const [timeLeft, setTimeToNextRefresh] = useState(30);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const latestRequestId = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);

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
    const isModalOpen = useTransactionModalStore.getState().isOpen;
    if ((bridgeTxStatus && bridgeTxStatus !== 'idle') || isModalOpen) {
      return; // Do NOT fetch quotes or reset the swap while an execution (like trustline setup) is in progress!
    }

    if (!sellAmount || parseFloat(sellAmount) <= 0 || isChainSwitching || showFusionScreen) {
      setCurrentQuote({ source: null, data: null, error: null, loading: false });
      return;
    }

    let warningError: string | null = null;

    if (
      isStellar(toChainId) &&
      isStellarAccountActive === false &&
      buyAssetSymbol.toUpperCase() !== 'XLM'
    ) {
      warningError = 'Account activation required';
    } else if (
      isStellar(toChainId) &&
      isStellarAccountActive !== false &&
      selectedBuyAsset &&
      !selectedBuyAsset.isNative &&
      !selectedBuyAsset.hasTrustline
    ) {
      warningError = 'Trustline required';
    }

    if (!selectedSellAsset || !selectedBuyAsset) {
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    const requestId = ++latestRequestId.current;
    setCrossChainWarning(null);
    setBridgeErrorMsg(null);
    resetSwap();

    if (actionType === 'SWAP') {
      if (isStellar(fromChainId) && ammService) {
        if (!selectedSellAsset || !selectedBuyAsset) return;
        try {
          const fromAsset = selectedSellAsset.asset;
          const toAsset = selectedBuyAsset.asset;
          if (!fromAsset || !toAsset) return;

          setCurrentQuote({ source: 'STELLAR_SWAP', data: null, error: null, loading: true });
          const sq = await ammService.getSwapQuote(fromAsset, toAsset, sellAmount, {
            slippageTolerance: userSlippageTolerance,
          });

          if (requestId !== latestRequestId.current) return;

          setCurrentQuote({
            source: 'STELLAR_SWAP',
            data: sq,
            error: warningError,
            loading: false,
          });
        } catch (err) {
          if (requestId !== latestRequestId.current) return;
          console.error('Stellar quote error:', err);
          setCurrentQuote({
            source: 'STELLAR_SWAP',
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
              name: selectedSellAsset.name || selectedSellAsset.symbol,
              decimals: selectedSellAsset.decimals || 18,
              address: selectedSellAsset.isNative
                ? '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
                : selectedSellAsset.address || '',
              balance: selectedSellAsset.balance || '0',
              logoUri: selectedSellAsset.logoUri || null,
              chainId: fromChainId,
              isNative: !!selectedSellAsset.isNative,
            },
            tokenOut: {
              symbol: selectedBuyAsset.symbol,
              name: selectedBuyAsset.name || selectedBuyAsset.symbol,
              decimals: selectedBuyAsset.decimals || 18,
              address: selectedBuyAsset.isNative
                ? '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
                : selectedBuyAsset.address || '',
              balance: selectedBuyAsset.balance || '0',
              logoUri: selectedBuyAsset.logoUri || null,
              chainId: toChainId,
              isNative: !!selectedBuyAsset.isNative,
            },
            amount: sellAmount,
            recipient: evmAddress || DUMMY_EVM_ADDRESS,
            slippage: userSlippageTolerance ? userSlippageTolerance.toString() : '1',
          };
          setCurrentQuote(prev => ({ ...prev, source: 'EVM_SWAP', loading: true }));
          const sq = await getSwapQuote(
            fromChainId,
            quoteRequest,
            abortControllerRef.current.signal
          );
          if (requestId !== latestRequestId.current) return;
          setCurrentQuote({ source: 'EVM_SWAP', data: sq, error: warningError, loading: false });
        } catch (err: any) {
          if (requestId !== latestRequestId.current) return;
          if (
            err?.message === 'Quote request cancelled' ||
            err?.message === 'Quote request superseded'
          )
            return;
          console.error('Swap quote error:', err);
          setCurrentQuote({
            source: 'EVM_SWAP',
            data: null,
            error: parseSwapError(err),
            loading: false,
          });
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
            selectedSellAsset.address,
            fromChainId
          );
          const nearBuyAsset = matchNearIntentToken(
            nearTokens,
            buyAssetSymbol,
            selectedBuyAsset.address,
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

      const isFromStellar = isStellar(fromChainId);
      const isToStellar = isStellar(toChainId);
      const isEvmWalletConnected = !!evmAddress;

      if (isFromStellar || isToStellar || !isEvmWalletConnected) {
        setCurrentQuote({ source: 'NEAR_INTENT', data: null, error: null, loading: true });
        setCrossChainWarning(null);

        try {
          const inQ = await fetchNearIntentQuote();

          if (requestId !== latestRequestId.current) return;

          if (!inQ || (inQ as any).error) {
            throw new Error((inQ as any)?.error || 'Pair not supported by NEAR Intents');
          }

          setCurrentQuote({
            source: 'NEAR_INTENT',
            data: inQ,
            error: warningError,
            loading: false,
          });
        } catch (err: any) {
          if (requestId !== latestRequestId.current) return;
          if (
            err?.message === 'Quote request cancelled' ||
            err?.message === 'Quote request superseded'
          )
            return;
          console.error('Cross-chain quote error:', err);
          setCrossChainWarning(parseSwapError(err));
          setCurrentQuote({
            source: 'NEAR_INTENT',
            data: null,
            error: parseSwapError(err),
            loading: false,
          });
        }
      } else {
        // EVM to EVM cross-chain -> Fusion Plus (1inch)
        setCurrentQuote({ source: 'FUSION_PLUS', data: null, error: null, loading: true });
        setCrossChainWarning(null);

        try {
          const fusionQuote = await get1InchFusionQuote(
            fromChainId,
            {
              tokenIn: selectedSellAsset.isNative
                ? '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
                : selectedSellAsset.address || '',
              tokenOut: selectedBuyAsset.isNative
                ? '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
                : selectedBuyAsset.address || '',
              amount: safeParseUnits(sellAmount, selectedSellAsset.decimals),
              walletAddress: evmAddress || '0x0000000000000000000000000000000000000000',
              decimals: selectedSellAsset.decimals,
            },
            toChainId
          );

          if (requestId !== latestRequestId.current) return;

          if (!fusionQuote || (fusionQuote as any).error) {
            throw new Error((fusionQuote as any)?.error || 'Pair not supported by Fusion Plus');
          }

          setCurrentQuote({
            source: 'FUSION_PLUS',
            data: fusionQuote,
            error: warningError,
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
          setCurrentQuote({
            source: 'FUSION_PLUS',
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
    isChainSwitching,
    fromChainConfig,
    userSlippageTolerance,
    showFusionScreen,
    isBridgeSupported,
    getUsdValue,
    ammService,
    evmAddress,
    stellarAddress,
    setCrossChainWarning,
    setBridgeErrorMsg,
    resetSwap,
    isStellarAccountActive,
  ]);

  const isQuoteLoading = !!(currentQuote.loading || swapQuoteLoading || isRefreshing);

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
      (bridgeTxStatus && bridgeTxStatus !== 'idle') ||
      useTransactionModalStore.getState().isOpen;

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
    currentQuote,
    setCurrentQuote,
    timeLeft,
    setTimeToNextRefresh,
    isRefreshing,
    setIsRefreshing,
    isQuoteLoading,
    fetchUnifiedQuote,
  };
}
