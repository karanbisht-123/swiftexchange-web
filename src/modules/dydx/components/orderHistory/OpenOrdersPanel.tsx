import { AlertCircle, CheckCircle, Clock, Loader2, RefreshCw, X } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import { useDydxData } from '../../hooks/useDydxData';
import { metadataService } from '../../hooks/useMetadata';
import { type TrackedOrder, isMarketOrder } from '../../store/websocketStore';
import { dydxTradingService } from '../../service/dydxTradingService';
import { ConfirmationModal } from '../../../../components/common/ConfirmationModal';
import { getDisplayOrderType, formatTimeAgoCompact, capitalizeFirst } from '../../utils/orderUtils';
import { CANCEL_REFRESH_DELAY_MS } from '../../utils/orderUtils';
import useMarketStore from '../../store/marketStore';
import { formatMarketPrice, formatNumericWithCommas } from '../../utils/BigNumberUtils';
import { currencyService } from '../../utils/currencyService';

const OpenOrdersPanel: React.FC = () => {
  const { openOrdersWithGrace, loadingOrders, ordersError, refreshOrders, isConnected } =
    useDydxData();
  const marketCache = useMarketStore(state => state.marketCache);

  const [cancelling, setCancelling] = useState<Set<string>>(new Set());
  const [orderToCancel, setOrderToCancel] = useState<TrackedOrder | null>(null);
  const [icons, setIcons] = useState<Record<string, string>>({});
  const requestedIconsRef = useRef<Set<string>>(new Set());
  const [failedIcons, setFailedIcons] = useState<Set<string>>(new Set());
  const cancelRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (openOrdersWithGrace.length === 0) return;

    const fetchIcons = async () => {
      const markets = [...new Set(openOrdersWithGrace.map(o => o.ticker).filter(Boolean))] as string[];
      const newMarkets = markets.filter(m => !requestedIconsRef.current.has(m));
      if (newMarkets.length === 0) return;
      newMarkets.forEach(m => requestedIconsRef.current.add(m));

      const results = await Promise.allSettled(
        newMarkets.map(async market => {
          const meta = await metadataService.getMetadata(market!);
          return { market: market!, icon: meta?.image };
        }),
      );

      const newIcons: Record<string, string> = {};
      results.forEach(r => {
        if (r.status === 'fulfilled' && r.value.icon) {
          newIcons[r.value.market] = r.value.icon;
        }
      });

      setIcons(prev => ({ ...prev, ...newIcons }));
    };

    fetchIcons();
  }, [openOrdersWithGrace]);

  useEffect(() => {
    return () => {
      if (cancelRefreshTimerRef.current) {
        clearTimeout(cancelRefreshTimerRef.current);
        cancelRefreshTimerRef.current = null;
      }
    };
  }, []);

  const handleCancel = useCallback((order: TrackedOrder) => {
    setOrderToCancel(order);
  }, []);

  const confirmCancel = useCallback(async () => {
    if (!orderToCancel) return;
    const order = orderToCancel;
    setOrderToCancel(null);
    setCancelling(prev => new Set(prev).add(order.id));

    try {
      const result = await dydxTradingService.cancelOrder({
        clientId: order.clientId,
        orderFlags: order.orderFlags,
        clobPairId: order.ticker,
        goodTilBlock: order.goodTilBlock,
        goodTilBlockTime: order.goodTilBlockTime,
        subaccountId: order.subaccountId,
        subaccountNumber: order.subaccountNumber,
      });

      if (!result.success) {
        throw new Error(result.userMessage || result.error || 'Failed to cancel order');
      }
      cancelRefreshTimerRef.current = setTimeout(() => {
        cancelRefreshTimerRef.current = null;
        refreshOrders();
      }, CANCEL_REFRESH_DELAY_MS);
    } catch (err: any) {
      console.error('[OpenOrdersPanel] Failed to cancel order:', err);
      alert(`Failed to cancel order: ${err.message || 'Unknown error'}`);
    } finally {
      setCancelling(prev => {
        const next = new Set(prev);
        next.delete(order.id);
        return next;
      });
    }
  }, [orderToCancel, refreshOrders]);
  const getMarketIcon = useCallback(
    (market: string) => {
      const baseAsset = market.split('-')[0];
      const cachedIcon = icons[market];

      if (cachedIcon && !failedIcons.has(market)) {
        return (
          <img
            src={cachedIcon}
            alt={baseAsset}
            className="w-full h-full object-cover rounded-full"
            onError={() => {
              setFailedIcons(prev => new Set(prev).add(market));
            }}
          />
        );
      }
      return (
        <span className="text-primary text-xs font-bold">{baseAsset.slice(0, 3)}</span>
      );
    },
    [icons, failedIcons],
  );

  const getStatusBadge = useCallback((order: TrackedOrder) => {
    const status = order.status;

    if (isMarketOrder(order)) {
      if (status === 'FILLED') {
        return (
          <div className="flex items-center gap-1 px-2 py-0.5 bg-green-500/20 text-green-400 rounded text-xs">
            <CheckCircle className="w-3 h-3" />
            <span>Filled</span>
          </div>
        );
      }
      if (status === 'REJECTED') {
        const reason = order.removalReason
          ? order.removalReason.replace('ORDER_REMOVAL_REASON_', '').replace(/_/g, ' ')
          : 'Rejected';
        return (
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1 px-2 py-0.5 bg-red-500/20 text-red-400 rounded text-xs">
              <X className="w-3 h-3" />
              <span>Rejected</span>
            </div>
            <span className="text-[10px] text-red-400/70 px-2 leading-tight">{reason}</span>
          </div>
        );
      }
      if (status === 'BEST_EFFORT_CANCELED' || status === 'CANCELED') {
        const reason = order.removalReason
          ? order.removalReason.replace('ORDER_REMOVAL_REASON_', '').replace(/_/g, ' ')
          : null;
        return (
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1 px-2 py-0.5 bg-gray-500/20 text-gray-400 rounded text-xs">
              <X className="w-3 h-3" />
              <span>Canceled</span>
            </div>
            {reason && <span className="text-[10px] text-gray-400/70 px-2 leading-tight">{reason}</span>}
          </div>
        );
      }
    }

    if (status === 'REJECTED') {
      return (
        <div className="flex items-center gap-1 px-2 py-0.5 bg-red-500/20 text-red-400 rounded text-xs">
          <X className="w-3 h-3" />
          <span>Rejected</span>
        </div>
      );
    }

    switch (status) {
      case 'BEST_EFFORT_OPENED':
        return (
          <div className="flex items-center gap-1 px-2 py-0.5 bg-yellow-500/20 text-yellow-400 rounded text-xs">
            <Clock className="w-3 h-3 animate-spin" />
            <span>Pending</span>
          </div>
        );
      case 'OPEN':
        return (
          <div className="flex items-center gap-1 px-2 py-0.5 bg-green-500/20 text-green-400 rounded text-xs">
            <CheckCircle className="w-3 h-3" />
            <span>Open</span>
          </div>
        );
      case 'PARTIALLY_FILLED':
        return (
          <div className="flex items-center gap-1 px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded text-xs">
            <div className="w-3 h-3 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
            <span>Filling</span>
          </div>
        );
      case 'UNTRIGGERED':
        return (
          <div className="flex items-center gap-1 px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded text-xs">
            <AlertCircle className="w-3 h-3" />
            <span>Trigger</span>
          </div>
        );
      default:
        return <span className="px-2 py-0.5 bg-secondary text-muted rounded text-xs">{status}</span>;
    }
  }, []);

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center text-muted">
        <h3 className="text-lg font-semibold text-primary mb-2">Connect Wallet</h3>
        <p className="text-sm">Connect your wallet to manage orders</p>
      </div>
    );
  }

  if (loadingOrders && openOrdersWithGrace.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted">
        <Loader2 className="w-6 h-6 mr-2 animate-spin" />
        Loading orders...
      </div>
    );
  }

  if (ordersError && openOrdersWithGrace.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
        <h3 className="text-lg font-semibold text-red-400 mb-2">Error Loading Orders</h3>
        <p className="text-muted text-sm mb-4">{ordersError}</p>
        <button
          onClick={refreshOrders}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Retry
        </button>
      </div>
    );
  }

  if (openOrdersWithGrace.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center text-muted">
        <h3 className="text-lg font-semibold text-primary mb-2">No Open Orders</h3>
        <p className="text-sm">Your active orders will appear here</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-primary overflow-auto">
      {/* Desktop table */}
      <div className="hidden md:block">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-secondary border-b border-color z-10">
            <tr className="text-muted text-xs">
              <th className="text-left px-4 py-3 font-medium">Market</th>
              <th className="text-center px-4 py-3 font-medium">Status</th>
              <th className="text-left px-4 py-3 font-medium">Type</th>
              <th className="text-center px-4 py-3 font-medium">Side</th>
              <th className="text-right px-4 py-3 font-medium">Amount</th>
              <th className="text-right px-4 py-3 font-medium">Filled</th>
              <th className="text-right px-4 py-3 font-medium">Price</th>
              <th className="text-center px-4 py-3 font-medium">TIF</th>
              <th className="text-right px-4 py-3 font-medium">Created</th>
              <th className="text-center px-4 py-3 font-medium">Cancel</th>
            </tr>
          </thead>
          <tbody>
            {openOrdersWithGrace.map(order => {
              const isCancelling = cancelling.has(order.id);
              const filled = parseFloat(order.totalOptimisticFilled || '0');
              const size = parseFloat(order.size);
              const fillPercent = size > 0 ? (filled / size) * 100 : 0;
              const isPending = order.status === 'BEST_EFFORT_OPENED';
              const isMarket = isMarketOrder(order);
              const displayType = getDisplayOrderType(order);

              const marketTicker = order.ticker ?? '';
              const mkt = marketCache[marketTicker];
              const stepSize = mkt?.stepSize || '0.0001';
              const decimals = currencyService.getStepSizeDecimals(stepSize);

              const sizeStr = formatNumericWithCommas(size, decimals);
              const filledStr = formatNumericWithCommas(filled, decimals);
              const priceStr = isMarket ? 'Market' : formatMarketPrice(order.price, '$');
              const timeStr = order.goodTilBlockTime || order.updatedAt || '';

              return (
                <tr
                  key={order.id}
                  className={`border-b border-color hover:bg-hover transition-colors ${isCancelling ? 'opacity-50' : ''} ${isPending ? 'bg-yellow-500/5' : ''}`}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center overflow-hidden">
                        {order.ticker && getMarketIcon(order.ticker)}
                      </div>
                      <span className="text-primary text-xs font-medium">
                        {order.ticker?.split('-')[0] ?? '—'}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">{getStatusBadge(order)}</td>
                  <td className="px-4 py-3 text-left">
                    <span className="text-primary text-xs">
                      {capitalizeFirst(displayType)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${order.side === 'BUY' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                      {capitalizeFirst(order.side)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-primary font-mono">{sizeStr}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="text-primary font-mono">{filledStr}</div>
                    {fillPercent > 0 && <div className="text-xs text-muted">{fillPercent.toFixed(0)}%</div>}
                  </td>
                  <td className="px-4 py-3 text-right text-primary font-mono">
                    {priceStr}
                  </td>
                  <td className="px-4 py-3 text-center text-muted text-xs">
                    {order.timeInForce || 'GTT'}
                  </td>
                  <td className="px-4 py-3 text-right text-muted text-xs">
                    {formatTimeAgoCompact(timeStr)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {!isMarket && (
                      <button
                        onClick={() => handleCancel(order)}
                        disabled={isCancelling}
                        className={`p-1.5 rounded transition-colors ${isCancelling ? 'bg-secondary cursor-not-allowed text-muted' : 'bg-red-900/30 hover:bg-red-900/50 text-red-400'}`}
                      >
                        {isCancelling ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <X className="w-4 h-4" />
                        )}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-1.5 p-2">
        {openOrdersWithGrace.map(order => {
          const isCancelling = cancelling.has(order.id);
          const filled = parseFloat(order.totalOptimisticFilled || '0');
          const size = parseFloat(order.size);
          const fillPercent = size > 0 ? (filled / size) * 100 : 0;
          const isMarket = isMarketOrder(order);
          const displayType = getDisplayOrderType(order);

          const marketTicker = order.ticker ?? '';
          const mkt = marketCache[marketTicker];
          const stepSize = mkt?.stepSize || '0.0001';
          const decimals = currencyService.getStepSizeDecimals(stepSize);

          const sizeStr = formatNumericWithCommas(size, decimals);
          const filledStr = formatNumericWithCommas(filled, decimals);
          const priceStr = isMarket ? 'Market' : formatMarketPrice(order.price, '$');
          const timeStr = order.goodTilBlockTime || order.updatedAt || '';

          return (
            <div
              key={order.id}
              className={`bg-secondary border border-color rounded-lg p-2.5 text-xs ${isCancelling ? 'opacity-50' : ''}`}
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center overflow-hidden">
                    {order.ticker && getMarketIcon(order.ticker)}
                  </div>
                  <span className="text-primary font-bold">
                    {order.ticker?.split('-')[0] ?? '—'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-primary text-[10px]">
                    {capitalizeFirst(displayType)}
                  </span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${order.side === 'BUY' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                    {capitalizeFirst(order.side)}
                  </span>
                  {!isMarket && (
                    <button
                      onClick={() => handleCancel(order)}
                      disabled={isCancelling}
                      className={`p-1.5 rounded transition-colors ${isCancelling ? 'bg-primary cursor-not-allowed text-muted' : 'bg-red-900/30 hover:bg-red-900/50 text-red-400'}`}
                    >
                      {isCancelling ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <X className="w-3 h-3" />
                      )}
                    </button>
                  )}
                </div>
              </div>
              <div className="mb-2">{getStatusBadge(order)}</div>
              <div className="border-t border-dashed border-color pt-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
                <div className="flex flex-col gap-0.5">
                  <span className="text-muted text-[9px] uppercase tracking-wide font-medium">
                    Amount
                  </span>
                  <span className="text-primary font-medium font-mono">{sizeStr}</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-muted text-[9px] uppercase tracking-wide font-medium">
                    Filled
                  </span>
                  <div>
                    <div className="text-primary font-medium font-mono">{filledStr}</div>
                    {fillPercent > 0 && (
                      <div className="text-[9px] text-muted">{fillPercent.toFixed(0)}%</div>
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-muted text-[9px] uppercase tracking-wide font-medium">
                    Price
                  </span>
                  <span className="text-primary font-medium font-mono">
                    {priceStr}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-muted text-[9px] uppercase tracking-wide font-medium">
                    TIF
                  </span>
                  <span className="text-primary font-medium">{order.timeInForce || 'GTT'}</span>
                </div>
                <div className="flex flex-col gap-0.5 col-span-2">
                  <span className="text-muted text-[9px] uppercase tracking-wide font-medium">
                    Created
                  </span>
                  <span className="text-primary font-medium">
                    {formatTimeAgoCompact(timeStr)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <ConfirmationModal
        isOpen={!!orderToCancel}
        title="Cancel Order"
        message={
          orderToCancel ? (
            <span>
              Are you sure you want to cancel your <strong>{orderToCancel.side}</strong> order for{' '}
              <strong>{orderToCancel.ticker}</strong>?
            </span>
          ) : (
            ''
          )
        }
        onConfirm={confirmCancel}
        onCancel={() => setOrderToCancel(null)}
        confirmText="Yes, Cancel"
        cancelText="No, Keep It"
        confirmButtonType="danger"
      />
    </div>
  );
};

export default OpenOrdersPanel;
