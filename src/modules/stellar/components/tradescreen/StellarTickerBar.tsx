import { TrendingDown, TrendingUp } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

interface TickerItem {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  price: string;
  change: string;
  isPositive: boolean;
}

export const StellarTickerBar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [tickerData, setTickerData] = useState<TickerItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const fetchMarketData = async () => {
      try {
        const symbols = ['XLMUSDT', 'BTCUSDT', 'ETHUSDT', 'XRPUSDT'];
        const res = await fetch(
          `https://api.binance.com/api/v3/ticker/24hr?symbols=${JSON.stringify(symbols)}`
        );
        if (res.ok) {
          const data = await res.json();
          const items: TickerItem[] = data.map((item: any) => {
            const base = item.symbol.replace('USDT', '');
            const lastPrice = parseFloat(item.lastPrice);
            const changePercent = parseFloat(item.priceChangePercent);

            // Format price based on size
            const formattedPrice =
              lastPrice > 1000
                ? `$${lastPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                : lastPrice > 1
                  ? `$${lastPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                  : `$${lastPrice.toFixed(4)}`;

            return {
              symbol: `${base}/USDC`,
              baseAsset: base,
              quoteAsset: 'USDC',
              price: formattedPrice,
              change: `${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%`,
              isPositive: changePercent >= 0,
            };
          });
          setTickerData(items);
        }
      } catch (e) {
        console.warn('Failed to fetch real-time ticker prices', e);
      } finally {
        setLoading(false);
      }
    };

    fetchMarketData();
    const interval = setInterval(fetchMarketData, 20000);
    return () => clearInterval(interval);
  }, []);

  const handleTickerClick = (sellAsset: string, buyAsset: string) => {
    const params = new URLSearchParams(location.search);
    params.set('sellAsset', sellAsset);
    params.set('buyAsset', buyAsset);
    navigate({ search: params.toString() }, { replace: true });
  };

  if (loading || tickerData.length === 0) {
    return (
      <div className="w-full lg:max-w-[93vw] rounded-xl mx-auto bg-bg-secondary/30 backdrop-blur-md shadow-sm overflow-hidden select-none relative h-10 flex items-center justify-center">
        <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest animate-pulse">
          Loading market tickers...
        </span>
      </div>
    );
  }

  // Duplicate list to guarantee seamless infinite carousel transition
  const duplicatedTickers = [...tickerData, ...tickerData, ...tickerData, ...tickerData];

  return (
    <div className="w-full lg:max-w-[93vw] rounded-xl mx-auto bg-bg-secondary/30 backdrop-blur-md shadow-sm mb-1 lg:mb-2 overflow-hidden select-none relative h-10 flex items-center">
      {/* Scrollable Track */}
      <div className="flex whitespace-nowrap animate-ticker hover:[animation-play-state:paused] cursor-pointer">
        {duplicatedTickers.map((item, index) => (
          <div
            key={index}
            onClick={() => handleTickerClick(item.baseAsset, item.quoteAsset)}
            className="inline-flex items-center gap-2.5 px-6 py-2 text-[11px] font-semibold transition-colors hover:bg-bg-secondary/50"
          >
            <span className="text-text-primary font-bold">{item.symbol}</span>
            <span className="text-text-secondary font-mono">{item.price}</span>
            <span
              className={`flex items-center gap-1 font-bold ${
                item.isPositive ? 'text-brand' : 'text-red-500'
              }`}
            >
              {item.isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              {item.change}
            </span>
          </div>
        ))}
      </div>

      <style>{`
        @keyframes ticker {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-50%);
          }
        }
        .animate-ticker {
          animation: ticker 30s linear infinite;
        }
      `}</style>
    </div>
  );
};
