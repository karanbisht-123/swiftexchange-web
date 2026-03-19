import { AlertCircle, ArrowUpRight, RefreshCw } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { useWalletStore } from '../../walletconnect/store/walletConnectStore';
import { useDydxWallet } from '../hooks/useDydxWallet';
import { dydxWalletService } from '../service/dydxWalletService';
import useOrderPreviewStore from '../store/orderPreviewStore';
import { DydxDepositModal } from './DydxDepositModal';
import { DydxWithdrawModal } from './DydxWithdrawModal';
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
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [showDepositModal, setShowDepositModal] = useState(false);

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

  const pendingMarginRequired = useOrderPreviewStore(s => s.pendingMarginRequired);

  const projectedMarginUsagePercent = useMemo(() => {
    if (!balance || pendingMarginRequired <= 0) return null;
    const equity = Number(balance.equity);
    const freeCollateral = Number(balance.freeCollateral);
    if (equity <= 0) return null;
    const currentMarginUsed = equity - freeCollateral;
    const projectedMarginUsed = currentMarginUsed + pendingMarginRequired;
    const pct = Math.min((projectedMarginUsed / equity) * 100, 100);
    return Math.max(0, pct);
  }, [balance, pendingMarginRequired]);

  const timeAgo = useMemo(() => formatTimeAgo(lastUpdateTime), [lastUpdateTime]);

  const isSubaccountNotFound =
    error?.toLowerCase().includes('404') || error?.toLowerCase().includes('subaccount');

  const hasZeroBalance =
    balance && Number(balance.equity) === 0 && Number(balance.freeCollateral) === 0;

  // Single shared "no funds" UI used for both subaccount-not-found and zero balance
  const showNoFunds = isSubaccountNotFound || !balance || hasZeroBalance;

  if (showNoFunds && !connectionError && !!hasEvmWallet && !needsDydxDerivation && !isConnecting) {
    return (
      <>
        <div className="bg-secondary p-3 border border-color">
          <div className="mb-2">
            <p className="text-xs text-muted">dYdX Trading Account</p>
            <p className="text-xs font-mono text-secondary">
              {address ? `${address.slice(0, 12)}...${address.slice(-8)}` : '...'}
            </p>
          </div>

          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted leading-relaxed min-w-0">
              Add funds to start trading on dYdX
            </p>
            <button
              onClick={() => setShowDepositModal(true)}
              className="text-xs font-medium py-1.5 px-3 rounded flex-shrink-0 transition-colors"
              style={{
                backgroundColor: 'var(--color-brand-accent)',
                color: 'var(--color-text-inverse)',
              }}
            >
              Add Funds
            </button>
          </div>
        </div>

        <DydxDepositModal isOpen={showDepositModal} onClose={() => setShowDepositModal(false)} />
      </>
    );
  }

  if (connectionError || (error && !isSubaccountNotFound)) {
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
            color: 'var(--color-text-inverse)',
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
            color: 'var(--color-text-inverse)',
          }}
        >
          Connect Wallet
        </button>
      </div>
    );
  }

  if (needsDydxDerivation) {
    return (
      <div className="bg-secondary p-3 sm:p-4 border border-color">
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
            color: 'var(--color-text-inverse)',
          }}
        >
          {isDeriving ? 'Deriving...' : 'Derive dYdX Account'}
        </button>
      </div>
    );
  }

  if (isConnecting || (!isConnected && hasDydxAddress)) {
    return (
      <div className="bg-secondary p-3 sm:p-4 border border-color">
        <div className="flex items-center justify-center py-4">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-tertiary border-t-brand" />
        </div>
        <p className="text-center text-sm text-muted mt-2">Connecting to dYdX...</p>
      </div>
    );
  }

  return (
    <div className="bg-secondary border-b border-color lg:rounded-none p-3 sm:p-4">
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

          {/* Margin Used */}
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
                      (projectedMarginUsagePercent ?? marginMetrics.marginUsagePercent) > 85
                        ? 'var(--color-danger)'
                        : (projectedMarginUsagePercent ?? marginMetrics.marginUsagePercent) > 50
                          ? 'var(--color-warning)'
                          : 'var(--color-success)'
                    }
                    strokeWidth="2"
                    fill="none"
                    strokeDasharray={`${2 * Math.PI * 10}`}
                    strokeDashoffset={`${2 * Math.PI * 10 * (1 - (projectedMarginUsagePercent ?? marginMetrics.marginUsagePercent) / 100)}`}
                    strokeLinecap="round"
                  />
                </svg>
              </div>
              <span
                className={`text-sm font-semibold ${
                  (projectedMarginUsagePercent ?? marginMetrics.marginUsagePercent) > 85
                    ? 'text-danger'
                    : (projectedMarginUsagePercent ?? marginMetrics.marginUsagePercent) > 70
                      ? 'text-warning'
                      : 'text-success'
                }`}
              >
                {projectedMarginUsagePercent !== null &&
                projectedMarginUsagePercent !== undefined ? (
                  <>
                    <span className="text-muted">
                      {formatPercent(marginMetrics.marginUsagePercent)}%
                    </span>
                    {' → '}
                    {formatPercent(projectedMarginUsagePercent)}%
                  </>
                ) : (
                  <>{formatPercent(marginMetrics.marginUsagePercent)}%</>
                )}
              </span>
            </div>
          </div>

          {/* Warning Message */}
          {marginMetrics.marginUsagePercent > 70 && (
            <div
              className={`rounded p-2 text-xs flex items-start gap-2 ${
                marginMetrics.marginUsagePercent > 85
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
              onClick={() => setShowDepositModal(true)}
              className="flex-1 text-center text-sm font-medium py-2 rounded transition-colors"
              style={{
                backgroundColor: 'var(--color-brand-accent)',
                color: 'var(--color-text-inverse)',
              }}
            >
              Deposit
            </button>
            <button
              onClick={() => setShowWithdrawModal(true)}
              className="px-3 rounded py-2 transition-colors flex items-center justify-center"
              style={{
                backgroundColor: 'var(--color-bg-tertiary)',
                color: 'var(--color-text-secondary)',
                border: '1px solid var(--color-border)',
              }}
            >
              <ArrowUpRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : null}

      <SubaccountTransfer isOpen={showTransferModal} onClose={() => setShowTransferModal(false)} />

      <DydxWithdrawModal isOpen={showWithdrawModal} onClose={() => setShowWithdrawModal(false)} />

      <DydxDepositModal isOpen={showDepositModal} onClose={() => setShowDepositModal(false)} />
    </div>
  );
};
