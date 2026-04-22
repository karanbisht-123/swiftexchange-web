import React, { useState, useEffect } from 'react';
import { Zap, X, ArrowDown, ShieldCheck, Clock, TrendingDown, Layers, CheckCircle2, AlertCircle, ExternalLink } from 'lucide-react';
import type { FusionQuote } from '../../../../../types/evm/swap.types';
import TransactionButton from '../../../../commonfeature/components/TransactionButton';

interface FusionQuoteScreenProps {
  quote: FusionQuote;
  sellAsset: any;
  buyAsset: any;
  onConfirm: (preset: keyof FusionQuote['presets']) => void;
  onBack: () => void;
  loading?: boolean;
  error?: string | null;
  txHash?: string | null;
}


const formatTokenAmount = (raw: string, decimals: number) =>
  (Number(raw) / Math.pow(10, decimals)).toFixed(6);


const formatDuration = (seconds: number) =>
  seconds < 60 ? `${seconds}s` : `${Math.round(seconds / 60)}m`;

const FusionQuoteScreen: React.FC<FusionQuoteScreenProps> = ({
  quote,
  sellAsset,
  buyAsset,
  onConfirm,
  onBack,
  loading = false,
  error = null,
  txHash = null,
}) => {

  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setIsVisible(true));
  }, []);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(onBack, 320);
  };

  const preset = (quote.recommended_preset || 'fast') as keyof FusionQuote['presets'];
  const presetData = quote.presets[preset];
  const decimals = buyAsset?.decimals || 6;

  const receiveAmount = formatTokenAmount(presetData.auctionStartAmount, decimals);
  const minReceiveAmount = formatTokenAmount(presetData.auctionEndAmount, decimals);
  const tokenFee = formatTokenAmount(presetData.tokenFee, decimals);

  const totalTime = presetData.startAuctionIn + presetData.auctionDuration;

  return (
    <>
      <div
        className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm transition-opacity duration-300"
        style={{ opacity: isVisible ? 1 : 0 }}
        onClick={txHash ? undefined : handleClose}
      />
      <div
        className="fixed bottom-0 left-0 right-0 z-[101] transition-transform duration-300 ease-out"
        style={{ transform: isVisible ? 'translateY(0)' : 'translateY(100%)' }}
      >
        <div className="bg-secondary rounded-t-3xl border-t border-x border-color max-w-lg mx-auto overflow-hidden">
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 rounded-full bg-muted/30" />
          </div>
          <div className="flex items-center justify-between px-5 pt-3 pb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-brand/10 flex items-center justify-center">
                <Zap size={15} className="text-brand" />
              </div>
              <span className="text-base font-bold text-primary">Swap Execution</span>
            </div>
            {!txHash && (
              <button
                onClick={handleClose}
                className="w-7 h-7 flex items-center justify-center rounded-full bg-tertiary text-muted hover:text-primary transition-colors"
              >
                <X size={15} />
              </button>
            )}
          </div>

          <div className="px-5 pb-6 space-y-4">
            {txHash ? (
              <div className="py-8 flex flex-col items-center text-center space-y-4 animate-in fade-in zoom-in duration-500">
                <div className="w-20 h-20 rounded-full bg-green-500/10 flex items-center justify-center mb-2">
                  <CheckCircle2 size={48} className="text-green-500" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-primary mb-1 uppercase tracking-tight">Order Placed</h3>
                  <p className="text-sm text-muted font-medium px-8">Your gasless swap order has been successfully submitted to the network.</p>
                </div>
                <div className="w-full bg-tertiary rounded-2xl p-4 border border-color flex items-center justify-between group cursor-pointer hover:bg-hover transition-colors" onClick={() => window.open(`https://etherscan.io/tx/${txHash}`, '_blank')}>
                  <div className="flex flex-col items-start min-w-0">
                    <span className="text-[10px] font-black text-muted uppercase tracking-widest mb-1">Order Hash</span>
                    <span className="text-xs font-mono text-primary truncate w-48">{txHash}</span>
                  </div>
                  <ExternalLink size={16} className="text-muted group-hover:text-brand transition-colors" />
                </div>
              </div>
            ) : (
              <>
                <div className="space-y-1">
                  <div className="flex items-center justify-between bg-tertiary rounded-2xl px-4 py-3.5 border border-color">
                    <div>
                      <p className="text-xs text-muted mb-0.5">You pay</p>
                      <p className="text-xl font-black text-primary">{quote?.fromTokenAmount}</p>
                      <p className="text-sm text-muted font-medium">{sellAsset?.symbol}</p>
                    </div>
                    <img src={sellAsset?.logoURI} className="w-11 h-11 rounded-full border border-color shadow-sm" alt="" />
                  </div>
                  <div className="flex justify-center py-0.5">
                    <div className="w-7 h-7 rounded-full bg-tertiary border border-color flex items-center justify-center shadow-sm">
                      <ArrowDown size={14} className="text-muted" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between bg-brand/5 rounded-2xl px-4 py-3.5 border border-brand/15">
                    <div>
                      <p className="text-xs text-brand/70 mb-0.5">You receive</p>
                      <p className="text-xl font-black text-brand">{receiveAmount}</p>
                      <p className="text-sm text-brand/70 font-medium">{buyAsset?.symbol}</p>
                    </div>
                    <img src={buyAsset?.logoURI} className="w-11 h-11 rounded-full border border-color shadow-sm" alt="" />
                  </div>
                </div>
                <div className="mx-5 mb-5 rounded-2xl border border-color overflow-hidden bg-tertiary/30">
                  <div className="divide-y divide-color">
                    <div className="flex items-center justify-between px-4 py-3">
                      <span className="text-sm text-muted">Network fee</span>
                      <div className="flex items-center gap-1.5">
                        <ShieldCheck size={13} className="text-green-500" />
                        <span className="text-sm font-bold text-green-500">Gas Less</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between px-4 py-3">
                      <span className="text-sm text-muted">Protocol fee</span>
                      <span className="text-sm font-semibold text-primary">
                        {tokenFee} {buyAsset?.symbol}
                      </span>
                    </div>
                    <div className="flex items-center justify-between px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <TrendingDown size={13} className="text-muted" />
                        <span className="text-sm text-muted">Min received</span>
                      </div>
                      <span className="text-sm font-semibold text-primary">
                        {minReceiveAmount} {buyAsset?.symbol}
                      </span>
                    </div>
                    <div className="flex items-center justify-between px-4 py-3">
                      <span className="text-sm text-muted">Price impact</span>
                      <span className={`text-sm font-bold ${quote.priceImpactPercent > 2 ? 'text-orange-500' : 'text-primary'}`}>
                        {quote.priceImpactPercent.toFixed(2)}%
                      </span>
                    </div>
                    <div className="flex items-center justify-between px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <Clock size={13} className="text-muted" />
                        <span className="text-sm text-muted">Fill window</span>
                      </div>
                      <span className="text-sm font-semibold text-primary">
                        ~{formatDuration(totalTime)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <Layers size={13} className="text-muted" />
                        <span className="text-sm text-muted">Fill type</span>
                      </div>
                      <span className="text-sm font-semibold text-primary">
                        {presetData.allowMultipleFills ? 'Multi-fill' : presetData.allowPartialFills ? 'Partial' : 'Single fill'}
                      </span>
                    </div>
                  </div>
                </div>
              </>
            )}

            {error && !txHash && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 flex items-start gap-3 animate-in slide-in-from-top-2 duration-300">
                <AlertCircle size={18} className="text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs font-bold text-red-500 leading-relaxed">{error}</p>
              </div>
            )}

            <div className="pt-2">
                      {txHash ? (
                        <button
                          onClick={handleClose}
                          className="w-full py-4 bg-primary text-secondary font-black uppercase tracking-[0.2em] rounded-2xl shadow-xl active:scale-[0.98] transition-all"
                        >
                          Done
                        </button>
                      ) : (
                        <div className="space-y-3">
                          <TransactionButton
                            label="CONFIRM & SIGN ORDER"
                            loadingLabel="PREPARING ORDER..."
                            isLoading={loading}
                            onClick={() => onConfirm(preset)}
                            icon={<Zap size={18} className="fill-white" />}
                          />
                          {!loading && (
                            <button
                              onClick={handleClose}
                              className="w-full py-2.5 text-xs font-black text-muted uppercase tracking-widest hover:text-primary transition-colors"
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
          </>
          );
};

          export default FusionQuoteScreen;