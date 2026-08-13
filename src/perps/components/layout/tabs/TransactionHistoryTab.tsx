import React, { useCallback, useRef } from 'react';

import { useTransactionHistory } from '../../../adapters/aster/hooks/useTransactionHistory';

interface Props {
  signer: any;
  userAddr: string;
}

function formatDate(timestamp: number): string {
  if (!timestamp) return '--';
  const d = new Date(timestamp);
  const pad = (n: number) => n.toString().padStart(2, '0');
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  const seconds = pad(d.getSeconds());
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function formatIncomeType(type: string): string {
  if (!type) return '--';
  switch (type.toUpperCase()) {
    case 'REALIZED_PNL':
      return 'Realized PNL';
    case 'COMMISSION':
      return 'Commission';
    case 'FUNDING_FEE':
      return 'Funding Fee';
    case 'TRANSFER':
      return 'Transfer';
    case 'WELCOME_BONUS':
      return 'Welcome Bonus';
    case 'INSURANCE_CLEAR':
      return 'Insurance Clear';
    case 'AUTO_CONVERSION':
      return 'Auto-conversion';
    default:
      return type.replace(/_/g, ' ');
  }
}

export const TransactionHistoryTab: React.FC<Props> = ({ signer, userAddr }) => {
  const { income, isLoading, isLoadingMore, hasMore, loadMore } = useTransactionHistory(
    signer,
    userAddr
  );
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || isLoadingMore || !hasMore) return;
    // Trigger loadMore only when very close to the bottom (10px)
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 10) {
      loadMore();
    }
  }, [loadMore, isLoadingMore, hasMore]);

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="w-full h-full overflow-x-auto overflow-y-auto scrollbar-thin"
    >
      <table className="w-full text-[11px] text-left whitespace-nowrap">
        <thead className="text-secondary border-b border-color sticky top-0 bg-secondary z-10">
          <tr>
            <th className="px-2.5 py-1.5 font-medium">Time</th>
            <th className="px-2.5 py-1.5 font-medium">Type</th>
            <th className="px-2.5 py-1.5 font-medium">Amount</th>
            <th className="px-2.5 py-1.5 font-medium">Symbol</th>
          </tr>
        </thead>
        <tbody>
          {isLoading && income.length === 0 ? (
            <tr>
              <td colSpan={4} className="px-4 py-8 text-center text-muted">
                Loading transactions...
              </td>
            </tr>
          ) : income.length === 0 ? (
            <tr>
              <td colSpan={4} className="px-4 py-8 text-center text-muted">
                No transaction history
              </td>
            </tr>
          ) : (
            income.map((inc, index) => {
              const incVal = parseFloat(inc.income || '0');
              return (
                <tr
                  key={`${inc.tranId || ''}-${inc.time || ''}-${index}`}
                  className="border-b border-color hover:bg-hover transition-colors"
                >
                  <td className="px-2.5 py-1.5 text-secondary">{formatDate(inc.time)}</td>
                  <td className="px-2.5 py-1.5 text-primary font-medium">
                    {formatIncomeType(inc.incomeType)}
                  </td>
                  <td
                    className={`px-2.5 py-1.5 font-mono-tabular ${incVal > 0 ? 'text-success' : incVal < 0 ? 'text-danger' : 'text-primary'}`}
                  >
                    {inc.income} {inc.asset}
                  </td>
                  <td className="px-2.5 py-1.5 text-primary font-medium">{inc.symbol || '-'}</td>
                </tr>
              );
            })
          )}
          {isLoadingMore && (
            <tr>
              <td colSpan={4} className="px-4 py-1.5 text-center text-muted text-[10px]">
                Loading more transactions...
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};
