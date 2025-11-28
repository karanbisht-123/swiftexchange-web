import { useEffect, useRef, useState } from 'react';

import { useMarkets } from '../../hooks/useMarkets';
import useMarketStore from '../../store/marketStore';

interface AnimatedPriceProps {
  price: string | number;
  className?: string;
}

interface AnimatedValueProps {
  value: string | number;
  className?: string;
}

const AnimatedPrice: React.FC<AnimatedPriceProps> = ({ price, className = '' }) => {
  const [displayPrice, setDisplayPrice] = useState(price);
  const [flashClass, setFlashClass] = useState('');
  const prevPriceRef = useRef(price);

  useEffect(() => {
    const prevPrice = parseFloat(prevPriceRef.current as any);
    const currentPrice = parseFloat(price as any);

    if (prevPrice !== currentPrice) {
      const flash = currentPrice > prevPrice ? 'flash-up' : 'flash-down';
      setFlashClass(flash);

      const timeout = setTimeout(() => setFlashClass(''), 600);

      setDisplayPrice(price);
      prevPriceRef.current = price;

      return () => clearTimeout(timeout);
    }
  }, [price]);

  return (
    <span className={`${className} ${flashClass} transition-all duration-200`}>{displayPrice}</span>
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

  const priceChange = parseFloat(marketData.priceChange24H);
  const formattedPriceChange =
    priceChange >= 0 ? `+${marketData.priceChange24H}` : marketData.priceChange24H;

  const oraclePrice = parseFloat(marketData.oraclePrice);
  const priceChangePercentage =
    oraclePrice > 0 && priceChange ? ((priceChange / oraclePrice) * 100).toFixed(2) : '0';

  const changePercentage = parseFloat(priceChangePercentage);
  const formattedPercentage =
    changePercentage >= 0 ? `+${priceChangePercentage}` : priceChangePercentage;

  const trendColor = priceChange >= 0 ? 'text-theme-up' : 'text-theme-down';

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
            className="w-full bg-primary text-xs lg:text-md bg-theme-input text-theme-text border-none px-0 lg:px-2 py-2  lg:py-3.5 focus:ring-theme-accent focus:outline-none disabled:opacity-50 transition-all cursor-pointer"
            disabled={isSelectDisabled}
          >
            {Object.keys(markets).map(market => (
              <option key={market} value={market} className="bg-theme-input text-theme-text">
                {market}
              </option>
            ))}
          </select>
        </div>

        {/* Current Price */}
        <div className="px-2 flex items-center">
          <AnimatedPrice
            price={marketData.oraclePrice}
            className={`lg:text-xl font-semibold text-md ${trendColor}`}
          />
        </div>

        {/* Market Stats */}
        <div className="hide-scrollbar flex items-center overflow-x-auto scrollbar-thin scrollbar-thumb-theme-scroll scrollbar-track-theme-bg px-2">
          <div className="flex lg:space-x-4 space-x-2 whitespace-nowrap">
            {/* 24H Change */}
            <div className="flex flex-col">
              <span className="text-theme-muted text-xs">24H Change</span>
              <AnimatedValue
                value={`${formattedPriceChange} (${formattedPercentage}%)`}
                className={`${trendColor} font-medium`}
              />
            </div>

            {/* 24H Volume */}
            <div className="flex flex-col">
              <span className="text-theme-muted text-xs">24H Volume</span>
              <AnimatedValue value={marketData.volume24H} className="font-medium text-theme-text" />
            </div>

            {/* 24H Trades */}
            <div className="flex flex-col">
              <span className="text-theme-muted text-xs">24H Trades</span>
              <AnimatedValue
                value={marketData.trades24H.toLocaleString()}
                className="font-medium text-theme-text"
              />
            </div>

            {/* Open Interest */}
            <div className="flex flex-col">
              <span className="text-theme-muted text-xs">Open Interest</span>
              <AnimatedValue
                value={`${marketData.openInterest} ${marketData.ticker.split('-')[0]}`}
                className="font-medium text-theme-text"
              />
            </div>

            {/* Next Funding */}
            <div className="flex flex-col">
              <span className="text-theme-muted text-xs">Next Funding</span>
              <AnimatedValue
                value={`${marketData.nextFundingRate}%`}
                className={`font-medium ${
                  parseFloat(marketData.nextFundingRate) >= 0 ? 'text-theme-up' : 'text-theme-down'
                }`}
              />
            </div>

            {/* Funding At */}
            <div className="flex flex-col">
              <span className="text-theme-muted text-xs">Funding At</span>
              <span className="font-medium text-theme-text">{marketData.nextFundingAt}</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default MarketSwitcher;
