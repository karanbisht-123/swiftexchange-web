import { memo } from 'react';

interface HistoryLoadingOverlayProps {
  isFetchingMore: boolean;
}

export const HistoryLoadingOverlay = memo(function HistoryLoadingOverlay({
  isFetchingMore,
}: HistoryLoadingOverlayProps) {
  if (!isFetchingMore) return null;
  return (
    <div className="absolute inset-0 z-20 bg-black/20 pointer-events-none transition-all duration-300 animate-pulse" />
  );
});

interface MarketTransitionOverlayProps {
  isLoading: boolean;
  market: string;
}

export const MarketTransitionOverlay = memo(function MarketTransitionOverlay({
  isLoading,
  market,
}: MarketTransitionOverlayProps) {
  if (!isLoading) return null;
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-secondary/80 backdrop-blur-md transition-all duration-300">
      <div className="text-center">
        <div className="relative w-16 h-16 mx-auto mb-6">
          <div className="absolute inset-0 border-4 border-brand/10 rounded-full" />
          <div className="absolute inset-0 border-4 border-t-brand rounded-full animate-spin" />
          <div className="absolute inset-2 border-2 border-brand/5 rounded-full" />
          <div className="absolute inset-2 border-2 border-b-brand/40 rounded-full animate-spin-reverse" />
        </div>
        <div className="space-y-1">
          <h3 className="text-lg font-bold text-white tracking-tight">Loading Chart</h3>
          <p className="text-gray-400 text-xs font-medium uppercase tracking-widest">{market}</p>
        </div>
      </div>
    </div>
  );
});

interface WatermarkProps {
  market: string;
  isMobile: boolean;
  isDark: boolean;
}

export const Watermark = memo(function Watermark({ market, isMobile, isDark }: WatermarkProps) {
  return (
    <div className="absolute inset-0 z-0 flex items-center justify-center pointer-events-none overflow-hidden">
      <span
        className={`font-black tracking-tight ${
          isMobile ? 'text-5xl' : 'text-8xl'
        } ${isDark ? 'text-white/[0.03]' : 'text-black/[0.03]'}`}
      >
        {market}
      </span>
    </div>
  );
});
