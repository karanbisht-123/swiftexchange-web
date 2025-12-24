import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { dydxDataService } from '../../service/dydxOrderService';
import { dydxWalletService } from '../../service/dydxWalletService';
import { getTimeAgo } from '../../utils/timeUtils';
import { DataTable } from '../shared/DataTable';
import { EmptyState } from '../shared/EmptyState';
import { LoadMoreButton } from '../shared/LoadMoreButton';
import { LoadingState } from '../shared/LoadingState';
import { MarketBadge } from '../shared/MarketBadge';
import { SideBadge } from '../shared/SideBadge';
import { StatusIndicator } from '../shared/SideBadge';
import { WalletConnectPrompt } from '../shared/WalletConnectPrompt';

interface HistoricalOrder {
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
  updatedAt: string;
  triggerPrice?: string;
  timeInForce?: string;
  goodTilBlockTime?: string;
}

const OrderHistoryPanel: React.FC = () => {
  const [orders, setOrders] = useState<HistoricalOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const address = dydxWalletService.getAddress();
  const isConnected = !!address;

  // Initial fetch of recent orders
  const fetchInitialOrders = useCallback(async () => {
    if (!isConnected) return;

    setLoading(true);
    try {
      // Fetch initial batch - use a reasonable limit (50-100)
      const initialOrders = await dydxDataService.fetchHistoricalOrders(50);
      setOrders(initialOrders);

      // Check if there might be more orders
      // If we got the full limit, there's likely more data
      setHasMore(initialOrders.length === 50);
    } catch (error) {
      console.error('Error fetching initial order history:', error);
      setOrders([]);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [isConnected]);

  // Load more older orders using proper pagination
  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore || orders.length === 0) return;

    setLoadingMore(true);
    try {
      // Get the last order's goodTilBlockTime for pagination
      const lastOrder = orders[orders.length - 1];

      // Use goodTilBlockTimeBeforeOrAt parameter for pagination
      // This fetches orders created before the last order's timestamp
      const moreOrders = await dydxDataService.fetchHistoricalOrders(
        50,
        lastOrder.goodTilBlockTime
      );

      // Filter out any duplicates (in case of edge cases)
      const existingIds = new Set(orders.map(o => o.id));
      const uniqueNewOrders = moreOrders.filter(o => !existingIds.has(o.id));

      if (uniqueNewOrders.length > 0) {
        setOrders(prev => [...prev, ...uniqueNewOrders]);
        // If we got less than requested, we've reached the end
        setHasMore(moreOrders.length === 50);
      } else {
        // No new orders returned, we've reached the end
        setHasMore(false);
      }
    } catch (error) {
      console.error('Error loading more orders:', error);
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore, orders]);

  // Fetch on mount and when wallet connects
  useEffect(() => {
    if (isConnected) {
      fetchInitialOrders();
    } else {
      setOrders([]);
      setHasMore(false);
    }
  }, [isConnected, fetchInitialOrders]);

  // Sort orders by creation date (newest first)
  const sortedOrders = useMemo(() => {
    return [...orders].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [orders]);

  if (!isConnected) {
    return <WalletConnectPrompt description="Connect your wallet to view your order history" />;
  }

  if (loading) {
    return <LoadingState message="Loading order history..." />;
  }

  if (sortedOrders.length === 0) {
    return <EmptyState title="No Orders" description="Place your first trade to see orders here" />;
  }

  const columns = [
    {
      key: 'market',
      header: 'Market',
      align: 'left' as const,
      render: (order: HistoricalOrder) => <MarketBadge market={order.market} />,
    },
    {
      key: 'status',
      header: 'Status',
      align: 'center' as const,
      render: (order: HistoricalOrder) => <StatusIndicator status={order.status} />,
    },
    {
      key: 'side',
      header: 'Side',
      align: 'center' as const,
      render: (order: HistoricalOrder) => <SideBadge side={order.side} />,
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right' as const,
      render: (order: HistoricalOrder) => (
        <span className="text-white font-mono">{parseFloat(order.size).toFixed(4)}</span>
      ),
    },
    {
      key: 'filled',
      header: 'Filled',
      align: 'right' as const,
      render: (order: HistoricalOrder) => {
        const filled = parseFloat(order.filledSize || '0');
        const size = parseFloat(order.size);
        const fillPercent = size > 0 ? (filled / size) * 100 : 0;
        return (
          <div className="text-right">
            <div className="text-white font-mono">{filled.toFixed(4)}</div>
            {fillPercent > 0 && fillPercent < 100 && (
              <div className="text-xs text-gray-500">{fillPercent.toFixed(0)}%</div>
            )}
          </div>
        );
      },
    },
    {
      key: 'orderValue',
      header: 'Order Value',
      align: 'right' as const,
      render: (order: HistoricalOrder) => {
        const filled = parseFloat(order.filledSize || '0');
        const price = parseFloat(order.price);
        const value = (filled * price).toFixed(2);
        return <span className="text-white font-mono">${value}</span>;
      },
    },
    {
      key: 'price',
      header: 'Price',
      align: 'right' as const,
      render: (order: HistoricalOrder) => (
        <span className="text-white font-mono">
          {order.type === 'MARKET' ? 'Market' : `$${parseFloat(order.price).toLocaleString()}`}
        </span>
      ),
    },
    {
      key: 'trigger',
      header: 'Trigger',
      align: 'center' as const,
      render: (order: HistoricalOrder) => (
        <span className="text-gray-400">
          {order.triggerPrice ? `$${parseFloat(order.triggerPrice).toLocaleString()}` : '—'}
        </span>
      ),
    },
    {
      key: 'marginMode',
      header: 'Margin Mode',
      align: 'center' as const,
      render: () => (
        <span className="px-2 py-0.5 bg-[#2a2a2a] text-gray-300 rounded text-xs">Cross</span>
      ),
    },
    {
      key: 'time',
      header: 'Time',
      align: 'right' as const,
      render: (order: HistoricalOrder) => (
        <span className="text-gray-400 text-xs">{getTimeAgo(order.createdAt)}</span>
      ),
    },
  ];

  return (
    <div className="h-full flex flex-col bg-primary">
      <div className="flex-1 overflow-auto">
        <DataTable data={sortedOrders} columns={columns} getRowKey={order => order.id} />
        <LoadMoreButton onClick={loadMore} loading={loadingMore} show={hasMore} />
      </div>
    </div>
  );
};

export default OrderHistoryPanel;
