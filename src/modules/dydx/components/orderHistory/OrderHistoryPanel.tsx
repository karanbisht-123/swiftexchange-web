import React, { useCallback, useMemo, useState } from 'react';

import { useLocalState } from '../../hooks/useLocalState';
import { dydxDataService } from '../../service/dydxOrderService';
import { dydxWalletService } from '../../service/dydxWalletService';
import { localStateManager } from '../../utils/localStateManager';
import { getTimeAgo } from '../../utils/timeUtils';
import { DataTable } from '../shared/DataTable';
import { EmptyState } from '../shared/EmptyState';
import { LoadMoreButton } from '../shared/LoadMoreButton';
import { LoadingState } from '../shared/LoadingState';
import { MarketBadge } from '../shared/MarketBadge';
import { SideBadge } from '../shared/SideBadge';
import { StatusIndicator } from '../shared/SideBadge';
import { WalletConnectPrompt } from '../shared/WalletConnectPrompt';

const OrderHistoryPanel: React.FC = () => {
  const { orderHistory: liveHistory } = useLocalState();
  const [olderHistory, setOlderHistory] = useState<any[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const address = dydxWalletService.getAddress();
  const isConnected = !!address;
  const isLoading = localStateManager.getIsLoading();

  const allOrders = useMemo(() => {
    const uniqueMap = new Map();
    [...liveHistory, ...olderHistory].forEach(item => uniqueMap.set(item.id, item));
    return Array.from(uniqueMap.values()).sort(
      (a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [liveHistory, olderHistory]);

  // Load more orders
  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore || allOrders.length === 0) return;

    setLoadingMore(true);
    try {
      const lastOrder = allOrders[allOrders.length - 1];
      const moreOrders = await dydxDataService.fetchHistoricalOrders(50, lastOrder.createdAt);

      const mapped = moreOrders.map((o: any) => ({
        id: o.id,
        clientId: Number(o.clientId || 0),
        market: o.market,
        side: o.side.toUpperCase() as 'BUY' | 'SELL',
        type: o.type,
        size: o.size,
        price: o.price,
        filledSize: o.filledSize || '0',
        status: o.status,
        createdAt: o.createdAt,
        updatedAt: o.updatedAt,
        triggerPrice: o.triggerPrice,
        timeInForce: o.timeInForce,
      }));

      const newOrders = mapped.filter(o => !allOrders.some(existing => existing.id === o.id));

      if (newOrders.length === 0) {
        setHasMore(false);
      } else {
        setOlderHistory(prev => [...prev, ...newOrders]);
        setHasMore(moreOrders.length === 50);
      }
    } catch (error) {
      console.error('Error loading more orders:', error);
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore, allOrders]);

  if (!isConnected) {
    return (
      <WalletConnectPrompt description="Connect and deposit funds to view your order history" />
    );
  }

  if (isLoading && allOrders.length === 0) {
    return <LoadingState message="Loading order history..." />;
  }

  if (allOrders.length === 0) {
    return <EmptyState title="No Orders" description="Place your first trade to see orders here" />;
  }

  const columns = [
    {
      key: 'market',
      header: 'Market',
      align: 'left' as const,
      render: (order: any) => <MarketBadge market={order.market} />,
    },
    {
      key: 'status',
      header: 'Status',
      align: 'center' as const,
      render: (order: any) => <StatusIndicator status={order.status} />,
    },
    {
      key: 'side',
      header: 'Side',
      align: 'center' as const,
      render: (order: any) => <SideBadge side={order.side} />,
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right' as const,
      render: (order: any) => (
        <span className="text-white font-mono">{parseFloat(order.size).toFixed(4)}</span>
      ),
    },
    {
      key: 'filled',
      header: 'Filled',
      align: 'right' as const,
      render: (order: any) => {
        const fillPercent = (parseFloat(order.filledSize) / parseFloat(order.size)) * 100;
        return (
          <div>
            <div className="text-white font-mono">{parseFloat(order.filledSize).toFixed(4)}</div>
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
      render: (order: any) => {
        const value = (parseFloat(order.filledSize) * parseFloat(order.price)).toFixed(2);
        return <span className="text-white font-mono">${value}</span>;
      },
    },
    {
      key: 'price',
      header: 'Price',
      align: 'right' as const,
      render: (order: any) => (
        <span className="text-white font-mono">
          {order.type === 'MARKET' ? 'Market' : `$${parseFloat(order.price).toLocaleString()}`}
        </span>
      ),
    },
    {
      key: 'trigger',
      header: 'Trigger',
      align: 'center' as const,
      render: (order: any) => (
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
      render: (order: any) => (
        <span className="text-gray-400 text-xs">{getTimeAgo(order.createdAt)}</span>
      ),
    },
  ];

  return (
    <div className="h-full flex flex-col bg-primary">
      <div className="flex-1 overflow-auto">
        <DataTable data={allOrders} columns={columns} getRowKey={order => order.id} />
        <LoadMoreButton onClick={loadMore} loading={loadingMore} show={hasMore} />
      </div>
    </div>
  );
};

export default OrderHistoryPanel;
