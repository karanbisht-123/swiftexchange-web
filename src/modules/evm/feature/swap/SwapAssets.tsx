import {
  ArrowUpDown,
  ChevronDown,
  RefreshCw,
  Zap,
  Settings
} from 'lucide-react';


import React, { useCallback, useEffect, useState, useRef, useMemo } from 'react';
import { ethers } from 'ethers';
import { useSearchParams, useLocation } from 'react-router-dom';
import { useNotificationStore } from '../../../../store/notificationStore';
import { addLocalTransaction } from '../../service/localTransactionService';

import PageLayout from '../../../../components/layout/PageLayout';
import type { SwapQuoteRequest } from '../../../../types/evm/swap.types';
import { WalletType } from '../../../walletconnect/constants/Wallet';
import { useWalletConnect } from '../../../walletconnect/hooks/useWalletConnect';
import { useWalletStore } from '../../../walletconnect/store/walletConnectStore';
import TransactionButton from '../../../commonfeature/components/TransactionButton';
import { useEvmSwap } from '../../hook/useEvmSwap';
import { getRangoSlippageWarning } from '../../utils/evmSwapUtils';
import { getEvmSwapEnabledChains, getChainById, isEvmChain, getGlobalAssetMetadata } from '../../utils/Chainregistry';
import { useAssetSelectorModal } from '../../../commonfeature/components/useAssetSelectorModal';
import { portfolioUtils } from '../../../walletconnect/utils/portfolioUtils';
import { EvmTransactionSuccessModal } from '../../components/EvmTransactionSuccessModal';
import StellarTransactionModal from '../../../steallr/components/modals/StellarTransactionModal';
import { ActionGuard } from '../../../commonfeature/components/ActionGuard';
import { switchOrAddChain } from '../../utils/evmChainUtils';
import FusionQuoteScreen from './components/FusionQuoteScreen';
import SlippageSettingsModal from './components/SlippageSettingsModal';
import { parseSwapError, parseWalletError } from '../../utils/swapErrorHandler';
import { getTokensForChain } from '../../service/tokenListService';

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

const STELLAR_CHAIN_ID = 'pubnet';
const isStellar = (id: any) => id === 'stellar' || id === STELLAR_CHAIN_ID || id === 'testnet';

interface SwapAssetsProps {
  onClose?: () => void;
}

const SwapAssets: React.FC<SwapAssetsProps> = ({ onClose }) => {
  const { connectedWallets, getProvider } = useWalletConnect();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const locationState = location.state as { selectedAsset?: any; isPerp?: boolean };
  const { showToast } = useNotificationStore();

  const evmWallet = connectedWallets[WalletType.EVM];
  const stellarWallet = connectedWallets[WalletType.STELLAR];
  const isConnected = !!evmWallet;
  const evmAddress = evmWallet?.address || '';
  const stellarAddress = stellarWallet?.address || '';
  const currentChainId = evmWallet?.chainId || null;
  const currentNetwork = useWalletStore((state: any) => state.network) as 'mainnet' | 'testnet';
  const swapEnabledChains = getEvmSwapEnabledChains(currentNetwork);

  const [fromChainId, setFromChainId] = useState<number | string>(() => {
    if (locationState?.selectedAsset) {
      return locationState.selectedAsset.chainType === 'stellar'
        ? STELLAR_CHAIN_ID
        : (locationState.selectedAsset.chainId || 1);
    }
    const raw = searchParams.get('fromChainId');
    if (raw === 'stellar') return STELLAR_CHAIN_ID;
    
    const defaultChainId = currentChainId || (connectedWallets[WalletType.STELLAR] ? STELLAR_CHAIN_ID : 1);
    return raw ? (isNaN(Number(raw)) ? raw : Number(raw)) : defaultChainId;
  });

  const [toChainId, setToChainId] = useState<number | string>(() => {
    if (locationState?.selectedAsset) {
      return locationState.selectedAsset.chainType === 'stellar'
        ? STELLAR_CHAIN_ID
        : (locationState.selectedAsset.chainId || 1);
    }
    const raw = searchParams.get('toChainId');
    if (raw === 'stellar') return STELLAR_CHAIN_ID;

    const defaultChainId = currentChainId || (connectedWallets[WalletType.STELLAR] ? STELLAR_CHAIN_ID : 1);
    return raw ? (isNaN(Number(raw)) ? raw : Number(raw)) : defaultChainId;
  });

  const [sellAssetSymbol, setSellAssetSymbol] = useState<string>(() => {
    if (locationState?.selectedAsset) return locationState.selectedAsset.symbol;
    return searchParams.get('sellAsset') || '';
  });

  const [sellAssetAddress, setSellAssetAddress] = useState<string>(() => {
    if (locationState?.selectedAsset) return locationState.selectedAsset.address || '';
    return searchParams.get('sellAddress') || '';
  });

  const [buyAssetSymbol, setBuyAssetSymbol] = useState<string>(searchParams.get('buyAsset') || '');
  const [buyAssetAddress, setBuyAssetAddress] = useState<string>(searchParams.get('buyAddress') || '');
  const [sellAmount, setSellAmount] = useState<string>('');
  const [isSlippageSettingsOpen, setIsSlippageSettingsOpen] = useState(false);


  const [isChainSwitching, setIsChainSwitching] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [timeLeft, setTimeToNextRefresh] = useState(30);

  const [activeQuote, setActiveQuote] = useState<{
    source: 'swap' | 'bridge' | 'rango' | 'stellar' | null;
    data: any;
    error: string | null;
    loading: boolean;
  }>({ source: null, data: null, error: null, loading: false });

  const [feePayType, setFeePayType] = useState<'native' | 'stablecoin'>('stablecoin');
  const [bridgeTxStatus, setBridgeTxStatus] = useState<'idle' | 'preparing' | 'signing' | 'success' | 'error'>('idle');
  const [bridgeTxHash, setBridgeTxHash] = useState<string | null>(null);
  const [bridgeErrorMsg, setBridgeErrorMsg] = useState<string | null>(null);
  const [crossChainWarning, setCrossChainWarning] = useState<string | null>(null);

  const [ammService, setAmmService] = useState<AmmSwapService | null>(null);
  const [stellarAssets, setStellarAssets] = useState<any[]>([]);
  const [isFetchingStellarAssets, setIsFetchingStellarAssets] = useState(false);

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


    confirmRangoRoute,
    reset: resetSwap,
    userSlippageTolerance,
    setUserSlippageTolerance,
  } = useEvmSwap({
    chainId: fromChainId,
    senderAddress: evmAddress,
    getProvider,
  });



  const [showFusionScreen, setShowFusionScreen] = useState(false);
  const [isFusionLoading, setIsFusionLoading] = useState(false);
  const [fusionStatus, setFusionStatus] = useState<'idle' | 'approving' | 'signing'>('idle');
  const fusionInputChangeRef = useRef<number>(0);


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
    const hasFromParam = !!searchParams.get('fromChainId');
    const hasToParam = !!searchParams.get('toChainId');
    const hasLocationAsset = !!locationState?.selectedAsset;

    if (!hasFromParam && !hasToParam && !hasLocationAsset) {
      if (currentChainId && swapEnabledChains.some(c => c.chainId === currentChainId)) {
        setFromChainId(currentChainId);
        setToChainId(currentChainId);
      } else if (!evmWallet && stellarWallet) {
        setFromChainId(STELLAR_CHAIN_ID);
        setToChainId(STELLAR_CHAIN_ID);
      }
    }
  }, [currentChainId, evmWallet, stellarWallet, searchParams, swapEnabledChains, locationState]);
  useEffect(() => {
    if (locationState?.selectedAsset) {
      const asset = locationState.selectedAsset;
      const targetChainId = asset.chainType === 'stellar' ? STELLAR_CHAIN_ID : (asset.chainId || 1);

      setFromChainId(targetChainId);
      setSellAssetSymbol(asset.symbol);
      setSellAssetAddress(asset.address || '');
      if (locationState.isPerp) {
        setToChainId(targetChainId);
      }
    }
  }, [locationState]);

  useEffect(() => {
    resetSwap();
    setBridgeTxStatus('idle');
    setBridgeTxHash(null);
    setActiveQuote({ source: null, data: null, error: null, loading: false });
    setCrossChainWarning(null);
    setBridgeErrorMsg(null);
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
          if (actionType === 'SWAP' && isStellar(fromChainId)) {
            const currentSellInStellar = mapped.find(t => t.symbol === sellAssetSymbol);
            const currentBuyInStellar = mapped.find(t => t.symbol === buyAssetSymbol);

            let finalSellSymbol = sellAssetSymbol;

            if (!currentSellInStellar && mapped.length > 0) {
              const defaultSell = mapped.find(t => t.symbol === 'XLM') || mapped[0];
              setSellAssetSymbol(defaultSell.symbol);
              setSellAssetAddress(defaultSell.address || "");
              finalSellSymbol = defaultSell.symbol;
            }

            if ((!currentBuyInStellar || finalSellSymbol === buyAssetSymbol) && mapped.length > 1) {
              const defaultBuy = (finalSellSymbol === 'XLM' ? mapped.find(t => t.symbol === 'USDC') : mapped.find(t => t.symbol === 'XLM'))
                || mapped.find(t => t.symbol !== finalSellSymbol)
                || mapped[1];
              
              if (defaultBuy) {
                setBuyAssetSymbol(defaultBuy.symbol);
                setBuyAssetAddress(defaultBuy.address || "");
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
      const currentSellInEvm = swapAssets.find(a => a.symbol === sellAssetSymbol || (sellAssetAddress && a.address.toLowerCase() === sellAssetAddress.toLowerCase()));
      const currentBuyInEvm = swapAssets.find(a => a.symbol === buyAssetSymbol || (buyAssetAddress && a.address.toLowerCase() === buyAssetAddress.toLowerCase()));

      if (!currentSellInEvm || !currentBuyInEvm || sellAssetSymbol === buyAssetSymbol) {
        const nativeAsset = swapAssets.find(a => a.isNative);
        const usdcAsset = swapAssets.find(a => a.symbol === 'USDC' || a.symbol === 'USDT' || a.symbol === 'USDS');

        let finalSell = currentSellInEvm;
        if (!currentSellInEvm) {
          finalSell = nativeAsset || swapAssets[0];
          setSellAssetSymbol(finalSell.symbol);
          setSellAssetAddress(finalSell.address);
        }

        if (!currentBuyInEvm || (finalSell && finalSell.symbol === buyAssetSymbol)) {
          const bestBuy = (finalSell?.symbol === nativeAsset?.symbol ? usdcAsset : nativeAsset)
            || swapAssets.find(a => a.symbol !== finalSell?.symbol)
            || swapAssets[1]
            || swapAssets[0];
          
          if (bestBuy) {
            setBuyAssetSymbol(bestBuy.symbol);
            setBuyAssetAddress(bestBuy.address);
          }
        }
      } else if (sellAssetSymbol && !buyAssetSymbol) {
        // Sell asset is pre-filled, pick a default buy asset
        const usdcAsset = swapAssets.find(a => (a.symbol === 'USDC' || a.symbol === 'USDT' || a.symbol === 'USDS') && a.symbol !== sellAssetSymbol);
        const nativeAsset = swapAssets.find(a => a.isNative && a.symbol !== sellAssetSymbol);
        const fallback = swapAssets.find(a => a.symbol !== sellAssetSymbol);

        const bestBuy = usdcAsset || nativeAsset || fallback;
        if (bestBuy) {
          setBuyAssetSymbol(bestBuy.symbol);
          setBuyAssetAddress(bestBuy.address);
        }
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
          setActiveQuote({ source: 'stellar', data: sq, error: null, loading: false });
        } catch (err) {
          console.error('Stellar quote error:', err);
          setActiveQuote({ source: 'stellar', data: null, error: parseSwapError(err), loading: false });
        }
      } else {
        if (!selectedSellAsset || !selectedBuyAsset || selectedSellAsset.address?.toLowerCase() === selectedBuyAsset.address?.toLowerCase()) return;
        try {
          // Always fetch normal quote for UI even if gasless is toggled
          const quoteRequest: SwapQuoteRequest = {
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
          let toChainSym: any = toChainConfig?.nativeCurrency.symbol;
          if (toChainSym === 'BNB') toChainSym = ChainSymbol.BSC;
          if (toChainSym === 'AVAX') toChainSym = ChainSymbol.AVA;

          const src = tokens.find(t => t.chainSymbol === fromChainSym && t.symbol.toUpperCase() === sellAssetSymbol.toUpperCase());
          const dst = tokens.find(t => t.chainSymbol === toChainSym && t.symbol.toUpperCase() === buyAssetSymbol.toUpperCase());

          if (src && dst) {
            const sq = await getStellarBridgeQuote({ amount: sellAmount, sourceToken: src, destinationToken: dst, slippageTolerance: userSlippageTolerance });
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

      setActiveQuote({ source: shouldUseBridge ? 'bridge' : 'rango', data: null, error: null, loading: true });
      setCrossChainWarning(null);

      try {
        if (shouldUseBridge) {
          const bdgQ = await getEvmBridgeQuote(fromChainId, toChainId, sellAmount, sellAssetSymbol, buyAssetSymbol);
          if (!bdgQ || (Array.isArray(bdgQ) && bdgQ.length === 0) || (bdgQ && typeof bdgQ === 'object' && !bdgQ.minimumAmountOut && !bdgQ.quotes)) {
            throw new Error('Bridge quotes empty');
          }
          setActiveQuote({ source: 'bridge', data: bdgQ, error: null, loading: false });
        } else {
          const quoteRequest: SwapQuoteRequest = {
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

          await fetchSwapQuoteInternal(quoteRequest, selectedSellAsset as any, selectedBuyAsset as any);
          setActiveQuote({ source: 'rango', data: null, error: null, loading: false });
        }
      } catch (err: any) {
        if (err?.message === 'Quote request cancelled' || err?.message === 'Quote request superseded') return;
        console.error('Cross-chain quote error:', err);
        setCrossChainWarning(parseSwapError(err));
        setActiveQuote({ source: shouldUseBridge ? 'bridge' : 'rango', data: null, error: parseSwapError(err), loading: false });
      }
    }
  }, [actionType, fromChainId, toChainId, selectedSellAsset, selectedBuyAsset, sellAmount, sellAssetSymbol, buyAssetSymbol, fetchSwapQuoteInternal, isChainSwitching, fromChainConfig, toChainConfig, userSlippageTolerance, showFusionScreen, isBridgeSupported, getUsdValue, ammService]);


  const resetQuotes = useCallback(() => {
    resetSwap();
    setActiveQuote({ source: null, data: null, error: null, loading: false });
    setBridgeErrorMsg(null);
    setCrossChainWarning(null);
    setBridgeTxStatus('idle');
  }, [resetSwap]);

  const resetLoadingState = useCallback(() => {
    setBridgeTxStatus('idle');
    setIsFusionLoading(false);
    setFusionStatus('idle');
    setActiveQuote(prev => ({ ...prev, loading: false }));
  }, []);

  const isInsufficientBalance = useMemo(() => {
    if (!sellAmount || !selectedSellAsset) return false;
    return parseFloat(sellAmount) > parseFloat((selectedSellAsset as any)?.balance || '0');
  }, [sellAmount, selectedSellAsset]);

  const isSameAssetSelected = useMemo(() => {
    return actionType === 'SWAP' && fromChainId === toChainId && selectedSellAsset?.symbol === selectedBuyAsset?.symbol && !!selectedSellAsset;
  }, [actionType, fromChainId, toChainId, selectedSellAsset, selectedBuyAsset]);

  const hasActiveCrossChainQuote = useMemo(() => {
    if (actionType !== 'BRIDGE') return false;
    return activeQuote.source === 'bridge' ? !!activeQuote.data : (!!rangoQuote || !!activeQuote.data);
  }, [actionType, activeQuote.source, activeQuote.data, rangoQuote]);

  const isErrorState = !!(swapError || isInsufficientBalance || bridgeTxStatus === 'error' || bridgeErrorMsg || isSameAssetSelected || (actionType === 'BRIDGE' && crossChainWarning) || activeQuote.error);

  const isLoadingExecution = actionType === 'SWAP' ? (isStellar(fromChainId) ? ['preparing', 'signing'].includes(bridgeTxStatus) : (swapLoading || isFusionLoading)) : ['preparing', 'signing'].includes(bridgeTxStatus);

  const errorMessage = useMemo(() => {
    if (isInsufficientBalance) return 'Insufficient balance for this transaction';
    if (isSameAssetSelected) return 'Please select different assets to swap';
    if (bridgeTxStatus === 'error' || bridgeErrorMsg) return bridgeErrorMsg || 'Transaction failed. Please try again.';
    if (swapError) return swapError;
    if (activeQuote.error) return activeQuote.error;
    if (actionType === 'BRIDGE' && crossChainWarning) return crossChainWarning;
    return null;
  }, [isInsufficientBalance, isSameAssetSelected, bridgeTxStatus, bridgeErrorMsg, swapError, actionType, crossChainWarning, activeQuote.error]);

  const slippageWarning = useMemo(() => {
    if (actionType !== 'BRIDGE' || activeQuote.source !== 'rango') return null;
    const q = rangoQuote || activeQuote.data;
    if (!q?.result) return null;
    return getRangoSlippageWarning(q.result, userSlippageTolerance);
  }, [actionType, activeQuote.source, rangoQuote, activeQuote.data, userSlippageTolerance]);

  const buttonLabel = useMemo(() => {
    if (isFetchingSwapAssets || activeQuote.loading || swapQuoteLoading || isFetchingStellarAssets) return 'FETCHING QUOTES...';
    if (!sellAmount || parseFloat(sellAmount) <= 0) return 'ENTER AMOUNT';
    if (isSameAssetSelected) return 'SELECT DIFFERENT ASSET';
    if (isInsufficientBalance) return 'INSUFFICIENT BALANCE';
    if ((swapError || activeQuote.error || bridgeErrorMsg) && actionType === 'SWAP') return 'SWAP FAILED';

    if (isStellar(toChainId) && selectedBuyAsset && !selectedBuyAsset.isNative && !selectedBuyAsset.hasTrustline) {
      return actionType === 'SWAP' ? 'ADD TRUSTLINE & SWAP' : 'ADD TRUSTLINE & BRIDGE';
    }

    if (slippageWarning) return 'SWAP ANYWAY';

    if (activeQuote.source === 'rango' && !isInsufficientBalance && !swapError) return 'SWAP';
    return actionType === 'SWAP' ? 'SWAP' : 'BRIDGE';
  }, [isFetchingSwapAssets, activeQuote.loading, activeQuote.source, activeQuote.error, isFetchingStellarAssets, sellAmount, isInsufficientBalance, swapError, bridgeErrorMsg, swapQuoteLoading, actionType, isSameAssetSelected, toChainId, selectedBuyAsset, slippageWarning]);
  useEffect(() => {
    if (!sellAmount || parseFloat(sellAmount) <= 0) {
      resetQuotes();
      setBridgeErrorMsg(null);
      setBridgeTxStatus('idle');
    }
  }, [sellAmount, resetQuotes]);

  useEffect(() => {
    setBridgeErrorMsg(null);
    if (bridgeTxStatus === 'error') setBridgeTxStatus('idle');
  }, [fromChainId, toChainId, sellAssetSymbol, buyAssetSymbol]);

  useEffect(() => {
    setTimeToNextRefresh(30);
    resetSwap();
    fusionInputChangeRef.current += 1;
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
    setActiveQuote({ source: null, data: null, error: null, loading: false });
    setCrossChainWarning(null);
    setBridgeErrorMsg(null);
    setSellAmount('');
    setShowFusionScreen(false);
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

    setBridgeErrorMsg(null);
    setBridgeTxStatus('preparing');

    if (actionType === 'SWAP') {
      if (isGasless && !isStellar(fromChainId)) {
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

      if (isStellar(fromChainId)) {
        if (!activeQuote.data || !ammService || !stellarAddress) {
          setBridgeTxStatus('idle');
          return;
        }
        try {
          setBridgeTxStatus('preparing');
          const tx = await ammService.buildSwapTransaction(stellarAddress, activeQuote.data, {
            slippageTolerance: userSlippageTolerance
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
          showToast({
            type: 'STELLAR',
            title: 'Swap Transaction Sent',
            message: `Swapping ${sellAmount} ${sellAssetSymbol} \u2192 ${buyAssetSymbol}`
          });
        } catch (err) {
          console.error('Stellar swap execution failed:', err);
          const errMsg = parseSwapError(err);
          setBridgeErrorMsg(errMsg);
          setBridgeTxStatus('error');
          showToast({
            type: 'STELLAR',
            title: 'Swap Failed',
            message: errMsg
          });
        }
      } else {
        if (!swapQuote || !selectedSellAsset || !selectedBuyAsset) {
          setBridgeTxStatus('idle');
          return;
        }
        try {
          await performSwap(swapQuote, selectedSellAsset as any, selectedBuyAsset as any, sellAmount, userSlippageTolerance);
          setBridgeTxStatus('idle');
          showToast({
            type: 'EVM_SWAP',
            title: 'Swap Transaction Sent',
            message: `Swapping ${sellAmount} ${sellAssetSymbol} \u2192 ${buyAssetSymbol}`
          });
        } catch (err) {
          console.error('Swap execution failed:', err);
          setBridgeErrorMsg(parseWalletError(err));
          resetLoadingState();
          setBridgeTxStatus('error');
          showToast({ type: 'EVM_SWAP', title: 'Swap Failed', message: parseWalletError(err) });
        }
      }
    } else {
      if (isStellar(fromChainId) && !stellarAddress) { setBridgeTxStatus('idle'); return; }
      if (isStellar(toChainId) && !stellarAddress) { setBridgeTxStatus('idle'); return; }
      if (!isStellar(fromChainId) && !evmAddress) { setBridgeTxStatus('idle'); return; }

      if (!activeQuote.data && !rangoQuote) { setBridgeTxStatus('idle'); return; }

      try {
        if (isStellar(fromChainId)) {
          if (!stellarAddress || !evmAddress || !activeQuote.data) { setBridgeTxStatus('idle'); return; }
          const xdr = await prepareStellarToEvmRawTransaction({
            amount: sellAmount,
            sourceToken: activeQuote.data.sourceToken,
            destinationToken: activeQuote.data.destinationToken,
            fromAccountAddress: stellarAddress,
            toAccountAddress: evmAddress,
            network: currentNetwork,
            feePaymentMethod: feePayType === 'native' ? FeePaymentMethod.WITH_NATIVE_CURRENCY : FeePaymentMethod.WITH_STABLECOIN,
            messenger: Messenger.ALLBRIDGE,
            slippageTolerance: userSlippageTolerance
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
            setBridgeTxStatus('success');
            addLocalTransaction({
              hash: result.hash,
              chainId: fromChainId,
              type: 'bridge',
              timestamp: Date.now(),
              description: `Bridge ${sellAssetSymbol} \u2192 ${buyAssetSymbol}`,
              from: stellarAddress,
              status: 'pending',
              network: currentNetwork
            });
            showToast({
              type: 'BRIDGE',
              title: 'Bridge Initiated',
              message: `Transferring ${sellAmount} ${sellAssetSymbol} to ${buyAssetSymbol}`
            });
          } else {
            throw new Error(result.error || 'Stellar transaction failed');
          }
        } else if (activeQuote.source === 'rango' && (rangoQuote || activeQuote.data)) {
          if (!evmAddress) { setBridgeTxStatus('idle'); return; }
          const currentRangoQuote = rangoQuote || activeQuote.data;
          const requestId = currentRangoQuote.requestId || currentRangoQuote.result?.requestId;
          if (!requestId) throw new Error('No Rango requestId available');

          const destAddr = isStellar(toChainId) ? stellarAddress : evmAddress;
          if (!destAddr) throw new Error('Destination address not found');

          const confirmResult = await confirmRangoRoute(
            requestId,
            fromChainId,
            toChainId,
            evmAddress,
            destAddr
          );

          if (!confirmResult?.ok && !confirmResult?.result) {
            throw new Error(confirmResult?.error || 'Failed to confirm Rango route');
          }

          const { executeRangoSwap, validateRangoResult } = await import('../../utils/evmSwapUtils');

          if (confirmResult.result) {
            validateRangoResult(confirmResult.result);
          }

          await executeRangoSwap(
            requestId,
            fromChainId,
            evmAddress,
            currentNetwork,
            sellAssetSymbol,
            buyAssetSymbol,
            getProvider,
            {
              setStatus: setBridgeTxStatus,
              setHash: setBridgeTxHash,
              addTransaction: addLocalTransaction
            },
            userSlippageTolerance
          );
          setBridgeTxStatus('success');
          showToast({
            type: 'EVM_SWAP',
            title: 'Swap Transaction Sent',
            message: `Swapping ${sellAmount} ${sellAssetSymbol} \u2192 ${buyAssetSymbol}`
          });

        } else if (activeQuote.source === 'bridge' && activeQuote.data) {
          const destAddr = isStellar(toChainId) ? stellarAddress : evmAddress;
          if (!evmAddress || !destAddr) { setBridgeTxStatus('idle'); return; }

          const bridgeResponse = await prepareBridgeTransaction({
            fromChainId,
            toChainId,
            amount: sellAmount,
            feePayType,
            fromAddress: evmAddress,
            destinationAddress: destAddr,
            sourceToken: sellAssetSymbol,
            destinationToken: buyAssetSymbol,
            slippageTolerance: userSlippageTolerance
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
            if (tx.type === 'approve') {
              addLocalTransaction({
                hash,
                chainId: fromChainId,
                type: 'approval',
                timestamp: Date.now(),
                description: `Approve ${sellAssetSymbol} for Bridge`,
                from: evmAddress,
                status: 'success',
                network: currentNetwork
              });
            }
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
          showToast({
            type: 'BRIDGE',
            title: 'Bridge Initiated',
            message: `Transferring ${sellAmount} ${sellAssetSymbol} to ${buyAssetSymbol}`
          });
        }
      } catch (err: any) {
        console.error('Bridge failed:', err);
        const errMsg = parseWalletError(err);
        setBridgeErrorMsg(errMsg);
        resetLoadingState();
        setBridgeTxStatus('error');
        showToast({ type: 'BRIDGE', title: 'Transaction Failed', message: errMsg });
      }
    }
  }, [
    actionType, swapQuote, selectedSellAsset, selectedBuyAsset, sellAmount, userSlippageTolerance, performSwap, evmAddress,
    stellarAddress, activeQuote, rangoQuote, fromChainId, toChainId, ammService, getProvider,
    isGasless, fetchFusionQuote, feePayType, sellAssetSymbol, buyAssetSymbol, currentNetwork,
    confirmRangoRoute, resetLoadingState
  ]);
  const handleChainSelectInModal = useCallback(async (newChainId: number | string, isSource: boolean) => {
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
    (actionType === 'SWAP' && isStellar(fromChainId) && !activeQuote.data) ||
    (actionType === 'SWAP' && !isStellar(fromChainId) && !swapQuote && !isGasless) ||
    (actionType === 'BRIDGE' && !activeQuote.data && !rangoQuote && !activeQuote.loading && !isStellar(fromChainId)) ||
    isFetchingSwapAssets ||
    activeQuote.loading ||
    swapQuoteLoading ||
    isChainSwitching ||
    isSameAssetSelected;

  console.log("{{{{{{{{{{{}}", activeQuote, "{{{{{{{{{{{")
  const calculatedBuyAmount = useMemo(() => {
    if (isSameAssetSelected) return 'SELECT DIFFERENT PAIR';

    if (actionType === 'SWAP') {
      if (isGasless && fusionQuote && showFusionScreen) {
        const decimals = (selectedBuyAsset as any)?.decimals || 18;
        return ethers.formatUnits(fusionQuote.toTokenAmount, decimals);
      }
      if (isStellar(fromChainId)) return activeQuote.data?.estimatedOutput || '0.00';
      return swapQuote?.outputAmount || '0.00';
    }

    // BRIDGE mode
    if (activeQuote.source === 'bridge') return activeQuote.data?.minimumAmountOut || '0.00';
    if (activeQuote.source === 'rango') return (rangoQuote || activeQuote.data)?.result?.outputAmount || '0.00';
    if (swapQuote) return swapQuote.outputAmount || '0.00';

    return '0.00';
  }, [actionType, swapQuote, fusionQuote, isGasless, showFusionScreen, selectedBuyAsset, activeQuote.data, activeQuote.source, rangoQuote, fromChainId, isSameAssetSelected]);

  const minimumReceived = (() => {
    if (actionType === 'BRIDGE') {
      if (activeQuote.source === 'rango') return (rangoQuote || activeQuote.data)?.result?.outputAmount || '0.00';
      if (activeQuote.source === 'bridge') return activeQuote.data?.minimumAmountOut || '0.00';
    }

    if (isStellar(fromChainId) && activeQuote.source === 'stellar') return activeQuote.data?.minimumOutput;

    if (swapQuote?.minimumReceived) return swapQuote.minimumReceived;
    if (!swapQuote?.outputAmount || !selectedBuyAsset) return '0.00';

    try {
      const decimals = (selectedBuyAsset as any).decimals || 18;
      const amountBN = ethers.parseUnits(swapQuote.outputAmount, decimals);
      const slippageBips = BigInt(Math.floor(userSlippageTolerance * 100));
      const minReceivedBN = (amountBN * (10000n - slippageBips)) / 10000n;
      return ethers.formatUnits(minReceivedBN, decimals);
    } catch (err) { return calculatedBuyAmount; }
  })();

  return (
    <PageLayout title="Token Swap" subtitle="Unified Exchange & Bridge" onBack={onClose} showBackButton={!!onClose} maxWidth="lg">
      <div className="mx-auto lg:px-2 sm:px-0 w-full max-w-full overflow-hidden">

        {/* Settings Header - Only show for Rango/Bridge */}
        {((actionType === 'BRIDGE' && activeQuote.source === 'rango') || (actionType === 'SWAP' && swapQuote?.provider === 'RANGO')) && (
          <div className="flex justify-end mb-1 relative z-10">
            <button
              onClick={() => setIsSlippageSettingsOpen(true)}
              className="p-2 rounded-full bg-tertiary text-muted hover:text-primary hover:bg-white/5 transition-all"
              title="Slippage Settings"
            >
              <Settings size={16} />
            </button>
          </div>
        )}

        {/* Pay Card */}
        <div className="bg-tertiary rounded-2xl p-4 py-6 lg:p-6 shadow-sm relative overflow-hidden flex flex-col border border-divider/50 w-full max-w-full">
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
              style={{ width: 'clamp(120px, 32vw, 160px)' }}
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
        <div className="flex justify-center -my-4 lg:-my-5  relative  z-10">
          <button onClick={handleAssetSwap} className="w-10 h-10 md:w-12  md:h-12 rounded-xl bg-secondary flex items-center justify-center shadow-lg hover:scale-110 active:scale-90 transition-all duration-300 text-brand group backdrop-blur-md">
            <ArrowUpDown size={18} className="group-hover:rotate-180 transition-transform duration-500" />
          </button>
        </div>

        {/* Receive Card */}
        <div className="bg-tertiary rounded-2xl  p-4 py-6 lg:p-6 shadow-sm relative overflow-hidden flex flex-col border border-divider/50 w-full max-w-full">
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
              style={{ width: 'clamp(120px, 32vw, 160px)' }}
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

            <div className="flex-1 w-0 min-w-0 flex flex-col items-end">
              <div className="max-w-full overflow-x-auto whitespace-nowrap scrollbar-hide">
                <div className={`font-black text-primary transition-all duration-300 ${isSameAssetSelected ? 'text-sm sm:text-base opacity-40 tracking-wider' : 'text-3xl sm:text-4xl tabular-nums'}`}>
                  {(activeQuote.loading || swapQuoteLoading) ? (
                    <div className="flex justify-end gap-1 items-end mt-2">
                      <div className="w-4 h-8 sm:w-6 sm:h-10 bg-white/5 animate-pulse rounded-md" />
                      <div className="w-4 h-8 sm:w-6 sm:h-10 bg-white/5 animate-pulse rounded-md delay-75" />
                      <div className="w-1 h-1 bg-white/5 animate-pulse rounded-full mb-2" />
                      <div className="w-4 h-8 sm:w-6 sm:h-10 bg-white/5 animate-pulse rounded-md delay-150" />
                      <div className="w-4 h-8 sm:w-6 sm:h-10 bg-white/5 animate-pulse rounded-md delay-200" />
                    </div>
                  ) : ((swapQuote || activeQuote.data || rangoQuote || isSameAssetSelected) ? <span>{calculatedBuyAmount}</span> : '0.00')}
                </div>
              </div>
              {(swapQuote || activeQuote.data || rangoQuote) && !isSameAssetSelected && (
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
          <div className={`grid transition-all duration-500 ease-in-out ${(actionType === 'SWAP' && (swapQuote || (activeQuote.source === 'stellar' && activeQuote.data))) || (actionType === 'BRIDGE' && hasActiveCrossChainQuote) ? 'grid-rows-[1fr] opacity-100 mt-6' : 'grid-rows-[0fr] opacity-0 mt-0 pointer-events-none'}`}>
            <div className="overflow-hidden">
              <div className="pt-5 sm:pt-6 border-t border-dotted border-white/10 space-y-1">

                {/* Provider row */}
                {(swapQuote?.provider || activeQuote.data?.provider || activeQuote.source) && (
                  <div className="flex items-center justify-between py-2 border-b border-white/5">
                    <span className="text-[10px] font-black uppercase tracking-widest text-muted">
                      Provider
                    </span>

                    <div className="flex items-center gap-1.5">
                      {/* Rango */}
                      {(swapQuote?.provider === 'RANGO' ||
                        activeQuote.data?.provider === 'RANGO' ||
                        activeQuote.source === 'rango') && (
                          <img
                            src="https://raw.githubusercontent.com/rango-exchange/assets/main/swappers/Across/icon.svg"
                            className="w-4 h-4 rounded-full"
                            alt="Rango"
                          />
                        )}

                      {/* Uniswap */}
                      {(swapQuote?.provider === 'UNISWAP' ||
                        activeQuote.data?.provider === 'UNISWAP'
                      ) && (
                          <img
                            src="https://cryptologos.cc/logos/uniswap-uni-logo.png"
                            className="w-4 h-4 rounded-full"
                            alt="Uniswap"
                          />
                        )}

                      <span className="text-[11px] font-black text-brand uppercase tracking-wider">
                        {swapQuote?.provider ||
                          activeQuote.data?.provider ||
                          activeQuote.source?.toUpperCase() ||
                          'UNISWAP'}
                      </span>
                    </div>
                  </div>
                )}


                {/* Rate row */}
                <div className="flex items-center justify-between py-2 border-b border-white/5">
                  <span className="text-[10px] font-black uppercase tracking-widest text-muted">Rate</span>
                  <span className="text-[11px] font-black text-primary truncate ml-2 flex-1 w-0 text-right min-w-0">
                    1 {sellAssetSymbol} ≈ {actionType === 'SWAP'
                      ? (isGasless && fusionQuote && showFusionScreen
                        ? (Number(fusionQuote.prices.usd.fromToken) / Number(fusionQuote.prices.usd.toToken)).toFixed(6)
                        : isStellar(fromChainId) && activeQuote.source === 'stellar' && activeQuote.data
                          ? (Number(activeQuote.data.estimatedOutput) / Number(activeQuote.data.inputAmount)).toFixed(6)
                          : portfolioUtils.formatBalance(swapQuote?.pricePerToken || '0'))
                      : activeQuote.source === 'rango'
                        ? portfolioUtils.formatBalance((rangoQuote || activeQuote.data)?.result?.outputAmount || '0')
                        : portfolioUtils.formatBalance(activeQuote.data?.conversionRate || '0')} {buyAssetSymbol}
                  </span>
                </div>


                {/* SWAP specific rows */}
                {actionType === 'SWAP' && (
                  <>
                    <div className="flex items-center justify-between py-2 border-b border-white/5">
                      <span className="text-[10px] font-black uppercase tracking-widest text-muted">Max Slippage</span>
                      {swapQuote?.provider === 'RANGO' ? (
                        <button
                          onClick={() => setIsSlippageSettingsOpen(true)}
                          className="text-[11px] font-black text-brand underline decoration-brand/30 underline-offset-2 hover:opacity-80 transition-all"
                        >
                          {userSlippageTolerance}%
                        </button>
                      ) : (
                        <span className={`text-[11px] font-black ${isGasless && showFusionScreen ? 'text-green-500' : 'text-primary'}`}>
                          {isGasless && showFusionScreen ? 'None' : `${userSlippageTolerance}%`}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between py-2 border-b border-white/5">
                      <span className="text-[10px] font-black uppercase tracking-widest text-muted">Network Fee</span>
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

                    {isStellar(fromChainId) && activeQuote.source === 'stellar' && activeQuote.data && (
                      <div className="flex items-center justify-between py-2 border-b border-white/5">
                        <span className="text-[10px] font-black uppercase tracking-widest text-muted">Price Impact</span>
                        <span className={`text-[11px] font-black ${activeQuote.data.priceImpact > 2 ? 'text-red-500' : 'text-green-500'}`}>
                          {activeQuote.data.priceImpact.toFixed(2)}%
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
                    {activeQuote.source === 'rango' && (rangoQuote || activeQuote.data)?.result?.swaps?.[0] ? (() => {
                      const swap = (rangoQuote || activeQuote.data).result.swaps[0];
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

                          <div className="flex items-center justify-between py-2 border-b border-white/5">
                            <span className="text-[10px] font-black uppercase tracking-widest text-muted">Max Slippage</span>
                            <button
                              onClick={() => setIsSlippageSettingsOpen(true)}
                              className="text-[11px] font-black text-brand underline decoration-brand/30 underline-offset-2 hover:opacity-80 transition-all"
                            >
                              {userSlippageTolerance}%
                            </button>
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
                        {activeQuote.data?.fee && (activeQuote.data.fee.native || activeQuote.data.fee.stablecoin) && (
                          <div className="flex items-center justify-between py-2 border-b border-white/5">
                            <span className="text-[10px] font-black uppercase tracking-widest text-muted">Bridge Fee</span>
                            <div className="flex items-center gap-1.5">
                              {(() => {
                                const currentFee = activeQuote.data.fee[feePayType] || activeQuote.data.fee.stablecoin || activeQuote.data.fee.native;
                                return (
                                  <>
                                    <span className="text-[11px] font-black text-primary">
                                      {Number(currentFee.amount).toFixed(4)}
                                    </span>
                                    <span className="text-[9px] font-black text-muted">{currentFee.symbol}</span>
                                  </>
                                );
                              })()}
                              {activeQuote.data.fee.native && activeQuote.data.fee.stablecoin && (
                                <div className="flex items-center gap-1 bg-secondary/50 rounded-full p-0.5 ml-1">
                                  <button
                                    onClick={() => setFeePayType('native')}
                                    className={`p-0.5 rounded-full transition-all flex items-center justify-center ${feePayType === 'native' ? 'bg-primary/20 ring-1 ring-primary/50' : 'opacity-40 hover:opacity-100'}`}
                                    title={`Pay with ${activeQuote.data.fee.native.symbol}`}
                                  >
                                    <img src={fromChainConfig?.nativeCurrency.logoURI || `https://ui-avatars.com/api/?name=${activeQuote.data.fee.native.symbol}&background=random`} className="w-4 h-4 rounded-full object-cover" alt="Native" />
                                  </button>
                                  <button
                                    onClick={() => setFeePayType('stablecoin')}
                                    className={`p-0.5 rounded-full transition-all flex items-center justify-center ${feePayType === 'stablecoin' ? 'bg-primary/20 ring-1 ring-primary/50' : 'opacity-40 hover:opacity-100'}`}
                                    title={`Pay with ${activeQuote.data.fee.stablecoin.symbol}`}
                                  >
                                    <img src={swapAssets.find(a => a.symbol.toUpperCase() === activeQuote.data.fee.stablecoin.symbol.toUpperCase())?.logoURI || `https://ui-avatars.com/api/?name=${activeQuote.data.fee.stablecoin.symbol}&background=random`} className="w-4 h-4 rounded-full object-cover" alt="Stable" />
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        <div className="flex items-center justify-between py-2 border-b border-white/5">
                          <span className="text-[10px] font-black uppercase tracking-widest text-muted">Est. Time</span>
                          <span className="text-[11px] font-black text-primary">
                            ~{activeQuote.data?.completionTime ? Math.max(1, Math.round(activeQuote.data.completionTime / 60000)) : 5} min
                          </span>
                        </div>
                      </>
                    )}
                  </>
                )}
                {/* Min received */}
                <div className="flex items-center justify-between py-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-muted">Min. Received</span>
                  <span className="text-[12px] font-black text-brand truncate ml-2 flex-1 w-0 text-right min-w-0">
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
                {errorMessage || 'An error occurred. Please check your inputs.'}
              </p>
            </div>
          </div>

          <ActionGuard
            title="Connect Wallet"
            requiredWallets={requiredWallets}
            disabled={isLoadingExecution}
          >
            <>
              {slippageWarning && (
                <div className="mb-3 bg-primary border border-blue-500/20 rounded-lg p-3 flex flex-col gap-1.5 relative z-10 shadow-inner-blue-400">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold  uppercase tracking-widest flex items-center gap-1">
                      High Slippage Risk
                    </span>
                    <button
                      onClick={() => setIsSlippageSettingsOpen(true)}
                      className="text-[10px] font-black  bg-secondary rounded-md px-4 py-2 hover:opacity-80 transition-all uppercase tracking-widest"
                    >
                      Edit
                    </button>
                  </div>
                  <span className="text-[11px] text-muted leading-relaxed">
                    Provider requires <strong>{slippageWarning.recommendedSlippage}%</strong> slippage. Your current setting (<strong>{slippageWarning.userSlippage}%</strong>) may cause the transaction to fail.
                  </span>
                </div>
              )}

              <TransactionButton
                label={buttonLabel}
                isLoading={isLoadingExecution}
                isDisabled={isSwapDisabled}
                isError={!!isErrorState && !isLoadingExecution}
                onClick={handleUnifiedSwap}
                icon={isGasless && actionType === 'SWAP' ? <Zap size={20} className="fill-white" /> : undefined}
                className={`relative z-10 ${isErrorState && !isLoadingExecution ? '!rounded-t-none border-t-red-500/20' : ''}`}
              />
            </>
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
          onBack={() => {
            setShowFusionScreen(false);
          }}
          loading={isFusionLoading}
          fusionStatus={fusionStatus}
          error={swapError || bridgeErrorMsg}
          txHash={swapTxHash}
          onRefreshQuote={(!isFusionLoading && !swapTxHash && selectedSellAsset && selectedBuyAsset && sellAmount) ? () => {
            if (!isFusionLoading && selectedSellAsset && selectedBuyAsset && sellAmount) {
              setIsFusionLoading(true);
              fetchFusionQuote(selectedSellAsset as any, selectedBuyAsset as any, sellAmount)
                .catch((err) => {
                  console.error('[FusionRefresh] Auto-refresh failed:', err);
                  setBridgeErrorMsg(parseWalletError(err));
                })
                .finally(() => setIsFusionLoading(false));
            }
          } : undefined}
          onConfirm={async (preset) => {
            setIsFusionLoading(true);
            setFusionStatus('idle');
            try {
              const hash = await performFusionSwap(
                selectedSellAsset as any,
                selectedBuyAsset as any,
                sellAmount,
                preset,
                (status) => setBridgeTxStatus(status as any)
              );
              setBridgeTxHash(hash);
              setBridgeTxStatus('success');
              showToast({
                type: 'EVM_SWAP',
                title: 'Order Submitted',
                message: `Gasless order for ${sellAmount} ${sellAssetSymbol} submitted successfully.`
              });
            } catch (err) {
              console.error('Fusion swap failed:', err);
              setBridgeErrorMsg(parseWalletError(err));
              resetLoadingState();
              setBridgeTxStatus('error');
              showToast({ type: 'EVM_SWAP', title: 'Swap Failed', message: parseWalletError(err) });
            } finally {
              setIsFusionLoading(false);
            }

          }}
        />
      )}

      <SlippageSettingsModal
        isOpen={isSlippageSettingsOpen}
        onClose={() => setIsSlippageSettingsOpen(false)}
        userSlippageTolerance={userSlippageTolerance}
        setUserSlippageTolerance={setUserSlippageTolerance}
        recommendedSlippage={slippageWarning?.recommendedSlippage}
      />
    </PageLayout>
  );
};

export default SwapAssets;