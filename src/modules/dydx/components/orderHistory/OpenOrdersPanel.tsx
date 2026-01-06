import { AlertCircle, CheckCircle, Clock, Loader2, RefreshCw, X } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { metadataService } from '../../hooks/useCoinGeckoMetadata';
import { useDydxData } from '../../hooks/useDydxData';
import { type Order } from '../../service/dydxOrderService';
import { dydxTradingService } from '../../service/dydxTradingService';

const OpenOrdersPanel: React.FC = () => {
  const { orders, loadingOrders, ordersError, refreshOrders, isConnected, isReceivingUpdates } =
    useDydxData();

  const [cancelling, setCancelling] = useState<Set<string>>(new Set());
  const [icons, setIcons] = useState<Record<string, string>>({});

  const openOrders = useMemo(() => {
    const openStatuses = [
      'OPEN',
      'PARTIALLY_FILLED',
      'BEST_EFFORT_OPENED',
      'UNTRIGGERED',
      'BEST_EFFORT_CANCELED',
    ];
    return orders.filter(order => openStatuses.includes(order.status));
  }, [orders]);

  useEffect(() => {
    if (openOrders.length === 0) return;

    const fetchIcons = async () => {
      const markets = [...new Set(openOrders.map(o => o.ticker))];
      const iconPromises = markets.map(async market => {
        const metadata = await metadataService.getMetadata(market);
        return { market, icon: metadata?.image };
      });

      const iconResults = await Promise.allSettled(iconPromises);
      const newIcons: Record<string, string> = {};

      iconResults.forEach(result => {
        if (result.status === 'fulfilled' && result.value.icon) {
          newIcons[result.value.market] = result.value.icon;
        }
      });

      setIcons(prev => ({ ...prev, ...newIcons }));
    };

    fetchIcons();
  }, [openOrders]);

  const handleCancel = useCallback(
    async (order: Order) => {
      if (!confirm(`Cancel ${order.side} order for ${order.ticker}?`)) return;

      setCancelling(prev => new Set(prev).add(order.id));

      try {
        const result = await dydxTradingService.cancelOrder({
          clientId: order.clientId,
          orderFlags: order.orderFlags,
          clobPairId: order.clobPairId,
          goodTilBlock: order.goodTilBlock,
          goodTilBlockTime: order.goodTilBlockTime,
        });

        if (result.success) {
          console.log('Order cancelled:', result);
          setTimeout(() => refreshOrders(), 1500);
        } else {
          throw new Error(result.userMessage || result.error || 'Failed to cancel order');
        }
      } catch (err: any) {
        console.error('Failed to cancel order:', err);
        alert(`Failed to cancel order: ${err.message || 'Unknown error'}`);
      } finally {
        setCancelling(prev => {
          const next = new Set(prev);
          next.delete(order.id);
          return next;
        });
      }
    },
    [refreshOrders]
  );

  const getTimeAgo = useCallback((ts: string) => {
    const diff = Date.now() - new Date(ts).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
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
              e.currentTarget.parentElement!.innerHTML = `<span class="text-white text-xs font-bold">${baseAsset.slice(0, 3)}</span>`;
            }}
          />
        );
      }

      return <span className="text-white text-xs font-bold">{baseAsset.slice(0, 3)}</span>;
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
      case 'BEST_EFFORT_CANCELED':
        return (
          <div className="flex items-center gap-1 px-2 py-0.5 bg-orange-500/20 text-orange-400 rounded text-xs">
            <Clock className="w-3 h-3" />
            <span>Canceling</span>
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
          <span className="px-2 py-0.5 bg-gray-500/20 text-gray-400 rounded text-xs">{status}</span>
        );
    }
  }, []);

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center text-gray-400">
        <h3 className="text-lg font-semibold text-white mb-2">Connect Wallet</h3>
        <p className="text-sm">Connect your wallet to manage orders</p>
      </div>
    );
  }

  if (loadingOrders && openOrders.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        <Loader2 className="w-6 h-6 mr-2 animate-spin" />
        Loading orders...
      </div>
    );
  }

  if (ordersError && openOrders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
        <h3 className="text-lg font-semibold text-red-400 mb-2">Error Loading Orders</h3>
        <p className="text-gray-400 text-sm mb-4">{ordersError}</p>
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
      <div className="flex flex-col items-center justify-center h-full text-center text-gray-400">
        <h3 className="text-lg font-semibold text-white mb-2">No Open Orders</h3>
        <p className="text-sm">Your active orders will appear here</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-primary">
      <div className="px-4 py-2 bg-secondary border-b border-gray-700 flex items-center justify-between">
        <h2 className="text-white font-semibold text-sm">Open Orders ({openOrders.length})</h2>
        <div className="flex items-center gap-3">
          {isReceivingUpdates && (
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-xs text-gray-400">Live</span>
            </div>
          )}
          <button
            onClick={refreshOrders}
            disabled={loadingOrders}
            className="p-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors disabled:opacity-50"
            title="Refresh orders"
          >
            <RefreshCw className={`w-4 h-4 ${loadingOrders ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-secondary border-b border-gray-700 z-10">
            <tr className="text-gray-400 text-xs">
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
            {openOrders.map(order => {
              const isCancelling = cancelling.has(order.id);
              const filled = parseFloat(order.totalFilled || '0');
              const size = parseFloat(order.size);
              const fillPercent = size > 0 ? (filled / size) * 100 : 0;

              const isPending =
                order.status === 'BEST_EFFORT_OPENED' || order.status === 'BEST_EFFORT_CANCELED';

              return (
                <tr
                  key={order.id}
                  className={`border-b border-[#2a2a2a] hover:bg-[#1a1a1a] transition-colors ${
                    isCancelling ? 'opacity-50' : ''
                  } ${isPending ? 'bg-yellow-500/5' : ''}`}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                        {getMarketIcon(order.ticker)}
                      </div>
                      <span className="text-white text-xs font-medium">
                        {order.ticker.split('-')[0]}
                      </span>
                    </div>
                  </td>

                  <td className="px-4 py-3 text-center">{getStatusBadge(order.status)}</td>

                  <td className="px-4 py-3 text-center">
                    <span className="px-2 py-0.5 bg-[#2a2a2a] text-gray-300 rounded text-xs">
                      {order.type}
                    </span>
                  </td>

                  <td className="px-4 py-3 text-center">
                    <span
                      className={`px-2 py-1 rounded text-xs font-bold ${
                        order.side === 'BUY'
                          ? 'bg-green-500/20 text-green-400'
                          : 'bg-red-500/20 text-red-400'
                      }`}
                    >
                      {order.side}
                    </span>
                  </td>

                  <td className="px-4 py-3 text-right text-white font-mono">{size.toFixed(4)}</td>

                  <td className="px-4 py-3 text-right">
                    <div className="text-gray-400 text-xs font-mono">{filled.toFixed(4)}</div>
                    {fillPercent > 0 && (
                      <div className="text-xs text-gray-500">{fillPercent.toFixed(0)}%</div>
                    )}
                  </td>

                  <td className="px-4 py-3 text-right text-white font-mono">
                    {order.type === 'MARKET'
                      ? 'Market'
                      : `$${parseFloat(order.price).toLocaleString()}`}
                  </td>

                  <td className="px-4 py-3 text-center text-gray-400 text-xs">
                    {order.timeInForce || 'GTT'}
                  </td>

                  <td className="px-4 py-3 text-right text-gray-400 text-xs">
                    {order.goodTilBlockTime
                      ? getTimeAgo(order.goodTilBlockTime)
                      : order.updatedAt
                        ? getTimeAgo(order.updatedAt)
                        : '—'}
                  </td>

                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => handleCancel(order)}
                      disabled={isCancelling || order.status === 'BEST_EFFORT_CANCELED'}
                      className={`p-1.5 rounded transition-colors ${
                        isCancelling || order.status === 'BEST_EFFORT_CANCELED'
                          ? 'bg-gray-600 cursor-not-allowed'
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
    </div>
  );
};

export default OpenOrdersPanel;
