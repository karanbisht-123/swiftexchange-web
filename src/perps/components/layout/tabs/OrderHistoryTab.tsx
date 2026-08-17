import React, { useCallback, useRef, useState } from 'react';

import { useOrderHistory } from '../../../adapters/aster/hooks/useOrderHistory';

interface Props {
  signer: any;
  userAddr: string;
  asterSymbol: string;
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

export const OrderHistoryTab: React.FC<Props> = ({ signer, userAddr, asterSymbol }) => {
  const [hideOtherSymbols, setHideOtherSymbols] = useState(false);
  const { orders, isLoading, isLoadingMore, hasMore, loadMore } = useOrderHistory(
    signer,
    userAddr,
    hideOtherSymbols ? asterSymbol : null
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
      className="w-full h-full overflow-x-auto overflow-y-auto scrollbar-thin relative"
    >
      <div className="flex justify-end px-3 py-1.5 bg-secondary border-b border-color sticky top-0 z-20">
        <label className="flex items-center gap-1.5 text-[11px] text-secondary cursor-pointer hover:text-primary transition-colors select-none">
          <input
            type="checkbox"
            checked={hideOtherSymbols}
            onChange={e => setHideOtherSymbols(e.target.checked)}
            className="rounded border-color bg-tertiary text-brand focus:ring-0 cursor-pointer"
          />
          Hide other symbols
        </label>
      </div>
      <table className="w-full text-[11px] text-left whitespace-nowrap">
        <thead className="text-secondary border-b border-color sticky top-[33px] bg-secondary z-10">
          <tr>
            <th className="px-2.5 py-1.5 font-medium">Time</th>
            <th className="px-2.5 py-1.5 font-medium">Type</th>
            <th className="px-2.5 py-1.5 font-medium">Symbol</th>
            <th className="px-2.5 py-1.5 font-medium">Side</th>
            <th className="px-2.5 py-1.5 font-medium">Price</th>
            <th className="px-2.5 py-1.5 font-medium">Amount</th>
            <th className="px-2.5 py-1.5 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {isLoading && orders.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-4 py-8 text-center text-muted">
                Loading orders...
              </td>
            </tr>
          ) : orders.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-4 py-8 text-center text-muted">
                No order history
              </td>
            </tr>
          ) : (
            orders.map(o => (
              <tr
                key={o.orderId}
                className="border-b border-color hover:bg-hover transition-colors"
              >
                <td className="px-2.5 py-1.5 text-secondary">
                  {formatDate(o.updateTime || o.time || 0)}
                </td>
                <td className="px-2.5 py-1.5 text-primary uppercase font-medium">{o.type}</td>
                <td className="px-2.5 py-1.5 text-primary font-medium">{o.symbol}</td>
                <td
                  className={`px-2.5 py-1.5 font-medium ${o.side === 'BUY' ? 'text-success' : 'text-danger'} uppercase`}
                >
                  {o.side}
                </td>
                <td className="px-2.5 py-1.5 text-primary font-mono-tabular">{o.price}</td>
                <td className="px-2.5 py-1.5 text-primary font-mono-tabular">
                  {o.executedQty} / {o.origQty}
                </td>
                <td className="px-2.5 py-1.5 text-secondary uppercase">{o.status}</td>
              </tr>
            ))
          )}
          {isLoadingMore && (
            <tr>
              <td colSpan={7} className="px-4 py-1.5 text-center text-muted text-[10px]">
                Loading more orders...
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};
