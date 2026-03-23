import { useCallback, useMemo } from 'react';

import { useTrades } from '../../hooks/useTrades';
import useMarketStore from '../../store/marketStore';

export default function TradesDisplay() {
  const { selectedMarket } = useMarketStore();
  const { trades, isLoading, isConnected } = useTrades(selectedMarket, 100);

  const maxTradeSize = useMemo(() => {
    if (!trades || trades.length === 0) return 1;
    return Math.max(...trades.map(t => parseFloat(t.size) || 0));
  }, [trades]);

  const formatPrice = useCallback((price: string) => {
    const num = parseFloat(price);
    if (isNaN(num)) return '0';
    return num.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }, []);

  const formatSize = useCallback((size: string) => {
    const num = parseFloat(size);
    if (isNaN(num)) return '0.0000';
    return num.toFixed(4);
  }, []);

  const formatTime = useCallback((timestamp: string) => {
    try {
      const date = new Date(timestamp);
      return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });
    } catch {
      return '--:--:--';
    }
  }, []);

  const baseCurrency = selectedMarket.split('-')[0] || 'BTC';
  const quoteCurrency = selectedMarket.split('-')[1] || 'USD';

  return (
    <div className="w-full h-full flex flex-col bg-secondary text-primary font-medium text-sm select-none">
      <div className="flex items-center shrink-0 justify-between px-1 md:px-2 lg:px-4 py-2 border-b border-color">
        <div className=" items-center gap-3 hidden lg:flex">
          <span className="text-muted text-xs font-semibold">Recent Trades</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-primary font-semibold">{baseCurrency}</span>
          <span className="text-muted">/</span>
          <span className="text-muted">{quoteCurrency}</span>
          <div
            className={`w-2 h-2 rounded-full ${
              isConnected ? 'bg-success' : 'bg-warning'
            } ${isConnected ? 'animate-pulse' : ''}`}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 shrink-0 px-1 md:px-2 lg:px-4 py-2 text-xs text-muted border-b border-color font-medium">
        <div className="text-left">Size ({baseCurrency})</div>
        <div className="text-center">Price ({quoteCurrency})</div>
        <div className="text-right">Time</div>
      </div>

      {isLoading && trades.length === 0 && (
        <div className="flex items-center justify-center py-12">
          <div className="flex flex-col items-center gap-2">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-success border-t-transparent" />
            <div className="text-muted text-sm">Loading trades...</div>
          </div>
        </div>
      )}
      {trades.length > 0 && (
        <div className="relative flex-1 overflow-auto hide-scrollbar">
          {trades.map((trade, index) => {
            const uniqueKey = `${trade.id}-${index}`;
            const isBuy = trade.side === 'BUY';
            const size = parseFloat(trade.size) || 0;
            const depthPct = maxTradeSize > 0 ? size / maxTradeSize : 0; // ratio 0 to 1

            return (
              <div
                key={uniqueKey}
                className="grid grid-cols-3 px-1 md:px-2 lg:px-4 py-1.5 hover:bg-hover relative overflow-hidden transition-colors duration-150"
              >
                <div
                  className={`absolute inset-y-0 right-0 origin-right will-change-transform transition-transform duration-200 ease-out ${
                    isBuy ? 'bg-success/10' : 'bg-danger/10'
                  }`}
                  style={{
                    width: '100%',
                    transform: `scaleX(${depthPct})`,
                  }}
                />

                <div
                  className={`relative font-medium text-xs lg:text-[13px] tabular-nums text-left ${
                    isBuy ? 'text-success' : 'text-danger'
                  }`}
                >
                  {formatSize(trade.size)}
                </div>
                <div className="relative text-xs lg:text-[13px] text-primary tabular-nums text-center">
                  ${formatPrice(trade.price)}
                </div>
                <div className="relative text-xs lg:text-[13px] text-muted tabular-nums text-right">
                  {formatTime(trade.createdAt)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!isConnected && trades.length > 0 && (
        <div className="px-4 py-2 bg-warning/10 border-t border-warning/20">
          <div className="text-xs text-warning text-center">
            Showing cached data - Reconnecting...
          </div>
        </div>
      )}

      <style>{`
        .hide-scrollbar::-webkit-scrollbar {
          display: none;
        }

        .hide-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>
  );
}
