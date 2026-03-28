import {
  AlertCircle,
  ArrowUpDown,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  Info,
  Loader2,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import PageLayout from '../../../../components/layout/PageLayout';
import type { SwapQuoteRequest } from '../../../../types/evm/swap.types';
import { getEVMChains } from '../../../walletconnect/config/chains';
import { WalletType } from '../../../walletconnect/constants/Wallet';
import { useWalletConnect } from '../../../walletconnect/hooks/useWalletConnect';
import { useWalletStore } from '../../../walletconnect/store/walletConnectStore';
import { useEvmSwap } from '../../hook/useEvmSwap';
import { determineSwapType } from '../../utils/evmSwapUtils';
import AssetSelectionModal from './AssetSelectionModal';

interface SwapAssetsProps {
  onClose?: () => void;
}

const SwapAssets: React.FC<SwapAssetsProps> = ({ onClose }) => {
  const { connectedWallets, getProvider, openModal } = useWalletConnect();
  const currentNetwork = useWalletStore(state => state.network);
  const location = useLocation();
  const navigate = useNavigate();

  const evmWallet = connectedWallets[WalletType.EVM];
  const isConnected = !!evmWallet;
  const senderAddress = evmWallet?.address || '';
  const currentChainId = evmWallet?.chainId ? Number(evmWallet.chainId) : null;

  const evmChains = getEVMChains(currentNetwork);

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

  const openAssetModal = (type: 'sell' | 'buy') => setAssetModalOpen(type);
  const closeAssetModal = () => setAssetModalOpen(null);

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

  const networkConfig = evmChains.find(chain => chain.chainId === selectedChainId) || null;

  useEffect(() => {
    if (currentChainId && (currentChainId === 1 || currentChainId === 56)) {
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
      if (asset.chainId === 1 || asset.chainId === 56) {
        setSelectedChainId(asset.chainId);
      }
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, location.pathname, navigate]);

  useEffect(() => {
    if (selectedChainId) {
      setIsChainSwitching(true);
      setSellAmount('');
      if (!preSelectedAsset) {
        setSellAssetSymbol('');
        setBuyAssetSymbol('');
      }
      reset();
      fetchTokenList();

      setTimeout(() => setIsChainSwitching(false), 500);
    }
  }, [selectedChainId, reset, fetchTokenList, preSelectedAsset]);

  useEffect(() => {
    if (isConnected && senderAddress && !isChainSwitching) {
      if (selectedSellAsset || selectedBuyAsset) {
        updateTokenBalances(selectedSellAsset, selectedBuyAsset);
      }
    }
  }, [
    selectedSellAsset?.address,
    selectedBuyAsset?.address,
    isConnected,
    senderAddress,
    isChainSwitching,
    updateTokenBalances,
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
      sellAssetSymbol === buyAssetSymbol ||
      !isConnected ||
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
      console.log('qoute Fetching request Error :', err);
    }
  }, [
    selectedSellAsset,
    selectedBuyAsset,
    sellAmount,
    sellAssetSymbol,
    buyAssetSymbol,
    isConnected,
    fetchQuote,
    isChainSwitching,
  ]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      fetchSwapQuote();
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [fetchSwapQuote]);

  const handleMaxAmount = useCallback(() => {
    if (selectedSellAsset) {
      const balance = parseFloat(selectedSellAsset.balance || '0');
      const maxAmount = selectedSellAsset.isNative ? Math.max(0, balance - 0.01) : balance;

      setSellAmount(maxAmount.toString());
    }
  }, [selectedSellAsset]);

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value === '' || /^[0-9]*[.,]?[0-9]*$/.test(value)) {
      setSellAmount(value);
    }
  };

  const handleAssetSwap = useCallback(() => {
    const newSell = buyAssetSymbol;
    const newBuy = sellAssetSymbol;

    setSellAssetSymbol(newSell);
    setBuyAssetSymbol(newBuy);
    setSellAmount('');
    reset();
  }, [buyAssetSymbol, sellAssetSymbol, reset]);

  const handleChainSelect = useCallback(
    async (newChainId: number) => {
      if (newChainId === selectedChainId) return;

      console.log('[SwapAssets] Requesting chain switch to:', newChainId);
      setIsChainSwitching(true);

      if (isConnected && getProvider(WalletType.EVM)) {
        try {
          const provider = getProvider(WalletType.EVM);

          await provider.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: `0x${newChainId.toString(16)}` }],
          });

          console.log('[SwapAssets] Chain switch approved by wallet');
          setSelectedChainId(newChainId);
        } catch (error: any) {
          console.log('[SwapAssets] Chain switch error:', error.code, error.message);

          if (error.code === 4902) {
            const networkConfig = evmChains.find(c => c.chainId === newChainId);
            if (networkConfig) {
              try {
                const provider = getProvider(WalletType.EVM);
                await provider.request({
                  method: 'wallet_addEthereumChain',
                  params: [
                    {
                      chainId: `0x${newChainId.toString(16)}`,
                      chainName: networkConfig.name,
                      nativeCurrency: networkConfig.nativeCurrency,
                      rpcUrls: [networkConfig.rpcUrl, ...(networkConfig.fallbackRpcUrls || [])],
                      blockExplorerUrls: [networkConfig.blockExplorerUrl],
                    },
                  ],
                });
                setSelectedChainId(newChainId);
              } catch (addError: any) {
                console.log('[SwapAssets] User rejected adding chain:', addError.message);
              }
            }
          } else if (error.code === 4001) {
            console.log('[SwapAssets] User rejected chain switch');
          } else {
            console.error('[SwapAssets] Chain switch failed:', error);
          }
        }
      } else {
        setSelectedChainId(newChainId);
      }
      setIsChainSwitching(false);
    },
    [isConnected, getProvider, selectedChainId, evmChains]
  );

  const handleSwap = useCallback(async () => {
    if (!isConnected) {
      openModal();
      return;
    }

    if (!quote || !selectedSellAsset || !selectedBuyAsset || !sellAmount) {
      return;
    }

    try {
      await performSwap(quote, selectedSellAsset, selectedBuyAsset, sellAmount, slippageTolerance);
    } catch (err) {
      console.log('swap Exustion failer SwapAsset', err);
    }
  }, [
    quote,
    selectedSellAsset,
    selectedBuyAsset,
    sellAmount,
    slippageTolerance,
    performSwap,
    isConnected,
    openModal,
  ]);

  const isSwapDisabled =
    !isConnected ||
    !senderAddress ||
    sellAssetSymbol === buyAssetSymbol ||
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

  const formatBalance = (balance?: string, decimals: number = 18) => {
    if (balance === undefined) return '...';
    return parseFloat(balance).toFixed(Math.min(decimals, 6));
  };

  return (
    <PageLayout
      title="Token Swap"
      subtitle="Exchange tokens securely on EVM networks"
      onBack={onClose}
      showBackButton={!!onClose}
      maxWidth="lg"
    >
      <div className=" mx-auto space-y-4">
        {txHash && networkConfig && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-end sm:items-center justify-center z-50 p-0 sm:p-4 animate-fade-in">
            <div className="card max-w-md w-full animate-slide-up rounded-t-3xl sm:rounded-2xl border-t-4 border-green-500 shadow-2xl m-0 sm:m-4">
              <div className="flex items-center justify-center pt-8 pb-4">
                <div className="relative">
                  <div className="w-20 h-20 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center shadow-lg">
                    <CheckCircle2 className="w-12 h-12 text-white" strokeWidth={2.5} />
                  </div>
                  <div className="absolute -inset-2 bg-green-400/20 rounded-full blur-xl animate-pulse"></div>
                </div>
              </div>

              <div className="px-6 pb-6">
                <h3 className="text-2xl font-bold text-center mb-2 text-primary">
                  Swap Successful!
                </h3>
                <p className="text-secondary text-center mb-1 text-sm">
                  Your transaction has been confirmed
                </p>
                <p className="text-center text-xs font-medium text-green-600 mb-6">
                  on {networkConfig.name}
                </p>

                <div className="bg-tertiary rounded-lg p-3 mb-6 border border-color">
                  <p className="text-xs text-muted mb-1 text-center">Transaction Hash</p>
                  <p className="font-mono text-xs text-center text-primary break-all">
                    {txHash.slice(0, 10)}...{txHash.slice(-8)}
                  </p>
                </div>

                <div className="space-y-3">
                  <a
                    href={`${networkConfig.blockExplorerUrl}/tx/${txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-primary w-full flex items-center justify-center gap-2 text-base py-3"
                  >
                    View on Explorer
                    <ExternalLink className="w-4 h-4" />
                  </a>
                  <button
                    onClick={reset}
                    className="btn-secondary w-full text-base py-3 font-semibold"
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {!isConnected && (
          <div className="card text-center py-12">
            <div className="flex justify-center mb-6">
              <div className="w-20 h-20 rounded-full bg-tertiary flex items-center justify-center">
                <Wallet className="w-10 h-10 text-brand" />
              </div>
            </div>
            <h3 className="heading-3 mb-3">Connect Your Wallet</h3>
            <p className="text-secondary mb-6 max-w-md mx-auto">
              To start swapping tokens, please connect your EVM wallet first.
            </p>
            <button onClick={openModal} className="btn-primary btn-lg">
              Connect Wallet
            </button>
          </div>
        )}
        {isConnected && (
          <div className="card py-4 relative">
            {isChainSwitching && (
              <div className="absolute inset-0 bg-secondary/80 backdrop-blur-sm z-20 flex items-center justify-center rounded-lg">
                <div className="flex items-center gap-2 text-primary font-medium">
                  <Loader2 className="w-5 h-5 animate-spin text-brand" />
                  Switching Chain...
                </div>
              </div>
            )}

            <div className="flex flex-col items-start gap-3">
              <span className="text-xs font-semibold text-secondary px-1">Select Chain:</span>

              <div className="flex flex-wrap items-center justify-start gap-3 w-full">
                {evmChains
                  .filter(chain => chain.chainId === 1 || chain.chainId === 56)
                  .map(chain => {
                    const isSelected = selectedChainId === chain.chainId;
                    return (
                      <button
                        key={chain.chainId}
                        onClick={() => handleChainSelect(chain.chainId)}
                        disabled={isChainSwitching}
                        title={`Switch to ${chain.name}`}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all duration-200 border ${isSelected
                          ? 'btn-primary border-transparent shadow-md'
                          : 'btn-secondary hover:bg-tertiary border-color'
                          }`}
                      >
                        <img
                          src={chain.logoUrl}
                          alt={chain.name}
                          className="w-5 h-5 rounded-full bg-white"
                          onError={e => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                        <span className="font-semibold">{chain.nativeCurrency.symbol}</span>
                      </button>
                    );
                  })}
              </div>
            </div>

            {currentChainId && currentChainId !== selectedChainId && (
              <div className="mt-3 p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-start">
                <p className="text-xs text-yellow-600">
                  Wallet on different chain. Will switch when you swap.
                </p>
              </div>
            )}
          </div>
        )}

        {isConnected && (
          <div className="card relative">
            {(isChainSwitching || isFetchingAssets) && (
              <div className="absolute inset-0 bg-secondary/80 backdrop-blur-sm rounded-lg flex items-center justify-center z-10">
                <div className="text-center">
                  <Loader2 className="w-8 h-8 animate-spin text-brand mx-auto mb-2" />
                  <p className="text-sm font-medium text-primary">
                    {isChainSwitching ? 'Switching network...' : 'Loading assets...'}
                  </p>
                </div>
              </div>
            )}

            <div className="mb-1">
              <div className="flex items-center justify-between mb-3">
                <label className="block text-sm font-semibold text-primary">You Pay</label>
                <button
                  onClick={handleMaxAmount}
                  title="Use maximum available balance"
                  className="text-xs font-medium text-brand hover:text-brand-hover transition-colors px-2 py-1 rounded bg-brand/5 hover:bg-brand/10"
                  disabled={!selectedSellAsset || isFetchingAssets || isChainSwitching}
                >
                  MAX
                </button>
              </div>

              <div className="bg-tertiary rounded-xl p-4 border border-color">
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="relative" title={`Paying with ${sellAssetSymbol || 'Token'}`}>
                      {selectedSellAsset?.logoURI ? (
                        <img
                          src={selectedSellAsset.logoURI}
                          alt={selectedSellAsset.symbol}
                          className="w-10 h-10 rounded-full shrink-0 bg-white cursor-help"
                          onError={e => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-500 cursor-help">
                          ?
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => openAssetModal('sell')}
                      disabled={isFetchingAssets || isChainSwitching}
                      className="flex items-center gap-2 bg-secondary/80 hover:bg-secondary border border-color hover:border-brand/50 rounded-full px-3 py-2 transition-all group min-w-[110px] justify-between"
                      title="Select token to pay"
                    >
                      {sellAssetSymbol ? (
                        <span className="font-bold text-lg text-primary group-hover:text-brand transition-colors">
                          {sellAssetSymbol}
                        </span>
                      ) : (
                        <span className="font-bold text-lg text-muted group-hover:text-primary transition-colors">
                          Select
                        </span>
                      )}
                      <ChevronDown className="w-4 h-4 text-muted group-hover:text-primary transition-colors" />
                    </button>
                  </div>

                  <input
                    type="text"
                    inputMode="decimal"
                    pattern="^[0-9]*[.,]?[0-9]*$"
                    className={`input flex-1 text-right text-2xl font-bold bg-transparent border-none p-0 focus:ring-0 min-w-0 ${parseFloat(sellAmount) > parseFloat(selectedSellAsset?.balance || '0')
                      ? 'text-red-500'
                      : ''
                      }`}
                    placeholder="0.00"
                    value={sellAmount}
                    onChange={handleAmountChange}
                    disabled={isFetchingAssets || isChainSwitching}
                  />
                </div>

                <div className="flex justify-between items-center text-xs">
                  <span className="text-muted">
                    Balance:{' '}
                    {isFetchingAssets || isChainSwitching ? (
                      <Loader2 className="w-3 h-3 animate-spin inline" />
                    ) : selectedSellAsset ? (
                      <span
                        className={
                          selectedSellAsset.balance === undefined
                            ? 'text-muted animate-pulse'
                            : 'text-primary'
                        }
                      >
                        {formatBalance(selectedSellAsset.balance, selectedSellAsset.decimals)}
                      </span>
                    ) : (
                      '0'
                    )}
                  </span>
                  {parseFloat(sellAmount) > parseFloat(selectedSellAsset?.balance || '0') && (
                    <span className="text-red-500 font-semibold animate-pulse">
                      Insufficient Balance
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="relative h-4 z-10 flex justify-center items-center my-3">
              <div className="absolute top-5 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-primary border border-primary/10 rounded-lg">
                <button
                  onClick={handleAssetSwap}
                  title="Switch inputs"
                  className="w-10 h-10 rounded-lg bg-tertiary hover:bg-brand/10 text-muted hover:text-brand transition-all flex items-center justify-center shadow-sm hover:shadow-md hover:scale-110 active:scale-95 border border-color hover:border-brand/30"
                  disabled={
                    isFetchingAssets || !selectedSellAsset || !selectedBuyAsset || isChainSwitching
                  }
                >
                  <ArrowUpDown className="w-5 h-5" strokeWidth={2.5} />
                </button>
              </div>
            </div>

            <div className="mt-1">
              <label className="block text-sm font-semibold text-primary mb-3">You Receive</label>

              <div className="bg-tertiary rounded-xl p-4 border border-color">
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="relative" title={`Receiving ${buyAssetSymbol || 'Token'}`}>
                      {selectedBuyAsset?.logoURI ? (
                        <img
                          src={selectedBuyAsset.logoURI}
                          alt={selectedBuyAsset.symbol}
                          className="w-10 h-10 rounded-full shrink-0 bg-white cursor-help"
                          onError={e => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-500 cursor-help">
                          ?
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => openAssetModal('buy')}
                      disabled={isFetchingAssets || isChainSwitching}
                      className="flex items-center gap-2 bg-secondary/80 hover:bg-secondary border border-color hover:border-brand/50 rounded-full px-3 py-2 transition-all group min-w-[110px] justify-between"
                      title="Select token to receive"
                    >
                      {buyAssetSymbol ? (
                        <span className="font-bold text-lg text-primary group-hover:text-brand transition-colors">
                          {buyAssetSymbol}
                        </span>
                      ) : (
                        <span className="font-bold text-lg text-muted group-hover:text-primary transition-colors">
                          Select
                        </span>
                      )}
                      <ChevronDown className="w-4 h-4 text-muted group-hover:text-primary transition-colors" />
                    </button>
                  </div>

                  <div className="flex-1 text-right text-2xl font-bold min-w-0 overflow-hidden">
                    {quoteLoading ? (
                      <Loader2 className="w-5 h-5 animate-spin ml-auto text-muted" />
                    ) : (
                      <span className="text-primary block truncate">{buyAmount}</span>
                    )}
                  </div>
                </div>

                <div className="flex justify-between items-center text-xs">
                  <span className="text-muted">
                    Balance:{' '}
                    {isFetchingAssets || isChainSwitching ? (
                      <Loader2 className="w-3 h-3 animate-spin inline" />
                    ) : selectedBuyAsset ? (
                      <span
                        className={
                          selectedBuyAsset.balance === undefined
                            ? 'text-muted animate-pulse'
                            : 'text-primary'
                        }
                      >
                        {formatBalance(selectedBuyAsset.balance, selectedBuyAsset.decimals)}
                      </span>
                    ) : (
                      '0'
                    )}
                  </span>
                </div>
              </div>
            </div>

            {quote && !quoteLoading && !isChainSwitching && (
              <div className="mt-4 flex flex-col items-center">
                <div
                  className="inline-flex items-center justify-center gap-2 px-3 py-1 bg-info-bg/50 rounded-full border border-info-bg"
                  title="Current exchange rate"
                >
                  <TrendingUp className="w-3 h-3 text-info" />
                  <span className="text-xs font-medium text-info-700">
                    1 {quote.inputToken} ≈ {parseFloat(quote.pricePerToken).toFixed(6)}{' '}
                    {quote.outputToken}
                  </span>
                </div>
              </div>
            )}

            {quoteLoading && sellAmount && selectedSellAsset && selectedBuyAsset && (
              <div className="mt-4 flex justify-center">
                <div className="inline-flex items-center justify-center gap-2 px-3 py-1 bg-tertiary rounded-full">
                  <Loader2 className="w-3 h-3 animate-spin text-muted" />
                  <span className="text-xs text-muted">Fetching best price...</span>
                </div>
              </div>
            )}

            {/* Swap Details  */}
            {quote && !quoteLoading && networkConfig && !isChainSwitching && (
              <div className="mt-4 border-t border-color pt-4">
                <button
                  onClick={() => setShowDetails(!showDetails)}
                  className="w-full flex items-center justify-between text-xs font-medium text-secondary hover:text-primary transition-colors mb-2 group"
                >
                  <span className="flex items-center gap-1">
                    <Info className="w-3 h-3" />
                    Swap Details
                  </span>
                  <ChevronDown
                    className={`w-3 h-3 transition-transform ${showDetails ? 'rotate-180' : ''}`}
                  />
                </button>

                {showDetails && (
                  <div className="space-y-3 animate-slide-up rounded-xl bg-secondary/50 p-4 border border-color/50">
                    <div className="flex items-center justify-between text-sm sm:text-base">
                      <span className="text-secondary text-sm">You pay</span>
                      <span className="font-semibold text-primary text-sm sm:text-base">
                        {quote.inputAmount} {quote.inputToken}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-sm sm:text-base">
                      <span className="text-secondary text-sm">You receive</span>
                      <span className="font-semibold text-success text-sm sm:text-base">
                        {parseFloat(quote.outputAmount).toFixed(6)} {quote.outputToken}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-sm sm:text-base">
                      <span
                        className="text-secondary text-sm underline decoration-dotted cursor-help"
                        title="Fee paid to liquidity providers"
                      >
                        Fee Tier
                      </span>
                      <span className="font-semibold text-primary text-sm sm:text-base">
                        {(quote.fee / 10000).toFixed(2)}%
                      </span>
                    </div>

                    {quote.networkFee !== undefined && quote.networkFee > 0 && (
                      <div className="flex items-center justify-between text-sm sm:text-base">
                        <span
                          className="text-secondary text-sm underline decoration-dotted cursor-help"
                          title="Estimated network gas fee"
                        >
                          Network Fee
                        </span>
                        <span className="font-semibold text-primary text-sm sm:text-base">
                          ~{quote.networkFee.toFixed(6)} {networkConfig.nativeCurrency.symbol}
                        </span>
                      </div>
                    )}

                    <div className="flex items-center justify-between text-sm sm:text-base">
                      <span
                        className="text-secondary text-sm underline decoration-dotted cursor-help"
                        title="Your transaction will revert if price changes unfavorably"
                      >
                        Slippage Tolerance
                      </span>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          className="w-14 text-right bg-tertiary border border-color rounded px-1.5 py-1 text-sm focus:ring-1 focus:ring-brand focus:outline-none"
                          value={slippageTolerance}
                          onChange={e =>
                            setSlippageTolerance(
                              Math.max(0, Math.min(50, parseFloat(e.target.value) || 0))
                            )
                          }
                          min="0"
                          max="50"
                          step="0.1"
                        />
                        <span className="text-sm font-semibold text-muted">%</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        {isConnected && (
          <button
            onClick={handleSwap}
            className={`w-full btn-lg font-bold py-4 rounded-xl shadow-lg transition-all transform active:scale-95 ${isSwapDisabled ? 'btn-secondary opacity-70' : 'btn-primary hover:shadow-xl'}`}
            disabled={isSwapDisabled}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                Processing...
              </span>
            ) : !isConnected ? (
              'Connect Wallet'
            ) : isChainSwitching ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                Switching Network...
              </span>
            ) : !senderAddress ? (
              'No Wallet Address'
            ) : sellAssetSymbol === buyAssetSymbol && sellAssetSymbol !== '' ? (
              'Select Different Tokens'
            ) : !sellAmount ? (
              'Enter Amount'
            ) : parseFloat(sellAmount) > parseFloat(selectedSellAsset?.balance || '0') ? (
              'Insufficient Balance'
            ) : isFetchingAssets ? (
              'Fetching Assets...'
            ) : !quote ? (
              'Get Quote'
            ) : (
              'Swap Now'
            )}
          </button>
        )}

        <AssetSelectionModal
          isOpen={assetModalOpen !== null}
          onClose={closeAssetModal}
          title={assetModalOpen === 'sell' ? 'Select Token to Pay' : 'Select Token to Receive'}
          assets={assets}
          onSelect={asset => {
            if (assetModalOpen === 'sell') {
              setSellAssetSymbol(asset.symbol);
            } else {
              setBuyAssetSymbol(asset.symbol);
            }
            closeAssetModal();
          }}
          selectedAssetSymbol={assetModalOpen === 'sell' ? sellAssetSymbol : buyAssetSymbol}
          isLoading={isFetchingAssets}
        />

        {error && (
          <div className="card bg-danger-bg bg-red-200 border-2 border-red-300 animate-slide-up">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h4 className="font-semibold text-red-900 mb-1">Transaction Error</h4>
                <p className="text-sm text-red-700">{error}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </PageLayout>
  );
};

export default SwapAssets;
