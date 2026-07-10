import { AlertCircle, ArrowUpRight } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { Notification } from '../../../components/common/Notification';
import { Tooltip } from '../../../components/common/Tooltip';
import { useWalletStore } from '../../walletconnect/store/walletConnectStore';
import { useDydxDeposit } from '../hooks/useDydxDeposit';
import { useDydxWallet } from '../hooks/useDydxWallet';
import { dydxWalletService } from '../service/dydxWalletService';
import useOrderPreviewStore from '../store/orderPreviewStore';
import { selectPortfolioMetrics, useWebSocketStore } from '../store/websocketStore';
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

const Shimmer: React.FC = () => (
  <div className="animate-pulse">
    <div className="h-4 bg-tertiary rounded w-20 mb-2" />
  </div>
);

export const DydxWalletConnect: React.FC = () => {
  const network = useWalletStore(state => state.network);
  const openModal = useWalletStore(state => state.openModal);
  const deriveDydx = useWalletStore(state => state.deriveDydx);
  const evmWallet = useWalletStore(state => state.connectedWallets.evm);
  const cosmosWallet = useWalletStore(state => state.connectedWallets.cosmos);

  const hasDydxAddress = useMemo(
    () => !!(evmWallet?.dydxAddress || cosmosWallet?.dydxAddress),
    [evmWallet, cosmosWallet]
  );
  const hasEvmWallet = useMemo(() => !!evmWallet, [evmWallet]);
  const needsDydxDerivation = useMemo(
    () => hasEvmWallet && !evmWallet?.dydxAddress,
    [hasEvmWallet, evmWallet]
  );

  const [isConnecting, setIsConnecting] = useState(false);
  const [isDeriving, setIsDeriving] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);
  const [lastAttemptedQuantums, setLastAttemptedQuantums] = useState<string | null>(null);
  const [stableNoFunds, setStableNoFunds] = useState(
    () => dydxWalletService.getStatus() === 'no_subaccount'
  );
  const noFundsTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const { isConnected, address, balance, dataLoaded, error } = useDydxWallet();
  const {
    checkPendingDeposit,
    pendingDydxQuantums,
    notification,
    clearNotification,
    MIN_SUBACCOUNT_DEPOSIT_UUSDC,
  } = useDydxDeposit();

  useEffect(() => {
    if (isConnected && address) {
      checkPendingDeposit();
      const interval = setInterval(checkPendingDeposit, 15000);
      return () => clearInterval(interval);
    }
  }, [isConnected, address, checkPendingDeposit]);

  useEffect(() => {
    if (pendingDydxQuantums && !isRecovering && pendingDydxQuantums !== lastAttemptedQuantums) {
      if (parseInt(pendingDydxQuantums) >= MIN_SUBACCOUNT_DEPOSIT_UUSDC) {
        setIsRecovering(true);
        setLastAttemptedQuantums(pendingDydxQuantums);
        checkPendingDeposit();
      }
    }
  }, [
    pendingDydxQuantums,
    isRecovering,
    lastAttemptedQuantums,
    checkPendingDeposit,
    MIN_SUBACCOUNT_DEPOSIT_UUSDC,
  ]);

  useEffect(() => {
    if (
      hasDydxAddress &&
      !isConnecting &&
      !connectionError &&
      dydxWalletService.getStatus() !== 'connecting' &&
      dydxWalletService.getStatus() !== 'connected' &&
      dydxWalletService.getStatus() !== 'no_subaccount'
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
  }, [hasDydxAddress, network, isConnecting, connectionError]);

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
    } catch (err: unknown) {
      const e = err instanceof Error ? err : new Error(String(err));
      setConnectionError(e.message);
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
    } catch (err: unknown) {
      const e = err instanceof Error ? err : new Error(String(err));
      setConnectionError(e.message);
    } finally {
      setIsConnecting(false);
    }
  }, [hasEvmWallet, needsDydxDerivation, network, openModal, handleDeriveDydx]);

  const handleRetry = useCallback(() => {
    setConnectionError(null);
    handleConnect();
  }, [handleConnect]);

  const optimisticDelta = useWebSocketStore(s => s.optimisticFreeCollateralDelta);
  // Subscribe to live market data so selectPortfolioMetrics can compute real
  // per-market IMF margin usage instead of falling back to a hardcoded value.
  const marketsMap = useWebSocketStore(s => s.markets);
  const parentKey = address ? `parent_subaccount_${address}_0` : null;
  const parentData = useWebSocketStore(
    useCallback(s => (parentKey ? s.parentSubaccounts.get(parentKey) : undefined), [parentKey])
  );

  // const activeSubaccountNumber = useMemo(() => {
  //   if (!parentData?.childSubaccounts) return 0;
  //   for (const child of parentData.childSubaccounts) {
  //     if (Object.keys(child.openPerpetualPositions || {}).length > 0) {
  //       return child.subaccountNumber;
  //     }
  //   }
  //   return 0;
  // }, [parentData?.childSubaccounts]);

  // Collect leverages from localStorage for all active positions to ensure the
  // Portfolio summary margin matches the Positions table margin.
  const leveragesMap = useMemo(() => {
    const map: Record<string, number> = {};
    if (!parentData?.childSubaccounts) return map;

    parentData.childSubaccounts.forEach(child => {
      const positions = Object.keys(child.openPerpetualPositions || {});
      positions.forEach(ticker => {
        const marketKey = `dydx_leverage_${ticker}`;
        const saved = localStorage.getItem(marketKey) ?? localStorage.getItem('dydx_leverage');
        const parsed = saved ? parseFloat(saved) : 5.0;
        if (!isNaN(parsed) && parsed > 0) map[ticker] = parsed;
      });
    });
    return map;
  }, [parentData]);

  // const activeSubaccountNumber = 0;

  const marginMetrics = useMemo(
    () => selectPortfolioMetrics(parentData, optimisticDelta, marketsMap, leveragesMap),
    [parentData, optimisticDelta, marketsMap, leveragesMap]
  );

  const pendingMarginRequired = useOrderPreviewStore(s => s.pendingMarginRequired);

  const projectedMarginUsagePercent = useMemo(() => {
    if (!marginMetrics || pendingMarginRequired <= 0) return null;
    const { crossEquity, marginUsagePercent } = marginMetrics;
    if (crossEquity <= 0) return null;
    const currentMarginUsed = (marginUsagePercent / 100) * crossEquity;
    const projectedMarginUsed = currentMarginUsed + pendingMarginRequired;
    return Math.max(0, Math.min((projectedMarginUsed / crossEquity) * 100, 100));
  }, [marginMetrics, pendingMarginRequired]);

  const projectedAvailableBalance = useMemo(() => {
    if (!marginMetrics || pendingMarginRequired <= 0) return null;
    return Math.max(0, marginMetrics.availableBalance - pendingMarginRequired);
  }, [marginMetrics, pendingMarginRequired]);

  const isSubaccountNotFound =
    error?.toLowerCase().includes('404') || error?.toLowerCase().includes('subaccount');

  const hasZeroBalance =
    balance !== null && Number(balance.totalEquity) === 0 && Number(balance.crossEquity) === 0;

  const noFundsCandidate =
    !connectionError &&
    !!hasEvmWallet &&
    !needsDydxDerivation &&
    !isConnecting &&
    (dydxWalletService.getStatus() === 'no_subaccount' ||
      (dataLoaded && (isSubaccountNotFound || hasZeroBalance)));

  useEffect(() => {
    if (noFundsCandidate) {
      if (dydxWalletService.getStatus() === 'no_subaccount') {
        setStableNoFunds(true);
        return;
      }
      if (noFundsTimerRef.current === null) {
        noFundsTimerRef.current = setTimeout(() => {
          noFundsTimerRef.current = null;
          setStableNoFunds(true);
        }, 3000);
      }
    } else {
      if (noFundsTimerRef.current !== null) {
        clearTimeout(noFundsTimerRef.current);
        noFundsTimerRef.current = null;
      }
      setStableNoFunds(false);
    }
  }, [noFundsCandidate]);

  useEffect(() => {
    return () => {
      if (noFundsTimerRef.current !== null) {
        clearTimeout(noFundsTimerRef.current);
      }
    };
  }, []);

  const showNoFunds = stableNoFunds;

  if (showNoFunds) {
    return (
      <>
        <div className="bg-secondary p-3 border border-color">
          <div className="mb-2">
            <p className="text-xs text-muted">dYdX Trading Account</p>
            <p className="text-xs font-mono text-secondary">
              {address ? `${address.slice(0, 12)}...${address.slice(-8)}` : '...'}
            </p>
          </div>
          <button
            onClick={() => setShowDepositModal(true)}
            className="text-xs w-full font-medium py-2.5 px-3 rounded flex-shrink-0 transition-colors"
            style={{
              backgroundColor: 'var(--color-brand-accent)',
              color: 'var(--color-text-inverse)',
            }}
          >
            Add funds to start trading
          </button>
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
      {marginMetrics ? (
        <div className="space-y-1.5">
          {/* Portfolio Value = sum of ALL children (cross + isolated) */}
          <div className="flex justify-between items-center">
            <Tooltip
              content="Total equity across all subaccounts (cross margin + isolated positions)."
              position="left"
            >
              <span className="text-xs text-muted">Portfolio Value</span>
            </Tooltip>
            <span className="text-base font-semibold text-primary text-sm">
              ${formatCurrency(marginMetrics.portfolioValue)}
            </span>
          </div>

          {/* Available Balance = cross child freeCollateral only */}
          <div className="flex justify-between items-center">
            <Tooltip
              content="Free collateral in your cross margin account. Isolated positions use separate ring-fenced accounts and do not affect this balance."
              position="left"
            >
              <span className="text-xs text-muted">Available Balance</span>
            </Tooltip>
            {projectedAvailableBalance !== null ? (
              <div className="flex items-center gap-1">
                <span className="text-sm text-muted line-through opacity-60">
                  ${formatCurrency(marginMetrics.availableBalance)}
                </span>
                <span className="text-xs text-muted">→</span>
                <span className="text-sm font-medium text-success">
                  ${formatCurrency(projectedAvailableBalance)}
                </span>
              </div>
            ) : (
              <span className="text-sm font-medium text-success">
                ${formatCurrency(marginMetrics.availableBalance)}
              </span>
            )}
          </div>

          {/* Margin Used — cross account only */}
          <div className="flex justify-between items-center">
            <Tooltip
              content="Portion of your cross margin equity locked as position margin. Isolated positions are excluded."
              position="left"
            >
              <span className="text-xs text-muted">Margin Used</span>
            </Tooltip>
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
                    fill="none"
                    stroke={
                      (projectedMarginUsagePercent ?? marginMetrics.marginUsagePercent) > 85
                        ? 'var(--color-danger)'
                        : (projectedMarginUsagePercent ?? marginMetrics.marginUsagePercent) > 50
                          ? 'var(--color-warning)'
                          : 'var(--color-success)'
                    }
                    strokeWidth="2"
                    strokeDasharray={`${2 * Math.PI * 10}`}
                    strokeDashoffset={`${2 * Math.PI * 10 * (1 - (projectedMarginUsagePercent ?? marginMetrics.marginUsagePercent) / 100)}`}
                    strokeLinecap="round"
                  />
                </svg>
              </div>
              <div className="flex flex-col items-end">
                <span
                  className={`text-sm font-semibold leading-none ${
                    (projectedMarginUsagePercent ?? marginMetrics.marginUsagePercent) > 85
                      ? 'text-danger'
                      : (projectedMarginUsagePercent ?? marginMetrics.marginUsagePercent) > 70
                        ? 'text-warning'
                        : 'text-success'
                  }`}
                >
                  {projectedMarginUsagePercent !== null ? (
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
                {marginMetrics.marginUsed > 0 && (
                  <span className="text-[10px] text-muted leading-none mt-0.5">
                    ${formatCurrency(marginMetrics.marginUsed)} used
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Isolated equity summary (only shown when there are isolated positions) */}
          {marginMetrics.isolatedEquity > 0 && (
            <div className="flex justify-between items-center">
              <Tooltip
                content="Equity locked in isolated margin positions. These funds are ring-fenced and do not affect your cross margin available balance."
                position="left"
              >
                <span className="text-xs text-muted">Isolated Locked</span>
              </Tooltip>
              <span className="text-sm font-medium text-muted">
                ${formatCurrency(marginMetrics.isolatedEquity)}
              </span>
            </div>
          )}

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
      ) : dataLoaded && balance ? (
        <div className="space-y-1.5">
          <div className="flex justify-between items-center">
            <Tooltip
              content="Amount of collateral that is available to trade or withdraw from your cross margin account."
              position="left"
            >
              <span className="text-xs text-muted">Available Balance</span>
            </Tooltip>
            <span className="text-sm font-medium text-success">
              ${formatCurrency(parseFloat(balance.freeCollateral))}
            </span>
          </div>
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
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          {['Portfolio Value', 'Available Balance', 'Margin Used'].map(label => (
            <div key={label} className="flex justify-between items-center">
              <span className="text-xs text-muted">{label}</span>
              <Shimmer />
            </div>
          ))}
        </div>
      )}

      <SubaccountTransfer isOpen={showTransferModal} onClose={() => setShowTransferModal(false)} />
      <DydxWithdrawModal isOpen={showWithdrawModal} onClose={() => setShowWithdrawModal(false)} />
      <DydxDepositModal isOpen={showDepositModal} onClose={() => setShowDepositModal(false)} />
      {notification && (
        <Notification
          type={notification.type}
          title={notification.title}
          message={notification.message}
          onClose={clearNotification}
          autoClose
          autoCloseDuration={6000}
        />
      )}
    </div>
  );
};
