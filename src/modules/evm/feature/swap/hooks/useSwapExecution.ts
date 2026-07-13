import { useCallback, useEffect, useRef, useState } from 'react';

import { ChainSymbol, FeePaymentMethod, Messenger } from '@allbridge/bridge-core-sdk';

import { useNotificationStore } from '../../../../../store/notificationStore';
import { useSwapStore } from '../../../../../store/swapStore';
import { useTransactionModalStore } from '../../../../../store/transactionModalStore';
import { sendEVMTransaction } from '../../../../../utils/walletConnectUtils';
import { WalletType } from '../../../../walletconnect/constants/Wallet';
import { storeSwapOrder } from '../../../service/evmTransactionStatusService';
import { getChainById } from '../../../utils/Chainregistry';
import {
  STELLAR_NETWORK_PASSPHRASE,
  prepareStellarToEvmRawTransaction,
  signAndSubmitTransaction,
} from '../services/stellarBridgeService';
import { isStellar } from '../utils/swapAssetUtils';
import { parseSwapError, parseWalletError } from '../utils/swapErrorHandler';
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
  activeQuote: any;
  swapQuote: any;
  fusionQuote: any;

  // services
  ammService: any;
  getProvider: (type: WalletType) => any;
  fetchFusionQuote: (sellAsset: any, buyAsset: any, amount: string) => Promise<any>;
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
  prepareBridgeTransaction: (params: any) => Promise<any>;

  // state triggers
  handleReset: () => void;
  resetSwap: () => void;
  resetInputs: () => void;
  setSellAmount: (amt: string) => void;
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
    currentNetwork,
    userSlippageTolerance,
    fromChainConfig,
    activeQuote,
    swapQuote,
    fusionQuote,
    ammService,
    getProvider,
    fetchFusionQuote,
    performSwap,
    performFusionSwap,
    prepareBridgeTransaction,
    handleReset,
    resetSwap,
    resetInputs,
    setSellAmount,
  } = params;

  const [isFusionLoading, setIsFusionLoading] = useState(false);
  const [fusionStatus, setFusionStatus] = useState<'idle' | 'approving' | 'signing'>('idle');
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
      } else if (parsedAmount <= 0) {
        localStorage.removeItem('pending_dydx_intent');
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    return () => {
      swapAbortRef.current?.abort();
    };
  }, []);

  const resetLoadingState = useCallback(() => {
    setBridgeTxStatus('idle');
    setIsFusionLoading(false);
    setFusionStatus('idle');
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
      setFusionStatus(status);
      setExecutionCurrentStep(status);
      if (useSwapStore.getState().executionApprovalRequired === null) {
        setExecutionApprovalRequired(status === 'approving');
      }
    },
    [setBridgeTxStatus, setExecutionApprovalRequired, setExecutionCurrentStep]
  );

  const executeStellarSwap = async (checkAborted: () => void) => {
    if (!activeQuote.data || !ammService || !stellarAddress) {
      setBridgeTxStatus('idle');
      return;
    }
    try {
      setExecutionApprovalRequired(false);
      setExecutionCurrentStep('preparing');
      setBridgeTxStatus('preparing');
      const tx = await ammService.buildSwapTransaction(stellarAddress, activeQuote.data, {
        slippageTolerance: userSlippageTolerance,
      });
      checkAborted();
      setExecutionCurrentStep('signing');
      setBridgeTxStatus('signing');
      setPendingTxFromChainId(fromChainId);
      const computedOutAmount = getCalculatedBuyAmount({
        actionType,
        isGasless,
        fusionQuote,
        showFusionScreen,
        selectedBuyAsset,
        activeQuoteSource: activeQuote.source,
        activeQuoteData: activeQuote.data,
        swapQuote,
        isSameAssetSelected: false,
        feePayType,
      });
      const provider = getProvider(WalletType.STELLAR) as any;
      setIsWaitingForWallet(true);
      try {
        const hash = await ammService.executeSwapWithWalletConnect(tx, provider);
        if (hash) trackDydxIntent(hash, computedOutAmount);
        handleReset();
        showToast({
          type: 'STELLAR',
          title: 'Swap Transaction Sent',
          message: `Swapping ${sellAmount} ${sellAssetSymbol} \u2192 ${buyAssetSymbol}`,
        });
        if (hash) {
          openModal({
            status: 'success',
            type: 'Swap',
            hash,
            isStellar: true,
          });
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
    if (!swapQuote || !selectedSellAsset || !selectedBuyAsset) {
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
        swapQuote,
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
        fusionQuote,
        showFusionScreen,
        selectedBuyAsset,
        activeQuoteSource: activeQuote.source,
        activeQuoteData: activeQuote.data,
        swapQuote,
        isSameAssetSelected: false,
        feePayType,
      });
      if (hash) trackDydxIntent(hash, computedOutAmount);
      handleReset();
      showToast({
        type: 'EVM_SWAP',
        title: 'Swap Transaction Sent',
        message: `Swapping ${sellAmount} ${sellAssetSymbol} \u2192 ${buyAssetSymbol}`,
      });
      if (hash) {
        openModal({
          status: 'success',
          type: 'Swap',
          hash,
          explorerUrl: fromChainConfig?.blockExplorerUrl
            ? `${fromChainConfig.blockExplorerUrl}/tx/${hash}`
            : undefined,
          networkName: fromChainConfig?.name,
          isStellar: false,
        });
      }
    } catch (err) {
      if ((err as any)?.name === 'AbortError') {
        resetLoadingState();
        return;
      }
      console.error('Swap execution failed:', err);
      const errMsg = parseWalletError(err);
      setBridgeErrorMsg(errMsg);
      resetLoadingState();
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

  const executeStellarToEvmBridge = async (checkAborted: () => void) => {
    if (!stellarAddress || !evmAddress || !activeQuote.data) {
      setBridgeTxStatus('idle');
      return;
    }
    setExecutionApprovalRequired(false);
    setExecutionCurrentStep('preparing');
    const xdr = await prepareStellarToEvmRawTransaction({
      amount: sellAmount,
      sourceToken: activeQuote.data.sourceToken,
      destinationToken: activeQuote.data.destinationToken,
      fromAccountAddress: stellarAddress,
      toAccountAddress: evmAddress,
      network: currentNetwork,
      feePaymentMethod:
        feePayType === 'stablecoin' && activeQuote.data?.fee?.stablecoin
          ? FeePaymentMethod.WITH_STABLECOIN
          : FeePaymentMethod.WITH_NATIVE_CURRENCY,
      messenger: Messenger.ALLBRIDGE,
      slippageTolerance: userSlippageTolerance,
    });
    checkAborted();
    setExecutionCurrentStep('signing');
    setBridgeTxStatus('signing');
    setPendingTxFromChainId(fromChainId);
    const provider = getProvider(WalletType.STELLAR) as any;
    setIsWaitingForWallet(true);
    let result;
    try {
      result = await signAndSubmitTransaction({
        xdr,
        network: currentNetwork,
        networkPassphrase: STELLAR_NETWORK_PASSPHRASE[currentNetwork],
        provider,
      });
    } finally {
      setIsWaitingForWallet(false);
    }

    if (result.success) {
      const txHash = result.hash || undefined;
      const computedOutAmount = getCalculatedBuyAmount({
        actionType,
        isGasless,
        fusionQuote,
        showFusionScreen,
        selectedBuyAsset,
        activeQuoteSource: activeQuote.source,
        activeQuoteData: activeQuote.data,
        swapQuote,
        isSameAssetSelected: false,
        feePayType,
      });
      if (txHash) trackDydxIntent(txHash, computedOutAmount);
      handleReset();
      if (txHash) {
        storeSwapOrder({
          txHash,
          walletAddress: stellarAddress,
          provider: 'ALLBRIDGE',
          fromChain: ChainSymbol.SRB,
          fromToken: sellAssetSymbol,
          toChain: getChainById(toChainId)?.symbol || String(toChainId),
          toToken: buyAssetSymbol,
          amountIn: sellAmount,
          amountOut: computedOutAmount,
          txType: 'Bridge',
        } as any).catch((err: any) =>
          console.error('Failed to store Stellar\u2192EVM bridge order:', err)
        );
      }
      showToast({
        type: 'BRIDGE',
        title: 'Bridge Initiated',
        message: `Transferring ${sellAmount} ${sellAssetSymbol} to ${buyAssetSymbol}`,
      });
      if (txHash) {
        openModal({
          status: 'success',
          type: 'Bridge',
          hash: txHash,
          isStellar: true,
        });
      }
    } else {
      throw new Error(result.error || 'Stellar transaction failed');
    }
  };

  const executeEvmFusionPlusBridge = async (checkAborted: () => void) => {
    if (!evmAddress) {
      setBridgeTxStatus('idle');
      return;
    }
    setBridgeTxStatus('preparing');
    try {
      const currentQuote = activeQuote.data;
      const preset = currentQuote.recommended_preset || 'fast';
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
        fusionQuote,
        showFusionScreen,
        selectedBuyAsset,
        activeQuoteSource: activeQuote.source,
        activeQuoteData: activeQuote.data,
        swapQuote,
        isSameAssetSelected: false,
        feePayType,
      });
      if (hash) trackDydxIntent(hash, computedOutAmount);
      handleReset();
      showToast({
        type: 'EVM_SWAP',
        title: 'Bridge Order Submitted',
        message: `Cross-chain swap for ${sellAmount} ${sellAssetSymbol} \u2192 ${buyAssetSymbol} submitted successfully.`,
      });
      if (hash) {
        openModal({
          status: 'success',
          type: 'Bridge',
          hash,
          explorerUrl: fromChainConfig?.blockExplorerUrl
            ? `${fromChainConfig.blockExplorerUrl}/tx/${hash}`
            : undefined,
          networkName: fromChainConfig?.name,
          isStellar: false,
        });
      }
    } catch (err) {
      if ((err as any)?.name === 'AbortError') {
        resetLoadingState();
        return;
      }
      console.error('Fusion Plus cross-chain swap failed:', err);
      const errMsg = parseWalletError(err);
      setBridgeErrorMsg(errMsg);
      resetLoadingState();
      setBridgeTxStatus('error');
      openModal({
        status: 'error',
        type: 'Bridge',
        error: errMsg,
        isStellar: false,
      });
      showToast({ type: 'EVM_SWAP', title: 'Bridge Failed', message: errMsg, dontSave: true });
    } finally {
      setIsWaitingForWallet(false);
    }
  };

  const executeEvmAllbridgeBridge = async (checkAborted: () => void) => {
    const destAddr = isStellar(toChainId) ? stellarAddress : evmAddress;
    if (!evmAddress || !destAddr) {
      setBridgeTxStatus('idle');
      return;
    }

    setExecutionApprovalRequired(false);
    setExecutionCurrentStep('preparing');

    const bridgeResponse = await prepareBridgeTransaction({
      fromChainId,
      toChainId,
      amount: sellAmount,
      feePayType:
        feePayType === 'stablecoin' && activeQuote.data?.fee?.stablecoin ? 'stablecoin' : 'native',
      fromAddress: evmAddress,
      destinationAddress: destAddr,
      sourceToken: sellAssetSymbol,
      destinationToken: buyAssetSymbol,
      slippageTolerance: userSlippageTolerance,
    });
    checkAborted();

    const txs = bridgeResponse.transactions || [];
    const hasApproval = txs.some((t: any) => t.type === 'approve');

    console.log(txs, '---------- hasApprval check ');

    setExecutionApprovalRequired(hasApproval);
    setExecutionCurrentStep(hasApproval ? 'approving' : 'signing');

    const provider = getProvider(WalletType.EVM) as any;
    const computedOutAmount = getCalculatedBuyAmount({
      actionType,
      isGasless,
      fusionQuote,
      showFusionScreen,
      selectedBuyAsset,
      activeQuoteSource: activeQuote.source,
      activeQuoteData: activeQuote.data,
      swapQuote,
      isSameAssetSelected: false,
      feePayType,
    });
    let transferHash: string | undefined = undefined;
    for (const tx of txs) {
      if (tx.type === 'approve') {
        setExecutionCurrentStep('approving');
      } else {
        setExecutionCurrentStep('signing');
      }
      setBridgeTxStatus('signing');
      setPendingTxFromChainId(fromChainId);
      setIsWaitingForWallet(true);
      let hash: string;
      try {
        hash = await sendEVMTransaction(provider, fromChainId, {
          from: tx.transaction.from,
          to: tx.transaction.to,
          value: `0x${BigInt(tx.transaction.value).toString(16)}`,
          data: tx.transaction.data,
        });
      } finally {
        setIsWaitingForWallet(false);
      }
      if (tx.type === 'approve') {
        storeSwapOrder({
          txHash: hash,
          walletAddress: evmAddress,
          provider: 'EVMTX',
          fromChain: getChainById(fromChainId)?.symbol || String(fromChainId),
          fromToken: sellAssetSymbol,
          toChain: getChainById(toChainId)?.symbol || String(toChainId),
          toToken: buyAssetSymbol,
          amountIn: sellAmount,
          amountOut: computedOutAmount,
          txType: 'Token Approval',
        } as any).catch(err => console.error('Failed to store Allbridge approval order:', err));
      }
      if (tx.type === 'transfer') {
        transferHash = hash;
        if (hash) trackDydxIntent(hash, computedOutAmount);
        useSwapStore.getState().setPendingTxHash(hash);
        storeSwapOrder({
          txHash: hash,
          walletAddress: evmAddress,
          provider: 'ALLBRIDGE',
          fromChain: getChainById(fromChainId)?.symbol || String(fromChainId),
          fromToken: sellAssetSymbol,
          toChain: getChainById(toChainId)?.symbol || String(toChainId),
          toToken: buyAssetSymbol,
          amountIn: sellAmount,
          amountOut: computedOutAmount,
          txType: 'Bridge',
        } as any).catch(err => console.error('Failed to store Allbridge order:', err));
      }
    }
    handleReset();
    showToast({
      type: 'BRIDGE',
      title: 'Bridge Initiated',
      message: `Transferring ${sellAmount} ${sellAssetSymbol} to ${buyAssetSymbol}`,
    });
    if (transferHash) {
      openModal({
        status: 'success',
        type: 'Bridge',
        hash: transferHash,
        explorerUrl: fromChainConfig?.blockExplorerUrl
          ? `${fromChainConfig.blockExplorerUrl}/tx/${transferHash}`
          : undefined,
        networkName: fromChainConfig?.name,
        isStellar: false,
      });
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
          await fetchFusionQuote(selectedSellAsset as any, selectedBuyAsset as any, sellAmount);
          setShowFusionScreen(true);
          setBridgeTxStatus('idle');
        } catch (err) {
          console.error('Failed to fetch Fusion quote:', err);
          setBridgeErrorMsg(parseWalletError(err));
          resetLoadingState();
        } finally {
          setIsFusionLoading(false);
        }
        return;
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
        if (!activeQuote.data) {
          setBridgeTxStatus('idle');
          return;
        }

        try {
          if (isStellar(fromChainId)) {
            await executeStellarToEvmBridge(checkAborted);
          } else if (activeQuote.source === 'fusion_plus' && activeQuote.data) {
            await executeEvmFusionPlusBridge(checkAborted);
          } else if (activeQuote.source === 'bridge' && activeQuote.data) {
            await executeEvmAllbridgeBridge(checkAborted);
          }
        } catch (err: any) {
          if ((err as any)?.name === 'AbortError') {
            resetLoadingState();
            return;
          }
          console.error('Bridge failed:', err);
          const errMsg = parseWalletError(err);
          setBridgeErrorMsg(errMsg);
          resetLoadingState();
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
    activeQuote,
    swapQuote,
    fusionQuote,
    ammService,
    getProvider,
    fetchFusionQuote,
    performSwap,
    performFusionSwap,
    prepareBridgeTransaction,
    handleReset,
    resetSwap,
    resetInputs,
    setSellAmount,
  ]);

  return {
    isFusionLoading,
    setIsFusionLoading,
    fusionStatus,
    setFusionStatus,
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
