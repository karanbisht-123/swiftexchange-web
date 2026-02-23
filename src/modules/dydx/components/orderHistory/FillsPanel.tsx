import { ChevronRight } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useDydxData } from '../../hooks/useDydxData';
import { type Fill, dydxDataService } from '../../service/dydxOrderService';
import { getTimeAgo } from '../../utils/timeUtils';
import { FillDetailPanel } from '../shared/FillDetailPanel';
import { EmptyState } from '../shared/EmptyState';
import { LoadingState } from '../shared/LoadingState';
import { MarketBadge } from '../shared/MarketBadge';
import { Pagination } from '../shared/Pagination';
import { SidePanel } from '../shared/SidePanel';
import { SideBadge } from '../shared/SideBadge';
import { WalletConnectPrompt } from '../shared/WalletConnectPrompt';

const ITEMS_PER_PAGE = 10;

const FillsPanel: React.FC = () => {
  const { fills: storeFills, loadingFills, fillsError, isConnected } = useDydxData();
  const [allFills, setAllFills] = useState<Fill[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMoreData, setHasMoreData] = useState(true);
  const initialLoadDoneRef = useRef(false);

  const [selectedFill, setSelectedFill] = useState<Fill | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  useEffect(() => {
    if (!isConnected) {
      setAllFills([]);
      setCurrentPage(1);
      setHasMoreData(true);
      initialLoadDoneRef.current = false;
    }
  }, [isConnected]);

  useEffect(() => {
    if (storeFills.length > 0) {
      setAllFills(prevFills => {
        const fillsMap = new Map<string, Fill>();
        prevFills.forEach(f => fillsMap.set(f.id, f));
        storeFills.forEach(f => fillsMap.set(f.id, f));
        return Array.from(fillsMap.values()).sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      });
      initialLoadDoneRef.current = true;
    }
  }, [storeFills]);

  const totalPages = useMemo(() => {
    const currentPages = Math.ceil(allFills.length / ITEMS_PER_PAGE);
    return hasMoreData && allFills.length >= ITEMS_PER_PAGE
      ? currentPages
      : Math.max(currentPages, 1);
  }, [allFills.length, hasMoreData]);

  const currentPageData = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    return allFills.slice(startIndex, endIndex);
  }, [allFills, currentPage]);

  const loadMoreData = useCallback(async () => {
    if (loadingMore || !hasMoreData || !isConnected) return;

    const lastFill = allFills[allFills.length - 1];
    if (!lastFill) return;

    setLoadingMore(true);
    try {
      const moreFills = await dydxDataService.getFills(
        undefined,
        undefined,
        false
      );

      if (moreFills.length === 0) {
        setHasMoreData(false);
        return;
      }
      setAllFills(prev => {
        const fillsMap = new Map<string, Fill>();
        prev.forEach(f => fillsMap.set(f.id, f));
        moreFills.forEach(f => fillsMap.set(f.id, f));

        return Array.from(fillsMap.values()).sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      });
      if (moreFills.length < ITEMS_PER_PAGE) {
        setHasMoreData(false);
      }
    } catch (error) {
      console.error('[FillsPanel] Failed to load more data:', error);
    } finally {
      setLoadingMore(false);
    }
  }, [allFills, isConnected, loadingMore, hasMoreData]);

  const handlePageChange = useCallback(
    (page: number) => {
      setCurrentPage(page);
      const requiredItems = page * ITEMS_PER_PAGE;
      if (allFills.length < requiredItems && hasMoreData && !loadingMore) {
        loadMoreData();
      }
    },
    [allFills.length, hasMoreData, loadingMore, loadMoreData]
  );

  const handleFillClick = useCallback((fill: Fill) => {
    setSelectedFill(fill);
    setShowDetail(true);
  }, []);

  const handleCloseDetail = useCallback(() => {
    setShowDetail(false);
    setTimeout(() => setSelectedFill(null), 300);
  }, []);

  if (!isConnected) {
    return <WalletConnectPrompt description="Connect your wallet to view your trade fills" />;
  }

  if (loadingFills && allFills.length === 0) {
    return <LoadingState message="Loading fills..." />;
  }

  if (fillsError && allFills.length === 0) {
    return <EmptyState title="Error Loading Fills" description={fillsError} />;
  }

  if (allFills.length === 0 && !loadingFills) {
    return (
      <EmptyState
        title="No Fills Yet"
        description="Your trade fills will appear here once you execute trades"
      />
    );
  }

  return (
    <div className="h-full flex flex-col bg-primary">
      <div className="hidden md:block flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-secondary border-b border-color z-10">
            <tr className="text-muted text-xs">
              <th className="text-left px-4 py-3 font-medium">Market</th>
              <th className="text-right px-4 py-3 font-medium">Time</th>
              <th className="text-center px-4 py-3 font-medium">Type</th>
              <th className="text-center px-4 py-3 font-medium">Side</th>
              <th className="text-right px-4 py-3 font-medium">Amount</th>
              <th className="text-right px-4 py-3 font-medium">Price</th>
              <th className="text-right px-4 py-3 font-medium">Total</th>
              <th className="text-right px-4 py-3 font-medium">Fee</th>
              <th className="text-center px-4 py-3 font-medium">Liquidity</th>
            </tr>
          </thead>
          <tbody>
            {currentPageData.map(fill => {
              const total = (parseFloat(fill.size) * parseFloat(fill.price)).toFixed(2);
              const fee = Math.abs(parseFloat(fill.fee));

              return (
                <tr
                  key={fill.id}
                  onClick={() => handleFillClick(fill)}
                  className="border-b border-color hover:bg-hover transition-colors cursor-pointer"
                >
                  <td className="px-4 py-3">
                    <MarketBadge market={fill.market || (fill as any).ticker} />
                  </td>
                  <td className="px-4 py-3 text-right text-muted text-xs">
                    {getTimeAgo(fill.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="px-2 py-0.5 bg-[#2a2a2a] text-gray-300 rounded text-xs">
                      {fill.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <SideBadge side={fill.side as 'BUY' | 'SELL'} />
                  </td>
                  <td className="px-4 py-3 text-right text-primary font-mono">
                    {parseFloat(fill.size).toFixed(4)}
                  </td>
                  <td className="px-4 py-3 text-right text-primary font-mono">
                    ${parseFloat(fill.price).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right text-primary font-mono">
                    ${parseFloat(total).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right text-red-400 font-mono">
                    ${fee.toFixed(4)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-medium ${fill.liquidity === 'MAKER'
                        ? 'bg-blue-500/20 text-blue-400'
                        : 'bg-purple-500/20 text-purple-400'
                        }`}
                    >
                      {fill.liquidity}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="md:hidden flex-1 overflow-auto  space-y-0.5">
        {currentPageData.map(fill => {
          const total = parseFloat(fill.size) * parseFloat(fill.price);

          return (
            <div
              key={fill.id}
              onClick={() => handleFillClick(fill)}
              className="bg-secondary border border-color  p-3 flex items-center justify-between active:bg-hover transition-colors"
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <MarketBadge market={fill.market || (fill as any).ticker} />

              </div>
              <div className="flex itme-center">
                <div className="flex items-center gap-4">
                  <SideBadge side={fill.side as 'BUY' | 'SELL'} />
                  <span className="text-primary font-mono text-xs">
                    ${total.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </span>
                </div>
                <span className="text-muted text-xs mx-2 truncate">
                  {getTimeAgo(fill.createdAt)}
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
        totalItems={allFills.length}
        itemsPerPage={ITEMS_PER_PAGE}
        hasMore={hasMoreData}
      />

      <SidePanel
        isOpen={showDetail}
        onClose={handleCloseDetail}
        title="Fill Details"
      >
        {selectedFill && <FillDetailPanel fill={selectedFill} />}
      </SidePanel>
    </div>
  );
};

export default FillsPanel;
