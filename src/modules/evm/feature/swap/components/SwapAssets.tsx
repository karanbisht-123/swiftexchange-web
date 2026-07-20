import { ArrowUpDown, ChevronDown, RefreshCw, Zap } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ethers } from 'ethers';

import { Tooltip } from '../../../../../components/common/Tooltip';
import PageLayout from '../../../../../components/layout/PageLayout';
import { useNotificationStore } from '../../../../../store/notificationStore';
import { useSwapStore } from '../../../../../store/swapStore';
import { useTransactionModalStore } from '../../../../../store/transactionModalStore';
import { ActionGuard } from '../../../../commonfeature/components/ActionGuard';
import TransactionButton from '../../../../commonfeature/components/TransactionButton';
import { useAssetSelectorModal } from '../../../../commonfeature/components/useAssetSelectorModal';
import { AmmSwapService } from '../../../../stellar/service/ammSwapService';
import StellarActiveGuard from '../../../../walletconnect/components/StellarActiveGuard';
import { getStellarConfig } from '../../../../walletconnect/config/chains';
import { WalletType } from '../../../../walletconnect/constants/Wallet';
import { useWalletConnect } from '../../../../walletconnect/hooks/useWalletConnect';
import { useWalletStore } from '../../../../walletconnect/store/walletConnectStore';
import { portfolioUtils } from '../../../../walletconnect/utils/portfolioUtils';
import { getTokensForChain } from '../../../service/tokenListService';
import {
  getChainById,
  getGlobalAssetMetadata,
  isEvmChain,
  normalizeTokenForDisplay,
} from '../../../utils/Chainregistry';
import { switchOrAddChain } from '../../../utils/evmChainUtils';
import { STELLAR_CHAIN_ID } from '../constants/swap.constants';
// Extracted hooks
import { useEvmSwap } from '../hooks/useEvmSwap';
import { useNearIntentCrossChain } from '../hooks/useNearIntentCrossChain';
import { useSwapAssetDefaults } from '../hooks/useSwapAssetDefaults';
import { useSwapExecution } from '../hooks/useSwapExecution';
import { useSwapQuote } from '../hooks/useSwapQuote';
import { useSwapValidation } from '../hooks/useSwapValidation';
import {
  getBridgeQuote as getEvmBridgeQuote,
  prepareBridgeTransaction,
} from '../services/evmSwapService';
import { getStellarBridgeQuote, getSupportedTokens } from '../services/stellarBridgeService';
import type { FusionQuote } from '../types/swap.types';
import { getGasBuffer, toPlainString } from '../utils/swapAmountUtils';
// Utilities & constants
import { isSameAsset, isStellar, matchesAddress } from '../utils/swapAssetUtils';
import { parseWalletError } from '../utils/swapErrorHandler';
import FusionQuoteScreen from './FusionQuoteScreen';
import { SwapExecutionScreen } from './SwapExecutionScreen';

interface SwapAssetsProps {
  onClose?: () => void;
}

const SwapAssets: React.FC<SwapAssetsProps> = ({ onClose }) => {
  const { connectedWallets, getProvider } = useWalletConnect();
  const { showToast } = useNotificationStore();

  const evmWallet = connectedWallets[WalletType.EVM];
  const stellarWallet = connectedWallets[WalletType.STELLAR];
  const isConnected = !!evmWallet;
  const evmAddress = evmWallet?.address || '';
  const stellarAddress = stellarWallet?.address || '';
  const currentChainId = evmWallet?.chainId || null;
  const currentNetwork = useWalletStore((state: any) => state.network) as 'mainnet' | 'testnet';

  const {
    fromChainId,
    setFromChainId,
    toChainId,
    setToChainId,
    sellAssetSymbol,
    setSellAssetSymbol,
    sellAssetAddress,
    setSellAssetAddress,
    buyAssetSymbol,
    setBuyAssetSymbol,
    buyAssetAddress,
    setBuyAssetAddress,
    sellAmount,
    setSellAmount,
    isGasless,
    setIsGasless,
    userSlippageTolerance,
    feePayType,
    setFeePayType,
    resetInputs,
  } = useSwapStore();

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [crossChainWarning, setCrossChainWarning] = useState<string | null>(null);

  const [ammService, setAmmService] = useState<AmmSwapService | null>(null);
  const [stellarAssets, setStellarAssets] = useState<any[]>([]);
  const [isFetchingStellarAssets, setIsFetchingStellarAssets] = useState(false);

  const actionType = useMemo(
    () => (fromChainId === toChainId ? 'SWAP' : 'BRIDGE'),
    [fromChainId, toChainId]
  );

  const requiredWallets = useMemo(() => {
    const wallets = new Set<WalletType>();
    if (isStellar(fromChainId)) wallets.add(WalletType.STELLAR);
    else wallets.add(WalletType.EVM);

    if (actionType === 'BRIDGE') {
      if (isStellar(toChainId)) wallets.add(WalletType.STELLAR);
      else wallets.add(WalletType.EVM);
    }
    return Array.from(wallets);
  }, [actionType, fromChainId, toChainId]);

  const { openAssetSelector } = useAssetSelectorModal();
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    quote: swapQuote,
    txHash: swapTxHash,
    assets: swapAssets,
    error: swapError,
    isFetchingAssets: isFetchingSwapAssets,
    quoteLoading: swapQuoteLoading,
    fetchTokenList,
    updateTokenBalances,
    fetchQuote: fetchSwapQuoteInternal,
    fetchFusionQuote,
    performSwap,
    performFusionSwap,
    fusionQuote,
    reset: resetSwap,
  } = useEvmSwap({
    chainId: fromChainId,
    senderAddress: evmAddress,
    getProvider,
  });

  const { isChainSwitching, setIsChainSwitching, hasInitializedDefaults } = useSwapAssetDefaults({
    connectedWallets,
    currentChainId: currentChainId !== null ? Number(currentChainId) : null,
    currentNetwork,
    isConnected,
    getProvider,
  });

  const bridgeTxStatus = useSwapStore(s => s.pendingTxStatus);
  const bridgeErrorMsg = useSwapStore(s => s.pendingTxErrorMsg);
  const setBridgeTxStatus = useSwapStore(s => s.setPendingTxStatus);
  const setBridgeErrorMsg = useSwapStore(s => s.setPendingTxErrorMsg);
  const clearPendingTx = useSwapStore(s => s.clearPendingTx);

  const fromChainConfig = getChainById(fromChainId);
  const toChainConfig = getChainById(toChainId);

  useEffect(() => {
    if (isStellar(fromChainId) || isStellar(toChainId)) {
      try {
        const config = getStellarConfig(currentNetwork);
        const service = new AmmSwapService(
          config.horizonUrl,
          config.networkPassphrase,
          config.chainId
        );
        setAmmService(service);
      } catch (err) {
        console.error('Failed to init AmmSwapService:', err);
      }
    } else {
      setAmmService(null);
    }
  }, [fromChainId, toChainId, currentNetwork]);

  const selectedSellAsset = useMemo(() => {
    if (isStellar(fromChainId)) {
      return stellarAssets.find(a => a.symbol === sellAssetSymbol);
    }
    if (sellAssetAddress) {
      return swapAssets.find(a => matchesAddress(a, sellAssetAddress));
    }
    return swapAssets.find(a => a.symbol === sellAssetSymbol);
  }, [swapAssets, sellAssetSymbol, sellAssetAddress, stellarAssets, fromChainId]);

  const selectedBuyAsset = useMemo(() => {
    if (isStellar(toChainId)) {
      return stellarAssets.find(a => a.symbol === buyAssetSymbol);
    }
    if (fromChainId !== toChainId) {
      const destTokens = getTokensForChain(toChainId);
      if (buyAssetAddress) {
        return destTokens.find(t => matchesAddress(t, buyAssetAddress));
      }
      return destTokens.find(t => t.symbol === buyAssetSymbol);
    }
    if (buyAssetAddress) {
      return swapAssets.find(a => matchesAddress(a, buyAssetAddress));
    }
    return swapAssets.find(a => a.symbol === buyAssetSymbol);
  }, [swapAssets, buyAssetSymbol, buyAssetAddress, stellarAssets, toChainId, fromChainId]);

  const isStellarActivationRequired = useMemo(() => {
    if (isStellar(fromChainId)) return true;
    if (
      isStellar(toChainId) &&
      selectedBuyAsset &&
      !selectedBuyAsset.isNative &&
      !selectedBuyAsset.hasTrustline
    )
      return true;
    return false;
  }, [fromChainId, toChainId, selectedBuyAsset]);

  const isSameAssetSelected = useMemo(() => {
    return (
      actionType === 'SWAP' &&
      fromChainId === toChainId &&
      isSameAsset(selectedSellAsset, selectedBuyAsset) &&
      !!selectedSellAsset
    );
  }, [actionType, fromChainId, toChainId, selectedSellAsset, selectedBuyAsset]);

  const { activeQuote, setActiveQuote, timeLeft, isQuoteLoading } = useSwapQuote({
    sellAmount,
    isChainSwitching,
    showFusionScreen: false,
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
    evmAddress,
    stellarAddress,
  });

  const { executeDeposit: executeNearIntentDeposit } = useNearIntentCrossChain({
    evmAddress,
    stellarAddress,
    getProvider,
  });

  const toggleRoute = useCallback(() => {
    setActiveQuote(prev => {
      if (!prev.alternativeQuote) return prev;
      return {
        ...prev,
        source: prev.alternativeQuote.source,
        data: prev.alternativeQuote.data,
        alternativeQuote: {
          source: prev.source,
          data: prev.data,
        },
      };
    });
  }, [setActiveQuote]);

  const resetQuotes = useCallback(() => {
    resetSwap();
    setActiveQuote({ source: null, data: null, error: null, loading: false });
    setBridgeErrorMsg(null);
    setCrossChainWarning(null);
    setBridgeTxStatus('idle');
  }, [resetSwap, setActiveQuote, setBridgeErrorMsg, setBridgeTxStatus]);

  const handleReset = useCallback(() => {
    resetSwap();
    useSwapStore.getState().clearPendingTx();
    setActiveQuote({ source: null, data: null, error: null, loading: false });
    setCrossChainWarning(null);
    setSellAmount('');
    setShowFusionScreen(false);
  }, [resetSwap, setActiveQuote, setSellAmount]);

  const {
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
  } = useSwapExecution({
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
    executeNearIntentDeposit,
  });

  const {
    isInsufficientBalance,
    buttonLabel,
    isErrorState,
    isLoadingExecution,
    calculatedBuyAmount,
    conversionRate,
    minimumReceived,
    isSwapDisabled,
  } = useSwapValidation({
    sellAmount,
    selectedSellAsset,
    selectedBuyAsset,
    actionType,
    feePayType,
    fromChainId,
    toChainId,
    stellarAssets,
    swapAssets,
    activeQuote,
    swapQuote,
    isGasless,
    bridgeTxStatus,
    bridgeErrorMsg,
    swapError,
    crossChainWarning,
    isFetchingSwapAssets,
    isQuoteLoading,
    isFetchingStellarAssets,
    userSlippageTolerance,
    showFusionScreen,
    fusionQuote,
  });

  useEffect(() => {
    if (hasInitializedDefaults.current) return;
  }, [currentChainId, evmWallet, stellarWallet]);

  useEffect(() => {
    if (hasInitializedDefaults.current) return;
  }, [fromChainId, toChainId, sellAssetSymbol, buyAssetSymbol, resetSwap, actionType]);

  useEffect(() => {
    if (fromChainId && !isStellar(fromChainId)) {
      fetchTokenList();
    }
  }, [fromChainId, fetchTokenList]);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    if (swapError || bridgeTxStatus === 'error' || activeQuote.error) {
      timeoutId = setTimeout(() => {
        resetSwap();
        setBridgeTxStatus('idle');
        setActiveQuote(prev => ({ ...prev, error: null }));
      }, 6000);
    }
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [swapError, bridgeTxStatus, activeQuote.error, resetSwap]);

  useEffect(() => {
    if (isConnected && !isChainSwitching) {
      if (isStellar(fromChainId)) {
        return;
      }
      if (selectedSellAsset) {
        updateTokenBalances(selectedSellAsset as any);
      }
    }
  }, [
    selectedSellAsset?.address,
    isConnected,
    evmAddress,
    stellarAddress,
    isChainSwitching,
    updateTokenBalances,
    swapAssets.length,
    actionType,
    fromChainId,
  ]);

  useEffect(() => {
    if ((isStellar(fromChainId) || isStellar(toChainId)) && stellarAddress && ammService) {
      const fetchStellar = async () => {
        setIsFetchingStellarAssets(true);
        try {
          const { tokens: balances, subentryCount } =
            await ammService.getAssetsWithBalances(stellarAddress);
          const reserve = 1 + subentryCount * 0.5;
          const mapped = balances.map((b: any) => {
            let balanceToUse = b.balance;
            if (b.code === 'XLM') {
              balanceToUse = Math.max(0, parseFloat(b.balance || '0') - reserve).toString();
            }
            return {
              id: `stellar-${fromChainId}-${b.code}`,
              symbol: b.code,
              name: b.name || b.code,
              logoURI: b.icon,
              balance: balanceToUse,
              decimals: b.decimals || 7,
              isNative: b.asset.isNative(),
              asset: b.asset,
              chainId: STELLAR_CHAIN_ID,
              address: b.asset.isNative() ? 'native' : b.asset.getIssuer(),
              hasTrustline: b.hasTrustline,
            };
          });
          setStellarAssets(mapped);
          if (actionType === 'SWAP' && isStellar(fromChainId)) {
            const currentSellInStellar = mapped.find(t => t.symbol === sellAssetSymbol);
            const currentBuyInStellar = mapped.find(t => t.symbol === buyAssetSymbol);

            let finalSellSymbol = sellAssetSymbol;

            if (!currentSellInStellar && mapped.length > 0) {
              const defaultSell = mapped.find(t => t.symbol === 'XLM') || mapped[0];
              setSellAssetSymbol(defaultSell.symbol);
              setSellAssetAddress(defaultSell.address || '');
              finalSellSymbol = defaultSell.symbol;
            }

            if ((!currentBuyInStellar || finalSellSymbol === buyAssetSymbol) && mapped.length > 1) {
              const defaultBuy = mapped.find(t => t.symbol !== finalSellSymbol) || mapped[1];

              if (defaultBuy) {
                setBuyAssetSymbol(defaultBuy.symbol);
                setBuyAssetAddress(defaultBuy.address || '');
              }
            }
          }
        } catch (err) {
          console.error('Failed to fetch Stellar balances:', err);
        } finally {
          setIsFetchingStellarAssets(false);
        }
      };
      fetchStellar();
    }
  }, [fromChainId, toChainId, stellarAddress, ammService, sellAssetSymbol, actionType]);

  useEffect(() => {
    if (swapAssets.length > 0 && !isChainSwitching && !isStellar(fromChainId)) {
      const assetsChainId = swapAssets[0]?.chainId;
      if (assetsChainId && String(assetsChainId) !== String(fromChainId)) {
        return;
      }

      let currentSellInEvm = swapAssets.find(a =>
        sellAssetAddress ? matchesAddress(a, sellAssetAddress) : a.symbol === sellAssetSymbol
      );

      if (!currentSellInEvm) {
        currentSellInEvm = swapAssets.find(a => a.symbol === sellAssetSymbol);
      }

      let finalSell = currentSellInEvm;
      if (!finalSell) {
        const nativeAsset = swapAssets.find(a => a.isNative);
        finalSell = nativeAsset || swapAssets[0];
      }

      if (finalSell) {
        if (finalSell.symbol !== sellAssetSymbol) setSellAssetSymbol(finalSell.symbol);
        if (finalSell.address !== sellAssetAddress) setSellAssetAddress(finalSell.address || '');
      }

      if (fromChainId === toChainId) {
        let currentBuyInEvm = swapAssets.find(a =>
          buyAssetAddress ? matchesAddress(a, buyAssetAddress) : a.symbol === buyAssetSymbol
        );

        if (!currentBuyInEvm) {
          currentBuyInEvm = swapAssets.find(a => a.symbol === buyAssetSymbol);
        }

        let bestBuy = currentBuyInEvm;

        if (!bestBuy || (finalSell && isSameAsset(finalSell, bestBuy))) {
          const nativeAsset = swapAssets.find(a => a.isNative);

          bestBuy =
            (finalSell && isSameAsset(finalSell, nativeAsset)
              ? swapAssets.find(a => !isSameAsset(a, finalSell))
              : nativeAsset) ||
            swapAssets.find(a => !isSameAsset(a, finalSell)) ||
            swapAssets[1] ||
            swapAssets[0];
        }

        if (bestBuy) {
          if (bestBuy.symbol !== buyAssetSymbol) setBuyAssetSymbol(bestBuy.symbol);
          if (bestBuy.address !== buyAssetAddress) setBuyAssetAddress(bestBuy.address || '');
        }
      } else {
        let destTokens: any[] = [];
        if (isStellar(toChainId)) {
          destTokens = stellarAssets;
        } else {
          destTokens = getTokensForChain(toChainId);
        }

        if (destTokens.length > 0) {
          const currentBuyInDest = destTokens.find(a =>
            buyAssetAddress ? matchesAddress(a, buyAssetAddress) : a.symbol === buyAssetSymbol
          );
          if (!currentBuyInDest) {
            const nativeAsset = destTokens.find(a => a.isNative);
            const sameSymbolAsset = destTokens.find(a => a.symbol === finalSell?.symbol);

            const bestBuy = sameSymbolAsset || nativeAsset || destTokens[0];
            if (bestBuy) {
              setBuyAssetSymbol(bestBuy.symbol);
              setBuyAssetAddress(bestBuy.address || '');
            }
          }
        }
      }
    }
  }, [
    swapAssets,
    sellAssetSymbol,
    sellAssetAddress,
    buyAssetSymbol,
    buyAssetAddress,
    isChainSwitching,
    fromChainId,
    toChainId,
    stellarAssets,
  ]);

  useEffect(() => {
    if (!sellAmount || parseFloat(sellAmount) <= 0) {
      resetQuotes();
      setBridgeErrorMsg(null);
      setBridgeTxStatus('idle');
    }
  }, [sellAmount, resetQuotes, setBridgeErrorMsg, setBridgeTxStatus]);

  useEffect(() => {
    setBridgeErrorMsg(null);
    if (bridgeTxStatus === 'error') setBridgeTxStatus('idle');
  }, [
    fromChainId,
    toChainId,
    sellAssetSymbol,
    buyAssetSymbol,
    setBridgeErrorMsg,
    setBridgeTxStatus,
  ]);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    if (swapError || bridgeErrorMsg) {
      timeoutId = setTimeout(() => {
        if (swapError) resetSwap();
        if (bridgeErrorMsg) {
          setBridgeErrorMsg(null);
          setBridgeTxStatus('idle');
        }
      }, 5000);
    }
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [swapError, bridgeErrorMsg, resetSwap, setBridgeErrorMsg, setBridgeTxStatus]);

  useEffect(() => {
    if (swapError || bridgeErrorMsg || bridgeTxStatus === 'error') {
      setIsWaitingForWallet(false);
      isSubmittingRef.current = false;
      resetSwap();
    }
  }, [
    swapError,
    bridgeErrorMsg,
    bridgeTxStatus,
    resetSwap,
    setIsWaitingForWallet,
    isSubmittingRef,
  ]);

  const handleMaxAmount = useCallback(() => {
    if (selectedSellAsset && selectedSellAsset.balance !== undefined) {
      try {
        const decimals = selectedSellAsset.decimals || 18;
        const plainBalance = toPlainString(selectedSellAsset.balance);
        const balanceBN = ethers.parseUnits(plainBalance, decimals);
        if (balanceBN === 0n) {
          setSellAmount('0');
          return;
        }
        let maxAmountBN = balanceBN;
        if (selectedSellAsset.isNative) {
          const bufferBN = getGasBuffer(fromChainId, decimals);
          maxAmountBN = balanceBN > bufferBN ? balanceBN - bufferBN : balanceBN;
        }
        const formatted = ethers.formatUnits(maxAmountBN, decimals);
        setSellAmount(formatted.replace(/\.?0+$/, ''));
      } catch {
        setSellAmount(toPlainString(selectedSellAsset.balance));
      }
    }
  }, [selectedSellAsset, fromChainId, setSellAmount]);

  const handleAssetSwap = useCallback(() => {
    const prevSell = sellAssetSymbol;
    const prevSellAddr = sellAssetAddress;
    const prevFromChain = fromChainId;

    setSellAssetSymbol(buyAssetSymbol);
    setSellAssetAddress(buyAssetAddress);
    setBuyAssetSymbol(prevSell);
    setBuyAssetAddress(prevSellAddr);
    setFromChainId(toChainId);
    setToChainId(prevFromChain);

    setSellAmount('');
    handleReset();
  }, [
    buyAssetSymbol,
    buyAssetAddress,
    sellAssetSymbol,
    sellAssetAddress,
    fromChainId,
    toChainId,
    setSellAssetSymbol,
    setSellAssetAddress,
    setBuyAssetSymbol,
    setBuyAssetAddress,
    setFromChainId,
    setToChainId,
    setSellAmount,
    handleReset,
  ]);

  const handleChainSelectInModal = useCallback(
    async (newChainId: number | string, isSource: boolean) => {
      const finalFromId = isSource ? newChainId : fromChainId;
      const finalToId = !isSource ? newChainId : toChainId;

      if (finalFromId !== finalToId && (isStellar(finalFromId) || isStellar(finalToId))) {
        const fromCfg = getChainById(finalFromId);
        const toCfg = getChainById(finalToId);

        const fromSupported =
          fromCfg?.bridgeSupportTokens?.map((t: any) => t.symbol.toUpperCase()) || [];
        const toSupported =
          toCfg?.bridgeSupportTokens?.map((t: any) => t.symbol.toUpperCase()) || [];

        if (isStellar(finalFromId) && !fromSupported.includes(sellAssetSymbol.toUpperCase())) {
          const fallback = fromSupported.includes('USDC')
            ? 'USDC'
            : fromSupported.includes('XLM')
              ? 'XLM'
              : fromSupported[0];
          if (fallback) {
            setSellAssetSymbol(fallback);
            setSellAssetAddress('');
          }
        }

        if (isStellar(finalToId) && !toSupported.includes(buyAssetSymbol.toUpperCase())) {
          const fallback = toSupported.includes('USDC')
            ? 'USDC'
            : toSupported.includes('XLM')
              ? 'XLM'
              : toSupported[0];
          if (fallback) {
            setBuyAssetSymbol(fallback);
            setBuyAssetAddress('');
          }
        }
      }

      if (isEvmChain(newChainId)) {
        if (isConnected && isSource) {
          setIsChainSwitching(true);
          try {
            const provider = getProvider(WalletType.EVM);
            await switchOrAddChain(provider, newChainId);
            setFromChainId(newChainId);
          } catch (err: any) {
            console.error('Failed to switch chain:', err);
          } finally {
            setIsChainSwitching(false);
          }
        } else {
          if (isSource) setFromChainId(newChainId);
          else setToChainId(newChainId);
        }
      } else {
        if (isSource) setFromChainId(newChainId);
        else setToChainId(newChainId);
      }
    },
    [
      isConnected,
      getProvider,
      fromChainId,
      toChainId,
      sellAssetSymbol,
      buyAssetSymbol,
      setSellAssetSymbol,
      setBuyAssetSymbol,
      setFromChainId,
      setToChainId,
      setSellAssetAddress,
      setBuyAssetAddress,
    ]
  );

  const handleRefreshBalances = useCallback(async () => {
    if (!isConnected || isChainSwitching) return;

    setIsRefreshing(true);
    try {
      if (isStellar(fromChainId)) {
        if (stellarAddress && ammService) {
          const { tokens: balances, subentryCount } =
            await ammService.getAccountData(stellarAddress);
          const reserve = 1 + subentryCount * 0.5;
          const mapped = balances.map((b: any) => {
            const metadata = getGlobalAssetMetadata(b.code);
            let balanceToUse = b.balance;
            if (b.code === 'XLM') {
              balanceToUse = Math.max(0, parseFloat(b.balance || '0') - reserve).toString();
            }
            return {
              id: `stellar-${fromChainId}-${b.code}`,
              symbol: b.code,
              name: b.code,
              logoURI: metadata?.logoURI,
              balance: balanceToUse,
              decimals: 7,
              isNative: b.asset.isNative(),
              asset: b.asset,
              chainId: STELLAR_CHAIN_ID,
              address: b.asset.isNative() ? 'native' : b.asset.getIssuer(),
            };
          });
          setStellarAssets(mapped);
        }
      } else {
        if (selectedSellAsset) {
          await updateTokenBalances(selectedSellAsset as any);
        }
      }
    } catch (err) {
      console.error('Refresh balances failed:', err);
    } finally {
      setTimeout(() => setIsRefreshing(false), 800);
    }
  }, [
    isConnected,
    isChainSwitching,
    fromChainId,
    stellarAddress,
    ammService,
    selectedSellAsset,
    updateTokenBalances,
    setIsRefreshing,
  ]);

  const buyAssetPriceUsd = useMemo(() => {
    if (!selectedBuyAsset) return null;
    const quotePrices = activeQuote.data?.prices?.usd || fusionQuote?.prices?.usd;
    const priceStr =
      quotePrices?.toToken ||
      quotePrices?.dstToken ||
      quotePrices?.toAsset ||
      (selectedBuyAsset as any)?.price ||
      (selectedBuyAsset as any)?.priceUSD;
    if (priceStr) {
      const parsed = parseFloat(priceStr);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
    return null;
  }, [selectedBuyAsset, activeQuote.data, fusionQuote]);

  const calculatedBuyAmountUsd = useMemo(() => {
    const amt = parseFloat(calculatedBuyAmount);
    if (isNaN(amt) || amt <= 0 || !buyAssetPriceUsd) return null;
    return amt * buyAssetPriceUsd;
  }, [calculatedBuyAmount, buyAssetPriceUsd]);

  const signingWallet = isStellar(fromChainId)
    ? connectedWallets[WalletType.STELLAR]
    : connectedWallets[WalletType.EVM];

  const executionLoadingLabel =
    bridgeTxStatus === 'signing' ? 'CHECK WALLET...' : 'BUILDING ORDER...';

  // Normalize display for native-address tokens on ETH L2 chains
  // e.g. on Arbitrum the API may return symbol="ARB" for address=0x000...000
  // but the actual gas token is ETH. We correct the display without
  // touching the underlying asset data (swap logic still uses the original).
  const normalizedSellDisplay = selectedSellAsset
    ? normalizeTokenForDisplay(
        {
          symbol: (selectedSellAsset as any).symbol,
          name: (selectedSellAsset as any).name,
          logoURI: (selectedSellAsset as any).logoURI,
          address: (selectedSellAsset as any).address,
          isNative: (selectedSellAsset as any).isNative,
          type: (selectedSellAsset as any).type,
        },
        fromChainId
      )
    : null;

  const normalizedBuyDisplay = selectedBuyAsset
    ? normalizeTokenForDisplay(
        {
          symbol: (selectedBuyAsset as any).symbol,
          name: (selectedBuyAsset as any).name,
          logoURI: (selectedBuyAsset as any).logoURI,
          address: (selectedBuyAsset as any).address,
          isNative: (selectedBuyAsset as any).isNative,
          type: (selectedBuyAsset as any).type,
        },
        toChainId
      )
    : null;

  return (
    <PageLayout
      title="Token Swap"
      subtitle="Swap & Bridge"
      onBack={onClose}
      showBackButton={!!onClose}
      maxWidth="lg"
      isBeta
      betaMessage="This feature is in Beta. Please double-check the network and address crypto transactions can't be reversed."
    >
      <StellarActiveGuard bypass={!isStellarActivationRequired} onSkip={onClose}>
        {isLoadingExecution && executionCurrentStep !== 'preparing' ? (
          <SwapExecutionScreen
            actionType={actionType}
            fromChainId={fromChainId}
            toChainId={toChainId}
            sellAsset={selectedSellAsset}
            buyAsset={selectedBuyAsset}
            sellAmount={sellAmount}
            calculatedBuyAmount={calculatedBuyAmount}
            isWaitingForWallet={isWaitingForWallet}
            signingWallet={signingWallet}
            onDismiss={() => {
              swapAbortRef.current?.abort();
              resetLoadingState();
              clearPendingTx();
              resetInputs();
              setSellAmount('');
            }}
            isApprovalRequired={executionApprovalRequired}
            currentStep={executionCurrentStep}
          />
        ) : (
          <div className="mx-auto lg:px-2 sm:px-0 w-full max-w-full overflow-hidden">
            {/* Pay Card */}
            <div className="bg-tertiary rounded-2xl p-4 py-6 lg:p-6 shadow-sm relative overflow-hidden flex flex-col border border-divider/50 w-full max-w-full">
              <div
                className={`absolute left-0 top-0 bottom-0 w-1 bg-brand transition-all duration-300 ${isInputFocused ? 'opacity-100 scale-y-100' : 'opacity-0 scale-y-50'}`}
              />

              <div className="flex justify-between items-center mb-4 sm:mb-6">
                <label className="text-xs font-black uppercase tracking-[0.15em] text-muted opacity-90">
                  You Pay
                </label>
                <button
                  onClick={handleMaxAmount}
                  className="text-[10px] font-black text-brand hover:scale-110 active:scale-95 transition-all px-3 py-1 bg-brand/10 border border-brand/20 rounded-full"
                >
                  MAX
                </button>
              </div>

              <div className="flex items-center gap-3 sm:gap-4">
                <button
                  onClick={() =>
                    openAssetSelector(actionType, {
                      defaultNetwork: fromChainId,
                      pairedChainId: toChainId,
                      onSelect: (a: any) => {
                        handleChainSelectInModal(
                          isStellar(a.chainId) ? STELLAR_CHAIN_ID : Number(a.chainId),
                          true
                        );
                        setSellAssetSymbol(a.symbol);
                        setSellAssetAddress(a.address || '');
                      },
                    })
                  }
                  className="flex items-center gap-2 bg-secondary rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3 hover:bg-hover active:scale-[0.98] transition-all relative group flex-[0_0_auto] min-w-0"
                  style={{ width: 'clamp(120px, 32vw, 160px)' }}
                >
                  <div className="relative min-w-[36px] sm:min-w-[40px]">
                    <img
                      src={
                        normalizedSellDisplay?.logoURI ||
                        (selectedSellAsset as any)?.logoURI ||
                        `https://ui-avatars.com/api/?name=${sellAssetSymbol}&background=random`
                      }
                      className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-tertiary object-cover shadow-sm"
                      alt={normalizedSellDisplay?.symbol || sellAssetSymbol}
                      onError={e => {
                        e.currentTarget.src = `https://ui-avatars.com/api/?name=${normalizedSellDisplay?.symbol || sellAssetSymbol}&background=random`;
                      }}
                    />
                    <img
                      src={fromChainConfig?.logoURI}
                      className="absolute -bottom-1 -right-1 w-4 h-4 sm:w-4.5 sm:h-4.5 rounded-full border-2 border-secondary bg-secondary"
                      alt={fromChainConfig?.name}
                    />
                  </div>
                  <div className="flex flex-col items-start pr-1 min-w-0 overflow-hidden">
                    <span className="font-bold text-[13px] sm:text-[15px] leading-tight truncate w-full">
                      {normalizedSellDisplay?.symbol || sellAssetSymbol || 'Select'}
                    </span>
                    <span className="text-[8px] sm:text-[9px] text-muted font-bold tracking-tight truncate w-full uppercase">
                      {fromChainConfig?.name}
                    </span>
                  </div>
                  <ChevronDown
                    size={13}
                    className="text-muted group-hover:text-primary transition-all ml-auto flex-shrink-0"
                  />
                </button>

                <div className="flex-1 w-0 min-w-0">
                  <input
                    ref={inputRef}
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    onFocus={() => setIsInputFocused(true)}
                    onBlur={() => setIsInputFocused(false)}
                    className="w-full bg-transparent border-none text-right text-3xl sm:text-4xl font-black focus:ring-0 p-0 placeholder:text-muted/10 transition-all outline-none min-w-0 block"
                    value={sellAmount}
                    onChange={e => {
                      let val = e.target.value.replace(/[^0-9.]/g, '');
                      const parts = val.split('.');
                      if (parts.length > 2) {
                        val = parts[0] + '.' + parts.slice(1).join('');
                      }
                      if (parts.length === 2 && selectedSellAsset) {
                        const decimals = selectedSellAsset.decimals || 18;
                        if (parts[1].length > decimals) {
                          val = parts[0] + '.' + parts[1].slice(0, decimals);
                        }
                      }
                      setSellAmount(val);
                    }}
                  />
                </div>
              </div>

              <div className="mt-4 sm:mt-6 flex flex-wrap justify-between items-center gap-2 text-[10px] sm:text-[11px] font-bold">
                <div className="flex items-center gap-1.5 sm:gap-2 text-muted">
                  <button
                    onClick={handleRefreshBalances}
                    disabled={isRefreshing}
                    className={`p-1 sm:p-1.5 hover:bg-white/5 rounded-full transition-all ${isRefreshing ? 'animate-spin text-brand' : ''}`}
                  >
                    <RefreshCw size={12} />
                  </button>
                  <span>Balance:</span>
                  <span className="text-primary font-black">
                    {(selectedSellAsset as any)?.balance === undefined || isRefreshing ? (
                      <span className="inline-block w-14 h-3.5 bg-brand/30 animate-pulse rounded-full align-middle ml-1" />
                    ) : (
                      <Tooltip
                        content={`${toPlainString((selectedSellAsset as any)?.balance)} ${sellAssetSymbol}`}
                        unstyled
                      >
                        {portfolioUtils.formatBalance((selectedSellAsset as any)?.balance || '0')}{' '}
                        {sellAssetSymbol}
                      </Tooltip>
                    )}
                  </span>
                </div>
                {isInsufficientBalance && (
                  <span className="text-red-500 bg-red-500/10 px-2 sm:px-3 py-0.5 sm:py-1 rounded-full font-black flex items-center gap-1 sm:gap-1.5 text-[9px] sm:text-[11px] transition-all">
                    <span className="filter drop-shadow-[0_0_2px_rgba(239,68,68,0.5)]">☹️</span>
                    <span className="hidden xs:inline">Insufficient Balance</span>
                    <span className="xs:hidden">Insufficient</span>
                  </span>
                )}
              </div>
            </div>

            {/* Swap Middle Button */}
            <div className="flex justify-center -my-4 lg:-my-5 relative z-10">
              <div className="relative flex items-center justify-center w-12 h-12 md:w-14 md:h-14">
                {/* Outer Border Countdown / Loading Progress Ring */}
                <div
                  className={`absolute inset-0 w-full h-full select-none pointer-events-none ${isQuoteLoading ? 'animate-spin' : ''}`}
                >
                  <svg className="w-full h-full transform -rotate-90" viewBox="0 0 56 56">
                    {/* Background Ring */}
                    <circle
                      cx="28"
                      cy="28"
                      r="24"
                      className="stroke-white/5"
                      strokeWidth="2.5"
                      fill="transparent"
                    />
                    {/* Active Progress Ring */}
                    <circle
                      cx="28"
                      cy="28"
                      r="24"
                      className="stroke-brand transition-all duration-1000 origin-center"
                      strokeWidth="2.5"
                      fill="transparent"
                      strokeDasharray={`${2 * Math.PI * 24}`}
                      strokeDashoffset={
                        isQuoteLoading
                          ? 2 * Math.PI * 24 * 0.75
                          : 2 * Math.PI * 24 * (1 - timeLeft / 30)
                      }
                      strokeLinecap="round"
                    />
                  </svg>
                </div>

                <button
                  onClick={handleAssetSwap}
                  className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-secondary flex items-center justify-center shadow-lg hover:scale-115 active:scale-90 transition-all duration-300 text-brand group backdrop-blur-md border border-white/10 hover:border-brand/40 relative z-10"
                >
                  <ArrowUpDown
                    size={18}
                    className="group-hover:rotate-180 transition-transform duration-500"
                  />
                </button>
              </div>
            </div>

            {/* Receive Card */}
            <div className="bg-tertiary rounded-2xl  p-4 py-6 lg:p-6 shadow-sm relative overflow-hidden flex flex-col border border-divider/50 w-full max-w-full">
              <div className="flex justify-between items-center mb-4 sm:mb-6">
                <label className="text-xs font-black uppercase tracking-[0.15em] text-muted opacity-90">
                  You Receive
                </label>
              </div>

              <div className="flex items-center gap-3 sm:gap-4">
                <button
                  onClick={() =>
                    openAssetSelector(actionType, {
                      defaultNetwork: fromChainId,
                      pairedChainId: fromChainId,
                      onSelect: (a: any) => {
                        handleChainSelectInModal(
                          isStellar(a.chainId) ? STELLAR_CHAIN_ID : Number(a.chainId),
                          false
                        );
                        setBuyAssetSymbol(a.symbol);
                        setBuyAssetAddress(a.address || '');
                      },
                    })
                  }
                  className="flex items-center gap-2 bg-secondary rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3 hover:bg-hover active:scale-[0.98] transition-all relative group flex-[0_0_auto] min-w-0"
                  style={{ width: 'clamp(120px, 32vw, 160px)' }}
                >
                  <div className="relative min-w-[36px] sm:min-w-[40px]">
                    <img
                      src={
                        normalizedBuyDisplay?.logoURI ||
                        (selectedBuyAsset as any)?.logoURI ||
                        `https://ui-avatars.com/api/?name=${buyAssetSymbol}&background=random`
                      }
                      className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-tertiary object-cover shadow-sm"
                      alt={normalizedBuyDisplay?.symbol || buyAssetSymbol}
                      onError={e => {
                        e.currentTarget.src = `https://ui-avatars.com/api/?name=${normalizedBuyDisplay?.symbol || buyAssetSymbol}&background=random`;
                      }}
                    />
                    <img
                      src={toChainConfig?.logoURI}
                      className="absolute -bottom-1 -right-1 w-4 h-4 sm:w-4.5 sm:h-4.5 rounded-full border-2 border-secondary bg-secondary"
                      alt={toChainConfig?.name}
                    />
                  </div>
                  <div className="flex flex-col items-start pr-1 min-w-0 overflow-hidden">
                    <span className="font-bold text-[13px] sm:text-[15px] leading-tight truncate w-full">
                      {normalizedBuyDisplay?.symbol || buyAssetSymbol || 'Select'}
                    </span>
                    <span className="text-[8px] sm:text-[9px] text-muted font-bold tracking-tight truncate w-full uppercase">
                      {toChainConfig?.name?.split(' ')[0]}
                    </span>
                  </div>
                  <ChevronDown
                    size={13}
                    className="text-muted group-hover:text-primary transition-all ml-auto flex-shrink-0"
                  />
                </button>

                <div className="flex-1 w-0 min-w-0 flex flex-col items-end">
                  <div className="max-w-full overflow-x-auto whitespace-nowrap scrollbar-hide">
                    <div
                      className={`font-black text-primary transition-all duration-300 ${isSameAssetSelected ? 'text-sm sm:text-base opacity-40 tracking-wider' : 'text-3xl sm:text-4xl tabular-nums'}`}
                    >
                      {activeQuote.loading || swapQuoteLoading ? (
                        <div className="flex justify-end gap-1 items-end mt-2">
                          <div className="w-4 h-8 sm:w-6 sm:h-10 bg-white/5 animate-pulse rounded-md" />
                          <div className="w-4 h-8 sm:w-6 sm:h-10 bg-white/5 animate-pulse rounded-md delay-75" />
                          <div className="w-1 h-1 bg-white/5 animate-pulse rounded-full mb-2" />
                          <div className="w-4 h-8 sm:w-6 sm:h-10 bg-white/5 animate-pulse rounded-md delay-150" />
                          <div className="w-4 h-8 sm:w-6 sm:h-10 bg-white/5 animate-pulse rounded-md delay-200" />
                        </div>
                      ) : swapQuote || activeQuote.data || isSameAssetSelected ? (
                        <span>{calculatedBuyAmount}</span>
                      ) : (
                        '0.00'
                      )}
                    </div>
                  </div>
                  {!activeQuote.loading &&
                    !swapQuoteLoading &&
                    calculatedBuyAmountUsd !== null &&
                    !isSameAssetSelected && (
                      <div className="text-[11px] font-bold text-muted/60 mt-1">
                        ~$
                        {calculatedBuyAmountUsd.toLocaleString('en-US', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </div>
                    )}
                  {(swapQuote || activeQuote.data) && !isSameAssetSelected && !isErrorState && (
                    <div className="text-[9px] sm:text-[10px] text-green-500 font-extrabold uppercase tracking-widest mt-1 flex items-center justify-end gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full border border-green-500/30 flex items-center justify-center">
                        <div className="w-0.5 h-0.5 rounded-full bg-green-500" />
                      </div>
                      {`Refreshing in ${timeLeft}s`}
                    </div>
                  )}
                </div>
              </div>

              {/* Old Route Selector removed */}

              {/* Details Section Inside Receive Card */}
              <div
                className={`grid transition-all duration-500 ease-in-out ${(actionType === 'SWAP' && (swapQuote || (activeQuote.source === 'stellar' && activeQuote.data))) || (actionType === 'BRIDGE' && !!activeQuote.data) ? 'grid-rows-[1fr] opacity-100 mt-4' : 'grid-rows-[0fr] opacity-0 mt-0 pointer-events-none'}`}
              >
                <div className="overflow-hidden">
                  <div className="pt-5 sm:pt-6 border-t border-dotted border-white/10 space-y-1">
                    {/* Better Quote Banner */}
                    {activeQuote.alternativeQuote && (
                      <div className="flex items-center justify-between py-3 border-b border-white/5">
                        <div className="flex flex-col">
                          <span className="text-[11px] font-black uppercase tracking-widest text-[#00E08B]">
                            Best Rate Available
                          </span>
                          <span className="text-[10px] text-muted mt-0.5 font-medium">
                            Route via NEAR Intents
                          </span>
                        </div>

                        <button
                          onClick={toggleRoute}
                          className={`relative inline-flex h-[22px] w-[42px] shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                            activeQuote.source === 'near_intent' ? 'bg-[#00E08B]' : 'bg-white/10'
                          }`}
                          role="switch"
                          aria-checked={activeQuote.source === 'near_intent'}
                        >
                          <span
                            aria-hidden="true"
                            className={`pointer-events-none inline-block h-[18px] w-[18px] transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                              activeQuote.source === 'near_intent'
                                ? 'translate-x-5'
                                : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </div>
                    )}

                    {/* Provider row */}
                    {(swapQuote?.provider || activeQuote.data?.provider || activeQuote.source) && (
                      <div className="flex items-center justify-between py-2 border-b border-white/5">
                        <span className="text-[10px] font-black uppercase tracking-widest text-muted">
                          Provider
                        </span>

                        <div className="flex items-center gap-1.5">
                          {/* Fusion Plus (1inch) */}
                          {activeQuote.source === 'fusion_plus' && (
                            <img
                              src="https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x111111111117dC0aa78b770fA6A738034120C302/logo.png"
                              className="w-4 h-4 rounded-full"
                              alt="1inch Fusion+"
                            />
                          )}

                          {/* NEAR Intents */}
                          {activeQuote.source === 'near_intent' && (
                            <div className="w-4 h-4 rounded-full bg-white flex items-center justify-center p-0.5">
                              <img
                                src="https://cryptologos.cc/logos/near-protocol-near-logo.png"
                                className="w-full h-full object-contain"
                                alt="NEAR"
                              />
                            </div>
                          )}

                          {/* Allbridge */}
                          {activeQuote.source === 'bridge' && (
                            <img
                              src="/allbrg.png"
                              className="w-4 h-4 rounded-full bg-white object-contain"
                              alt="Allbridge"
                            />
                          )}

                          {/* Uniswap */}
                          {(swapQuote?.provider === 'UNISWAP' ||
                            activeQuote.data?.provider === 'UNISWAP') && (
                            <img
                              src="https://cryptologos.cc/logos/uniswap-uni-logo.png"
                              className="w-4 h-4 rounded-full"
                              alt="Uniswap"
                            />
                          )}

                          <span className="text-[11px] font-black text-brand uppercase tracking-wider">
                            {activeQuote.source === 'fusion_plus'
                              ? '1inch Fusion+'
                              : activeQuote.source === 'near_intent'
                                ? 'NEAR Intents'
                                : activeQuote.source === 'bridge'
                                  ? 'Allbridge'
                                  : swapQuote?.provider ||
                                    activeQuote.data?.provider ||
                                    activeQuote.source?.toUpperCase() ||
                                    'UNISWAP'}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Rate row */}
                    <div className="flex items-center justify-between py-2 border-b border-white/5">
                      <span className="text-[10px] font-black uppercase tracking-widest text-muted">
                        Rate
                      </span>
                      <span className="text-[11px] font-black text-primary truncate ml-2 flex-1 w-0 text-right min-w-0">
                        1 {sellAssetSymbol} ≈ {portfolioUtils.formatBalance(conversionRate)}{' '}
                        {buyAssetSymbol}
                      </span>
                    </div>

                    {/* SWAP specific rows */}
                    {actionType === 'SWAP' && (
                      <>
                        <div className="flex items-center justify-between py-2 border-b border-white/5">
                          <span className="text-[10px] font-black uppercase tracking-widest text-muted">
                            Max Slippage
                          </span>
                          <span
                            className={`text-[11px] font-black ${isGasless && showFusionScreen ? 'text-green-500' : 'text-primary'}`}
                          >
                            {isGasless && showFusionScreen ? 'None' : `${userSlippageTolerance}%`}
                          </span>
                        </div>

                        <div className="flex items-center justify-between py-2 border-b border-white/5">
                          <span className="text-[10px] font-black uppercase tracking-widest text-muted">
                            Network Fee
                          </span>
                          {isGasless && showFusionScreen ? (
                            <span className="text-[11px] font-black text-green-500 line-through opacity-60">
                              ~0.0021 {fromChainConfig?.nativeCurrency.symbol}
                            </span>
                          ) : isStellar(fromChainId) ? (
                            <span className="text-[11px] font-black text-primary">
                              ~0.00001 XLM
                            </span>
                          ) : (
                            <span className="text-[11px] font-black text-primary">
                              {swapQuote?.networkFee && swapQuote.networkFee > 0
                                ? `~${swapQuote.networkFee.toFixed(6)} ${fromChainConfig?.nativeCurrency.symbol}`
                                : '—'}
                            </span>
                          )}
                        </div>

                        {!isStellar(fromChainId) && (
                          <div className="flex items-center justify-between py-2 border-b border-white/5">
                            <span className="text-[10px] font-black uppercase tracking-widest text-muted">
                              Gasless Swap
                            </span>
                            <button
                              onClick={() => setIsGasless(!isGasless)}
                              className={`relative w-8 h-4 rounded-full transition-colors ${isGasless ? 'bg-green-500' : 'bg-white/10'}`}
                            >
                              <div
                                className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-transform ${isGasless ? 'translate-x-4' : 'translate-x-0'}`}
                              />
                            </button>
                          </div>
                        )}

                        {isStellar(fromChainId) &&
                          activeQuote.source === 'stellar' &&
                          activeQuote.data && (
                            <>
                              <div className="flex items-center justify-between py-2 border-b border-white/5">
                                <span className="text-[10px] font-black uppercase tracking-widest text-muted">
                                  Price Impact
                                </span>
                                <span
                                  className={`text-[11px] font-black ${activeQuote.data.priceImpact > 2 ? 'text-red-500' : 'text-green-500'}`}
                                >
                                  {activeQuote.data.priceImpact.toFixed(2)}%
                                </span>
                              </div>
                            </>
                          )}
                      </>
                    )}

                    {/* BRIDGE specific rows */}
                    {actionType === 'BRIDGE' && (
                      <>
                        {activeQuote.source === 'fusion_plus' &&
                          activeQuote.data &&
                          (() => {
                            const q = activeQuote.data;
                            const preset = (q.recommended_preset ||
                              'fast') as keyof FusionQuote['presets'];
                            const presetData = q.presets?.[preset];
                            const totalTime = presetData
                              ? presetData.startAuctionIn + presetData.auctionDuration
                              : 180;
                            const formattedTime =
                              totalTime < 60
                                ? `${totalTime}s`
                                : `${Math.round(totalTime / 60)} min`;
                            return (
                              <>
                                <div className="flex items-center justify-between py-2 border-b border-white/5">
                                  <span className="text-[10px] font-black uppercase tracking-widest text-muted">
                                    Price Impact
                                  </span>
                                  <span
                                    className={`text-[11px] font-black ${q.priceImpactPercent > 2 ? 'text-orange-500' : 'text-primary'}`}
                                  >
                                    {q.priceImpactPercent > 0
                                      ? q.priceImpactPercent > 5
                                        ? `${q.priceImpactPercent.toFixed(2)}% High`
                                        : `${q.priceImpactPercent.toFixed(2)}%`
                                      : '0.00%'}
                                  </span>
                                </div>

                                <div className="flex items-center justify-between py-2 border-b border-white/5">
                                  <span className="text-[10px] font-black uppercase tracking-widest text-muted">
                                    Protocol Fee
                                  </span>
                                  <span className="text-[11px] font-black text-primary">
                                    {q.fee?.bps ? `${(q.fee.bps / 100).toFixed(2)}%` : '0.30%'}
                                  </span>
                                </div>

                                <div className="flex items-center justify-between py-2 border-b border-white/5">
                                  <span className="text-[10px] font-black uppercase tracking-widest text-muted">
                                    Estimated Fee
                                  </span>
                                  <span className="text-[11px] font-black text-primary">
                                    {(() => {
                                      try {
                                        const feeRaw =
                                          presetData?.tokenFee || presetData?.costInDstToken || '0';
                                        const addr = q.feeToken?.toLowerCase();

                                        const feeTokenInfo = (() => {
                                          if (!addr) {
                                            return {
                                              symbol: buyAssetSymbol,
                                              decimals: selectedBuyAsset?.decimals || 18,
                                              price:
                                                q.prices?.usd?.toToken || q.prices?.usd?.dstToken,
                                            };
                                          }
                                          if (selectedSellAsset?.address?.toLowerCase() === addr) {
                                            return {
                                              symbol: sellAssetSymbol,
                                              decimals: selectedSellAsset.decimals || 18,
                                              price:
                                                q.prices?.usd?.fromToken || q.prices?.usd?.srcToken,
                                            };
                                          }
                                          if (selectedBuyAsset?.address?.toLowerCase() === addr) {
                                            return {
                                              symbol: buyAssetSymbol,
                                              decimals: selectedBuyAsset.decimals || 18,
                                              price:
                                                q.prices?.usd?.toToken || q.prices?.usd?.dstToken,
                                            };
                                          }
                                          const found = swapAssets.find(
                                            a => a.address?.toLowerCase() === addr
                                          );
                                          if (found) {
                                            return {
                                              symbol: found.symbol,
                                              decimals: found.decimals || 18,
                                              price:
                                                (found as any).price || (found as any).priceUSD,
                                            };
                                          }
                                          const destTokens = getTokensForChain(toChainId);
                                          const foundDest = destTokens.find(
                                            t => t.address?.toLowerCase() === addr
                                          );
                                          if (foundDest) {
                                            return {
                                              symbol: foundDest.symbol,
                                              decimals: foundDest.decimals || 18,
                                              price:
                                                (foundDest as any).price ||
                                                (foundDest as any).priceUSD,
                                            };
                                          }
                                          if (
                                            addr === '0xd6df932a45c0f255f85145f286ea0b292b21c90b'
                                          ) {
                                            return {
                                              symbol: 'ARB',
                                              decimals: 18,
                                              price:
                                                q.prices?.usd?.fromToken ||
                                                q.prices?.usd?.srcToken ||
                                                0.9,
                                            };
                                          }
                                          return {
                                            symbol: buyAssetSymbol,
                                            decimals: selectedBuyAsset?.decimals || 18,
                                            price:
                                              q.prices?.usd?.toToken || q.prices?.usd?.dstToken,
                                          };
                                        })();

                                        const feeDec = feeTokenInfo.decimals;
                                        const feeValue = parseFloat(
                                          ethers.formatUnits(feeRaw, feeDec)
                                        );
                                        const feeTokenPrice = parseFloat(feeTokenInfo.price || '0');

                                        const feeFormatted =
                                          feeValue >= 0.0001
                                            ? feeValue.toFixed(4)
                                            : feeValue.toFixed(6);

                                        const feeUsd =
                                          feeTokenPrice > 0 ? feeValue * feeTokenPrice : 0;
                                        const feeUsdFormatted =
                                          feeUsd > 0
                                            ? ` (~$${feeUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })})`
                                            : '';

                                        return `${feeFormatted} ${feeTokenInfo.symbol}${feeUsdFormatted}`;
                                      } catch (err) {
                                        console.error('Failed to calculate token fee:', err);
                                        return '—';
                                      }
                                    })()}
                                  </span>
                                </div>

                                <div className="flex items-center justify-between py-2 border-b border-white/5">
                                  <span className="text-[10px] font-black uppercase tracking-widest text-muted">
                                    Est. Time
                                  </span>
                                  <span className="text-[11px] font-black text-primary">
                                    ~{formattedTime}
                                  </span>
                                </div>
                              </>
                            );
                          })()}

                        {activeQuote.source === 'near_intent' && activeQuote.data && (
                          <>
                            <div className="flex items-center justify-between py-2 border-b border-white/5">
                              <span className="text-[10px] font-black uppercase tracking-widest text-muted">
                                Est. Time
                              </span>
                              <span className="text-[11px] font-black text-primary">
                                ~{Math.max(1, Math.round(activeQuote.data.timeEstimate / 60))} min
                              </span>
                            </div>
                            {activeQuote.data.withdrawFee && (
                              <div className="flex items-center justify-between py-2 border-b border-white/5">
                                <span className="text-[10px] font-black uppercase tracking-widest text-muted">
                                  Withdraw Fee
                                </span>
                                <span className="text-[11px] font-black text-primary">
                                  {parseFloat(
                                    ethers.formatUnits(
                                      activeQuote.data.withdrawFee || '0',
                                      selectedBuyAsset?.decimals || 18
                                    )
                                  ).toFixed(4)}{' '}
                                  {buyAssetSymbol}
                                </span>
                              </div>
                            )}
                          </>
                        )}

                        {activeQuote.source === 'bridge' && activeQuote.data && (
                          <>
                            {activeQuote.data.fee &&
                              (activeQuote.data.fee.native || activeQuote.data.fee.stablecoin) && (
                                <div className="flex items-center justify-between py-2 border-b border-white/5">
                                  <span className="text-[10px] font-black uppercase tracking-widest text-muted">
                                    Bridge Fee
                                  </span>
                                  <div className="flex items-center gap-1.5">
                                    {(() => {
                                      const currentFee =
                                        activeQuote.data.fee[feePayType] ||
                                        activeQuote.data.fee.stablecoin ||
                                        activeQuote.data.fee.native;
                                      return (
                                        <>
                                          <span className="text-[11px] font-black text-primary">
                                            {Number(currentFee.amount).toFixed(4)}
                                          </span>
                                          <span className="text-[9px] font-black text-muted">
                                            {currentFee.symbol}
                                          </span>
                                          {feePayType === 'stablecoin' && (
                                            <span className="text-[9px] font-bold text-muted/60 lowercase ml-1">
                                              (deducted from amount)
                                            </span>
                                          )}
                                        </>
                                      );
                                    })()}
                                    {activeQuote.data.fee.native &&
                                      activeQuote.data.fee.stablecoin && (
                                        <div className="flex items-center gap-1 bg-secondary/50 rounded-full p-0.5 ml-1">
                                          <button
                                            onClick={() => setFeePayType('native')}
                                            className={`p-0.5 rounded-full transition-all flex items-center justify-center ${feePayType === 'native' ? 'bg-primary/20 ring-1 ring-primary/50' : 'opacity-40 hover:opacity-100'}`}
                                            title={`Pay with ${activeQuote.data.fee.native.symbol}`}
                                          >
                                            <img
                                              src={
                                                fromChainConfig?.nativeCurrency.logoURI ||
                                                `https://ui-avatars.com/api/?name=${activeQuote.data.fee.native.symbol}&background=random`
                                              }
                                              className="w-4 h-4 rounded-full object-cover"
                                              alt="Native"
                                            />
                                          </button>
                                          <button
                                            onClick={() => setFeePayType('stablecoin')}
                                            className={`p-0.5 rounded-full transition-all flex items-center justify-center ${feePayType === 'stablecoin' ? 'bg-primary/20 ring-1 ring-primary/50' : 'opacity-40 hover:opacity-100'}`}
                                            title={`Pay with ${activeQuote.data.fee.stablecoin.symbol}`}
                                          >
                                            <img
                                              src={
                                                swapAssets.find(
                                                  a =>
                                                    a.symbol.toUpperCase() ===
                                                    activeQuote.data.fee.stablecoin.symbol.toUpperCase()
                                                )?.logoURI ||
                                                `https://ui-avatars.com/api/?name=${activeQuote.data.fee.stablecoin.symbol}&background=random`
                                              }
                                              className="w-4 h-4 rounded-full object-cover"
                                              alt="Stable"
                                            />
                                          </button>
                                        </div>
                                      )}
                                  </div>
                                </div>
                              )}

                            <div className="flex items-center justify-between py-2 border-b border-white/5">
                              <span className="text-[10px] font-black uppercase tracking-widest text-muted">
                                Est. Time
                              </span>
                              <span className="text-[11px] font-black text-primary">
                                ~
                                {activeQuote.data.completionTime
                                  ? Math.max(1, Math.round(activeQuote.data.completionTime / 60000))
                                  : 5}{' '}
                                min
                              </span>
                            </div>
                          </>
                        )}
                      </>
                    )}
                    {/* Min received */}
                    <div className="flex items-center justify-between py-2">
                      <span className="text-[10px] font-black uppercase tracking-widest text-muted">
                        Min. Received
                      </span>
                      <span className="text-[12px] font-black text-brand truncate ml-2 flex-1 w-0 text-right min-w-0">
                        {portfolioUtils.formatBalance(minimumReceived)} {buyAssetSymbol}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="relative group/action ">
              {bridgeTxStatus === 'preparing' && !isWaitingForWallet && (
                <div className="flex items-center gap-2 bg-blue-500/8 border border-blue-500/20 rounded-2xl px-4 py-2.5 mb-2 animate-in fade-in slide-in-from-top-2 duration-300">
                  <span className="text-blue-400 text-sm leading-none animate-spin">⟳</span>
                  <p className="text-[11px] font-semibold text-blue-400/80">
                    Building your swap order — please wait, do not close this window.
                  </p>
                </div>
              )}
              {((swapQuote as any)?.priceImpact > 5 ||
                activeQuote.data?.priceImpact > 5 ||
                activeQuote.data?.priceImpactPercent > 5) &&
                !isLoadingExecution &&
                !isErrorState && (
                  <div className="flex items-start gap-3 rounded-xl border border-yellow-500/20 bg-yellow-500/10 px-4 py-3 mb-3">
                    <div className="mt-0.5 text-yellow-500">⚠️</div>

                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-yellow-700 dark:text-yellow-300">
                        High Price Impact
                      </p>

                      <p className="mt-1 text-xs text-yellow-700/80 dark:text-yellow-200/80">
                        This trade may execute at a significantly different price due to low
                        liquidity. Price impact is greater than 5%.
                      </p>
                    </div>
                  </div>
                )}

              <ActionGuard
                title="Connect Wallet"
                requiredWallets={requiredWallets}
                disabled={isLoadingExecution}
              >
                <TransactionButton
                  label={buttonLabel}
                  loadingLabel={executionLoadingLabel}
                  isLoading={isLoadingExecution}
                  isDisabled={isSwapDisabled}
                  isError={!!isErrorState && !isLoadingExecution}
                  onClick={handleUnifiedSwap}
                  icon={
                    isGasless && actionType === 'SWAP' ? (
                      <Zap size={20} className="fill-white" />
                    ) : undefined
                  }
                  className={`relative z-10 ${isErrorState && !isLoadingExecution ? ' border-t-red-500/20 mt-5' : 'mt-5'}`}
                />
              </ActionGuard>
            </div>
          </div>
        )}

        {showFusionScreen && fusionQuote && !isLoadingExecution && (
          <FusionQuoteScreen
            quote={fusionQuote}
            chainId={fromChainId}
            sellAsset={selectedSellAsset}
            buyAsset={selectedBuyAsset}
            onBack={() => {
              setShowFusionScreen(false);
            }}
            loading={isFusionLoading}
            fusionStatus={fusionStatus}
            error={swapError || bridgeErrorMsg}
            txHash={swapTxHash}
            onRefreshQuote={
              !isFusionLoading && !swapTxHash && selectedSellAsset && selectedBuyAsset && sellAmount
                ? async () => {
                    try {
                      setIsFusionLoading(true);
                      await fetchFusionQuote(
                        selectedSellAsset as any,
                        selectedBuyAsset as any,
                        sellAmount
                      );
                    } catch (err) {
                      console.error('Refresh quote failed:', err);
                      setShowFusionScreen(false);
                      setBridgeErrorMsg(parseWalletError(err));
                    } finally {
                      setIsFusionLoading(false);
                    }
                  }
                : undefined
            }
            onConfirm={async preset => {
              setIsFusionLoading(true);
              setFusionStatus('idle');
              try {
                const hash = await performFusionSwap(
                  selectedSellAsset as any,
                  selectedBuyAsset as any,
                  sellAmount,
                  preset,
                  setSwapProgressStatus,
                  undefined,
                  () => setBridgeTxStatus('signing')
                );
                handleReset();
                showToast({
                  type: 'EVM_SWAP',
                  title: 'Order Submitted',
                  message: `Gasless order for ${sellAmount} ${sellAssetSymbol} submitted successfully.`,
                });
                if (hash) {
                  useTransactionModalStore.getState().openModal({
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
                console.error('Fusion swap failed:', err);
                setBridgeErrorMsg(parseWalletError(err));
                resetLoadingState();
                setBridgeTxStatus('error');
                showToast({
                  type: 'EVM_SWAP',
                  title: 'Swap Failed',
                  message: parseWalletError(err),
                  dontSave: true,
                });
              } finally {
                setIsFusionLoading(false);
              }
            }}
          />
        )}
      </StellarActiveGuard>
    </PageLayout>
  );
};

export default SwapAssets;
