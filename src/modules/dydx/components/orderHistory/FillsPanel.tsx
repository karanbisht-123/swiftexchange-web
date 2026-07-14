import { ChevronRight } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { useDydxData } from '../../hooks/useDydxData';
import { type Fill } from '../../service/dydxOrderService';
import useMarketStore from '../../store/marketStore';
import { formatMarketPrice, formatNumericWithCommas } from '../../utils/BigNumberUtils';
import { currencyService } from '../../utils/currencyService';
import { capitalizeFirst, formatTimeAgoCompact } from '../../utils/orderUtils';
import { EmptyState } from '../shared/EmptyState';
import { FillDetailPanel } from '../shared/FillDetailPanel';
import { LoadingState } from '../shared/LoadingState';
import { MarketBadge } from '../shared/MarketBadge';
import { Pagination } from '../shared/Pagination';
import { SidePanel } from '../shared/SidePanel';
import { WalletConnectPrompt } from '../shared/WalletConnectPrompt';

const ITEMS_PER_PAGE = 10;

// Pure helper — avoids duplicating PnL math in both desktop and mobile render paths
function computeClosedPnl(fill: Fill): { str: string; cls: string } {
  if (!fill.positionSideBefore || !fill.positionSizeBefore || !fill.entryPriceBefore) {
    return { str: '—', cls: 'text-muted' };
  }
  const sizeBefore = parseFloat(fill.positionSizeBefore);
  const entryPrice = parseFloat(fill.entryPriceBefore);
  const fillPrice = parseFloat(fill.price);
  const fillSize = parseFloat(fill.size);
  const fee = parseFloat(fill.fee || '0');

  let closedPnl: number | null = null;
  if (fill.positionSideBefore === 'LONG' && fill.side === 'SELL') {
    const closedSize = Math.min(sizeBefore, fillSize);
    const feePortion = fillSize > 0 ? fee * (closedSize / fillSize) : 0;
    closedPnl = (fillPrice - entryPrice) * closedSize - feePortion;
  } else if (fill.positionSideBefore === 'SHORT' && fill.side === 'BUY') {
    const closedSize = Math.min(sizeBefore, fillSize);
    const feePortion = fillSize > 0 ? fee * (closedSize / fillSize) : 0;
    closedPnl = (entryPrice - fillPrice) * closedSize - feePortion;
  }

  if (closedPnl === null) return { str: '—', cls: 'text-muted' };
  const neg = closedPnl < 0;
  const abs = Math.abs(closedPnl);
  return {
    str: neg ? `-$${formatNumericWithCommas(abs, 2)}` : `$${formatNumericWithCommas(abs, 2)}`,
    cls: neg ? 'text-red-400' : closedPnl > 0 ? 'text-green-400' : 'text-muted',
  };
}

const FillsPanel: React.FC = () => {
  const { fills: allFills, isConnected, loadingFills, fillsError, loadMoreFills } = useDydxData();
  const marketCache = useMarketStore(state => state.marketCache);

  const [currentPage, setCurrentPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMoreData, setHasMoreData] = useState(true);

  const [selectedFill, setSelectedFill] = useState<Fill | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  useEffect(() => {
    if (!isConnected) {
      setCurrentPage(1);
      setHasMoreData(true);
    }
  }, [isConnected]);

  const totalPages = useMemo(() => {
    const pages = Math.ceil(allFills.length / ITEMS_PER_PAGE);
    return hasMoreData && allFills.length >= ITEMS_PER_PAGE ? pages : Math.max(pages, 1);
  }, [allFills.length, hasMoreData]);

  const currentPageData = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return allFills.slice(start, start + ITEMS_PER_PAGE);
  }, [allFills, currentPage]);

  const loadMoreData = useCallback(async () => {
    if (loadingMore || !hasMoreData || !isConnected || allFills.length === 0) return;
    setLoadingMore(true);
    try {
      const moreFills = await loadMoreFills();
      if (!moreFills || moreFills.length === 0) {
        setHasMoreData(false);
      } else if (moreFills.length < ITEMS_PER_PAGE) {
        setHasMoreData(false);
      }
    } catch (error) {
      console.error('[FillsPanel] Failed to load more data:', error);
    } finally {
      setLoadingMore(false);
    }
  }, [allFills, isConnected, loadingMore, hasMoreData, loadMoreFills]);

  const handlePageChange = useCallback(
    (page: number) => {
      setCurrentPage(page);
      if (allFills.length < page * ITEMS_PER_PAGE && hasMoreData && !loadingMore) {
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
    <div className="h-full flex flex-col bg-secondary overflow-hidden">
      <div className="hidden md:block flex-1 overflow-auto">
        <table className="w-full text-left border-collapse">
          <thead className="bg-secondary text-muted text-[10px] uppercase tracking-wider font-semibold sticky top-0 z-10 border-b border-color">
            <tr>
              <th className="px-3 py-2 font-semibold">Market</th>
              <th className="px-2 py-2 font-semibold">Date | Age</th>
              <th className="px-2 py-2 font-semibold">Type</th>
              <th className="px-2 py-2 text-center font-semibold">Side</th>
              <th className="px-2 py-2 text-right font-semibold">Amount</th>
              <th className="px-2 py-2 text-right font-semibold">Price</th>
              <th className="px-2 py-2 text-right font-semibold">Total</th>
              <th className="px-2 py-2 text-right font-semibold">Fee</th>
              <th className="px-2 py-2 text-right font-semibold">Closed PNL</th>
              <th className="px-2 py-2 text-right font-semibold">Liquidity</th>
            </tr>
          </thead>
          <tbody>
            {currentPageData.map(fill => {
              const marketTicker = fill.market || (fill as any).ticker || '';
              const mkt = marketCache[marketTicker];
              const stepSize = mkt?.stepSize || '0.0001';
              const decimals = currencyService.getStepSizeDecimals(stepSize);

              const priceStr = formatMarketPrice(fill.price, '$');
              const totalVal = parseFloat(fill.size) * parseFloat(fill.price);
              const totalStr = formatNumericWithCommas(totalVal, 2, '$');
              const feeVal = Math.abs(parseFloat(fill.fee));
              const feeStr = formatNumericWithCommas(feeVal, 2, '$');
              const amountStr = formatNumericWithCommas(fill.size, decimals);

              const { str: closedPnlStr, cls: pnlClass } = computeClosedPnl(fill);

              return (
                <tr
                  key={fill.id}
                  onClick={() => handleFillClick(fill)}
                  className="border-b border-color hover:bg-hover transition-colors cursor-pointer text-[11px]"
                >
                  <td className="px-3 py-1.5">
                    <MarketBadge market={marketTicker} />
                  </td>
                  <td className="px-2 py-1.5 text-left text-muted font-mono">
                    {formatTimeAgoCompact(fill.createdAt)}
                  </td>
                  <td className="px-2 py-1.5 text-left text-primary font-bold">
                    {capitalizeFirst(
                      fill.clientMetadata === '1' && fill.type === 'LIMIT' ? 'MARKET' : fill.type
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${fill.side === 'BUY' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}
                    >
                      {capitalizeFirst(fill.side)}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-right text-primary font-mono">{amountStr}</td>
                  <td className="px-2 py-1.5 text-right text-primary font-mono">{priceStr}</td>
                  <td className="px-2 py-1.5 text-right text-primary font-mono">{totalStr}</td>
                  <td className="px-2 py-1.5 text-right text-muted font-mono">{feeStr}</td>
                  <td className={`px-2 py-1.5 text-right font-mono ${pnlClass}`}>{closedPnlStr}</td>
                  <td className="px-2 py-1.5 text-right text-muted">
                    {capitalizeFirst(fill.liquidity)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="md:hidden flex-1 overflow-auto space-y-0.5">
        {currentPageData.map(fill => {
          const marketTicker = fill.market || (fill as any).ticker || '';

          const total = parseFloat(fill.size) * parseFloat(fill.price);
          const totalStr = formatNumericWithCommas(total, 2, '$');

          const { str: closedPnlStr, cls: pnlClass } = computeClosedPnl(fill);

          return (
            <div
              key={fill.id}
              onClick={() => handleFillClick(fill)}
              className="bg-secondary border border-color p-3 flex items-center justify-between active:bg-hover transition-colors"
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <MarketBadge market={marketTicker} />
              </div>
              <div className="flex items-center">
                <div className="flex items-center gap-4">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${fill.side === 'BUY' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}
                  >
                    {capitalizeFirst(fill.side)}
                  </span>
                  <span className="text-primary font-mono text-xs">{totalStr}</span>
                  {closedPnlStr !== '—' && (
                    <span className={`font-mono text-xs ${pnlClass}`}>PNL: {closedPnlStr}</span>
                  )}
                </div>
                <span className="text-muted text-xs mx-2 truncate">
                  {formatTimeAgoCompact(fill.createdAt)}
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

      <SidePanel isOpen={showDetail} onClose={handleCloseDetail} title="Fill Details">
        {selectedFill && <FillDetailPanel fill={selectedFill} />}
      </SidePanel>
    </div>
  );
};

export default FillsPanel;
