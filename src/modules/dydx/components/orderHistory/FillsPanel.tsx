import React, { useEffect, useState } from 'react';

import { type Fill, dydxDataService } from '../../service/dydxOrderService';
import { dydxWalletService } from '../../service/dydxWalletService';
import { formatTime, getTimeAgo } from '../../utils/timeUtils';
import { DataTable } from '../shared/DataTable';
import { EmptyState } from '../shared/EmptyState';
import { LoadMoreButton } from '../shared/LoadMoreButton';
import { LoadingState } from '../shared/LoadingState';
import { MarketBadge } from '../shared/MarketBadge';
import { SideBadge } from '../shared/SideBadge';
import { WalletConnectPrompt } from '../shared/WalletConnectPrompt';

const FillsPanel: React.FC = () => {
  const [fills, setFills] = useState<Fill[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const address = dydxWalletService.getAddress();
  const isConnected = !!address;

  const fetchFills = async (before?: string) => {
    if (!isConnected) return;
    try {
      const newFills = await dydxDataService.fetchFills(50, before);
      if (before) {
        setFills(prev => {
          const existingIds = new Set(prev.map(f => f.id));
          const uniqueNew = newFills.filter(f => !existingIds.has(f.id));
          return [...prev, ...uniqueNew];
        });
      } else {
        setFills(newFills);
      }
      setHasMore(newFills.length === 50);
    } catch (err) {
      console.error('Failed to fetch fills:', err);
    }
  };

  useEffect(() => {
    if (isConnected) {
      setLoading(true);
      fetchFills().finally(() => setLoading(false));

      // Poll for new fills every 8 seconds
      const interval = setInterval(() => {
        if (fills.length > 0) {
          fetchFills(); // Refresh first page
        }
      }, 8000);

      return () => clearInterval(interval);
    } else {
      setLoading(false);
      setFills([]);
    }
  }, [isConnected]);

  const loadMore = async () => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    const last = fills[fills.length - 1];
    await fetchFills(last?.createdAt);
    setLoadingMore(false);
  };

  if (!isConnected) return <WalletConnectPrompt description="Connect to view your trade fills" />;
  if (loading && fills.length === 0) return <LoadingState message="Loading fills..." />;
  if (fills.length === 0)
    return <EmptyState title="No Fills Yet" description="Your trade fills will appear here" />;

  const columns = [
    { key: 'market', header: 'Market', render: (f: Fill) => <MarketBadge market={f.market} /> },
    {
      key: 'time',
      header: 'Time',
      align: 'right',
      render: (f: Fill) => (
        <div>
          <div className="text-white text-xs">{formatTime(f.createdAt)}</div>
          <div className="text-gray-500 text-xs">{getTimeAgo(f.createdAt)}</div>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      align: 'center',
      render: (f: Fill) => <span className="text-gray-300 text-xs">{f.type}</span>,
    },
    {
      key: 'side',
      header: 'Side',
      align: 'center',
      render: (f: Fill) => <SideBadge side={f.side} />,
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      render: (f: Fill) => (
        <span className="text-white font-mono">{parseFloat(f.size).toFixed(4)}</span>
      ),
    },
    {
      key: 'price',
      header: 'Price',
      align: 'right',
      render: (f: Fill) => (
        <span className="text-white font-mono">${parseFloat(f.price).toLocaleString()}</span>
      ),
    },
    {
      key: 'total',
      header: 'Total',
      align: 'right',
      render: (f: Fill) => {
        const total = (parseFloat(f.size) * parseFloat(f.price)).toFixed(2);
        return <span className="text-white font-mono">${total}</span>;
      },
    },
    {
      key: 'fee',
      header: 'Fee',
      align: 'right',
      render: (f: Fill) => (
        <span className="text-red-400 font-mono">${Math.abs(parseFloat(f.fee)).toFixed(4)}</span>
      ),
    },
    {
      key: 'liquidity',
      header: 'Liquidity',
      align: 'center',
      render: (f: Fill) => (
        <span
          className={`px-2 py-0.5 rounded text-xs font-medium ${f.liquidity === 'MAKER' ? 'bg-blue-500/20 text-blue-400' : 'bg-purple-500/20 text-purple-400'}`}
        >
          {f.liquidity}
        </span>
      ),
    },
  ];

  return (
    <div className="h-full flex flex-col bg-primary">
      <div className="flex-1 overflow-auto">
        <DataTable data={fills} columns={columns} getRowKey={f => f.id} />
        <LoadMoreButton onClick={loadMore} loading={loadingMore} show={hasMore} />
      </div>
    </div>
  );
};

export default FillsPanel;
