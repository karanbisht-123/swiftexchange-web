import React, { useEffect, useState } from 'react';
import { useWalletStore } from '../../walletconnect/store/walletConnectStore';
import { getEvmTransactionHistory, type ChainType, type TransactionItem } from '../service/EvmTransactionService';
import { Loader2, ArrowUpRight, ArrowDownLeft, Clock, SearchX } from 'lucide-react';
import { WalletType } from '../../walletconnect/constants/Wallet';
import PageLayout from '../../../components/layout/PageLayout';
import TransactionDetailsSheet from './TransactionDetailsSheet';
import TransactionDetailsView from './TransactionDetailsView';

const EvmTransactionHistory: React.FC = () => {
    const connectedWallets = useWalletStore((state) => state.connectedWallets);
    const evmWallet = connectedWallets[WalletType.EVM];
    const walletAddress = evmWallet?.address;

    const [selectedChain, setSelectedChain] = useState<ChainType>('eth');
    const [historyData, setHistoryData] = useState<TransactionItem[]>([]);
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedTx, setSelectedTx] = useState<TransactionItem | null>(null);
    const [isSheetOpen, setIsSheetOpen] = useState(false);

    useEffect(() => {
        if (walletAddress) {
            fetchHistory();
        }
    }, [walletAddress, selectedChain]);

    const fetchHistory = async () => {
        if (!walletAddress) return;

        setLoading(true);
        setError(null);
        setSelectedTx(null); // Clear selection on refresh/chain change
        try {
            const data = await getEvmTransactionHistory(walletAddress, selectedChain);
            const dataArray = Array.isArray(data) ? data : [];
            setHistoryData(dataArray);

            // Auto-select first transaction on desktop if data exists
            if (dataArray.length > 0 && window.innerWidth >= 1024) {
                // Optional: could auto-select, but let's leave it clean for now 
                // setSelectedTx(dataArray[0]);
            }

        } catch (err: any) {
            console.error('Failed to fetch transaction history:', err);
            setError(err.message || 'Failed to fetch transaction history');
        } finally {
            setLoading(false);
        }
    };

    const isIncoming = (tx: TransactionItem) => {
        if (!walletAddress) return false;
        return tx.to.toLowerCase() === walletAddress.toLowerCase();
    };

    const handleTxClick = (tx: TransactionItem) => {
        setSelectedTx(tx);
        if (window.innerWidth < 1024) {
            setIsSheetOpen(true);
        }
    };

    const HeaderActions = (
        <div className="flex bg-tertiary rounded-lg p-1">
            <button
                onClick={() => setSelectedChain('eth')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${selectedChain === 'eth'
                    ? 'bg-primary text-secondary shadow-sm'
                    : 'text-muted hover:text-primary'
                    }`}
            >
                ETH
            </button>
            <button
                onClick={() => setSelectedChain('bsc')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${selectedChain === 'bsc'
                    ? 'bg-primary text-secondary shadow-sm'
                    : 'text-muted hover:text-primary'
                    }`}
            >
                BNB
            </button>
        </div>
    );

    if (!walletAddress) {
        return (
            <PageLayout title="Transactions" maxWidth="7xl">
                <div className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="w-16 h-16 bg-tertiary rounded-full flex items-center justify-center mb-4 text-muted">
                        <Clock size={32} />
                    </div>
                    <h3 className="text-lg font-bold text-primary mb-2">Wallet Not Connected</h3>
                    <p className="text-muted text-sm max-w-xs">Please connect your EVM wallet to view your transaction history.</p>
                </div>
            </PageLayout>
        );
    }

    return (
        <PageLayout
            title="Transactions"
            headerActions={HeaderActions}
            maxWidth="7xl"
        >
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full">

                {/* Transaction List Panel */}
                <div className="lg:col-span-7 xl:col-span-8 flex flex-col h-full overflow-hidden">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-20">
                            <Loader2 className="w-8 h-8 animate-spin text-brand-primary mb-4" />
                            <p className="text-sm text-muted animate-pulse">Loading history...</p>
                        </div>
                    ) : error ? (
                        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex flex-col items-center text-center">
                            <p className="text-red-500 font-medium mb-1">Unable to load transactions</p>
                            <p className="text-xs text-red-500/80 mb-3">{error}</p>
                            <button onClick={fetchHistory} className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg text-xs font-bold transition-colors">
                                Try Again
                            </button>
                        </div>
                    ) : historyData.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-center">
                            <div className="w-16 h-16 bg-tertiary rounded-full flex items-center justify-center mb-4 text-muted">
                                <SearchX size={32} />
                            </div>
                            <h3 className="text-lg font-bold text-primary mb-2">No Transactions Found</h3>
                            <p className="text-muted text-sm max-w-xs">You haven't made any transactions on the {selectedChain.toUpperCase()} network yet.</p>
                        </div>
                    ) : (
                        <div className="space-y-3 overflow-y-auto pr-2 pb-20 lg:pb-0">
                            {historyData.map((tx) => {
                                const incoming = isIncoming(tx);
                                const isSelected = selectedTx?.uniqueId === tx.uniqueId;
                                return (
                                    <button
                                        key={tx.uniqueId}
                                        onClick={() => handleTxClick(tx)}
                                        className={`w-full p-4 rounded-2xl flex items-center justify-between transition-all group text-left border ${isSelected
                                            ? 'bg-secondary border-brand-primary/50 shadow-md ring-1 ring-brand-primary/20'
                                            : 'bg-secondary hover:bg-tertiary/50 border-transparent hover:border-color'
                                            }`}
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 border ${incoming
                                                ? 'bg-green-500/10 border-green-500/20 text-green-500'
                                                : 'bg-brand-primary/10 border-brand-primary/20 text-brand-primary'
                                                }`}>
                                                {incoming ? <ArrowDownLeft size={24} /> : <ArrowUpRight size={24} />}
                                            </div>
                                            <div>
                                                <div className="font-bold text-primary text-base flex items-center gap-2">
                                                    {incoming ? 'Received' : 'Sent'} {tx.asset}
                                                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-tertiary text-muted uppercase font-bold tracking-wider">{tx.category}</span>
                                                </div>
                                                <div className="text-xs text-muted font-mono mt-1 flex items-center gap-2">
                                                    <span className="opacity-75">{tx.blockNum ? `Block #${parseInt(tx.blockNum, 16)}` : 'Pending'}</span>
                                                    <span className="w-1 h-1 rounded-full bg-muted/40"></span>
                                                    <span className="truncate max-w-[100px]">{tx.hash.slice(0, 6)}...{tx.hash.slice(-4)}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className={`font-bold font-mono text-base ${incoming ? 'text-green-500' : 'text-primary'}`}>
                                                {incoming ? '+' : ''}{parseFloat(tx.formattedAmount).toFixed(6)}
                                            </div>
                                            <div className="text-xs text-muted mt-1 font-medium bg-tertiary/50 px-2 py-0.5 rounded ml-auto w-fit">
                                                {tx.asset}
                                            </div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Desktop Details Panel */}
                <div className="hidden lg:block lg:col-span-5 xl:col-span-4 h-full sticky top-0">
                    {selectedTx ? (
                        <div className="h-full animate-in fade-in slide-in-from-right-4 duration-300">
                            <TransactionDetailsView transaction={selectedTx} network={selectedChain === 'bsc' ? 'BNB' : 'ETH'} />
                        </div>
                    ) : (
                        <div className="h-full bg-secondary/30 border border-dashed border-color rounded-2xl flex flex-col items-center justify-center text-center p-8">
                            <div className="w-16 h-16 bg-tertiary rounded-full flex items-center justify-center mb-4 text-muted/50">
                                <SearchX size={32} />
                            </div>
                            <h3 className="text-lg font-bold text-muted mb-2">No Transaction Selected</h3>
                            <p className="text-sm text-muted/70">Select a transaction from the list on the left to view its full details here.</p>
                        </div>
                    )}
                </div>

            </div>

            {/* Mobile Details Sheet */}
            {selectedTx && (
                <TransactionDetailsSheet
                    transaction={selectedTx}
                    isOpen={isSheetOpen}
                    onClose={() => setIsSheetOpen(false)}
                    network={selectedChain === 'bsc' ? 'BNB' : 'ETH'}
                />
            )}
        </PageLayout>
    );
};

export default EvmTransactionHistory;
