import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle,
  Clock,
  Loader2,
  RefreshCw,
  SearchX,
  ShieldCheck,
  XCircle,
  ExternalLink,
} from 'lucide-react';
import React, { useEffect, useState, useRef } from 'react';

import PageLayout from '../../../components/layout/PageLayout';
import AllTransactionsUI from '../../steallr/components/AllTransactionsUI';
import { WalletType } from '../../walletconnect/constants/Wallet';
import { useWalletStore } from '../../walletconnect/store/walletConnectStore';
import { useSearchParams } from 'react-router-dom';
import {
  type LocalTransactionWithStatus,
} from '../hook/useLocalTransactions';
import { useEvmTransaction } from '../hook/useEvmTransaction';
import { type SwapOrder, updateSwapOrderStatus } from '../service/evmTransactionStatusService';
import {
  type TransactionItem,
  getEvmTransactionHistory,
} from '../service/EvmTransactionService';
import { formatBlockNumber } from '../utils/blockNumber';
import { getEvmChainsForNetwork, getChainName, findChain, getExplorerUrl } from '../utils/Chainregistry';
import { rpcManager } from '../utils/rpcProvider';
import { formatTxAmount, formatAssetName, getDisplayAmountWithSign } from '../utils/formatAmount';
import TransactionDetailsSheet from './TransactionDetailsSheet';
import TransactionDetailsView from './TransactionDetailsView';
import { checkTxStatus } from './TransactionMonitor';

type ViewType = 'recent' | 'stellar' | number;

const STATUS_STYLES: Record<LocalTransactionWithStatus['status'], string> = {
  pending: 'bg-yellow-500/10 border-yellow-500/20 text-yellow-500',
  success: 'bg-green-500/10 border-green-500/20 text-green-500',
  failed: 'bg-red-500/10 border-red-500/20 text-red-500',
};

const StatusIcon: React.FC<{ status: LocalTransactionWithStatus['status']; type: string }> = ({ status, type }) => {
  if (status === 'pending') return <Loader2 className="w-5 h-5 animate-spin text-yellow-500" />;
  if (type === 'approval' && status === 'success') return <ShieldCheck className="w-5 h-5 text-blue-500" />;
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
  const [searchParams, setSearchParams] = useSearchParams();
  const txHashFromUrl = searchParams.get('hash');

  const connectedWallets = useWalletStore(state => state.connectedWallets);
  const currentNetwork = useWalletStore(state => state.network);

  const evmWallet = connectedWallets[WalletType.EVM];
  const stellarWallet = connectedWallets[WalletType.STELLAR];
  const cosmosWallet = connectedWallets[WalletType.COSMOS];
  const walletAddress = evmWallet?.address;
  const hasEvm = Boolean(walletAddress);
  const hasStellar = Boolean(stellarWallet);
  const hasCosmos = Boolean(cosmosWallet);

  const availableChains = getEvmChainsForNetwork(currentNetwork);

  const defaultView: ViewType = hasEvm ? 'recent' : (hasStellar || hasCosmos) ? 'recent' : 'recent';
  const tabParam = searchParams.get('tab');
  const initialView: ViewType = tabParam === 'stellar' 
    ? 'stellar' 
    : tabParam === 'recent' 
      ? 'recent' 
      : tabParam && !isNaN(Number(tabParam)) 
        ? Number(tabParam) 
        : defaultView;

  const [selectedView, setSelectedView] = useState<ViewType>(initialView);
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
  const [ordersPage, setOrdersPage] = useState(1);
  const [loadingMoreOrders, setLoadingMoreOrders] = useState(false);
  const [liveStatusOverrides, setLiveStatusOverrides] = useState<Record<string, 'success' | 'failed'>>({});



  const {
    ordersData: backendOrders,
    loading: ordersLoading,
    statusData,
    getTransactionStatus,
    getSwapOrdersByWallet: refreshOrders
  } = useEvmTransaction();

  const isCheckingOnChain = useRef<boolean>(false);
  const checkingHashes = useRef<Set<string>>(new Set());

  // Actively check on-chain transaction receipt ONLY for pending Uniswap backend orders
  // Other provider statuses must come exclusively from the backend proxy
  useEffect(() => {
    const pendingOrders = backendOrders?.data?.filter((order: SwapOrder) => 
      (order.provider?.toUpperCase() === 'UNISWAP' || order.provider?.toUpperCase() === 'EVMTX') && 
      order.status === 'pending' && 
      !liveStatusOverrides[order.txHash.toLowerCase()]
    );

    // Limit to the latest 5 pending orders to prevent network/RPC bottleneck
    const ordersToCheck = pendingOrders?.slice(0, 5);

    if (!ordersToCheck || ordersToCheck.length === 0) return;

    const checkStatuses = async () => {
      if (isCheckingOnChain.current) return;
      isCheckingOnChain.current = true;

      try {
        for (const order of ordersToCheck) {
          try {
            let isConfirmed = false;
            let isSuccess = false;

            const chainConfig = findChain(order.fromChain, currentNetwork);
            const chainSymbol = chainConfig?.symbol === 'BNB' ? 'BSC' : chainConfig?.symbol;

            if (chainSymbol) {
              const apiResult = await checkTxStatus(order.txHash, chainSymbol);
              if (apiResult) {
                isConfirmed = true;
                isSuccess = apiResult.status;
              }
            }

            if (!isConfirmed) {
              if (!chainConfig || !chainConfig.rpcUrls?.length) continue;
              const receipt = await rpcManager.fetchWithFallback(
                chainConfig.chainId, 
                chainConfig.rpcUrls, 
                async (provider) => provider.getTransactionReceipt(order.txHash)
              );

              if (receipt) {
                isConfirmed = true;
                isSuccess = receipt.status === 1;
              }
            }

            if (isConfirmed) {
              const newStatus = isSuccess ? 'success' : 'failed';
              setLiveStatusOverrides(prev => ({
                ...prev,
                [order.txHash.toLowerCase()]: newStatus
              }));
              await updateSwapOrderStatus({
                txHash: order.txHash,
                orderStatus: isSuccess ? 'completed' : 'failed'
              }).catch(err => console.error('Failed to update status in DB:', err));
            }
          } catch (err) {
            console.error('Failed to verify pending backend order on-chain:', err);
          }
        }
      } finally {
        isCheckingOnChain.current = false;
      }
    };

    checkStatuses();
    const interval = setInterval(checkStatuses, 8000);
    return () => clearInterval(interval);
  }, [backendOrders?.data, currentNetwork, liveStatusOverrides]);

  useEffect(() => {
    if (walletAddress) {
      setOrdersPage(1);
      refreshOrders(walletAddress, 1, 10, false);
    }
  }, [walletAddress]);

  useEffect(() => {
    if (txHashFromUrl && backendOrders?.data) {
      const found = backendOrders.data.find(
        (order: SwapOrder) => order.txHash.toLowerCase() === txHashFromUrl.toLowerCase()
      );
      if (found) {
        const chainConfig = findChain(found.fromChain, currentNetwork);
        const isBridge = found.fromChain !== found.toChain;
        const defaultTxType = isBridge ? 'Bridge' : 'Swap';
        let description = `${defaultTxType} ${found.fromToken} \u2192 ${found.toToken}`;
        
        if (found.txType) {
          if (found.txType.toLowerCase().includes('approval')) {
            description = `Approve ${found.fromToken}`;
          } else if (found.txType.toLowerCase() === 'token transfer' || found.provider?.toUpperCase() === 'EVMTX') {
            description = `${found.txType} ${found.fromToken}`;
            if (found.toToken && found.toToken !== found.fromToken) {
              description += ` \u2192 ${found.toToken}`;
            }
          } else {
            description = `${found.txType} ${found.fromToken} \u2192 ${found.toToken}`;
          }
        }

        const normalized: LocalTransactionWithStatus & { 
          provider?: string; 
          isBackendOrder?: boolean;
          fromChainSymbol?: string;
          amountIn?: string;
          amountOut?: string;
          fromToken?: string;
          toToken?: string;
        } = {
          hash: found.txHash,
          chainId: chainConfig?.chainId || found.fromChain,
          type: isBridge ? 'bridge' : 'swap',
          timestamp: new Date(found.createdAt).getTime(),
          description: description,
          status: found.status === 'completed' ? 'success' : found.status === 'failed' ? 'failed' : 'pending',
          from: found.walletAddress,
          network: currentNetwork,
          provider: found.provider,
          isBackendOrder: true,
          fromChainSymbol: found.fromChain,
          amountIn: found.amountIn,
          amountOut: found.amountOut,
          fromToken: found.fromToken,
          toToken: found.toToken,
        };
        setSelectedView(searchParams.get('tab') === 'stellar' ? 'stellar' : 'recent');
        setSelectedLocalTx(normalized);
        setSelectedTx(null);
        if (window.innerWidth < 1024) setIsSheetOpen(true);
      }
    }
  }, [txHashFromUrl, backendOrders?.data, searchParams, currentNetwork]);

  useEffect(() => {
    const currentTab = searchParams.get('tab');
    const newTabStr = String(selectedView);
    if (currentTab !== newTabStr) {
      setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        next.set('tab', newTabStr);
        return next;
      }, { replace: true });
    }
  }, [selectedView, setSearchParams, searchParams]);

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

  const loadMoreOrders = async () => {
    if (!walletAddress || !backendOrders?.hasNext || loadingMoreOrders) return;
    setLoadingMoreOrders(true);
    const nextPage = ordersPage + 1;
    try {
      await refreshOrders(walletAddress, nextPage, 10, true);
      setOrdersPage(nextPage);
    } catch (err) {
      console.error('Failed to load more backend orders:', err);
    } finally {
      setLoadingMoreOrders(false);
    }
  };

  const handleTxClick = (tx: TransactionItem) => {
    setSelectedTx(tx);
    setSelectedLocalTx(null);
    if (window.innerWidth < 1024) setIsSheetOpen(true);
  };

  const handleLocalTxClick = (tx: LocalTransactionWithStatus & { provider?: string; isBackendOrder?: boolean; fromChainSymbol?: string }) => {
    setSelectedLocalTx(tx);
    console.log(tx, "----------- i am tx from Evm transction ")
    setSelectedTx(null);
    if (window.innerWidth < 1024) setIsSheetOpen(true);

    if (tx.isBackendOrder && tx.provider) {
      if (tx.provider.toUpperCase() === 'UNISWAP' || tx.provider.toUpperCase() === 'EVMTX') {
        const hashLower = tx.hash.toLowerCase();
        
        // Prevent redundant network requests if already checking or if it is no longer pending
        if (checkingHashes.current.has(hashLower) || liveStatusOverrides[hashLower] || tx.status !== 'pending') {
            return;
        }

        checkingHashes.current.add(hashLower);

        const checkLocalStatus = async () => {
          try {
            let isConfirmed = false;
            let isSuccess = false;

            const chainConfig = findChain(tx.fromChainSymbol || String(tx.chainId), currentNetwork);
            const chainSymbol = chainConfig?.symbol === 'BNB' ? 'BSC' : chainConfig?.symbol;

            if (chainSymbol) {
              const apiResult = await checkTxStatus(tx.hash, chainSymbol);
              if (apiResult) {
                isConfirmed = true;
                isSuccess = apiResult.status;
              }
            }

            if (!isConfirmed) {
              if (chainConfig && chainConfig.rpcUrls?.length) {
                const receipt = await rpcManager.fetchWithFallback(
                  chainConfig.chainId,
                  chainConfig.rpcUrls,
                  async (provider) => provider.getTransactionReceipt(tx.hash)
                );
                if (receipt) {
                  isConfirmed = true;
                  isSuccess = receipt.status === 1;
                }
              }
            }

            if (isConfirmed) {
              const newStatus = isSuccess ? 'success' : 'failed';
              setLiveStatusOverrides(prev => ({
                ...prev,
                [tx.hash.toLowerCase()]: newStatus
              }));
              await updateSwapOrderStatus({
                txHash: tx.hash,
                orderStatus: isSuccess ? 'completed' : 'failed'
              }).catch(err => console.error('Failed to update status in DB:', err));
            }
          } catch (err) {
            console.error('Failed to verify order on-chain:', err);
          } finally {
            checkingHashes.current.delete(hashLower);
          }
        };
        checkLocalStatus();
      } else {
        getTransactionStatus({
          walletType: tx.fromChainSymbol || 'ETH',
          txHash: tx.hash,
          provider: tx.provider
        }).catch((err: any) => console.error('Failed to refresh backend order status:', err));
      }
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
          description="Please connect a wallet (EVM, Stellar, or Cosmos) to view your transaction history."
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
            {backendOrders?.data?.some(order => order.status === 'pending') && (
              <span className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse" />
            )}
          </button>
          {availableChains.map(chain => (
            <button
              key={chain.chainId}
              onClick={() => switchView(chain.chainId as ViewType)}
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
    const combinedRecent = (() => {
      const mergedMap = new Map<string, LocalTransactionWithStatus>();

      // Add backend orders, mapping them to LocalTransactionWithStatus format
      backendOrders?.data?.forEach((order: SwapOrder) => {
        const chainConfig = findChain(order.fromChain, currentNetwork);
        const isLocalCheckable = order.provider?.toUpperCase() === 'UNISWAP' || order.provider?.toUpperCase() === 'EVMTX';
        const resolvedStatus = isLocalCheckable
          ? (liveStatusOverrides[order.txHash.toLowerCase()] || (order.status === 'completed' ? 'success' : order.status === 'failed' ? 'failed' : 'pending'))
          : (order.status === 'completed' ? 'success' : order.status === 'failed' ? 'failed' : 'pending');

        const isBridge = order.fromChain !== order.toChain;
        const defaultTxType = isBridge ? 'Bridge' : 'Swap';
        
        let description = `${defaultTxType} ${order.fromToken} \u2192 ${order.toToken}`;
        if (order.txType) {
          if (order.txType.toLowerCase().includes('approval')) {
            description = `Approve ${order.fromToken}`;
          } else if (order.txType.toLowerCase() === 'token transfer' || order.provider?.toUpperCase() === 'EVMTX') {
            description = `${order.txType} ${order.fromToken}`;
            if (order.toToken && order.toToken !== order.fromToken) {
              description += ` \u2192 ${order.toToken}`;
            }
          } else {
            description = `${order.txType} ${order.fromToken} \u2192 ${order.toToken}`;
          }
        }

        const normalized: LocalTransactionWithStatus & { 
          provider?: string; 
          isBackendOrder?: boolean;
          fromChainSymbol?: string;
          amountIn?: string;
          amountOut?: string;
          fromToken?: string;
          toToken?: string;
        } = {
          hash: order.txHash,
          chainId: chainConfig?.chainId || order.fromChain,
          type: isBridge ? 'bridge' : 'swap',
          timestamp: new Date(order.createdAt).getTime(),
          description: description,
          status: resolvedStatus,
          from: order.walletAddress,
          network: currentNetwork,
          provider: order.provider,
          isBackendOrder: true,
          fromChainSymbol: order.fromChain,
          amountIn: order.amountIn,
          amountOut: order.amountOut,
          fromToken: order.fromToken,
          toToken: order.toToken,
        };
        mergedMap.set(order.txHash.toLowerCase(), normalized);
      });

      return Array.from(mergedMap.values()).sort((a, b) => {
        // 1. Pending transactions always on top
        const aPending = a.status === 'pending' ? 1 : 0;
        const bPending = b.status === 'pending' ? 1 : 0;
        if (aPending !== bPending) {
          return bPending - aPending;
        }
        // 2. Secondary sort by timestamp descending
        return (b.timestamp || 0) - (a.timestamp || 0);
      });
    })();

    const showFullLoader = ordersLoading && !backendOrders?.data;

    if (showFullLoader) {
      return (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-brand-primary mb-4" />
          <p className="text-sm text-muted animate-pulse">Loading recent transactions...</p>
        </div>
      );
    }

    if (combinedRecent.length === 0) {
      return (
        <EmptyState
          icon={<Clock size={32} />}
          title="No Recent Transactions"
          description="Your recent transactions will appear here after you make a swap, send, or bridge."
        />
      );
    }

    const groups: { title: string; transactions: typeof combinedRecent }[] = [];
    const groupMap: { [key: string]: number } = {};

    combinedRecent.forEach(tx => {
      const timestamp = tx.timestamp;
      let dateString = 'Unknown Date';

      if (timestamp) {
        const date = new Date(timestamp);
        const d = date.getDate();
        const m = date.toLocaleString('default', { month: 'short' }).toUpperCase();
        const y = date.getFullYear();
        dateString = `${d} ${m} ${y}`;
      }

      if (groupMap[dateString] === undefined) {
        groupMap[dateString] = groups.length;
        groups.push({ title: dateString, transactions: [] });
      }
      groups[groupMap[dateString]].transactions.push(tx);
    });

    return (
      <div className="space-y-6 overflow-y-auto pb-4 lg:pb-0 custom-scrollbar pr-2">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted">
            {backendOrders?.data?.some(order => order.status === 'pending')
              ? 'Auto-refreshing pending transactions...'
              : `${combinedRecent.length} transaction(s)`}
          </p>
          <button
            onClick={() => {
              if (walletAddress) {
                setOrdersPage(1);
                refreshOrders(walletAddress, 1, 10, false);
              }
            }}
            className="p-2 rounded-lg bg-tertiary hover:bg-tertiary/80 text-muted hover:text-primary transition-colors"
            title="Refresh All"
          >
            <RefreshCw size={14} className={ordersLoading ? 'animate-spin' : ''} />
          </button>
        </div>

        {groups.map((group, index) => (
          <div key={index} className="space-y-3">
            <h4 className="text-xs font-bold text-muted uppercase tracking-wider pl-1 sticky top-0 bg-secondary/90 backdrop-blur z-10 py-1">
              {group.title}
            </h4>
            {group.transactions.map(tx => {
              const isSelected = selectedLocalTx?.hash === tx.hash;
              const statusStyle = STATUS_STYLES[tx.status];
              const rawLabel =
                tx.description ||
                `${tx.type.charAt(0).toUpperCase() + tx.type.slice(1)} Transaction`;

              const cleanLabel = rawLabel
                .replace(/\s*\(Step \d+\/\d+\)/i, '')
                .replace(/\s*for Swap/i, '');

              let topAmount = '';
              let bottomToken = '';
              if ((tx as any).isBackendOrder) {
                const num = Number((tx as any).amountIn);
                topAmount = isNaN(num) 
                  ? ((tx as any).amountIn || '') 
                  : num < 0.000001 
                    ? '< 0.000001' 
                    : num.toFixed(4).replace(/\.?0+$/, '');
                bottomToken = (tx as any).fromToken || '';
              } else {
                const match = tx.description?.match(/Swap\s+([\d.]+)\s+([A-Za-z0-9]+)/i);
                if (match) {
                  const num = Number(match[1]);
                  topAmount = isNaN(num) ? match[1] : num.toFixed(4).replace(/\.?0+$/, '');
                  bottomToken = match[2];
                }
              }

              return (
                <div
                  key={tx.hash}
                  className={`w-full p-3 rounded-lg flex items-center justify-between transition-all group text-left ${isSelected
                    ? 'bg-secondary border border-transparent'
                    : 'bg-primary hover:bg-tertiary/50 border border-transparent hover:border-color'
                    }`}
                >
                  <button
                    onClick={() => handleLocalTxClick(tx)}
                    className="flex items-center gap-4 flex-1 min-w-0 text-left"
                  >
                    <div
                      className={`lg:w-12 lg:h-12 h-8 w-8 rounded-full flex items-center justify-center shrink-0 border ${tx.type === 'approval' && tx.status === 'success' ? 'bg-blue-500/10 border-blue-500/20' : statusStyle}`}
                    >
                      <StatusIcon status={tx.status} type={tx.type} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-primary lg:text-md text-sm flex items-center gap-2 truncate">
                        <span className="truncate">{cleanLabel}</span>
                        <span className="lg:text-md text-[9px] px-2 py-0.5 rounded-full bg-tertiary text-muted uppercase font-bold tracking-wider shrink-0">
                          {getChainName(tx.chainId)}
                        </span>
                      </div>
                      <div className="text-xs text-muted font-mono mt-1 flex items-center gap-1.5 truncate">
                        <span className="opacity-75 shrink-0">{formatRelativeTime(tx.timestamp)}</span>
                        <span className="w-1 h-1 rounded-full bg-muted/40 shrink-0" />
                        <span className="truncate max-w-[80px] lg:max-w-[120px]">
                          {tx.hash.slice(0, 6)}...{tx.hash.slice(-4)}
                        </span>
                        {tx.type === 'bridge' && tx.destinationHash && (
                          <>
                            <span className="w-1 h-1 rounded-full bg-muted/40 shrink-0" />
                            <span className="text-green-500 truncate max-w-[80px]">
                              Ref: {tx.destinationHash.slice(0, 4)}...{tx.destinationHash.slice(-4)}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </button>
                  <div className="flex flex-col items-end justify-center gap-1.5 shrink-0 ml-2">
                    <div className="flex items-center gap-1">
                      <span
                        className={`text-[8px] lg:text-[9px] font-bold px-1.5 py-0.5 rounded-full capitalize tracking-wider shrink-0 ${statusStyle}`}
                      >
                        {tx.status}
                      </span>
                      <a
                        href={getExplorerUrl(tx.chainId, 'tx', tx.hash)}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="p-1 rounded bg-tertiary hover:bg-tertiary/80 text-muted hover:text-primary transition-colors flex items-center justify-center shrink-0"
                        title="View on Explorer"
                      >
                        <ExternalLink size={12} />
                      </a>
                    </div>
                    {topAmount && bottomToken && (
                      <div className="flex items-center gap-1">
                        <span className="font-bold font-mono text-xs lg:text-sm text-primary">
                          {topAmount}
                        </span>
                        <span className="text-[9px] text-muted font-medium bg-tertiary/50 px-1.5 py-0.5 rounded">
                          {bottomToken}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
        {backendOrders?.hasNext && (
          <button
            onClick={loadMoreOrders}
            disabled={loadingMoreOrders}
            className="w-full py-3 mt-4 rounded-xl border border-color bg-tertiary hover:bg-tertiary/80 text-primary font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loadingMoreOrders ? (
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

    const groups: { title: string; transactions: TransactionItem[] }[] = [];
    const groupMap: { [key: string]: number } = {};

    historyData.forEach(tx => {
      const timestamp = tx.metadata?.blockTimestamp;
      let dateString = 'Unknown Date';

      if (timestamp) {
        const date = new Date(timestamp);
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        if (date.toDateString() === today.toDateString()) {
          dateString = 'Today';
        } else if (date.toDateString() === yesterday.toDateString()) {
          dateString = 'Yesterday';
        } else {
          dateString = date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
        }
      }

      if (groupMap[dateString] === undefined) {
        groupMap[dateString] = groups.length;
        groups.push({ title: dateString, transactions: [] });
      }
      groups[groupMap[dateString]].transactions.push(tx);
    });

    const groupedTransactions = groups;

    return (
      <div className="space-y-6 overflow-y-auto pb-4 lg:pb-0 custom-scrollbar pr-2">
        {groupedTransactions.map((group, index) => (
          <div key={index} className="space-y-3">
            <h4 className="text-xs font-bold text-muted uppercase tracking-wider pl-1 sticky top-0 bg-secondary/90 backdrop-blur z-10 py-1">
              {group.title}
            </h4>
            {group.transactions.map(tx => {
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
                    <div className="min-w-0 flex-1">
                      <div className="text-primary font-semibold lg:text-md text-sm flex items-center gap-2 truncate">
                        <span className="truncate">{actionLabel}</span>
                        <span className="text-[9px] lg:text-xs px-2 py-0.5 rounded-full bg-tertiary text-muted uppercase font-bold tracking-wider shrink-0">
                          {tx.category}
                        </span>
                      </div>
                      {/* Block number display — BigInt-safe via formatBlockNumber */}
                      <div className="text-xs text-muted font-mono mt-1 flex items-center gap-1.5 truncate">
                        <span className="hidden lg:inline opacity-75 shrink-0">
                          {tx.blockNum
                            ? `Block #${formatBlockNumber(tx.blockNum)}`
                            : 'Pending'}
                        </span>
                        <span className="hidden lg:inline w-1 h-1 rounded-full bg-muted/40 shrink-0" />
                        <span className="truncate max-w-[80px] lg:max-w-[120px]">
                          {tx.hash.slice(0, 6)}...{tx.hash.slice(-4)}
                        </span>
                        <a
                          href={getExplorerUrl(typeof selectedView === 'number' ? selectedView : 1, 'tx', tx.hash)}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          className="p-1 rounded bg-tertiary hover:bg-tertiary/80 text-muted hover:text-primary transition-colors flex items-center justify-center shrink-0"
                          title="View on Explorer"
                        >
                          <ExternalLink size={10} />
                        </a>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-2">
                    <div className="text-right">
                      <div className="font-bold font-mono text-sm lg:text-base text-primary">
                        {getDisplayAmountWithSign(formatTxAmount(tx), incoming, isSelf)}
                      </div>
                      <div className="text-[9px] lg:text-xs text-muted mt-0.5 font-medium bg-tertiary/50 px-1.5 py-0.5 rounded ml-auto w-fit">
                        {formatAssetName(tx)}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ))}
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
                  onRefresh={() => {
                    if ((selectedLocalTx as any).isBackendOrder && (selectedLocalTx as any).provider) {
                      if ((selectedLocalTx as any).provider.toUpperCase() === 'UNISWAP') {
                        const chainConfig = findChain((selectedLocalTx as any).fromChainSymbol || String(selectedLocalTx.chainId), currentNetwork);
                        if (chainConfig && chainConfig.rpcUrls?.length) {
                          rpcManager.fetchWithFallback(
                            chainConfig.chainId,
                            chainConfig.rpcUrls,
                            async (provider) => provider.getTransactionReceipt(selectedLocalTx.hash)
                          ).then(receipt => {
                            if (receipt) {
                              const newStatus = receipt.status === 1 ? 'success' : 'failed';
                              setLiveStatusOverrides(prev => ({
                                ...prev,
                                [selectedLocalTx.hash.toLowerCase()]: newStatus
                              }));
                              updateSwapOrderStatus({
                                txHash: selectedLocalTx.hash,
                                orderStatus: receipt.status === 1 ? 'completed' : 'failed'
                              }).catch(err => console.error('Failed to update Uniswap status in DB:', err));
                            }
                          }).catch(err => console.error('Failed to verify UNISWAP order on-chain:', err));
                        }
                      } else {
                        getTransactionStatus({
                          walletType: (selectedLocalTx as any).fromChainSymbol || 'ETH',
                          txHash: selectedLocalTx.hash,
                          provider: (selectedLocalTx as any).provider
                        });
                      }
                    }
                  }}
                  backendStatus={statusData}
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
          onRefresh={selectedLocalTx ? () => {
            if ((selectedLocalTx as any).isBackendOrder && (selectedLocalTx as any).provider) {
              if ((selectedLocalTx as any).provider.toUpperCase() === 'UNISWAP') {
                const chainConfig = findChain((selectedLocalTx as any).fromChainSymbol || String(selectedLocalTx.chainId), currentNetwork);
                if (chainConfig && chainConfig.rpcUrls?.length) {
                  rpcManager.fetchWithFallback(
                    chainConfig.chainId,
                    chainConfig.rpcUrls,
                    async (provider) => provider.getTransactionReceipt(selectedLocalTx.hash)
                  ).then(receipt => {
                    if (receipt) {
                      const newStatus = receipt.status === 1 ? 'success' : 'failed';
                      setLiveStatusOverrides(prev => ({
                        ...prev,
                        [selectedLocalTx.hash.toLowerCase()]: newStatus
                      }));
                      updateSwapOrderStatus({
                        txHash: selectedLocalTx.hash,
                        orderStatus: receipt.status === 1 ? 'completed' : 'failed'
                      }).catch(err => console.error('Failed to update Uniswap status in DB:', err));
                    }
                  }).catch(err => console.error('Failed to verify UNISWAP order on-chain:', err));
                }
              } else {
                getTransactionStatus({
                  walletType: (selectedLocalTx as any).fromChainSymbol || 'ETH',
                  txHash: selectedLocalTx.hash,
                  provider: (selectedLocalTx as any).provider
                });
              }
            }
          } : undefined}
          backendStatus={statusData}
        />
      )}
    </PageLayout>
  );
};

export default EvmTransactionHistory;