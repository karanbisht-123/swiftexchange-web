import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { useWalletStore } from '../../walletconnect/store/walletConnectStore';
import { useDydxWallet } from '../hooks/useDydxWallet';
import { dydxWalletService } from '../service/dydxWalletService';

const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

const formatPercent = (value: number): string => {
  return value.toFixed(2);
};

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

const calculateMarginUsage = (equity: string, freeCollateral: string) => {
  const equityNum = Number(equity);
  const freeCollateralNum = Number(freeCollateral);
  const usedMargin = equityNum - freeCollateralNum;
  const marginUsagePercent = equityNum > 0 ? (usedMargin / equityNum) * 100 : 0;

  return {
    portfolioValue: equityNum,
    availableBalance: freeCollateralNum,
    marginUsagePercent,
  };
};

const Shimmer: React.FC = () => (
  <div className="animate-pulse">
    <div className="h-4 bg-gray-700/50 rounded w-24 mb-2" />
    <div className="h-5 bg-gray-700/50 rounded w-32" />
  </div>
);

export const DydxWalletConnect: React.FC = () => {
  const network = useWalletStore(state => state.network);
  const openModal = useWalletStore(state => state.openModal);
  const deriveDydx = useWalletStore(state => state.deriveDydx);
  const evmWallet = useWalletStore(state => state.connectedWallets.evm);
  const cosmosWallet = useWalletStore(state => state.connectedWallets.cosmos);

  const hasDydxAddress = useMemo(() => {
    return !!(evmWallet?.dydxAddress || cosmosWallet?.dydxAddress);
  }, [evmWallet, cosmosWallet]);

  const hasEvmWallet = useMemo(() => !!evmWallet, [evmWallet]);

  const needsDydxDerivation = useMemo(() => {
    return hasEvmWallet && !evmWallet?.dydxAddress;
  }, [hasEvmWallet, evmWallet]);

  const [isConnecting, setIsConnecting] = useState(false);
  const [isDeriving, setIsDeriving] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [hasAttemptedLoad, setHasAttemptedLoad] = useState(false);

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

  useEffect(() => {
    if (isConnected && !balance && !loadingBalance && !hasAttemptedLoad) {
      setHasAttemptedLoad(true);
      refresh().catch(err => console.error('[DydxWalletConnect] Auto-refresh failed:', err));
    }
  }, [isConnected, balance, loadingBalance, hasAttemptedLoad, refresh]);

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
      setIsConnecting(true);
      setConnectionError(null);

      dydxWalletService
        .connect(network, 0)
        .then(() => setIsConnecting(false))
        .catch(err => {
          if (err.message !== 'Connection already in progress') {
            setConnectionError(err.message);
          }
          setIsConnecting(false);
        });
    }
  }, [hasDydxAddress, isConnected, isConnecting, connectionError, network]);

  useEffect(() => {
    if (!hasDydxAddress && isConnected) {
      dydxWalletService.disconnect();
      setConnectionError(null);
    }
  }, [hasDydxAddress, isConnected]);

  const handleDeriveDydx = useCallback(async () => {
    setIsDeriving(true);
    setConnectionError(null);

    try {
      await deriveDydx();
    } catch (err: any) {
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
    } catch (err: any) {
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
    if (!balance) return null;
    return calculateMarginUsage(balance.equity, balance.freeCollateral);
  }, [balance]);

  const timeAgo = useMemo(() => formatTimeAgo(lastUpdateTime), [lastUpdateTime]);

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

      {loadingBalance && !marginMetrics ? (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-gray-400 text-xs">Portfolio Value</span>
            <Shimmer />
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-400 text-xs">Available Balance</span>
            <Shimmer />
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-400 text-xs">Margin Used</span>
            <Shimmer />
          </div>
        </div>
      ) : marginMetrics ? (
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
              <span
                className={`text-sm font-semibold ${
                  marginMetrics.marginUsagePercent > 85
                    ? 'text-red-400'
                    : marginMetrics.marginUsagePercent > 70
                      ? 'text-orange-400'
                      : marginMetrics.marginUsagePercent > 50
                        ? 'text-yellow-400'
                        : 'text-emerald-400'
                }`}
              >
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

          <a
            href="https://trade.dydx.exchange/portfolio/deposit"
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full bg-[#5865f2] hover:bg-[#4752c4] text-white text-center font-medium py-3 rounded-lg transition-colors mt-4"
          >
            Deposit
          </a>
        </div>
      ) : null}
    </div>
  );
};
