import { ChevronRight } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDydxData } from '../../hooks/useDydxData';
import { type TrackedOrder } from '../../store/websocketStore';
import { type Order, dydxDataService, normalizeOrder } from '../../service/dydxOrderService';
import { getDisplayOrderType, formatTimeAgoCompact, capitalizeFirst } from '../../utils/orderUtils';
import { EmptyState } from '../shared/EmptyState';
import { LoadingState } from '../shared/LoadingState';
import { MarketBadge } from '../shared/MarketBadge';
import { OrderDetailPanel } from '../shared/OrderDetailPanel';
import { Pagination } from '../shared/Pagination';
import { StatusIndicator } from '../shared/SideBadge';
import { SidePanel } from '../shared/SidePanel';
import { WalletConnectPrompt } from '../shared/WalletConnectPrompt';
import useMarketStore from '../../store/marketStore';
import { formatMarketPrice, formatNumericWithCommas } from '../../utils/BigNumberUtils';
import { currencyService } from '../../utils/currencyService';

type AnyOrder = Order & Partial<TrackedOrder>;

const ITEMS_PER_PAGE = 10;

const getOrderTime = (order: AnyOrder): number => {
  const timeStr = order.updatedAt || order.goodTilBlockTime;
  return timeStr ? new Date(timeStr).getTime() : (order as any)._firstSeenAt || 0;
};

const OrderHistoryPanel: React.FC = () => {
  const { orders: storeOrders, isConnected } = useDydxData();
  const marketCache = useMarketStore(state => state.marketCache);
  const [allOrders, setAllOrders] = useState<AnyOrder[]>(() => {
    const cached = dydxDataService.getCachedOrders(undefined, undefined, true);
    return cached ? (cached.map(normalizeOrder) as AnyOrder[]) : [];
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);


  const [hasMoreData, setHasMoreData] = useState(() => allOrders.length >= ITEMS_PER_PAGE);

  const [selectedOrder, setSelectedOrder] = useState<AnyOrder | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  const initialLoadDoneRef = useRef(false);

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
      const hasCache = dydxDataService.getCachedOrders(undefined, undefined, true);
      if (!hasCache) {
        setLoadingOrders(true);
      }
      setOrdersError(null);
      try {
        const initialOrders = await dydxDataService.getOrders(undefined, undefined, true, true);
        if (isMounted) {
          setAllOrders(initialOrders.map(normalizeOrder) as AnyOrder[]);
          setHasMoreData(initialOrders.length >= ITEMS_PER_PAGE);
          initialLoadDoneRef.current = true;
        }
      } catch (err: any) {
        if (isMounted) setOrdersError(err.message || 'Error loading orders');
      } finally {
        if (isMounted) setLoadingOrders(false);
      }
    };
    fetchInitial();

    return () => {
      isMounted = false;
    };
  }, [isConnected]);

  useEffect(() => {
    const cacheKey = `orders_all_default_true`;
    const unsubscribe = dydxDataService.subscribe((key, data) => {
      if (key === cacheKey) {
        setAllOrders(data.map(normalizeOrder) as AnyOrder[]);
        initialLoadDoneRef.current = true;
      }
    });
    return unsubscribe;
  }, []);

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
    if (hasMoreData && allOrders.length >= currentPage * ITEMS_PER_PAGE) {
      return Math.max(pages, currentPage + 1);
    }
    return Math.max(pages, 1);
  }, [allOrders.length, hasMoreData, currentPage]);

  const currentPageData = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return allOrders.slice(start, start + ITEMS_PER_PAGE);
  }, [allOrders, currentPage]);

  const loadMoreData = useCallback(async () => {
    if (loadingMore || !hasMoreData || !isConnected || allOrders.length === 0) return;

    setLoadingMore(true);
    try {
      const oldestOrder = allOrders[allOrders.length - 1];
      const cursorTime = oldestOrder ? getOrderTime(oldestOrder) : 0;
      const cursor = cursorTime > 0 ? new Date(cursorTime).toISOString() : undefined;

      const moreOrders = await dydxDataService.getOrders(undefined, undefined, true, false, cursor);

      if (moreOrders.length === 0) {
        setHasMoreData(false);
        return;
      }
      const normalizedMore = moreOrders.map(normalizeOrder) as AnyOrder[];

      setAllOrders(prev => {
        const map = new Map<string, AnyOrder>(
          prev.map(o => [o.id, normalizeOrder(o) as AnyOrder]),
        );
        normalizedMore.forEach(o => map.set(o.id, o));
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
    [allOrders.length, hasMoreData, loadingMore, loadMoreData],
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
              <th className="text-left px-4 py-3 font-medium">Type</th>
              <th className="text-right px-4 py-3 font-medium">Amount</th>
              <th className="text-right px-4 py-3 font-medium">Filled</th>
              <th className="text-right px-4 py-3 font-medium">Price</th>
              <th className="text-center px-4 py-3 font-medium">TIF</th>
              <th className="text-right px-4 py-3 font-medium">Time</th>
            </tr>
          </thead>
          <tbody>
            {currentPageData.map(order => {
              const filled = parseFloat(
                (order as any).totalFilled || order.totalOptimisticFilled || '0',
              );
              const size = parseFloat(order.size);
              const fillPercent = size > 0 ? (filled / size) * 100 : 0;
              const displayType = getDisplayOrderType(order);

              const marketTicker = order.ticker ?? '';
              const mkt = marketCache[marketTicker];
              const stepSize = mkt?.stepSize || '0.0001';
              const decimals = currencyService.getStepSizeDecimals(stepSize);

              const sizeStr = formatNumericWithCommas(size, decimals);
              const filledStr = formatNumericWithCommas(filled, decimals);
              const priceStr = displayType === 'MARKET'
                ? 'Market'
                : formatMarketPrice(order.price, '$');

              return (
                <tr
                  key={order.id}
                  onClick={() => handleOrderClick(order)}
                  className="border-b border-color hover:bg-hover transition-colors cursor-pointer"
                >
                  <td className="px-4 py-3">
                    <MarketBadge market={marketTicker} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <StatusIndicator status={order.status} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${order.side === 'BUY' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                      {capitalizeFirst(order.side)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-left">
                    <span className="text-primary text-xs">
                      {capitalizeFirst(displayType)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-primary font-mono">{sizeStr}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="text-primary font-mono">{filledStr}</div>
                    {fillPercent > 0 && fillPercent < 100 && (
                      <div className="text-xs text-gray-500">{fillPercent.toFixed(0)}%</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-primary font-mono">
                    {priceStr}
                  </td>
                  <td className="px-4 py-3 text-center text-gray-400 text-xs">
                    {order.timeInForce || 'GTT'}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-400 text-xs">
                    {formatTimeAgoCompact(order.updatedAt || order.goodTilBlockTime || '')}
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
          const displayType = getDisplayOrderType(order);

          const marketTicker = order.ticker ?? '';
          const mkt = marketCache[marketTicker];
          const stepSize = mkt?.stepSize || '0.0001';
          const decimals = currencyService.getStepSizeDecimals(stepSize);

          const sizeStr = formatNumericWithCommas(size, decimals);
          const priceStr = displayType === 'MARKET'
            ? 'Market'
            : formatMarketPrice(order.price, '$');

          return (
            <div
              key={order.id}
              onClick={() => handleOrderClick(order)}
              className="bg-secondary border border-color p-3 flex items-center justify-between active:bg-hover transition-colors"
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <MarketBadge market={marketTicker} />
                <div className="flex min-w-0">
                  <div className="flex items-center gap-4">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${order.side === 'BUY' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                      {capitalizeFirst(order.side)}
                    </span>
                    <span className="text-primary font-mono text-xs">
                      {priceStr}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-start flex-col mr-2">
                <StatusIndicator status={order.status} />
                <span className="text-muted text-xs font-mono">{sizeStr}</span>
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
