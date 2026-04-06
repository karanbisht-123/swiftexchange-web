import {
  ArrowUpDown,
  ChevronDown,
  Loader2,
  AlertCircle,
  XCircle,
  RefreshCw,
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
import { getSwapEnabledChains, getChainById } from '../../utils/Chainregistry';
import AssetSelectionModal from './AssetSelectionModal';
import { SwapHeader } from './components/SwapHeader';
import { SwapSuccessModal } from './components/SwapSuccessModal';
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
  const swapEnabledChains = getSwapEnabledChains('mainnet');

  const [sellAssetSymbol, setSellAssetSymbol] = useState<string>('');
  const [buyAssetSymbol, setBuyAssetSymbol] = useState<string>('');
  const [sellAmount, setSellAmount] = useState<string>('');
  const [slippageTolerance, setSlippageTolerance] = useState<number>(0.5);
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
      const usdcAsset = assets.find(a => a.symbol === 'USDC');

      if (nativeAsset && usdcAsset) {
        setSellAssetSymbol(nativeAsset.symbol);
        setBuyAssetSymbol(usdcAsset.symbol);
      } else if (assets.length >= 2) {
        setSellAssetSymbol(assets[0].symbol);
        setBuyAssetSymbol(assets[1].symbol);
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
    ? parseFloat(quote.outputAmount).toFixed(Math.min(selectedBuyAsset?.decimals || 6, 6))
    : '0.00';

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
                    <div className="flex justify-between text-sm">
                      <span className="text-secondary">Slippage</span>
                      <input
                        type="number"
                        value={slippageTolerance}
                        onChange={e => setSlippageTolerance(parseFloat(e.target.value) || 0.5)}
                        className="w-12 bg-transparent text-right font-bold focus:outline-none border-b border-brand/20"
                      />
                    </div>

                    <div className="flex justify-between text-sm">
                      <span className="text-secondary">Minimum Received</span>
                      <span className="font-bold">{buyAmount}</span>
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
        <SwapSuccessModal
          txHash={txHash}
          networkConfig={networkConfig}
          onReset={reset}
        />
      )}
    </PageLayout>
  );
};

export default SwapAssets;