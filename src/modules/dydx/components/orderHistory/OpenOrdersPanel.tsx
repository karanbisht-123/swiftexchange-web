import { AlertCircle, CheckCircle, Clock, Loader2, RefreshCw, X } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { useDydxData } from '../../hooks/useDydxData';
import { metadataService } from '../../hooks/useMetadata';
import { type TrackedOrder } from '../../store/websocketStore';
import { dydxTradingService } from '../../service/dydxTradingService';
import { ConfirmationModal } from '../../../../components/common/ConfirmationModal';

const OpenOrdersPanel: React.FC = () => {
  const { openOrders, loadingOrders, ordersError, refreshOrders, isConnected } = useDydxData();

  const [cancelling, setCancelling] = useState<Set<string>>(new Set());
  const [orderToCancel, setOrderToCancel] = useState<TrackedOrder | null>(null);
  const [icons, setIcons] = useState<Record<string, string>>({});


  const sortedOpenOrders = useMemo(() => {
    return [...openOrders].sort((a, b) => {
      const tA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const tB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return tB - tA;
    });
  }, [openOrders]);

  useEffect(() => {
    if (openOrders.length === 0) return;

    const fetchIcons = async () => {
      const markets = [...new Set(openOrders.map(o => o.ticker).filter(Boolean))];
      const results = await Promise.allSettled(
        markets.map(async market => {
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

  // ── Cancel handler ─────────────────────────────────────────
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
      });

      if (!result.success) {
        throw new Error(result.userMessage || result.error || 'Failed to cancel order');
      }

      // The order will disappear naturally via the WebSocket BEST_EFFORT_CANCELED /
      // CANCELED status update — no need to hide it manually here.
      // Refresh after a short delay as a safety net in case WS is delayed.
      setTimeout(() => refreshOrders(), 1_500);
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

  // ── Helpers ────────────────────────────────────────────────
  const getTimeAgo = useCallback((ts: string) => {
    const diff = Date.now() - new Date(ts).getTime();
    const minutes = Math.floor(diff / 60_000);
    const hours = Math.floor(diff / 3_600_000);
    const days = Math.floor(diff / 86_400_000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return new Date(ts).toLocaleDateString();
  }, []);

  const getMarketIcon = useCallback(
    (market: string) => {
      const baseAsset = market.split('-')[0];
      const cachedIcon = icons[market];

      if (cachedIcon) {
        return (
          <img
            src={cachedIcon}
            alt={baseAsset}
            className="w-full h-full object-cover rounded-full"
            onError={e => {
              e.currentTarget.style.display = 'none';
              if (e.currentTarget.parentElement) {
                e.currentTarget.parentElement.innerHTML = `<span class="text-primary text-xs font-bold">${baseAsset.slice(0, 3)}</span>`;
              }
            }}
          />
        );
      }

      return <span className="text-primary text-xs font-bold">{baseAsset.slice(0, 3)}</span>;
    },
    [icons]
  );

  const getStatusBadge = useCallback((status: string) => {
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
        return (
          <span className="px-2 py-0.5 bg-secondary text-muted rounded text-xs">{status}</span>
        );
    }
  }, []);

  // ── Guards ─────────────────────────────────────────────────
  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center text-muted">
        <h3 className="text-lg font-semibold text-primary mb-2">Connect Wallet</h3>
        <p className="text-sm">Connect your wallet to manage orders</p>
      </div>
    );
  }

  if (loadingOrders && openOrders.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted">
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
      <div className="flex flex-col items-center justify-center h-full text-center text-muted">
        <h3 className="text-lg font-semibold text-primary mb-2">No Open Orders</h3>
        <p className="text-sm">Your active orders will appear here</p>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col bg-primary overflow-auto">
      {/* Desktop table */}
      <div className="hidden md:block">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-secondary border-b border-color z-10">
            <tr className="text-muted text-xs">
              <th className="text-left px-4 py-2 font-normal">Market</th>
              <th className="text-center px-4 py-2 font-normal">Status</th>
              <th className="text-center px-4 py-2 font-normal">Type</th>
              <th className="text-center px-4 py-2 font-normal">Side</th>
              <th className="text-right px-4 py-2 font-normal">Amount</th>
              <th className="text-right px-4 py-2 font-normal">Filled</th>
              <th className="text-right px-4 py-2 font-normal">Price</th>
              <th className="text-center px-4 py-2 font-normal">TIF</th>
              <th className="text-right px-4 py-2 font-normal">Created</th>
              <th className="text-center px-4 py-2 font-normal">Cancel</th>
            </tr>
          </thead>
          <tbody>
            {sortedOpenOrders.map(order => {
              const isCancelling = cancelling.has(order.id);
              const filled = parseFloat(order.totalOptimisticFilled || '0');
              const size = parseFloat(order.size);
              const fillPercent = size > 0 ? (filled / size) * 100 : 0;
              const isPending = order.status === 'BEST_EFFORT_OPENED';

              return (
                <tr
                  key={order.id}
                  className={`border-b border-color hover:bg-hover transition-colors ${isCancelling ? 'opacity-50' : ''
                    } ${isPending ? 'bg-yellow-500/5' : ''}`}
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

                  <td className="px-4 py-3 text-center">{getStatusBadge(order.status)}</td>

                  <td className="px-4 py-3 text-center">
                    <span className="px-2 py-0.5 bg-secondary text-primary rounded text-xs">
                      {order.clientMetadata === '1' && order.type === 'LIMIT'
                        ? 'MARKET'
                        : order.type}
                    </span>
                  </td>

                  <td className="px-4 py-3 text-center">
                    <span
                      className={`px-2 py-1 rounded text-xs font-bold ${order.side === 'BUY'
                        ? 'bg-green-500/20 text-green-400'
                        : 'bg-red-500/20 text-red-400'
                        }`}
                    >
                      {order.side}
                    </span>
                  </td>

                  <td className="px-4 py-3 text-right text-primary font-mono">
                    {size.toFixed(4)}
                  </td>

                  <td className="px-4 py-3 text-right">
                    <div className="text-muted text-xs font-mono">{filled.toFixed(4)}</div>
                    {fillPercent > 0 && (
                      <div className="text-xs text-muted">{fillPercent.toFixed(0)}%</div>
                    )}
                  </td>

                  <td className="px-4 py-3 text-right text-primary font-mono">
                    {order.type === 'MARKET' ||
                      (order.clientMetadata === '1' && order.type === 'LIMIT')
                      ? 'Market'
                      : `$${parseFloat(order.price).toLocaleString()}`}
                  </td>

                  <td className="px-4 py-3 text-center text-muted text-xs">
                    {order.timeInForce || 'GTT'}
                  </td>

                  <td className="px-4 py-3 text-right text-muted text-xs">
                    {order.goodTilBlockTime
                      ? getTimeAgo(order.goodTilBlockTime)
                      : order.updatedAt
                        ? getTimeAgo(order.updatedAt)
                        : '—'}
                  </td>

                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => handleCancel(order)}
                      disabled={isCancelling}
                      className={`p-1.5 rounded transition-colors ${isCancelling
                        ? 'bg-secondary cursor-not-allowed'
                        : 'bg-red-600 hover:bg-red-500 text-white'
                        }`}
                      title="Cancel order"
                    >
                      {isCancelling ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <X className="w-4 h-4" />
                      )}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-1.5 p-2">
        {sortedOpenOrders.map(order => {
          const isCancelling = cancelling.has(order.id);
          const filled = parseFloat(order.totalOptimisticFilled || '0');
          const size = parseFloat(order.size);
          const fillPercent = size > 0 ? (filled / size) * 100 : 0;

          return (
            <div
              key={order.id}
              className={`bg-secondary border border-color rounded-lg p-2.5 text-xs ${isCancelling ? 'opacity-50' : ''
                }`}
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
                  <span className="px-2 py-0.5 bg-primary text-primary rounded text-[10px]">
                    {order.clientMetadata === '1' && order.type === 'LIMIT'
                      ? 'MARKET'
                      : order.type}
                  </span>

                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${order.side === 'BUY'
                      ? 'bg-green-500/20 text-green-400'
                      : 'bg-red-500/20 text-red-400'
                      }`}
                  >
                    {order.side}
                  </span>

                  <button
                    onClick={() => handleCancel(order)}
                    disabled={isCancelling}
                    className={`p-1.5 rounded transition-colors ${isCancelling
                      ? 'bg-primary cursor-not-allowed'
                      : 'bg-red-600 hover:bg-red-500 text-white'
                      }`}
                  >
                    {isCancelling ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <X className="w-3 h-3" />
                    )}
                  </button>
                </div>
              </div>

              <div className="mb-2">{getStatusBadge(order.status)}</div>

              <div className="border-t border-dashed border-color pt-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
                <div className="flex flex-col gap-0.5">
                  <span className="text-muted text-[9px] uppercase tracking-wide font-medium">
                    Amount
                  </span>
                  <span className="text-primary font-medium font-mono">{size.toFixed(4)}</span>
                </div>

                <div className="flex flex-col gap-0.5">
                  <span className="text-muted text-[9px] uppercase tracking-wide font-medium">
                    Filled
                  </span>
                  <div>
                    <div className="text-primary font-medium font-mono">
                      {filled.toFixed(4)}
                    </div>
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
                    {order.type === 'MARKET'
                      ? 'Market'
                      : `$${parseFloat(order.price).toLocaleString()}`}
                  </span>
                </div>

                <div className="flex flex-col gap-0.5">
                  <span className="text-muted text-[9px] uppercase tracking-wide font-medium">
                    TIF
                  </span>
                  <span className="text-primary font-medium">
                    {order.timeInForce || 'GTT'}
                  </span>
                </div>

                <div className="flex flex-col gap-0.5 col-span-2">
                  <span className="text-muted text-[9px] uppercase tracking-wide font-medium">
                    Created
                  </span>
                  <span className="text-primary font-medium">
                    {order.goodTilBlockTime
                      ? getTimeAgo(order.goodTilBlockTime)
                      : order.updatedAt
                        ? getTimeAgo(order.updatedAt)
                        : '—'}
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
              Are you sure you want to cancel your <strong>{orderToCancel.side}</strong> order for <strong>{orderToCancel.ticker}</strong>?
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