import { ArrowUpDown } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';

import { ethers } from 'ethers';

import PageLayout from '../../../../../components/layout/PageLayout';
import { useNotificationStore } from '../../../../../store/notificationStore';
import { ActionGuard } from '../../../../commonfeature/components/ActionGuard';
import TransactionButton from '../../../../commonfeature/components/TransactionButton';
import { useAssetSelectorModal } from '../../../../commonfeature/components/useAssetSelectorModal';
import { WalletType } from '../../../../walletconnect/constants/Wallet';
import { useWalletConnect } from '../../../../walletconnect/hooks/useWalletConnect';
import { getEvmChainId, useNearIntentCrossChain } from '../hooks/useNearIntentCrossChain';
import type { NearIntentToken } from '../services/oneClickApi';
import { isStellarBlockchain } from '../services/oneClickApi';

// Human-readable network labels shown under the token symbol in the selector button.
const NETWORK_LABEL: Record<string, string> = {
  ethereum: 'Ethereum',
  eth: 'Ethereum',
  arbitrum: 'Arbitrum',
  arb: 'Arbitrum',
  polygon: 'Polygon',
  pol: 'Polygon',
  matic: 'Polygon',
  bsc: 'BNB Chain',
  bnb: 'BNB Chain',
  base: 'Base',
  optimism: 'Optimism',
  op: 'Optimism',
  avalanche: 'Avalanche',
  avax: 'Avalanche',
  stellar: 'Stellar',
  near: 'NEAR',
  solana: 'Solana',
  bitcoin: 'Bitcoin',
  btc: 'Bitcoin',
};

const getNetworkLabel = (blockchain?: string) =>
  NETWORK_LABEL[blockchain?.toLowerCase() ?? ''] ?? blockchain ?? '';

const InterSwap: React.FC = () => {
  const { connectedWallets, getProvider } = useWalletConnect();
  const { showToast } = useNotificationStore();

  const evmWallet = connectedWallets[WalletType.EVM];
  const evmAddress = evmWallet?.address || '';
  const stellarWallet = connectedWallets[WalletType.STELLAR];
  const stellarAddress = stellarWallet?.address || '';

  const [sellAmount, setSellAmount] = useState('');
  const [selectedSellAsset, setSelectedSellAsset] = useState<any | null>(null);
  const [selectedBuyAsset, setSelectedBuyAsset] = useState<any | null>(null);

  const {
    tokens: nearIntentTokens,
    isFetchingTokens,
    fetchTokens,
    quote,
    quoteLoading,
    fetchQuote,
    executeDeposit,
    loading,
    error,
    status,
    txHash,
    reset,
  } = useNearIntentCrossChain({
    evmAddress,
    stellarAddress,
    getProvider,
  });

  const [selectedSellToken, setSelectedSellToken] = useState<NearIntentToken | null>(null);
  const [selectedBuyToken, setSelectedBuyToken] = useState<NearIntentToken | null>(null);

  const { openAssetSelector } = useAssetSelectorModal();

  useEffect(() => {
    fetchTokens();
  }, [fetchTokens]);

  const findNearIntentToken = useCallback(
    (asset: any): NearIntentToken | undefined => {
      if (!asset) return undefined;

      const assetAddress = (asset.address || asset.contractAddress || '').toLowerCase();
      const assetChainId = asset.chainId; // EVM chainId (e.g. 137) or 'stellar'

      return nearIntentTokens.find(t => {
        // 1. Is it a Stellar asset from the modal? (AssetSelectorModal uses 'pubnet' for Stellar)
        if (assetChainId === 'stellar' || assetChainId === 'pubnet') {
          if (!isStellarBlockchain(t.blockchain)) return false;
        } else if (
          typeof assetChainId === 'number' ||
          (typeof assetChainId === 'string' && !isNaN(Number(assetChainId)))
        ) {
          const tEvmChainId = getEvmChainId(t);
          if (tEvmChainId !== Number(assetChainId)) return false;
        } else {
          return false;
        }

        const tAddress = (t.contractAddress || '').toLowerCase();

        if (tAddress && assetAddress && tAddress === assetAddress) {
          return true;
        }

        const isAssetNative =
          asset.isNative ||
          assetAddress === 'native' ||
          assetAddress === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

        if (
          isAssetNative &&
          !t.contractAddress &&
          t.symbol.toLowerCase() === (asset.symbol || '').toLowerCase()
        ) {
          return true;
        }

        if (t.symbol && asset.symbol && t.symbol.toLowerCase() === asset.symbol.toLowerCase()) {
          return true;
        }

        return false;
      });
    },
    [nearIntentTokens]
  );

  const handleSelectSellAsset = useCallback(
    (asset: any) => {
      const mappedToken = findNearIntentToken(asset);
      if (!mappedToken) {
        showToast({
          title: 'Unsupported Asset',
          message: 'This asset is not supported for cross-chain swap.',
          type: 'SYSTEM',
        });
        return;
      }

      if (selectedBuyToken && mappedToken.assetId === selectedBuyToken.assetId) {
        showToast({
          title: 'Invalid Selection',
          message: 'Cannot swap the same asset on the same network.',
          type: 'SYSTEM',
        });
        return;
      }

      setSelectedSellAsset(asset);
      setSelectedSellToken(mappedToken);
      reset();
    },
    [findNearIntentToken, reset, showToast, selectedBuyToken]
  );

  const handleSelectBuyAsset = useCallback(
    (asset: any) => {
      const mappedToken = findNearIntentToken(asset);
      if (!mappedToken) {
        showToast({
          title: 'Unsupported Asset',
          message: 'This asset is not supported for cross-chain swap.',
          type: 'SYSTEM',
        });
        return;
      }

      if (selectedSellToken && mappedToken.assetId === selectedSellToken.assetId) {
        showToast({
          title: 'Invalid Selection',
          message: 'Cannot swap the same asset on the same network.',
          type: 'SYSTEM',
        });
        return;
      }

      setSelectedBuyAsset(asset);
      setSelectedBuyToken(mappedToken);
      reset();
    },
    [findNearIntentToken, reset, showToast, selectedSellToken]
  );

  const openSellAssetSelector = () => {
    openAssetSelector('SWAP', { onSelect: handleSelectSellAsset });
  };

  const openBuyAssetSelector = () => {
    openAssetSelector('SWAP', { onSelect: handleSelectBuyAsset });
  };

  const handleSwapAssets = () => {
    const tempAsset = selectedSellAsset;
    const tempToken = selectedSellToken;
    setSelectedSellAsset(selectedBuyAsset);
    setSelectedSellToken(selectedBuyToken);
    setSelectedBuyAsset(tempAsset);
    setSelectedBuyToken(tempToken);
    reset();
  };

  useEffect(() => {
    if (
      status === 'PENDING_DEPOSIT' ||
      status === 'SUCCESS' ||
      status === 'FAILED' ||
      status === 'CANCELLED'
    ) {
      return;
    }

    if (selectedSellToken && selectedBuyToken && sellAmount && Number(sellAmount) > 0) {
      const timer = setTimeout(() => {
        const parsedAmount = ethers.parseUnits(sellAmount, selectedSellToken.decimals).toString();
        fetchQuote(selectedSellToken, selectedBuyToken, parsedAmount, 100);
      }, 600);
      return () => clearTimeout(timer);
    } else {
      reset();
    }
  }, [selectedSellToken, selectedBuyToken, sellAmount, fetchQuote, reset, status]);

  const handleExecute = () => {
    if (!selectedSellToken || !sellAmount) return;
    const parsedAmount = ethers.parseUnits(sellAmount, selectedSellToken.decimals).toString();
    executeDeposit(selectedSellToken, parsedAmount);
  };

  // Auto-reset CANCELLED state after 4 s so the UI returns to the swap form
  useEffect(() => {
    if (status === 'CANCELLED') {
      const t = setTimeout(() => reset(), 4000);
      return () => clearTimeout(t);
    }
  }, [status, reset]);

  const sellAssetBlockchain = selectedSellToken?.blockchain ?? 'evm';

  const formattedBuyAmount = quote?.amountOutFormatted || '';

  return (
    <PageLayout title="Intents Swap (1Click)" subtitle="Cross-chain swaps powered by NEAR Intents">
      <div className="max-w-md mx-auto bg-[var(--color-bg-secondary)] rounded-2xl p-6 shadow-xl border border-[var(--color-border)]">
        {/* Sell Section */}
        <div className="bg-[var(--color-bg-tertiary)] rounded-xl p-4 mb-2">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm text-[var(--color-text-secondary)]">You pay</span>
            {selectedSellToken && (
              <span className="text-xs text-[var(--color-text-tertiary)]">
                on {getNetworkLabel(selectedSellToken.blockchain)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={openSellAssetSelector}
              disabled={isFetchingTokens}
              className="flex items-center gap-2 bg-[var(--color-bg-secondary)] hover:bg-[var(--color-bg-primary)] px-3 py-2 rounded-lg border border-[var(--color-border)] transition-colors shrink-0 min-w-[120px]"
            >
              {selectedSellAsset ? (
                <div className="flex items-center gap-2">
                  <div className="relative shrink-0">
                    <img
                      src={selectedSellAsset.logoURI || selectedSellAsset.icon}
                      alt={selectedSellAsset.symbol}
                      className="w-7 h-7 rounded-full"
                      onError={e => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  </div>
                  <div className="text-left">
                    <div className="font-semibold text-sm leading-tight">
                      {selectedSellAsset.symbol}
                    </div>
                    {selectedSellToken && (
                      <div className="text-[10px] text-[var(--color-text-tertiary)] leading-tight">
                        {getNetworkLabel(selectedSellToken.blockchain)}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <span className="font-semibold text-sm">
                  {isFetchingTokens ? 'Loading...' : 'Select Token'}
                </span>
              )}
            </button>
            <div className="flex-1 flex flex-col items-end">
              <input
                type="number"
                placeholder="0.0"
                value={sellAmount}
                onChange={e => setSellAmount(e.target.value)}
                className="w-full bg-transparent text-right text-2xl outline-none font-medium placeholder:text-[var(--color-text-tertiary)]"
              />
              {quote?.amountInUsd && (
                <span className="text-sm text-[var(--color-text-secondary)] mt-1">
                  ~${Number(quote.amountInUsd).toFixed(2)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Swap Button */}
        <div className="flex justify-center -my-4 relative z-10">
          <button
            onClick={handleSwapAssets}
            className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] p-2 rounded-lg hover:bg-[var(--color-bg-tertiary)] transition-colors"
          >
            <ArrowUpDown className="w-4 h-4" />
          </button>
        </div>

        {/* Buy Section */}
        <div className="bg-[var(--color-bg-tertiary)] rounded-xl p-4 mt-2 mb-6">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm text-[var(--color-text-secondary)]">You receive</span>
            {selectedBuyToken && (
              <span className="text-xs text-[var(--color-text-tertiary)]">
                on {getNetworkLabel(selectedBuyToken.blockchain)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={openBuyAssetSelector}
              disabled={isFetchingTokens}
              className="flex items-center gap-2 bg-[var(--color-bg-secondary)] hover:bg-[var(--color-bg-primary)] px-3 py-2 rounded-lg border border-[var(--color-border)] transition-colors shrink-0 min-w-[120px]"
            >
              {selectedBuyAsset ? (
                <div className="flex items-center gap-2">
                  <div className="relative shrink-0">
                    <img
                      src={selectedBuyAsset.logoURI || selectedBuyAsset.icon}
                      alt={selectedBuyAsset.symbol}
                      className="w-7 h-7 rounded-full"
                      onError={e => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  </div>
                  <div className="text-left">
                    <div className="font-semibold text-sm leading-tight">
                      {selectedBuyAsset.symbol}
                    </div>
                    {selectedBuyToken && (
                      <div className="text-[10px] text-[var(--color-text-tertiary)] leading-tight">
                        {getNetworkLabel(selectedBuyToken.blockchain)}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <span className="font-semibold text-sm">
                  {isFetchingTokens ? 'Loading...' : 'Select Token'}
                </span>
              )}
            </button>
            <div className="flex-1 flex flex-col items-end">
              <input
                type="text"
                readOnly
                placeholder="0.0"
                value={quoteLoading ? 'Fetching...' : formattedBuyAmount}
                className="w-full bg-transparent text-right text-2xl outline-none font-medium placeholder:text-[var(--color-text-tertiary)]"
              />
              {quote?.amountOutUsd && !quoteLoading && (
                <span className="text-sm text-[var(--color-text-secondary)] mt-1">
                  ~${Number(quote.amountOutUsd).toFixed(2)}
                </span>
              )}
            </div>
          </div>
        </div>

        {quote && !quoteLoading && (
          <div className="bg-[var(--color-bg-tertiary)] rounded-xl p-4 mb-6 space-y-3 text-sm">
            <div className="flex justify-between items-center text-[var(--color-text-secondary)]">
              <span>Exchange Rate</span>
              <span className="font-medium text-[var(--color-text-primary)]">
                1 {selectedSellAsset?.symbol} ={' '}
                {(Number(quote.amountOutFormatted) / Number(sellAmount)).toFixed(4)}{' '}
                {selectedBuyAsset?.symbol}
              </span>
            </div>
            <div className="flex justify-between items-center text-[var(--color-text-secondary)]">
              <span>Estimated Time</span>
              <span className="font-medium text-[var(--color-text-primary)]">
                ~{quote.timeEstimate}s
              </span>
            </div>
            {quote.withdrawFee && (
              <div className="flex justify-between items-center text-[var(--color-text-secondary)]">
                <span>Network Fee</span>
                <span className="font-medium text-[var(--color-text-primary)]">
                  {ethers.formatUnits(
                    quote.withdrawFee,
                    findNearIntentToken(selectedBuyAsset)?.decimals || 18
                  )}{' '}
                  {selectedBuyAsset?.symbol}
                </span>
              </div>
            )}
            {quote.minAmountOut && (
              <div className="flex justify-between items-center text-[var(--color-text-secondary)]">
                <span>Minimum Received</span>
                <span className="font-medium text-[var(--color-text-primary)]">
                  {ethers.formatUnits(
                    quote.minAmountOut,
                    findNearIntentToken(selectedBuyAsset)?.decimals || 18
                  )}{' '}
                  {selectedBuyAsset?.symbol}
                </span>
              </div>
            )}
            {quote.depositMemo && (
              <div className="flex justify-between items-start text-[var(--color-text-secondary)] pt-2 border-t border-[var(--color-border)]">
                <span className="shrink-0">Deposit Memo</span>
                <span className="font-mono text-xs font-medium text-yellow-400 text-right break-all ml-4">
                  {quote.depositMemo}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Status / Error Banner */}
        {status === 'SUCCESS' && txHash && (
          <div className="mb-4 rounded-xl bg-green-500/10 border border-green-500/30 p-4">
            <div className="flex items-center gap-2 text-green-400 font-semibold mb-1">
              <span>✅</span> Swap Submitted!
            </div>
            <p className="text-xs text-green-300/80 mb-2">
              Your deposit was sent. The 1Click protocol is now processing the swap.
            </p>
            <div className="font-mono text-xs text-green-300/60 break-all">Tx: {txHash}</div>
          </div>
        )}

        {status === 'PENDING_DEPOSIT' && (
          <div className="mb-4 rounded-xl bg-blue-500/10 border border-blue-500/30 p-4">
            <div className="flex items-center gap-2 text-blue-400 font-semibold">
              <span className="animate-spin inline-block">⏳</span> Sending deposit...
            </div>
            <p className="text-xs text-blue-300/70 mt-1">
              Please approve the transaction in your wallet.
            </p>
          </div>
        )}

        {status === 'CANCELLED' && (
          <div className="mb-4 rounded-xl bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] p-4">
            <div className="flex items-center gap-2 text-[var(--color-text-secondary)] font-semibold">
              Transaction cancelled
            </div>
            <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
              You rejected the request. Resetting...
            </p>
          </div>
        )}

        {status === 'FAILED' && error && (
          <div className="mb-4 rounded-xl bg-red-500/10 border border-red-500/30 p-4">
            <div className="flex items-center gap-2 text-red-400 font-semibold mb-1">
              Transaction Failed
            </div>
            <p className="text-xs text-red-300/80 break-all">{error}</p>
            <button
              onClick={reset}
              className="mt-3 text-xs text-red-400 underline hover:text-red-300"
            >
              Try again
            </button>
          </div>
        )}

        {status === 'IDLE' && error && (
          <div className="mb-4 rounded-xl bg-red-500/10 border border-red-500/30 p-3">
            <p className="text-sm text-red-400 text-center">{error}</p>
          </div>
        )}

        <ActionGuard
          requiredWallets={
            isStellarBlockchain(sellAssetBlockchain) ? [WalletType.STELLAR] : [WalletType.EVM]
          }
        >
          <TransactionButton
            onClick={handleExecute}
            isLoading={loading || quoteLoading}
            isDisabled={!quote || !sellAmount || !selectedSellAsset || !selectedBuyAsset}
            className="w-full py-4 text-lg font-semibold rounded-xl"
            loadingLabel="Fetching Quote..."
            label={!quote ? 'Enter Amount to Swap' : 'Confirm Swap'}
          />
        </ActionGuard>
      </div>
    </PageLayout>
  );
};

export default InterSwap;
