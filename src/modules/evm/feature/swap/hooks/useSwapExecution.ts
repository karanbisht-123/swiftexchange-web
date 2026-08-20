import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useNotificationStore } from '../../../../../store/notificationStore';
import { useSwapStore } from '../../../../../store/swapStore';
import { useTransactionModalStore } from '../../../../../store/transactionModalStore';
import { WalletType } from '../../../../walletconnect/constants/Wallet';
import { usePortfolioStore } from '../../../../walletconnect/store/portfolioStore';
import { storeSwapOrder } from '../../../service/evmTransactionStatusService';
import { getChainById } from '../../../utils/Chainregistry';
import { getEVMNetworkConfig, simulateEVMTransaction } from '../../../utils/evmUtils';
import type { UnifiedQuote } from '../types/swap.types';
import { isStellar } from '../utils/swapAssetUtils';
import { parseSwapError } from '../utils/swapErrorHandler';
import { getCalculatedBuyAmount } from '../utils/swapQuoteUtils';

export interface UseSwapExecutionParams {
  sellAmount: string;
  selectedSellAsset: any;
  selectedBuyAsset: any;
  fromChainId: number | string;
  toChainId: number | string;
  actionType: 'SWAP' | 'BRIDGE';
  isGasless: boolean;
  feePayType: 'native' | 'stablecoin';
  sellAssetSymbol: string;
  buyAssetSymbol: string;
  stellarAddress: string;
  evmAddress: string;
  currentNetwork: 'mainnet' | 'testnet';
  userSlippageTolerance: number;
  fromChainConfig: any;

  // quote data
  currentQuote: UnifiedQuote;
  setCurrentQuote: (q: UnifiedQuote) => void;

  // services
  ammService: any;
  getProvider: (type: WalletType) => any;
  performSwap: (
    quote: any,
    sellAsset: any,
    buyAsset: any,
    amount: string,
    slippage: number,
    onBeforeSign: () => void,
    onProgress?: (step: 'approving' | 'signing') => void
  ) => Promise<string>;
  performFusionSwap: (
    sellAsset: any,
    buyAsset: any,
    amount: string,
    preset: string,
    onProgress: any,
    quote: any,
    onBeforeSign: () => void
  ) => Promise<string>;

  // state triggers
  handleReset: () => void;
  resetSwap: () => void;
  resetInputs: () => void;
  setSellAmount: (amt: string) => void;
  executeNearIntentDeposit?: (sellAsset: any, amount: string, quote: any) => Promise<string>;
}

export function useSwapExecution(params: UseSwapExecutionParams) {
  const {
    sellAmount,
    selectedSellAsset,
    selectedBuyAsset,
    fromChainId,
    toChainId,
    actionType,
    isGasless,
    feePayType,
    sellAssetSymbol,
    buyAssetSymbol,
    stellarAddress,
    evmAddress,
    userSlippageTolerance,
    fromChainConfig,
    currentQuote,
    setCurrentQuote,
    ammService,
    getProvider,
    performSwap,
    performFusionSwap,

    handleReset,
    resetSwap,
    resetInputs,
    setSellAmount,
    executeNearIntentDeposit,
  } = params;

  const navigate = useNavigate();

  const [isFusionLoading, setIsFusionLoading] = useState(false);
  const [isWaitingForWallet, setIsWaitingForWallet] = useState(false);
  const [showFusionScreen, setShowFusionScreen] = useState(false);

  const executionApprovalRequired = useSwapStore(s => s.executionApprovalRequired);
  const executionCurrentStep = useSwapStore(s => s.executionCurrentStep);
  const setExecutionApprovalRequired = useSwapStore(s => s.setExecutionApprovalRequired);
  const setExecutionCurrentStep = useSwapStore(s => s.setExecutionCurrentStep);

  const isSubmittingRef = useRef(false);
  const swapAbortRef = useRef<AbortController | null>(null);

  const { showToast } = useNotificationStore();
  const { openModal } = useTransactionModalStore();

  const setBridgeTxStatus = useSwapStore(s => s.setPendingTxStatus);
  const setBridgeErrorMsg = useSwapStore(s => s.setPendingTxErrorMsg);
  const setPendingTxFromChainId = useSwapStore(s => s.setPendingTxFromChainId);

  const trackDydxIntent = useCallback((txHash: string, amountOut: string) => {
    try {
      const parsedAmount = parseFloat(amountOut || '0');
      if (parsedAmount > 0 && localStorage.getItem('pending_dydx_intent') === 'true') {
        localStorage.setItem(
          'dydx_intent_' + txHash,
          JSON.stringify({
            amountOut,
            timestamp: Date.now(),
          })
        );
        localStorage.removeItem('pending_dydx_intent');
        return true;
      } else if (parsedAmount <= 0) {
        localStorage.removeItem('pending_dydx_intent');
      }
    } catch {
      // ignore
    }
    return false;
  }, []);

  useEffect(() => {
    return () => {
      swapAbortRef.current?.abort();
    };
  }, []);

  const resetLoadingState = useCallback(() => {
    setBridgeTxStatus('idle');
    setIsFusionLoading(false);
    setShowFusionScreen(false);
    setIsWaitingForWallet(false);
    setExecutionApprovalRequired(null);
    setExecutionCurrentStep('preparing');
    resetSwap();
    isSubmittingRef.current = false;
  }, [resetSwap, setBridgeTxStatus, setExecutionApprovalRequired, setExecutionCurrentStep]);

  const setSwapProgressStatus = useCallback(
    (status: 'approving' | 'signing') => {
      setBridgeTxStatus(status === 'signing' ? 'signing' : 'preparing');
      setExecutionCurrentStep(status);
      if (useSwapStore.getState().executionApprovalRequired === null) {
        setExecutionApprovalRequired(status === 'approving');
      }
    },
    [setBridgeTxStatus, setExecutionApprovalRequired, setExecutionCurrentStep]
  );

  const executeStellarSwap = async (checkAborted: () => void) => {
    if (!currentQuote.data || !ammService || !stellarAddress) {
      setBridgeTxStatus('idle');
      return;
    }
    try {
      setExecutionApprovalRequired(false);
      setExecutionCurrentStep('preparing');
      setBridgeTxStatus('preparing');
      const tx = await ammService.buildSwapTransaction(stellarAddress, currentQuote.data, {
        slippageTolerance: userSlippageTolerance,
      });
      checkAborted();
      setExecutionCurrentStep('signing');
      setBridgeTxStatus('signing');
      setPendingTxFromChainId(fromChainId);
      const computedOutAmount = getCalculatedBuyAmount({
        actionType,
        isGasless,
        showFusionScreen,
        selectedBuyAsset,
        activeQuoteSource: currentQuote.source,
        activeQuoteData: currentQuote.data,
        isSameAssetSelected: false,
        feePayType,
      });
      const provider = getProvider(WalletType.STELLAR) as any;
      setIsWaitingForWallet(true);
      try {
        const hash = await ammService.executeSwapWithWalletConnect(tx, provider);
        const wasTracked = hash ? trackDydxIntent(hash, computedOutAmount) : false;
        handleReset();
        showToast({
          type: 'STELLAR',
          title: 'Swap Transaction Sent',
          message: `Swapping ${sellAmount} ${sellAssetSymbol} \u2192 ${buyAssetSymbol}`,
        });
        openModal({
          status: 'success',
          type: 'Swap',
          hash,
          isStellar: true,
        });
        if (wasTracked) {
          navigate(`/transactions?tab=recent&hash=${hash}`);
        }
      } finally {
        setIsWaitingForWallet(false);
      }
    } catch (err) {
      if ((err as any)?.name === 'AbortError') {
        resetLoadingState();
        return;
      }
      console.error('Stellar swap execution failed:', err);
      const errMsg = parseSwapError(err);
      setBridgeErrorMsg(errMsg);
      setBridgeTxStatus('error');
      openModal({
        status: 'error',
        type: 'Swap',
        error: errMsg,
        isStellar: true,
      });
      showToast({
        type: 'STELLAR',
        title: 'Swap Failed',
        message: errMsg,
        dontSave: true,
      });
    }
  };

  const executeEvmSwap = async (checkAborted: () => void) => {
    if (
      currentQuote.source !== 'EVM_SWAP' ||
      !currentQuote.data ||
      !selectedSellAsset ||
      !selectedBuyAsset
    ) {
      setBridgeTxStatus('idle');
      return;
    }
    try {
      const onBeforeSign = () => {
        checkAborted();
        setBridgeTxStatus('signing');
        setIsWaitingForWallet(true);
      };
      const hash = await performSwap(
        currentQuote.data,
        selectedSellAsset as any,
        selectedBuyAsset as any,
        sellAmount,
        userSlippageTolerance,
        onBeforeSign,
        setSwapProgressStatus
      );
      const computedOutAmount = getCalculatedBuyAmount({
        actionType,
        isGasless,
        showFusionScreen,
        selectedBuyAsset,
        activeQuoteSource: currentQuote.source,
        activeQuoteData: currentQuote.data,
        isSameAssetSelected: false,
        feePayType,
      });
      const wasTracked = hash ? trackDydxIntent(hash, computedOutAmount) : false;
      handleReset();
      showToast({
        type: 'EVM_SWAP',
        title: 'Swap Transaction Sent',
        message: `Swapping ${sellAmount} ${sellAssetSymbol} \u2192 ${buyAssetSymbol}`,
      });
      openModal({
        status: 'success',
        type: 'Swap',
        hash,
        explorerUrl:
          fromChainConfig?.blockExplorerUrl && hash
            ? `${fromChainConfig.blockExplorerUrl}/tx/${hash}`
            : undefined,
        networkName: fromChainConfig?.name,
        isStellar: false,
      });
      if (wasTracked) {
        navigate(`/transactions?tab=recent&hash=${hash}`);
      }
    } catch (err) {
      if ((err as any)?.name === 'AbortError') {
        resetLoadingState();
        return;
      }
      console.error('Swap execution failed:', err);
      const errMsg = parseSwapError(err);
      setBridgeErrorMsg(errMsg);
      setBridgeTxStatus('error');
      openModal({
        status: 'error',
        type: 'Swap',
        error: errMsg,
        isStellar: false,
      });
      showToast({ type: 'EVM_SWAP', title: 'Swap Failed', message: errMsg, dontSave: true });
    } finally {
      setIsWaitingForWallet(false);
    }
  };

  const executeEvmNearIntentBridge = async (checkAborted: () => void) => {
    if (!executeNearIntentDeposit) {
      setBridgeTxStatus('idle');
      return;
    }

    setExecutionApprovalRequired(false);
    setExecutionCurrentStep('preparing');
    checkAborted();

    setExecutionCurrentStep('signing');
    setBridgeTxStatus('signing');
    setPendingTxFromChainId(fromChainId);
    setIsWaitingForWallet(true);

    try {
      const {
        fetchNearIntentTokens,
        isStellarBlockchain,
        getNearIntentQuote,
        matchNearIntentToken,
        safeParseUnits,
      } = await import('../services/oneClickApi');
      const nearTokens = await fetchNearIntentTokens();

      const nearSellAsset = matchNearIntentToken(
        nearTokens,
        sellAssetSymbol,
        (selectedSellAsset as any)?.address,
        fromChainId
      );

      if (!nearSellAsset) throw new Error('Could not resolve NEAR Intent asset for deposit');

      const nearBuyAsset = matchNearIntentToken(
        nearTokens,
        buyAssetSymbol,
        (selectedBuyAsset as any)?.address,
        toChainId
      );

      const isStellarOrigin = isStellarBlockchain(nearSellAsset.blockchain);
      const isStellarDest = nearBuyAsset ? isStellarBlockchain(nearBuyAsset.blockchain) : false;

      const recipient = isStellarDest ? stellarAddress : evmAddress;
      const refundTo = isStellarOrigin ? stellarAddress : evmAddress;

      if (!recipient || !refundTo) {
        throw new Error(
          isStellarDest
            ? 'Connect your Stellar wallet to receive this asset'
            : 'Connect your EVM wallet to receive this asset'
        );
      }

      const liveQuotePayload = {
        dry: false,
        depositMode: (isStellarOrigin ? 'MEMO' : 'SIMPLE') as 'MEMO' | 'SIMPLE',
        swapType: 'EXACT_INPUT' as const,
        slippageTolerance: userSlippageTolerance * 100,
        originAsset: nearSellAsset.assetId,
        depositType: 'ORIGIN_CHAIN',
        destinationAsset: nearBuyAsset?.assetId || (currentQuote.data?.destinationAsset ?? ''),
        amount: safeParseUnits(sellAmount, nearSellAsset.decimals),
        recipient,
        recipientType: 'DESTINATION_CHAIN' as const,
        refundTo,
        refundType: 'ORIGIN_CHAIN',
        deadline: new Date(Date.now() + 1200000).toISOString(),
      };

      const liveQuoteRes = await getNearIntentQuote(liveQuotePayload);
      const liveQuote = liveQuoteRes.quote;

      if (!liveQuote?.depositAddress) {
        throw new Error('Could not get a deposit address for this transaction. Please retry.');
      }

      checkAborted();

      const hash = await executeNearIntentDeposit(nearSellAsset, sellAmount, liveQuote);
      checkAborted();

      const computedOutAmount = liveQuote.amountOutFormatted || liveQuote.amountOut;
      const wasTracked = hash ? trackDydxIntent(hash, computedOutAmount) : false;

      if (hash) {
        storeSwapOrder({
          txHash: liveQuote.depositAddress,
          walletAddress: evmAddress || stellarAddress,
          provider: 'NEARINTENT',
          memo: isStellarOrigin ? liveQuote.depositMemo : undefined,
          fromChain: getChainById(fromChainId)?.symbol || String(fromChainId),
          fromAddress: isStellarOrigin ? stellarAddress : evmAddress,
          fromToken: sellAssetSymbol,
          toChain: getChainById(toChainId)?.symbol || String(toChainId),
          toAddress: isStellarDest ? stellarAddress : evmAddress,
          toToken: buyAssetSymbol,
          amountIn: sellAmount,
          amountOut: computedOutAmount,
          txType: 'Bridge',
        }).catch(() => {});
      }

      handleReset();
      showToast({
        type: 'BRIDGE',
        title: 'Bridge Initiated',
        message: `Transferring ${sellAmount} ${sellAssetSymbol} to ${buyAssetSymbol} via NEAR Intents`,
      });
      openModal({
        status: 'success',
        type: 'Bridge',
        hash,
        explorerUrl:
          fromChainConfig?.blockExplorerUrl && hash
            ? `${fromChainConfig.blockExplorerUrl}/tx/${hash}`
            : undefined,
        networkName: fromChainConfig?.name,
        isStellar: isStellar(fromChainId),
      });
      if (wasTracked && hash) {
        navigate(`/transactions?tab=recent&hash=${hash}`);
      }
    } catch (err: any) {
      if ((err as any)?.name === 'AbortError') {
        resetLoadingState();
        return;
      }
      console.error('NEAR Intents swap failed:', err);
      const errMsg = parseSwapError(err);
      setBridgeErrorMsg(errMsg);
      setBridgeTxStatus('error');
      openModal({
        status: 'error',
        type: 'Bridge',
        error: errMsg,
        isStellar: isStellar(fromChainId),
      });
      showToast({ type: 'BRIDGE', title: 'Bridge Failed', message: errMsg, dontSave: true });
    } finally {
      setIsWaitingForWallet(false);
    }
  };

  const handleUnifiedSwap = useCallback(async () => {
    if (!sellAmount) return;
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    swapAbortRef.current?.abort();
    const abortCtrl = new AbortController();
    swapAbortRef.current = abortCtrl;
    const { signal } = abortCtrl;
    const checkAborted = () => {
      if (signal.aborted) throw new DOMException('Swap aborted', 'AbortError');
    };

    const executeSwapFlow = async () => {
      if (isGasless && !isStellar(fromChainId) && !isStellar(toChainId)) {
        if (!selectedSellAsset || !selectedBuyAsset) {
          setBridgeTxStatus('idle');
          return;
        }
        setIsFusionLoading(true);
        try {
          const { get1InchFusionQuote } = await import('../services/fusionOrderService');

          const { AGGREGATOR_NATIVE_ADDRESS } = await import('../constants/swap.constants');

          const normalizedTokenIn = (selectedSellAsset as any).isNative
            ? AGGREGATOR_NATIVE_ADDRESS.toLowerCase()
            : (selectedSellAsset as any).address;
          const normalizedTokenOut = (selectedBuyAsset as any).isNative
            ? AGGREGATOR_NATIVE_ADDRESS.toLowerCase()
            : (selectedBuyAsset as any).address;

          const fQuote = await get1InchFusionQuote(
            fromChainId,
            {
              tokenIn: normalizedTokenIn,
              tokenOut: normalizedTokenOut,
              amount: sellAmount,
              walletAddress: evmAddress || '0x0000000000000000000000000000000000000000',
              decimals: (selectedSellAsset as any).decimals,
            },
            toChainId,
            abortCtrl.signal
          );

          setCurrentQuote({
            source: 'FUSION_PLUS',
            data: fQuote,
            error: null,
            loading: false,
          });

          setShowFusionScreen(true);
          setBridgeTxStatus('idle');
        } catch (err) {
          setBridgeErrorMsg(parseSwapError(err));
          resetLoadingState();
        } finally {
          setIsFusionLoading(false);
        }
        return;
      }

      if (!isGasless && !isStellar(fromChainId) && evmAddress) {
        try {
          const chainConfig = getEVMNetworkConfig(fromChainId);
          const nativeSymbol = chainConfig.nativeCurrency.symbol;
          const storeAssets = usePortfolioStore.getState().assets;
          const nativeAsset = storeAssets.find(
            (a: any) => String(a.chainId) === String(fromChainId) && a.isNative
          );
          const nativeBalance = parseFloat(nativeAsset?.balance?.toString() || '0');

          if (nativeBalance <= 0) {
            const errMsg = `Insufficient ${nativeSymbol} to pay gas. Please top up and try again.`;
            setBridgeErrorMsg(errMsg);
            setBridgeTxStatus('error');
            showToast({
              type: 'EVM_SWAP',
              title: 'Insufficient Gas',
              message: errMsg,
              dontSave: true,
            });
            resetLoadingState();
            return;
          }

          await simulateEVMTransaction(fromChainId, evmAddress, evmAddress, '0', '0x');
        } catch (gasErr: any) {
          const msg = gasErr?.message || '';
          if (
            msg.toLowerCase().includes('insufficient funds') ||
            msg.toLowerCase().includes('insufficient')
          ) {
            setBridgeErrorMsg(msg);
            setBridgeTxStatus('error');
            showToast({
              type: 'EVM_SWAP',
              title: 'Insufficient Gas',
              message: msg,
              dontSave: true,
            });
            resetLoadingState();
            return;
          }
        }
      }

      if (actionType === 'SWAP') {
        if (isStellar(fromChainId)) {
          await executeStellarSwap(checkAborted);
        } else {
          await executeEvmSwap(checkAborted);
        }
      } else {
        if (isStellar(fromChainId) && !stellarAddress) {
          setBridgeTxStatus('idle');
          return;
        }
        if (isStellar(toChainId) && !stellarAddress) {
          setBridgeTxStatus('idle');
          return;
        }
        if (!isStellar(fromChainId) && !evmAddress) {
          setBridgeTxStatus('idle');
          return;
        }
        if (!currentQuote.data) {
          setBridgeTxStatus('idle');
          return;
        }

        const executeEvmFusionPlusBridge = async (checkAborted: () => void) => {
          if (!evmAddress) {
            setBridgeTxStatus('idle');
            return;
          }
          setBridgeTxStatus('preparing');
          try {
            const quoteData = currentQuote.data;
            const preset = quoteData.recommended_preset || 'fast';
            const hash = await performFusionSwap(
              selectedSellAsset as any,
              selectedBuyAsset as any,
              sellAmount,
              preset,
              setSwapProgressStatus,
              currentQuote,
              () => {
                checkAborted();
                setBridgeTxStatus('signing');
                setIsWaitingForWallet(true);
              }
            );
            const computedOutAmount = getCalculatedBuyAmount({
              actionType,
              isGasless,
              showFusionScreen,
              selectedBuyAsset,
              activeQuoteSource: currentQuote.source,
              activeQuoteData: currentQuote.data,
              isSameAssetSelected: false,
              feePayType,
            });
            const wasTracked = hash ? trackDydxIntent(hash, computedOutAmount) : false;
            handleReset();
            showToast({
              type: 'EVM_SWAP',
              title: 'Bridge Order Submitted',
              message: `Cross-chain swap for ${sellAmount} ${sellAssetSymbol} → ${buyAssetSymbol} submitted successfully.`,
            });
            openModal({
              status: 'success',
              type: 'Bridge',
              hash,
              explorerUrl:
                fromChainConfig?.blockExplorerUrl && hash
                  ? `${fromChainConfig.blockExplorerUrl}/tx/${hash}`
                  : undefined,
              networkName: fromChainConfig?.name,
              isStellar: false,
            });
            if (wasTracked) {
              navigate(`/transactions?tab=recent&hash=${hash}`);
            }
          } catch (err) {
            if ((err as any)?.name === 'AbortError') {
              resetLoadingState();
              return;
            }
            console.error('Fusion Plus cross-chain swap failed:', err);
            const errMsg = parseSwapError(err);
            setBridgeErrorMsg(errMsg);
            setBridgeTxStatus('error');
            openModal({
              status: 'error',
              type: 'Bridge',
              error: errMsg,
              isStellar: false,
            });
            showToast({
              type: 'EVM_SWAP',
              title: 'Bridge Failed',
              message: errMsg,
              dontSave: true,
            });
          } finally {
            setIsWaitingForWallet(false);
          }
        };

        try {
          if (currentQuote.source === 'NEAR_INTENT' && currentQuote.data) {
            await executeEvmNearIntentBridge(checkAborted);
          } else if (currentQuote.source === 'FUSION_PLUS' && currentQuote.data) {
            await executeEvmFusionPlusBridge(checkAborted);
          }
        } catch (err: any) {
          if ((err as any)?.name === 'AbortError') {
            resetLoadingState();
            return;
          }
          console.error('Bridge failed:', err);
          const errMsg = parseSwapError(err);
          setBridgeErrorMsg(errMsg);
          setBridgeTxStatus('error');
          openModal({
            status: 'error',
            type: 'Bridge',
            error: errMsg,
            isStellar: isStellar(fromChainId),
          });
          showToast({
            type: 'BRIDGE',
            title: 'Transaction Failed',
            message: errMsg,
            dontSave: true,
          });
        }
      }
    };

    try {
      setBridgeErrorMsg(null);
      setBridgeTxStatus('preparing');
      await executeSwapFlow();
    } catch (err) {
      if ((err as any)?.name !== 'AbortError') throw err;
      resetLoadingState();
    } finally {
      isSubmittingRef.current = false;
    }
  }, [
    sellAmount,
    isGasless,
    fromChainId,
    toChainId,
    selectedSellAsset,
    selectedBuyAsset,
    actionType,
    stellarAddress,
    evmAddress,
    currentQuote,
    setCurrentQuote,
    ammService,
    getProvider,
    performSwap,
    performFusionSwap,

    handleReset,
    resetSwap,
    resetInputs,
    setSellAmount,
    executeNearIntentDeposit,
  ]);

  return {
    isFusionLoading,
    setIsFusionLoading,
    isWaitingForWallet,
    setIsWaitingForWallet,
    showFusionScreen,
    setShowFusionScreen,
    isSubmittingRef,
    swapAbortRef,
    resetLoadingState,
    setSwapProgressStatus,
    handleUnifiedSwap,
    executionApprovalRequired,
    executionCurrentStep,
  };
}
