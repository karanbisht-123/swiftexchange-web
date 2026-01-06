import React, { useCallback, useEffect, useMemo, useState } from 'react';

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

const ITEMS_PER_PAGE = 50;

const FillsPanel: React.FC = () => {
  const { fills, loadingFills, fillsError, isConnected } = useDydxData();
  const [allFills, setAllFills] = useState<Fill[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [loadingPage, setLoadingPage] = useState(false);
  const [pageCache, setPageCache] = useState<Map<number, Fill[]>>(new Map());

  // Reset state on disconnect
  useEffect(() => {
    if (!isConnected) {
      setAllFills([]);
      setCurrentPage(1);
      setPageCache(new Map());
    }
  }, [isConnected]);

  // Initialize with first page from hook
  useEffect(() => {
    if (fills.length > 0 && allFills.length === 0) {
      setAllFills(fills);
      setPageCache(prev => new Map(prev).set(1, fills));
    }
  }, [fills, allFills.length]);

  // Calculate total pages
  const totalPages = useMemo(() => {
    const currentDataPages = Math.ceil(allFills.length / ITEMS_PER_PAGE);
    if (allFills.length % ITEMS_PER_PAGE === 0 && allFills.length >= ITEMS_PER_PAGE) {
      return currentDataPages + 0;
    }
    return Math.max(currentDataPages, 1);
  }, [allFills.length]);

  // Get current page data
  const currentPageData = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    return allFills.slice(startIndex, endIndex);
  }, [allFills, currentPage]);

  // Load more data when navigating to a new page
  const loadPageData = useCallback(
    async (page: number) => {
      if (!isConnected) return;

      const requiredItems = page * ITEMS_PER_PAGE;
      if (allFills.length >= requiredItems) {
        return;
      }

      if (pageCache.has(page)) {
        return;
      }

      setLoadingPage(true);
      try {
        const itemsToFetch = requiredItems - allFills.length;
        const batchesToFetch = Math.ceil(itemsToFetch / ITEMS_PER_PAGE);

        let newFills: Fill[] = [];
        let lastFill = allFills[allFills.length - 1];

        for (let i = 0; i < batchesToFetch; i++) {
          const moreFills = await dydxDataService.getFills(
            undefined,
            ITEMS_PER_PAGE,
            lastFill?.createdAtHeight,
            false
          );

          if (moreFills.length === 0) break;

          const existingIds = new Set([...allFills.map(f => f.id), ...newFills.map(f => f.id)]);
          const uniqueFills = moreFills.filter(f => !existingIds.has(f.id));

          if (uniqueFills.length === 0) break;

          newFills = [...newFills, ...uniqueFills];
          lastFill = uniqueFills[uniqueFills.length - 1];

          if (moreFills.length < ITEMS_PER_PAGE) break;
        }

        if (newFills.length > 0) {
          const fillsMap = new Map<string, Fill>();
          allFills.forEach(fill => fillsMap.set(fill.id, fill));
          newFills.forEach(fill => fillsMap.set(fill.id, fill));

          const updatedFills = Array.from(fillsMap.values()).sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );

          setAllFills(updatedFills);

          const startIndex = (page - 1) * ITEMS_PER_PAGE;
          const endIndex = startIndex + ITEMS_PER_PAGE;
          const pageData = updatedFills.slice(startIndex, endIndex);
          setPageCache(prev => new Map(prev).set(page, pageData));
        }
      } catch (error) {
        console.error('Failed to load page data:', error);
      } finally {
        setLoadingPage(false);
      }
    },
    [allFills, isConnected, pageCache]
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
    return <WalletConnectPrompt description="Connect your wallet to view your trade fills" />;
  }

  if (loadingFills && allFills.length === 0) {
    return <LoadingState message="Loading fills..." />;
  }

  if (fillsError && allFills.length === 0) {
    return <EmptyState title="Error Loading Fills" description={fillsError} />;
  }

  if (allFills.length === 0) {
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
      render: (f: Fill) => <SideBadge side={f.side} />,
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
      <div className="flex-1 overflow-auto">
        <DataTable data={currentPageData} columns={columns} getRowKey={f => f.id} />
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

export default FillsPanel;
