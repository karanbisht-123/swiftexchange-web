import {
  AlertCircle,
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  ExternalLink,
  FileQuestion,
  Gift,
  Layers,
  Search,
  Shield,
} from 'lucide-react';
import { useState } from 'react';

import { WalletType } from '../../walletconnect/constants/Wallet';
import { useWalletConnect } from '../../walletconnect/hooks/useWalletConnect';
import { useWalletStore } from '../../walletconnect/store/walletConnectStore';
import { getExplorerUrl as getRegistryExplorerUrl } from '../../evm/utils/Chainregistry';
import { useAllTransactions } from '../hook/useAllTransactions';
import type { TransactionType, UnifiedTransaction } from '../types/allTransaction.types';

interface AllTransactionsUIProps {
  embedded?: boolean;
}

const AllTransactionsUI = ({ embedded = false }: AllTransactionsUIProps) => {
  const { connectedWallets } = useWalletConnect();
  const network = useWalletStore(state => state.network);
  const stellarWallet = connectedWallets[WalletType.STELLAR];
  const stellarAddress = stellarWallet?.address || '';

  const { transactions, isLoading, error, hasMore, loadMore } = useAllTransactions({
    userAddress: stellarAddress,
  });

  console.log(isLoading, "=====================")
  const [filterType, setFilterType] = useState<TransactionType | 'ALL'>('ALL');
  const [dateFilter, setDateFilter] = useState<'ALL' | '7D' | '30D'>('ALL');

  const filteredTransactions = transactions.filter(tx => {
    let matchesType = true;
    let matchesDate = true;

    if (filterType !== 'ALL') {
      matchesType = tx.type === filterType;
    }

    if (dateFilter !== 'ALL') {
      const txDate = new Date(tx.date).getTime();
      const now = Date.now();
      const oneDay = 24 * 60 * 60 * 1000;

      if (dateFilter === '7D') {
        matchesDate = now - txDate <= 7 * oneDay;
      } else if (dateFilter === '30D') {
        matchesDate = now - txDate <= 30 * oneDay;
      }
    }

    return matchesType && matchesDate;
  });

  if (!stellarWallet) {
    if (embedded) {
      return (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 bg-tertiary rounded-full flex items-center justify-center mb-4 text-muted">
            <AlertCircle size={32} />
          </div>
          <h3 className="text-lg font-bold text-primary mb-2">Wallet Not Connected</h3>
          <p className="text-muted text-sm max-w-xs">
            Please connect your Stellar wallet to view your transaction history.
          </p>
        </div>
      );
    }
    return (
      <div className="bg-secondary rounded-xl border border-border/50 p-6 h-full flex flex-col items-center justify-center text-center">
        <div className="w-16 h-16 rounded-full bg-warning/10 flex items-center justify-center mb-4">
          <AlertCircle className="w-8 h-8 text-warning" />
        </div>
        <h4 className="heading-4 mb-2">Connect Wallet</h4>
        <p className="text-muted max-w-xs mx-auto">
          Please connect your Stellar wallet to view your transaction history.
        </p>
      </div>
    );
  }

  const getIcon = (type: TransactionType) => {
    switch (type) {
      case 'SEND':
        return <ArrowUpRight className="w-4 h-4 text-warning" />;
      case 'RECEIVE':
        return <ArrowDownLeft className="w-4 h-4 text-success" />;
      case 'TRADE':
        return <ArrowLeftRight className="w-4 h-4 text-primary" />;
      case 'BRIDGE':
        return <Layers className="w-4 h-4 text-info" />;
      case 'TRUST':
        return <Shield className="w-4 h-4 text-purple-400" />;
      case 'CLAIMABLE':
        return <Gift className="w-4 h-4 text-pink-400" />;
      default:
        return <FileQuestion className="w-4 h-4 text-muted" />;
    }
  };

  const getLabel = (tx: UnifiedTransaction) => {
    switch (tx.type) {
      case 'SEND':
        return 'Send';
      case 'RECEIVE':
        return 'Receive';
      case 'TRADE':
        return tx.path ? 'Swap' : 'Order Book';
      case 'BRIDGE':
        return 'Contract Interaction';
      case 'TRUST':
        return 'Trustline';
      case 'CLAIMABLE':
        return 'Claimable Balance';
      default:
        return 'Transaction';
    }
  };

  const getDescription = (tx: UnifiedTransaction) => {
    if (tx.details) return tx.details;

    if (tx.type === 'SEND') {
      return `To: ${tx.to?.substring(0, 4)}...${tx.to?.substring(52)}`;
    }
    if (tx.type === 'RECEIVE') {
      return `From: ${tx.from?.substring(0, 4)}...${tx.from?.substring(52)}`;
    }
    if (tx.type === 'TRADE') {
      if (tx.path) {
        return `${tx.fromAsset} -> ${tx.toAsset}`;
      }
      return `Sell ${tx.sellAsset} for ${tx.buyAsset}`;
    }
    return tx.type;
  };

  const getAmountString = (tx: UnifiedTransaction) => {
    if (tx.type === 'SEND') return `-${parseFloat(tx.amount || '0').toFixed(4)} ${tx.assetCode}`;
    if (tx.type === 'RECEIVE') return `+${parseFloat(tx.amount || '0').toFixed(4)} ${tx.assetCode}`;
    if (tx.type === 'TRADE') {
      if (tx.path) {
        return `+${parseFloat(tx.toAmount || '0').toFixed(4)} ${tx.toAsset}`;
      }
      return `${parseFloat(tx.price || '0').toFixed(7)} Price`;
    }

    if (tx.type === 'BRIDGE') {
      if (tx.amount && tx.amount !== 'N/A') {
        return `${parseFloat(tx.amount).toFixed(4)} ${tx.assetCode !== 'N/A' ? tx.assetCode : ''}`.trim();
      }
      return tx.details || 'Contract Call';
    }

    if (tx.type === 'TRUST') {
      if (tx.limit && parseFloat(tx.limit) > 0) return `Limit: ${tx.assetCode}`;
      return `Remove: ${tx.assetCode}`;
    }
    if (tx.type === 'CLAIMABLE') {
      if (tx.amount) return `+${parseFloat(tx.amount).toFixed(4)} ${tx.assetCode}`;
      return 'Claimed';
    }

    return '-';
  };

  const getAmountColorClass = (type: TransactionType) => {
    switch (type) {
      case 'SEND':
        return 'text-warning';
      case 'RECEIVE':
      case 'CLAIMABLE':
        return 'text-success';
      case 'TRUST':
        return 'text-purple-400';
      case 'BRIDGE':
        return 'text-info';
      case 'TRADE':
        return 'text-primary';
      default:
        return 'text-text-primary';
    }
  };

  const chainId = network === 'mainnet' ? 'pubnet' : 'testnet';
  const getExplorerUrl = (hash: string) =>
    getRegistryExplorerUrl(chainId, 'tx', hash);

  const filterOptions: { label: string; value: TransactionType | 'ALL' }[] = [
    { label: 'All', value: 'ALL' },
    { label: 'Send', value: 'SEND' },
    { label: 'Receive', value: 'RECEIVE' },
    { label: 'Trade', value: 'TRADE' },
    { label: 'Trustline', value: 'TRUST' },
    { label: 'Claimable', value: 'CLAIMABLE' },
    { label: 'Bridge', value: 'BRIDGE' },
  ];

  const Content = (
    <div className="flex flex-col h-full">
      {!embedded && (
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 shrink-0">
          <div>
            <h2 className="heading-4">All Transactions</h2>
            <p className="text-muted text-sm mt-1">History of your account activity</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex bg-white/5 rounded-lg border border-white/5 p-1">
              {['ALL', '7D', '30D'].map(d => (
                <button
                  key={d}
                  onClick={() => setDateFilter(d as any)}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${dateFilter === d
                    ? 'bg-primary/20 text-primary'
                    : 'text-muted hover:text-text-primary'
                    }`}
                >
                  {d === 'ALL' ? 'All Time' : d}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className={`flex flex-wrap gap-2 ${embedded ? 'mb-4' : 'mb-6'} shrink-0`}>
        {filterOptions.map(option => (
          <button
            key={option.value}
            onClick={() => setFilterType(option.value)}
            className={`px-3 py-1.5 text-xs font-medium rounded-sm  transition-all duration-200  ${filterType === option.value
              ? 'bg-primary text-text-inverse '
              : 'bg-white/5 text-muted border-white/5 hover:bg-white/10 hover:text-text-primary'
              }`}
          >
            {option.label}
          </button>
        ))}
      </div>
      {error && (
        <div className="mb-6 p-4 rounded-xl bg-danger/10 border border-danger/20 flex items-start gap-3 shrink-0">
          <AlertCircle className="w-5 h-5 text-danger shrink-0 mt-0.5" />
          <p className="text-sm text-danger">{error}</p>
        </div>
      )}
      <div
        className={`${!embedded ? 'bg-muted/10 rounded-xl border border-white/5' : ''} flex-1 overflow-hidden flex flex-col min-h-0`}
      >
        <div className="hidden md:block overflow-y-auto flex-1">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-primary">
              <tr className="border-b border-white/5">
                <th className="px-6 py-4 text-xs font-semibold text-muted uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-4 text-xs font-semibold text-muted uppercase tracking-wider">
                  Description
                </th>
                <th className="px-6 py-4 text-xs font-semibold text-muted uppercase tracking-wider">
                  Amount / Details
                </th>
                <th className="px-6 py-4 text-xs font-semibold text-muted uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-4 text-xs font-semibold text-muted uppercase tracking-wider text-right">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredTransactions.length === 0 && !isLoading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-muted">
                    <Search className="w-10 h-10 mx-auto mb-3 opacity-50" />
                    <p>No transactions found for this category.</p>
                  </td>
                </tr>
              ) : (
                filteredTransactions.map(tx => (
                  <tr key={tx.id} className="hover:bg-white/5 transition-colors group">
                    <td className="lg:px-6 px-2 py-4">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-9 h-9 rounded-full flex items-center justify-center border shrink-0 ${tx.type === 'SEND'
                            ? 'bg-warning/10 border-warning/20'
                            : tx.type === 'RECEIVE'
                              ? 'bg-success/10 border-success/20'
                              : tx.type === 'TRUST'
                                ? 'bg-purple-400/10 border-purple-400/20'
                                : tx.type === 'CLAIMABLE'
                                  ? 'bg-pink-400/10 border-pink-400/20'
                                  : tx.type === 'BRIDGE'
                                    ? 'bg-info/10 border-info/20'
                                    : 'bg-primary/10 border-primary/20'
                            }`}
                        >
                          {getIcon(tx.type)}
                        </div>
                        <span className="text-sm font-medium text-text-primary">
                          {getLabel(tx)}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-muted">{getDescription(tx)}</td>
                    <td className="px-6 py-4">
                      <span className={`text-sm font-medium ${getAmountColorClass(tx.type)}`}>
                        {getAmountString(tx)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-muted">
                      <div className="flex flex-col">
                        <span>{new Date(tx.date).toLocaleDateString()}</span>
                        <span className="text-xs opacity-70">
                          {new Date(tx.date).toLocaleTimeString()}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <a
                        href={getExplorerUrl(tx.hash)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs text-primary opacity-0 group-hover:opacity-100 transition-all transform translate-x-1 group-hover:translate-x-0"
                      >
                        <span className="hidden sm:inline">View</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </td>
                  </tr>
                ))
              )}
              {hasMore && (
                <tr>
                  <td colSpan={5} className="p-0">
                    <div
                      className="p-4 text-center bg-white/5 hover:bg-white/10 transition-colors cursor-pointer border-t border-white/5"
                      onClick={!isLoading ? loadMore : undefined}
                    >
                      <button disabled={isLoading} className="text-primary text-sm font-medium">
                        {isLoading ? 'Loading...' : 'Load More History'}
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="md:hidden overflow-y-auto flex-1  space-y-2">
          {filteredTransactions.length === 0 && !isLoading ? (
            <div className="text-center py-12 text-muted">
              <Search className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p>No transactions found.</p>
            </div>
          ) : (
            filteredTransactions.map(tx => (
              <div
                key={tx.id}
                className="bg-primary rounded-xl lg:p-4 p-3 border border-white/5 flex items-center justify-between group"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`lg:w-12 lg:h-12 w-8 h-8 rounded-full flex items-center justify-center border shrink-0 ${tx.type === 'SEND'
                      ? 'bg-warning/10 border-warning/20'
                      : tx.type === 'RECEIVE'
                        ? 'bg-success/10 border-success/20'
                        : tx.type === 'TRUST'
                          ? 'bg-purple-400/10 border-purple-400/20'
                          : tx.type === 'CLAIMABLE'
                            ? 'bg-pink-400/10 border-pink-400/20'
                            : tx.type === 'BRIDGE'
                              ? 'bg-info/10 border-info/20'
                              : 'bg-primary/10 border-primary/20'
                      }`}
                  >
                    {getIcon(tx.type)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-text-primary">
                        {getLabel(tx)}
                      </span>
                      <span className="text-[10px] text-muted">
                        {new Date(tx.date).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="text-xs text-muted mt-0.5">{getDescription(tx)}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className={`text-sm font-medium ${getAmountColorClass(tx.type)}`}>
                    {getAmountString(tx)}
                  </div>
                  <a
                    href={getExplorerUrl(tx.hash)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[10px] text-primary mt-1 opacity-70 group-hover:opacity-100"
                  >
                    View <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </div>
              </div>
            ))
          )}
          {hasMore && (
            <div
              className="p-4 rounded-xl border border-white/5 text-center bg-primary hover:bg-white/10 transition-colors cursor-pointer"
              onClick={!isLoading ? loadMore : undefined}
            >
              <button disabled={isLoading} className="text-primary text-sm font-medium">
                {isLoading ? 'Loading...' : 'Load More History'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  if (embedded) {
    return Content;
  }

  return (
    <div className="bg-secondary min-h-screen p-4 sm:p-6 rounded-2xl border border-white/5">
      {Content}
    </div>
  );
};

export default AllTransactionsUI;
