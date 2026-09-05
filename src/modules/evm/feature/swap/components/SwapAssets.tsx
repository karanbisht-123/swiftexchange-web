import {
  AlertCircle,
  ArrowRight,
  ArrowUpDown,
  ChevronDown,
  RefreshCw,
  Settings,
  Zap,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { ethers } from 'ethers';

import { Tooltip } from '../../../../../components/common/Tooltip';
import PageLayout from '../../../../../components/layout/PageLayout';
import { useNotificationStore } from '../../../../../store/notificationStore';
import { useSwapStore } from '../../../../../store/swapStore';
import { useTransactionModalStore } from '../../../../../store/transactionModalStore';
import { rejectPendingWCRequest } from '../../../../../utils/walletConnectUtils';
import { ActionGuard } from '../../../../commonfeature/components/ActionGuard';
import TransactionButton from '../../../../commonfeature/components/TransactionButton';
import { useAssetSelectorModal } from '../../../../commonfeature/components/useAssetSelectorModal';
import { AmmSwapService } from '../../../../stellar/service/ammSwapService';
import { StellarActivationBanner } from '../../../../walletconnect/components/StellarActivationBanner';
import { getStellarConfig } from '../../../../walletconnect/config/chains';
import { WalletType } from '../../../../walletconnect/constants/Wallet';
import { useStellarAccountStatus } from '../../../../walletconnect/hooks/useStellarAccountStatus';
import { useWalletConnect } from '../../../../walletconnect/hooks/useWalletConnect';
import { useGlobalTxStore } from '../../../../walletconnect/store/globalTxStore';
import { useWalletStore } from '../../../../walletconnect/store/walletConnectStore';
import { portfolioUtils } from '../../../../walletconnect/utils/portfolioUtils';
import { getTokensForChain } from '../../../service/tokenListService';
import {
  getAssetsForChain,
  getChainById,
  getGlobalAssetMetadata,
  isEvmChain,
  normalizeTokenForDisplay,
} from '../../../utils/Chainregistry';
import { switchOrAddChain } from '../../../utils/evmChainUtils';
import { STELLAR_CHAIN_ID } from '../constants/swap.constants';
import { useEvmSwap } from '../hooks/useEvmSwap';
import { useNearIntentCrossChain } from '../hooks/useNearIntentCrossChain';
import { useSwapAssetDefaults } from '../hooks/useSwapAssetDefaults';
import { useSwapExecution } from '../hooks/useSwapExecution';
import { useSwapQuote } from '../hooks/useSwapQuote';
import { useSwapValidation } from '../hooks/useSwapValidation';
import type { FusionQuote } from '../types/swap.types';
import { calculateMaxSwapAmount, toPlainString } from '../utils/swapAmountUtils';
import { isSameAsset, isStellar, matchesAddress } from '../utils/swapAssetUtils';
import { parseSwapError } from '../utils/swapErrorHandler';
import { ActivationModal } from './ActivationModal';
import FusionQuoteScreen from './FusionQuoteScreen';
import SlippageSettingsModal from './SlippageSettingsModal';
import { SwapExecutionScreen } from './SwapExecutionScreen';

interface SwapAssetsProps {
  onClose?: () => void;
}

const SwapAssets: React.FC<SwapAssetsProps> = ({ onClose }) => {
  const navigate = useNavigate();
  const { connectedWallets, getProvider } = useWalletConnect();
  const { showToast } = useNotificationStore();

  const evmWallet = connectedWallets[WalletType.EVM];
  const stellarWallet = connectedWallets[WalletType.STELLAR];
  const isConnected = !!evmWallet || !!stellarWallet;
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
    setUserSlippageTolerance,
    feePayType,
    setFeePayType,
    resetInputs,
  } = useSwapStore();

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [trustlineRefreshNonce, setTrustlineRefreshNonce] = useState(0);

  useEffect(() => {
    const handleRefresh = () => setTrustlineRefreshNonce(prev => prev + 1);
    window.addEventListener('stellar-trustline-added', handleRefresh);
    return () => window.removeEventListener('stellar-trustline-added', handleRefresh);
  }, []);
  const [crossChainWarning, setCrossChainWarning] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

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

  const missingWallets = useMemo(() => {
    return requiredWallets.filter(type => !connectedWallets[type]);
  }, [requiredWallets, connectedWallets]);

  const isSellWalletConnected = useMemo(() => {
    if (isStellar(fromChainId)) return !!stellarAddress;
    return !!evmAddress;
  }, [fromChainId, stellarAddress, evmAddress]);

  const { openAssetSelector } = useAssetSelectorModal();
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    txHash: swapTxHash,
    assets: swapAssets,
    error: swapError,
    isFetchingAssets: isFetchingSwapAssets,
    quoteLoading: swapQuoteLoading,
    fetchTokenList,
    updateTokenBalances,
    performSwap,
    performFusionSwap,
    reset: resetSwap,
  } = useEvmSwap({
    chainId: fromChainId,
    senderAddress: evmAddress,
    getProvider,
  });

  const { isChainSwitching, setIsChainSwitching } = useSwapAssetDefaults({
    connectedWallets,
    currentChainId: currentChainId !== null ? Number(currentChainId) : null,
    currentNetwork,
    isConnected,
    getProvider,
  });

  const { isActive: isStellarAccountActive } = useStellarAccountStatus(stellarAddress);

  useEffect(() => {
    if (
      toChainId === STELLAR_CHAIN_ID &&
      isStellarAccountActive === false &&
      buyAssetSymbol !== 'XLM'
    ) {
      setBuyAssetSymbol('XLM');
      setBuyAssetAddress('native');
    }
  }, [toChainId, isStellarAccountActive, buyAssetSymbol, setBuyAssetSymbol, setBuyAssetAddress]);

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
      const stellarMatch = stellarAssets.find((a: any) =>
        sellAssetAddress
          ? matchesAddress(a, sellAssetAddress) || a.symbol === sellAssetSymbol
          : a.symbol === sellAssetSymbol
      );
      if (stellarMatch) return stellarMatch;
      const chainAssets = getAssetsForChain(fromChainId);
      const chainAsset = chainAssets.find((a: any) =>
        sellAssetAddress
          ? matchesAddress(a, sellAssetAddress) || a.symbol === sellAssetSymbol
          : a.symbol === sellAssetSymbol
      );
      if (chainAsset) {
        return {
          id: `stellar-${fromChainId}-${chainAsset.symbol}`,
          symbol: chainAsset.symbol,
          name: chainAsset.name || chainAsset.symbol,
          logoURI: chainAsset.logoURI || getGlobalAssetMetadata(chainAsset.symbol)?.logoURI,
          balance: '0',
          decimals: chainAsset.decimals || 7,
          isNative: chainAsset.isNative,
          chainId: STELLAR_CHAIN_ID,
          address: chainAsset.address,
        };
      }
      if (sellAssetSymbol) {
        return {
          id: `stellar-${fromChainId}-${sellAssetSymbol}`,
          symbol: sellAssetSymbol,
          name: sellAssetSymbol,
          logoURI: getGlobalAssetMetadata(sellAssetSymbol)?.logoURI,
          balance: '0',
          decimals: 7,
          isNative: sellAssetSymbol === 'XLM',
          chainId: STELLAR_CHAIN_ID,
          address: sellAssetAddress || 'native',
        };
      }
      return undefined;
    }

    if (sellAssetAddress) {
      const match = swapAssets.find((a: any) => matchesAddress(a, sellAssetAddress));
      if (match) return match;
    }
    const symbolMatch = swapAssets.find((a: any) => a.symbol === sellAssetSymbol);
    if (symbolMatch) return symbolMatch;

    const chainAssets = getAssetsForChain(fromChainId);
    const chainAsset = chainAssets.find((a: any) =>
      sellAssetAddress
        ? matchesAddress(a, sellAssetAddress) || a.symbol === sellAssetSymbol
        : a.symbol === sellAssetSymbol
    );
    if (chainAsset) return chainAsset;

    const destTokens = getTokensForChain(fromChainId);
    const tokenMatch = destTokens.find((t: any) =>
      sellAssetAddress
        ? matchesAddress(t, sellAssetAddress) || t.symbol === sellAssetSymbol
        : t.symbol === sellAssetSymbol
    );
    if (tokenMatch) return tokenMatch;

    if (sellAssetSymbol) {
      return {
        id: `evm-${fromChainId}-${sellAssetSymbol}`,
        symbol: sellAssetSymbol,
        name: sellAssetSymbol,
        logoURI: getGlobalAssetMetadata(sellAssetSymbol)?.logoURI,
        balance: '0',
        decimals: 18,
        address: sellAssetAddress || '',
        chainId: Number(fromChainId) || fromChainId,
      };
    }
    return undefined;
  }, [swapAssets, sellAssetSymbol, sellAssetAddress, stellarAssets, fromChainId]);

  const selectedBuyAsset = useMemo(() => {
    if (isStellar(toChainId)) {
      const stellarMatch = stellarAssets.find((a: any) =>
        buyAssetAddress
          ? matchesAddress(a, buyAssetAddress) || a.symbol === buyAssetSymbol
          : a.symbol === buyAssetSymbol
      );
      if (stellarMatch) return stellarMatch;
      const chainAssets = getAssetsForChain(toChainId);
      const chainAsset = chainAssets.find((a: any) =>
        buyAssetAddress
          ? matchesAddress(a, buyAssetAddress) || a.symbol === buyAssetSymbol
          : a.symbol === buyAssetSymbol
      );
      if (chainAsset) {
        return {
          id: `stellar-${toChainId}-${chainAsset.symbol}`,
          symbol: chainAsset.symbol,
          name: chainAsset.name || chainAsset.symbol,
          logoURI: chainAsset.logoURI || getGlobalAssetMetadata(chainAsset.symbol)?.logoURI,
          balance: '0',
          decimals: chainAsset.decimals || 7,
          isNative: chainAsset.isNative,
          chainId: STELLAR_CHAIN_ID,
          address: chainAsset.address,
        };
      }
      if (buyAssetSymbol) {
        return {
          id: `stellar-${toChainId}-${buyAssetSymbol}`,
          symbol: buyAssetSymbol,
          name: buyAssetSymbol,
          logoURI: getGlobalAssetMetadata(buyAssetSymbol)?.logoURI,
          balance: '0',
          decimals: 7,
          isNative: buyAssetSymbol === 'XLM',
          chainId: STELLAR_CHAIN_ID,
          address: buyAssetAddress || 'native',
        };
      }
      return undefined;
    }

    const destTokens = getTokensForChain(toChainId);
    if (buyAssetAddress) {
      const match = destTokens.find((t: any) => matchesAddress(t, buyAssetAddress));
      if (match) return match;
    }
    const symbolMatch = destTokens.find((t: any) => t.symbol === buyAssetSymbol);
    if (symbolMatch) return symbolMatch;

    if (buyAssetAddress) {
      const match = swapAssets.find((a: any) => matchesAddress(a, buyAssetAddress));
      if (match) return match;
    }
    const swapSymbolMatch = swapAssets.find((a: any) => a.symbol === buyAssetSymbol);
    if (swapSymbolMatch) return swapSymbolMatch;

    const chainAssets = getAssetsForChain(toChainId);
    const chainAsset = chainAssets.find((a: any) =>
      buyAssetAddress
        ? matchesAddress(a, buyAssetAddress) || a.symbol === buyAssetSymbol
        : a.symbol === buyAssetSymbol
    );
    if (chainAsset) return chainAsset;

    if (buyAssetSymbol) {
      return {
        id: `evm-${toChainId}-${buyAssetSymbol}`,
        symbol: buyAssetSymbol,
        name: buyAssetSymbol,
        logoURI: getGlobalAssetMetadata(buyAssetSymbol)?.logoURI,
        balance: '0',
        decimals: 18,
        address: buyAssetAddress || '',
        chainId: Number(toChainId) || toChainId,
      };
    }
    return undefined;
  }, [swapAssets, buyAssetSymbol, buyAssetAddress, stellarAssets, toChainId, fromChainId]);

  const isSameAssetSelected = useMemo(() => {
    return (
      actionType === 'SWAP' &&
      fromChainId === toChainId &&
      isSameAsset(selectedSellAsset, selectedBuyAsset) &&
      !!selectedSellAsset
    );
  }, [actionType, fromChainId, toChainId, selectedSellAsset, selectedBuyAsset]);

  const { currentQuote, setCurrentQuote, timeLeft, isQuoteLoading } = useSwapQuote({
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
    isStellarAccountActive,
  });

  const { executeDeposit: executeNearIntentDeposit } = useNearIntentCrossChain({
    evmAddress,
    stellarAddress,
    getProvider,
    currentNetwork,
  });

  const toggleRoute = useCallback(() => {
    setCurrentQuote(prev => {
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
  }, [setCurrentQuote]);

  const resetQuotes = useCallback(() => {
    resetSwap();
    setCurrentQuote({ source: null, data: null, error: null, loading: false });
    setBridgeErrorMsg(null);
    setCrossChainWarning(null);
    setBridgeTxStatus('idle');
  }, [resetSwap, setCurrentQuote, setBridgeErrorMsg, setBridgeTxStatus]);

  const handleReset = useCallback(() => {
    resetSwap();
    useSwapStore.getState().clearPendingTx();
    setCurrentQuote({ source: null, data: null, error: null, loading: false });
    setCrossChainWarning(null);
    setSellAmount('');
    setShowFusionScreen(false);
  }, [resetSwap, setCurrentQuote, setSellAmount]);

  const {
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
    isStellarAccountActive,
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
    currentQuote,
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
    missingWallets,
    isStellarAccountActive,
  });

  useEffect(() => {
    if (fromChainId && !isStellar(fromChainId)) {
      fetchTokenList();
    }
  }, [fromChainId, fetchTokenList]);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    if (swapError || bridgeTxStatus === 'error' || currentQuote.error) {
      timeoutId = setTimeout(() => {
        resetSwap();
        setBridgeTxStatus('idle');
        setCurrentQuote(prev => ({ ...prev, error: null }));
      }, 6000);
    }
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [swapError, bridgeTxStatus, currentQuote.error, resetSwap]);

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
    if (
      (isStellar(fromChainId) || isStellar(toChainId)) &&
      ammService &&
      bridgeTxStatus === 'idle'
    ) {
      const fetchStellar = async () => {
        setIsFetchingStellarAssets(true);
        try {
          const { tokens: balances, subentryCount } = await ammService.getAssetsWithBalances(
            stellarAddress || ''
          );
          const reserve = 1 + subentryCount * 0.5 + 0.05;
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
  }, [
    fromChainId,
    toChainId,
    stellarAddress,
    ammService,
    sellAssetSymbol,
    actionType,
    isStellarAccountActive,
    bridgeTxStatus,
    trustlineRefreshNonce,
  ]);

  const initializedChainsRef = useRef<{ from: any; to: any }>({ from: null, to: null });

  useEffect(() => {
    if (swapAssets.length > 0 && !isChainSwitching && !isStellar(fromChainId)) {
      if (
        initializedChainsRef.current.from === fromChainId &&
        initializedChainsRef.current.to === toChainId
      ) {
        return;
      }

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
      initializedChainsRef.current = { from: fromChainId, to: toChainId };
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
    }
  }, [sellAmount, resetQuotes]);

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
      // User-rejection errors clear faster so the button recovers immediately
      const isUserCancel = /user cancelled|user rejected|user denied|ACTION_REJECTED/i.test(
        swapError || bridgeErrorMsg || ''
      );
      const delay = isUserCancel ? 1500 : 5000;
      timeoutId = setTimeout(() => {
        if (swapError) resetSwap();
        if (bridgeErrorMsg) {
          setBridgeErrorMsg(null);
          setBridgeTxStatus('idle');
        }
      }, delay);
    }
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [swapError, bridgeErrorMsg, resetSwap, setBridgeErrorMsg, setBridgeTxStatus]);

  useEffect(() => {
    if (swapError || bridgeErrorMsg || bridgeTxStatus === 'error') {
      setIsWaitingForWallet(false);
      isSubmittingRef.current = false;
    }
  }, [swapError, bridgeErrorMsg, bridgeTxStatus, setIsWaitingForWallet, isSubmittingRef]);

  const handleMaxAmount = useCallback(() => {
    if (!selectedSellAsset || selectedSellAsset.balance === undefined) return;

    const maxAmt = calculateMaxSwapAmount({
      balance: selectedSellAsset.balance,
      decimals: selectedSellAsset.decimals || 18,
      isNative: selectedSellAsset.isNative,
      chainId: fromChainId,
      isGasless: isGasless || currentQuote.source === 'FUSION_PLUS',
      networkFee: currentQuote.source === 'EVM_SWAP' ? currentQuote.data?.networkFee : undefined,
      actionType,
      feePayType,
      bridgeNativeFee: currentQuote.data?.fee?.native?.amount || null,
    });

    setSellAmount(maxAmt);
  }, [
    selectedSellAsset,
    fromChainId,
    isGasless,
    currentQuote.source,
    currentQuote.data,
    actionType,
    feePayType,
    setSellAmount,
  ]);

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
          const reserve = 1 + subentryCount * 0.5 + 0.05;
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
    const quotePrices = currentQuote.data?.prices?.usd;
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
  }, [selectedBuyAsset, currentQuote.data]);

  const calculatedBuyAmountUsd = useMemo(() => {
    const amt = parseFloat(calculatedBuyAmount);
    if (isNaN(amt) || amt <= 0 || !buyAssetPriceUsd) return null;
    return amt * buyAssetPriceUsd;
  }, [calculatedBuyAmount, buyAssetPriceUsd]);

  const signingWallet = isStellar(fromChainId)
    ? connectedWallets[WalletType.STELLAR]
    : connectedWallets[WalletType.EVM];
  const executionLoadingLabel = (() => {
    if (bridgeTxStatus === 'signing') return 'CHECK WALLET...';
    if (executionCurrentStep === 'approving') return 'APPROVING TOKEN...';
    return 'BUILDING ORDER...';
  })();

  // Normalize display for native-address tokens on ETH L2 chains
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
          onDismiss={async () => {
            const { status, pendingRequest, clearPending } = useGlobalTxStore.getState();
            if (status === 'pending' && pendingRequest && selectedSellAsset) {
              const provider = getProvider(selectedSellAsset.walletType);
              if (provider) {
                useNotificationStore.getState().showToast({
                  type: 'EVM_SWAP',
                  title: 'Cancelling...',
                  message: 'If you already approved this in your wallet, this may not stop it.',
                  dontSave: true,
                });
                await rejectPendingWCRequest(provider, pendingRequest.id, pendingRequest.topic);
              }
              clearPending();
            }
            swapAbortRef.current?.abort();
            resetLoadingState();
            clearPendingTx();
            resetInputs();
            setSellAmount('');
          }}
          isApprovalRequired={executionApprovalRequired}
          currentStep={executionCurrentStep}
          status={bridgeTxStatus === 'error' ? 'error' : 'pending'}
          errorMsg={bridgeErrorMsg}
          isStellarAccountActive={isStellarAccountActive}
        />
      ) : (
        <div className="mx-auto lg:px-2 sm:px-0 w-full max-w-full overflow-hidden space-y-4">
          {isStellar(fromChainId) && (
            <div className="flex flex-col gap-4">
              <StellarActivationBanner
                onSwitchToEVM={
                  isConnected
                    ? () => {
                        setFromChainId(137);
                        setToChainId(137);
                        setSellAssetSymbol('USDT');
                        setBuyAssetSymbol('USDC');
                        setSellAssetAddress('');
                        setBuyAssetAddress('');
                      }
                    : undefined
                }
              />
              {isStellarAccountActive !== false && (
                <div className="relative overflow-hidden rounded-[16px] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] shadow-sm flex flex-col justify-center p-4 sm:px-5 sm:py-4 w-full min-h-[110px] group">
                  <div className="absolute inset-0 z-0 pointer-events-none">
                    <img
                      src="/38823-560x240.jpg"
                      alt="Stellar Portfolio Background"
                      className="absolute right-0 top-0 bottom-0 h-full w-[150%] sm:w-[90%] object-cover object-right sm:object-right opacity-90 transition-transform duration-1000 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-r from-[var(--color-bg-secondary)] via-[var(--color-bg-secondary)]/90 to-transparent" />
                  </div>

                  <div className="relative z-10 flex flex-col max-w-[240px] sm:max-w-[320px]">
                    <h3 className="text-base sm:text-base font-black text-[var(--color-text-primary)] tracking-tight leading-tight">
                      Track Your{' '}
                      <span className="text-[var(--color-brand-accent)]">Stellar Portfolio</span>
                    </h3>
                    <p className="text-[10px] sm:text-[11px] text-[var(--color-text-secondary)] mt-1 leading-snug font-medium">
                      Real-time PnL, performance insights, and net worth across all your wallets.
                    </p>
                    <button
                      onClick={() => navigate('/stellar/portfolio')}
                      className="mt-3 w-fit flex items-center gap-1.5 px-4 py-1.5 sm:py-2 bg-[var(--color-brand-primary)] hover:bg-[var(--color-brand-primary-hover)] text-[var(--color-text-inverse)] font-bold text-[11px] sm:text-xs rounded-full transition-all active:scale-95 shadow-sm"
                    >
                      Explore PnL{' '}
                      <ArrowRight
                        size={13}
                        className="group-hover:translate-x-1 transition-transform"
                      />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
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
                  {!isSellWalletConnected ? (
                    <span>--</span>
                  ) : isRefreshing || (selectedSellAsset as any)?.balance === undefined ? (
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
              <div
                className={`absolute inset-0 w-full h-full select-none pointer-events-none ${isQuoteLoading ? 'animate-spin' : ''}`}
              >
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 56 56">
                  <circle
                    cx="28"
                    cy="28"
                    r="24"
                    className="stroke-white/5"
                    strokeWidth="2.5"
                    fill="transparent"
                  />
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
                    {currentQuote.loading || swapQuoteLoading ? (
                      <div className="flex justify-end gap-1 items-end mt-2">
                        <div className="w-4 h-8 sm:w-6 sm:h-10 bg-white/5 animate-pulse rounded-md" />
                        <div className="w-4 h-8 sm:w-6 sm:h-10 bg-white/5 animate-pulse rounded-md delay-75" />
                        <div className="w-1 h-1 bg-white/5 animate-pulse rounded-full mb-2" />
                        <div className="w-4 h-8 sm:w-6 sm:h-10 bg-white/5 animate-pulse rounded-md delay-150" />
                        <div className="w-4 h-8 sm:w-6 sm:h-10 bg-white/5 animate-pulse rounded-md delay-200" />
                      </div>
                    ) : currentQuote.data || isSameAssetSelected ? (
                      <span>{calculatedBuyAmount}</span>
                    ) : (
                      '0.00'
                    )}
                  </div>
                </div>
                {!currentQuote.loading &&
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
                {currentQuote.data && !isSameAssetSelected && !isErrorState && (
                  <div className="text-[9px] sm:text-[10px] text-green-500 font-extrabold uppercase tracking-widest mt-1 flex items-center justify-end gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full border border-green-500/30 flex items-center justify-center">
                      <div className="w-0.5 h-0.5 rounded-full bg-green-500" />
                    </div>
                    {`Refreshing in ${timeLeft}s`}
                  </div>
                )}
              </div>
            </div>

            <div
              className={`grid transition-all duration-500 ease-in-out ${currentQuote.data ? 'grid-rows-[1fr] opacity-100 mt-4' : 'grid-rows-[0fr] opacity-0 mt-0 pointer-events-none'}`}
            >
              <div className="overflow-hidden">
                <div className="pt-5 sm:pt-6 border-t border-dotted border-white/10 space-y-1">
                  {currentQuote.alternativeQuote && (
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
                          currentQuote.source === 'NEAR_INTENT' ? 'bg-[#00E08B]' : 'bg-white/10'
                        }`}
                        role="switch"
                        aria-checked={currentQuote.source === 'NEAR_INTENT'}
                      >
                        <span
                          aria-hidden="true"
                          className={`pointer-events-none inline-block h-[18px] w-[18px] transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                            currentQuote.source === 'NEAR_INTENT'
                              ? 'translate-x-5'
                              : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>
                  )}
                  {currentQuote.data && (
                    <div className="flex items-center justify-between py-2 border-b border-white/5">
                      <span className="text-[10px] font-black uppercase tracking-widest text-muted">
                        Provider
                      </span>

                      <div className="flex items-center gap-1.5">
                        {currentQuote.source === 'FUSION_PLUS' && (
                          <img
                            src="https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x111111111117dC0aa78b770fA6A738034120C302/logo.png"
                            className="w-4 h-4 rounded-full"
                            alt="1inch Fusion+"
                          />
                        )}
                        {currentQuote.source === 'NEAR_INTENT' && (
                          <div className="w-4 h-4 rounded-full bg-white flex items-center justify-center p-0.5">
                            <img
                              src="https://cryptologos.cc/logos/near-protocol-near-logo.png"
                              className="w-full h-full object-contain"
                              alt="NEAR"
                            />
                          </div>
                        )}
                        {currentQuote.data?.provider === 'UNISWAP' && (
                          <img
                            src="https://cryptologos.cc/logos/uniswap-uni-logo.png"
                            className="w-4 h-4 rounded-full"
                            alt="Uniswap"
                          />
                        )}

                        <span className="text-[11px] font-black text-brand uppercase tracking-wider">
                          {currentQuote.source === 'FUSION_PLUS'
                            ? '1inch Fusion+'
                            : currentQuote.source === 'NEAR_INTENT'
                              ? 'NEAR Intents'
                              : currentQuote.data?.provider || currentQuote.source || 'UNISWAP'}
                        </span>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center justify-between py-2 border-b border-white/5">
                    <span className="text-[10px] font-black uppercase tracking-widest text-muted">
                      Rate
                    </span>
                    <span className="text-[11px] font-black text-primary truncate ml-2 flex-1 w-0 text-right min-w-0">
                      1 {sellAssetSymbol} ≈ {portfolioUtils.formatBalance(conversionRate)}{' '}
                      {buyAssetSymbol}
                    </span>
                  </div>
                  {(actionType === 'SWAP' || currentQuote.source === 'FUSION_PLUS') &&
                    !isStellar(fromChainId) && (
                      <>
                        <div className="flex items-center justify-between py-2 border-b border-white/5">
                          <span className="text-[10px] font-black uppercase tracking-widest text-muted">
                            Max Slippage
                          </span>
                          <button
                            onClick={() => setIsSettingsOpen(true)}
                            className="flex items-center gap-1.5 group"
                            title="Open swap settings"
                          >
                            <span
                              className={`text-[11px] font-black ${isGasless && showFusionScreen ? 'text-green-500' : 'text-primary'}`}
                            >
                              {isGasless && showFusionScreen ? 'None' : `${userSlippageTolerance}%`}
                            </span>
                            <Settings
                              size={11}
                              className="text-muted group-hover:text-brand transition-colors"
                            />
                          </button>
                        </div>

                        {actionType === 'SWAP' && (
                          <>
                            <div className="flex items-center justify-between py-2 border-b border-white/5">
                              <span className="text-[10px] font-black uppercase tracking-widest text-muted">
                                Network Fee
                              </span>
                              {isGasless && showFusionScreen ? (
                                <div className="flex items-center gap-2">
                                  {currentQuote.data?.networkFee &&
                                    currentQuote.data.networkFee > 0 && (
                                      <span className="text-[11px] font-black text-muted line-through opacity-60">
                                        ~{currentQuote.data.networkFee.toFixed(6)}{' '}
                                        {fromChainConfig?.nativeCurrency.symbol}
                                      </span>
                                    )}
                                  <span className="text-[11px] font-black text-green-500">
                                    Free
                                  </span>
                                </div>
                              ) : (
                                <span className="text-[11px] font-black text-primary">
                                  {currentQuote.data?.networkFee && currentQuote.data.networkFee > 0
                                    ? `~${currentQuote.data.networkFee.toFixed(6)} ${fromChainConfig?.nativeCurrency.symbol}`
                                    : '—'}
                                </span>
                              )}
                            </div>

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
                          </>
                        )}

                        {isStellar(fromChainId) &&
                          currentQuote.source === 'STELLAR_SWAP' &&
                          currentQuote.data && (
                            <>
                              <div className="flex items-center justify-between py-2 border-b border-white/5">
                                <span className="text-[10px] font-black uppercase tracking-widest text-muted">
                                  Price Impact
                                </span>
                                <span
                                  className={`text-[11px] font-black ${currentQuote.data.priceImpact > 2 ? 'text-red-500' : 'text-green-500'}`}
                                >
                                  {currentQuote.data.priceImpact.toFixed(2)}%
                                </span>
                              </div>
                            </>
                          )}
                      </>
                    )}
                  {actionType === 'BRIDGE' && (
                    <>
                      {currentQuote.source === 'FUSION_PLUS' &&
                        currentQuote.data &&
                        (() => {
                          const q = currentQuote.data;
                          const preset = (q.recommended_preset ||
                            'fast') as keyof FusionQuote['presets'];
                          const presetData = q.presets?.[preset];
                          const totalTime = presetData
                            ? presetData.startAuctionIn + presetData.auctionDuration
                            : 180;
                          const formattedTime =
                            totalTime < 60 ? `${totalTime}s` : `${Math.round(totalTime / 60)} min`;
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
                                            price: (found as any).price || (found as any).priceUSD,
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
                                        if (addr === '0xd6df932a45c0f255f85145f286ea0b292b21c90b') {
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
                                          price: q.prices?.usd?.toToken || q.prices?.usd?.dstToken,
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

                      {currentQuote.source === 'NEAR_INTENT' && currentQuote.data && (
                        <>
                          <div className="flex items-center justify-between py-2 border-b border-white/5">
                            <span className="text-[10px] font-black uppercase tracking-widest text-muted">
                              Est. Time
                            </span>
                            <span className="text-[11px] font-black text-primary">
                              ~{Math.max(1, Math.round(currentQuote.data.timeEstimate / 60))} min
                            </span>
                          </div>
                          {currentQuote.data.withdrawFee && (
                            <div className="flex items-center justify-between py-2 border-b border-white/5">
                              <span className="text-[10px] font-black uppercase tracking-widest text-muted">
                                Withdraw Fee
                              </span>
                              <span className="text-[11px] font-black text-primary">
                                {parseFloat(
                                  ethers.formatUnits(
                                    currentQuote.data.withdrawFee || '0',
                                    selectedBuyAsset?.decimals || 18
                                  )
                                ).toFixed(4)}{' '}
                                {buyAssetSymbol}
                              </span>
                            </div>
                          )}
                        </>
                      )}
                    </>
                  )}
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
            {(currentQuote.data?.priceImpact > 5 || currentQuote.data?.priceImpactPercent > 5) &&
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

            {currentQuote.error &&
              !isLoadingExecution &&
              (currentQuote.error === 'Trustline required' ||
              currentQuote.error === 'Account activation required' ? (
                <div className="flex items-start gap-3 rounded-xl border border-blue-500/20 bg-blue-500/10 px-4 py-3 mb-3">
                  <div className="mt-0.5 text-blue-500">
                    <AlertCircle size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-blue-700 dark:text-blue-300">
                      Action Required
                    </p>
                    <p className="mt-1 text-xs text-blue-700/80 dark:text-blue-200/80">
                      {currentQuote.error}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 mb-3">
                  <div className="mt-0.5 text-red-500">
                    <AlertCircle size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-red-700 dark:text-red-300">
                      Quote Error
                    </p>
                    <p className="mt-1 text-xs text-red-700/80 dark:text-red-200/80">
                      {currentQuote.error}
                    </p>
                  </div>
                </div>
              ))}

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

      {showFusionScreen && currentQuote.data && !isLoadingExecution && (
        <FusionQuoteScreen
          quote={currentQuote.data}
          chainId={fromChainId}
          sellAsset={selectedSellAsset}
          buyAsset={selectedBuyAsset}
          onBack={() => {
            setShowFusionScreen(false);
          }}
          loading={isFusionLoading}
          fusionStatus={
            executionCurrentStep === 'approving' || executionCurrentStep === 'signing'
              ? executionCurrentStep
              : 'idle'
          }
          error={swapError || bridgeErrorMsg}
          txHash={swapTxHash}
          onRefreshQuote={undefined}
          onConfirm={async preset => {
            setIsFusionLoading(true);

            try {
              const hash = await performFusionSwap(
                selectedSellAsset as any,
                selectedBuyAsset as any,
                sellAmount,
                preset,
                setSwapProgressStatus,
                currentQuote.data,
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
              const errMsg = parseSwapError(err);
              setBridgeErrorMsg(errMsg);
              resetLoadingState();
              setBridgeTxStatus('error');
              useTransactionModalStore.getState().openModal({
                status: 'error',
                type: 'Swap',
                error: errMsg,
                isStellar: false,
              });
              showToast({
                type: 'EVM_SWAP',
                title: 'Swap Failed',
                message: errMsg,
                dontSave: true,
              });
            } finally {
              setIsFusionLoading(false);
            }
          }}
        />
      )}
      <SlippageSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        userSlippageTolerance={userSlippageTolerance}
        setUserSlippageTolerance={setUserSlippageTolerance}
      />
      <ActivationModal />
    </PageLayout>
  );
};

export default SwapAssets;
