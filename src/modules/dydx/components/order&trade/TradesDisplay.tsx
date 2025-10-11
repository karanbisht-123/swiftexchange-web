import { useTrades } from '../../hooks/useTrades';
import useMarketStore from '../../store/marketStore';

export default function TradesDisplay() {
  const { selectedMarket } = useMarketStore();
  const { trades, error, isLoading } = useTrades(selectedMarket, 50);

  const formatPrice = (price: string) => {
    const num = parseFloat(price);
    return num.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  };

  const formatSize = (size: string) => {
    const num = parseFloat(size);
    return num.toFixed(4);
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  };

  return (
    <div
      className=" w-64 flex items-center justify-center  card"
      style={{ borderRadius: 0, padding: 0 }}
    >
      <div className="w-full max-w-md">
        {/* Trades Container */}
        <div className="ounded-lg overflow-hidden  ">
          {/* Table Header */}
          <div className="grid grid-cols-3 gap-4 px-4 py-3">
            <div className="text-xs text-zinc-500 text-left">
              Size <span className="text-zinc-600">BTC</span>
            </div>
            <div className="text-xs text-zinc-500 text-center">
              Price <span className="text-zinc-600">USD</span>
            </div>
            <div className="text-xs text-zinc-500 text-right">Time</div>
          </div>

          {/* Loading State */}
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-zinc-700 border-t-blue-500"></div>
            </div>
          )}

          {/* Error State */}
          {error && <div className="px-4 py-8 text-center text-red-400 text-sm">{error}</div>}

          {/* Trades List */}
          {!isLoading && !error && (
            <div className="overflow-y-auto" style={{ maxHeight: '500px' }}>
              {trades.map((trade, index) => (
                <div
                  key={trade.id}
                  className={`grid grid-cols-3 gap-4 px-4 py-2.5 border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors ${
                    index === 0 ? 'animate-flash-red' : ''
                  }`}
                  style={{
                    animation: index === 0 ? 'flashRed 0.6s ease-out' : 'none',
                  }}
                >
                  <div
                    className={`text-sm font-mono text-left ${
                      trade.side === 'BUY' ? 'text-green-500' : 'text-red-500'
                    }`}
                  >
                    {formatSize(trade.size)}
                  </div>
                  <div className="text-sm font-mono text-center text-white">
                    ${formatPrice(trade.price)}
                  </div>
                  <div className="text-xs text-zinc-500 text-right font-mono">
                    {formatTime(trade.createdAt)}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Empty State */}
          {!isLoading && !error && trades.length === 0 && (
            <div className="px-4 py-12 text-center text-zinc-500 text-sm">
              No trades available yet
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes flashRed {
          0% {
            background-color: rgba(239, 68, 68, 0.3);
          }
          50% {
            background-color: rgba(239, 68, 68, 0.15);
          }
          100% {
            background-color: transparent;
          }
        }
      `}</style>
    </div>
  );
}
