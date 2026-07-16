import { Loader2, RefreshCw, X } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import { ConfirmationModal } from '../../../../components/common/ConfirmationModal';
import { useDydxData } from '../../hooks/useDydxData';
import { metadataService } from '../../hooks/useMetadata';
import { dydxTradingService } from '../../service/dydxTradingService';
import useMarketStore from '../../store/marketStore';
import { type TrackedOrder, isMarketOrder } from '../../store/websocketStore';
import { formatMarketPrice, formatNumericWithCommas } from '../../utils/BigNumberUtils';
import { currencyService } from '../../utils/currencyService';
import { capitalizeFirst, formatTimeAgoCompact, getDisplayOrderType } from '../../utils/orderUtils';
import { CANCEL_REFRESH_DELAY_MS } from '../../utils/orderUtils';

function getStatusBadge(order: TrackedOrder) {
  const status = order.status;
  const displayType = getDisplayOrderType(order);
  const typeStr = capitalizeFirst(displayType);

  const getStatusColor = () => {
    if (status === 'FILLED') return 'bg-green-500';
    if (['OPEN', 'PARTIALLY_FILLED'].includes(status)) return 'bg-green-500'; // Using green for OPEN matching UI
    if (status === 'CANCELED' || status === 'BEST_EFFORT_CANCELED' || status === 'REJECTED')
      return 'bg-gray-500';
    return 'bg-yellow-500';
  };

  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-1.5 h-1.5 rounded-full ${getStatusColor()}`} />
      <span className="text-gray-300">{typeStr}</span>
    </div>
  );
}

const OpenOrdersPanel: React.FC = () => {
  const { openOrders, loadingOrders, ordersError, refreshOrders, isConnected } = useDydxData();
  const marketCache = useMarketStore(state => state.marketCache);

  const [cancelling, setCancelling] = useState<Set<string>>(new Set());
  const [orderToCancel, setOrderToCancel] = useState<TrackedOrder | null>(null);
  const [icons, setIcons] = useState<Record<string, string>>({});
  const requestedIconsRef = useRef<Set<string>>(new Set());
  const [failedIcons, setFailedIcons] = useState<Set<string>>(new Set());
  const cancelRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (openOrders.length === 0) return;

    const fetchIcons = async () => {
      const markets = [...new Set(openOrders.map(o => o.ticker).filter(Boolean))] as string[];
      const newMarkets = markets.filter(m => !requestedIconsRef.current.has(m));
      if (newMarkets.length === 0) return;
      newMarkets.forEach(m => requestedIconsRef.current.add(m));

      const results = await Promise.allSettled(
        newMarkets.map(async market => {
          const meta = await metadataService.getMetadata(market!);
          return { market: market!, icon: meta?.image };
        })
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
  }, [openOrders]);

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
      return <span className="text-primary text-xs font-bold">{baseAsset.slice(0, 3)}</span>;
    },
    [icons, failedIcons]
  );

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[150px] py-8 text-center text-muted">
        <h3 className="text-lg font-semibold text-primary mb-2">Connect Wallet</h3>
        <p className="text-sm">Connect your wallet to manage orders</p>
      </div>
    );
  }

  if (loadingOrders && openOrders.length === 0) {
    return (
      <div className="flex items-center justify-center h-full min-h-[150px] py-8 text-muted">
        <Loader2 className="w-6 h-6 mr-2 animate-spin" />
        Loading orders...
      </div>
    );
  }

  if (ordersError && openOrders.length === 0) {
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

  if (openOrders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[150px] py-8 text-center text-muted">
        <h3 className="text-lg font-semibold text-primary mb-2">No Open Orders</h3>
        <p className="text-sm">Your active orders will appear here</p>
      </div>
    );
  }

  return (
    <div className="h-full bg-secondary overflow-y-visible md:overflow-auto flex flex-col relative">
      {/* Desktop table */}
      <div className="hidden md:block flex-1 overflow-auto">
        <table className="w-full text-left border-collapse">
          <thead className="bg-secondary text-muted text-[10px] uppercase tracking-wider font-semibold sticky top-0 z-10 border-b border-color">
            <tr>
              <th className="px-3 py-2 font-semibold">Market</th>
              <th className="px-2 py-2 text-left font-semibold">Status</th>
              <th className="px-2 py-2 text-center font-semibold">Side</th>
              <th className="px-2 py-2 text-right font-semibold">Amount</th>
              <th className="px-2 py-2 text-right font-semibold">Filled</th>
              <th className="px-2 py-2 text-right font-semibold">Price</th>
              <th className="px-2 py-2 text-center font-semibold">TIF</th>
              <th className="px-2 py-2 text-center font-semibold text-[10px] whitespace-nowrap">
                Margin Mode
              </th>
              <th className="px-2 py-2 text-right font-semibold">Created</th>
              <th className="px-2 py-2 text-center font-semibold">Cancel</th>
            </tr>
          </thead>
          <tbody>
            {openOrders.map(order => {
              const isCancelling = cancelling.has(order.id);
              const filled = parseFloat(order.totalOptimisticFilled || '0');
              const size = parseFloat(order.size);
              const fillPercent = size > 0 ? (filled / size) * 100 : 0;
              const isPending = order.status === 'BEST_EFFORT_OPENED';
              const isMarket = isMarketOrder(order);
              const rawMarginMode =
                (order as any).marginMode || (order as any).margin_mode || 'CROSS';
              const marginMode = capitalizeFirst(rawMarginMode);

              const marketTicker = order.ticker ?? '';
              const mkt = marketCache[marketTicker];
              const stepSize = mkt?.stepSize || '0.0001';
              const decimals = currencyService.getStepSizeDecimals(stepSize);

              const sizeStr = formatNumericWithCommas(size, decimals);
              const filledStr = formatNumericWithCommas(filled, decimals);
              const priceStr = isMarket ? 'Market' : formatMarketPrice(order.price, '$');
              const timeStr =
                order.updatedAt || (order as any)._firstSeenAt || order.createdAtHeight || '';

              return (
                <tr
                  key={order.id}
                  className={`border-b border-color hover:bg-hover transition-colors text-[11px] ${isCancelling ? 'opacity-50' : ''} ${isPending ? 'bg-yellow-500/5' : ''}`}
                >
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded-full bg-secondary flex items-center justify-center overflow-hidden">
                        {order.ticker && getMarketIcon(order.ticker)}
                      </div>
                      <span className="font-bold text-primary">
                        {order.ticker?.split('-')[0] ?? '—'}
                      </span>
                    </div>
                  </td>
                  <td className="px-2 py-1.5 text-left">{getStatusBadge(order)}</td>
                  <td className="px-2 py-1.5 text-center">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${order.side === 'BUY' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}
                    >
                      {capitalizeFirst(order.side)}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-right text-primary font-mono">{sizeStr}</td>
                  <td className="px-2 py-1.5 text-right">
                    <div className="text-primary font-mono">{filledStr}</div>
                    {fillPercent > 0 && (
                      <div className="text-[9px] text-muted">{fillPercent.toFixed(0)}%</div>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right text-primary font-mono">{priceStr}</td>
                  <td className="px-2 py-1.5 text-center text-gray-400 font-bold">
                    {order.timeInForce || 'GTT'}
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <span className="px-1.5 py-0.5 bg-[#2B2B36] text-gray-300 rounded text-[9px] font-bold">
                      {marginMode}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-right text-gray-400 font-mono">
                    {formatTimeAgoCompact(timeStr)}
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    {!isMarket && (
                      <button
                        onClick={() => handleCancel(order)}
                        disabled={isCancelling}
                        className={`p-1 rounded transition-colors ${isCancelling ? 'bg-secondary cursor-not-allowed text-muted' : 'bg-red-900/30 hover:bg-red-900/50 text-red-400'}`}
                      >
                        {isCancelling ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <X className="w-3 h-3" />
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
      <div className="md:hidden w-full flex flex-col space-y-2 p-2 pb-4">
        {openOrders.map(order => {
          const isCancelling = cancelling.has(order.id);
          const filled = parseFloat(order.totalOptimisticFilled || '0');
          const size = parseFloat(order.size);
          const fillPercent = size > 0 ? (filled / size) * 100 : 0;
          const isMarket = isMarketOrder(order);

          const marketTicker = order.ticker ?? '';
          const mkt = marketCache[marketTicker];
          const stepSize = mkt?.stepSize || '0.0001';
          const decimals = currencyService.getStepSizeDecimals(stepSize);

          const sizeStr = formatNumericWithCommas(size, decimals);
          const filledStr = formatNumericWithCommas(filled, decimals);
          const priceStr = isMarket ? 'Market' : formatMarketPrice(order.price, '$');
          const timeStr =
            order.updatedAt || (order as any)._firstSeenAt || order.createdAtHeight || '';

          return (
            <div
              key={order.id}
              className={`bg-secondary border border-color rounded-xl p-3 shadow-sm mb-2 ${isCancelling ? 'opacity-50' : ''}`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-[var(--color-bg-primary)] flex items-center justify-center overflow-hidden shrink-0">
                    {order.ticker && getMarketIcon(order.ticker)}
                  </div>
                  <div>
                    <div className="font-bold text-primary flex items-center gap-1.5 text-sm">
                      {order.ticker?.split('-')[0] ?? '—'}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wide ${order.side === 'BUY' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}
                      >
                        {capitalizeFirst(order.side)}
                      </span>
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-secondary text-muted uppercase">
                        {order.timeInForce || 'GTT'}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-right">{getStatusBadge(order)}</div>
                  {!isMarket && (
                    <button
                      onClick={() => handleCancel(order)}
                      disabled={isCancelling}
                      className={`p-1.5 rounded-lg transition-colors ${isCancelling ? 'bg-secondary cursor-not-allowed text-muted' : 'bg-red-500/10 hover:bg-red-500/20 text-red-400'}`}
                    >
                      {isCancelling ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <X className="w-3.5 h-3.5" />
                      )}
                    </button>
                  )}
                </div>
              </div>

              <div className="flex justify-between items-end mb-3 px-1">
                <div className="flex flex-col">
                  <span className="text-[10px] text-muted font-medium mb-1 uppercase tracking-wider">
                    Price
                  </span>
                  <span className="text-primary font-mono text-sm font-medium">{priceStr}</span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-[10px] text-muted font-medium mb-1 uppercase tracking-wider">
                    Amount
                  </span>
                  <span className="text-primary font-mono text-sm font-medium">{sizeStr}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-2 p-2.5 bg-secondary/30 rounded-lg">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-muted">Filled</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-primary font-mono">{filledStr}</span>
                    {fillPercent > 0 && (
                      <span className="text-[9px] text-green-400">({fillPercent.toFixed(0)}%)</span>
                    )}
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-muted">Created</span>
                  <span className="text-[10px] text-primary">{formatTimeAgoCompact(timeStr)}</span>
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
