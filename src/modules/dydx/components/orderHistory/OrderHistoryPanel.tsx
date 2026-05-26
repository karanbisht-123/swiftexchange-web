import { ChevronRight } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useDydxData } from '../../hooks/useDydxData';
import { type TrackedOrder } from '../../store/websocketStore';
import { type Order, dydxDataService, normalizeOrder } from '../../service/dydxOrderService';
import { getTimeAgo } from '../../utils/timeUtils';
import { EmptyState } from '../shared/EmptyState';
import { LoadingState } from '../shared/LoadingState';
import { MarketBadge } from '../shared/MarketBadge';
import { OrderDetailPanel } from '../shared/OrderDetailPanel';
import { Pagination } from '../shared/Pagination';
import { SideBadge, StatusIndicator } from '../shared/SideBadge';
import { SidePanel } from '../shared/SidePanel';
import { WalletConnectPrompt } from '../shared/WalletConnectPrompt';

type AnyOrder = Order & Partial<TrackedOrder>;

const ITEMS_PER_PAGE = 10;

const OrderHistoryPanel: React.FC = () => {
  const { orders: storeOrders, isConnected } = useDydxData();

  const [allOrders, setAllOrders] = useState<AnyOrder[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMoreData, setHasMoreData] = useState(true);

  const [selectedOrder, setSelectedOrder] = useState<AnyOrder | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  const initialLoadDoneRef = useRef(false);

  const getOrderTime = (order: AnyOrder): number => {
    const timeStr = order.updatedAt || order.goodTilBlockTime;
    return timeStr ? new Date(timeStr).getTime() : ((order as any)._firstSeenAt || 0);
  };

  useEffect(() => {
    if (!isConnected) {
      setAllOrders([]);
      setCurrentPage(1);
      setHasMoreData(true);
      initialLoadDoneRef.current = false;
      return;
    }

    if (initialLoadDoneRef.current) return;

    let isMounted = true;
    const fetchInitial = async () => {
      setLoadingOrders(true);
      setOrdersError(null);
      try {
        const initialOrders = await dydxDataService.getOrders(undefined, undefined, true, false);
        if (isMounted) {
          setAllOrders(initialOrders.map(normalizeOrder) as AnyOrder[]);
          initialLoadDoneRef.current = true;
        }
      } catch (err: any) {
        if (isMounted) setOrdersError(err.message || 'Error loading orders');
      } finally {
        if (isMounted) setLoadingOrders(false);
      }
    };
    fetchInitial();

    return () => { isMounted = false; };
  }, [isConnected]);

  useEffect(() => {
    if (storeOrders.length === 0) return;

    setAllOrders(prev => {
      const map = new Map<string, AnyOrder>();
      prev.forEach(o => map.set(o.id, normalizeOrder(o) as AnyOrder));
      storeOrders.forEach(o => map.set(o.id, normalizeOrder(o) as AnyOrder));
      return Array.from(map.values()).sort((a, b) => getOrderTime(b) - getOrderTime(a));
    });
  }, [storeOrders]);

  const totalPages = useMemo(() => {
    const pages = Math.ceil(allOrders.length / ITEMS_PER_PAGE);
    return hasMoreData && allOrders.length >= ITEMS_PER_PAGE ? pages : Math.max(pages, 1);
  }, [allOrders.length, hasMoreData]);

  const currentPageData = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return allOrders.slice(start, start + ITEMS_PER_PAGE);
  }, [allOrders, currentPage]);

  const loadMoreData = useCallback(async () => {
    if (loadingMore || !hasMoreData || !isConnected) return;

    setLoadingMore(true);
    try {
      const moreOrders = await dydxDataService.getOrders(undefined, undefined, true, false);

      if (moreOrders.length === 0) {
        setHasMoreData(false);
        return;
      }

      const normalizedMore = moreOrders.map(normalizeOrder);
      const oldestTime = allOrders.length
        ? getOrderTime(allOrders[allOrders.length - 1])
        : Date.now();
      const olderOrders = normalizedMore.filter(o => getOrderTime(o as AnyOrder) < oldestTime);

      if (olderOrders.length === 0) {
        setHasMoreData(false);
        return;
      }

      setAllOrders(prev => {
        const map = new Map<string, AnyOrder>(prev.map(o => [o.id, normalizeOrder(o) as AnyOrder]));
        olderOrders.forEach(o => map.set(o.id, o as AnyOrder));
        return Array.from(map.values()).sort((a, b) => getOrderTime(b) - getOrderTime(a));
      });

      if (moreOrders.length < ITEMS_PER_PAGE) setHasMoreData(false);
    } catch (err) {
      console.error('[OrderHistoryPanel] Failed to load more:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [allOrders, isConnected, loadingMore, hasMoreData]);

  const handlePageChange = useCallback(
    (page: number) => {
      setCurrentPage(page);
      if (allOrders.length < page * ITEMS_PER_PAGE && hasMoreData && !loadingMore) {
        loadMoreData();
      }
    },
    [allOrders.length, hasMoreData, loadingMore, loadMoreData]
  );

  const handleOrderClick = useCallback((order: AnyOrder) => {
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
              const filled = parseFloat((order as any).totalFilled || order.totalOptimisticFilled || '0');
              const size = parseFloat(order.size);
              const fillPercent = size > 0 ? (filled / size) * 100 : 0;

              return (
                <tr
                  key={order.id}
                  onClick={() => handleOrderClick(order)}
                  className="border-b border-color hover:bg-hover transition-colors cursor-pointer"
                >
                  <td className="px-4 py-3">
                    <MarketBadge market={order.ticker ?? ''} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <StatusIndicator status={order.status} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <SideBadge side={order.side as 'BUY' | 'SELL'} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="px-2 py-0.5 bg-[#2a2a2a] text-gray-300 rounded text-xs">
                      {order.clientMetadata === '1' && order.type === 'LIMIT' ? 'MARKET' : order.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-primary font-mono">{size.toFixed(4)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="text-primary font-mono">{filled.toFixed(4)}</div>
                    {fillPercent > 0 && fillPercent < 100 && (
                      <div className="text-xs text-gray-500">{fillPercent.toFixed(0)}%</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-primary font-mono">
                    {order.type === 'MARKET' || (order.clientMetadata === '1' && order.type === 'LIMIT')
                      ? 'Market'
                      : `$${parseFloat(order.price).toLocaleString()}`}
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

      <div className="md:hidden flex-1 overflow-auto space-y-0.5">
        {currentPageData.map(order => {
          const size = parseFloat(order.size);
          const price = parseFloat(order.price);

          return (
            <div
              key={order.id}
              onClick={() => handleOrderClick(order)}
              className="bg-secondary border border-color p-3 flex items-center justify-between active:bg-hover transition-colors"
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <MarketBadge market={order.ticker ?? ''} />
                <div className="flex min-w-0">
                  <div className="flex items-center gap-4">
                    <SideBadge side={order.side as 'BUY' | 'SELL'} />
                    <span className="text-primary font-mono text-xs">
                      {order.type === 'MARKET' || (order.clientMetadata === '1' && order.type === 'LIMIT')
                        ? 'Market'
                        : `$${price.toLocaleString()}`}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-start flex-col mr-2">
                <StatusIndicator status={order.status} />
                <span className="text-muted text-xs">{size.toFixed(4)}</span>
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

      <SidePanel isOpen={showDetail} onClose={handleCloseDetail} title="Order Details">
        {selectedOrder && <OrderDetailPanel order={selectedOrder as Order} />}
      </SidePanel>
    </div>
  );
};

export default OrderHistoryPanel;