import {
  ArrowUpDown,
  ChevronDown,
  RefreshCw,
  Zap
} from 'lucide-react';


import React, { useCallback, useEffect, useState, useRef, useMemo } from 'react';
import { ethers } from 'ethers';
import { useSearchParams } from 'react-router-dom';

import PageLayout from '../../../../components/layout/PageLayout';
import type { SwapQuoteRequest } from '../../../../types/evm/swap.types';
import { WalletType } from '../../../walletconnect/constants/Wallet';
import { useWalletConnect } from '../../../walletconnect/hooks/useWalletConnect';
import { useWalletStore } from '../../../walletconnect/store/walletConnectStore';
import TransactionButton from '../../../commonfeature/components/TransactionButton';
import { useEvmSwap } from '../../hook/useEvmSwap';
import { determineSwapType } from '../../utils/evmSwapUtils';
import { getEvmSwapEnabledChains, getChainById, isEvmChain, getGlobalAssetMetadata } from '../../utils/Chainregistry';
import { useAssetSelectorModal } from '../../../commonfeature/components/useAssetSelectorModal';
import { portfolioUtils } from '../../../walletconnect/utils/portfolioUtils';
import { EvmTransactionSuccessModal } from '../../components/EvmTransactionSuccessModal';
import StellarTransactionModal from '../../../steallr/components/modals/StellarTransactionModal';
import { ActionGuard } from '../../../commonfeature/components/ActionGuard';
import { switchOrAddChain } from '../../utils/evmChainUtils';
import FusionQuoteScreen from './components/FusionQuoteScreen';
import { parseSwapError } from '../../utils/swapErrorHandler';
import { getTokensForChain } from '../../service/tokenListService';
import { addLocalTransaction } from '../../service/localTransactionService';

import { getBridgeQuote as getEvmBridgeQuote, prepareBridgeTransaction } from '../../service/evmSwapService';
import {
  getBridgeQuote as getStellarBridgeQuote,
  getSupportedTokens,
  prepareStellarToEvmRawTransaction,
  STELLAR_NETWORK_PASSPHRASE
} from '../../../steallr/service/allbridgeService';
import { ChainSymbol, FeePaymentMethod, Messenger } from '@allbridge/bridge-core-sdk';
import { signAndSubmitTransaction } from '../../../steallr/utils/transactionService';
import { AmmSwapService } from '../../../steallr/service/ammSwapService';
import { getStellarConfig } from '../../../walletconnect/config/chains';

const STELLAR_CHAIN_ID = 9000000;
const isStellar = (id: any) => id === 'stellar' || Number(id) === STELLAR_CHAIN_ID || Number(id) === 9000001;

interface SwapAssetsProps {
  onClose?: () => void;
}

const SwapAssets: React.FC<SwapAssetsProps> = ({ onClose }) => {
  const { connectedWallets, getProvider } = useWalletConnect();
  const [searchParams, setSearchParams] = useSearchParams();

  const evmWallet = connectedWallets[WalletType.EVM];
  const stellarWallet = connectedWallets[WalletType.STELLAR];
  const isConnected = !!evmWallet;
  const evmAddress = evmWallet?.address || '';
  const stellarAddress = stellarWallet?.address || '';
  const currentChainId = evmWallet?.chainId ? Number(evmWallet.chainId) : null;
  const currentNetwork = useWalletStore((state: any) => state.network) as 'mainnet' | 'testnet';
  const swapEnabledChains = getEvmSwapEnabledChains(currentNetwork);
  const [fromChainId, setFromChainId] = useState<number>(() => {
    const raw = searchParams.get('fromChainId');
    if (raw === 'stellar') return STELLAR_CHAIN_ID;
    return raw ? Number(raw) : (currentChainId || 1);
  });

  const [toChainId, setToChainId] = useState<number>(() => {
    const raw = searchParams.get('toChainId');
    if (raw === 'stellar') return STELLAR_CHAIN_ID;
    return raw ? Number(raw) : (currentChainId || 1);
  });

  const [sellAssetSymbol, setSellAssetSymbol] = useState<string>(searchParams.get('sellAsset') || '');
  const [sellAssetAddress, setSellAssetAddress] = useState<string>(searchParams.get('sellAddress') || '');
  const [buyAssetSymbol, setBuyAssetSymbol] = useState<string>(searchParams.get('buyAsset') || '');
  const [buyAssetAddress, setBuyAssetAddress] = useState<string>(searchParams.get('buyAddress') || '');
  const [sellAmount, setSellAmount] = useState<string>('');

  const slippageTolerance = 0.5;


  const [isChainSwitching, setIsChainSwitching] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [timeLeft, setTimeToNextRefresh] = useState(30);

  const [bridgeQuoteData, setBridgeQuoteData] = useState<any>(null);
  const [isFetchingBridgeQuote, setIsFetchingBridgeQuote] = useState(false);
  const [feePayType, setFeePayType] = useState<'native' | 'stablecoin'>('stablecoin');
  const [bridgeTxStatus, setBridgeTxStatus] = useState<'idle' | 'preparing' | 'signing' | 'success' | 'error'>('idle');
  const [bridgeTxHash, setBridgeTxHash] = useState<string | null>(null);
  const [bridgeErrorMsg, setBridgeErrorMsg] = useState<string | null>(null);
  const [crossChainQuoteSource, setCrossChainQuoteSource] = useState<'bridge' | 'rango' | null>(null);
  const [crossChainWarning, setCrossChainWarning] = useState<string | null>(null);

  const [ammService, setAmmService] = useState<AmmSwapService | null>(null);
  const [stellarAssets, setStellarAssets] = useState<any[]>([]);
  const [stellarSwapQuote, setStellarSwapQuote] = useState<any>(null);
  const [isFetchingStellarAssets, setIsFetchingStellarAssets] = useState(false);
  const [isFetchingStellarQuote, setIsFetchingStellarQuote] = useState(false);

  const actionType = useMemo(() => fromChainId === toChainId ? 'SWAP' : 'BRIDGE', [fromChainId, toChainId]);

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
    loading: swapLoading,
    error: swapError,
    isFetchingAssets: isFetchingSwapAssets,
    quoteLoading: swapQuoteLoading,
    fetchTokenList,
    updateTokenBalances,
    fetchQuote: fetchSwapQuoteInternal,
    fetchFusionQuote,
    performSwap,
    performFusionSwap,
    isGasless,
    setGasless,
    fusionQuote,
    rangoQuote,
    fetchRangoQuote,
    confirmRangoRoute,
    checkRangoApproval,
    prepareRangoTx,
    reset: resetSwap,
  } = useEvmSwap({
    chainId: fromChainId,
    senderAddress: evmAddress,
    getProvider,
  });



  const [showFusionScreen, setShowFusionScreen] = useState(false);
  const [isFusionLoading, setIsFusionLoading] = useState(false);


  const fromChainConfig = getChainById(fromChainId);
  const toChainConfig = getChainById(toChainId);


  useEffect(() => {
    if (isStellar(fromChainId) || isStellar(toChainId)) {
      try {
        const config = getStellarConfig(currentNetwork);
        const service = new AmmSwapService(config.horizonUrl, config.networkPassphrase, config.chainId);
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
      return swapAssets.find(a => a.address.toLowerCase() === sellAssetAddress.toLowerCase());
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
        return destTokens.find(t => t.address.toLowerCase() === buyAssetAddress.toLowerCase());
      }
      return destTokens.find(t => t.symbol === buyAssetSymbol);
    }
    if (buyAssetAddress) {
      return swapAssets.find(a => a.address.toLowerCase() === buyAssetAddress.toLowerCase());
    }
    return swapAssets.find(a => a.symbol === buyAssetSymbol);
  }, [swapAssets, buyAssetSymbol, buyAssetAddress, stellarAssets, toChainId, fromChainId]);

  useEffect(() => {
    const params = new URLSearchParams();
    params.set('fromChainId', String(fromChainId));
    params.set('toChainId', String(toChainId));
    if (sellAssetSymbol) params.set('sellAsset', sellAssetSymbol);
    if (sellAssetAddress) params.set('sellAddress', sellAssetAddress);
    if (buyAssetSymbol) params.set('buyAsset', buyAssetSymbol);
    if (buyAssetAddress) params.set('buyAddress', buyAssetAddress);
    setSearchParams(params, { replace: true });
  }, [fromChainId, toChainId, sellAssetSymbol, sellAssetAddress, buyAssetSymbol, buyAssetAddress, setSearchParams]);

  useEffect(() => {
    if (currentChainId && swapEnabledChains.some(c => c.chainId === currentChainId)) {
      if (!searchParams.get('fromChainId')) setFromChainId(currentChainId);
      if (!searchParams.get('toChainId')) setToChainId(currentChainId);
    }
  }, [currentChainId, searchParams, swapEnabledChains]);

  useEffect(() => {
    resetSwap();
    setBridgeTxStatus('idle');
    setBridgeTxHash(null);
    setStellarSwapQuote(null);
    setBridgeQuoteData(null);
    setCrossChainQuoteSource(null);
    setCrossChainWarning(null);
    setBridgeErrorMsg(null);

    if (fromChainId && !isStellar(fromChainId)) {
      fetchTokenList();
    }
  }, [fromChainId, toChainId, sellAssetSymbol, resetSwap, actionType, fetchTokenList]);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    if (swapError || bridgeTxStatus === 'error') {
      timeoutId = setTimeout(() => {
        resetSwap();
        setBridgeTxStatus('idle');
      }, 6000);
    }
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [swapError, bridgeTxStatus, resetSwap]);
  useEffect(() => {
    if (isConnected && !isChainSwitching) {
      if (isStellar(fromChainId)) {
        return;
      }
      if (selectedSellAsset) {
        updateTokenBalances(selectedSellAsset as any);
      }
    }
  }, [selectedSellAsset?.address, isConnected, evmAddress, stellarAddress, isChainSwitching, updateTokenBalances, swapAssets.length, actionType, fromChainId]);

  useEffect(() => {
    if ((isStellar(fromChainId) || isStellar(toChainId)) && stellarAddress && ammService) {
      const fetchStellar = async () => {
        setIsFetchingStellarAssets(true);
        try {
          const { tokens: balances, subentryCount } = await ammService.getAssetsWithBalances(stellarAddress);
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
              hasTrustline: b.hasTrustline
            };
          });
          setStellarAssets(mapped);
          if (actionType === 'SWAP') {
            if (!sellAssetSymbol && mapped.length > 0) {
              setSellAssetSymbol(mapped[0].symbol);
              setSellAssetAddress(mapped[0].address || "");
            }
            if (!buyAssetSymbol && mapped.length > 1) {
              const destToken = mapped.find(t => t.symbol !== sellAssetSymbol) || mapped[1];
              setBuyAssetSymbol(destToken.symbol);
              setBuyAssetAddress(destToken.address || "");
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
    if (swapAssets.length > 0 && !sellAssetSymbol && !buyAssetSymbol && !isChainSwitching) {
      const nativeAsset = swapAssets.find(a => a.isNative);
      const usdcAsset = swapAssets.find(a => a.symbol === 'USDC' || a.symbol === 'USDT' || a.symbol === 'USDS');

      if (nativeAsset && usdcAsset) {
        setSellAssetSymbol(nativeAsset.symbol);
        setSellAssetAddress(nativeAsset.address);
        setBuyAssetSymbol(usdcAsset.symbol);
        setBuyAssetAddress(usdcAsset.address);
      } else if (swapAssets.length >= 2) {
        setSellAssetSymbol(swapAssets[0].symbol);
        setSellAssetAddress(swapAssets[0].address);
        setBuyAssetSymbol(swapAssets[1].symbol);
        setBuyAssetAddress(swapAssets[1].address);
      }
    }
  }, [swapAssets, sellAssetSymbol, buyAssetSymbol, isChainSwitching]);

  const getUsdValue = useCallback((amount: string, asset: any): number | null => {
    if (!amount || !asset) return null;
    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed <= 0) return null;
    const price = parseFloat(asset.price || asset.priceUSD || '0');
    if (price > 0) return parsed * price;
    return null;
  }, []);

  const isBridgeSupported = useCallback((symbol: string, chainId: number): boolean => {
    const chainConfig = getChainById(chainId);
    if (!chainConfig?.bridgeSupportTokens?.length) return false;
    return chainConfig.bridgeSupportTokens.some((t: any) => t.symbol.toUpperCase() === symbol.toUpperCase());
  }, []);


  const fetchUnifiedQuote = useCallback(async () => {
    if (!sellAmount || parseFloat(sellAmount) <= 0 || isChainSwitching || isFusionLoading || showFusionScreen) {
      setBridgeQuoteData(null);
      return;
    }

    setCrossChainWarning(null);

    if (actionType === 'SWAP') {
      if (isStellar(fromChainId) && ammService) {
        if (!selectedSellAsset || !selectedBuyAsset) return;
        try {
          const fromAsset = (selectedSellAsset as any).asset;
          const toAsset = (selectedBuyAsset as any).asset;
          if (!fromAsset || !toAsset) return;

          setIsFetchingStellarQuote(true);
          const sq = await ammService.getSwapQuote(fromAsset, toAsset, sellAmount, { slippageTolerance });
          setStellarSwapQuote(sq);
        } catch (err) {
          console.error('Stellar quote error:', err);
          setStellarSwapQuote(null);
        } finally {
          setIsFetchingStellarQuote(false);
        }
      } else {
        if (!selectedSellAsset || !selectedBuyAsset || selectedSellAsset.address?.toLowerCase() === selectedBuyAsset.address?.toLowerCase()) return;
        try {
          const swapType = determineSwapType(selectedSellAsset as any, selectedBuyAsset as any);
          const quoteRequest: SwapQuoteRequest = {
            tokenIn: {
              symbol: selectedSellAsset.symbol,
              name: selectedSellAsset.symbol,
              decimals: (selectedSellAsset as any).decimals || 18,
              address: selectedSellAsset.address || '',
              balance: (selectedSellAsset as any).balance || '0',
              logoUri: null,
            },
            tokenOut: {
              symbol: selectedBuyAsset.symbol,
              name: selectedBuyAsset.symbol,
              decimals: (selectedBuyAsset as any).decimals || 18,
              address: selectedBuyAsset.address || '',
              balance: (selectedBuyAsset as any).balance || '0',
              logoUri: null,
            },
            amount: sellAmount,
            swapType,
          };
          await fetchSwapQuoteInternal(quoteRequest, selectedSellAsset as any, selectedBuyAsset as any);
        } catch (err: any) {
          if (err?.message === 'Quote request cancelled' || err?.message === 'Quote request superseded') return;
          console.error('Swap quote error:', err);
        }
      }
    } else {
      if (!selectedSellAsset || !selectedBuyAsset) return;

      if (isStellar(fromChainId)) {
        setIsFetchingBridgeQuote(true);
        try {
          const tokens = await getSupportedTokens();
          const fromChainSym = ChainSymbol.SRB;
          let toChainSym: any = toChainConfig?.nativeCurrency.symbol;

          // Locally map BNB and AVAX symbols to Allbridge-specific codes
          if (toChainSym === 'BNB') toChainSym = ChainSymbol.BSC;
          if (toChainSym === 'AVAX') toChainSym = ChainSymbol.AVA;

          const src = tokens.find(t => t.chainSymbol === fromChainSym && t.symbol.toUpperCase() === sellAssetSymbol.toUpperCase());
          const dst = tokens.find(t => t.chainSymbol === toChainSym && t.symbol.toUpperCase() === buyAssetSymbol.toUpperCase());

          if (src && dst) {
            const sq = await getStellarBridgeQuote({ amount: sellAmount, sourceToken: src, destinationToken: dst, slippageTolerance });
            setBridgeQuoteData({
              ...sq,
              minimumAmountOut: sq.amountToBeReceived,
              conversionRate: sq.exchangeRate,
              completionTime: sq.transferTimeMs,
              fee: {
                native: {
                  amount: sq.feeOptions.native.float,
                  symbol: fromChainConfig?.nativeCurrency.symbol
                },
                stablecoin: sq.feeOptions.stablecoin ? {
                  amount: sq.feeOptions.stablecoin.float,
                  symbol: 'USDC'
                } : null
              }
            });
          }
        } catch (err) {
          console.error('Bridge quote error:', err);
          setBridgeQuoteData(null);
        } finally {
          setIsFetchingBridgeQuote(false);
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

      setIsFetchingBridgeQuote(true);
      setCrossChainWarning(null);

      try {
        if (shouldUseBridge) {
          setCrossChainQuoteSource('bridge');
          const bdgQ = await getEvmBridgeQuote(fromChainId, toChainId, sellAmount, sellAssetSymbol, buyAssetSymbol);
          if (!bdgQ || (Array.isArray(bdgQ) && bdgQ.length === 0) || (bdgQ && typeof bdgQ === 'object' && !bdgQ.minimumAmountOut && !bdgQ.quotes)) {
            throw new Error('Bridge quotes empty');
          }
          setBridgeQuoteData(bdgQ);
        } else {
          setCrossChainQuoteSource('rango');
          await fetchRangoQuote(fromChainId, toChainId, selectedSellAsset as any, selectedBuyAsset as any, sellAmount);
          setBridgeQuoteData(null);
        }
      } catch (err: any) {
        if (shouldUseBridge) {
          console.warn('Bridge quotes failed, falling back to Rango:', err);
          const bdgError = parseSwapError(err);
          setCrossChainWarning(`Bridge unavailable: ${bdgError}. Showing Rango route instead.`);
          setCrossChainQuoteSource('rango');
          setBridgeQuoteData(null);
          try {
            await fetchRangoQuote(fromChainId, toChainId, selectedSellAsset as any, selectedBuyAsset as any, sellAmount);
          } catch (rangoErr: any) {
            if (rangoErr?.message === 'Quote request cancelled' || rangoErr?.message === 'Quote request superseded') return;
            console.error('Rango fallback also failed:', rangoErr);
            setCrossChainWarning(parseSwapError(rangoErr));
          }
        } else {
          if (err?.message === 'Quote request cancelled' || err?.message === 'Quote request superseded') return;
          console.error('Rango quote failed:', err);
          const customError = parseSwapError(err);
          setCrossChainWarning(customError);
        }
      } finally {
        setIsFetchingBridgeQuote(false);
      }
    }
  }, [actionType, fromChainId, toChainId, selectedSellAsset, selectedBuyAsset, sellAmount, sellAssetSymbol, buyAssetSymbol, fetchSwapQuoteInternal, isChainSwitching, fromChainConfig, toChainConfig, slippageTolerance, isFusionLoading, showFusionScreen, isBridgeSupported, getUsdValue, fetchRangoQuote, ammService]);


  const resetQuotes = useCallback(() => {
    resetSwap();
    setStellarSwapQuote(null);
    setBridgeQuoteData(null);
    setBridgeErrorMsg(null);
    setCrossChainQuoteSource(null);
    setCrossChainWarning(null);
    setBridgeTxStatus('idle');
  }, [resetSwap]);

  const isInsufficientBalance = useMemo(() => {
    if (!sellAmount || !selectedSellAsset) return false;
    return parseFloat(sellAmount) > parseFloat((selectedSellAsset as any)?.balance || '0');
  }, [sellAmount, selectedSellAsset]);

  const isSameAssetSelected = useMemo(() => {
    return actionType === 'SWAP' && fromChainId === toChainId && selectedSellAsset?.symbol === selectedBuyAsset?.symbol && !!selectedSellAsset;
  }, [actionType, fromChainId, toChainId, selectedSellAsset, selectedBuyAsset]);

  const hasActiveCrossChainQuote = useMemo(() => {
    if (actionType !== 'BRIDGE' || isStellar(fromChainId)) return false;
    return crossChainQuoteSource === 'bridge' ? !!bridgeQuoteData : !!rangoQuote;
  }, [actionType, fromChainId, crossChainQuoteSource, bridgeQuoteData, rangoQuote]);

  const isErrorState = swapError || isInsufficientBalance || bridgeTxStatus === 'error' || isSameAssetSelected;

  const isLoadingExecution = actionType === 'SWAP' ? (isStellar(fromChainId) ? ['preparing', 'signing'].includes(bridgeTxStatus) : (swapLoading || isFusionLoading)) : ['preparing', 'signing'].includes(bridgeTxStatus);

  const buttonLabel = useMemo(() => {
    if (isFetchingSwapAssets || isFetchingBridgeQuote || isFetchingStellarAssets) return 'FETCHING QUOTES...';
    if (!sellAmount || parseFloat(sellAmount) <= 0) return 'ENTER AMOUNT';
    if (isSameAssetSelected) return 'SELECT DIFFERENT ASSET';
    if (isInsufficientBalance) return 'INSUFFICIENT BALANCE';
    if (swapError && actionType === 'SWAP') return 'SWAP FAILED';

    if (isStellar(toChainId) && selectedBuyAsset && !selectedBuyAsset.isNative && !selectedBuyAsset.hasTrustline) {
      return actionType === 'SWAP' ? 'ADD TRUSTLINE & SWAP' : 'ADD TRUSTLINE & BRIDGE';
    }

    return actionType === 'SWAP' ? 'SWAP' : 'BRIDGE';
  }, [isFetchingSwapAssets, isFetchingBridgeQuote, isFetchingStellarAssets, sellAmount, isInsufficientBalance, swapError, actionType, isSameAssetSelected, toChainId, selectedBuyAsset]);
  useEffect(() => {
    if (!sellAmount || parseFloat(sellAmount) <= 0) {
      resetQuotes();
    } else {
      if (bridgeErrorMsg) setBridgeErrorMsg(null);
      if (bridgeTxStatus === 'error') setBridgeTxStatus('idle');
    }
  }, [sellAmount, resetQuotes, bridgeErrorMsg, bridgeTxStatus]);

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

    const shouldPauseTimer = isLoadingExecution || isChainSwitching || showFusionScreen || isSameAssetSelected;

    if (sellAmount && parseFloat(sellAmount) > 0 && !shouldPauseTimer) {
      timer = setInterval(() => {
        setTimeToNextRefresh((prev) => {
          if (prev <= 1) {
            fetchUnifiedQuote();
            return 30;
          }
          return prev - 1;
        });
      }, 1000);
    } else {

      if (!shouldPauseTimer) setTimeToNextRefresh(30);
    }

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [sellAmount, isLoadingExecution, isChainSwitching, showFusionScreen, fetchUnifiedQuote, isSameAssetSelected]);

  const handleMaxAmount = useCallback(() => {
    if (selectedSellAsset && selectedSellAsset.balance !== undefined) {
      try {
        const decimals = selectedSellAsset.decimals || 18;
        const balanceBN = ethers.parseUnits(selectedSellAsset.balance, decimals);
        if (balanceBN === BigInt(0)) { setSellAmount('0'); return; }
        let maxAmountBN = balanceBN;
        if (selectedSellAsset.isNative) {
          const bufferBN = ethers.parseUnits('0.006', decimals);
          maxAmountBN = balanceBN > bufferBN ? balanceBN - bufferBN : balanceBN;
        }
        const formatted = ethers.formatUnits(maxAmountBN, decimals);
        setSellAmount(formatted.replace(/\.?0+$/, ''));
      } catch (err) { setSellAmount(selectedSellAsset.balance); }
    }
  }, [selectedSellAsset]);

  const handleReset = useCallback(() => {
    resetSwap();
    setBridgeTxHash(null);
    setBridgeTxStatus('idle');
    setBridgeQuoteData(null);
    setCrossChainQuoteSource(null);
    setCrossChainWarning(null);
    setBridgeErrorMsg(null);
    setSellAmount('');
  }, [resetSwap]);

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
  }, [buyAssetSymbol, buyAssetAddress, sellAssetSymbol, sellAssetAddress, fromChainId, toChainId, handleReset]);

  const handleUnifiedSwap = useCallback(async () => {
    if (!sellAmount) return;

    if (actionType === 'SWAP') {
      if (isGasless && !isStellar(fromChainId)) {
        if (!selectedSellAsset || !selectedBuyAsset) return;
        setIsFusionLoading(true);
        try {
          await fetchFusionQuote(selectedSellAsset as any, selectedBuyAsset as any, sellAmount);
          setShowFusionScreen(true);
        } catch (err) {
          console.error('Failed to fetch Fusion quote:', err);
        } finally {
          setIsFusionLoading(false);
        }
        return;
      }

      if (isStellar(fromChainId)) {
        if (!stellarSwapQuote || !ammService || !stellarAddress) return;
        try {
          setBridgeTxStatus('preparing');
          const tx = await ammService.buildSwapTransaction(stellarAddress, stellarSwapQuote, {
            slippageTolerance
          });
          setBridgeTxStatus('signing');
          const provider = getProvider(WalletType.STELLAR) as any;
          const hash = await ammService.executeSwapWithWalletConnect(tx, provider);
          setBridgeTxHash(hash);
          setBridgeTxStatus('success');

          addLocalTransaction({
            hash,
            chainId: fromChainId,
            type: 'swap',
            timestamp: Date.now(),
            description: `Swap ${sellAssetSymbol} to ${buyAssetSymbol}`,
            from: stellarAddress,
            status: 'pending',
            network: currentNetwork
          });
        } catch (err) {
          console.error('Stellar swap execution failed:', err);
          setBridgeErrorMsg(parseSwapError(err));
          setBridgeTxStatus('error');
        }
      } else {
        if (!swapQuote || !selectedSellAsset || !selectedBuyAsset) return;
        try {
          await performSwap(swapQuote, selectedSellAsset as any, selectedBuyAsset as any, sellAmount, slippageTolerance);
        } catch (err) {
          console.error('Swap execution failed:', err);
        }
      }
    } else {
      if (isStellar(fromChainId) && !stellarAddress) return;
      if (isStellar(toChainId) && !stellarAddress) return;
      if (!isStellar(fromChainId) && !evmAddress) return;

      if (!bridgeQuoteData && !rangoQuote) return;

      setBridgeTxStatus('preparing');
      try {
        if (isStellar(fromChainId)) {
          if (!stellarAddress || !evmAddress) return;
          const xdr = await prepareStellarToEvmRawTransaction({
            amount: sellAmount,
            sourceToken: bridgeQuoteData.sourceToken,
            destinationToken: bridgeQuoteData.destinationToken,
            fromAccountAddress: stellarAddress,
            toAccountAddress: evmAddress,
            feePaymentMethod: feePayType === 'native' ? FeePaymentMethod.WITH_NATIVE_CURRENCY : FeePaymentMethod.WITH_STABLECOIN,
            messenger: Messenger.ALLBRIDGE,
            slippageTolerance
          });
          setBridgeTxStatus('signing');
          const provider = getProvider(WalletType.STELLAR) as any;
          const result = await signAndSubmitTransaction({
            xdr,
            network: currentNetwork,
            networkPassphrase: STELLAR_NETWORK_PASSPHRASE[currentNetwork],
            provider
          });

          if (result.success && result.hash) {
            setBridgeTxHash(result.hash);
          } else {
            throw new Error(result.error || 'Stellar transaction failed');
          }
        } else if (crossChainQuoteSource === 'rango' && rangoQuote) {
          if (!evmAddress) return;
          const requestId = rangoQuote.requestId || rangoQuote.result?.requestId;
          if (!requestId) throw new Error('No Rango requestId available');

          setBridgeTxStatus('preparing');
          const confirmResult = await confirmRangoRoute(
            requestId,
            fromChainId,
            toChainId,
            evmAddress,
            evmAddress
          );

          if (!confirmResult?.ok && !confirmResult?.result) {
            throw new Error(confirmResult?.error || 'Failed to confirm Rango route');
          }

          const provider = getProvider(WalletType.EVM) as any;

          const buildTxParams = (tx: any) => ({
            from: tx.from || evmAddress,
            to: tx.to,
            data: tx.data || '0x',
            value: tx.value ? `0x${BigInt(tx.value).toString(16)}` : '0x0',
            ...(tx.gasLimit ? { gas: tx.gasLimit } : {}),
            ...(tx.maxFeePerGas ? { maxFeePerGas: `0x${BigInt(tx.maxFeePerGas).toString(16)}` } : {}),
            ...(tx.maxPriorityFeePerGas ? { maxPriorityFeePerGas: `0x${BigInt(tx.maxPriorityFeePerGas).toString(16)}` } : {}),
          });

          const step1Response = await prepareRangoTx(requestId, 1);
          const step1Result = Array.isArray(step1Response) ? step1Response[0] : step1Response;
          if (!step1Result?.ok) throw new Error(step1Result?.error || 'Failed to prepare Rango transaction');

          const step1Tx = step1Result.transaction;
          if (!step1Tx?.to) throw new Error('No transaction data from Rango');

          if (step1Tx.isApprovalTx) {
            const approvalTxId = await provider.request({ method: 'eth_sendTransaction', params: [buildTxParams(step1Tx)] });
            await checkRangoApproval(requestId, approvalTxId);

            const step2Response = await prepareRangoTx(requestId, 2);
            const step2Result = Array.isArray(step2Response) ? step2Response[0] : step2Response;
            if (!step2Result?.ok) throw new Error(step2Result?.error || 'Failed to prepare Rango swap transaction');

            const step2Tx = step2Result.transaction;
            if (!step2Tx?.to) throw new Error('No swap transaction data from Rango');

            setBridgeTxStatus('signing');
            const swapTxId = await provider.request({ method: 'eth_sendTransaction', params: [buildTxParams(step2Tx)] });
            setBridgeTxHash(swapTxId);
            addLocalTransaction({
              hash: swapTxId,
              chainId: fromChainId,
              type: 'bridge',
              timestamp: Date.now(),
              description: `Rango Bridge: ${sellAssetSymbol} \u2192 ${buyAssetSymbol}`,
              from: evmAddress,
              status: 'pending',
              network: currentNetwork
            });
          } else {
            setBridgeTxStatus('signing');
            const swapTxId = await provider.request({ method: 'eth_sendTransaction', params: [buildTxParams(step1Tx)] });
            setBridgeTxHash(swapTxId);
            addLocalTransaction({
              hash: swapTxId,
              chainId: fromChainId,
              type: 'crosschain-swap',
              timestamp: Date.now(),
              description: `Rango Swap: ${sellAssetSymbol} \u2192 ${buyAssetSymbol}`,
              from: evmAddress,
              status: 'pending',
              network: currentNetwork
            });
          }

          setBridgeTxStatus('success');

        } else {
          const destAddr = isStellar(toChainId) ? stellarAddress : evmAddress;
          if (!evmAddress || !destAddr) return;

          const bridgeResponse = await prepareBridgeTransaction({
            fromChainId,
            toChainId,
            amount: sellAmount,
            feePayType,
            fromAddress: evmAddress,
            destinationAddress: destAddr,
            sourceToken: sellAssetSymbol,
            destinationToken: buyAssetSymbol,
            slippageTolerance
          });

          const provider = getProvider(WalletType.EVM) as any;
          for (const tx of bridgeResponse.transactions) {
            setBridgeTxStatus(tx.type === 'approve' ? 'preparing' : 'signing');
            const hash = await provider.request({
              method: 'eth_sendTransaction',
              params: [{
                from: tx.transaction.from,
                to: tx.transaction.to,
                value: `0x${BigInt(tx.transaction.value).toString(16)}`,
                data: tx.transaction.data,
              }]
            });
            if (tx.type === 'transfer') {
              setBridgeTxHash(hash);
              addLocalTransaction({
                hash,
                chainId: fromChainId,
                type: 'bridge',
                timestamp: Date.now(),
                description: `Bridge ${sellAssetSymbol} \u2192 ${buyAssetSymbol}`,
                from: evmAddress,
                status: 'pending',
                network: currentNetwork
              });
            }
          }
          setBridgeTxStatus('success');
        }
      } catch (err: any) {
        console.error('Bridge failed:', err);
        setBridgeErrorMsg(parseSwapError(err));
        setBridgeTxStatus('error');
      }
    }
  }, [
    actionType, swapQuote, selectedSellAsset, selectedBuyAsset, sellAmount, slippageTolerance, performSwap, evmAddress,
    stellarAddress, bridgeQuoteData, rangoQuote, fromChainId, toChainId, stellarSwapQuote, ammService, getProvider,
    isGasless, fetchFusionQuote, crossChainQuoteSource, feePayType, sellAssetSymbol, buyAssetSymbol, currentNetwork,
    confirmRangoRoute, checkRangoApproval, prepareRangoTx
  ]);
  const handleChainSelectInModal = useCallback(async (newChainId: number, isSource: boolean) => {
    const finalFromId = isSource ? newChainId : fromChainId;
    const finalToId = !isSource ? newChainId : toChainId;

    if (finalFromId !== finalToId && (isStellar(finalFromId) || isStellar(finalToId))) {
      const fromCfg = getChainById(finalFromId);
      const toCfg = getChainById(finalToId);

      const fromSupported = fromCfg?.bridgeSupportTokens?.map((t: any) => t.symbol.toUpperCase()) || [];
      const toSupported = toCfg?.bridgeSupportTokens?.map((t: any) => t.symbol.toUpperCase()) || [];

      if (!fromSupported.includes(sellAssetSymbol.toUpperCase())) {
        const fallback = fromSupported.includes('USDC') ? 'USDC' : (fromSupported.includes('XLM') ? 'XLM' : fromSupported[0]);
        if (fallback) {
          setSellAssetSymbol(fallback);
          setSellAssetAddress("");
        }
      }

      if (!toSupported.includes(buyAssetSymbol.toUpperCase())) {
        const fallback = toSupported.includes('USDC') ? 'USDC' : (toSupported.includes('XLM') ? 'XLM' : toSupported[0]);
        if (fallback) {
          setBuyAssetSymbol(fallback);
          setBuyAssetAddress("");
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
  }, [isConnected, getProvider, fromChainId, toChainId, sellAssetSymbol, buyAssetSymbol, setSellAssetSymbol, setBuyAssetSymbol]);

  const handleRefreshBalances = useCallback(async () => {
    if (!isConnected || isChainSwitching) return;

    setIsRefreshing(true);
    try {
      if (isStellar(fromChainId)) {
        if (stellarAddress && ammService) {
          const { tokens: balances, subentryCount } = await ammService.getAccountData(stellarAddress);
          const reserve = 1 + subentryCount * 0.5;
          const mapped = balances.map(b => {
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
  }, [isConnected, isChainSwitching, fromChainId, stellarAddress, ammService, selectedSellAsset, updateTokenBalances]);

  const isSwapDisabled = !sellAmount ||
    parseFloat(sellAmount) <= 0 ||
    isInsufficientBalance ||
    isLoadingExecution ||
    (actionType === 'SWAP' && isStellar(fromChainId) && !stellarSwapQuote) ||
    (actionType === 'SWAP' && !isStellar(fromChainId) && !swapQuote && !isGasless) ||
    isFetchingSwapAssets ||
    isFetchingBridgeQuote ||
    isChainSwitching ||
    isSameAssetSelected;

  const calculatedBuyAmount = useMemo(() => {
    if (actionType === 'SWAP') {
      if (isSameAssetSelected) return 'SELECT DIFFERENT PAIR';
      return isStellar(fromChainId) ? (stellarSwapQuote?.estimatedOutput || '0.00') : (swapQuote?.outputAmount || '0.00');
    }
    if (isStellar(fromChainId)) return bridgeQuoteData?.minimumAmountOut || '0.00';
    if (crossChainQuoteSource === 'bridge') return bridgeQuoteData?.minimumAmountOut || rangoQuote?.result?.outputAmount || '0.00';
    if (crossChainQuoteSource === 'rango') return rangoQuote?.result?.outputAmount || '0.00';
    return bridgeQuoteData?.minimumAmountOut || '0.00';
  }, [actionType, swapQuote, bridgeQuoteData, rangoQuote, fromChainId, stellarSwapQuote, isSameAssetSelected, crossChainQuoteSource]);


  const minimumReceived = (() => {
    if (actionType === 'BRIDGE') {
      if (!isStellar(fromChainId)) {
        if (crossChainQuoteSource === 'rango') return rangoQuote?.result?.outputAmount || '0.00';
        return bridgeQuoteData?.minimumAmountOut || '0.00';
      }
      if (bridgeQuoteData?.minimumAmountOut) return bridgeQuoteData.minimumAmountOut;
    }

    if (isStellar(fromChainId) && stellarSwapQuote) return stellarSwapQuote.minimumOutput;

    if (!swapQuote?.outputAmount || !selectedBuyAsset) return '0.00';
    try {
      const decimals = (selectedBuyAsset as any).decimals || 18;
      const amountBN = ethers.parseUnits(swapQuote.outputAmount, decimals);
      const slippageBips = BigInt(Math.floor(slippageTolerance * 100));
      const minReceivedBN = (amountBN * (10000n - slippageBips)) / 10000n;
      return ethers.formatUnits(minReceivedBN, decimals);
    } catch (err) { return calculatedBuyAmount; }
  })();


  return (
    <PageLayout title="Token Swap" subtitle="Unified Exchange & Bridge" onBack={onClose} showBackButton={!!onClose} maxWidth="lg">
      <div className="mx-auto space-y-8 px-2 sm:px-0">

        {/* Pay Card */}
        <div className="bg-tertiary rounded-2xl p-4 lg:p-6 shadow-sm relative overflow-hidden flex flex-col border border-divider/50">
          <div className={`absolute left-0 top-0 bottom-0 w-1 bg-brand transition-all duration-300 ${isInputFocused ? 'opacity-100 scale-y-100' : 'opacity-0 scale-y-50'}`} />

          <div className="flex justify-between items-center mb-4 sm:mb-6">
            <label className="text-xs font-black uppercase tracking-[0.15em] text-muted opacity-90">You Pay</label>
            <button onClick={handleMaxAmount} className="text-[10px] font-black text-brand hover:scale-110 active:scale-95 transition-all px-3 py-1 bg-brand/10 border border-brand/20 rounded-full">MAX</button>
          </div>

          <div className="flex items-center gap-3 sm:gap-4">
            <button
              onClick={() => openAssetSelector(actionType, {
                defaultNetwork: fromChainId,
                pairedChainId: toChainId,
                onSelect: (a: any) => {
                  handleChainSelectInModal(isStellar(a.chainId) ? STELLAR_CHAIN_ID : Number(a.chainId), true);
                  setSellAssetSymbol(a.symbol);
                  setSellAssetAddress(a.address || "");
                }
              })}
              className="flex items-center gap-2 bg-secondary rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3 hover:bg-hover active:scale-[0.98] transition-all relative group flex-[0_0_auto] min-w-0"
              style={{ width: 'clamp(130px, 35vw, 160px)' }}
            >
              <div className="relative min-w-[36px] sm:min-w-[40px]">
                <img
                  src={(selectedSellAsset as any)?.logoURI || `https://ui-avatars.com/api/?name=${sellAssetSymbol}&background=random`}
                  className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-tertiary object-cover shadow-sm" alt=""
                />
                <img
                  src={fromChainConfig?.nativeCurrency.logoURI}
                  className="absolute -bottom-1 -right-1 w-4 h-4 sm:w-4.5 sm:h-4.5 rounded-full border-2 border-secondary bg-secondary" alt=""
                />
              </div>
              <div className="flex flex-col items-start pr-1 min-w-0 overflow-hidden">
                <span className="font-bold text-[13px] sm:text-[15px] leading-tight truncate w-full">{sellAssetSymbol || 'Select'}</span>
                <span className="text-[8px] sm:text-[9px] text-muted font-bold tracking-tight truncate w-full uppercase">{fromChainConfig?.name}</span>
              </div>
              <ChevronDown size={13} className="text-muted group-hover:text-primary transition-all ml-auto flex-shrink-0" />
            </button>

            <div className="flex-1 min-w-0">
              <input
                ref={inputRef}
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                onFocus={() => setIsInputFocused(true)}
                onBlur={() => setIsInputFocused(false)}
                className="w-full bg-transparent border-none text-right text-3xl sm:text-4xl font-black focus:ring-0 p-0 placeholder:text-muted/10 truncate transition-all outline-none"
                value={sellAmount}
                onChange={(e) => {
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
              <button onClick={handleRefreshBalances} disabled={isRefreshing} className={`p-1 sm:p-1.5 hover:bg-white/5 rounded-full transition-all ${isRefreshing ? 'animate-spin text-brand' : ''}`}>
                <RefreshCw size={12} />
              </button>
              <span>Balance:</span>
              <span className="text-primary font-black">
                {((selectedSellAsset as any)?.balance === undefined || isRefreshing) ? (
                  <span className="inline-block w-14 h-3.5 bg-brand/30 animate-pulse rounded-full align-middle ml-1" />
                ) : (
                  `${portfolioUtils.formatBalance((selectedSellAsset as any)?.balance || '0')} ${sellAssetSymbol}`
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
        <div className="flex justify-center -my-8 relative z-10">
          <button onClick={handleAssetSwap} className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-secondary flex items-center justify-center shadow-lg hover:scale-110 active:scale-90 transition-all duration-300 text-brand group backdrop-blur-md">
            <ArrowUpDown size={18} className="group-hover:rotate-180 transition-transform duration-500" />
          </button>
        </div>

        {/* Receive Card */}
        <div className="bg-tertiary rounded-2xl p-4 lg:p-6 shadow-sm relative overflow-hidden flex flex-col border border-divider/50">
          <div className="flex justify-between items-center mb-4 sm:mb-6">
            <label className="text-xs font-black uppercase tracking-[0.15em] text-muted opacity-90">You Receive</label>
          </div>

          <div className="flex items-center gap-3 sm:gap-4">
            <button
              onClick={() => openAssetSelector(actionType, {
                defaultNetwork: toChainId,
                pairedChainId: fromChainId,
                onSelect: (a: any) => {
                  handleChainSelectInModal(isStellar(a.chainId) ? STELLAR_CHAIN_ID : Number(a.chainId), false);
                  setBuyAssetSymbol(a.symbol);
                  setBuyAssetAddress(a.address || "");
                }
              })}
              className="flex items-center gap-2 bg-secondary rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3 hover:bg-hover active:scale-[0.98] transition-all relative group flex-[0_0_auto] min-w-0"
              style={{ width: 'clamp(130px, 35vw, 160px)' }}
            >
              <div className="relative min-w-[36px] sm:min-w-[40px]">
                <img
                  src={(selectedBuyAsset as any)?.logoURI || `https://ui-avatars.com/api/?name=${buyAssetSymbol}&background=random`}
                  className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-tertiary object-cover shadow-sm" alt=""
                />
                <img
                  src={toChainConfig?.nativeCurrency.logoURI}
                  className="absolute -bottom-1 -right-1 w-4 h-4 sm:w-4.5 sm:h-4.5 rounded-full border-2 border-secondary bg-secondary" alt=""
                />
              </div>
              <div className="flex flex-col items-start pr-1 min-w-0 overflow-hidden">
                <span className="font-bold text-[13px] sm:text-[15px] leading-tight truncate w-full">{buyAssetSymbol || 'Select'}</span>
                <span className="text-[8px] sm:text-[9px] text-muted font-bold tracking-tight truncate w-full uppercase">{toChainConfig?.name?.split(' ')[0]}</span>
              </div>
              <ChevronDown size={13} className="text-muted group-hover:text-primary transition-all ml-auto flex-shrink-0" />
            </button>

            <div className="flex-1 text-right min-w-0">
              <div className={`font-black truncate text-primary transition-all duration-300 ${isSameAssetSelected ? 'text-sm sm:text-base opacity-40 tracking-wider' : 'text-3xl sm:text-4xl tabular-nums'}`}>
                {(isFetchingBridgeQuote || swapQuoteLoading || isFetchingStellarQuote) ? (
                  <div className="flex justify-end gap-1 items-end mt-2">
                    <div className="w-4 h-8 sm:w-6 sm:h-10 bg-white/5 animate-pulse rounded-md" />
                    <div className="w-4 h-8 sm:w-6 sm:h-10 bg-white/5 animate-pulse rounded-md delay-75" />
                    <div className="w-1 h-1 bg-white/5 animate-pulse rounded-full mb-2" />
                    <div className="w-4 h-8 sm:w-6 sm:h-10 bg-white/5 animate-pulse rounded-md delay-150" />
                    <div className="w-4 h-8 sm:w-6 sm:h-10 bg-white/5 animate-pulse rounded-md delay-200" />
                  </div>
                ) : ((swapQuote || bridgeQuoteData || rangoQuote || stellarSwapQuote || isSameAssetSelected) ? <span>{calculatedBuyAmount}</span> : '0.00')}
              </div>
              {(swapQuote || bridgeQuoteData || rangoQuote || stellarSwapQuote) && !isSameAssetSelected && (
                <div className="text-[9px] sm:text-[10px] text-green-500 font-extrabold uppercase tracking-widest mt-1 flex items-center justify-end gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full border border-green-500/30 flex items-center justify-center">
                    <div className="w-0.5 h-0.5 rounded-full bg-green-500" />
                  </div>
                  {`Refreshing in ${timeLeft}s`}
                </div>
              )}
            </div>
          </div>

          {crossChainWarning && actionType === 'BRIDGE' && (
            <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-yellow-500/10 border border-yellow-500/20 rounded-xl">
              <div className="w-1.5 h-1.5 rounded-full bg-yellow-400 flex-shrink-0" />
              <span className="text-[10px] font-bold text-yellow-400 uppercase tracking-widest leading-relaxed">{crossChainWarning}</span>
            </div>
          )}

          {/* Details Section Inside Receive Card */}
          <div className={`grid transition-all duration-500 ease-in-out ${(actionType === 'SWAP' && (swapQuote || stellarSwapQuote)) || (actionType === 'BRIDGE' && hasActiveCrossChainQuote) || (actionType === 'BRIDGE' && isStellar(fromChainId) && bridgeQuoteData) ? 'grid-rows-[1fr] opacity-100 mt-6' : 'grid-rows-[0fr] opacity-0 mt-0 pointer-events-none'}`}>
            <div className="overflow-hidden">
              <div className="pt-5 sm:pt-6 border-t border-dotted border-white/10 space-y-1">

                {/* Rate row */}
                <div className="flex items-center justify-between py-2 border-b border-white/5">
                  <span className="text-[10px] font-black uppercase tracking-widest text-muted">Rate</span>
                  <span className="text-[11px] font-black text-primary">
                    1 {sellAssetSymbol} ≈ {actionType === 'SWAP'
                      ? (isGasless && fusionQuote
                        ? (Number(fusionQuote.prices.usd.fromToken) / Number(fusionQuote.prices.usd.toToken)).toFixed(6)
                        : isStellar(fromChainId) && stellarSwapQuote
                          ? (Number(stellarSwapQuote.estimatedOutput) / Number(stellarSwapQuote.inputAmount)).toFixed(6)
                          : portfolioUtils.formatBalance(swapQuote?.pricePerToken || '0'))
                      : crossChainQuoteSource === 'rango'
                        ? portfolioUtils.formatBalance(rangoQuote?.result?.outputAmount || '0')
                        : portfolioUtils.formatBalance(bridgeQuoteData?.conversionRate || '0')} {buyAssetSymbol}
                  </span>
                </div>

                {/* SWAP specific rows */}
                {actionType === 'SWAP' && (
                  <>
                    <div className="flex items-center justify-between py-2 border-b border-white/5">
                      <span className="text-[10px] font-black uppercase tracking-widest text-muted">Slippage</span>
                      <span className={`text-[11px] font-black ${isGasless ? 'text-green-500' : 'text-primary'}`}>
                        {isGasless ? 'None' : `${((swapQuote?.fee || 0) / 10000).toFixed(2)}%`}
                      </span>
                    </div>

                    <div className="flex items-center justify-between py-2 border-b border-white/5">
                      <span className="text-[10px] font-black uppercase tracking-widest text-muted">Network Fee</span>
                      {isGasless ? (
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

                    {isStellar(fromChainId) && stellarSwapQuote && (
                      <div className="flex items-center justify-between py-2 border-b border-white/5">
                        <span className="text-[10px] font-black uppercase tracking-widest text-muted">Price Impact</span>
                        <span className={`text-[11px] font-black ${stellarSwapQuote.priceImpact > 2 ? 'text-red-500' : 'text-green-500'}`}>
                          {stellarSwapQuote.priceImpact.toFixed(2)}%
                        </span>
                      </div>
                    )}

                    {/* Gasless toggle row */}
                    {!isStellar(fromChainId) && (
                      <div className="flex items-center justify-between py-2 border-b border-white/5">
                        <div className="flex items-center gap-1.5">
                          <Zap size={10} className={isGasless ? 'fill-green-500 text-green-500' : 'text-muted'} />
                          <span className="text-[10px] font-black uppercase tracking-widest text-muted">Gasless</span>
                        </div>
                        <label className="relative w-9 h-5 cursor-pointer flex-shrink-0">
                          <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={isGasless}
                            onChange={() => setGasless(!isGasless)}
                          />
                          <div className="absolute inset-0 rounded-full bg-white/10 border border-white/10 peer-checked:bg-green-500 peer-checked:border-green-500 transition-all duration-200" />
                          <div className="absolute top-[3px] left-[3px] w-[14px] h-[14px] rounded-full bg-white transition-all duration-200 peer-checked:translate-x-4" />
                        </label>
                      </div>
                    )}
                  </>
                )}

                {/* BRIDGE specific rows */}
                {actionType === 'BRIDGE' && (
                  <>
                    {crossChainQuoteSource === 'rango' && rangoQuote?.result?.swaps?.[0] ? (() => {
                      const swap = rangoQuote.result.swaps[0];
                      const networkFee = swap.fee?.find((f: any) => f.name === 'Network Fee');
                      const rangoFee = swap.fee?.find((f: any) => f.name === 'Rango Fee');
                      const estimatedSecs = swap.estimatedTimeInSeconds;
                      return (
                        <>
                          <div className="flex items-center justify-between py-2 border-b border-white/5">
                            <span className="text-[10px] font-black uppercase tracking-widest text-muted">Protocol</span>
                            <div className="flex items-center gap-1.5">
                              {swap.swapperLogo && <img src={swap.swapperLogo} className="w-4 h-4 rounded-full" alt="" />}
                              <span className="text-[11px] font-black text-primary">{swap.swapperId}</span>
                            </div>
                          </div>

                          {networkFee && (
                            <div className="flex items-center justify-between py-2 border-b border-white/5">
                              <span className="text-[10px] font-black uppercase tracking-widest text-muted">Network Fee</span>
                              <span className="text-[11px] font-black text-primary">
                                ~{Number(networkFee.amount).toFixed(6)} {networkFee.asset.symbol}
                              </span>
                            </div>
                          )}

                          {rangoFee && (
                            <div className="flex items-center justify-between py-2 border-b border-white/5">
                              <span className="text-[10px] font-black uppercase tracking-widest text-muted">Rango Fee</span>
                              <span className="text-[11px] font-black text-primary">
                                {Number(rangoFee.amount).toFixed(4)} {rangoFee.asset.symbol}
                              </span>
                            </div>
                          )}

                          {estimatedSecs && (
                            <div className="flex items-center justify-between py-2 border-b border-white/5">
                              <span className="text-[10px] font-black uppercase tracking-widest text-muted">Est. Time</span>
                              <span className="text-[11px] font-black text-primary">
                                ~{Math.ceil(estimatedSecs / 60)} min
                              </span>
                            </div>
                          )}
                        </>
                      );
                    })() : (
                      <>
                        {bridgeQuoteData?.fee?.[feePayType] && (
                          <div className="flex items-center justify-between py-2 border-b border-white/5">
                            <span className="text-[10px] font-black uppercase tracking-widest text-muted">Bridge Fee</span>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[11px] font-black text-primary">
                                {Number(bridgeQuoteData.fee[feePayType].amount).toFixed(4)}
                              </span>
                              <span className="text-[9px] font-black text-muted">{bridgeQuoteData.fee[feePayType].symbol}</span>
                              <div className="flex items-center gap-0.5 bg-secondary/50 rounded-md p-0.5 ml-1">
                                <button
                                  onClick={() => setFeePayType('native')}
                                  className={`px-1.5 py-0.5 rounded text-[8px] font-black tracking-widest transition-all ${feePayType === 'native' ? 'bg-primary text-secondary' : 'text-muted hover:text-primary/70'}`}
                                >
                                  {fromChainConfig?.nativeCurrency.symbol}
                                </button>
                                <button
                                  onClick={() => setFeePayType('stablecoin')}
                                  className={`px-1.5 py-0.5 rounded text-[8px] font-black tracking-widest transition-all ${feePayType === 'stablecoin' ? 'bg-primary text-secondary' : 'text-muted hover:text-primary/70'}`}
                                >
                                  STABLE
                                </button>
                              </div>
                            </div>
                          </div>
                        )}

                        <div className="flex items-center justify-between py-2 border-b border-white/5">
                          <span className="text-[10px] font-black uppercase tracking-widest text-muted">Est. Time</span>
                          <span className="text-[11px] font-black text-primary">
                            ~{bridgeQuoteData?.completionTime ? Math.max(1, Math.round(bridgeQuoteData.completionTime / 60000)) : 5} min
                          </span>
                        </div>
                      </>
                    )}
                  </>
                )}
                {/* Min received */}
                <div className="flex items-center justify-between py-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-muted">Min. Received</span>
                  <span className="text-[12px] font-black text-brand">
                    {portfolioUtils.formatBalance(minimumReceived)} {buyAssetSymbol}
                  </span>
                </div>

              </div>
            </div>
          </div>
        </div>

        <div className="relative group/action mt-4">
          <div className={`overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] ${isErrorState && !isLoadingExecution ? 'max-h-40 opacity-100 mb-0' : 'max-h-0 opacity-0 mb-[-12px]'}`}>
            <div className="bg-red-500/10 border-x border-t border-red-500/30 rounded-t-2xl p-4 flex items-center gap-3 relative z-0">
              <div className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
              <p className="text-[10px] sm:text-xs font-bold text-red-500 uppercase tracking-widest leading-relaxed">
                {isInsufficientBalance ? 'Insufficient balance for this transaction' :
                  isSameAssetSelected ? 'Please select different assets to swap' :
                    (actionType === 'SWAP' && !isStellar(fromChainId) && swapError) ? `Swap Error: ${swapError}` :
                      bridgeTxStatus === 'error' ? (bridgeErrorMsg || 'Transaction failed. Please try again.') :
                        'An error occurred. Please check your inputs.'}
              </p>
            </div>
          </div>

          <ActionGuard
            title="Connect Wallet"
            requiredWallets={requiredWallets}
            disabled={isLoadingExecution}
          >
            <TransactionButton
              label={buttonLabel}
              isLoading={isLoadingExecution}
              isDisabled={isSwapDisabled}
              isError={!!isErrorState && !isLoadingExecution}
              onClick={handleUnifiedSwap}
              icon={isGasless && actionType === 'SWAP' ? <Zap size={20} className="fill-white" /> : undefined}
              className={`relative z-10 ${isErrorState && !isLoadingExecution ? '!rounded-t-none border-t-red-500/20' : ''}`}
            />
          </ActionGuard>
        </div>

        {(swapTxHash || (isStellar(fromChainId) && bridgeTxHash)) && fromChainConfig && actionType === 'SWAP' && (
          isStellar(fromChainId) ? (
            <StellarTransactionModal
              isOpen={!!(swapTxHash || bridgeTxHash)}
              onClose={handleReset}
              status="success"
              type="Swap"
              hash={(swapTxHash || bridgeTxHash)!}
            />
          ) : (
            <EvmTransactionSuccessModal
              txHash={swapTxHash!}
              explorerUrl={`${fromChainConfig.blockExplorerUrl}/tx/${swapTxHash}`}
              onDone={handleReset}
              networkName={fromChainConfig.name}
            />
          )
        )}

        {bridgeTxHash && fromChainConfig && actionType === 'BRIDGE' && (
          isStellar(fromChainId) ? (
            <StellarTransactionModal
              isOpen={!!bridgeTxHash}
              onClose={handleReset}
              status="success"
              type="Bridge"
              hash={bridgeTxHash}
            />
          ) : (
            <EvmTransactionSuccessModal
              txHash={bridgeTxHash}
              explorerUrl={`${fromChainConfig.blockExplorerUrl}/tx/${bridgeTxHash}`}
              onDone={handleReset}
              networkName={fromChainConfig.name}
            />
          )
        )}
      </div>

      {showFusionScreen && fusionQuote && (
        <FusionQuoteScreen
          quote={fusionQuote}
          sellAsset={selectedSellAsset}
          buyAsset={selectedBuyAsset}
          onBack={() => setShowFusionScreen(false)}
          loading={isFusionLoading}
          error={swapError}
          txHash={swapTxHash}
          onConfirm={async (preset) => {
            setIsFusionLoading(true);
            try {
              const hash = await performFusionSwap(
                selectedSellAsset as any,
                selectedBuyAsset as any,
                sellAmount,
                preset
              );
              console.log(hash, " Fustoin screen hash ---")
            } catch (err) {
              console.error('Fusion swap execution failed:', err);
            } finally {
              setIsFusionLoading(false);
            }
          }}
        />
      )}
    </PageLayout>
  );
};

export default SwapAssets;