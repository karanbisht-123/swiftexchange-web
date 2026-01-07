import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useDydxData } from '../../hooks/useDydxData';
import { type Order, dydxDataService } from '../../service/dydxOrderService';
import { getTimeAgo } from '../../utils/timeUtils';
import { DataTable } from '../shared/DataTable';
import { EmptyState } from '../shared/EmptyState';
import { LoadingState } from '../shared/LoadingState';
import { MarketBadge } from '../shared/MarketBadge';
import { Pagination } from '../shared/Pagination';
import { SideBadge, StatusIndicator } from '../shared/SideBadge';
import { WalletConnectPrompt } from '../shared/WalletConnectPrompt';

const ITEMS_PER_PAGE = 10;

const OrderHistoryPanel: React.FC = () => {
  const {
    orders: storeOrders,
    loadingOrders,
    ordersError,
    isConnected,
    // refreshOrders,
    // isReceivingUpdates,
  } = useDydxData();

  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMoreData, setHasMoreData] = useState(true);

  const initialLoadDoneRef = useRef(false);
  const getOrderTime = (order: Order): number => {
    return new Date(order.updatedAt || order.createdAtHeight || '0').getTime();
  };
  useEffect(() => {
    if (!isConnected) {
      setAllOrders([]);
      setCurrentPage(1);
      setHasMoreData(true);
      initialLoadDoneRef.current = false;
    }
  }, [isConnected]);

  useEffect(() => {
    if (storeOrders.length > 0) {
      setAllOrders(prevOrders => {
        const ordersMap = new Map<string, Order>();
        prevOrders.forEach(o => ordersMap.set(o.id, o));
        storeOrders.forEach(o => ordersMap.set(o.id, o));
        return Array.from(ordersMap.values()).sort((a, b) => getOrderTime(b) - getOrderTime(a));
      });
      initialLoadDoneRef.current = true;
    }
  }, [storeOrders]);

  const totalPages = useMemo(() => {
    const currentPages = Math.ceil(allOrders.length / ITEMS_PER_PAGE);
    return hasMoreData && allOrders.length >= ITEMS_PER_PAGE
      ? currentPages
      : Math.max(currentPages, 1);
  }, [allOrders.length, hasMoreData]);
  const currentPageData = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    return allOrders.slice(startIndex, endIndex);
  }, [allOrders, currentPage]);

  const loadMoreData = useCallback(async () => {
    if (loadingMore || !hasMoreData || !isConnected) return;

    setLoadingMore(true);
    try {
      const moreOrders = await dydxDataService.getOrders(undefined, ITEMS_PER_PAGE, true, false);

      if (moreOrders.length === 0) {
        setHasMoreData(false);
        return;
      }
      const oldestOrder = allOrders[allOrders.length - 1];
      const oldestTime = oldestOrder ? getOrderTime(oldestOrder) : Date.now();
      const olderOrders = moreOrders.filter(o => getOrderTime(o) < oldestTime);

      if (olderOrders.length === 0) {
        setHasMoreData(false);
        return;
      }
      setAllOrders(prev => {
        const ordersMap = new Map<string, Order>();
        prev.forEach(o => ordersMap.set(o.id, o));
        olderOrders.forEach(o => ordersMap.set(o.id, o));

        return Array.from(ordersMap.values()).sort((a, b) => getOrderTime(b) - getOrderTime(a));
      });

      if (moreOrders.length < ITEMS_PER_PAGE) {
        setHasMoreData(false);
      }
    } catch (error) {
      console.error('[OrderHistoryPanel] Failed to load more data:', error);
    } finally {
      setLoadingMore(false);
    }
  }, [allOrders, isConnected, loadingMore, hasMoreData]);
  const handlePageChange = useCallback(
    (page: number) => {
      setCurrentPage(page);

      const requiredItems = page * ITEMS_PER_PAGE;
      if (allOrders.length < requiredItems && hasMoreData && !loadingMore) {
        loadMoreData();
      }
    },
    [allOrders.length, hasMoreData, loadingMore, loadMoreData]
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

  if (allOrders.length === 0 && !loadingOrders) {
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
      render: (order: Order) => <SideBadge side={order.side as 'BUY' | 'SELL'} />,
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
      header: 'TIF',
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
      {/* <div className="px-4 py-2 border-b border-gray-700 flex items-center justify-between bg-secondary">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-medium text-white">Order History</h3>
          <span className="text-xs text-gray-500">
            {allOrders.length} order{allOrders.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex items-center gap-3">

          {isReceivingUpdates && (
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              <span className="text-xs text-gray-400">Live</span>
            </div>
          )}
          <button
            onClick={() => refreshOrders()}
            disabled={loadingOrders}
            className="p-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors disabled:opacity-50"
            title="Refresh orders"
          >
            <svg className={`w-4 h-4 ${loadingOrders ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div> */}

      <div className="flex-1 overflow-auto">
        <DataTable data={currentPageData} columns={columns} getRowKey={order => order.id} />
      </div>
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={handlePageChange}
        loading={loadingMore}
        totalItems={allOrders.length}
        itemsPerPage={ITEMS_PER_PAGE}
        hasMore={hasMoreData}
      />
    </div>
  );
};

export default OrderHistoryPanel;
