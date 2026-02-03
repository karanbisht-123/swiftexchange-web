import React from 'react';
import { RefreshCw } from 'lucide-react';
import { useRecentTrades } from '../../hook/useRecentTrades';

interface LastTradesProps {
    baseAsset?: { code: string; issuer?: string };
    counterAsset?: { code: string; issuer?: string };
}

const LastTrades: React.FC<LastTradesProps> = ({ baseAsset, counterAsset }) => {
    const { trades, isLoading, refresh } = useRecentTrades({ baseAsset, counterAsset });

    const formatTime = (timeStr: string) => {
        const date = new Date(timeStr);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };

    return (
        <div className="h-full bg-secondary text-sm">
            <div className="px-4 py-3 flex items-center justify-between border-b border-white/5">
                <h3 className="font-semibold text-primary">Recent Trades</h3>
                <button
                    onClick={refresh}
                    className="p-1.5 hover:bg-white/5 rounded-lg transition-colors"
                    disabled={isLoading}
                >
                    <RefreshCw className={`w-3.5 h-3.5 text-muted ${isLoading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            <div className="grid grid-cols-3 px-4 py-2 text-xs font-medium text-muted uppercase tracking-wider">
                <span>Price</span>
                <span className="text-right">Amount ({baseAsset?.code})</span>
                <span className="text-right">Time</span>
            </div>

            <div className="overflow-y-auto max-h-[400px] scrollbar-hide">
                {trades.length === 0 && !isLoading ? (
                    <div className="text-center py-8 text-muted text-xs">
                        No recent trades found
                    </div>
                ) : (
                    trades.map((trade) => (
                        <div key={trade.id} className="grid grid-cols-3 px-4 py-2 hover:bg-white/5 transition-colors">
                            <span className={`font-mono ${trade.isBuy ? 'text-green-500' : 'text-red-500'}`}>
                                {trade.price}
                            </span>
                            <span className="text-right font-mono text-text-primary">
                                {parseFloat(trade.amount).toFixed(4)}
                            </span>
                            <span className="text-right text-muted text-xs">
                                {formatTime(trade.time)}
                            </span>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default LastTrades;
