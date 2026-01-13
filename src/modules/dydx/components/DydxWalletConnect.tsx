import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, AlertCircle, ArrowUpDown } from 'lucide-react';

import { useWalletStore } from '../../walletconnect/store/walletConnectStore';
import { useDydxWallet } from '../hooks/useDydxWallet';
import { dydxWalletService } from '../service/dydxWalletService';
import { SubaccountTransfer } from './SubaccountTransfer';

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
    <div className="h-4 bg-tertiary rounded w-24 mb-2" />
    <div className="h-5 bg-tertiary rounded w-32" />
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
  const [showTransferModal, setShowTransferModal] = useState(false);

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
      <div className="bg-secondary rounded-lg lg:rounded-none p-3 sm:p-4 border border-color">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs text-danger">Connection Error</p>
            <p className="text-xs text-muted mt-1">{connectionError || error}</p>
          </div>
        </div>
        <button
          onClick={handleRetry}
          disabled={isConnecting || isDeriving}
          className="w-full py-2 rounded text-sm font-medium transition disabled:opacity-50"
          style={{
            backgroundColor: 'var(--color-brand-accent)',
            color: 'var(--color-text-inverse)'
          }}
        >
          {isConnecting || isDeriving ? 'Processing...' : 'Retry Connection'}
        </button>
      </div>
    );
  }

  if (!hasEvmWallet) {
    return (
      <div className="bg-secondary rounded-lg lg:rounded-none p-3 sm:p-4 border border-color">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs text-muted">dYdX Trading Account</p>
            <p className="text-xs text-secondary">Connect wallet to start</p>
          </div>
          <span className="px-2 py-1 rounded text-xs font-medium bg-warning text-white">
            Setup Required
          </span>
        </div>
        <button
          onClick={openModal}
          className="w-full font-medium py-2 rounded text-sm transition"
          style={{
            backgroundColor: 'var(--color-brand-accent)',
            color: 'var(--color-text-inverse)'
          }}
        >
          Connect Wallet
        </button>
      </div>
    );
  }

  if (needsDydxDerivation) {
    return (
      <div className="bg-secondary rounded-lg lg:rounded-none p-3 sm:p-4 border border-color">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs text-muted">dYdX Trading Account</p>
            <p className="text-xs text-secondary">Sign message to create account</p>
          </div>
          <span className="px-2 py-1 rounded text-xs font-medium bg-warning text-white">
            Derivation Required
          </span>
        </div>
        <div className="bg-info-bg border border-color rounded p-2 mb-3">
          <p className="text-xs text-info">
            Sign a message with your wallet to derive your dYdX trading account
          </p>
        </div>
        <button
          onClick={handleDeriveDydx}
          disabled={isDeriving}
          className="w-full font-medium py-2 rounded text-sm transition disabled:opacity-50"
          style={{
            backgroundColor: 'var(--color-brand-accent)',
            color: 'var(--color-text-inverse)'
          }}
        >
          {isDeriving ? 'Deriving...' : 'Derive dYdX Account'}
        </button>
      </div>
    );
  }

  if (isConnecting || (!isConnected && hasDydxAddress)) {
    return (
      <div className="bg-secondary rounded-lg p-3 sm:p-4 border border-color">
        <div className="flex items-center justify-center py-4">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-tertiary border-t-brand" />
        </div>
        <p className="text-center text-sm text-muted mt-2">Connecting to dYdX...</p>
      </div>
    );
  }

  const hasZeroBalance =
    balance && Number(balance.equity) === 0 && Number(balance.freeCollateral) === 0;

  if (!balance || hasZeroBalance) {
    return (
      <div className="bg-secondary rounded-lg p-3 sm:p-4 border border-color">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs text-muted">dYdX Trading Account</p>
            <p className="text-xs font-mono text-secondary">
              {address ? `${address.slice(0, 12)}...${address.slice(-8)}` : '...'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={refresh}
              disabled={loadingBalance}
              className="p-1 rounded hover:bg-hover transition-colors disabled:opacity-50"
              title="Refresh balance"
            >
              <RefreshCw
                className={`w-4 h-4 text-muted ${loadingBalance ? 'animate-spin' : ''}`}
              />
            </button>
            <span className="px-2 py-1 rounded text-xs font-medium bg-warning text-white">
              No Funds
            </span>
          </div>
        </div>
        <div className="bg-warning-bg border border-color rounded p-2 mb-3">
          <p className="text-xs text-warning">Deposit USDC to start trading on dYdX Chain</p>
        </div>
        <a
          href="https://trade.dydx.exchange/portfolio/deposit"
          target="_blank"
          rel="noopener noreferrer"
          className="block text-center py-2 rounded text-sm font-medium transition"
          style={{
            backgroundColor: 'var(--color-brand-accent)',
            color: 'var(--color-text-inverse)'
          }}
        >
          Deposit Funds
        </a>
      </div>
    );
  }

  return (
    <div className="bg-secondary lg:rounded-none rounded-lg p-3 sm:p-4 ">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-color">
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${isReceivingUpdates ? 'bg-success animate-pulse' : 'bg-muted'}`}
          />
          <span className="text-xs text-muted">
            {isReceivingUpdates ? 'Live' : 'Connecting...'}
          </span>
        </div>
        <button
          onClick={refresh}
          disabled={loadingBalance}
          className="text-xs text-muted hover:text-brand transition disabled:opacity-50 flex items-center gap-1"
          title="Refresh balance"
        >
          <RefreshCw className={`w-3 h-3 ${loadingBalance ? 'animate-spin' : ''}`} />
          {loadingBalance ? '...' : `${timeAgo}`}
        </button>
      </div>

      {/* Loading State */}
      {loadingBalance && !marginMetrics ? (
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted">Portfolio Value</span>
            <Shimmer />
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted">Available Balance</span>
            <Shimmer />
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted">Margin Used</span>
            <Shimmer />
          </div>
        </div>
      ) : marginMetrics ? (
        <div className="space-y-3">
          {/* Portfolio Value */}
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted">Portfolio Value</span>
            <span className="text-base font-semibold text-primary">
              ${formatCurrency(marginMetrics.portfolioValue)}
            </span>
          </div>

          {/* Available Balance */}
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted">Available Balance</span>
            <span className="text-sm font-medium text-success">
              ${formatCurrency(marginMetrics.availableBalance)}
            </span>
          </div>

          {/* Margin Usage */}
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted">Margin Used</span>
            <div className="flex items-center gap-2">
              <div className="relative w-6 h-6">
                <svg className="w-6 h-6 transform -rotate-90" viewBox="0 0 24 24">
                  <circle
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="var(--color-bg-tertiary)"
                    strokeWidth="2"
                    fill="none"
                  />
                  <circle
                    cx="12"
                    cy="12"
                    r="10"
                    stroke={
                      marginMetrics.marginUsagePercent > 85
                        ? 'var(--color-danger)'
                        : marginMetrics.marginUsagePercent > 70
                          ? 'var(--color-warning)'
                          : marginMetrics.marginUsagePercent > 50
                            ? 'var(--color-warning)'
                            : 'var(--color-success)'
                    }
                    strokeWidth="2"
                    fill="none"
                    strokeDasharray={`${2 * Math.PI * 10}`}
                    strokeDashoffset={`${2 * Math.PI * 10 * (1 - marginMetrics.marginUsagePercent / 100)}`}
                    strokeLinecap="round"
                  />
                </svg>
              </div>
              <span
                className={`text-sm font-semibold ${marginMetrics.marginUsagePercent > 85
                  ? 'text-danger'
                  : marginMetrics.marginUsagePercent > 70
                    ? 'text-warning'
                    : marginMetrics.marginUsagePercent > 50
                      ? 'text-warning'
                      : 'text-success'
                  }`}
              >
                {formatPercent(marginMetrics.marginUsagePercent)}%
              </span>
            </div>
          </div>

          {/* Warning Message */}
          {marginMetrics.marginUsagePercent > 70 && (
            <div
              className={`rounded p-2 text-xs flex items-start gap-2 ${marginMetrics.marginUsagePercent > 85
                ? 'bg-danger-bg text-danger'
                : 'bg-warning-bg text-warning'
                }`}
            >
              <AlertCircle className="w-3 h-3 flex-shrink-0 mt-0.5" />
              <span>
                {marginMetrics.marginUsagePercent > 85 ? 'Critical' : 'High'} margin usage
              </span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => setShowTransferModal(true)}
              className="flex-1 flex items-center justify-center gap-1.5 text-sm font-medium py-2 rounded-lg transition-colors bg-gray-700 hover:bg-gray-600 text-white"
            >
              <ArrowUpDown className="w-3.5 h-3.5" />
              Transfer
            </button>
            <a
              href="https://trade.dydx.exchange/portfolio/deposit"
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 text-center text-sm font-medium py-2 rounded-lg transition-colors"
              style={{
                backgroundColor: 'var(--color-brand-accent)',
                color: 'var(--color-text-inverse)'
              }}
            >
              Deposit
            </a>
          </div>
        </div>
      ) : null}

      {/* Transfer Modal */}
      <SubaccountTransfer
        isOpen={showTransferModal}
        onClose={() => setShowTransferModal(false)}
      />
    </div>
  );
};