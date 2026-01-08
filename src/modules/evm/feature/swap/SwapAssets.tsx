import {
  AlertCircle,
  ArrowUpDown,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  Loader2,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import PageLayout from '../../../../components/layout/PageLayout';
import type { SwapQuoteRequest } from '../../../../types/evm/swap.types';
import { getEVMChains } from '../../../walletconnect/config/chains';
import { WalletType } from '../../../walletconnect/constants/Wallet';
import { useWalletConnect } from '../../../walletconnect/hooks/useWalletConnect';
import { useWalletStore } from '../../../walletconnect/store/walletConnectStore';
import { useEvmSwap } from '../../hook/useEvmSwap';
import { determineSwapType } from '../../utils/evmSwapUtils';

interface SwapAssetsProps {
  onClose?: () => void;
}

const SwapAssets: React.FC<SwapAssetsProps> = ({ onClose }) => {
  const { connectedWallets, getProvider, openModal } = useWalletConnect();
  const currentNetwork = useWalletStore(state => state.network);

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
  const [showNetworkDropdown, setShowNetworkDropdown] = useState<boolean>(false);

  const dropdownRef = useRef<HTMLDivElement>(null);

  const {
    quote,
    txHash,
    assets,
    loading,
    error,
    isFetchingAssets,
    quoteLoading,
    fetchAssets,
    fetchQuote,
    performSwap,
    reset,
  } = useEvmSwap({
    chainId: currentChainId || 0,
    senderAddress,
    getProvider,
  });

  const selectedSellAsset = assets.find(a => a.symbol === sellAssetSymbol);
  const selectedBuyAsset = assets.find(a => a.symbol === buyAssetSymbol);

  const networkConfig = currentChainId
    ? evmChains.find(chain => chain.chainId === currentChainId)
    : null;

  const isTestnet = currentChainId
    ? [11155111, 80002, 97, 421614, 11155420, 43113].includes(currentChainId)
    : false;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowNetworkDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (currentChainId) {
      const isValidChain = evmChains.some(chain => chain.chainId === currentChainId);

      if (isValidChain) {
        setIsChainSwitching(true);
        setSellAmount('');
        setSellAssetSymbol('');
        setBuyAssetSymbol('');
        reset();
        setTimeout(() => setIsChainSwitching(false), 500);
      }
    }
  }, [currentChainId, evmChains, reset]);

  useEffect(() => {
    if (isConnected && senderAddress && currentChainId && !isChainSwitching) {
      fetchAssets();
    }
  }, [currentChainId, senderAddress, isConnected, fetchAssets, isChainSwitching]);

  // Set default assets
  useEffect(() => {
    if (assets.length > 0 && !sellAssetSymbol && !buyAssetSymbol && !isChainSwitching) {
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
  }, [assets, sellAssetSymbol, buyAssetSymbol, isChainSwitching]);

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
      console.error('Failed to fetch quote:', err);
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

  const handleAssetSwap = useCallback(() => {
    const newSell = buyAssetSymbol;
    const newBuy = sellAssetSymbol;

    setSellAssetSymbol(newSell);
    setBuyAssetSymbol(newBuy);
    setSellAmount('');
    reset();
  }, [buyAssetSymbol, sellAssetSymbol, reset]);

  const handleNetworkChange = useCallback(
    async (newChainId: number) => {
      if (newChainId === currentChainId) {
        setShowNetworkDropdown(false);
        return;
      }

      setIsChainSwitching(true);
      setShowNetworkDropdown(false);
      setSellAmount('');
      setSellAssetSymbol('');
      setBuyAssetSymbol('');
      reset();

      if (isConnected && getProvider(WalletType.EVM)) {
        try {
          const provider = getProvider(WalletType.EVM);
          await provider.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: `0x${newChainId.toString(16)}` }],
          });
        } catch (error: any) {
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
                      rpcUrls: [networkConfig.rpcUrl],
                      blockExplorerUrls: [networkConfig.blockExplorerUrl],
                    },
                  ],
                });
              } catch (addError) {
                console.error('Error adding network:', addError);
              }
            }
          }
        }
      }

      setTimeout(() => setIsChainSwitching(false), 500);
    },
    [isConnected, getProvider, reset, currentChainId, evmChains]
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
      console.error('Swap failed:', err);
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

  const formatBalance = (balance: string, decimals: number) => {
    return parseFloat(balance).toFixed(Math.min(decimals, 6));
  };

  const getChainIcon = (chainId: number) => {
    const icons: Record<number, string> = {
      1: '⟠',
      137: '⬣',
      56: '◆',
      42161: '◎',
      10: '◉',
      43114: '△',
      11155111: '⟠',
      80002: '⬣',
      97: '◆',
      421614: '◎',
      11155420: '◉',
      43113: '△',
    };
    return icons[chainId] || '●';
  };

  return (
    <PageLayout
      title="Token Swap"
      subtitle="Exchange tokens securely on EVM networks"
      onBack={onClose}
      showBackButton={!!onClose}
      maxWidth="lg"
    >
      <div className="max-w-xl mx-auto space-y-4">
        {/* Success Modal */}
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

        {/* Error Display */}
        {error && (
          <div className="card bg-danger-bg border-2 border-red-300 animate-slide-up">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h4 className="font-semibold text-red-900 mb-1">Transaction Error</h4>
                <p className="text-sm text-red-700">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Connect Wallet CTA */}
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

        {/* Network Selector */}
        {isConnected && networkConfig && (
          <div className="card py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-1">
                <label className="text-xs font-semibold text-secondary whitespace-nowrap">
                  Network:
                </label>
                <div className="relative flex-1" ref={dropdownRef}>
                  <button
                    onClick={() => setShowNetworkDropdown(!showNetworkDropdown)}
                    className="input-sm w-full flex items-center justify-between gap-2"
                    disabled={isChainSwitching}
                  >
                    <span className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="text-lg">{getChainIcon(currentChainId!)}</span>
                      <span className="truncate">{networkConfig.name}</span>
                    </span>
                    {isChainSwitching ? (
                      <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
                    ) : (
                      <ChevronDown
                        className={`w-4 h-4 flex-shrink-0 transition-transform ${
                          showNetworkDropdown ? 'rotate-180' : ''
                        }`}
                      />
                    )}
                  </button>

                  {showNetworkDropdown && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-secondary border border-color rounded-lg shadow-lg max-h-64 overflow-y-auto z-50">
                      {evmChains.map(chain => (
                        <button
                          key={chain.chainId}
                          onClick={() => handleNetworkChange(chain.chainId)}
                          className={`w-full px-3 py-2.5 flex items-center gap-3 hover:bg-hover transition-colors text-left ${
                            chain.chainId === currentChainId ? 'bg-hover' : ''
                          }`}
                        >
                          <span className="text-lg">{getChainIcon(chain.chainId)}</span>
                          <span className="flex-1 text-sm font-medium">{chain.name}</span>
                          {chain.chainId === currentChainId && (
                            <CheckCircle2 className="w-4 h-4 text-brand flex-shrink-0" />
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              {isTestnet && (
                <span className="badge-warning text-xs px-2 py-0.5 whitespace-nowrap">TEST</span>
              )}
            </div>
          </div>
        )}

        {/* Swap Interface */}
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

            {/* Sell Input */}
            <div className="mb-2">
              <div className="flex items-center justify-between mb-3">
                <label className="block text-sm font-semibold text-primary">You Pay</label>
                <button
                  onClick={handleMaxAmount}
                  className="text-xs font-medium text-brand hover:text-brand-hover transition-colors"
                  disabled={!selectedSellAsset || isFetchingAssets || isChainSwitching}
                >
                  MAX
                </button>
              </div>

              <div className="bg-tertiary rounded-xl p-4 border border-color">
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {selectedSellAsset?.logoURI && (
                      <img
                        src={selectedSellAsset.logoURI}
                        alt={selectedSellAsset.symbol}
                        className="w-8 h-8 rounded-full flex-shrink-0"
                        onError={e => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    )}
                    <select
                      className="input-sm bg-transparent border-none p-0 font-semibold text-sm cursor-pointer max-w-[90px]"
                      value={sellAssetSymbol}
                      onChange={e => {
                        setSellAssetSymbol(e.target.value);
                        setSellAmount('');
                        reset();
                      }}
                      disabled={isFetchingAssets || isChainSwitching}
                    >
                      <option value="" disabled>
                        Select
                      </option>
                      {assets.map(asset => (
                        <option key={asset.address} value={asset.symbol}>
                          {asset.symbol}
                        </option>
                      ))}
                    </select>
                  </div>

                  <input
                    type="number"
                    className={`input flex-1 text-right text-xl font-bold bg-transparent border-none p-0 focus:ring-0 min-w-0 ${
                      parseFloat(sellAmount) > parseFloat(selectedSellAsset?.balance || '0')
                        ? 'text-red-600'
                        : ''
                    }`}
                    placeholder="0.00"
                    value={sellAmount}
                    onChange={e => setSellAmount(e.target.value)}
                    disabled={isFetchingAssets || isChainSwitching}
                  />
                </div>

                <div className="flex justify-between items-center text-xs">
                  <span className="text-muted">
                    Balance:{' '}
                    {isFetchingAssets || isChainSwitching ? (
                      <Loader2 className="w-3 h-3 animate-spin inline" />
                    ) : selectedSellAsset ? (
                      formatBalance(selectedSellAsset.balance || '0', selectedSellAsset.decimals)
                    ) : (
                      '0'
                    )}
                  </span>
                  {parseFloat(sellAmount) > parseFloat(selectedSellAsset?.balance || '0') && (
                    <span className="text-red-600 font-semibold">Insufficient</span>
                  )}
                </div>
              </div>
            </div>

            {/* Swap Button */}
            <div className="flex justify-center -my-3 relative z-10">
              <button
                onClick={handleAssetSwap}
                className="w-10 h-10 rounded-lg bg-secondary border-2 border-color hover:border-brand hover:bg-hover transition-all flex items-center justify-center shadow-md"
                disabled={
                  isFetchingAssets || !selectedSellAsset || !selectedBuyAsset || isChainSwitching
                }
              >
                <ArrowUpDown className="w-4 h-4 text-brand" />
              </button>
            </div>

            {/* Buy Output */}
            <div className="mt-2">
              <label className="block text-sm font-semibold text-primary mb-3">You Receive</label>

              <div className="bg-tertiary rounded-xl p-4 border border-color">
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {selectedBuyAsset?.logoURI && (
                      <img
                        src={selectedBuyAsset.logoURI}
                        alt={selectedBuyAsset.symbol}
                        className="w-8 h-8 rounded-full flex-shrink-0"
                        onError={e => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    )}
                    <select
                      className="input-sm bg-transparent border-none p-0 font-semibold text-sm cursor-pointer max-w-[90px]"
                      value={buyAssetSymbol}
                      onChange={e => {
                        setBuyAssetSymbol(e.target.value);
                        setSellAmount('');
                        reset();
                      }}
                      disabled={isFetchingAssets || isChainSwitching}
                    >
                      <option value="" disabled>
                        Select
                      </option>
                      {assets.map(asset => (
                        <option key={asset.address} value={asset.symbol}>
                          {asset.symbol}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex-1 text-right text-xl font-bold min-w-0 overflow-hidden">
                    {quoteLoading ? (
                      <Loader2 className="w-5 h-5 animate-spin ml-auto" />
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
                      formatBalance(selectedBuyAsset.balance || '0', selectedBuyAsset.decimals)
                    ) : (
                      '0'
                    )}
                  </span>
                </div>
              </div>
            </div>

            {/* Price Info */}
            {quote && !quoteLoading && !isChainSwitching && (
              <div className="mt-4 bg-info-bg rounded-lg p-3 border border-color">
                <div className="flex items-center justify-center gap-2">
                  <TrendingUp className="w-4 h-4 text-info" />
                  <span className="text-sm font-medium text-primary">
                    1 {quote.inputToken} = {parseFloat(quote.pricePerToken).toFixed(6)}{' '}
                    {quote.outputToken}
                  </span>
                </div>
              </div>
            )}

            {quoteLoading && sellAmount && selectedSellAsset && selectedBuyAsset && (
              <div className="mt-4 bg-info-bg rounded-lg p-3 border border-color">
                <div className="flex items-center justify-center gap-2 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin text-info" />
                  <span className="text-primary">Fetching best price...</span>
                </div>
              </div>
            )}

            {/* Swap Details */}
            {quote && !quoteLoading && networkConfig && !isChainSwitching && (
              <div className="mt-4">
                <button
                  onClick={() => setShowDetails(!showDetails)}
                  className="w-full flex items-center justify-between text-sm font-semibold text-secondary hover:text-primary transition-colors mb-3"
                >
                  <span>Swap Details</span>
                  <ChevronDown
                    className={`w-4 h-4 transition-transform ${showDetails ? 'rotate-180' : ''}`}
                  />
                </button>

                {showDetails && (
                  <div className="space-y-3 animate-slide-up rounded-lg bg-secondary/40 p-3">
                    <div className="flex items-center justify-between text-sm border-b border-dotted border-gray-500/40 pb-2">
                      <span className="text-secondary">You pay</span>
                      <span className="font-semibold text-primary">
                        {quote.inputAmount} {quote.inputToken}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-sm border-b border-dotted border-gray-500/40 pb-2">
                      <span className="text-secondary">You receive</span>
                      <span className="font-semibold text-success">
                        {parseFloat(quote.outputAmount).toFixed(6)} {quote.outputToken}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-sm border-b border-dotted border-gray-500/40 pb-2">
                      <span className="text-secondary">Fee Tier</span>
                      <span className="font-semibold text-primary">
                        {(quote.fee / 10000).toFixed(2)}%
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-sm border-b border-dotted border-gray-500/40 pb-2">
                      <span className="text-secondary">Slippage Tolerance</span>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          className="input-sm w-16 text-center"
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
                        <span className="text-sm font-semibold">%</span>
                      </div>
                    </div>

                    <div className="flex items-start justify-between text-sm">
                      <span className="text-secondary">Pool Address</span>
                      <a
                        href={`${networkConfig.blockExplorerUrl}/address/${quote.poolAddress}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-brand hover:text-brand-hover flex items-center gap-1 text-xs break-all text-right"
                      >
                        {quote.poolAddress.slice(0, 6)}...
                        {quote.poolAddress.slice(-4)}
                        <ExternalLink className="w-3 h-3 flex-shrink-0" />
                      </a>
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
            className={`w-full btn-lg ${isSwapDisabled ? 'btn-secondary' : 'btn-primary'}`}
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
            ) : `${''}` === `${''}` ? (
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
              'Swap'
            )}
          </button>
        )}
      </div>
    </PageLayout>
  );
};

export default SwapAssets;
