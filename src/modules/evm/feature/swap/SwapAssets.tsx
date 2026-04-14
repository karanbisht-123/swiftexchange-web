import {
  ArrowUpDown,
  ChevronDown,
  Loader2,
  AlertCircle,
  XCircle,
  RefreshCw,
  Plus,
  Minus,
  Settings2,
  X
} from 'lucide-react';

import React, { useCallback, useEffect, useState, useRef } from 'react';
import { ethers } from 'ethers';
import { useLocation, useNavigate } from 'react-router-dom';

import PageLayout from '../../../../components/layout/PageLayout';
import type { SwapQuoteRequest } from '../../../../types/evm/swap.types';
import { WalletType } from '../../../walletconnect/constants/Wallet';
import { useWalletConnect } from '../../../walletconnect/hooks/useWalletConnect';
import { useEvmSwap } from '../../hook/useEvmSwap';
import { determineSwapType } from '../../utils/evmSwapUtils';
import { ROUTES } from '../../../../constants/routes';
import { getEvmSwapEnabledChains, getChainById } from '../../utils/Chainregistry';
import AssetSelectionModal from './AssetSelectionModal';
import { SwapHeader } from './components/SwapHeader';
import { EvmTransactionSuccessModal } from '../../components/EvmTransactionSuccessModal';
import { EvmActionGuard } from '../../components/EvmActionGuard';
import { switchOrAddChain } from '../../utils/evmChainUtils';

interface SwapAssetsProps {
  onClose?: () => void;
}

const SwapAssets: React.FC<SwapAssetsProps> = ({ onClose }) => {
  const { connectedWallets, getProvider } = useWalletConnect();
  const location = useLocation();
  const navigate = useNavigate();

  const evmWallet = connectedWallets[WalletType.EVM];
  const isConnected = !!evmWallet;
  const senderAddress = evmWallet?.address || '';
  const currentChainId = evmWallet?.chainId ? Number(evmWallet.chainId) : null;
  const swapEnabledChains = getEvmSwapEnabledChains('mainnet');

  const [sellAssetSymbol, setSellAssetSymbol] = useState<string>('');
  const [buyAssetSymbol, setBuyAssetSymbol] = useState<string>('');
  const [sellAmount, setSellAmount] = useState<string>('');
  const [slippageTolerance, setSlippageTolerance] = useState<number>(0.5);
  const [isSlippageModalOpen, setIsSlippageModalOpen] = useState<boolean>(false);
  const SLIPPAGE_PRESETS = [0.1, 0.5, 1.0, 3.0, 5.0];


  const [showDetails, setShowDetails] = useState<boolean>(true);

  const [isChainSwitching, setIsChainSwitching] = useState<boolean>(false);
  const [preSelectedAsset, setPreSelectedAsset] = useState<{
    symbol: string;
    chainId?: number;
  } | null>(null);

  const [selectedChainId, setSelectedChainId] = useState<number>(1);
  const [assetModalOpen, setAssetModalOpen] = useState<'sell' | 'buy' | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  const {
    quote,
    txHash,
    assets,
    loading,
    error,
    isFetchingAssets,
    quoteLoading,
    fetchTokenList,
    updateTokenBalances,
    fetchQuote,
    performSwap,
    reset,
  } = useEvmSwap({
    chainId: selectedChainId,
    senderAddress,
    getProvider,
  });

  const selectedSellAsset = assets.find(a => a.symbol === sellAssetSymbol);
  const selectedBuyAsset = assets.find(a => a.symbol === buyAssetSymbol);
  const networkConfig = getChainById(selectedChainId);

  useEffect(() => {
    if (currentChainId && swapEnabledChains.some(c => c.chainId === currentChainId)) {
      setSelectedChainId(currentChainId);
    }
  }, [currentChainId]);

  useEffect(() => {
    if (location.state?.selectedAsset) {
      const asset = location.state.selectedAsset;
      setPreSelectedAsset({
        symbol: asset.symbol?.toUpperCase(),
        chainId: asset.chainId,
      });
      if (swapEnabledChains.some(c => c.chainId === asset.chainId)) {
        setSelectedChainId(asset.chainId);
      }
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, location.pathname, navigate, swapEnabledChains]);

  useEffect(() => {
    if (error && errorRef.current) {
      errorRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [error]);

  useEffect(() => {
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, []);


  useEffect(() => {
    if (selectedChainId) {
      setSellAmount('');
      if (!preSelectedAsset) {
        setSellAssetSymbol('');
        setBuyAssetSymbol('');
      }
      reset();
      fetchTokenList();
    }
  }, [selectedChainId, reset, fetchTokenList, preSelectedAsset]);

  useEffect(() => {
    if (isConnected && !isChainSwitching && (selectedSellAsset || selectedBuyAsset)) {
      updateTokenBalances(selectedSellAsset, selectedBuyAsset);
    }
  }, [
    selectedSellAsset?.address,
    selectedBuyAsset?.address,
    isConnected,
    isChainSwitching,
    updateTokenBalances,
    assets.length,
  ]);


  useEffect(() => {
    if (assets.length > 0 && !sellAssetSymbol && !buyAssetSymbol && !isChainSwitching) {
      if (preSelectedAsset) {
        const preSelected = assets.find(a => a.symbol === preSelectedAsset.symbol);
        const nativeAsset = assets.find(a => a.isNative);
        if (preSelected && nativeAsset) {
          setSellAssetSymbol(nativeAsset.symbol);
          setBuyAssetSymbol(preSelected.symbol);
          setPreSelectedAsset(null);
          return;
        }
      }

      const nativeAsset = assets.find(a => a.isNative);
      const usdcAsset = assets.find(a => a.symbol === 'USDC' || a.symbol === 'USDT');

      if (nativeAsset && usdcAsset) {
        setSellAssetSymbol(nativeAsset.symbol);
        setBuyAssetSymbol(usdcAsset.symbol);
      } else if (assets.length >= 2) {
        const first = assets[0];
        const second = assets.find(a => a.symbol !== first.symbol) || assets[1];
        setSellAssetSymbol(first.symbol);
        setBuyAssetSymbol(second.symbol);
      }
    }
  }, [assets, sellAssetSymbol, buyAssetSymbol, isChainSwitching, preSelectedAsset]);

  const fetchSwapQuote = useCallback(async () => {
    if (
      !selectedSellAsset ||
      !selectedBuyAsset ||
      !sellAmount ||
      parseFloat(sellAmount) <= 0 ||
      selectedSellAsset.address.toLowerCase() === selectedBuyAsset.address.toLowerCase() ||
      isChainSwitching
    ) {
      return;
    }

    try {
      const swapType = determineSwapType(selectedSellAsset, selectedBuyAsset);
      const quoteRequest: SwapQuoteRequest = {
        tokenIn: {
          symbol: selectedSellAsset.symbol,
          name: selectedSellAsset.name,
          decimals: selectedSellAsset.decimals,
          address: selectedSellAsset.address,
          balance: selectedSellAsset.balance || '0',
          logoUri: selectedSellAsset.logoURI || null,
        },
        tokenOut: {
          symbol: selectedBuyAsset.symbol,
          name: selectedBuyAsset.name,
          decimals: selectedBuyAsset.decimals,
          address: selectedBuyAsset.address,
          balance: selectedBuyAsset.balance || '0',
          logoUri: selectedBuyAsset.logoURI || null,
        },
        amount: sellAmount,
        swapType,
      };

      await fetchQuote(quoteRequest, selectedSellAsset, selectedBuyAsset);
    } catch (err) {
      // Superseded / cancelled quotes are not errors — swallow them here
      if (
        err instanceof Error &&
        (err.message === 'Quote request cancelled' || err.message === 'Quote request superseded')
      ) {
        return;
      }
      console.error('Quote fetch failed:', err);
    }
  }, [selectedSellAsset, selectedBuyAsset, sellAmount, fetchQuote, isChainSwitching]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      fetchSwapQuote();
    }, 500);
    return () => clearTimeout(timeoutId);
  }, [fetchSwapQuote]);

  const handleMaxAmount = useCallback(() => {
    if (selectedSellAsset && selectedSellAsset.balance !== undefined) {
      try {
        const decimals = selectedSellAsset.decimals || 18;
        const balanceBN = ethers.parseUnits(selectedSellAsset.balance, decimals);
        if (balanceBN === BigInt(0)) {
          setSellAmount('0');
          return;
        }
        let maxAmountBN = balanceBN;
        if (selectedSellAsset.isNative) {
          const bufferBN = ethers.parseUnits('0.006', decimals);
          maxAmountBN = balanceBN > bufferBN ? balanceBN - bufferBN : balanceBN;
        }
        const formatted = ethers.formatUnits(maxAmountBN, decimals);
        setSellAmount(formatted.replace(/\.?0+$/, ''));
      } catch (err) {
        setSellAmount(selectedSellAsset.balance);
      }
    }
  }, [selectedSellAsset]);

  const handleAssetSwap = useCallback(() => {
    const prevSell = sellAssetSymbol;
    setSellAssetSymbol(buyAssetSymbol);
    setBuyAssetSymbol(prevSell);
    setSellAmount('');
    reset();
  }, [buyAssetSymbol, sellAssetSymbol, reset]);

  const handleSwap = useCallback(async () => {
    if (!quote || !selectedSellAsset || !selectedBuyAsset || !sellAmount) return;
    try {
      await performSwap(quote, selectedSellAsset, selectedBuyAsset, sellAmount, slippageTolerance);
    } catch (err) {
      console.error('Swap execution failed:', err);
    }
  }, [quote, selectedSellAsset, selectedBuyAsset, sellAmount, slippageTolerance, performSwap]);

  const handleRefreshBalances = useCallback(async () => {
    if (isConnected && !isChainSwitching && (selectedSellAsset || selectedBuyAsset)) {
      setIsRefreshing(true);
      await updateTokenBalances(selectedSellAsset, selectedBuyAsset);
      setTimeout(() => setIsRefreshing(false), 800);
    }
  }, [isConnected, isChainSwitching, selectedSellAsset, selectedBuyAsset, updateTokenBalances]);
  const handleChainSelect = useCallback(async (newChainId: number) => {
    if (newChainId === selectedChainId) return;

    if (isConnected) {
      setIsChainSwitching(true);
      try {
        const provider = getProvider(WalletType.EVM);
        await switchOrAddChain(provider, newChainId);
        setSelectedChainId(newChainId);
      } catch (err: any) {
        console.error('Failed to switch chain:', err);
      } finally {
        setIsChainSwitching(false);
      }
    } else {
      setSelectedChainId(newChainId);
    }
  }, [isConnected, getProvider, selectedChainId]);

  const isSwapDisabled =
    !sellAmount ||
    parseFloat(sellAmount) <= 0 ||
    parseFloat(sellAmount) > parseFloat(selectedSellAsset?.balance || '0') ||
    loading ||
    !quote ||
    isFetchingAssets ||
    isChainSwitching;

  const buyAmount = quote?.outputAmount
    ? (() => {
      const amount = quote.outputAmount;
      if (parseFloat(amount) === 0) return '0.00';
      const parts = amount.split('.');
      if (parts.length > 1 && parts[1].length > 8) {
        return parseFloat(amount).toFixed(8).replace(/\.?0+$/, '');
      }
      return amount.replace(/\.?0+$/, '');
    })()
    : '0.00';

  const minimumReceived = (() => {
    if (!quote?.outputAmount || !selectedBuyAsset) return '0.00';
    try {
      const decimals = selectedBuyAsset.decimals || 18;
      const amountBN = ethers.parseUnits(quote.outputAmount, decimals);
      const slippageBips = BigInt(Math.floor(slippageTolerance * 100));
      const minReceivedBN = (amountBN * (10000n - slippageBips)) / 10000n;
      const formatted = ethers.formatUnits(minReceivedBN, decimals);
      const parts = formatted.split('.');
      if (parts.length > 1 && parts[1].length > 8) {
        return parseFloat(formatted).toFixed(8).replace(/\.?0+$/, '');
      }
      return formatted.replace(/\.?0+$/, '');
    } catch (err) {
      return buyAmount;
    }
  })();


  const isInsufficientBalance =
    !!sellAmount && parseFloat(sellAmount) > parseFloat(selectedSellAsset?.balance || '0');
  const isErrorState = error || isInsufficientBalance;

  return (
    <PageLayout
      title="Token Swap"
      subtitle="Refined EVM Exchange"
      onBack={onClose}
      showBackButton={!!onClose}
      maxWidth="lg"
    >
      <div className="mx-auto space-y-6">

        <SwapHeader
          chains={swapEnabledChains}
          selectedChainId={selectedChainId}
          onChainSelect={handleChainSelect}
          isChainSwitching={isChainSwitching}
          currentNetworkChainId={currentChainId}
        />

        <div className="card relative p-6">
          {(isChainSwitching || isFetchingAssets) && (
            <div className="absolute inset-0 bg-secondary/80 backdrop-blur-sm rounded-2xl flex items-center justify-center z-30">
              <div className="text-center">
                <Loader2 className="w-10 h-10 animate-spin text-brand mx-auto mb-4" />
                <p className="text-sm font-bold text-primary animate-pulse">
                  {isChainSwitching ? 'SYNCING NETWORK...' : 'LOADING ASSETS...'}
                </p>
              </div>
            </div>
          )}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-bold uppercase tracking-wider text-muted">You Pay</label>
              <button
                onClick={handleMaxAmount}
                className="text-xs font-bold text-brand hover:scale-105 transition-transform px-3 py-1.5 rounded-md bg-brand/5 border border-brand/10"
              >
                MAX
              </button>
            </div>

            <div className="bg-tertiary rounded-2xl p-3 py-6 border border-color flex items-center justify-between group focus-within:border-brand/40 transition-all">
              <div className="flex flex-col gap-1">
                <button
                  onClick={() => setAssetModalOpen('sell')}
                  className="flex items-center gap-3  bg-secondary hover:bg-secondary/80 rounded-xl px-4 py-2.5 transition-all border border-color shadow-sm w-full min-w-[160px] max-w-[180px] "
                >
                  <div className="relative  flex-shrink-0">
                    {selectedSellAsset?.logoURI ? (
                      <img src={selectedSellAsset.logoURI} alt="" className="w-8 h-8 rounded-full" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-color flex items-center justify-center text-xs">?</div>
                    )}
                    {networkConfig && (
                      <div className="absolute -bottom-1.5 -right-1.5 w-4.5 h-4.5 rounded-full bg-secondary border border-color flex items-center justify-center overflow-hidden">
                        <img
                          src={networkConfig.nativeCurrency.logoURI}
                          alt=""
                          className="w-3.5 h-3.5"
                        />
                      </div>
                    )}
                  </div>
                  <span className="font-bold text-lg truncate ml-1">{sellAssetSymbol || 'Select'}</span>
                  <ChevronDown className="w-4 h-4 text-muted flex-shrink-0" />
                </button>

                <div className="flex items-center gap-1.5 ml-2">
                  <span className={`text-[11px] font-medium transition-colors ${isInsufficientBalance ? 'text-red-500' : 'text-muted'}`}>
                    Balance: {selectedSellAsset?.balance ? parseFloat(selectedSellAsset.balance).toFixed(6) : '0.00'}
                  </span>
                  <button
                    onClick={handleRefreshBalances}
                    disabled={isRefreshing}
                    className="p-1 hover:bg-white/5 rounded-full transition-colors group disabled:opacity-50 cursor-pointer"
                    title="Refresh Balance"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 text-muted group-hover:text-brand transition-all ${isRefreshing ? 'animate-spin text-brand' : ''}`} />
                  </button>
                </div>
              </div>

              <input
                ref={inputRef}
                autoFocus
                type="text"
                inputMode="decimal"
                className="bg-transparent border-none text-right text-3xl font-bold focus:ring-0 focus:outline-none w-full ml-4 p-0 placeholder:text-muted"
                placeholder="0.00"
                value={sellAmount}
                onChange={(e) => setSellAmount(e.target.value.replace(/[^0-9.]/g, ''))}
              />
            </div>
          </div>

          {/* Swap Button */}
          <div className="flex justify-center my-2 relative z-10">
            <button
              onClick={handleAssetSwap}
              className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center shadow-md transition-all duration-500 group hover:rotate-180"
            >
              <ArrowUpDown className="w-6 h-6 text-brand group-active:scale-110 transition-transform" />
            </button>
          </div>

          {/* You Receive Section */}
          <div className="space-y-3">
            <label className="text-sm font-bold uppercase tracking-wider text-muted">You Receive</label>

            <div className="bg-tertiary rounded-2xl p-3 py-6 border border-color flex items-center justify-between group focus-within:border-brand/40 transition-all">
              <div className="flex flex-col gap-1">
                <button
                  onClick={() => setAssetModalOpen('buy')}
                  className="flex items-center gap-3 bg-secondary hover:bg-secondary/80 rounded-xl px-4 py-2.5 transition-all border border-color shadow-sm w-full max-w-[180px] sm:max-w-none"
                >
                  <div className="relative flex-shrink-0">
                    {selectedBuyAsset?.logoURI ? (
                      <img src={selectedBuyAsset.logoURI} alt="" className="w-8 h-8 rounded-full" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-color flex items-center justify-center text-xs">?</div>
                    )}
                    {networkConfig && (
                      <div className="absolute -bottom-1.5 -right-1.5 w-4.5 h-4.5 rounded-full bg-secondary border border-color flex items-center justify-center overflow-hidden">
                        <img
                          src={networkConfig.nativeCurrency.logoURI}
                          alt=""
                          className="w-3.5 h-3.5"
                        />
                      </div>
                    )}
                  </div>
                  <span className="font-bold text-lg truncate ml-1">{buyAssetSymbol || 'Select'}</span>
                  <ChevronDown className="w-4 h-4 text-muted flex-shrink-0" />
                </button>

                <div className="flex items-center gap-1.5 ml-2">
                  <span className="text-[11px] text-muted font-medium">
                    Balance: {selectedBuyAsset?.balance ? parseFloat(selectedBuyAsset.balance).toFixed(6) : '0.00'}
                  </span>
                  <button
                    onClick={handleRefreshBalances}
                    disabled={isRefreshing}
                    className="p-1 hover:bg-white/5 rounded-full transition-colors group disabled:opacity-50 cursor-pointer"
                    title="Refresh Balance"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 text-muted group-hover:text-brand transition-all ${isRefreshing ? 'animate-spin text-brand' : ''}`} />
                  </button>
                </div>
              </div>

              <div className="text-right flex flex-col items-end ml-4 min-w-[120px] sm:min-w-[160px]">
                <div className="h-[36px] flex items-center justify-end">
                  {quoteLoading ? (
                    <div className="w-[80px] h-[28px] bg-white/10 rounded animate-pulse" />
                  ) : (
                    <span className="text-3xl font-bold text-primary tabular-nums">
                      {buyAmount}
                    </span>
                  )}
                </div>

                {quote && !quoteLoading && (
                  <span className="text-[10px] text-muted font-medium">
                    1 {quote.inputToken} = {parseFloat(quote.pricePerToken).toFixed(6)} {quote.outputToken}
                  </span>
                )}

                {quote && (
                  <span className="text-[10px] text-success font-bold mt-1">
                    Best Route Found
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Quote & Details */}
          {quote && !quoteLoading && (
            <div className="mt-8 space-y-4 animate-fade-in">
              <div className="bg-tertiary p-4 rounded-lg">
                <button
                  onClick={() => setShowDetails(!showDetails)}
                  className="w-full flex items-center justify-between text-xs font-bold text-muted uppercase tracking-tighter"
                >
                  <span>Transaction Details</span>
                  <ChevronDown className={`transition-transform ${showDetails ? 'rotate-180' : ''}`} />
                </button>

                {showDetails && (
                  <div className="mt-4 space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-secondary">Rate</span>
                      <span className="font-bold">1 {quote.inputToken} = {parseFloat(quote.pricePerToken).toFixed(6)} {quote.outputToken}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-secondary">Fee Tier</span>
                      <span className="font-bold">{(quote.fee / 10000).toFixed(2)}%</span>
                    </div>
                    {quote.networkFee !== undefined && quote.networkFee > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-secondary">Network Fee</span>
                        <span className="font-bold">~{quote.networkFee?.toFixed(6)} {networkConfig?.nativeCurrency.symbol}</span>
                      </div>
                    )}
                    <div className="pt-2 space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-secondary font-medium">Slippage Tolerance</span>
                        <button
                          onClick={() => setIsSlippageModalOpen(true)}
                          className="flex items-center gap-2 bg-brand/5 hover:bg-brand/10 border border-brand/20 rounded-lg px-3 py-1.5 transition-all group shadow-sm active:scale-95"
                        >
                          <Settings2 className="w-3.5 h-3.5 text-brand" />
                          <span className={`font-bold ${slippageTolerance > 5 ? 'text-orange-500' : 'text-primary'}`}>
                            {slippageTolerance}%
                          </span>
                        </button>
                      </div>

                      {slippageTolerance > 5 && (
                        <div className="bg-orange-500/10 border border-orange-500/20 p-3 rounded-xl flex items-start gap-3 animate-in fade-in slide-in-from-top-1">
                          <AlertCircle className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />
                          <p className="text-[10px] text-orange-200 font-medium leading-relaxed">
                            High slippage tolerance may result in a highly unfavorable price.
                          </p>
                        </div>
                      )}

                      <div className="flex justify-between text-sm px-1">
                        <span className="text-secondary font-medium">Minimum Received</span>
                        <span className="font-bold text-primary">{minimumReceived} {selectedBuyAsset?.symbol}</span>
                      </div>

                    </div>



                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <EvmActionGuard
          title="Connect EVM Wallet"
          message="You need an active EVM wallet connection to perform swaps."
          disabled={loading}
        >
          <button
            onClick={handleSwap}
            disabled={isSwapDisabled}
            className={`w-full py-5 btn font-bold text-xl transition-all shadow-xl active:scale-95 ${isErrorState
              ? 'bg-red-600 text-white hover:bg-red-700'
              : isSwapDisabled
                ? 'bg-primary text-muted cursor-not-allowed'
                : 'btn-primary hover:shadow-brand/20'
              }`}

          >
            {loading ? (
              <span className="flex items-center justify-center gap-3">
                <Loader2 className="w-6 h-6 animate-spin" />
                PROCESSING...
              </span>
            ) : isFetchingAssets ? (
              'SYNCING...'
            ) : !sellAmount || parseFloat(sellAmount) <= 0 ? (
              'ENTER AMOUNT'
            ) : isInsufficientBalance ? (
              'INSUFFICIENT BALANCE'
            ) : error ? (
              'SWAP FAILED'
            ) : (
              'SWAP NOW'
            )}
          </button>
        </EvmActionGuard>

        {loading && (
          <button onClick={reset} className="w-full text-center text-xs text-muted hover:text-red-500 font-bold uppercase tracking-widest pt-2">
            Cancel Swap Request
          </button>
        )}
        {error && (
          <div ref={errorRef} className="card border-2 border-red-500/20 bg-red-500/5 p-6 animate-slide-up relative overflow-hidden">
            <div className="absolute top-0 right-0 p-2">
              <button onClick={reset} className="text-muted hover:text-primary transition-colors">
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <div className="flex items-start gap-4">
              <div className="bg-red-500/10 p-3 rounded-2xl">
                <AlertCircle className="w-6 h-6 text-red-500" />
              </div>
              <div className="space-y-2 pr-6">
                <h4 className="text-lg font-bold text-red-900">Transaction Failed</h4>
                <p className="text-sm text-red-800 line-clamp-3">{error}</p>
                <div className="flex gap-3 pt-2">
                  {/* <button onClick={reset} className="btn-secondary py-2 text-xs">TRY AGAIN</button> */}
                  {error.toLowerCase().includes('insufficient') && (
                    <button onClick={() => navigate(ROUTES.TRADING_EVM_FIAT)} className="btn-primary py-2 text-xs bg-red-600 hover:bg-red-700">TOP UP</button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <AssetSelectionModal
        isOpen={assetModalOpen !== null}
        onClose={() => setAssetModalOpen(null)}
        title={assetModalOpen === 'sell' ? 'Pay With' : 'Receive'}
        assets={assets}
        onSelect={asset => {
          if (assetModalOpen === 'sell') setSellAssetSymbol(asset.symbol);
          else setBuyAssetSymbol(asset.symbol);
          setAssetModalOpen(null);
        }}
        selectedAssetSymbol={assetModalOpen === 'sell' ? sellAssetSymbol : buyAssetSymbol}
        isLoading={isFetchingAssets}
      />

      {txHash && networkConfig && (
        <EvmTransactionSuccessModal
          txHash={txHash}
          explorerUrl={`${networkConfig.blockExplorerUrl}/tx/${txHash}`}
          onDone={reset}
          networkName={networkConfig.name}
        />
      )}

      {/* Slippage Modal */}
      <div
        className={`fixed inset-0 z-[100] flex items-end sm:items-center justify-center transition-opacity duration-300 ${isSlippageModalOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
      >
        <div
          className={`absolute inset-0 bg-black/60 backdrop-blur-md transition-opacity duration-300 ${isSlippageModalOpen ? 'opacity-100' : 'opacity-0'}`}
          onClick={() => setIsSlippageModalOpen(false)}
        />

        <div
          className={`
            relative w-full max-w-md bg-secondary border border-color shadow-2xl
            rounded-t-[2.5rem] sm:rounded-3xl p-8 pt-6
            transform transition-all duration-300 ease-out
            ${isSlippageModalOpen ? 'translate-y-0 scale-100' : 'translate-y-full sm:translate-y-10 sm:scale-95'}
          `}
        >
          {/* Handle for mobile */}
          <div className="w-12 h-1.5 bg-tertiary rounded-full mx-auto mb-6 sm:hidden" />

          <div className="flex items-center justify-between mb-8">
            <h3 className="text-xl font-black text-primary uppercase tracking-tight">Slippage Settings</h3>
            <button
              onClick={() => setIsSlippageModalOpen(false)}
              className="w-10 h-10 rounded-2xl bg-tertiary flex items-center justify-center hover:bg-tertiary/80 transition-all border border-color"
            >
              <X className="w-5 h-5 text-muted" />
            </button>
          </div>

          <div className="space-y-8">
            <div className="flex flex-col items-center">
              <span className="text-[10px] font-black text-muted uppercase tracking-[0.2em] mb-4">Manual Adjustment</span>
              <div className="flex items-center gap-6">
                <button
                  onClick={() => setSlippageTolerance(prev => Math.max(0, parseFloat((prev - 0.1).toFixed(1))))}
                  className="w-14 h-14 rounded-2xl bg-tertiary border border-color flex items-center justify-center hover:bg-brand/10 hover:border-brand/40 group transition-all active:scale-90"
                >
                  <Minus className="w-6 h-6 text-muted group-hover:text-brand" />
                </button>

                <div className="relative group">
                  <input
                    type="number"
                    value={slippageTolerance}
                    onChange={e => {
                      const val = parseFloat(e.target.value);
                      setSlippageTolerance(isNaN(val) ? 0 : val);
                    }}
                    className="w-32 bg-transparent text-center text-5xl font-black text-primary focus:outline-none tabular-nums"
                  />
                  <span className="absolute -right-6 top-1/2 -translate-y-1/2 text-2xl font-black text-muted/30">%</span>
                </div>

                <button
                  onClick={() => setSlippageTolerance(prev => parseFloat((prev + 0.1).toFixed(1)))}
                  className="w-14 h-14 rounded-2xl bg-tertiary border border-color flex items-center justify-center hover:bg-brand/10 hover:border-brand/40 group transition-all active:scale-90"
                >
                  <Plus className="w-6 h-6 text-muted group-hover:text-brand" />
                </button>
              </div>
            </div>

            <div>
              <span className="text-[10px] font-black text-muted uppercase tracking-[0.2em] mb-4 block text-center">Presets</span>
              <div className="grid grid-cols-5 gap-2">
                {SLIPPAGE_PRESETS.map(preset => (
                  <button
                    key={preset}
                    onClick={() => setSlippageTolerance(preset)}
                    className={`
                      py-3 rounded-xl text-xs font-black transition-all border
                      ${slippageTolerance === preset
                        ? 'bg-brand border-brand text-white shadow-lg shadow-brand/20 scale-105'
                        : 'bg-tertiary border-color text-muted hover:border-brand/40 hover:text-primary'}
                    `}
                  >
                    {preset}%
                  </button>
                ))}
              </div>
            </div>

            {slippageTolerance > 5 && (
              <div className="bg-orange-500/10 border border-orange-500/20 p-4 rounded-2xl flex items-start gap-4 animate-slide-up">
                <AlertCircle className="w-5 h-5 text-orange-500 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-xs font-bold text-orange-200">High Price Impact Warning</p>
                  <p className="text-[10px] text-orange-200/70 font-medium leading-relaxed">
                    Setting slippage above 5% is risky and may result in partial loss of funds due to unfavorable execution price.
                  </p>
                </div>
              </div>
            )}

            <button
              onClick={() => setIsSlippageModalOpen(false)}
              className="w-full py-4 btn-primary text-white font-black uppercase tracking-widest rounded-2xl hover:bg-brand/90 transition-all shadow-xl shadow-brand/20 active:scale-95 mt-4"
            >
              Apply Settings
            </button>
          </div>
        </div>
      </div>
    </PageLayout>
  );
};


export default SwapAssets;