import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useDydxData } from '../../hooks/useDydxData';
import { type Fill, dydxDataService } from '../../service/dydxOrderService';
import { formatTime, getTimeAgo } from '../../utils/timeUtils';
import { DataTable } from '../shared/DataTable';
import { EmptyState } from '../shared/EmptyState';
import { LoadingState } from '../shared/LoadingState';
import { MarketBadge } from '../shared/MarketBadge';
import { Pagination } from '../shared/Pagination';
import { SideBadge } from '../shared/SideBadge';
import { WalletConnectPrompt } from '../shared/WalletConnectPrompt';

const ITEMS_PER_PAGE = 10;

const FillsPanel: React.FC = () => {
  const { fills: storeFills, loadingFills, fillsError, isConnected, refreshFills } = useDydxData();
  const [allFills, setAllFills] = useState<Fill[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMoreData, setHasMoreData] = useState(true);
  const initialLoadDoneRef = useRef(false);

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
        ITEMS_PER_PAGE,
        lastFill.createdAtHeight,
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

  const columns = [
    {
      key: 'market',
      header: 'Market',
      align: 'left' as const,
      render: (f: Fill) => <MarketBadge market={f.market} />,
    },
    {
      key: 'time',
      header: 'Time',
      align: 'right' as const,
      render: (f: Fill) => (
        <div className="text-right">
          <div className="text-white text-xs">{formatTime(f.createdAt)}</div>
          <div className="text-gray-500 text-xs">{getTimeAgo(f.createdAt)}</div>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      align: 'center' as const,
      render: (f: Fill) => (
        <span className="px-2 py-0.5 bg-[#2a2a2a] text-gray-300 rounded text-xs">{f.type}</span>
      ),
    },
    {
      key: 'side',
      header: 'Side',
      align: 'center' as const,
      render: (f: Fill) => <SideBadge side={f.side as 'BUY' | 'SELL'} />,
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right' as const,
      render: (f: Fill) => (
        <span className="text-white font-mono">{parseFloat(f.size).toFixed(4)}</span>
      ),
    },
    {
      key: 'price',
      header: 'Price',
      align: 'right' as const,
      render: (f: Fill) => (
        <span className="text-white font-mono">${parseFloat(f.price).toLocaleString()}</span>
      ),
    },
    {
      key: 'total',
      header: 'Total',
      align: 'right' as const,
      render: (f: Fill) => {
        const total = (parseFloat(f.size) * parseFloat(f.price)).toFixed(2);
        return <span className="text-white font-mono">${parseFloat(total).toLocaleString()}</span>;
      },
    },
    {
      key: 'fee',
      header: 'Fee',
      align: 'right' as const,
      render: (f: Fill) => {
        const fee = Math.abs(parseFloat(f.fee));
        return <span className="text-red-400 font-mono">${fee.toFixed(4)}</span>;
      },
    },
    {
      key: 'liquidity',
      header: 'Liquidity',
      align: 'center' as const,
      render: (f: Fill) => (
        <span
          className={`px-2 py-0.5 rounded text-xs font-medium ${
            f.liquidity === 'MAKER'
              ? 'bg-blue-500/20 text-blue-400'
              : 'bg-purple-500/20 text-purple-400'
          }`}
        >
          {f.liquidity}
        </span>
      ),
    },
  ];

  return (
    <div className="h-full flex flex-col bg-primary">
      {/* <div className="px-4 py-2 border-b border-gray-700 flex items-center justify-between bg-secondary">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-medium text-white">Trade Fills</h3>
          <span className="text-xs text-gray-500">
            {allFills.length} fill{allFills.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs text-gray-400">Live</span>
          </div>

          <button
            onClick={() => refreshFills()}
            disabled={loadingFills}
            className="p-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors disabled:opacity-50"
            title="Refresh fills"
          >
            <svg
              className={`w-4 h-4 ${loadingFills ? 'animate-spin' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
        </div>
      </div> */}
      <div className="flex-1 overflow-auto">
        <DataTable data={currentPageData} columns={columns} getRowKey={f => f.id} />
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
    </div>
  );
};

export default FillsPanel;
