import { ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { useMarkets } from '../../hooks/useMarkets';
import { useTrades } from '../../hooks/useTrades';
import useMarketStore from '../../store/marketStore';
import MarketSelectorModal from './MarketSelectorModal';

interface AnimatedPriceProps {
  price: string | number;
  tradeSide: 'BUY' | 'SELL' | null;
  className?: string;
}

interface AnimatedValueProps {
  value: string | number;
  className?: string;
}

// REMOVED FLASH ANIMATIONS - Only color changes now
const AnimatedPrice: React.FC<AnimatedPriceProps> = ({ price, tradeSide, className = '' }) => {
  const [displayPrice, setDisplayPrice] = useState(price);
  const prevPriceRef = useRef(price);

  const getPriceColor = () => {
    if (tradeSide === 'BUY') return 'price-up';
    if (tradeSide === 'SELL') return 'price-down';
    return 'text-primary';
  };

  useEffect(() => {
    if (prevPriceRef.current !== price) {
      setDisplayPrice(price);
      prevPriceRef.current = price;
    }
  }, [price]);

  return (
    <span
      className={`${className} ${getPriceColor()} transition-colors duration-300 font-bold tabular-nums`}
    >
      {displayPrice}
    </span>
  );
};

// REMOVED FLASH ANIMATIONS - Only color changes now
const AnimatedValue: React.FC<AnimatedValueProps> = ({ value, className = '' }) => {
  const [displayValue, setDisplayValue] = useState(value);
  const prevValueRef = useRef(value);

  useEffect(() => {
    if (prevValueRef.current !== value) {
      setDisplayValue(value);
      prevValueRef.current = value;
    }
  }, [value]);

  return (
    <span className={`${className} transition-colors duration-200 text-xs tabular-nums`}>
      {displayValue}
    </span>
  );
};

interface MarketStatsProps {
  marketData?: {
    ticker: string;
    oraclePrice: string;
    volume24H: string;
    trades24H: number;
    nextFundingRate: string;
    nextFundingAt: string;
    openInterest: string;
  };
}

export const MarketStats: React.FC<MarketStatsProps> = ({ marketData }) => {
  if (!marketData) {
    return null;
  }

  return (
    <div className="grid grid-cols-2 bg-secondary border-t border-color">
      <div className="flex flex-col p-3 border-r border-b border-color">
        <span className="text-muted text-xs mb-1">Oracle</span>
        <AnimatedValue
          value={parseFloat(marketData.oraclePrice || '0').toFixed(2)}
          className="font-medium text-primary text-sm"
        />
      </div>

      <div className="flex flex-col p-3 border-b border-color">
        <span className="text-muted text-xs mb-1">24H Volume</span>
        <AnimatedValue
          value={`${parseFloat(marketData.volume24H || '0').toLocaleString(undefined, {
            maximumFractionDigits: 0,
          })}`}
          className="font-medium text-primary text-sm"
        />
      </div>

      <div className="flex flex-col p-3 border-r border-b border-color">
        <span className="text-muted text-xs mb-1">24H Trades</span>
        <AnimatedValue
          value={(marketData.trades24H || 0).toLocaleString()}
          className="font-medium text-primary text-sm"
        />
      </div>

      <div className="flex flex-col p-3 border-b border-color">
        <span className="text-muted text-xs mb-1">Open Interest</span>
        <AnimatedValue
          value={`${parseFloat(marketData.openInterest || '0').toLocaleString(undefined, {
            maximumFractionDigits: 0,
          })} ${marketData.ticker?.split('-')[0] || ''}`}
          className="font-medium text-primary text-sm"
        />
      </div>

      <div className="flex flex-col p-3 border-r border-color">
        <span className="text-muted text-xs mb-1">Funding Rate</span>
        <AnimatedValue
          value={`${marketData.nextFundingRate || '0'}%`}
          className={`font-medium text-sm ${parseFloat(marketData.nextFundingRate || '0') >= 0 ? 'price-up' : 'price-down'
            }`}
        />
      </div>

      <div className="flex flex-col p-3">
        <span className="text-muted text-xs mb-1">Next Funding</span>
        <AnimatedValue
          value={marketData.nextFundingAt || '-'}
          className="font-medium text-primary text-sm"
        />
      </div>
    </div>
  );
};

const MarketSwitcher: React.FC = () => {
  const { selectedMarket } = useMarketStore();
  const { getMarket, isLoading } = useMarkets();
  const { livePrice, livePriceSide } = useTrades(selectedMarket, 50);

  const [isModalOpen, setIsModalOpen] = useState(false);

  const marketData = getMarket(selectedMarket) || {
    ticker: selectedMarket,
    oraclePrice: '0',
    priceChange24H: '0',
    volume24H: '0',
    trades24H: 0,
    nextFundingRate: '0',
    nextFundingAt: '',
    openInterest: '0',
    coinIcon: '',
  };

  const currentPrice =
    livePrice && livePrice > 0
      ? livePrice.toFixed(2)
      : parseFloat(marketData.oraclePrice).toFixed(2);

  const priceChange = parseFloat(marketData.priceChange24H);
  const oraclePrice = parseFloat(marketData.oraclePrice);
  const priceChangePercentage =
    oraclePrice > 0 && priceChange ? ((priceChange / oraclePrice) * 100).toFixed(2) : '0';

  const changePercentage = parseFloat(priceChangePercentage);
  const formattedPercentage =
    changePercentage >= 0 ? `+${priceChangePercentage}` : priceChangePercentage;

  return (
    <>
      {/* MOBILE: Simplified layout - only coin, oracle price, 24h change */}
      <div className="lg:hidden flex items-center justify-between w-full bg-secondary text-sm text-primary border-b border-color px-3 py-2">
        {/* Left: Coin Logo and Name */}
        <button
          onClick={() => setIsModalOpen(true)}
          disabled={isLoading}
          className="flex items-center gap-2 hover:opacity-80 transition-opacity disabled:opacity-50"
        >
          {'coinIcon' in marketData && marketData.coinIcon ? (
            <img
              src={marketData.coinIcon}
              alt={selectedMarket}
              className="w-6 h-6 rounded-full"
              onError={e => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ background: 'linear-gradient(135deg, var(--color-brand-primary), var(--color-brand-accent))' }}>
              {selectedMarket.split('-')[0].slice(0, 2)}
            </div>
          )}
          <span className="font-semibold text-primary text-sm">
            {selectedMarket.split('-')[0]}
          </span>
          <ChevronDown className="w-4 h-4 text-muted" />
        </button>

        {/* Right: Oracle Price and 24H Change */}
        <div className="flex flex-col items-end">
          <AnimatedPrice
            price={currentPrice}
            tradeSide={livePriceSide}
            className="text-base font-bold"
          />
          <AnimatedValue
            value={`${formattedPercentage}%`}
            className={`text-xs font-medium ${changePercentage >= 0 ? 'price-up' : 'price-down'
              }`}
          />
        </div>
      </div>

      {/* DESKTOP: Full layout with all stats */}
      <div className="hidden lg:flex bg-secondary items-center w-full text-sm text-primary border-b border-color">
        {/* Market Selector Button */}
        <button
          onClick={() => setIsModalOpen(true)}
          disabled={isLoading}
          className="flex items-center gap-2 px-3 py-3.5 bg-tertiary hover:bg-hover transition-colors disabled:opacity-50 min-w-[140px]"
        >
          {'coinIcon' in marketData && marketData.coinIcon ? (
            <img
              src={marketData.coinIcon}
              alt={selectedMarket}
              className="w-6 h-6 rounded-full"
              onError={e => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ background: 'linear-gradient(135deg, var(--color-brand-primary), var(--color-brand-accent))' }}>
              {selectedMarket.split('-')[0].slice(0, 2)}
            </div>
          )}

          <div className="flex flex-col items-start">
            <span className="font-semibold text-primary text-base">
              {selectedMarket.split('-')[0]}
            </span>
          </div>

          <ChevronDown className="w-4 h-4 text-muted ml-1" />
        </button>

        {/* Live Price Display */}
        <div className="px-3 flex flex-col items-start min-w-[120px]">
          <AnimatedPrice
            price={currentPrice}
            tradeSide={livePriceSide}
            className="text-xl font-bold"
          />
        </div>

        {/* Market Stats */}
        <div className="hide-scrollbar flex items-center overflow-x-auto px-2 flex-1">
          <div className="flex space-x-4 whitespace-nowrap">
            <div className="flex flex-col">
              <span className="text-muted text-xs">Oracle</span>
              <AnimatedValue
                value={parseFloat(marketData.oraclePrice).toFixed(2)}
                className="font-medium text-primary"
              />
            </div>

            <div className="flex flex-col">
              <span className="text-muted text-xs">24H Change</span>
              <AnimatedValue
                value={`${formattedPercentage}%`}
                className={`${changePercentage >= 0 ? 'price-up' : 'price-down'} font-medium`}
              />
            </div>

            <div className="flex flex-col">
              <span className="text-muted text-xs">24H Volume</span>
              <AnimatedValue
                value={`$${parseFloat(marketData.volume24H).toLocaleString(undefined, {
                  maximumFractionDigits: 0,
                })}`}
                className="font-medium text-primary"
              />
            </div>

            <div className="flex flex-col">
              <span className="text-muted text-xs">24H Trades</span>
              <AnimatedValue
                value={marketData.trades24H.toLocaleString()}
                className="font-medium text-primary"
              />
            </div>

            <div className="flex flex-col">
              <span className="text-muted text-xs">Open Interest</span>
              <AnimatedValue
                value={`${parseFloat(marketData.openInterest).toLocaleString(undefined, {
                  maximumFractionDigits: 0,
                })} ${marketData.ticker.split('-')[0]}`}
                className="font-medium text-primary"
              />
            </div>

            <div className="flex flex-col">
              <span className="text-muted text-xs">Funding Rate</span>
              <AnimatedValue
                value={`${marketData.nextFundingRate}%`}
                className={`font-medium ${parseFloat(marketData.nextFundingRate) >= 0 ? 'price-up' : 'price-down'
                  }`}
              />
            </div>

            <div className="flex flex-col">
              <span className="text-muted text-xs">Next Funding</span>
              <AnimatedValue
                value={marketData.nextFundingAt}
                className="font-medium text-primary"
              />
            </div>
          </div>
        </div>
      </div>

      <MarketSelectorModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </>
  );
};

export default MarketSwitcher;