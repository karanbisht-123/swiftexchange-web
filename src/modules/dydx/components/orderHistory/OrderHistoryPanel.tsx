import React, { useEffect, useState } from 'react';

import { dydxWalletService } from '../../service/dydxWalletService';

interface Order {
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
  timeInForce: string;
}

const OrderHistoryPanel: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  const address = dydxWalletService.getAddress();
  const subNo = dydxWalletService.getSubaccountNumber();
  const indexer = dydxWalletService.getIndexerClient();
  const isConnected = !!address;

  useEffect(() => {
    if (!address || !indexer) {
      setLoading(false);
      return;
    }

    const fetchOrders = async () => {
      setLoading(true);
      try {
        const response = await indexer.account.getSubaccountOrders(
          address,
          subNo,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          100
        );

        const mappedOrders = (response || []).map((o: any) => ({
          id: o.id,
          clientId: Number(o.clientId || 0),
          market: o.ticker,
          side: o.side.toUpperCase() as 'BUY' | 'SELL',
          type: o.type,
          size: o.size,
          price: o.price,
          filledSize: o.totalFilled || '0',
          status: o.status,
          createdAt: o.createdAt,
          triggerPrice: o.triggerPrice,
          timeInForce: o.timeInForce,
        }));

        setOrders(mappedOrders);
      } catch (error) {
        console.error('Error fetching order history:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchOrders();
  }, [address, indexer, subNo]);

  const getTimeAgo = (timestamp: string) => {
    const now = Date.now();
    const diff = now - new Date(timestamp).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    const weeks = Math.floor(diff / 604800000);

    if (minutes < 60) return `${minutes}m`;
    if (hours < 24) return `${hours}h`;
    if (days < 7) return `${days}d`;
    return `${weeks}w`;
  };

  const calculateOrderValue = (order: Order) => {
    const filled = parseFloat(order.filledSize || '0');
    const price = parseFloat(order.price || '0');
    return (filled * price).toFixed(2);
  };

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
        <h3 className="text-lg font-semibold text-white mb-2">Connect Your Wallet</h3>
        <p className="text-gray-400 text-sm">
          Connect and deposit funds to view your order history
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-primary">
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-gray-400">Loading...</div>
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <h3 className="text-lg font-semibold text-white mb-2">No Orders</h3>
            <p className="text-gray-400 text-sm">Place your first trade to see orders here</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-secondary">
              <tr className="text-gray-400 text-xs">
                <th className="text-left px-4 py-2 font-normal">Market</th>
                <th className="text-center px-4 py-2 font-normal">Status</th>
                <th className="text-center px-4 py-2 font-normal">Side</th>
                <th className="text-right px-4 py-2 font-normal">Amount</th>
                <th className="text-right px-4 py-2 font-normal">Filled</th>
                <th className="text-right px-4 py-2 font-normal">Order Value</th>
                <th className="text-right px-4 py-2 font-normal">Price</th>
                <th className="text-center px-4 py-2 font-normal">Trigger</th>
                <th className="text-center px-4 py-2 font-normal">Margin Mode</th>
                <th className="text-right px-4 py-2 font-normal">Time</th>
              </tr>
            </thead>
            <tbody>
              {orders.map(order => {
                const orderValue = calculateOrderValue(order);
                const fillPercent = (parseFloat(order.filledSize) / parseFloat(order.size)) * 100;

                return (
                  <tr
                    key={order.id}
                    className="border-b border-[#2a2a2a] hover:bg-[#1a1a1a] transition-colors"
                  >
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center text-white text-xs font-bold">
                          {order.market?.split('-')[0]?.charAt(0) || 'C'}
                        </div>
                        <span className="text-white font-medium">
                          {order.market?.split('-')[0] || 'N/A'}
                        </span>
                      </div>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <div
                          className={`w-1.5 h-1.5 rounded-full ${
                            order.status === 'FILLED'
                              ? 'bg-green-500'
                              : order.status === 'OPEN'
                                ? 'bg-blue-500'
                                : order.status === 'CANCELED'
                                  ? 'bg-gray-500'
                                  : 'bg-yellow-500'
                          }`}
                        />
                        <span className="text-gray-300 text-xs">
                          {order.status === 'BEST_EFFORT_CANCELED' ? 'Canceled' : order.status}
                        </span>
                      </div>
                    </td>

                    {/* Side */}
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`font-medium ${
                          order.side === 'BUY' ? 'text-green-400' : 'text-red-400'
                        }`}
                      >
                        {order.side === 'BUY' ? 'Buy' : 'Sell'}
                      </span>
                    </td>

                    {/* Amount */}
                    <td className="px-4 py-3 text-right text-white font-mono">
                      {parseFloat(order.size).toFixed(4)}
                    </td>

                    {/* Filled */}
                    <td className="px-4 py-3 text-right">
                      <div className="text-white font-mono">
                        {parseFloat(order.filledSize).toFixed(4)}
                      </div>
                      {fillPercent > 0 && fillPercent < 100 && (
                        <div className="text-xs text-gray-500">{fillPercent.toFixed(0)}%</div>
                      )}
                    </td>

                    {/* Order Value */}
                    <td className="px-4 py-3 text-right text-white font-mono">${orderValue}</td>

                    {/* Price */}
                    <td className="px-4 py-3 text-right text-white font-mono">
                      {order.type === 'MARKET'
                        ? 'Market'
                        : `$${parseFloat(order.price).toLocaleString()}`}
                    </td>

                    {/* Trigger */}
                    <td className="px-4 py-3 text-center text-gray-400">
                      {order.triggerPrice
                        ? `$${parseFloat(order.triggerPrice).toLocaleString()}`
                        : '—'}
                    </td>

                    {/* Margin Mode */}
                    <td className="px-4 py-3 text-center">
                      <span className="px-2 py-0.5 bg-[#2a2a2a] text-gray-300 rounded text-xs">
                        Cross
                      </span>
                    </td>

                    {/* Time */}
                    <td className="px-4 py-3 text-right text-gray-400 text-xs">
                      {getTimeAgo(order.createdAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default OrderHistoryPanel;
