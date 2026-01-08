import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { useWalletStore } from '../../walletconnect/store/walletConnectStore';
import { useDydxWallet } from '../hooks/useDydxWallet';
import { dydxWalletService } from '../service/dydxWalletService';
import {
  calculateCurrentMargin,
  formatCurrency,
  formatPercent,
  getMarginUsageColors,
} from '../utils/marginCalculator';

const formatTimeAgo = (timestamp: number | null): string => {
  if (!timestamp) return 'Never';

  const seconds = Math.floor((Date.now() - timestamp) / 1000);

  if (seconds < 10) return 'Just now';
  if (seconds < 60) return `${seconds}s ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
};

export const DydxWalletConnect: React.FC = () => {
  const network = useWalletStore(state => state.network);
  const openModal = useWalletStore(state => state.openModal);
  const deriveDydx = useWalletStore(state => state.deriveDydx);
  const evmWallet = useWalletStore(state => state.connectedWallets.evm);
  const cosmosWallet = useWalletStore(state => state.connectedWallets.cosmos);

  const hasDydxAddress = useMemo(() => {
    return !!(evmWallet?.dydxAddress || cosmosWallet?.dydxAddress);
  }, [evmWallet, cosmosWallet]);

  const hasEvmWallet = useMemo(() => {
    return !!evmWallet;
  }, [evmWallet]);

  const needsDydxDerivation = useMemo(() => {
    return hasEvmWallet && !evmWallet?.dydxAddress;
  }, [hasEvmWallet, evmWallet]);

  const [isConnecting, setIsConnecting] = useState(false);
  const [isDeriving, setIsDeriving] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const {
    isConnected,
    address,
    balance,
    loadingBalance,
    error,
    refresh,
    lastUpdateTime,
    isReceivingUpdates,
  } = useDydxWallet();

  // Track if we've attempted to load balance at least once
  const [hasAttemptedLoad, setHasAttemptedLoad] = React.useState(false);

  // Auto-refresh balance when connected and no balance data
  useEffect(() => {
    if (isConnected && !balance && !loadingBalance && !hasAttemptedLoad) {
      setHasAttemptedLoad(true);
      console.log('[DydxWalletConnect] Auto-refreshing balance on connect');
      refresh().catch(err => console.error('[DydxWalletConnect] Auto-refresh failed:', err));
    }
  }, [isConnected, balance, loadingBalance, hasAttemptedLoad, refresh]);

  // Reset hasAttemptedLoad when disconnected
  useEffect(() => {
    if (!isConnected) {
      setHasAttemptedLoad(false);
    }
  }, [isConnected]);

  useEffect(() => {
    if (
      hasDydxAddress &&
      !isConnected &&
      !isConnecting &&
      !connectionError &&
      dydxWalletService.getStatus() !== 'connecting'
    ) {
      console.log('[DydxWalletConnect] Auto-connecting to dYdX');
      setIsConnecting(true);
      setConnectionError(null);

      dydxWalletService
        .connect(network, 0)
        .then(() => {
          console.log('[DydxWalletConnect] Auto-connect successful');
          setIsConnecting(false);
        })
        .catch(err => {
          console.error('[DydxWalletConnect] Auto-connect failed:', err);
          // Ignore "already in progress" errors as they mean we are safe
          if (err.message !== 'Connection already in progress') {
            setConnectionError(err.message);
          }
          setIsConnecting(false);
        });
    }
  }, [hasDydxAddress, isConnected, isConnecting, connectionError, network]);

  useEffect(() => {
    if (!hasDydxAddress && isConnected) {
      console.log('[DydxWalletConnect] Wallet disconnected, cleaning up');
      dydxWalletService.disconnect();
      setConnectionError(null);
    }
  }, [hasDydxAddress, isConnected]);

  const handleDeriveDydx = useCallback(async () => {
    setIsDeriving(true);
    setConnectionError(null);

    try {
      await deriveDydx();
      console.log('[DydxWalletConnect] dYdX derivation successful');
    } catch (err: any) {
      console.error('[DydxWalletConnect] dYdX derivation failed:', err);
      setConnectionError(err.message);
    } finally {
      setIsDeriving(false);
    }
  }, [deriveDydx]);

  const handleConnect = useCallback(async () => {
    if (!hasEvmWallet) {
      openModal();
      return;
    }

    if (needsDydxDerivation) {
      await handleDeriveDydx();
      return;
    }

    setIsConnecting(true);
    setConnectionError(null);

    try {
      await dydxWalletService.connect(network, 0);
      console.log('[DydxWalletConnect] Manual connect successful');
    } catch (err: any) {
      console.error('[DydxWalletConnect] Manual connect failed:', err);
      setConnectionError(err.message);
    } finally {
      setIsConnecting(false);
    }
  }, [hasEvmWallet, needsDydxDerivation, network, openModal, handleDeriveDydx]);

  const handleRetry = useCallback(() => {
    setConnectionError(null);
    handleConnect();
  }, [handleConnect]);

  const marginMetrics = useMemo(() => {
    return calculateCurrentMargin(balance);
  }, [balance]);

  const usageColors = useMemo(() => {
    return getMarginUsageColors(marginMetrics.marginUsagePercent);
  }, [marginMetrics.marginUsagePercent]);

  const timeAgo = useMemo(() => {
    return formatTimeAgo(lastUpdateTime);
  }, [lastUpdateTime]);

  if (connectionError || error) {
    return (
      <div className="p-4 border-b border-gray-800">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs text-red-400">Connection Error</p>
            <p className="text-sm text-gray-400 mt-1">{connectionError || error}</p>
          </div>
        </div>
        <button
          onClick={handleRetry}
          disabled={isConnecting || isDeriving}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded text-sm font-medium transition disabled:opacity-50"
        >
          {isConnecting || isDeriving ? 'Processing...' : 'Retry Connection'}
        </button>
      </div>
    );
  }

  if (!hasEvmWallet) {
    return (
      <div className="p-4 border-b border-gray-800">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs text-gray-500">dYdX Trading Account</p>
            <p className="text-sm text-gray-400">Connect wallet to start</p>
          </div>
          <span className="px-2 py-1 rounded text-xs font-medium bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
            Setup Required
          </span>
        </div>
        <button
          onClick={openModal}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded text-sm transition"
        >
          Connect Wallet
        </button>
      </div>
    );
  }

  if (needsDydxDerivation) {
    return (
      <div className="p-4 border-b border-gray-800">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs text-gray-500">dYdX Trading Account</p>
            <p className="text-sm text-gray-400">Sign message to create account</p>
          </div>
          <span className="px-2 py-1 rounded text-xs font-medium bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
            Derivation Required
          </span>
        </div>
        <div className="bg-blue-500/10 border border-blue-500/20 rounded p-3 mb-3">
          <p className="text-xs text-blue-300">
            Sign a message with your wallet to derive your dYdX trading account
          </p>
        </div>
        <button
          onClick={handleDeriveDydx}
          disabled={isDeriving}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded text-sm transition disabled:opacity-50"
        >
          {isDeriving ? 'Deriving...' : 'Derive dYdX Account'}
        </button>
      </div>
    );
  }

  if (isConnecting || (!isConnected && hasDydxAddress)) {
    return (
      <div className="p-4 border-b border-gray-800">
        <div className="flex items-center justify-center py-4">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-600 border-t-blue-500" />
        </div>
        <p className="text-center text-sm text-gray-400 mt-2">Connecting to dYdX...</p>
      </div>
    );
  }

  // Show loading state while balance is being fetched initially
  if (loadingBalance && !balance) {
    return (
      <div className="p-4 border-b border-gray-800">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs text-gray-500">dYdX Trading Account</p>
            <p className="text-sm font-mono text-gray-400">
              {address ? `${address.slice(0, 12)}...${address.slice(-8)}` : '...'}
            </p>
          </div>
          <span className="px-2 py-1 rounded text-xs font-medium bg-blue-500/20 text-blue-400 border border-blue-500/30">
            Loading...
          </span>
        </div>
        <div className="flex items-center justify-center py-4">
          <div className="animate-spin rounded-full h-6 w-6 border-2 border-gray-600 border-t-blue-500" />
        </div>
        <p className="text-center text-sm text-gray-400">Fetching account balance...</p>
      </div>
    );
  }

  // Only show "No Funds" if we've actually loaded the balance and it's zero
  const hasZeroBalance =
    balance && Number(balance.equity) === 0 && Number(balance.freeCollateral) === 0;

  if (!balance || hasZeroBalance) {
    return (
      <div className="p-4 border-b border-gray-800">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs text-gray-500">dYdX Trading Account</p>
            <p className="text-sm font-mono text-gray-400">
              {address ? `${address.slice(0, 12)}...${address.slice(-8)}` : '...'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={refresh}
              disabled={loadingBalance}
              className="p-1 rounded hover:bg-gray-700 transition-colors disabled:opacity-50"
              title="Refresh balance"
            >
              <svg
                className={`w-4 h-4 text-gray-400 ${loadingBalance ? 'animate-spin' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            </button>
            <span className="px-2 py-1 rounded text-xs font-medium bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
              No Funds
            </span>
          </div>
        </div>
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded p-3 mb-3">
          <p className="text-xs text-yellow-300">Deposit USDC to start trading on dYdX Chain</p>
        </div>
        <a
          href="https://trade.dydx.exchange/portfolio/deposit"
          target="_blank"
          rel="noopener noreferrer"
          className="block text-center bg-blue-600 hover:bg-blue-700 text-white py-2 rounded text-sm font-medium transition"
        >
          Deposit Funds
        </a>
      </div>
    );
  }

  return (
    <div className="bg-[#1a1a2e] rounded-lg p-4">
      {/* Real-time status indicator */}
      <div className="flex items-center justify-between mb-3 pb-3 border-b border-gray-700/50">
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${isReceivingUpdates ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`}
          />
          <span className="text-xs text-gray-400">
            {isReceivingUpdates ? 'Live Updates' : 'Connecting...'}
          </span>
        </div>
        <button
          onClick={refresh}
          disabled={loadingBalance}
          className="text-xs text-gray-400 hover:text-blue-400 transition disabled:opacity-50"
          title="Refresh balance"
        >
          {loadingBalance ? '...' : `Updated ${timeAgo}`}
        </button>
      </div>

      {loadingBalance ? (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-2 border-gray-600 border-t-blue-500" />
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-gray-400 text-xs">Portfolio Value</span>
            <span className="text-white text-sm font-medium">
              ${formatCurrency(marginMetrics.portfolioValue)}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-400 text-xs">Available Balance</span>
            <span className="text-emerald-400 text-sm font-medium">
              ${formatCurrency(marginMetrics.availableBalance)}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-400 text-xs">Margin Used</span>
            <div className="flex items-center gap-2">
              <div className="relative w-5 h-5">
                <svg className="w-5 h-5 transform -rotate-90" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" stroke="#374151" strokeWidth="3" fill="none" />
                  <circle
                    cx="12"
                    cy="12"
                    r="10"
                    stroke={
                      marginMetrics.marginUsagePercent > 85
                        ? '#ef4444'
                        : marginMetrics.marginUsagePercent > 70
                          ? '#f97316'
                          : marginMetrics.marginUsagePercent > 50
                            ? '#eab308'
                            : '#10b981'
                    }
                    strokeWidth="3"
                    fill="none"
                    strokeDasharray={`${2 * Math.PI * 10}`}
                    strokeDashoffset={`${2 * Math.PI * 10 * (1 - marginMetrics.marginUsagePercent / 100)}`}
                    strokeLinecap="round"
                  />
                </svg>
              </div>
              <span className={`text-sm font-semibold ${usageColors.text}`}>
                {formatPercent(marginMetrics.marginUsagePercent)}%
              </span>
            </div>
          </div>

          {marginMetrics.marginUsagePercent > 70 && (
            <div
              className={`rounded p-2 text-xs ${
                marginMetrics.marginUsagePercent > 85
                  ? 'bg-red-500/10 border border-red-500/20 text-red-400'
                  : 'bg-orange-500/10 border border-orange-500/20 text-orange-400'
              }`}
            >
              {marginMetrics.marginUsagePercent > 85 ? 'Critical' : 'High'} margin usage - consider
              closing positions or adding collateral
            </div>
          )}

          <div className="pt-2 border-t border-gray-700/50 space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-gray-500 text-xs">Trading Rewards</span>
              <span className="text-gray-300 text-xs">
                ${formatCurrency(Number(balance.totalTradingRewards || 0))}
              </span>
            </div>
          </div>

          <a
            href="https://trade.dydx.exchange/portfolio/deposit"
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full bg-[#5865f2] hover:bg-[#4752c4] text-white text-center font-medium py-3 rounded-lg transition-colors mt-4"
          >
            Deposit
          </a>
        </div>
      )}
    </div>
  );
};
