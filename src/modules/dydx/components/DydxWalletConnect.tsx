import React, { useEffect, useMemo } from 'react';

import { WalletType } from '../../walletconnect/constants/Wallet';
import { useWalletConnect } from '../../walletconnect/hooks/useWalletConnect';
import { useDydxWallet } from '../hooks/useDydxWallet';
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
  const { connectedWallets, openModal } = useWalletConnect();
  const {
    isConnected,
    isConnecting,
    address,
    hasSubaccount,
    balance,
    loadingBalance,
    error,
    isLoading,
    connect,
    refresh,
    lastUpdateTime,
    isReceivingUpdates,
  } = useDydxWallet(true);

  const cosmosWallet = connectedWallets[WalletType.COSMOS];

  useEffect(() => {
    if (isConnected && hasSubaccount && !balance && !loadingBalance) {
      refresh();
    }
  }, [isConnected, hasSubaccount, balance, loadingBalance, refresh]);

  const marginMetrics = useMemo(() => {
    return calculateCurrentMargin(balance);
  }, [balance]);

  const usageColors = useMemo(() => {
    return getMarginUsageColors(marginMetrics.marginUsagePercent);
  }, [marginMetrics.marginUsagePercent]);

  const timeAgo = useMemo(() => {
    return formatTimeAgo(lastUpdateTime);
  }, [lastUpdateTime]);

  if (!cosmosWallet) {
    return (
      <div className="rounded-lg p-6 border border-gray-800">
        <h3 className="text-lg font-semibold text-white mb-2">dYdX Trading Account</h3>
        <p className="text-sm text-gray-400 mb-4">
          Connect your Cosmos wallet (Keplr, Leap, etc.) to start trading on dYdX v4
        </p>
        <button
          onClick={openModal}
          className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-medium py-3 rounded-lg transition"
        >
          Connect Cosmos Wallet
        </button>
      </div>
    );
  }

  if (isConnecting || isLoading) {
    return (
      <div className="p-4 border-b border-gray-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="animate-spin rounded-full h-5 w-5 border-2 border-gray-600 border-t-blue-500" />
            <div>
              <p className="text-xs text-gray-500">dYdX Trading Account</p>
              <p className="text-sm text-gray-400">Connecting...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 border-b border-gray-800">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs text-red-400">Connection Error</p>
            <p className="text-sm text-gray-400 mt-1">{error}</p>
          </div>
        </div>
        <button
          onClick={() => connect(0)}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded text-sm font-medium transition"
        >
          Retry Connection
        </button>
      </div>
    );
  }

  if (isConnected && !hasSubaccount) {
    return (
      <div className="p-4 border-b border-gray-800">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs text-gray-500">dYdX Trading Account</p>
            <p className="text-sm font-mono text-gray-400">
              {address ? `${address.slice(0, 12)}...${address.slice(-8)}` : '...'}
            </p>
          </div>
          <span className="px-2 py-1 rounded text-xs font-medium bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
            No Funds
          </span>
        </div>
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded p-3 mb-3">
          <p className="text-xs text-yellow-300">Deposit USDC to activate trading on dYdX Chain</p>
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

  if (isConnected && hasSubaccount && balance) {
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
            {/* Portfolio Value */}
            <div className="flex justify-between items-center">
              <span className="text-gray-400 text-xs">Portfolio Value</span>
              <span className="text-white text-sm font-medium">
                ${formatCurrency(marginMetrics.portfolioValue)}
              </span>
            </div>

            {/* Available Balance */}
            <div className="flex justify-between items-center">
              <span className="text-gray-400 text-xs">Available Balance</span>
              <span className="text-emerald-400 text-sm font-medium">
                ${formatCurrency(marginMetrics.availableBalance)}
              </span>
            </div>

            {/* Margin Usage with circular progress */}
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

            {/* Warning if margin is high */}
            {marginMetrics.marginUsagePercent > 70 && (
              <div
                className={`rounded p-2 text-xs ${
                  marginMetrics.marginUsagePercent > 85
                    ? 'bg-red-500/10 border border-red-500/20 text-red-400'
                    : 'bg-orange-500/10 border border-orange-500/20 text-orange-400'
                }`}
              >
                ⚠️ {marginMetrics.marginUsagePercent > 85 ? 'Critical' : 'High'} margin usage -
                consider closing positions or adding collateral
              </div>
            )}

            {/* Detailed metrics */}
            <div className="pt-2 border-t border-gray-700/50 space-y-2">
              {/* <div className="flex justify-between items-center">
                <span className="text-gray-500 text-xs">Used Margin</span>
                <span className="text-gray-300 text-xs">
                  ${formatCurrency(Number(balance.marginUsage || 0))}
                </span>
              </div> */}
              <div className="flex justify-between items-center">
                <span className="text-gray-500 text-xs">Trading Rewards</span>
                <span className="text-gray-300 text-xs">
                  ${formatCurrency(Number(balance.totalTradingRewards || 0))}
                </span>
              </div>
            </div>

            {/* Deposit button */}
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
  }

  return (
    <div className="p-4 border-b border-gray-800">
      <button
        onClick={() => connect(0)}
        disabled={!cosmosWallet}
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium py-2.5 rounded text-sm transition"
      >
        {cosmosWallet ? 'Connect to dYdX' : 'Waiting for wallet...'}
      </button>
    </div>
  );
};
