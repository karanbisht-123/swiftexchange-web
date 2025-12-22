import { useEffect, useRef, useState } from 'react';

import { useRealtimeChart } from '../../hooks/useCandles';
import { useMarkets } from '../../hooks/useMarkets';
import useMarketStore from '../../store/marketStore';

interface AnimatedPriceProps {
  price: string | number;
  tradeSide: 'BUY' | 'SELL' | null;
  className?: string;
}

interface AnimatedValueProps {
  value: string | number;
  className?: string;
}

const AnimatedPrice: React.FC<AnimatedPriceProps> = ({ price, tradeSide, className = '' }) => {
  const [displayPrice, setDisplayPrice] = useState(price);
  const [flashClass, setFlashClass] = useState('');
  const [priceColor, setPriceColor] = useState('text-theme-text');
  const prevPriceRef = useRef(price);

  useEffect(() => {
    const prevPrice = parseFloat(prevPriceRef.current as any);
    const currentPrice = parseFloat(price as any);

    if (prevPrice !== currentPrice && !isNaN(prevPrice) && !isNaN(currentPrice)) {
      let flash: string;
      let color: string;

      if (tradeSide === 'BUY') {
        flash = 'flash-up';
        color = 'text-theme-up';
      } else if (tradeSide === 'SELL') {
        flash = 'flash-down';
        color = 'text-theme-down';
      } else {
        flash = currentPrice > prevPrice ? 'flash-up' : 'flash-down';
        color = currentPrice > prevPrice ? 'text-theme-up' : 'text-theme-down';
      }

      setFlashClass(flash);
      setPriceColor(color);

      const timeout = setTimeout(() => {
        setFlashClass('');
        setPriceColor('text-theme-text');
      }, 600);

      setDisplayPrice(price);
      prevPriceRef.current = price;

      return () => clearTimeout(timeout);
    }
  }, [price, tradeSide]);

  return (
    <span className={`${className} ${flashClass} ${priceColor} transition-all duration-200`}>
      {displayPrice}
    </span>
  );
};

const AnimatedValue: React.FC<AnimatedValueProps> = ({ value, className = '' }) => {
  const [displayValue, setDisplayValue] = useState(value);
  const [flashClass, setFlashClass] = useState('');
  const prevValueRef = useRef(value);

  useEffect(() => {
    if (prevValueRef.current !== value) {
      setFlashClass('flash-neutral');
      const timeout = setTimeout(() => setFlashClass(''), 400);

      setDisplayValue(value);
      prevValueRef.current = value;

      return () => clearTimeout(timeout);
    }
  }, [value]);

  return (
    <span className={`${className} ${flashClass} transition-all duration-200 text-xs`}>
      {displayValue}
    </span>
  );
};

const MarketSwitcher: React.FC = () => {
  const { selectedMarket, setSelectedMarket } = useMarketStore();

  const { markets, getMarket, isLoading, totalMarkets } = useMarkets();

  // console.log(markets, 'pppppp');

  // console;

  const { livePrice, livePriceSide } = useRealtimeChart(selectedMarket, '1MIN' as any);

  const handleMarketChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newMarket = event.target.value;
    const marketData = getMarket(newMarket);
    setSelectedMarket(newMarket, marketData || undefined);
  };

  const marketData = getMarket(selectedMarket) || {
    ticker: selectedMarket,
    oraclePrice: '0',
    priceChange24H: '0',
    volume24H: '0',
    trades24H: 0,
    nextFundingRate: '0',
    nextFundingAt: '',
    openInterest: '0',
  };

  const currentPrice = livePrice && parseFloat(livePrice) > 0 ? livePrice : marketData.oraclePrice;

  const priceChange = parseFloat(marketData.priceChange24H);
  const formattedPriceChange =
    priceChange >= 0 ? `+${marketData.priceChange24H}` : marketData.priceChange24H;

  const oraclePrice = parseFloat(marketData.oraclePrice);
  const priceChangePercentage =
    oraclePrice > 0 && priceChange ? ((priceChange / oraclePrice) * 100).toFixed(2) : '0';

  const changePercentage = parseFloat(priceChangePercentage);
  const formattedPercentage =
    changePercentage >= 0 ? `+${priceChangePercentage}` : priceChangePercentage;

  const isSelectDisabled = isLoading || totalMarkets === 0;

  return (
    <>
      <style>{`
        @keyframes flash-up {
          0%, 100% { background-color: transparent; }
          50% { background-color: rgba(34, 197, 94, 0.3); }
        }
        
        @keyframes flash-down {
          0%, 100% { background-color: transparent; }
          50% { background-color: rgba(239, 68, 68, 0.3); }
        }
        
        @keyframes flash-neutral {
          0%, 100% { background-color: transparent; }
          50% { background-color: rgba(59, 130, 246, 0.2); }
        }
        
        @keyframes pulse-indicator {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        
        .flash-up {
          animation: flash-up 0.6s ease-in-out;
        }
        
        .flash-down {
          animation: flash-down 0.6s ease-in-out;
        }
        
        .flash-neutral {
          animation: flash-neutral 0.4s ease-in-out;
        }
        
        .pulse-indicator {
          animation: pulse-indicator 2s ease-in-out infinite;
        }
        
        .hide-scrollbar::-webkit-scrollbar {
          height: 4px;
        }
        
        .hide-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        
        .hide-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(156, 163, 175, 0.3);
          border-radius: 2px;
        }
        
        .hide-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(156, 163, 175, 0.5);
        }
      `}</style>

      <div className="flex bg-secondary items-center w-full bg-theme-bg text-sm text-theme-text border-b border-gray-600">
        <div className="max-w-[20%] relative">
          <select
            value={selectedMarket}
            onChange={handleMarketChange}
            className="w-full bg-primary text-xs lg:text-md bg-theme-input text-theme-text border-none px-0 lg:px-2 py-2 lg:py-3.5 focus:ring-theme-accent focus:outline-none disabled:opacity-50 transition-all cursor-pointer"
            disabled={isSelectDisabled}
          >
            {Object.keys(markets).map(market => (
              <option key={market} value={market} className="bg-theme-input text-theme-text">
                {market}
              </option>
            ))}
          </select>
        </div>
        <div className="px-2 flex flex-col items-start">
          <AnimatedPrice
            price={currentPrice}
            tradeSide={livePriceSide}
            className="lg:text-xl font-semibold text-md"
          />
        </div>

        <div className="hide-scrollbar flex items-center overflow-x-auto scrollbar-thin scrollbar-thumb-theme-scroll scrollbar-track-theme-bg px-2">
          <div className="flex lg:space-x-4 space-x-2 whitespace-nowrap">
            <div className="flex flex-col">
              <span className="text-theme-muted text-xs">Oracle</span>
              <AnimatedValue
                value={marketData.oraclePrice}
                className="font-medium text-theme-text "
              />
            </div>

            <div className="flex flex-col">
              <span className="text-theme-muted text-xs">24H Change</span>
              <AnimatedValue
                value={`${formattedPriceChange} (${formattedPercentage}%)`}
                className={`${priceChange >= 0 ? 'text-theme-up' : 'text-theme-down'} font-medium`}
              />
            </div>

            <div className="flex flex-col">
              <span className="text-theme-muted text-xs">24H Volume</span>
              <AnimatedValue value={marketData.volume24H} className="font-medium text-theme-text" />
            </div>

            <div className="flex flex-col">
              <span className="text-theme-muted text-xs">24H Trades</span>
              <AnimatedValue
                value={marketData.trades24H.toLocaleString()}
                className="font-medium text-theme-text"
              />
            </div>

            <div className="flex flex-col">
              <span className="text-theme-muted text-xs">Open Interest</span>
              <AnimatedValue
                value={`${marketData.openInterest} ${marketData.ticker.split('-')[0]}`}
                className="font-medium text-theme-text"
              />
            </div>

            <div className="flex flex-col">
              <span className="text-theme-muted text-xs">Funding Rate</span>
              <AnimatedValue
                value={`${marketData.nextFundingRate}%`}
                className={`font-medium ${
                  parseFloat(marketData.nextFundingRate) >= 0 ? 'text-theme-up' : 'text-theme-down'
                }`}
              />
            </div>

            <div className="flex flex-col">
              <span className="text-theme-muted text-xs">Funding At</span>
              <AnimatedValue
                value={marketData.nextFundingAt}
                className="font-medium text-theme-text"
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default MarketSwitcher;
