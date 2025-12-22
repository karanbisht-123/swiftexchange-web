import React, { useCallback, useMemo, useState } from 'react';

import { useLocalState } from '../../hooks/useLocalState';
import { type Fill, dydxDataService } from '../../service/dydxOrderService';
import { dydxWalletService } from '../../service/dydxWalletService';
import { localStateManager } from '../../utils/localStateManager';
import { getTimeAgo } from '../../utils/timeUtils';
import { formatTime } from '../../utils/timeUtils';
import { DataTable } from '../shared/DataTable';
import { EmptyState } from '../shared/EmptyState';
import { LoadMoreButton } from '../shared/LoadMoreButton';
import { LoadingState } from '../shared/LoadingState';
import { MarketBadge } from '../shared/MarketBadge';
import { SideBadge } from '../shared/SideBadge';
import { WalletConnectPrompt } from '../shared/WalletConnectPrompt';

const FillsPanel: React.FC = () => {
  const { fills: liveFills } = useLocalState();
  const [historicalFills, setHistoricalFills] = useState<Fill[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const address = dydxWalletService.getAddress();
  const isConnected = !!address;
  const isLoading = localStateManager.getIsLoading();

  const allFills = useMemo(() => {
    const uniqueMap = new Map();
    [...liveFills, ...historicalFills].forEach(item => uniqueMap.set(item.id, item));
    return Array.from(uniqueMap.values()).sort(
      (a: Fill, b: Fill) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [liveFills, historicalFills]);

  // Load more fills
  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore || allFills.length === 0) return;

    setLoadingMore(true);
    try {
      const lastFill = allFills[allFills.length - 1];
      const moreFills = await dydxDataService.fetchFills(50, lastFill.createdAt);

      const newFills = moreFills.filter(f => !allFills.some(existing => existing.id === f.id));

      if (newFills.length === 0) {
        setHasMore(false);
      } else {
        setHistoricalFills(prev => [...prev, ...newFills]);
        setHasMore(moreFills.length >= 50);
      }
    } catch (error) {
      console.error('Error loading more fills:', error);
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore, allFills]);

  if (!isConnected) {
    return <WalletConnectPrompt description="Connect to view your trade fills" />;
  }

  if (isLoading && allFills.length === 0) {
    return <LoadingState message="Loading fills..." />;
  }

  if (allFills.length === 0) {
    return <EmptyState title="No Fills Yet" description="Your trade fills will appear here" />;
  }

  const columns = [
    {
      key: 'market',
      header: 'Market',
      align: 'left' as const,
      render: (fill: Fill) => <MarketBadge market={fill.market} />,
    },
    {
      key: 'time',
      header: 'Time',
      align: 'right' as const,
      render: (fill: Fill) => (
        <div>
          <div className="text-white text-xs">{formatTime(fill.createdAt)}</div>
          <div className="text-gray-500 text-xs">{getTimeAgo(fill.createdAt)}</div>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      align: 'center' as const,
      render: (fill: Fill) => <span className="text-gray-300 text-xs">{fill.type}</span>,
    },
    {
      key: 'side',
      header: 'Side',
      align: 'center' as const,
      render: (fill: Fill) => <SideBadge side={fill.side} />,
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right' as const,
      render: (fill: Fill) => (
        <span className="text-white font-mono">{parseFloat(fill.size).toFixed(4)}</span>
      ),
    },
    {
      key: 'price',
      header: 'Price',
      align: 'right' as const,
      render: (fill: Fill) => (
        <span className="text-white font-mono">${parseFloat(fill.price).toLocaleString()}</span>
      ),
    },
    {
      key: 'total',
      header: 'Total',
      align: 'right' as const,
      render: (fill: Fill) => {
        const total = (parseFloat(fill.size) * parseFloat(fill.price)).toFixed(2);
        return <span className="text-white font-mono">${total}</span>;
      },
    },
    {
      key: 'fee',
      header: 'Fee',
      align: 'right' as const,
      render: (fill: Fill) => {
        const feeAbs = Math.abs(parseFloat(fill.fee)).toFixed(4);
        return <span className="text-red-400 font-mono">${feeAbs}</span>;
      },
    },
    {
      key: 'liquidity',
      header: 'Liquidity',
      align: 'center' as const,
      render: (fill: Fill) => (
        <span
          className={`px-2 py-0.5 rounded text-xs font-medium ${
            fill.liquidity === 'MAKER'
              ? 'bg-blue-500/20 text-blue-400'
              : 'bg-purple-500/20 text-purple-400'
          }`}
        >
          {fill.liquidity}
        </span>
      ),
    },
  ];

  return (
    <div className="h-full flex flex-col bg-primary">
      <div className="flex-1 overflow-auto">
        <DataTable data={allFills} columns={columns} getRowKey={fill => fill.id} />
        <LoadMoreButton onClick={loadMore} loading={loadingMore} show={hasMore} />
      </div>
    </div>
  );
};

export default FillsPanel;
