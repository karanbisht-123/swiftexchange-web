import { X } from 'lucide-react';
import React, { useEffect, useState } from 'react';

import { dydxWalletService } from '../../service/dydxWalletService';

interface OpenOrder {
  id: string;
  clientId: string;
  market: string;
  side: 'BUY' | 'SELL';
  type: string;
  size: string;
  price: string;
  filledSize: string;
  status: string;
  createdAt: string;
  triggerPrice?: string;
}

const OpenOrdersPanel: React.FC = () => {
  const [orders, setOrders] = useState<OpenOrder[]>([]);
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

    const fetchOpenOrders = async () => {
      setLoading(true);
      try {
        const response = await indexer.account.getSubaccountOrders(
          address!,
          subNo,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          100
        );

        const openOrders: OpenOrder[] = (response || [])
          .map((o: any) => ({
            id: o.id,
            clientId: o.clientId,
            market: o.ticker,
            side: o.side.toUpperCase() as 'BUY' | 'SELL',
            type: o.type,
            size: o.size,
            price: o.price,
            filledSize: o.totalFilled || '0',
            status: o.status,
            createdAt: o.updatedAt || o.createdAt,
            triggerPrice: o.triggerPrice,
          }))
          .sort(
            (a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );

        setOrders(openOrders);
      } catch (error) {
        console.error('Error fetching open orders:', error);
        setOrders([]);
      } finally {
        setLoading(false);
      }
    };

    fetchOpenOrders();
    const interval = setInterval(fetchOpenOrders, 20000);
    return () => clearInterval(interval);
  }, [address, indexer, subNo]);

  const getTimeAgo = (timestamp: string) => {
    const diff = Date.now() - new Date(timestamp).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    const weeks = Math.floor(diff / 604800000);

    if (minutes < 60) return `${minutes}m`;
    if (hours < 24) return `${hours}h`;
    if (days < 7) return `${days}d`;
    return `${weeks}w`;
  };

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
        <h3 className="text-lg font-semibold text-white mb-2">Connect Your Wallet</h3>
        <p className="text-gray-400 text-sm">Connect to view your open orders</p>
      </div>
    );
  }

  if (loading && orders.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-400">Loading orders...</div>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
        <h3 className="text-lg font-semibold text-white mb-2">No Open Orders</h3>
        <p className="text-gray-400 text-sm">Your open orders will appear here</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-primary">
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-secondary border-b border-gray-600 z-10">
            <tr className="text-gray-400 text-xs">
              <th className="text-left px-4 py-3 font-normal">Market</th>
              <th className="text-center px-4 py-3 font-normal">Side</th>
              <th className="text-right px-4 py-3 font-normal">Amount</th>
              <th className="text-right px-4 py-3 font-normal">Filled</th>
              <th className="text-right px-4 py-3 font-normal">Value</th>
              <th className="text-right px-4 py-3 font-normal">Price</th>
              <th className="text-center px-4 py-3 font-normal">Trigger</th>
              <th className="text-right px-4 py-3 font-normal">Time</th>
              <th className="text-center px-4 py-3 font-normal">Action</th>
            </tr>
          </thead>
          <tbody>
            {orders.map(order => {
              const value = (parseFloat(order.size) * parseFloat(order.price)).toFixed(2);
              const filledPct =
                parseFloat(order.size) > 0
                  ? (parseFloat(order.filledSize) / parseFloat(order.size)) * 100
                  : 0;

              return (
                <tr
                  key={order.id}
                  className="border-b border-[#2a2a2a] hover:bg-[#1a1a1a] transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold">
                        {order.market.split('-')[0].charAt(0)}
                      </div>
                      <span className="text-white font-medium">{order.market.split('-')[0]}</span>
                    </div>
                  </td>

                  <td className="px-4 py-3 text-center">
                    <span
                      className={`px-2 py-1 rounded text-xs font-semibold ${
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

                  <td className="px-4 py-3 text-right">
                    <div className="text-white font-mono">
                      {parseFloat(order.filledSize).toFixed(4)}
                    </div>
                    {filledPct > 0 && (
                      <div className="text-xs text-gray-500">{filledPct.toFixed(0)}%</div>
                    )}
                  </td>

                  <td className="px-4 py-3 text-right text-white font-mono">${value}</td>

                  <td className="px-4 py-3 text-right text-white font-mono">
                    {order.type.includes('MARKET')
                      ? 'Market'
                      : `$${parseFloat(order.price).toLocaleString()}`}
                  </td>

                  <td className="px-4 py-3 text-center text-gray-400 text-xs">
                    {order.triggerPrice
                      ? `$${parseFloat(order.triggerPrice).toLocaleString()}`
                      : '—'}
                  </td>

                  <td className="px-4 py-3 text-right text-gray-400 text-xs">
                    {getTimeAgo(order.createdAt)}
                  </td>

                  <td className="px-4 py-3 text-center">
                    <button
                      className="p-1.5 rounded bg-red-600 hover:bg-red-500 text-white transition-colors"
                      title="Cancel Order"
                    >
                      <X className="w-4 h-4" />
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
