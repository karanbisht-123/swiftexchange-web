import { Loader2, X } from 'lucide-react';
import React, { useState } from 'react';

import { useLocalState } from '../../hooks/useLocalState';
import { dydxTradingService } from '../../service/dydxTradingService';
import { dydxWalletService } from '../../service/dydxWalletService';
import { localStateManager } from '../../utils/localStateManager';

const OpenOrdersPanel: React.FC = () => {
  const { openOrders: orders } = useLocalState();
  const [cancelling, setCancelling] = useState<Set<string>>(new Set());
  const address = dydxWalletService.getAddress();
  const isConnected = !!address;
  const isLoading = localStateManager.getIsLoading();

  const handleCancel = async (order: any) => {
    setCancelling(prev => new Set(prev).add(order.id));
    localStateManager.handleOrderCancelling(order.id, order.clientId);

    try {
      const result = await dydxTradingService.cancelOrder(order);

      if (!result.success) {
        console.error(`Cancel failed: ${result.userMessage || 'Unknown error'}`);
        alert(`Cancel failed: ${result.userMessage || 'Unknown error'}`);
        localStateManager.handleOrderCancelFailed(order.id, order.clientId);
      }
    } catch (err: any) {
      console.error('Cancel error:', err);
      alert(`Cancel failed: ${err.message || 'Network error'}`);
      localStateManager.handleOrderCancelFailed(order.id, order.clientId);
    } finally {
      setCancelling(prev => {
        const next = new Set(prev);
        next.delete(order.id);
        return next;
      });
    }
  };

  const getTimeAgo = (ts: string) => {
    const diff = Date.now() - new Date(ts).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return new Date(ts).toLocaleDateString();
  };

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center text-gray-400">
        <h3 className="text-lg font-semibold text-white mb-2">Connect Wallet</h3>
        <p className="text-sm">Connect your wallet to manage orders</p>
      </div>
    );
  }

  if (isLoading && orders.length === 0) {
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
      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-secondary border-b border-gray-700 z-10">
            <tr className="text-gray-400 text-xs">
              <th className="text-left px-4  font-normal">Market</th>
              <th className="text-center px-4  font-normal">Status</th>
              <th className="text-center px-4  font-normal">Side</th>
              <th className="text-right px-4  font-normal">Amount</th>
              <th className="text-right px-4  font-normal">Filled</th>
              <th className="text-right px-4  font-normal">Order Value</th>
              <th className="text-right px-4  font-normal">Price</th>
              <th className="text-center px-4  font-normal">Trigger</th>
              <th className="text-center px-4  font-normal">Margin Mode</th>
              <th className="text-right px-4  font-normal">Good Till</th>
              <th className="text-center px-4  font-normal">Cancel</th>
            </tr>
          </thead>
          <tbody>
            {orders.map(order => {
              const isCancelling = cancelling.has(order.id) || order.status === 'CANCELLING';
              const orderValue = (parseFloat(order.size) * parseFloat(order.price)).toFixed(2);
              const isPending = order.id.startsWith('temp_');

              return (
                <tr
                  key={order.id}
                  className={`border-b border-[#2a2a2a] hover:bg-[#1a1a1a] transition-colors ${isCancelling ? 'opacity-50' : ''}`}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold">
                        {order.market.split('-')[0].slice(0, 3)}
                      </div>
                      <span className="text-white text-xs font-medium">
                        {order.market.split('-')[0]}
                      </span>
                    </div>
                  </td>

                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <div
                        className={`w-1.5 h-1.5 rounded-full ${
                          isCancelling
                            ? 'bg-gray-500'
                            : order.status === 'OPEN'
                              ? 'bg-blue-500'
                              : order.status === 'PARTIALLY_FILLED'
                                ? 'bg-yellow-500'
                                : 'bg-gray-500'
                        }`}
                      />
                      <span className="text-gray-300 text-xs">
                        {isCancelling
                          ? 'Cancelling'
                          : order.status === 'PARTIALLY_FILLED'
                            ? 'Partial'
                            : order.status}
                        {isPending && ' (Pending)'}
                      </span>
                    </div>
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

                  <td className="px-4 py-3 text-right text-white font-mono">${orderValue}</td>

                  <td className="px-4 py-3 text-right text-white font-mono">
                    ${parseFloat(order.price).toLocaleString()}
                  </td>

                  <td className="px-4 py-3 text-center text-gray-400 text-xs">
                    {order.triggerPrice
                      ? `$${parseFloat(order.triggerPrice).toLocaleString()}`
                      : '—'}
                  </td>

                  <td className="px-4 py-3 text-center">
                    <span className="px-2 py-0.5 bg-[#2a2a2a] text-gray-300 rounded text-xs">
                      Cross
                    </span>
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
