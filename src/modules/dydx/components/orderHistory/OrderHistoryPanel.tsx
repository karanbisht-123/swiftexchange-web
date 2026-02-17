import { ChevronRight } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useDydxData } from '../../hooks/useDydxData';
import { type Order, dydxDataService } from '../../service/dydxOrderService';
import { getTimeAgo } from '../../utils/timeUtils';
import { EmptyState } from '../shared/EmptyState';
import { LoadingState } from '../shared/LoadingState';
import { MarketBadge } from '../shared/MarketBadge';
import { OrderDetailPanel } from '../shared/OrderDetailPanel';
import { Pagination } from '../shared/Pagination';
import { SideBadge, StatusIndicator } from '../shared/SideBadge';
import { SidePanel } from '../shared/SidePanel';
import { WalletConnectPrompt } from '../shared/WalletConnectPrompt';

const ITEMS_PER_PAGE = 10;

const OrderHistoryPanel: React.FC = () => {
  const { orders: storeOrders, loadingOrders, ordersError, isConnected } = useDydxData();

  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMoreData, setHasMoreData] = useState(true);

  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  const initialLoadDoneRef = useRef(false);

  const getOrderTime = (order: Order): number => {
    return order.updatedAt ? new Date(order.updatedAt).getTime() : 0;
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
        storeOrders.forEach(o => ordersMap.set(o.id, o));
        prevOrders.forEach(o => {
          if (!ordersMap.has(o.id)) {
            ordersMap.set(o.id, o);
          }
        });
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

  const handleOrderClick = useCallback((order: Order) => {
    setSelectedOrder(order);
    setShowDetail(true);
  }, []);

  const handleCloseDetail = useCallback(() => {
    setShowDetail(false);
    setTimeout(() => setSelectedOrder(null), 300);
  }, []);

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

  return (
    <div className="h-full flex flex-col bg-primary">
      <div className="hidden md:block flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-secondary border-b border-color z-10">
            <tr className="text-muted text-xs">
              <th className="text-left px-4 py-3 font-medium">Market</th>
              <th className="text-center px-4 py-3 font-medium">Status</th>
              <th className="text-center px-4 py-3 font-medium">Side</th>
              <th className="text-center px-4 py-3 font-medium">Type</th>
              <th className="text-right px-4 py-3 font-medium">Amount</th>
              <th className="text-right px-4 py-3 font-medium">Filled</th>
              <th className="text-right px-4 py-3 font-medium">Price</th>
              <th className="text-center px-4 py-3 font-medium">TIF</th>
              <th className="text-right px-4 py-3 font-medium">Time</th>
            </tr>
          </thead>
          <tbody>
            {currentPageData.map(order => {
              const filled = parseFloat(order.totalFilled || '0');
              const size = parseFloat(order.size);
              const fillPercent = size > 0 ? (filled / size) * 100 : 0;

              return (
                <tr
                  key={order.id}
                  onClick={() => handleOrderClick(order)}
                  className="border-b border-color hover:bg-hover transition-colors cursor-pointer"
                >
                  <td className="px-4 py-3">
                    <MarketBadge market={order.ticker} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <StatusIndicator status={order.status} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <SideBadge side={order.side as 'BUY' | 'SELL'} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="px-2 py-0.5 bg-[#2a2a2a] text-gray-300 rounded text-xs">
                      {order.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-primary font-mono">
                    {size.toFixed(4)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="text-primary font-mono">{filled.toFixed(4)}</div>
                    {fillPercent > 0 && fillPercent < 100 && (
                      <div className="text-xs text-gray-500">{fillPercent.toFixed(0)}%</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-primary font-mono">
                    {order.type === 'MARKET' ? 'Market' : `$${parseFloat(order.price).toLocaleString()}`}
                  </td>
                  <td className="px-4 py-3 text-center text-gray-400 text-xs">
                    {order.timeInForce || 'GTT'}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-400 text-xs">
                    {getTimeAgo(order.updatedAt || '')}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="md:hidden flex-1 overflow-auto  space-y-0.5">
        {currentPageData.map(order => {
          const size = parseFloat(order.size);
          const price = parseFloat(order.price);

          return (
            <div
              key={order.id}
              onClick={() => handleOrderClick(order)}
              className="bg-secondary border border-color  p-3 flex items-center justify-between active:bg-hover transition-colors"
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <MarketBadge market={order.ticker} />
                <div className="flex  min-w-0">
                  <div className="flex items-center gap-4">
                    <SideBadge side={order.side as 'BUY' | 'SELL'} />
                    <span className="text-primary font-mono text-xs">
                      {order.type === 'MARKET' ? 'Market' : `$${price.toLocaleString()}`}
                    </span>
                  </div>

                </div>
              </div>
              <div className="flex items-start flex-col mr-2  ">
                <StatusIndicator status={order.status} />
                <span className="text-muted text-xs">
                  {size.toFixed(4)}
                </span>
              </div>
              <ChevronRight size={16} className="text-muted flex-shrink-0" />
            </div>
          );
        })}
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

      <SidePanel
        isOpen={showDetail}
        onClose={handleCloseDetail}
        title="Order Details"
      >
        {selectedOrder && <OrderDetailPanel order={selectedOrder} />}
      </SidePanel>
    </div>
  );
};

export default OrderHistoryPanel;
