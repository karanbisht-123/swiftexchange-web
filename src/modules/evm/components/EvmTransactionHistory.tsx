import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle,
  Clock,
  Loader2,
  RefreshCw,
  SearchX,
  Trash2,
  XCircle,
} from 'lucide-react';
import React, { useEffect, useState } from 'react';

import PageLayout from '../../../components/layout/PageLayout';
import AllTransactionsUI from '../../steallr/components/AllTransactionsUI';
import { WalletType } from '../../walletconnect/constants/Wallet';
import { useWalletStore } from '../../walletconnect/store/walletConnectStore';
import { useSearchParams } from 'react-router-dom';
import {
  type LocalTransactionWithStatus,
  useLocalTransactions,
} from '../hook/useLocalTransactions';
import {
  type TransactionItem,
  getEvmTransactionHistory,
} from '../service/EvmTransactionService';
import { formatBlockNumber } from '../utils/blockNumber';
import { getEvmChainsForNetwork, getChainName } from '../utils/Chainregistry';
import { formatTxAmount, formatAssetName, getDisplayAmountWithSign } from '../utils/formatAmount';
import TransactionDetailsSheet from './TransactionDetailsSheet';
import TransactionDetailsView from './TransactionDetailsView';

type ViewType = 'recent' | 'stellar' | number;

const STATUS_STYLES: Record<LocalTransactionWithStatus['status'], string> = {
  pending: 'bg-yellow-500/10 border-yellow-500/20 text-yellow-500',
  success: 'bg-green-500/10 border-green-500/20 text-green-500',
  failed: 'bg-red-500/10 border-red-500/20 text-red-500',
};

const StatusIcon: React.FC<{ status: LocalTransactionWithStatus['status'] }> = ({ status }) => {
  if (status === 'pending') return <Loader2 className="w-5 h-5 animate-spin text-yellow-500" />;
  if (status === 'success') return <CheckCircle className="w-5 h-5 text-green-500" />;
  return <XCircle className="w-5 h-5 text-red-500" />;
};

const formatRelativeTime = (timestamp: number): string => {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return new Date(timestamp).toLocaleDateString();
};

const EmptyState: React.FC<{ icon: React.ReactNode; title: string; description: string }> = ({
  icon,
  title,
  description,
}) => (
  <div className="flex flex-col items-center justify-center py-20 text-center">
    <div className="w-16 h-16 bg-tertiary rounded-full flex items-center justify-center mb-4 text-muted">
      {icon}
    </div>
    <h3 className="text-lg font-bold text-primary mb-2">{title}</h3>
    <p className="text-muted text-sm max-w-xs">{description}</p>
  </div>
);

const EvmTransactionHistory: React.FC = () => {
  const [searchParams] = useSearchParams();
  const txHashFromUrl = searchParams.get('hash');

  const connectedWallets = useWalletStore(state => state.connectedWallets);
  const currentNetwork = useWalletStore(state => state.network);

  const evmWallet = connectedWallets[WalletType.EVM];
  const stellarWallet = connectedWallets[WalletType.STELLAR];
  const walletAddress = evmWallet?.address;
  const hasEvm = Boolean(walletAddress);
  const hasStellar = Boolean(stellarWallet);

  const availableChains = getEvmChainsForNetwork(currentNetwork);

  const defaultView: ViewType = hasEvm ? 'recent' : hasStellar ? 'stellar' : 'recent';

  const [selectedView, setSelectedView] = useState<ViewType>(defaultView);
  const [historyData, setHistoryData] = useState<TransactionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTx, setSelectedTx] = useState<TransactionItem | null>(null);
  const [selectedLocalTx, setSelectedLocalTx] = useState<LocalTransactionWithStatus | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [sentPageKey, setSentPageKey] = useState<string | null>(null);
  const [receivedPageKey, setReceivedPageKey] = useState<string | null>(null);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const {
    transactions: localTransactions,
    isLoading: localLoading,
    refresh: refreshLocal,
    refreshTransaction,
    removeTransaction,
    hasPendingTransactions,
  } = useLocalTransactions();

  useEffect(() => {
    if (txHashFromUrl && localTransactions.length > 0) {
      const found = localTransactions.find(
        tx => tx.hash.toLowerCase() === txHashFromUrl.toLowerCase()
      );
      if (found) {
        setSelectedView('recent');
        setSelectedLocalTx(found);
        setSelectedTx(null);
        if (window.innerWidth < 1024) setIsSheetOpen(true);
      }
    }
  }, [txHashFromUrl, localTransactions]);

  useEffect(() => {
    if (walletAddress && typeof selectedView === 'number') {
      fetchHistory();
    }
  }, [walletAddress, selectedView]);

  const fetchHistory = async () => {
    if (!walletAddress || typeof selectedView !== 'number') return;
    setLoading(true);
    setError(null);
    setSelectedTx(null);
    setSentPageKey(null);
    setReceivedPageKey(null);
    setHasNextPage(false);
    try {
      const response = await getEvmTransactionHistory(walletAddress, selectedView, currentNetwork);
      setHistoryData(response.data);
      setSentPageKey(response.pagination.nextSentPageKey);
      setReceivedPageKey(response.pagination.nextReceivedPageKey);
      setHasNextPage(response.pagination.hasNextPage);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch transaction history');
    } finally {
      setLoading(false);
    }
  };

  const loadMoreHistory = async () => {
    if (!walletAddress || typeof selectedView !== 'number' || !hasNextPage || loadingMore) return;
    setLoadingMore(true);
    try {
      const response = await getEvmTransactionHistory(
        walletAddress,
        selectedView,
        currentNetwork,
        sentPageKey ?? undefined,
        receivedPageKey ?? undefined,
      );
      setHistoryData(prev => [...prev, ...response.data]);
      setSentPageKey(response.pagination.nextSentPageKey);
      setReceivedPageKey(response.pagination.nextReceivedPageKey);
      setHasNextPage(response.pagination.hasNextPage);
    } catch (err: any) {
      console.error('Failed to load more:', err);
    } finally {
      setLoadingMore(false);
    }
  };

  const handleTxClick = (tx: TransactionItem) => {
    setSelectedTx(tx);
    setSelectedLocalTx(null);
    if (window.innerWidth < 1024) setIsSheetOpen(true);
  };

  const handleLocalTxClick = (tx: LocalTransactionWithStatus) => {
    setSelectedLocalTx(tx);
    setSelectedTx(null);
    if (window.innerWidth < 1024) setIsSheetOpen(true);
    if (tx.status === 'pending' || tx.type === 'bridge') {
      refreshTransaction(tx.hash);
    }
  };

  const switchView = (view: ViewType) => {
    setSelectedView(view);
    setSelectedTx(null);
    setSelectedLocalTx(null);
  };

  if (!hasEvm && !hasStellar) {
    return (
      <PageLayout title="Transactions" maxWidth="7xl">
        <EmptyState
          icon={<Clock size={32} />}
          title="No Wallet Connected"
          description="Please connect your EVM or Stellar wallet to view your transaction history."
        />
      </PageLayout>
    );
  }

  const HeaderActions = (
    <div className="flex bg-tertiary rounded-lg p-1 gap-1 overflow-x-auto">
      {hasEvm && (
        <>
          <button
            onClick={() => switchView('recent')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 ${selectedView === 'recent' ? 'bg-primary text-secondary shadow-sm' : 'text-muted hover:text-primary'}`}
          >
            Recent
            {hasPendingTransactions && (
              <span className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse" />
            )}
          </button>
          {availableChains.map(chain => (
            <button
              key={chain.chainId}
              onClick={() => switchView(chain.chainId)}
              className={`px-3 py-1.5 flex items-center gap-1.5 rounded-md text-xs font-semibold transition-all ${selectedView === chain.chainId ? 'bg-primary text-secondary shadow-sm' : 'text-muted hover:text-primary'}`}
            >
              <img src={chain.imageUrl} alt={chain.nativeCurrency.symbol} className="w-4 h-4 rounded-full bg-secondary" />
              {chain.nativeCurrency.symbol}
            </button>
          ))}
        </>
      )}
      {hasStellar && (
        <button
          onClick={() => switchView('stellar')}
          className={`px-3 py-1.5 flex items-center gap-1.5 rounded-md text-xs font-semibold transition-all ${selectedView === 'stellar' ? 'bg-primary text-secondary shadow-sm' : 'text-muted hover:text-primary'}`}
        >
          <img src="https://coin-images.coingecko.com/coins/images/100/large/Stellar_symbol_black_RGB.png" className="w-4 h-4 rounded-full bg-secondary" alt="Stellar" />
          Stellar
        </button>
      )}
    </div>
  );

  const renderRecentTransactions = () => {
    if (localLoading && localTransactions.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-brand-primary mb-4" />
          <p className="text-sm text-muted animate-pulse">Loading recent transactions...</p>
        </div>
      );
    }

    if (localTransactions.length === 0) {
      return (
        <EmptyState
          icon={<Clock size={32} />}
          title="No Recent Transactions"
          description="Your recent transactions will appear here after you make a swap, send, or bridge."
        />
      );
    }

    return (
      <div className="space-y-3 overflow-y-auto pr-2 pb-20 lg:pb-0">
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs text-muted">
            {hasPendingTransactions
              ? 'Auto-refreshing pending transactions...'
              : `${localTransactions.length} transaction(s)`}
          </p>
          <button
            onClick={refreshLocal}
            className="p-2 rounded-lg bg-tertiary hover:bg-tertiary/80 text-muted hover:text-primary transition-colors"
            title="Refresh All"
          >
            <RefreshCw size={14} className={localLoading ? 'animate-spin' : ''} />
          </button>
        </div>

        {localTransactions.map(tx => {
          const isSelected = selectedLocalTx?.hash === tx.hash;
          const statusStyle = STATUS_STYLES[tx.status];
          const label =
            tx.description ||
            `${tx.type.charAt(0).toUpperCase() + tx.type.slice(1)} Transaction`;

          return (
            <div
              key={tx.hash}
              className={`w-full p-4 rounded-2xl flex items-center justify-between transition-all group border ${isSelected
                ? 'bg-secondary border-brand-primary/50 shadow-md ring-1 ring-brand-primary/20'
                : 'bg-secondary hover:bg-tertiary/50 border-transparent hover:border-color'
                }`}
            >
              <button
                onClick={() => handleLocalTxClick(tx)}
                className="flex items-center gap-4 flex-1 text-left"
              >
                <div
                  className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 border ${statusStyle}`}
                >
                  <StatusIcon status={tx.status} />
                </div>
                <div>
                  <div className="font-bold text-primary text-base flex items-center gap-2">
                    {label}
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-tertiary text-muted uppercase font-bold tracking-wider">
                      {getChainName(tx.chainId)}
                    </span>
                  </div>
                  <div className="text-xs text-muted font-mono mt-1 flex items-center gap-2">
                    <span className="opacity-75">{formatRelativeTime(tx.timestamp)}</span>
                    <span className="w-1 h-1 rounded-full bg-muted/40" />
                    <span className="truncate max-w-[100px]">
                      {tx.hash.slice(0, 6)}...{tx.hash.slice(-4)}
                    </span>
                    {tx.type === 'bridge' && tx.destinationHash && (
                      <>
                        <span className="w-1 h-1 rounded-full bg-muted/40" />
                        <span className="text-green-500 flex items-center gap-1">
                          Ref: {tx.destinationHash.slice(0, 4)}...{tx.destinationHash.slice(-4)}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </button>
              <div className="flex items-center gap-2">
                <span
                  className={`text-xs font-semibold px-2 py-1 rounded-full capitalize ${statusStyle}`}
                >
                  {tx.status}
                </span>
                <button
                  onClick={e => {
                    e.stopPropagation();
                    refreshTransaction(tx.hash);
                  }}
                  className="p-2 rounded-lg bg-tertiary hover:bg-tertiary/80 text-muted hover:text-primary transition-colors"
                  title="Refresh Transaction"
                >
                  <RefreshCw size={14} className={tx.status === 'pending' || (tx.type === 'bridge' && !tx.destinationHash) ? 'animate-spin' : ''} />
                </button>
                <button
                  onClick={e => {
                    e.stopPropagation();
                    removeTransaction(tx.hash);
                  }}
                  className="p-2 rounded-lg bg-tertiary hover:bg-red-500/10 text-muted hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                  title="Remove"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    );
  };


  const renderHistoryTransactions = () => {
    if (loading) {
      return (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-brand-primary mb-4" />
          <p className="text-sm text-muted animate-pulse">Loading history...</p>
        </div>
      );
    }

    if (error) {
      return (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex flex-col items-center text-center">
          <p className="text-red-500 font-medium mb-1">Unable to load transactions</p>
          <p className="text-xs text-red-500/80 mb-3">{error}</p>
          <button
            onClick={fetchHistory}
            className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg text-xs font-bold transition-colors"
          >
            Try Again
          </button>
        </div>
      );
    }

    if (historyData.length === 0) {
      return (
        <EmptyState
          icon={<SearchX size={32} />}
          title="No Transactions Found"
          description={`No transactions found for ${typeof selectedView === 'number' ? getChainName(selectedView) : selectedView
            }.`}
        />
      );
    }

    return (
      <div className="space-y-3 overflow-y-auto pb-4 lg:pb-0">
        {historyData.map(tx => {
          const isSelf = Boolean(tx.from.toLowerCase() === tx.to.toLowerCase());
          const incoming = !isSelf && Boolean(walletAddress && tx.to.toLowerCase() === walletAddress.toLowerCase());

          let actionLabel = 'Sent';
          let Icon = ArrowUpRight;
          if (isSelf) {
            actionLabel = 'Self Transfer';
            Icon = RefreshCw;
          } else if (incoming) {
            actionLabel = 'Received';
            Icon = ArrowDownLeft;
          }

          const isSelected = selectedTx?.uniqueId === tx.uniqueId;
          return (
            <button
              key={tx.uniqueId}
              onClick={() => handleTxClick(tx)}
              className={`w-full rounded-lg bg-primary p-3 flex items-center justify-between transition-all group text-left ${isSelected ? 'border' : 'hover:bg-tertiary/50'
                }`}
            >
              <div className="flex items-center gap-4">
                <div className="lg:w-12 lg:h-12 h-8 w-8 rounded-full flex items-center justify-center shrink-0 border bg-tertiary border-color text-muted">
                  <Icon size={24} />
                </div>
                <div>
                  <div className="text-primary font-semibold lg:text-md text-sm flex items-center gap-1">
                    {actionLabel} {formatAssetName(tx)}
                    <span className="lg:text-md text-xs px-2 py-0.5 rounded-full bg-tertiary text-muted uppercase font-bold tracking-wider">
                      {tx.category}
                    </span>
                  </div>
                  {/* Block number display — BigInt-safe via formatBlockNumber */}
                  <div className="text-xs text-muted font-mono mt-1 flex items-center gap-2">
                    <span className="opacity-75">
                      {tx.blockNum
                        ? `Block #${formatBlockNumber(tx.blockNum)}`
                        : 'Pending'}
                    </span>
                    <span className="w-1 h-1 rounded-full bg-muted/40" />
                    <span className="truncate max-w-[100px]">
                      {tx.hash.slice(0, 6)}...{tx.hash.slice(-4)}
                    </span>
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="font-bold font-mono text-base text-primary">
                  {getDisplayAmountWithSign(formatTxAmount(tx), incoming, isSelf)}
                </div>
                <div className="text-xs text-muted mt-1 font-medium bg-tertiary/50 px-2 py-0.5 rounded ml-auto w-fit">
                  {formatAssetName(tx)}
                </div>
              </div>
            </button>
          );
        })}
        {hasNextPage && (
          <button
            onClick={loadMoreHistory}
            disabled={loadingMore}
            className="w-full py-3 mt-4 rounded-xl border border-color bg-tertiary hover:bg-tertiary/80 text-primary font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loadingMore ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Loading...
              </>
            ) : (
              'Load More'
            )}
          </button>
        )}
      </div>
    );
  };

  const isStellarView = selectedView === 'stellar';

  const isTxSelf = Boolean(selectedTx && selectedTx.from.toLowerCase() === selectedTx.to.toLowerCase());
  const isTxIncoming = !isTxSelf && Boolean(walletAddress && selectedTx?.to.toLowerCase() === walletAddress.toLowerCase());

  return (
    <PageLayout title="Transactions" headerActions={HeaderActions} maxWidth="7xl">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 relative items-start">
        <div
          className={`${isStellarView ? 'col-span-1 lg:col-span-12' : 'lg:col-span-7 xl:col-span-8'
            } flex flex-col`}
        >
          {isStellarView
            ? <AllTransactionsUI embedded />
            : selectedView === 'recent'
              ? renderRecentTransactions()
              : renderHistoryTransactions()}
        </div>

        {!isStellarView && (
          <div className="hidden lg:block lg:col-span-5 xl:col-span-4 sticky top-6 h-[calc(100vh-48px)]">
            {selectedView === 'recent' && selectedLocalTx ? (
              <div className="h-full animate-in fade-in slide-in-from-right-4 duration-300">
                <TransactionDetailsView
                  transaction={selectedLocalTx}
                  chainId={selectedLocalTx.chainId}
                  onRefresh={() => refreshTransaction(selectedLocalTx.hash)}
                />
              </div>
            ) : selectedTx ? (
              <div className="h-full animate-in fade-in slide-in-from-right-4 duration-300">
                <TransactionDetailsView transaction={selectedTx} chainId={selectedTx.chainId} incoming={isTxIncoming} isSelf={isTxSelf} />
              </div>
            ) : (
              <div className="h-full bg-secondary/30 border border-dashed border-color rounded-2xl flex flex-col items-center justify-center text-center p-8">
                <div className="w-16 h-16 bg-tertiary rounded-full flex items-center justify-center mb-4 text-muted/50">
                  <SearchX size={32} />
                </div>
                <h3 className="text-lg font-bold text-muted mb-2">No Transaction Selected</h3>
                <p className="text-sm text-muted/70">
                  Select a transaction from the list on the left to view its full details here.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {(selectedTx || selectedLocalTx) && (
        <TransactionDetailsSheet
          transaction={selectedTx || selectedLocalTx!}
          isOpen={isSheetOpen}
          onClose={() => setIsSheetOpen(false)}
          chainId={selectedTx?.chainId || selectedLocalTx!.chainId}
          incoming={isTxIncoming}
          isSelf={isTxSelf}
          onRefresh={selectedLocalTx ? () => refreshTransaction(selectedLocalTx!.hash) : undefined}
        />
      )}
    </PageLayout>
  );
};

export default EvmTransactionHistory;