import { AlertCircle, CheckCircle, Gift, Loader2, X, PartyPopper, ShoppingBag } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { WalletType } from '../../../walletconnect/constants/Wallet';
import { useWalletConnect } from '../../../walletconnect/hooks/useWalletConnect';
import { TradeTransactionService } from '../../service/tradeTransactionService';

interface ClaimableBalanceModalProps {
  onClose: () => void;
}

const ClaimableBalanceModal = ({ onClose }: ClaimableBalanceModalProps) => {
  const { connectedWallets, getProvider } = useWalletConnect();
  const stellarWallet = connectedWallets[WalletType.STELLAR];
  const [balances, setBalances] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [claimSuccess, setClaimSuccess] = useState(false);
  const [lastHash, setLastHash] = useState<string | null>(null);
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
      setLastHash(null);

      const transaction = await service.buildClaimBalanceTransaction(
        stellarWallet.address,
        balance.id
      );

      const hash = await service.executeClaimBalanceWithWalletConnect(transaction, provider);
      setLastHash(hash);
      
      setBalances(prev => {
        const next = prev.filter(b => b.id !== balance.id);
        if (next.length === 0) {
          setClaimSuccess(true);
        }
        return next;
      });

    } catch (err) {
      console.error(err);
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="bg-secondary rounded-3xl border border-white/10 w-full max-w-md shadow-2xl overflow-hidden transform transition-all scale-100 flex flex-col min-h-[450px] max-h-[80svh]">
        <div className="p-6 border-b border-white/5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-pink-500/10 flex items-center justify-center border border-pink-500/20">
              <Gift className="w-5 h-5 text-pink-500" />
            </div>
            <div>
              <h3 className="text-lg font-black tracking-tight">Reward Claims</h3>
              <p className="text-[10px] font-bold text-muted uppercase tracking-widest">Stellar Network</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 transition-all text-muted"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 flex flex-col">
          {isLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center space-y-4">
              <Loader2 className="w-8 h-8 text-pink-500 animate-spin" />
              <p className="text-xs font-bold text-muted uppercase tracking-widest">Searching for rewards...</p>
            </div>
          ) : (claimSuccess || (lastHash && balances.length > 0)) ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-6 space-y-6 animate-in fade-in zoom-in duration-500">
              <div className="relative">
                <div className="w-24 h-24 rounded-full bg-green-500/10 flex items-center justify-center border border-green-500/20">
                  <PartyPopper className="w-12 h-12 text-green-500" />
                </div>
                <div className="absolute -top-1 -right-1 w-8 h-8 rounded-full bg-green-500 flex items-center justify-center border-4 border-secondary">
                  <CheckCircle className="w-4 h-4 text-white" />
                </div>
              </div>
              
              <div className="space-y-2">
                <h4 className="text-2xl font-black text-white">Claim Successful!</h4>
                <p className="text-sm text-muted max-w-[240px] mx-auto">
                  Your reward has been successfully claimed and added to your wallet.
                </p>
              </div>

              {lastHash && (
                <div className="w-full bg-white/5 rounded-2xl p-4 border border-white/5 space-y-2">
                  <p className="text-[10px] font-bold text-muted uppercase tracking-widest text-left">Transaction Hash</p>
                  <div className="flex items-center justify-between gap-2">
                    <code className="text-[10px] font-mono text-green-400 truncate flex-1">{lastHash}</code>
                    <button 
                      onClick={() => window.open(`https://stellar.expert/explorer/public/tx/${lastHash}`, '_blank')}
                      className="text-[10px] font-bold text-pink-500 hover:text-pink-400 transition-colors shrink-0"
                    >
                      VIEW
                    </button>
                  </div>
                </div>
              )}

              <div className="flex gap-3 w-full pt-4">
                <button 
                   onClick={() => {
                     setClaimSuccess(false);
                     setLastHash(null);
                   }}
                   className="flex-1 h-12 rounded-xl bg-white/5 hover:bg-white/10 text-primary font-black uppercase tracking-widest text-xs border border-white/10 transition-all"
                >
                  {balances.length > 0 ? 'Claim More' : 'Close'}
                </button>
                <button 
                  onClick={onClose} 
                  className="flex-1 h-12 rounded-xl bg-pink-500 hover:bg-pink-600 text-white font-black uppercase tracking-widest text-xs shadow-lg shadow-pink-500/20 transition-all"
                >
                  Done
                </button>
              </div>
            </div>
          ) : balances.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center space-y-6 animate-in fade-in zoom-in duration-500">
              <div className="w-24 h-24 rounded-full bg-white/5 flex items-center justify-center border border-white/10">
                <span className="text-5xl">😔</span>
              </div>
              <div className="space-y-2">
                <h4 className="text-xl font-black">No Rewards Found</h4>
                <p className="text-sm text-muted max-w-[240px] mx-auto">You don't have any pending claimable balances at the moment.</p>
              </div>
              <button onClick={onClose} className="btn bg-white/5 hover:bg-white/10 text-primary px-8 border border-white/10">Back to Trade</button>
            </div>
          ) : (
            <div className="space-y-3">
              {balances.map(balance => {
                const assetCode = balance.asset.includes(':') ? balance.asset.split(':')[0] : 'XLM';
                const amount = parseFloat(balance.amount).toFixed(4);

                return (
                  <div
                    key={balance.id}
                    className="bg-white/5 rounded-2xl p-5 border border-white/5 flex items-center justify-between group hover:border-pink-500/30 transition-all hover:bg-white/[0.07]"
                  >
                    <div className="flex items-center gap-4">
                       <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                          <ShoppingBag className="w-5 h-5 text-primary" />
                       </div>
                       <div className="flex flex-col">
                        <span className="text-base font-black">
                          {amount} <span className="text-pink-500">{assetCode}</span>
                        </span>
                        <span className="text-[9px] font-bold text-muted uppercase tracking-tighter">
                          Sponsored by {balance.sponsor?.substring(0, 4)}...{balance.sponsor?.substring(balance.sponsor.length - 4)}
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={() => handleClaim(balance)}
                      disabled={!!processingId}
                      className={`h-10 px-6 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${
                        processingId === balance.id
                          ? 'bg-white/10 text-muted cursor-wait'
                          : 'bg-pink-500 text-white hover:bg-pink-600 shadow-lg shadow-pink-500/20'
                      }`}
                    >
                      {processingId === balance.id ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Processing
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

        {!isLoading && balances.length > 0 && (
          <div className="p-6 bg-white/[0.02] border-t border-white/5 shrink-0">
            <div className="flex items-start gap-3 p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl">
              <AlertCircle className="w-4 h-4 text-blue-500 shrink-0" />
              <p className="text-[10px] font-bold text-blue-200/70 leading-relaxed uppercase tracking-wider">
                Note: A small network fee in XLM is required for each claim operation.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ClaimableBalanceModal;
