import {
  AlertCircle,
  ArrowRight,
  ArrowUpDown,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  Loader2,
  LogOut,
  RefreshCcw,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';

import PageLayout from '../../../../components/layout/PageLayout';
import EVM_NETWORKS from '../../../../config/evmNetworks';
import { type NetworkKey, SWAP_CONFIGS } from '../../../../config/swapConfigs';
import type { Asset, SwapQuoteRequest } from '../../../../types/evm/swap.types';
// SwapQuote,
import { useWalletStore } from '../../../wallet/store.ts/walletStore';
import { useEvmSwap } from '../../hook/useEvmSwap';
import { determineSwapType } from '../../utils/evmSwapUtils';

interface SwapAssetsProps {
  onClose?: () => void;
}

const SwapAssets: React.FC<SwapAssetsProps> = ({ onClose }) => {
  const { isConnected, walletAddresses, connectMultiChainWallet, disconnectWallet } =
    useWalletStore();

  const [networkKey, setNetworkKey] = useState<NetworkKey>('sepolia');
  const [sellAssetCode, setSellAssetCode] = useState<string>('');
  const [buyAssetCode, setBuyAssetCode] = useState<string>('');
  const [sellAmount, setSellAmount] = useState<string>('');
  const [slippageTolerance, setSlippageTolerance] = useState<number>(0.5);
  const [showDetails, setShowDetails] = useState<boolean>(true);

  const senderAddress = walletAddresses.find(addr => addr.startsWith('0x')) || '';
  const getPrivateKey = useWalletStore(state => state.getPrivateKey);

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
    networkKey,
    senderAddress,
    getPrivateKey,
  });

  const selectedSellAsset = assets.find(a => a.code === sellAssetCode);
  const selectedBuyAsset = assets.find(a => a.code === buyAssetCode);

  const config =
    EVM_NETWORKS.testnet[networkKey as keyof typeof EVM_NETWORKS.testnet] ||
    EVM_NETWORKS.mainnet[networkKey as keyof typeof EVM_NETWORKS.mainnet];

  useEffect(() => {
    if (isConnected && senderAddress) {
      fetchAssets();
    }
  }, [networkKey, senderAddress, isConnected, fetchAssets]);

  useEffect(() => {
    if (assets.length > 0 && !sellAssetCode && !buyAssetCode) {
      let defaultSellAsset: Asset | undefined;
      let defaultBuyAsset: Asset | undefined;

      const wNativeAsset = assets.find(
        a => a.address.toLowerCase() === SWAP_CONFIGS[networkKey].wNative.toLowerCase()
      );
      const usdcAsset = assets.find(a => a.code === 'USDC');

      if (wNativeAsset && usdcAsset && wNativeAsset.code !== usdcAsset.code) {
        defaultSellAsset = wNativeAsset;
        defaultBuyAsset = usdcAsset;
      } else if (assets.length >= 2) {
        defaultSellAsset = assets[0];
        defaultBuyAsset = assets[1];
      }

      if (defaultSellAsset && defaultBuyAsset) {
        setSellAssetCode(defaultSellAsset.code);
        setBuyAssetCode(defaultBuyAsset.code);
      }
    }
  }, [assets, sellAssetCode, buyAssetCode, networkKey]);

  const fetchSwapQuote = useCallback(async () => {
    if (
      !selectedSellAsset ||
      !selectedBuyAsset ||
      !sellAmount ||
      parseFloat(sellAmount) <= 0 ||
      sellAssetCode === buyAssetCode ||
      !isConnected
    ) {
      return;
    }

    try {
      const config = SWAP_CONFIGS[networkKey];
      const swapType = determineSwapType(selectedSellAsset, selectedBuyAsset, config.wNative);

      const quoteRequest: SwapQuoteRequest = {
        tokenIn: {
          symbol: selectedSellAsset.code,
          name: selectedSellAsset.name,
          decimals: selectedSellAsset.decimals,
          address: selectedSellAsset.address,
          balance: selectedSellAsset.balance.toString(),
          logoUri: selectedSellAsset.logoUri,
        },
        tokenOut: {
          symbol: selectedBuyAsset.code,
          name: selectedBuyAsset.name,
          decimals: selectedBuyAsset.decimals,
          address: selectedBuyAsset.address,
          balance: selectedBuyAsset.balance.toString(),
          logoUri: selectedBuyAsset.logoUri,
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
    sellAssetCode,
    buyAssetCode,
    isConnected,
    networkKey,
    fetchQuote,
  ]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      fetchSwapQuote();
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [fetchSwapQuote]);

  const handleMaxAmount = useCallback(() => {
    if (selectedSellAsset) {
      const maxAmount = Math.max(
        0,
        selectedSellAsset.balance -
          (selectedSellAsset.address === SWAP_CONFIGS[networkKey].wNative ? 0.01 : 0)
      );
      setSellAmount(maxAmount.toString());
    }
  }, [selectedSellAsset, networkKey]);

  const handleAssetSwap = useCallback(() => {
    const newSellCode = buyAssetCode;
    const newBuyCode = sellAssetCode;

    setSellAssetCode(newSellCode);
    setBuyAssetCode(newBuyCode);
    setSellAmount('');
    reset();
  }, [buyAssetCode, sellAssetCode, reset]);

  const handleNetworkChange = useCallback(
    (newNetworkKey: NetworkKey) => {
      setNetworkKey(newNetworkKey);
      setSellAmount('');
      setSellAssetCode('');
      setBuyAssetCode('');
      reset();
    },
    [reset]
  );

  const handleSwap = useCallback(async () => {
    if (!isConnected) {
      await connectMultiChainWallet();
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
    connectMultiChainWallet,
  ]);

  const isSwapDisabled =
    !isConnected ||
    !senderAddress ||
    sellAssetCode === buyAssetCode ||
    !sellAmount ||
    parseFloat(sellAmount) <= 0 ||
    parseFloat(sellAmount) > (selectedSellAsset?.balance ?? 0) ||
    loading ||
    !quote ||
    isFetchingAssets;

  const buyAmount = quote?.outputAmount
    ? parseFloat(quote.outputAmount).toFixed(Math.min(selectedBuyAsset?.decimals ?? 6, 6))
    : '0.00';

  const formatBalance = (balance: number, decimals: number) => {
    return balance.toFixed(Math.min(decimals, 6));
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

        {/* Success Modal */}
        {txHash && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-end sm:items-center justify-center z-50 p-0 sm:p-4 animate-fade-in">
            <div className="card max-w-md w-full animate-slide-up rounded-t-3xl sm:rounded-2xl border-t-4 border-green-500 shadow-2xl m-0 sm:m-4">
              {/* Success Icon */}
              <div className="flex items-center justify-center pt-8 pb-4">
                <div className="relative">
                  <div className="w-20 h-20 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center shadow-lg">
                    <CheckCircle2 className="w-12 h-12 text-white" strokeWidth={2.5} />
                  </div>
                  <div className="absolute -inset-2 bg-green-400/20 rounded-full blur-xl animate-pulse"></div>
                </div>
              </div>

              {/* Content */}
              <div className="px-6 pb-6">
                <h3 className="text-2xl font-bold text-center mb-2 text-primary">
                  Swap Successful!
                </h3>
                <p className="text-secondary text-center mb-1 text-sm">
                  Your transaction has been confirmed
                </p>
                <p className="text-center text-xs font-medium text-green-600 mb-6">
                  on {config.name}
                </p>

                {/* Transaction Hash */}
                <div className="bg-tertiary rounded-lg p-3 mb-6 border border-color">
                  <p className="text-xs text-muted mb-1 text-center">Transaction Hash</p>
                  <p className="font-mono text-xs text-center text-primary break-all">
                    {txHash.slice(0, 10)}...{txHash.slice(-8)}
                  </p>
                </div>

                {/* Action Buttons */}
                <div className="space-y-3">
                  <a
                    href={`${config.explorerUrl}/tx/${txHash}`}
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

        {/* Error Alert */}
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

        {/* Wallet Connection */}
        {!isConnected && (
          <div className="card text-center py-12">
            <div className="flex justify-center mb-6">
              <div className="w-20 h-20 rounded-full bg-tertiary flex items-center justify-center">
                <Wallet className="w-10 h-10 text-brand" />
              </div>
            </div>
            <h3 className="heading-3 mb-3">Connect Your Wallet</h3>
            <p className="text-secondary mb-6 max-w-md mx-auto">
              To start swapping tokens, please connect your wallet first.
            </p>
            <button onClick={connectMultiChainWallet} className="btn-primary btn-lg">
              Connect Wallet
            </button>
          </div>
        )}

        {/* Network Selection - Compact */}
        {isConnected && (
          <div className="card py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-1">
                <label className="text-xs font-semibold text-secondary whitespace-nowrap">
                  Network:
                </label>
                <select
                  className="input-sm flex-1 min-w-0"
                  value={networkKey}
                  onChange={e => handleNetworkChange(e.target.value as NetworkKey)}
                >
                  {Object.keys({
                    ...EVM_NETWORKS.mainnet,
                    ...EVM_NETWORKS.testnet,
                  }).map(key => (
                    <option key={key} value={key}>
                      {
                        (
                          EVM_NETWORKS.mainnet[key as keyof typeof EVM_NETWORKS.mainnet] ||
                          EVM_NETWORKS.testnet[key as keyof typeof EVM_NETWORKS.testnet]
                        ).name
                      }
                    </option>
                  ))}
                </select>
              </div>
              {(networkKey.includes('testnet') || ['sepolia', 'amoy'].includes(networkKey)) && (
                <span className="badge-warning text-xs px-2 py-0.5 whitespace-nowrap">TEST</span>
              )}
            </div>
          </div>
        )}

        {/* Main Swap Card */}
        {isConnected && (
          <div className="card">
            {/* From Token */}
            <div className="mb-2">
              <div className="flex items-center justify-between mb-3">
                <label className="block text-sm font-semibold text-primary">You Pay</label>
                <button
                  onClick={handleMaxAmount}
                  className="text-xs font-medium text-brand hover:text-brand-hover transition-colors"
                  disabled={!selectedSellAsset || isFetchingAssets}
                >
                  MAX
                </button>
              </div>

              <div className="bg-tertiary rounded-xl p-4 border border-color">
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {selectedSellAsset?.logoUri && (
                      <img
                        src={selectedSellAsset.logoUri}
                        alt={selectedSellAsset.code}
                        className="w-8 h-8 rounded-full flex-shrink-0"
                        onError={e => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    )}
                    <select
                      className="input-sm bg-transparent border-none p-0 font-semibold text-sm cursor-pointer max-w-[80px]"
                      value={sellAssetCode}
                      onChange={e => {
                        setSellAssetCode(e.target.value);
                        setSellAmount('');
                        reset();
                      }}
                      disabled={isFetchingAssets}
                    >
                      <option value="" disabled>
                        Select
                      </option>
                      {assets.map(asset => (
                        <option key={asset.address} value={asset.code}>
                          {asset.code}
                        </option>
                      ))}
                    </select>
                  </div>

                  <input
                    type="number"
                    className={`input flex-1 text-right text-xl font-bold bg-transparent border-none p-0 focus:ring-0 min-w-0 ${
                      parseFloat(sellAmount) > (selectedSellAsset?.balance ?? 0)
                        ? 'text-red-600'
                        : ''
                    }`}
                    placeholder="0.00"
                    value={sellAmount}
                    onChange={e => setSellAmount(e.target.value)}
                    disabled={isFetchingAssets}
                  />
                </div>

                <div className="flex justify-between items-center text-xs">
                  <span className="text-muted">
                    Balance:{' '}
                    {isFetchingAssets ? (
                      <Loader2 className="w-3 h-3 animate-spin inline" />
                    ) : (
                      <>
                        {selectedSellAsset
                          ? formatBalance(selectedSellAsset.balance, selectedSellAsset.decimals)
                          : '0'}
                      </>
                    )}
                  </span>
                  {parseFloat(sellAmount) > (selectedSellAsset?.balance ?? 0) && (
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
                disabled={isFetchingAssets || !selectedSellAsset || !selectedBuyAsset}
              >
                <ArrowUpDown className="w-4 h-4 text-brand" />
              </button>
            </div>

            {/* To Token */}
            <div className="mt-2">
              <label className="block text-sm font-semibold text-primary mb-3">You Receive</label>

              <div className="bg-tertiary rounded-xl p-4 border border-color">
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {selectedBuyAsset?.logoUri && (
                      <img
                        src={selectedBuyAsset.logoUri}
                        alt={selectedBuyAsset.code}
                        className="w-8 h-8 rounded-full flex-shrink-0"
                        onError={e => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    )}
                    <select
                      className="input-sm bg-transparent border-none p-0 font-semibold text-sm cursor-pointer max-w-[80px]"
                      value={buyAssetCode}
                      onChange={e => {
                        setBuyAssetCode(e.target.value);
                        setSellAmount('');
                        reset();
                      }}
                      disabled={isFetchingAssets}
                    >
                      <option value="" disabled>
                        Select
                      </option>
                      {assets.map(asset => (
                        <option key={asset.address} value={asset.code}>
                          {asset.code}
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
                    {isFetchingAssets ? (
                      <Loader2 className="w-3 h-3 animate-spin inline" />
                    ) : (
                      <>
                        {selectedBuyAsset
                          ? formatBalance(selectedBuyAsset.balance, selectedBuyAsset.decimals)
                          : '0'}
                      </>
                    )}
                  </span>
                </div>
              </div>
            </div>

            {/* Exchange Rate */}
            {quote && !quoteLoading && (
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

            {/* Loading Quote */}
            {quoteLoading && sellAmount && selectedSellAsset && selectedBuyAsset && (
              <div className="mt-4 bg-info-bg rounded-lg p-3 border border-color">
                <div className="flex items-center justify-center gap-2 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin text-info" />
                  <span className="text-primary">Fetching best price...</span>
                </div>
              </div>
            )}

            {/* Swap Details - Collapsible */}
            {quote && !quoteLoading && (
              <div className="mt-4">
                {/* Toggle Button */}
                <button
                  onClick={() => setShowDetails(!showDetails)}
                  className="w-full flex items-center justify-between text-sm font-semibold text-secondary hover:text-primary transition-colors mb-3"
                >
                  <span>Swap Details</span>
                  <ChevronDown
                    className={`w-4 h-4 transition-transform ${showDetails ? 'rotate-180' : ''}`}
                  />
                </button>

                {/* Details */}
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
                        href={`${config.explorerUrl}/address/${quote.poolAddress}`}
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

        {/* Swap Button */}
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
            ) : !senderAddress ? (
              'No Wallet Address'
            ) : sellAssetCode === buyAssetCode ? (
              'Select Different Tokens'
            ) : !sellAmount ? (
              'Enter Amount'
            ) : parseFloat(sellAmount) <= 0 ? (
              'Enter Valid Amount'
            ) : parseFloat(sellAmount) > (selectedSellAsset?.balance ?? 0) ? (
              'Insufficient Balance'
            ) : isFetchingAssets ? (
              'Fetching Assets...'
            ) : !quote ? (
              'Getting Quote...'
            ) : (
              <span className="flex items-center justify-center gap-2">
                Swap Tokens
                <ArrowRight className="w-5 h-5" />
              </span>
            )}
          </button>
        )}

        {/* Action Buttons */}
        {isConnected && (
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => fetchAssets()}
              className="btn-secondary flex items-center justify-center gap-2"
              disabled={isFetchingAssets}
            >
              {isFetchingAssets ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="hidden sm:inline">Refreshing...</span>
                </>
              ) : (
                <>
                  <RefreshCcw className="w-4 h-4" />
                  <span className="hidden sm:inline">Refresh</span>
                </>
              )}
            </button>
            <button
              onClick={disconnectWallet}
              className="btn-secondary flex items-center justify-center gap-2 text-red-600 hover:text-red-700"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Disconnect</span>
            </button>
          </div>
        )}
      </div>
    </PageLayout>
  );
};

export default SwapAssets;
