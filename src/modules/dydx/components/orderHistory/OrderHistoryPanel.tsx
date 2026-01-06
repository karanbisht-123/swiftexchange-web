import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { useDydxData } from '../../hooks/useDydxData';
import { type Order, dydxDataService } from '../../service/dydxOrderService';
import { getTimeAgo } from '../../utils/timeUtils';
import { DataTable } from '../shared/DataTable';
import { EmptyState } from '../shared/EmptyState';
import { LoadingState } from '../shared/LoadingState';
import { MarketBadge } from '../shared/MarketBadge';
import { Pagination } from '../shared/Pagination';
import { SideBadge } from '../shared/SideBadge';
import { StatusIndicator } from '../shared/SideBadge';
import { WalletConnectPrompt } from '../shared/WalletConnectPrompt';

const ITEMS_PER_PAGE = 50;

const OrderHistoryPanel: React.FC = () => {
  const { orders, loadingOrders, ordersError, isConnected } = useDydxData();
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [loadingPage, setLoadingPage] = useState(false);
  const [pageCache, setPageCache] = useState<Map<number, Order[]>>(new Map());

  // Reset state on disconnect
  useEffect(() => {
    if (!isConnected) {
      setAllOrders([]);
      setCurrentPage(1);
      setPageCache(new Map());
    }
  }, [isConnected]);

  useEffect(() => {
    if (orders.length > 0 && allOrders.length === 0) {
      setAllOrders(orders);
      setPageCache(prev => new Map(prev).set(1, orders));
    }
  }, [orders, allOrders.length]);

  const totalPages = useMemo(() => {
    const currentDataPages = Math.ceil(allOrders.length / ITEMS_PER_PAGE);

    if (allOrders.length % ITEMS_PER_PAGE === 0 && allOrders.length >= ITEMS_PER_PAGE) {
      return currentDataPages + 0;
    }
    return Math.max(currentDataPages, 1);
  }, [allOrders.length]);

  const currentPageData = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    return allOrders.slice(startIndex, endIndex);
  }, [allOrders, currentPage]);

  const loadPageData = useCallback(
    async (page: number) => {
      if (!isConnected) return;

      // Check if we already have this page's data
      const requiredItems = page * ITEMS_PER_PAGE;
      if (allOrders.length >= requiredItems) {
        return;
      }

      // Check cache
      if (pageCache.has(page)) {
        return;
      }

      setLoadingPage(true);
      try {
        // Calculate how many more items we need
        const itemsToFetch = requiredItems - allOrders.length;
        const batchesToFetch = Math.ceil(itemsToFetch / ITEMS_PER_PAGE);

        let newOrders: Order[] = [];
        let lastOrder = allOrders[allOrders.length - 1];

        for (let i = 0; i < batchesToFetch; i++) {
          const moreOrders = await dydxDataService.getOrders(
            undefined,
            ITEMS_PER_PAGE,
            true,
            false
          );

          if (lastOrder) {
            const lastTime = new Date(lastOrder.updatedAt || lastOrder.createdAtHeight).getTime();
            const olderOrders = moreOrders.filter(order => {
              const orderTime = new Date(order.updatedAt || order.createdAtHeight).getTime();
              return orderTime < lastTime;
            });

            if (olderOrders.length === 0) break;

            newOrders = [...newOrders, ...olderOrders];
            lastOrder = olderOrders[olderOrders.length - 1];
          } else {
            newOrders = moreOrders;
            if (moreOrders.length > 0) {
              lastOrder = moreOrders[moreOrders.length - 1];
            }
          }

          if (moreOrders.length < ITEMS_PER_PAGE) break;
        }

        if (newOrders.length > 0) {
          const ordersMap = new Map<string, Order>();
          allOrders.forEach(order => ordersMap.set(order.id, order));
          newOrders.forEach(order => ordersMap.set(order.id, order));

          const updatedOrders = Array.from(ordersMap.values()).sort((a, b) => {
            const timeA = new Date(a.updatedAt || a.createdAtHeight).getTime();
            const timeB = new Date(b.updatedAt || b.createdAtHeight).getTime();
            return timeB - timeA;
          });

          setAllOrders(updatedOrders);

          // Cache the page
          const startIndex = (page - 1) * ITEMS_PER_PAGE;
          const endIndex = startIndex + ITEMS_PER_PAGE;
          const pageData = updatedOrders.slice(startIndex, endIndex);
          setPageCache(prev => new Map(prev).set(page, pageData));
        }
      } catch (error) {
        console.error('Failed to load page data:', error);
      } finally {
        setLoadingPage(false);
      }
    },
    [allOrders, isConnected, pageCache]
  );

  // Handle page change
  const handlePageChange = useCallback(
    (page: number) => {
      setCurrentPage(page);
      loadPageData(page);
    },
    [loadPageData]
  );

  if (!isConnected) {
    return <WalletConnectPrompt description="Connect your wallet to view your order history" />;
  }

  if (loadingOrders && allOrders.length === 0) {
    return <LoadingState message="Loading order history..." />;
  }

  if (ordersError && allOrders.length === 0) {
    return <EmptyState title="Error Loading Orders" description={ordersError} />;
  }

  if (allOrders.length === 0) {
    return <EmptyState title="No Orders" description="Place your first trade to see orders here" />;
  }

  const columns = [
    {
      key: 'market',
      header: 'Market',
      align: 'left' as const,
      render: (order: Order) => <MarketBadge market={order.ticker} />,
    },
    {
      key: 'status',
      header: 'Status',
      align: 'center' as const,
      render: (order: Order) => <StatusIndicator status={order.status} />,
    },
    {
      key: 'side',
      header: 'Side',
      align: 'center' as const,
      render: (order: Order) => <SideBadge side={order.side} />,
    },
    {
      key: 'type',
      header: 'Type',
      align: 'center' as const,
      render: (order: Order) => (
        <span className="px-2 py-0.5 bg-[#2a2a2a] text-gray-300 rounded text-xs">{order.type}</span>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right' as const,
      render: (order: Order) => (
        <span className="text-white font-mono">{parseFloat(order.size).toFixed(4)}</span>
      ),
    },
    {
      key: 'filled',
      header: 'Filled',
      align: 'right' as const,
      render: (order: Order) => {
        const filled = parseFloat(order.totalFilled || '0');
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
      render: (order: Order) => {
        const filled = parseFloat(order.totalFilled || '0');
        const price = parseFloat(order.price);
        const value = (filled * price).toFixed(2);
        return <span className="text-white font-mono">${parseFloat(value).toLocaleString()}</span>;
      },
    },
    {
      key: 'price',
      header: 'Price',
      align: 'right' as const,
      render: (order: Order) => (
        <span className="text-white font-mono">
          {order.type === 'MARKET' ? 'Market' : `$${parseFloat(order.price).toLocaleString()}`}
        </span>
      ),
    },
    {
      key: 'timeInForce',
      header: 'Time In Force',
      align: 'center' as const,
      render: (order: Order) => (
        <span className="text-gray-400 text-xs">{order.timeInForce || 'GTT'}</span>
      ),
    },
    {
      key: 'time',
      header: 'Time',
      align: 'right' as const,
      render: (order: Order) => {
        const timestamp = order.updatedAt || order.createdAtHeight;
        return <span className="text-gray-400 text-xs">{getTimeAgo(timestamp)}</span>;
      },
    },
  ];

  return (
    <div className="h-full flex flex-col bg-primary">
      <div className="flex-1 overflow-auto">
        <DataTable data={currentPageData} columns={columns} getRowKey={order => order.id} />
      </div>
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={handlePageChange}
        loading={loadingPage}
      />
    </div>
  );
};

export default OrderHistoryPanel;
