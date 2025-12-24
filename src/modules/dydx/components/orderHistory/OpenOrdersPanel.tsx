import { Loader2, X } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';

import { getSocketClient } from '../../client/clients';
import { metadataService } from '../../hooks/useCoinGeckoMetadata';
import { dydxDataService } from '../../service/dydxOrderService';
import { dydxWalletService } from '../../service/dydxWalletService';

interface OpenOrder {
  id: string;
  clientId: number;
  market: string;
  side: 'BUY' | 'SELL';
  type: string;
  size: string;
  price: string;
  filledSize: string;
  status: string;
  createdAt: string;
  triggerPrice?: string;
  goodTilBlockTime?: string;
  goodTilBlock?: number;
  orderFlags: number;
}

const OpenOrdersPanel: React.FC = () => {
  const [orders, setOrders] = useState<OpenOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState<Set<string>>(new Set());
  const [icons, setIcons] = useState<Record<string, string>>({});
  const [useWebSocket, setUseWebSocket] = useState(false); // Disabled by default
  const [wsConnected, setWsConnected] = useState(false);

  const address = dydxWalletService.getAddress();
  const subaccountNumber = dydxWalletService.getSubaccountNumber() ?? 0;
  const isConnected = !!address;

  // Fetch orders via HTTP
  const fetchOrders = useCallback(async () => {
    if (!isConnected) return;
    setLoading(true);
    try {
      const data = await dydxDataService.fetchOpenOrders();
      setOrders(data);

      // Load icons for all markets
      const markets = [...new Set(data.map(o => o.market))];
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
    } catch (err) {
      console.error('Failed to fetch open orders:', err);
    } finally {
      setLoading(false);
    }
  }, [isConnected]);

  // WebSocket subscription for real-time order updates (optional, disabled by default)
  useEffect(() => {
    if (!isConnected || !useWebSocket) {
      setWsConnected(false);
      return;
    }

    console.log('[OpenOrdersPanel] Subscribing to v4_subaccounts WebSocket');

    const socketClient = getSocketClient();

    const unsubscribe = socketClient.subscribeToSubaccounts(
      address!,
      subaccountNumber,
      (message: any) => {
        if (message.type === 'channel_data' && message.contents) {
          if (message.contents.orders) {
            console.log('[OpenOrdersPanel] Received WebSocket order update');
            // Filter for open orders
            const openStatuses = ['OPEN', 'PARTIALLY_FILLED', 'BEST_EFFORT_OPEN', 'UNTRIGGERED'];
            const openOrders = message.contents.orders.filter((o: OpenOrder) =>
              openStatuses.includes(o.status)
            );
            setOrders(openOrders);
            setWsConnected(true);
          }
        }
      }
    );

    setWsConnected(socketClient.isConnected());

    return () => {
      console.log('[OpenOrdersPanel] Unsubscribing from WebSocket');
      unsubscribe();
      setWsConnected(false);
    };
  }, [isConnected, useWebSocket, address, subaccountNumber]);

  // Initial HTTP fetch
  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Fallback polling when WebSocket is disabled
  useEffect(() => {
    if (!isConnected || useWebSocket) return;

    const interval = setInterval(fetchOrders, 8000);
    return () => clearInterval(interval);
  }, [isConnected, useWebSocket, fetchOrders]);

  const handleCancel = useCallback(
    async (order: OpenOrder) => {
      setCancelling(prev => new Set(prev).add(order.id));

      try {
        await dydxDataService.cancelOrder(order.id);

        // Remove from UI immediately
        setOrders(prev => prev.filter(o => o.id !== order.id));

        // Refresh to ensure consistency
        setTimeout(fetchOrders, 2000);
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
    [fetchOrders]
  );

  const getTimeAgo = useCallback((ts: string) => {
    const diff = Date.now() - new Date(ts).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
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

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center text-gray-400">
        <h3 className="text-lg font-semibold text-white mb-2">Connect Wallet</h3>
        <p className="text-sm">Connect your wallet to manage orders</p>
      </div>
    );
  }

  if (loading && orders.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        <Loader2 className="w-6 h-6 mr-2 animate-spin" />
        Loading orders...
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center text-gray-400">
        <h3 className="text-lg font-semibold text-white mb-2">No Open Orders</h3>
        <p className="text-sm">Your active orders will appear here</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-primary">
      {/* Optional: Header with WebSocket toggle (hidden by default) */}
      {false && (
        <div className="px-4 py-2 bg-secondary border-b border-gray-700 flex items-center justify-between">
          <h2 className="text-white font-semibold">Open Orders</h2>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-gray-400 text-xs">Real-time updates:</span>
              <button
                onClick={() => setUseWebSocket(!useWebSocket)}
                className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                  useWebSocket ? 'bg-green-500/20 text-green-400' : 'bg-gray-600/20 text-gray-400'
                }`}
              >
                {useWebSocket ? 'WebSocket' : 'Polling'}
              </button>
            </div>
            {useWebSocket && (
              <div className="flex items-center gap-2">
                <div
                  className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-green-500' : 'bg-red-500'}`}
                />
                <span className="text-xs text-gray-400">
                  {wsConnected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-secondary border-b border-gray-700 z-10">
            <tr className="text-gray-400 text-xs">
              <th className="text-left px-4 py-2 font-normal">Market</th>
              <th className="text-center px-4 py-2 font-normal">Status</th>
              <th className="text-center px-4 py-2 font-normal">Side</th>
              <th className="text-right px-4 py-2 font-normal">Amount</th>
              <th className="text-right px-4 py-2 font-normal">Filled</th>
              <th className="text-right px-4 py-2 font-normal">Price</th>
              <th className="text-center px-4 py-2 font-normal">Trigger</th>
              <th className="text-right px-4 py-2 font-normal">Good Till</th>
              <th className="text-center px-4 py-2 font-normal">Cancel</th>
            </tr>
          </thead>
          <tbody>
            {orders.map(order => {
              const isCancelling = cancelling.has(order.id);

              return (
                <tr
                  key={order.id}
                  className={`border-b border-[#2a2a2a] hover:bg-[#1a1a1a] transition-colors ${
                    isCancelling ? 'opacity-50' : ''
                  }`}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                        {getMarketIcon(order.market)}
                      </div>
                      <span className="text-white text-xs font-medium">
                        {order.market.split('-')[0]}
                      </span>
                    </div>
                  </td>

                  <td className="px-4 py-3 text-center">
                    <span className="text-gray-300 text-xs">
                      {isCancelling
                        ? 'Cancelling'
                        : order.status === 'PARTIALLY_FILLED'
                          ? 'Partial'
                          : order.status === 'BEST_EFFORT_OPEN'
                            ? 'Open'
                            : order.status}
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

                  <td className="px-4 py-3 text-right text-white font-mono">
                    {parseFloat(order.size).toFixed(4)}
                  </td>

                  <td className="px-4 py-3 text-right text-gray-400 text-xs">
                    {parseFloat(order.filledSize).toFixed(4)}
                  </td>

                  <td className="px-4 py-3 text-right text-white font-mono">
                    ${parseFloat(order.price).toLocaleString()}
                  </td>

                  <td className="px-4 py-3 text-center text-gray-400 text-xs">
                    {order.triggerPrice
                      ? `$${parseFloat(order.triggerPrice).toLocaleString()}`
                      : '—'}
                  </td>

                  <td className="px-4 py-3 text-right text-gray-400 text-xs">
                    {order.goodTilBlockTime ? getTimeAgo(order.goodTilBlockTime) : '—'}
                  </td>

                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => handleCancel(order)}
                      disabled={isCancelling}
                      className={`p-1.5 rounded transition-colors ${
                        isCancelling
                          ? 'bg-gray-600 cursor-not-allowed'
                          : 'bg-red-600 hover:bg-red-500 text-white'
                      }`}
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
