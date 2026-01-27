import {
    AlertCircle,
    ArrowDownLeft,
    ArrowLeftRight,
    ArrowUpRight,
    ExternalLink,
    FileQuestion,
    Search,
} from 'lucide-react';
import { useState } from 'react';

import { WalletType } from '../../walletconnect/constants/Wallet';
import { useWalletConnect } from '../../walletconnect/hooks/useWalletConnect';
import { useAllTransactions } from '../hook/useAllTransactions';
import type { UnifiedTransaction } from '../types/allTransaction.types';

import { useWalletStore } from '../../walletconnect/store/walletConnectStore';

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

    const [filterType, setFilterType] = useState<
        'ALL' | 'SEND' | 'RECEIVE' | 'TRADE' | 'BRIDGE'
    >('ALL');

    const filteredTransactions = transactions.filter(tx => {
        if (filterType === 'ALL') return true;
        return tx.type === filterType;
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

    const getIcon = (type: string) => {
        switch (type) {
            case 'SEND':
                return <ArrowUpRight className="w-4 h-4 text-warning" />;
            case 'RECEIVE':
                return <ArrowDownLeft className="w-4 h-4 text-success" />;
            case 'TRADE':
                return <ArrowLeftRight className="w-4 h-4 text-primary" />;
            case 'BRIDGE':
                return <FileQuestion className="w-4 h-4 text-info" />;
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
                return (tx as any).path ? 'Swap' : 'Order Book';
            case 'BRIDGE':
                return 'Contract Interaction';
            default:
                return 'Transaction';
        }
    };

    const getDescription = (tx: UnifiedTransaction) => {
        if (tx.type === 'SEND') {
            return `To: ${(tx as any).to?.substring(0, 4)}...${(tx as any).to?.substring(52)}`;
        }
        if (tx.type === 'RECEIVE') {
            return `From: ${(tx as any).from?.substring(0, 4)}...${(tx as any).from?.substring(52)}`;
        }
        if (tx.type === 'TRADE') {
            if ((tx as any).path) {
                return `${(tx as any).fromAsset} -> ${(tx as any).toAsset}`;
            }
            return `Sell ${(tx as any).sellingAsset || (tx as any).sellAsset} for ${(tx as any).buyingAsset || (tx as any).buyAsset}`;
        }
        if (tx.type === 'BRIDGE') {
            return 'Contract Call';
        }
        return 'Operation';
    };

    const getAmountString = (tx: UnifiedTransaction) => {
        if (tx.type === 'SEND') return `-${parseFloat((tx as any).amount).toFixed(4)} ${(tx as any).assetCode}`;
        if (tx.type === 'RECEIVE') return `+${parseFloat((tx as any).amount).toFixed(4)} ${(tx as any).assetCode}`;
        if (tx.type === 'TRADE') {
            if ((tx as any).path) {
                return `+${parseFloat((tx as any).toAmount).toFixed(4)} ${(tx as any).toAsset}`;
            }
            return `${parseFloat((tx as any).price).toFixed(7)} Price`;
        }
        if (tx.type === 'BRIDGE') return '-';
        return '-';
    };

    const explorerNetwork = network === 'mainnet' ? 'public' : 'testnet';
    const getExplorerUrl = (hash: string) => `https://stellar.expert/explorer/${explorerNetwork}/tx/${hash}`;

    const Content = (
        <>
            {!embedded && (
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                    <div>
                        <h2 className="heading-4">All Transactions</h2>
                        <p className="text-muted text-sm mt-1">
                            History of your Sends, Receives, Trades, and Contract Interactions
                        </p>
                    </div>
                </div>
            )}

            <div className={`flex flex-wrap gap-2 ${embedded ? 'mb-4' : 'mb-8'}`}>
                {['ALL', 'SEND', 'RECEIVE', 'TRADE', 'BRIDGE'].map(type => (
                    <button
                        key={type}
                        onClick={() => setFilterType(type as any)}
                        className={`px-4 py-2 text-xs font-medium rounded-full transition-all duration-200 border ${filterType === type
                            ? 'bg-primary text-text-inverse border-primary shadow-lg'
                            : 'bg-white/5 text-muted border-white/5 hover:bg-white/10 hover:text-text-primary'
                            }`}
                    >
                        {type === 'ALL' ? 'All' : type === 'TRADE' ? 'Trade' : type.charAt(0) + type.slice(1).toLowerCase()}
                    </button>
                ))}
            </div>
            {error && (
                <div className="mb-6 p-4 rounded-xl bg-danger/10 border border-danger/20 flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-danger shrink-0 mt-0.5" />
                    <p className="text-sm text-danger">{error}</p>
                </div>
            )}
            <div className={`${!embedded ? 'bg-muted/10 rounded-xl border border-white/5' : ''} overflow-hidden`}>
                <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="border-b border-white/5 bg-white/5">
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
                                    <tr key={tx.id} className="hover:bg-white/5 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div
                                                    className={`w-8 h-8 rounded-full flex items-center justify-center border ${tx.type === 'SEND'
                                                        ? 'bg-warning/10 border-warning/20'
                                                        : tx.type === 'RECEIVE'
                                                            ? 'bg-success/10 border-success/20'
                                                            : tx.type === 'BRIDGE'
                                                                ? 'bg-info/10 border-info/20'
                                                                : 'bg-primary/10 border-primary/20'
                                                        }`}
                                                >
                                                    {getIcon(tx.type)}
                                                </div>
                                                <span className="text-sm font-medium text-text-primary capitalize">
                                                    {getLabel(tx)}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-muted">{getDescription(tx)}</td>
                                        <td className="px-6 py-4">
                                            <span
                                                className={`text-sm font-medium ${tx.type === 'SEND'
                                                    ? 'text-warning'
                                                    : tx.type === 'RECEIVE' || (tx.type === 'TRADE' && (tx as any).path)
                                                        ? 'text-success'
                                                        : 'text-text-primary'
                                                    }`}
                                            >
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
                                                className="inline-flex items-center gap-1.5 text-xs text-primary hover:text-primary-light transition-colors"
                                            >
                                                <span className="hidden sm:inline">View</span>
                                                <ExternalLink className="w-3.5 h-3.5" />
                                            </a>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
                <div className="md:hidden space-y-3 p-3">
                    {filteredTransactions.length === 0 && !isLoading ? (
                        <div className="text-center py-12 text-muted">
                            <Search className="w-10 h-10 mx-auto mb-3 opacity-50" />
                            <p>No transactions found.</p>
                        </div>
                    ) : (
                        filteredTransactions.map(tx => (
                            <div
                                key={tx.id}
                                className="bg-white/5 rounded-xl p-4 border border-white/5 flex items-center justify-between"
                            >
                                <div className="flex items-center gap-3">
                                    <div
                                        className={`w-10 h-10 rounded-full flex items-center justify-center border shrink-0 ${tx.type === 'SEND'
                                            ? 'bg-warning/10 border-warning/20'
                                            : tx.type === 'RECEIVE'
                                                ? 'bg-success/10 border-success/20'
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
                                            <span className="text-[10px] text-muted">{new Date(tx.date).toLocaleDateString()}</span>
                                        </div>
                                        <div className="text-xs text-muted mt-0.5">{getDescription(tx)}</div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div
                                        className={`text-sm font-medium ${tx.type === 'SEND'
                                            ? 'text-warning'
                                            : tx.type === 'RECEIVE'
                                                ? 'text-success'
                                                : 'text-text-primary'
                                            }`}
                                    >
                                        {getAmountString(tx)}
                                    </div>
                                    <a
                                        href={getExplorerUrl(tx.hash)}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex items-center gap-1 text-[10px] text-primary mt-1"
                                    >
                                        View <ExternalLink className="w-2.5 h-2.5" />
                                    </a>
                                </div>
                            </div>
                        ))
                    )}
                </div>
                {hasMore && (
                    <div className="p-4 border-t border-white/5 text-center">
                        <button
                            onClick={loadMore}
                            disabled={isLoading}
                            className="text-primary text-sm font-medium hover:text-primary-light transition-colors"
                        >
                            {isLoading ? 'Loading...' : 'Load More History'}
                        </button>
                    </div>
                )}
            </div>
        </>
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
