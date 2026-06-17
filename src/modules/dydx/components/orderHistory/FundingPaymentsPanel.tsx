import { Loader2 } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import { useDydxData } from '../../hooks/useDydxData';
import { type FundingPayment, dydxDataService } from '../../service/dydxOrderService';
import { EmptyState } from '../shared/EmptyState';
import { LoadingState } from '../shared/LoadingState';
import { MarketBadge } from '../shared/MarketBadge';
import { Pagination } from '../shared/Pagination';
import { SideBadge } from '../shared/SideBadge';
import { WalletConnectPrompt } from '../shared/WalletConnectPrompt';

const ITEMS_PER_PAGE = 5;

const FundingPaymentsPanel: React.FC = () => {
  const { isConnected } = useDydxData();

  const [currentPage, setCurrentPage] = useState(1);
  const getInitialState = () => {
    const cached = dydxDataService.getCachedFundingPayments(undefined, ITEMS_PER_PAGE, 1);
    return {
      payments: cached?.fundingPayments ?? [],
      totalItems: cached?.totalResults ?? 0,
    };
  };

  const [payments, setPayments] = useState<FundingPayment[]>(() => getInitialState().payments);
  const [totalItems, setTotalItems] = useState<number>(() => getInitialState().totalItems);
  const [initialLoading, setInitialLoading] = useState(payments.length === 0);
  const [backgroundFetching, setBackgroundFetching] = useState(false);

  const initialLoadDoneRef = useRef(false);

  const loadPage = useCallback(
    async (page: number, showInitialLoader: boolean) => {
      if (!isConnected) return;
      const cached = dydxDataService.getCachedFundingPayments(undefined, ITEMS_PER_PAGE, page);
      if (cached) {
        setPayments(cached.fundingPayments);
        setTotalItems(cached.totalResults);
      } else if (showInitialLoader) {
        setInitialLoading(true);
      }
      const hasData = cached && cached.fundingPayments.length > 0;
      if (hasData) {
        setBackgroundFetching(true);
      }

      try {
        const response = await dydxDataService.getFundingPayments(undefined, ITEMS_PER_PAGE, page);
        setPayments(response.fundingPayments);
        setTotalItems(response.totalResults);
        initialLoadDoneRef.current = true;
      } catch (error) {
        console.error('[FundingPaymentsPanel] Failed to load data:', error);
        if (!hasData) {
          setPayments([]);
          setTotalItems(0);
        }
      } finally {
        setInitialLoading(false);
        setBackgroundFetching(false);
      }
    },
    [isConnected]
  );

  useEffect(() => {
    if (!isConnected) {
      setPayments([]);
      setTotalItems(0);
      setCurrentPage(1);
      initialLoadDoneRef.current = false;
      setInitialLoading(true);
      return;
    }

    if (!initialLoadDoneRef.current) {
      loadPage(1, true);
    }
  }, [isConnected, loadPage]);

  useEffect(() => {
    if (!isConnected || !initialLoadDoneRef.current) return;
    loadPage(currentPage, false);
  }, [currentPage]);

  useEffect(() => {
    const cacheKey = `funding_payments_all_${ITEMS_PER_PAGE}_${currentPage}`;
    const unsubscribe = dydxDataService.subscribe((key, data) => {
      if (key === cacheKey) {
        setPayments(data.fundingPayments);
        setTotalItems(data.totalResults);
        setBackgroundFetching(false);
      }
    });
    return unsubscribe;
  }, [currentPage]);

  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page);
  }, []);

  const totalPages = Math.max(Math.ceil(totalItems / ITEMS_PER_PAGE), 1);

  if (!isConnected) {
    return <WalletConnectPrompt description="Connect your wallet to view funding payments" />;
  }

  if (initialLoading && payments.length === 0) {
    return <LoadingState message="Loading funding payments..." />;
  }

  if (!initialLoading && !backgroundFetching && payments.length === 0) {
    return (
      <EmptyState title="No Funding Payments" description="No funding payment history found" />
    );
  }

  return (
    <div className="h-full flex flex-col bg-primary">
      <div className="hidden md:block flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-secondary border-b border-color z-10">
            <tr className="text-muted text-xs">
              <th className="text-left px-4 py-3 font-medium">Market</th>
              <th className="text-left px-4 py-3 font-medium">Time</th>
              <th className="text-center px-4 py-3 font-medium">Side</th>
              <th className="text-right px-4 py-3 font-medium">Oracle Price</th>
              <th className="text-right px-4 py-3 font-medium">Size</th>
              <th className="text-right px-4 py-3 font-medium">Payment</th>
              <th className="text-right px-4 py-3 font-medium">Rate</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((payment, index) => {
              const paymentVal = parseFloat(payment.payment);
              const rateVal = parseFloat(payment.rate);
              const priceVal = parseFloat(payment.oraclePrice);
              const sizeVal = parseFloat(payment.size);
              const side = payment.side as 'LONG' | 'SHORT';
              const displaySide = side === 'LONG' ? 'BUY' : 'SELL';

              return (
                <tr
                  key={`${payment.ticker}-${payment.createdAt}-${index}`}
                  className="border-b border-color hover:bg-hover transition-colors"
                >
                  <td className="px-4 py-3">
                    <MarketBadge market={payment.ticker} />
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {new Date(payment.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <SideBadge side={displaySide} />
                  </td>
                  <td className="px-4 py-3 text-right text-primary font-mono">
                    $
                    {priceVal.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </td>
                  <td className="px-4 py-3 text-right text-primary font-mono">
                    {sizeVal.toFixed(4)} {payment.ticker.split('-')[0]}
                  </td>
                  <td
                    className={`px-4 py-3 text-right font-mono ${paymentVal >= 0 ? 'text-green-500' : 'text-red-500'}`}
                  >
                    {paymentVal >= 0 ? '+' : ''}
                    {paymentVal.toFixed(6)}
                  </td>
                  <td
                    className={`px-4 py-3 text-right font-mono ${rateVal >= 0 ? 'text-green-500' : 'text-red-500'}`}
                  >
                    {(rateVal * 100).toFixed(6)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="md:hidden flex-1 overflow-auto space-y-0.5">
        {payments.map((payment, index) => {
          const paymentVal = parseFloat(payment.payment);
          const side = payment.side as 'LONG' | 'SHORT';
          const displaySide = side === 'LONG' ? 'BUY' : 'SELL';

          return (
            <div
              key={`${payment.ticker}-${payment.createdAt}-${index}`}
              className="bg-secondary border border-color p-3 flex items-center justify-between active:bg-hover transition-colors"
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <MarketBadge market={payment.ticker} />
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <SideBadge side={displaySide} />
                    <span
                      className={`font-mono text-xs ${paymentVal >= 0 ? 'text-green-500' : 'text-red-500'}`}
                    >
                      {paymentVal >= 0 ? '+' : ''}
                      {paymentVal.toFixed(6)}
                    </span>
                  </div>
                  <span className="text-xs text-muted">
                    {new Date(payment.createdAt).toLocaleTimeString()}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="relative">
        {backgroundFetching && (
          <div className="absolute top-1/2 right-14 -translate-y-1/2 z-10">
            <Loader2 size={12} className="animate-spin text-muted" />
          </div>
        )}
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={handlePageChange}
          loading={false}
          hasMore={currentPage < totalPages}
          itemsPerPage={ITEMS_PER_PAGE}
          totalItems={totalItems}
        />
      </div>
    </div>
  );
};

export default FundingPaymentsPanel;
