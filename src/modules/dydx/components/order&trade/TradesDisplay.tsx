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
    <div className="w-full max-w-md bg-secondary text-white font-medium text-sm select-none">
      <div className="flex items-center justify-between px-1 md:px-2 lg:px-4 py-2 border-b border-[#232027]">
        <div className=" items-center gap-3 hidden lg:flex">
          <span className="text-[#aaaaaa] text-xs font-semibold">Recent Trades</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-white font-semibold">{baseCurrency}</span>
          <span className="text-[#aaaaaa]">/</span>
          <span className="text-[#aaaaaa]">{quoteCurrency}</span>
          <div
            className={`w-2 h-2 rounded-full ${
              isConnected ? 'bg-[#00ff9d]' : 'bg-[#ffaa00]'
            } ${isConnected ? 'animate-pulse' : ''}`}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 px-1 md:px-2 lg:px-4 py-2 text-xs text-[#6b6b76] border-b border-[#232027] font-medium">
        <div className="text-left">Price ({quoteCurrency})</div>
        <div className="text-center">Size ({baseCurrency})</div>
        <div className="text-right">Time</div>
      </div>

      {isLoading && trades.length === 0 && (
        <div className="flex items-center justify-center py-12">
          <div className="flex flex-col items-center gap-2">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-[#00ff9d] border-t-transparent" />
            <div className="text-[#6b6b76] text-sm">Loading trades...</div>
          </div>
        </div>
      )}
      {/* 
      {error && trades.length === 0 && (
        <div className="px-4 py-8 text-center">
          <div className="text-[#ff3b69] text-sm">{error}</div>
        </div>
      )} */}

      {trades.length > 0 && (
        <div className="relative overflow-auto hide-scrollbar">
          {trades.map((trade, index) => {
            const uniqueKey = `${trade.id}-${index}`;
            const isBuy = trade.side === 'BUY';
            const size = parseFloat(trade.size) || 0;
            const depthPct = maxTradeSize > 0 ? size / maxTradeSize : 0; // ratio 0 to 1

            return (
              <div
                key={uniqueKey}
                className="grid grid-cols-3 px-1 md:px-2 lg:px-4 py-1.5 hover:bg-[#1a1620] relative overflow-hidden transition-colors duration-150"
              >
                <div
                  className={`absolute inset-y-0 right-0 origin-right will-change-transform transition-transform duration-200 ease-out ${
                    isBuy ? 'bg-[#00ff9d15]' : 'bg-[#ff3b6915]'
                  }`}
                  style={{
                    width: '100%',
                    transform: `scaleX(${depthPct})`,
                  }}
                />

                <div
                  className={`relative  font-semibold text-xs lg:text-sm tabular-nums ${
                    isBuy ? 'text-[#00ff9d]' : 'text-[#ff3b69]'
                  }`}
                >
                  {formatPrice(trade.price)}
                </div>
                <div className="relative text-xs lg:text-sm text-[#e8e8e8] tabular-nums text-center">
                  {formatSize(trade.size)}
                </div>
                <div className="relative text-xs lg:text-sm text-[#6b6b76] tabular-nums text-right">
                  {formatTime(trade.createdAt)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!isConnected && trades.length > 0 && (
        <div className="px-4 py-2 bg-[#ffaa0015] border-t border-[#ffaa0030]">
          <div className="text-xs text-[#ffaa00] text-center">
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
