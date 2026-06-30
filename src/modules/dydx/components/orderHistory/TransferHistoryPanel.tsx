import { Check, Copy, ExternalLink } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';

import { useDydxData } from '../../hooks/useDydxData';
import { type Transfer, dydxDataService } from '../../service/dydxOrderService';
import { copyToClipboard, formatTimeAgoCompact } from '../../utils/orderUtils';
import { EmptyState } from '../shared/EmptyState';
import { LoadingState } from '../shared/LoadingState';
import { Pagination } from '../shared/Pagination';
import { WalletConnectPrompt } from '../shared/WalletConnectPrompt';

const ITEMS_PER_PAGE = 10;
const INITIAL_FETCH_LIMIT = 100;

const TransferHistoryPanel: React.FC = () => {
  const { isConnected } = useDydxData();

  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loading, setLoading] = useState(false);
  const [localPage, setLocalPage] = useState(1);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadData = useCallback(
    async (limit: number, createdBeforeOrAt?: string): Promise<Transfer[]> => {
      if (!isConnected) return [];
      setLoading(true);
      try {
        const response = await dydxDataService.getTransfers(limit, createdBeforeOrAt);
        return response.transfers ?? [];
      } catch (error) {
        console.error('[TransferHistoryPanel] Failed to load data:', error);
        return [];
      } finally {
        setLoading(false);
      }
    },
    [isConnected],
  );

  useEffect(() => {
    if (!isConnected) {
      setTransfers([]);
      setLocalPage(1);
      return;
    }

    let isMounted = true;
    (async () => {
      const firstPage = await loadData(INITIAL_FETCH_LIMIT);
      if (isMounted) setTransfers(firstPage);
    })();

    return () => {
      isMounted = false;
    };
  }, [isConnected, loadData]);

  const handlePageChange = useCallback(
    async (page: number) => {
      setLocalPage(page);
      const neededCount = page * ITEMS_PER_PAGE;
      if (neededCount > transfers.length && !loading) {
        const oldestTransfer = transfers[transfers.length - 1];
        const cursor = oldestTransfer ? oldestTransfer.createdAt : undefined;
        const more = await loadData(INITIAL_FETCH_LIMIT, cursor);
        if (more.length > 0) {
          setTransfers(prev => {
            const seen = new Set(prev.map(t => t.id));
            const merged = [...prev, ...more.filter(t => !seen.has(t.id))];
            return merged;
          });
        }
      }
    },
    [transfers, loading, loadData],
  );

  const handleCopy = useCallback(
    async (text: string, id: string) => {
      const ok = await copyToClipboard(text);
      if (ok) {
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
      }
    },
    [],
  );

  const truncateAddress = (address: string) => {
    if (!address) return '';
    return `${address.slice(0, 8)}...${address.slice(-4)}`;
  };

  const paginatedTransfers = transfers.slice(
    (localPage - 1) * ITEMS_PER_PAGE,
    localPage * ITEMS_PER_PAGE,
  );
  const hasMore = transfers.length % INITIAL_FETCH_LIMIT === 0 && transfers.length > 0;
  const totalPages = hasMore
    ? localPage + 1
    : Math.max(Math.ceil(transfers.length / ITEMS_PER_PAGE), 1);

  if (!isConnected) {
    return <WalletConnectPrompt description="Connect your wallet to view transfer history" />;
  }

  if (loading && transfers.length === 0) {
    return <LoadingState message="Loading transfer history..." />;
  }

  if (!loading && transfers.length === 0) {
    return <EmptyState title="No Transfers" description="No deposit or withdrawal history found" />;
  }

  return (
    <div className="h-full flex flex-col bg-primary">
      <div className="hidden md:block flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-secondary border-b border-color z-10">
            <tr className="text-muted text-xs">
              <th className="text-left px-4 py-3 font-medium">
                Date | <span className="text-primary font-bold">Age</span>
              </th>
              <th className="text-left px-4 py-3 font-medium">Action</th>
              <th className="text-left px-4 py-3 font-medium">Sender | Recipient</th>
              <th className="text-left px-4 py-3 font-medium">Amount</th>
              <th className="text-right px-4 py-3 font-medium">Transaction</th>
            </tr>
          </thead>
          <tbody>
            {paginatedTransfers.map((transfer, index) => {
              const amountVal = parseFloat(transfer.size);
              const isDeposit = transfer.type === 'DEPOSIT';
              const date = new Date(transfer.createdAt);
              const timeAgo = formatTimeAgoCompact(date);
              const uniqueKey = transfer.id ?? `idx-${index}`;

              return (
                <tr
                  key={uniqueKey}
                  className="border-b border-color hover:bg-hover transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="flex flex-col">
                      <span className="text-xs text-muted">{date.toLocaleDateString()}</span>
                      <span className="font-medium text-primary">{timeAgo}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`font-medium ${isDeposit ? 'text-green-500' : 'text-primary'}`}
                    >
                      {isDeposit ? 'Deposit' : 'Withdrawal'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2 group">
                        <span className="font-mono text-xs text-primary">
                          {truncateAddress(transfer.sender.address)}
                        </span>
                        <button
                          onClick={() =>
                            handleCopy(transfer.sender.address, `sender-${uniqueKey}`)
                          }
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-muted hover:text-primary"
                        >
                          {copiedId === `sender-${uniqueKey}` ? (
                            <Check size={12} className="text-green-500" />
                          ) : (
                            <Copy size={12} />
                          )}
                        </button>
                      </div>
                      <div className="flex items-center gap-2 group">
                        <span className="font-mono text-xs text-muted">
                          {truncateAddress(transfer.recipient.address)}
                        </span>
                        <button
                          onClick={() =>
                            handleCopy(
                              transfer.recipient.address,
                              `recipient-${uniqueKey}`,
                            )
                          }
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-muted hover:text-primary"
                        >
                          {copiedId === `recipient-${uniqueKey}` ? (
                            <Check size={12} className="text-green-500" />
                          ) : (
                            <Copy size={12} />
                          )}
                        </button>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-primary">${amountVal.toFixed(2)}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {transfer.transactionHash && (
                      <div className="flex items-center justify-end gap-2 group">
                        <span className="font-mono text-xs text-muted">
                          {transfer.transactionHash.slice(0, 4)}...
                          {transfer.transactionHash.slice(-4)}
                        </span>
                        <a
                          href={`https://www.mintscan.io/dydx/tx/${transfer.transactionHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <ExternalLink size={12} />
                        </a>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="md:hidden flex-1 overflow-auto space-y-0.5">
        {paginatedTransfers.map((transfer, index) => {
          const amountVal = parseFloat(transfer.size);
          const isDeposit = transfer.type === 'DEPOSIT';
          const uniqueKey = transfer.id ?? `idx-${index}`;

          return (
            <div
              key={uniqueKey}
              className="bg-secondary border border-color p-3 flex items-center justify-between active:bg-hover transition-colors"
            >
              <div className="flex flex-col gap-1 min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`font-medium text-sm ${isDeposit ? 'text-green-500' : 'text-primary'}`}
                  >
                    {isDeposit ? 'Deposit' : 'Withdrawal'}
                  </span>
                  <span className="text-xs text-muted">
                    {formatTimeAgoCompact(new Date(transfer.createdAt))}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-xs text-muted">
                  <span>From: {truncateAddress(transfer.sender.address)}</span>
                </div>
              </div>

              <div className="flex flex-col items-end gap-1">
                <span className="font-mono text-sm text-primary">${amountVal.toFixed(2)}</span>
                {transfer.transactionHash && (
                  <a
                    href={`https://www.mintscan.io/dydx/tx/${transfer.transactionHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-500 flex items-center gap-1"
                  >
                    Tx <ExternalLink size={10} />
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <Pagination
        currentPage={localPage}
        totalPages={totalPages}
        onPageChange={handlePageChange}
        loading={loading}
        hasMore={hasMore}
        itemsPerPage={ITEMS_PER_PAGE}
        totalItems={transfers.length}
      />
    </div>
  );
};

export default TransferHistoryPanel;
