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

const formatTokenAmount = (raw: string, decimals: number) => {
  const value = Number(raw) / Math.pow(10, decimals);
  if (value >= 1_000_000) return (value / 1_000_000).toFixed(2) + 'M';
  if (value >= 1_000) return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 });
};

const formatSellAmount = (raw: string, decimals: number) => {
  const value = Number(raw) / Math.pow(10, decimals);
  if (value >= 1_000_000) return (value / 1_000_000).toFixed(2) + 'M';
  if (value >= 1_000) return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
};

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
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);

  useEffect(() => {
    requestAnimationFrame(() => setIsVisible(true));
  }, []);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
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
  const buyDecimals = buyAsset?.decimals || 6;
  const sellDecimals = sellAsset?.decimals || 6;

  const sellAmount = formatSellAmount(quote?.fromTokenAmount || '0', sellDecimals);
  const receiveAmount = formatTokenAmount(presetData.auctionStartAmount, buyDecimals);
  const minReceiveAmount = formatTokenAmount(presetData.auctionEndAmount, buyDecimals);
  const tokenFee = formatTokenAmount(presetData.tokenFee, buyDecimals);
  const totalTime = presetData.startAuctionIn + presetData.auctionDuration;

  const detailRows = [
    {
      label: 'Network fee',
      value: (
        <span className="flex items-center gap-1.5 text-green-400 font-bold text-sm">
          <ShieldCheck size={13} className="text-green-400" />
          Gas Less
        </span>
      ),
    },
    {
      label: 'Protocol fee',
      value: `${tokenFee} ${buyAsset?.symbol}`,
    },
    {
      label: 'Min received',
      icon: <TrendingDown size={12} className="text-muted" />,
      value: `${minReceiveAmount} ${buyAsset?.symbol}`,
    },
    {
      label: 'Price impact',
      value: (
        <span className={`font-bold text-sm ${quote.priceImpactPercent > 2 ? 'text-orange-400' : 'text-primary'}`}>
          {quote.priceImpactPercent.toFixed(2)}%
        </span>
      ),
    },
    {
      label: 'Fill window',
      icon: <Clock size={12} className="text-muted" />,
      value: `~${formatDuration(totalTime)}`,
    },
    {
      label: 'Fill type',
      icon: <Layers size={12} className="text-muted" />,
      value: presetData.allowMultipleFills ? 'Multi-fill' : presetData.allowPartialFills ? 'Partial' : 'Single fill',
    },
  ];

  const mobileStyle: React.CSSProperties = {
    left: 0,
    right: 0,
    bottom: 0,
    transform: isVisible ? 'translateY(0)' : 'translateY(100%)',
  };

  const desktopStyle: React.CSSProperties = {
    left: '50%',
    top: '50%',
    width: '440px',
    opacity: isVisible ? 1 : 0,
    transform: isVisible ? 'translate(-50%, -50%) scale(1)' : 'translate(-50%, -50%) scale(0.96)',
  };

  return (
    <>
      <div
        className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm transition-opacity duration-300"
        style={{ opacity: isVisible ? 1 : 0 }}
        onClick={txHash ? undefined : handleClose}
      />

      <div
        className="fixed z-[101] transition-all duration-300 ease-out"
        style={isMobile ? mobileStyle : desktopStyle}
      >
        <div className="bg-secondary rounded-t-3xl md:rounded-3xl border-t border-x md:border border-color flex flex-col max-h-[92dvh] md:max-h-[80vh] overflow-hidden">
          <div className="flex justify-center pt-3 pb-1 md:hidden">
            <div className="w-10 h-1 rounded-full bg-muted/30" />
          </div>

          <div className="flex items-center justify-between px-5 pt-4 pb-3 flex-shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-brand/10 flex items-center justify-center">
                <Zap size={16} className="text-brand" />
              </div>
              <span className="text-base font-bold text-primary tracking-tight">Swap Execution</span>
            </div>
            {!txHash && (
              <button
                onClick={handleClose}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-tertiary text-muted hover:text-primary hover:bg-hover transition-all"
              >
                <X size={15} />
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-5 space-y-4">
            {txHash ? (
              <div className="py-10 flex flex-col items-center text-center space-y-5 animate-in fade-in zoom-in duration-500">
                <div className="w-20 h-20 rounded-full bg-green-500/10 flex items-center justify-center">
                  <CheckCircle2 size={44} className="text-green-400" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-primary mb-1.5 uppercase tracking-tight">Order Placed</h3>
                  <p className="text-sm text-muted leading-relaxed px-6">Your gasless swap order has been submitted to the network.</p>
                </div>
                <div
                  className="w-full bg-tertiary rounded-2xl p-4 border border-color flex items-center justify-between group cursor-pointer hover:bg-hover transition-colors"
                  onClick={() => window.open(`https://etherscan.io/tx/${txHash}`, '_blank')}
                >
                  <div className="flex flex-col items-start min-w-0">
                    <span className="text-[10px] font-black text-muted uppercase tracking-widest mb-1">Order Hash</span>
                    <span className="text-xs font-mono text-primary truncate w-52">{txHash}</span>
                  </div>
                  <ExternalLink size={15} className="text-muted group-hover:text-brand transition-colors flex-shrink-0" />
                </div>
              </div>
            ) : (
              <>
                <div className="space-y-1">
                  <div className="flex items-center justify-between bg-tertiary rounded-2xl px-4 py-4 border border-color">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-muted mb-1 font-medium">You pay</p>
                      <p className="text-2xl font-black text-primary leading-none tracking-tight">{sellAmount}</p>
                      <p className="text-sm text-muted font-semibold mt-1">{sellAsset?.symbol}</p>
                    </div>
                    <img src={sellAsset?.logoURI} className="w-12 h-12 rounded-full border border-color shadow-sm flex-shrink-0 ml-3" alt="" />
                  </div>

                  <div className="flex justify-center py-1">
                    <div className="w-8 h-8 rounded-full bg-tertiary border border-color flex items-center justify-center shadow-sm">
                      <ArrowDown size={14} className="text-muted" />
                    </div>
                  </div>

                  <div className="flex items-center justify-between bg-brand/5 rounded-2xl px-4 py-4 border border-brand/20">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-brand/60 mb-1 font-medium">You receive</p>
                      <p className="text-2xl font-black text-brand leading-none tracking-tight">{receiveAmount}</p>
                      <p className="text-sm text-brand/60 font-semibold mt-1">{buyAsset?.symbol}</p>
                    </div>
                    <img src={buyAsset?.logoURI} className="w-12 h-12 rounded-full border border-color shadow-sm flex-shrink-0 ml-3" alt="" />
                  </div>
                </div>

                <div className="rounded-2xl border border-color overflow-hidden">
                  {detailRows.map((row, i) => (
                    <div
                      key={i}
                      className={`flex items-center justify-between px-4 py-3 bg-tertiary/20 hover:bg-tertiary/40 transition-colors ${i !== detailRows.length - 1 ? 'border-b border-color' : ''}`}
                    >
                      <div className="flex items-center gap-2">
                        {row.icon && <span className="opacity-60">{row.icon}</span>}
                        <span className="text-sm text-muted">{row.label}</span>
                      </div>
                      {typeof row.value === 'string' ? (
                        <span className="text-sm font-semibold text-primary">{row.value}</span>
                      ) : (
                        row.value
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}

            {error && !txHash && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 flex items-start gap-3 animate-in slide-in-from-top-2 duration-300">
                <AlertCircle size={17} className="text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs font-semibold text-red-400 leading-relaxed">{error}</p>
              </div>
            )}

            <div className="pt-1 space-y-2">
              {txHash ? (
                <button
                  onClick={handleClose}
                  className="w-full py-4 bg-primary text-secondary font-black uppercase tracking-[0.15em] rounded-2xl active:scale-[0.98] transition-all"
                >
                  Done
                </button>
              ) : (
                <>
                  <TransactionButton
                    label="CONFIRM & SIGN ORDER"
                    loadingLabel="PREPARING ORDER..."
                    isLoading={loading}
                    onClick={() => onConfirm(preset)}
                  />
                  {!loading && (
                    <button
                      onClick={handleClose}
                      className="w-full py-3 text-xs font-bold text-muted uppercase tracking-widest hover:text-primary transition-colors"
                    >
                      Cancel
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default FusionQuoteScreen;