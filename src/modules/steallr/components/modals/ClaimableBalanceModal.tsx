import { AlertCircle, CheckCircle, Gift, Loader2, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { TradeTransactionService } from '../../service/tradeTransactionService';

import { WalletType } from '../../../walletconnect/constants/Wallet';
import { useWalletConnect } from '../../../walletconnect/hooks/useWalletConnect';

interface ClaimableBalanceModalProps {
    onClose: () => void;
}

const ClaimableBalanceModal = ({ onClose }: ClaimableBalanceModalProps) => {
    const { connectedWallets, getProvider } = useWalletConnect();
    const stellarWallet = connectedWallets[WalletType.STELLAR];
    const [balances, setBalances] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [processingId, setProcessingId] = useState<string | null>(null);
    const [service] = useState(() => new TradeTransactionService());

    const fetchBalances = useCallback(async () => {
        if (!stellarWallet?.address) return;
        try {
            setIsLoading(true);
            const records = await service.getClaimableBalances(stellarWallet.address);
            setBalances(records);
        } catch (err) {
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    }, [stellarWallet?.address, service]);

    useEffect(() => {
        fetchBalances();
    }, [fetchBalances]);

    const handleClaim = async (balance: any) => {
        const provider = getProvider(WalletType.STELLAR);
        if (!stellarWallet?.address || !provider) return;

        try {
            setProcessingId(balance.id);

            const transaction = await service.buildClaimBalanceTransaction(
                stellarWallet.address,
                balance.id
            );

            await service.executeClaimBalanceWithWalletConnect(
                transaction,
                provider
            );

            setBalances(prev => prev.filter(b => b.id !== balance.id));

            // If no more balances, close modal after short delay
            if (balances.length <= 1) {
                setTimeout(onClose, 1500);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setProcessingId(null);
        }
    };

    if (isLoading || balances.length === 0) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
            <div className="bg-secondary rounded-2xl border border-white/10 w-full max-w-md shadow-2xl overflow-hidden transform transition-all scale-100">
                <div className="p-6 border-b border-white/5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-pink-500/10 flex items-center justify-center">
                            <Gift className="w-5 h-5 text-pink-500" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold ">Claimable Balances</h3>
                            <p className="text-xs text-muted">You have pending payments to claim</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1 rounded-full hover:bg-white/5 transition-colors text-muted "
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-2 max-h-[60vh] overflow-y-auto">
                    {balances.length === 0 ? (
                        <div className="p-4 text-center text-muted text-sm">
                            No claimable balances found.
                        </div>
                    ) : (
                        <div className="space-y-2 p-2">
                            {balances.map((balance) => {
                                const assetCode = balance.asset.includes(':') ? balance.asset.split(':')[0] : 'XLM';
                                const amount = parseFloat(balance.amount).toFixed(4);

                                return (
                                    <div key={balance.id} className="bg-white/5 rounded-xl p-4 border border-white/5 flex items-center justify-between group hover:border-pink-500/30 transition-all">
                                        <div className="flex flex-col">
                                            <span className="text-sm font-bold">{amount} {assetCode}</span>
                                            <span className="text-[10px] text-muted truncate max-w-[150px]">From: {balance.sponsor?.substring(0, 8)}...</span>
                                        </div>

                                        <button
                                            onClick={() => handleClaim(balance)}
                                            disabled={!!processingId}
                                            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${processingId === balance.id
                                                ? 'bg-whi cursor-wait'
                                                : 'bg-pr hover:bg-primary-hover shadow-lg shadow-primary/20'
                                                }`}
                                        >
                                            {processingId === balance.id ? (
                                                <>
                                                    <Loader2 className="w-3 h-3 animate-spin" />
                                                    Signing...
                                                </>
                                            ) : (
                                                <>
                                                    Claim
                                                    <CheckCircle className="w-3 h-3" />
                                                </>
                                            )}
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {balances.length > 0 && (
                    <div className="p-4 bg-white/5 border-t border-white/5 text-center">
                        <p className="text-[10px] text-muted">
                            <AlertCircle className="w-3 h-3 inline mr-1" />
                            Transactions require a small XLM fee to process.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ClaimableBalanceModal;
