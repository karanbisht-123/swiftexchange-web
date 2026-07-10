import { Loader2, Radio, RefreshCw } from 'lucide-react';
import React from 'react';

import { useRecentTrades } from '../../hook/useRecentTrades';

interface LastTradesProps {
  baseAsset?: { code: string; issuer?: string };
  counterAsset?: { code: string; issuer?: string };
}

const LastTrades: React.FC<LastTradesProps> = ({ baseAsset, counterAsset }) => {
  const { trades, isLoading, isStreaming, newTradeIds, refresh } = useRecentTrades({
    baseAsset,
    counterAsset,
  });

  const formatTime = (timeStr: string) => {
    const date = new Date(timeStr);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <>
      <style>{`
        @keyframes trade-slide-in-buy {
          from { opacity: 0; background-color: rgba(34,197,94,0.15); transform: translateX(-4px); }
          to   { opacity: 1; background-color: transparent; transform: translateX(0); }
        }
        @keyframes trade-slide-in-sell {
          from { opacity: 0; background-color: rgba(239,68,68,0.15); transform: translateX(-4px); }
          to   { opacity: 1; background-color: transparent; transform: translateX(0); }
        }
        .trade-flash-buy { animation: trade-slide-in-buy 1s cubic-bezier(0.16, 1, 0.3, 1); }
        .trade-flash-sell { animation: trade-slide-in-sell 1s cubic-bezier(0.16, 1, 0.3, 1); }
      `}</style>

      <div className="h-full bg-secondary text-sm flex flex-col">
        <div className="hidden px-4 py-3 lg:flex items-center justify-between border-b border-white/5 shrink-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-primary">Recent Trades</h3>
            <div className="flex items-center gap-1.5 ml-2">
              <Radio
                className={`w-3 h-3 ${isStreaming ? 'text-green-500 animate-pulse' : 'text-muted'}`}
              />
              <span className="text-[10px] text-muted">{isStreaming ? 'Live' : 'Ready'}</span>
            </div>
          </div>
          <button
            onClick={refresh}
            className="p-1.5 hover:bg-white/5 rounded-lg transition-colors"
            disabled={isLoading}
          >
            <RefreshCw className={`w-3.5 h-3.5 text-muted ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="grid grid-cols-3 px-4 py-2 text-xs font-medium text-muted uppercase tracking-wider shrink-0">
          <span>Price</span>
          <span className="text-right">Amount ({baseAsset?.code})</span>
          <span className="text-right">Time</span>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-hide">
          {trades.length === 0 && isLoading ? (
            <div className="w-full h-full flex flex-col items-center justify-center text-muted text-xs gap-2 py-12">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
              <span>Loading recent trades...</span>
            </div>
          ) : trades.length === 0 ? (
            <div className="w-full h-full flex flex-col items-center justify-center text-muted text-xs py-12">
              No recent trades found
            </div>
          ) : (
            trades.map(trade => (
              <div
                key={trade.id}
                className={`grid grid-cols-3 px-4 py-2 hover:bg-white/5 transition-colors ${
                  newTradeIds.has(trade.id)
                    ? trade.isBuy
                      ? 'trade-flash-buy'
                      : 'trade-flash-sell'
                    : ''
                }`}
              >
                <span className={`font-mono ${trade.isBuy ? 'text-green-500' : 'text-red-500'}`}>
                  {trade.price}
                </span>
                <span className="text-right font-mono text-text-primary">
                  {parseFloat(trade.amount).toFixed(4)}
                </span>
                <span className="text-right text-muted text-xs">{formatTime(trade.time)}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
};

export default LastTrades;
