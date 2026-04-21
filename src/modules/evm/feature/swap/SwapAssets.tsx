import {
  ArrowUpDown,
  ChevronDown,
  RefreshCw,
  Plus,
  Minus,
  Settings2,
  X
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
import { EvmActionGuard } from '../../components/EvmActionGuard';
import { switchOrAddChain } from '../../utils/evmChainUtils';
import { ConfirmationModal } from '../../../../components/common/ConfirmationModal';

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

  // URL State Management
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
  const [buyAssetSymbol, setBuyAssetSymbol] = useState<string>(searchParams.get('buyAsset') || '');
  const [sellAmount, setSellAmount] = useState<string>('');

  const [slippageTolerance, setSlippageTolerance] = useState<number>(0.5);
  const [isSlippageModalOpen, setIsSlippageModalOpen] = useState<boolean>(false);
  const SLIPPAGE_PRESETS = [0.1, 0.5, 1.0, 3.0, 5.0];

  const [isChainSwitching, setIsChainSwitching] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);

  // Bridge-Specific State
  const [bridgeQuoteData, setBridgeQuoteData] = useState<any>(null);
  const [isFetchingBridgeQuote, setIsFetchingBridgeQuote] = useState(false);
  const [feePayType, setFeePayType] = useState<'native' | 'stablecoin'>('stablecoin');
  const [bridgeTxStatus, setBridgeTxStatus] = useState<'idle' | 'preparing' | 'signing' | 'success' | 'error'>('idle');
  const [bridgeTxHash, setBridgeTxHash] = useState<string | null>(null);

  // Stellar AMM State
  const [ammService, setAmmService] = useState<AmmSwapService | null>(null);
  const [stellarAssets, setStellarAssets] = useState<any[]>([]);
  const [stellarSwapQuote, setStellarSwapQuote] = useState<any>(null);
  const [isFetchingStellarAssets, setIsFetchingStellarAssets] = useState(false);

  const actionType = useMemo(() => fromChainId === toChainId ? 'SWAP' : 'BRIDGE', [fromChainId, toChainId]);

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
    performSwap,
    reset: resetSwap,
  } = useEvmSwap({
    chainId: fromChainId,
    senderAddress: evmAddress,
    getProvider,
  });

  const fromChainConfig = getChainById(fromChainId);
  const toChainConfig = getChainById(toChainId);

  // Initialize Stellar AMM Service
  useEffect(() => {
    if (isStellar(fromChainId)) {
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
  }, [fromChainId, currentNetwork]);

  const selectedSellAsset = useMemo(() => {
    if (isStellar(fromChainId)) {
      return stellarAssets.find(a => a.symbol === sellAssetSymbol);
    }

    if (actionType === 'SWAP') {
      return swapAssets.find(a => a.symbol === sellAssetSymbol);
    }

    const tokenMeta = fromChainConfig?.bridgeSupportTokens?.find((t: any) => t.symbol === sellAssetSymbol);
    const liveAsset = swapAssets.find(a => a.symbol === sellAssetSymbol);

    return {
      symbol: sellAssetSymbol,
      isNative: liveAsset?.isNative || false,
      address: tokenMeta?.address || liveAsset?.address || '',
      balance: liveAsset?.balance || '0',
      decimals: tokenMeta?.decimals || liveAsset?.decimals || 18,
      logoURI: tokenMeta?.logoURI || liveAsset?.logoURI || ''
    };
  }, [actionType, swapAssets, sellAssetSymbol, fromChainConfig, stellarAssets, fromChainId]);

  const selectedBuyAsset = useMemo(() => {
    if (isStellar(toChainId)) {
      return stellarAssets.find(a => a.symbol === buyAssetSymbol);
    }

    if (actionType === 'SWAP') {
      return swapAssets.find(a => a.symbol === buyAssetSymbol);
    }

    const tokenMeta = toChainConfig?.bridgeSupportTokens?.find((t: any) => t.symbol === buyAssetSymbol);
    const liveAsset = swapAssets.find(a => a.symbol === buyAssetSymbol);

    return {
      symbol: buyAssetSymbol,
      isNative: liveAsset?.isNative || false,
      address: tokenMeta?.address || liveAsset?.address || '',
      balance: liveAsset?.balance || '0',
      decimals: tokenMeta?.decimals || liveAsset?.decimals || 18,
      logoURI: tokenMeta?.logoURI || liveAsset?.logoURI || ''
    };
  }, [actionType, swapAssets, buyAssetSymbol, toChainConfig, stellarAssets, toChainId]);

  // Confirmation Modal specific to bridge transitions
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);

  // Sync state to URL
  useEffect(() => {
    const params = new URLSearchParams();
    params.set('fromChainId', String(fromChainId));
    params.set('toChainId', String(toChainId));
    if (sellAssetSymbol) params.set('sellAsset', sellAssetSymbol);
    if (buyAssetSymbol) params.set('buyAsset', buyAssetSymbol);
    setSearchParams(params, { replace: true });
  }, [fromChainId, toChainId, sellAssetSymbol, buyAssetSymbol, setSearchParams]);

  useEffect(() => {
    if (currentChainId && swapEnabledChains.some(c => c.chainId === currentChainId)) {
      if (!searchParams.get('fromChainId')) setFromChainId(currentChainId);
      if (!searchParams.get('toChainId')) setToChainId(currentChainId);
    }
  }, [currentChainId, searchParams, swapEnabledChains]);

  // Reset states when chain or asset changes
  useEffect(() => {
    setSellAmount('');
    resetSwap();
    setBridgeTxStatus('idle');
    setBridgeTxHash(null);
    setStellarSwapQuote(null);
    setBridgeQuoteData(null);

    if (actionType === 'SWAP' && fromChainId && !isStellar(fromChainId)) {
      fetchTokenList();
    }
  }, [fromChainId, toChainId, sellAssetSymbol, buyAssetSymbol, resetSwap, actionType, fetchTokenList]);

  // Auto-clear terminal execution errors after 6 seconds
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

  // Sync token balances when assets or connection changes
  useEffect(() => {
    if (isConnected && !isChainSwitching) {
      if (isStellar(fromChainId)) {
        // Handled by Stellar asset fetcher below
        return;
      }
      if (selectedSellAsset || selectedBuyAsset) {
        updateTokenBalances(selectedSellAsset as any, selectedBuyAsset as any);
      }
    }
  }, [selectedSellAsset?.address, selectedBuyAsset?.address, isConnected, evmAddress, stellarAddress, isChainSwitching, updateTokenBalances, swapAssets.length, actionType, fromChainId]);

  // Fetch Stellar Assets for Source Chain (Swap or Bridge)
  useEffect(() => {
    if (isStellar(fromChainId) && stellarAddress && ammService) {
      const fetchStellar = async () => {
        setIsFetchingStellarAssets(true);
        try {
          const balances = await ammService.getTokenBalances(stellarAddress);
          const mapped = balances.map(b => {
            const metadata = getGlobalAssetMetadata(b.code);
            return {
              id: `stellar-${fromChainId}-${b.code}`,
              symbol: b.code,
              name: b.code,
              logoURI: metadata?.logoURI,
              balance: b.balance,
              decimals: 7,
              isNative: b.asset.isNative(),
              asset: b.asset,
              chainId: STELLAR_CHAIN_ID
            };
          });
          setStellarAssets(mapped);
          if (actionType === 'SWAP') {
            if (!sellAssetSymbol && mapped.length > 0) setSellAssetSymbol(mapped[0].symbol);
            if (!buyAssetSymbol && mapped.length > 1) {
              const destToken = mapped.find(t => t.symbol !== sellAssetSymbol) || mapped[1];
              setBuyAssetSymbol(destToken.symbol);
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
  }, [fromChainId, stellarAddress, ammService, sellAssetSymbol, actionType]);

  useEffect(() => {
    if (actionType === 'SWAP') {
      if (swapAssets.length > 0 && !sellAssetSymbol && !buyAssetSymbol && !isChainSwitching) {
        const nativeAsset = swapAssets.find(a => a.isNative);
        const usdcAsset = swapAssets.find(a => a.symbol === 'USDC' || a.symbol === 'USDT' || a.symbol === 'USDS');

        if (nativeAsset && usdcAsset) {
          setSellAssetSymbol(nativeAsset.symbol);
          setBuyAssetSymbol(usdcAsset.symbol);
        } else if (swapAssets.length >= 2) {
          setSellAssetSymbol(swapAssets[0].symbol);
          setBuyAssetSymbol(swapAssets[1].symbol);
        }
      }
    } else {
      const fromSupported = fromChainConfig?.bridgeSupportTokens || [];
      const toSupported = toChainConfig?.bridgeSupportTokens || [];

      const isFromValid = fromSupported.some((t: any) => t.symbol === sellAssetSymbol);
      const isToValid = toSupported.some((t: any) => t.symbol === buyAssetSymbol);

      if (!isFromValid && fromSupported.length > 0) {
        setSellAssetSymbol(fromSupported[0].symbol);
      }
      if (!isToValid && toSupported.length > 0) {
        const target = toSupported.find((t: any) => t.symbol !== sellAssetSymbol) || toSupported[0];
        if (target) setBuyAssetSymbol(target.symbol);
      }
    }
  }, [actionType, swapAssets, sellAssetSymbol, buyAssetSymbol, isChainSwitching, fromChainConfig, toChainConfig]);

  const fetchUnifiedQuote = useCallback(async () => {
    if (!sellAmount || parseFloat(sellAmount) <= 0 || isChainSwitching) {
      setBridgeQuoteData(null);
      return;
    }

    if (actionType === 'SWAP') {
      if (isStellar(fromChainId) && ammService) {
        if (!selectedSellAsset || !selectedBuyAsset) return;
        try {
          const fromAsset = (selectedSellAsset as any).asset;
          const toAsset = (selectedBuyAsset as any).asset;
          if (!fromAsset || !toAsset) return;

          const sq = await ammService.getSwapQuote(fromAsset, toAsset, sellAmount, { slippageTolerance });
          setStellarSwapQuote(sq);
        } catch (err) {
          console.error('Stellar quote error:', err);
          setStellarSwapQuote(null);
        }
      } else {
        // EVM same-chain swap
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
          if (err?.message === 'Quote request cancelled') return;
          console.error('Swap quote error:', err);
        }
      }
    } else {
      setIsFetchingBridgeQuote(true);
      try {
        if (isStellar(fromChainId)) {
          const tokens = await getSupportedTokens();
          const fromChainSym = isStellar(fromChainId) ? ChainSymbol.SRB : fromChainConfig?.nativeCurrency.symbol as ChainSymbol;
          const toChainSym = isStellar(toChainId) ? ChainSymbol.SRB : toChainConfig?.nativeCurrency.symbol as ChainSymbol;

          const src = tokens.find(t => t.chainSymbol === fromChainSym && t.symbol === sellAssetSymbol);
          const dst = tokens.find(t => t.chainSymbol === toChainSym && t.symbol === buyAssetSymbol);

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
        } else {
          const bdgQ = await getEvmBridgeQuote(fromChainId, toChainId, sellAmount, sellAssetSymbol, buyAssetSymbol);
          setBridgeQuoteData(bdgQ);
        }
      } catch (err) {
        console.error('Bridge quote error:', err);
        setBridgeQuoteData(null);
      } finally {
        setIsFetchingBridgeQuote(false);
      }
    }
  }, [actionType, fromChainId, toChainId, selectedSellAsset, selectedBuyAsset, sellAmount, sellAssetSymbol, buyAssetSymbol, fetchSwapQuoteInternal, isChainSwitching, fromChainConfig, toChainConfig, slippageTolerance]);

  useEffect(() => {
    const timeoutId = setTimeout(() => { fetchUnifiedQuote(); }, 800);
    return () => clearTimeout(timeoutId);
  }, [fetchUnifiedQuote]);

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
    setSellAmount('');
  }, [resetSwap]);

  const handleAssetSwap = useCallback(() => {
    const prevSell = sellAssetSymbol;
    setSellAssetSymbol(buyAssetSymbol);
    setBuyAssetSymbol(prevSell);
    setSellAmount('');
    handleReset();
  }, [buyAssetSymbol, sellAssetSymbol, handleReset]);

  const handleUnifiedSwap = useCallback(async () => {
    if (!sellAmount) return;

    if (actionType === 'SWAP') {
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
        } catch (err) {
          console.error('Stellar swap execution failed:', err);
          setBridgeTxStatus('error');
        }
      } else {
        if (!swapQuote || !selectedSellAsset || !selectedBuyAsset) return;
        try {
          await performSwap(swapQuote, selectedSellAsset as any, selectedBuyAsset as any, sellAmount, slippageTolerance);
        } catch (err) { console.error('Swap execution failed:', err); }
      }
    } else {
      if (isStellar(fromChainId) && !stellarAddress) return;
      if (isStellar(toChainId) && !stellarAddress) return;
      if (!isStellar(fromChainId) && !evmAddress) return;

      if (!bridgeQuoteData) return;
      setIsConfirmModalOpen(true);
    }
  }, [actionType, swapQuote, selectedSellAsset, selectedBuyAsset, sellAmount, slippageTolerance, performSwap, evmAddress, stellarAddress, bridgeQuoteData, fromChainId, toChainId, stellarSwapQuote, ammService, getProvider]);

  const executeBridgeTransaction = useCallback(async () => {
    setIsConfirmModalOpen(false);
    if (!sellAmount || !bridgeQuoteData) return;

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
      } else {
        // EVM to Stellar/EVM logic
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
          if (tx.type === 'transfer') setBridgeTxHash(hash);
        }
      }
      setBridgeTxStatus('success');
    } catch (err: any) {
      console.error('Bridge failed:', err);
      setBridgeTxStatus('error');
    }
  }, [sellAmount, evmAddress, stellarAddress, bridgeQuoteData, fromChainId, toChainId, feePayType, sellAssetSymbol, buyAssetSymbol, slippageTolerance, getProvider, currentNetwork]);
  const handleChainSelectInModal = useCallback(async (newChainId: number, isSource: boolean) => {
    const targetChainId = isSource ? fromChainId : toChainId;
    if (newChainId === targetChainId) return;

    if (isEvmChain(newChainId)) {
      if (isConnected) {
        setIsChainSwitching(true);
        try {
          const provider = getProvider(WalletType.EVM);
          await switchOrAddChain(provider, newChainId);
          if (isSource) setFromChainId(newChainId);
          else setToChainId(newChainId);
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
  }, [isConnected, getProvider, fromChainId, toChainId]);

  // Refresh balances periodically or on demand
  const handleRefreshBalances = useCallback(async () => {
    if (!isConnected || isChainSwitching) return;

    setIsRefreshing(true);
    try {
      if (isStellar(fromChainId)) {
        if (stellarAddress && ammService) {
          const balances = await ammService.getTokenBalances(stellarAddress);
          const mapped = balances.map(b => {
            const metadata = getGlobalAssetMetadata(b.code);
            return {
              id: `stellar-${fromChainId}-${b.code}`,
              symbol: b.code,
              name: b.code,
              logoURI: metadata?.logoURI,
              balance: b.balance,
              decimals: 7,
              isNative: b.asset.isNative(),
              asset: b.asset,
              chainId: STELLAR_CHAIN_ID
            };
          });
          setStellarAssets(mapped);
        }
      } else {
        if (selectedSellAsset || selectedBuyAsset) {
          await updateTokenBalances(selectedSellAsset as any, selectedBuyAsset as any);
        }
      }
    } catch (err) {
      console.error('Refresh balances failed:', err);
    } finally {
      setTimeout(() => setIsRefreshing(false), 800);
    }
  }, [isConnected, isChainSwitching, fromChainId, stellarAddress, ammService, selectedSellAsset, selectedBuyAsset, updateTokenBalances]);

  const isInsufficientBalance = useMemo(() => {
    if (!sellAmount || !selectedSellAsset) return false;
    return parseFloat(sellAmount) > parseFloat((selectedSellAsset as any)?.balance || '0');
  }, [sellAmount, selectedSellAsset]);

  const isSameAssetSelected = useMemo(() => {
    return actionType === 'SWAP' && fromChainId === toChainId && selectedSellAsset?.symbol === selectedBuyAsset?.symbol && !!selectedSellAsset;
  }, [actionType, fromChainId, toChainId, selectedSellAsset, selectedBuyAsset]);

  const isErrorState = swapError || isInsufficientBalance || bridgeTxStatus === 'error' || isSameAssetSelected;

  const buttonLabel = useMemo(() => {
    if (isFetchingSwapAssets || isFetchingBridgeQuote || isFetchingStellarAssets) return 'SYNCING...';
    if (!sellAmount || parseFloat(sellAmount) <= 0) return 'ENTER AMOUNT';
    if (isSameAssetSelected) return 'SELECT DIFFERENT ASSET';
    if (isInsufficientBalance) return 'INSUFFICIENT BALANCE';
    if (swapError && actionType === 'SWAP') return 'SWAP FAILED';
    if (actionType === 'BRIDGE') return 'BRIDGE NOW';
    return 'SWAP NOW';
  }, [isFetchingSwapAssets, isFetchingBridgeQuote, isFetchingStellarAssets, sellAmount, isInsufficientBalance, swapError, actionType, isSameAssetSelected]);

  const isLoadingExecution = actionType === 'SWAP' ? (isStellar(fromChainId) ? ['preparing', 'signing'].includes(bridgeTxStatus) : swapLoading) : ['preparing', 'signing'].includes(bridgeTxStatus);
  const isSwapDisabled = !sellAmount ||
    parseFloat(sellAmount) <= 0 ||
    isInsufficientBalance ||
    isLoadingExecution ||
    (actionType === 'SWAP' && isStellar(fromChainId) && !stellarSwapQuote) ||
    (actionType === 'SWAP' && !isStellar(fromChainId) && !swapQuote) ||
    (actionType === 'BRIDGE' && !bridgeQuoteData) ||
    isFetchingSwapAssets ||
    isFetchingBridgeQuote ||
    isChainSwitching ||
    isSameAssetSelected;

  const calculatedBuyAmount = useMemo(() => {
    if (actionType === 'SWAP') {
      if (isSameAssetSelected) return 'SELECT DIFFERENT PAIR';
      return isStellar(fromChainId) ? (stellarSwapQuote?.estimatedOutput || '0.00') : (swapQuote?.outputAmount || '0.00');
    }
    return bridgeQuoteData?.minimumAmountOut || '0.00';
  }, [actionType, swapQuote, bridgeQuoteData, fromChainId, stellarSwapQuote, isSameAssetSelected]);

  const minimumReceived = (() => {
    if (actionType === 'BRIDGE' && bridgeQuoteData?.minimumAmountOut) return bridgeQuoteData.minimumAmountOut;

    // Stellar AMM minimum output
    if (isStellar(fromChainId) && stellarSwapQuote) return stellarSwapQuote.minimumOutput;

    // EVM Swap minimum output
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
                onSelect: (a: any) => { handleChainSelectInModal(isStellar(a.chainId) ? STELLAR_CHAIN_ID : Number(a.chainId), true); setSellAssetSymbol(a.symbol); }
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
              <span className="text-primary font-black">{portfolioUtils.formatBalance((selectedSellAsset as any)?.balance || '0')} {sellAssetSymbol}</span>
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
                onSelect: (a: any) => { handleChainSelectInModal(isStellar(a.chainId) ? STELLAR_CHAIN_ID : Number(a.chainId), false); setBuyAssetSymbol(a.symbol); }
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
                {(isFetchingBridgeQuote || swapQuoteLoading) ? (
                  <div className="flex justify-end gap-1 items-end mt-2">
                    <div className="w-4 h-8 sm:w-6 sm:h-10 bg-white/5 animate-pulse rounded-md" />
                    <div className="w-4 h-8 sm:w-6 sm:h-10 bg-white/5 animate-pulse rounded-md delay-75" />
                    <div className="w-1 h-1 bg-white/5 animate-pulse rounded-full mb-2" />
                    <div className="w-4 h-8 sm:w-6 sm:h-10 bg-white/5 animate-pulse rounded-md delay-150" />
                    <div className="w-4 h-8 sm:w-6 sm:h-10 bg-white/5 animate-pulse rounded-md delay-200" />
                  </div>
                ) : ((swapQuote || bridgeQuoteData || stellarSwapQuote || isSameAssetSelected) ? <span>{calculatedBuyAmount}</span> : '0.00')}
              </div>
              {(swapQuote || bridgeQuoteData || stellarSwapQuote) && !isSameAssetSelected && (
                <div className="text-[9px] sm:text-[10px] text-green-500 font-extrabold uppercase tracking-widest mt-1 flex items-center justify-end gap-1.5">
                  <div className="w-1 h-1 rounded-full bg-green-500" />
                  ~ Estimated
                </div>
              )}
            </div>
          </div>

          {/* Details Section Inside Receive Card */}
          <div className={`grid transition-all duration-500 ease-in-out ${(actionType === 'SWAP' && swapQuote) || (actionType === 'BRIDGE' && bridgeQuoteData) ? 'grid-rows-[1fr] opacity-100 mt-6' : 'grid-rows-[0fr] opacity-0 mt-0 pointer-events-none'}`}>
            <div className="overflow-hidden">
              <div className="pt-5 sm:pt-6 border-t border-dotted border-white/10 space-y-4 sm:space-y-6">
                <div className="flex justify-between items-center text-[10px] sm:text-[11px] font-black uppercase tracking-widest text-muted">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setIsSlippageModalOpen(true)}
                      className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1 sm:py-1.5 bg-secondary rounded-lg flex-shrink-0 hover:bg-white/5 transition-all text-muted hover:text-primary active:scale-95"
                    >
                      <Settings2 size={11} /> {slippageTolerance}% SLP
                    </button>
                    {actionType === 'BRIDGE' && bridgeQuoteData && (
                      <div className="flex items-center gap-1.5 bg-secondary/50 rounded-lg p-0.5">
                        <button
                          onClick={() => setFeePayType('native')}
                          className={`px-2 py-1 rounded-md transition-all font-bold tracking-widest text-[9px] ${feePayType === 'native' ? 'bg-primary text-secondary shadow-sm' : 'text-muted hover:text-primary/70'
                            }`}
                        >
                          {fromChainConfig?.nativeCurrency.symbol}
                        </button>
                        <button
                          onClick={() => setFeePayType('stablecoin')}
                          className={`px-2 py-1 rounded-md transition-all font-bold tracking-widest text-[9px] ${feePayType === 'stablecoin' ? 'bg-primary text-secondary shadow-sm' : 'text-muted hover:text-primary/70'
                            }`}
                        >
                          STABLE
                        </button>
                      </div>
                    )}
                  </div>
                  <span className="truncate ml-3 sm:ml-4 text-xs font-black uppercase tracking-[0.15em] text-muted opacity-90">
                    1 {sellAssetSymbol} ≈ {actionType === 'SWAP' ? portfolioUtils.formatBalance(swapQuote?.pricePerToken || '0') : portfolioUtils.formatBalance(bridgeQuoteData?.conversionRate || '0')} {buyAssetSymbol}
                  </span>
                </div>

                <div className="flex items-center justify-between text-[10px] sm:text-[11px] font-bold">
                  {actionType === 'SWAP' ? (
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-muted uppercase tracking-tighter opacity-70">
                        <span>Exchange Fee</span>
                        <span className="font-black text-primary">{((swapQuote?.fee || 0) / 10000).toFixed(2)}%</span>
                      </div>
                      {swapQuote?.networkFee !== undefined && swapQuote?.networkFee > 0 && (
                        <div className="flex items-center gap-2 text-muted uppercase tracking-tighter opacity-70">
                          <span>Network Fee</span>
                          <span className="font-black text-primary">~{swapQuote?.networkFee?.toFixed(6)} {fromChainConfig?.nativeCurrency.symbol}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {bridgeQuoteData?.fee?.[feePayType] && (
                        <div className="flex items-center gap-2 text-muted uppercase tracking-tighter opacity-70">
                          <span>Est. Bridge Fee</span>
                          <div className="flex items-center gap-1 text-primary">
                            <span className="font-black">{Number(bridgeQuoteData.fee[feePayType].amount).toFixed(4)}</span>
                            <span className="text-[9px]">{bridgeQuoteData.fee[feePayType].symbol}</span>
                          </div>
                        </div>
                      )}
                      <div className="flex items-center gap-2 text-muted uppercase tracking-tighter opacity-70">
                        <span>Est. Time</span>
                        <span className="font-black text-primary">~{bridgeQuoteData?.completionTime ? Math.max(1, Math.round(bridgeQuoteData.completionTime / 60000)) : 5} min</span>
                      </div>
                    </div>
                  )}
                  <div className="text-right">
                    <span className="text-muted font-black uppercase tracking-widest opacity-80 block text-[9px]">Min. Received</span>
                    <span className="font-black text-brand text-xs sm:text-sm">{portfolioUtils.formatBalance(minimumReceived)} {buyAssetSymbol}</span>
                  </div>
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
                      bridgeTxStatus === 'error' ? 'Transaction failed. Please try again.' :
                        'An error occurred. Please check your inputs.'}
              </p>
            </div>
          </div>

          <EvmActionGuard title="Connect Wallet" message="You need an active EVM connection to transact." disabled={isLoadingExecution}>
            <TransactionButton
              label={buttonLabel}
              isLoading={isLoadingExecution}
              isDisabled={isSwapDisabled}
              isError={!!isErrorState && !isLoadingExecution}
              onClick={handleUnifiedSwap}
              className={`relative z-10 ${isErrorState && !isLoadingExecution ? '!rounded-t-none border-t-red-500/20' : ''}`}
            />
          </EvmActionGuard>
        </div>

        {isConfirmModalOpen && (
          <ConfirmationModal
            isOpen={isConfirmModalOpen}
            onConfirm={executeBridgeTransaction}
            onCancel={() => setIsConfirmModalOpen(false)}
            title="Confirm Bridge Transaction"
            confirmText="Proceed"
            message={
              <div className="space-y-4">
                <p>You are about to bridge <span className="font-bold text-primary">{sellAmount} {sellAssetSymbol}</span> from <span className="font-bold text-brand">{fromChainConfig?.name}</span> to receive <span className="font-bold text-primary">~{bridgeQuoteData?.minimumAmountOut} {buyAssetSymbol}</span> on <span className="font-bold text-brand">{toChainConfig?.name}</span>.</p>
                <p className="text-muted text-sm">Please note that bridging requires multiple transactions (approvals and the final transfer). Stay on the page until all transactions are confirmed.</p>
              </div>
            }
          />
        )}

        {swapTxHash && fromChainConfig && actionType === 'SWAP' && (
          <EvmTransactionSuccessModal txHash={swapTxHash} explorerUrl={`${fromChainConfig.blockExplorerUrl}/tx/${swapTxHash}`} onDone={handleReset} networkName={fromChainConfig.name} />
        )}

        {bridgeTxHash && fromChainConfig && actionType === 'BRIDGE' && (
          <EvmTransactionSuccessModal txHash={bridgeTxHash} explorerUrl={`${fromChainConfig.blockExplorerUrl}/tx/${bridgeTxHash}`} onDone={handleReset} networkName={fromChainConfig.name} />
        )}

        {/* Slippage Modal Overlay */}
        <div className={`fixed inset-0 z-[100] flex items-end sm:items-center justify-center transition-opacity duration-300 ${isSlippageModalOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
          <div className={`absolute inset-0 bg-black/60 backdrop-blur-md transition-opacity duration-300 ${isSlippageModalOpen ? 'opacity-100' : 'opacity-0'}`} onClick={() => setIsSlippageModalOpen(false)} />
          <div className={`relative w-full max-w-md bg-secondary border border-color shadow-2xl rounded-t-[2.5rem] sm:rounded-3xl p-8 pt-6 transform transition-all duration-300 ease-out ${isSlippageModalOpen ? 'translate-y-0 scale-100' : 'translate-y-full sm:translate-y-10 sm:scale-95'}`}>
            <div className="w-12 h-1.5 bg-tertiary rounded-full mx-auto mb-6 sm:hidden" />
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-xl font-black text-primary uppercase tracking-tight">Slippage Tolerance</h3>
              <button onClick={() => setIsSlippageModalOpen(false)} className="w-10 h-10 rounded-2xl bg-tertiary flex items-center justify-center border border-color"><X className="w-5 h-5 text-muted" /></button>
            </div>
            <div className="space-y-8">
              <div className="flex flex-col items-center">
                <span className="text-[10px] font-black text-muted uppercase tracking-[0.2em] mb-4">Manual Adjustment</span>
                <div className="flex items-center gap-6">
                  <button onClick={() => setSlippageTolerance(prev => Math.max(0, parseFloat((prev - 0.1).toFixed(1))))} className="w-14 h-14 rounded-2xl bg-tertiary border border-color flex items-center justify-center group transition-all active:scale-90"><Minus className="w-6 h-6 text-muted group-hover:text-brand" /></button>
                  <div className="relative group">
                    <input type="number" value={slippageTolerance} onChange={e => { const val = parseFloat(e.target.value); setSlippageTolerance(isNaN(val) ? 0 : val); }} className="w-32 bg-transparent text-center text-5xl font-black text-primary focus:outline-none" />
                    <span className="absolute -right-6 top-1/2 -translate-y-1/2 text-2xl font-black text-muted/30">%</span>
                  </div>
                  <button onClick={() => setSlippageTolerance(prev => parseFloat((prev + 0.1).toFixed(1)))} className="w-14 h-14 rounded-2xl bg-tertiary border border-color flex items-center justify-center group transition-all active:scale-90"><Plus className="w-6 h-6 text-muted group-hover:text-brand" /></button>
                </div>
              </div>
              <div className="grid grid-cols-5 gap-2">
                {SLIPPAGE_PRESETS.map(p => (
                  <button key={p} onClick={() => setSlippageTolerance(p)} className={`py-3 rounded-xl text-xs font-black transition-all border ${slippageTolerance === p ? 'bg-brand border-brand text-white' : 'bg-tertiary border-color text-muted hover:text-primary'}`}>{p}%</button>
                ))}
              </div>
              <button onClick={() => setIsSlippageModalOpen(false)} className="w-full py-4 btn-primary text-white font-black uppercase tracking-widest rounded-2xl shadow-xl shadow-brand/20 active:scale-95">Apply Settings</button>
            </div>
          </div>
        </div>
      </div>
    </PageLayout>
  );
};

export default SwapAssets;