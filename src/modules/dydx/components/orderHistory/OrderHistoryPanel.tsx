import { ChevronRight } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useDydxData } from '../../hooks/useDydxData';
import { type Order, dydxDataService, normalizeOrder } from '../../service/dydxOrderService';
import useMarketStore from '../../store/marketStore';
import { type TrackedOrder } from '../../store/websocketStore';
import { formatMarketPrice, formatNumericWithCommas } from '../../utils/BigNumberUtils';
import { currencyService } from '../../utils/currencyService';
import { capitalizeFirst, formatTimeAgoCompact, getDisplayOrderType } from '../../utils/orderUtils';
import { EmptyState } from '../shared/EmptyState';
import { LoadingState } from '../shared/LoadingState';
import { MarketBadge } from '../shared/MarketBadge';
import { OrderDetailPanel } from '../shared/OrderDetailPanel';
import { Pagination } from '../shared/Pagination';
import { StatusIndicator } from '../shared/SideBadge';
import { SidePanel } from '../shared/SidePanel';
import { WalletConnectPrompt } from '../shared/WalletConnectPrompt';

type AnyOrder = Order & Partial<TrackedOrder>;

const ITEMS_PER_PAGE = 10;

const getOrderTime = (order: AnyOrder): number => {
  const timeStr = order.updatedAt || (order as any)._firstSeenAt || order.createdAtHeight || '';
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
        const map = new Map<string, AnyOrder>(prev.map(o => [o.id, normalizeOrder(o) as AnyOrder]));
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
    <div className="h-full bg-secondary overflow-y-visible md:overflow-auto flex flex-col relative">
      <div className="hidden md:block flex-1 overflow-auto">
        <table className="w-full text-left border-collapse">
          <thead className="bg-secondary text-muted text-[10px] uppercase tracking-wider font-semibold sticky top-0 z-10 border-b border-color">
            <tr>
              <th className="px-3 py-2 font-semibold">Market</th>
              <th className="px-2 py-2 text-left font-semibold">Status</th>
              <th className="px-2 py-2 text-center font-semibold">Side</th>
              <th className="px-2 py-2 text-right font-semibold">Amount</th>
              <th className="px-2 py-2 text-right font-semibold">Filled</th>
              <th className="px-2 py-2 text-right font-semibold">Price</th>
              <th className="px-2 py-2 text-center font-semibold">Trigger</th>
              <th className="px-2 py-2 text-center font-semibold text-[10px] whitespace-nowrap">
                Margin Mode
              </th>
              <th className="px-2 py-2 text-right font-semibold">Time</th>
            </tr>
          </thead>
          <tbody>
            {currentPageData.map(order => {
              const filled = parseFloat(
                (order as any).totalFilled || order.totalOptimisticFilled || '0'
              );
              const size = parseFloat(order.size);
              const fillPercent = size > 0 ? (filled / size) * 100 : 0;
              const displayType = getDisplayOrderType(order);
              const rawMarginMode =
                (order as any).marginMode || (order as any).margin_mode || 'CROSS';
              const marginMode = capitalizeFirst(rawMarginMode);

              const marketTicker = order.ticker ?? '';
              const mkt = marketCache[marketTicker];
              const stepSize = mkt?.stepSize || '0.0001';
              const decimals = currencyService.getStepSizeDecimals(stepSize);

              const sizeStr = formatNumericWithCommas(size, decimals);
              const filledStr = formatNumericWithCommas(filled, decimals);
              const priceStr =
                displayType === 'MARKET' ? 'Market' : formatMarketPrice(order.price, '$');

              return (
                <tr
                  key={order.id}
                  onClick={() => handleOrderClick(order)}
                  className="border-b border-color hover:bg-hover transition-colors cursor-pointer text-[11px]"
                >
                  <td className="px-3 py-1.5">
                    <MarketBadge market={marketTicker} />
                  </td>
                  <td className="px-2 py-1.5 text-left">
                    <StatusIndicator status={order.status} type={displayType} />
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${order.side === 'BUY' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}
                    >
                      {capitalizeFirst(order.side)}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-right text-primary font-mono">{sizeStr}</td>
                  <td className="px-2 py-1.5 text-right">
                    <div className="text-primary font-mono">{filledStr}</div>
                    {fillPercent > 0 && fillPercent < 100 && (
                      <div className="text-[9px] text-gray-500">{fillPercent.toFixed(0)}%</div>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right text-primary font-mono">{priceStr}</td>
                  <td className="px-2 py-1.5 text-center text-gray-400 font-bold">—</td>
                  <td className="px-2 py-1.5 text-center">
                    <span className="px-1.5 py-0.5 bg-[#2B2B36] text-gray-300 rounded text-[9px] font-bold">
                      {marginMode}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-right text-gray-400 font-mono">
                    {formatTimeAgoCompact(
                      order.updatedAt || (order as any)._firstSeenAt || order.createdAtHeight || ''
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="md:hidden w-full flex flex-col space-y-2 p-2 pb-4">
        {currentPageData.map(order => {
          const size = parseFloat(order.size);
          const displayType = getDisplayOrderType(order);

          const marketTicker = order.ticker ?? '';
          const mkt = marketCache[marketTicker];
          const stepSize = mkt?.stepSize || '0.0001';
          const decimals = currencyService.getStepSizeDecimals(stepSize);

          const sizeStr = formatNumericWithCommas(size, decimals);
          const priceStr =
            displayType === 'MARKET' ? 'Market' : formatMarketPrice(order.price, '$');
          const timeStr =
            order.updatedAt || (order as any)._firstSeenAt || order.createdAtHeight || '';

          return (
            <div
              key={order.id}
              onClick={() => handleOrderClick(order)}
              className="bg-secondary border border-color rounded-xl p-3 shadow-sm active:opacity-70 transition-opacity"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <MarketBadge market={marketTicker} />
                  <span
                    className={`px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wide ${order.side === 'BUY' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}
                  >
                    {capitalizeFirst(order.side)}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-muted text-[10px]">{formatTimeAgoCompact(timeStr)}</span>
                  <ChevronRight size={14} className="text-muted" />
                </div>
              </div>

              <div className="flex justify-between items-center mb-3">
                <StatusIndicator status={order.status} type={displayType} />
              </div>

              <div className="flex justify-between items-end px-1">
                <div className="flex flex-col">
                  <span className="text-[10px] text-muted font-medium mb-1 uppercase tracking-wider">
                    Price
                  </span>
                  <span className="text-primary font-mono text-sm font-medium">{priceStr}</span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-[10px] text-muted font-medium mb-1 uppercase tracking-wider">
                    Amount
                  </span>
                  <span className="text-primary font-mono text-sm font-medium">{sizeStr}</span>
                </div>
              </div>
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
