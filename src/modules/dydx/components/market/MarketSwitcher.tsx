import { ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Tooltip } from '../../../../components/common/Tooltip';
import { useMarkets } from '../../hooks/useMarkets';
import { tradesState } from '../../hooks/useTrades';
import useMarketStore from '../../store/marketStore';
import { useLivePriceStore } from '../../store/useLivePriceStore';
import { useWebSocketStore } from '../../store/websocketStore';
import { formatMarketPrice } from '../../utils/BigNumberUtils';
import {
  fetchDydxServerTime,
  formatAnnualizedFundingRate,
  formatFundingCountdown,
  formatFundingRate,
  getNextFundingTimestamp,
} from '../../utils/FundingUtils';
import { currencyService } from '../../utils/currencyService';
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

function useFundingCountdown(): string {
  const [countdown, setCountdown] = useState('--:--');
  const offsetRef = useRef<number>(0);

  useEffect(() => {
    fetchDydxServerTime()
      .then(serverMs => {
        offsetRef.current = serverMs - Date.now();
      })
      .catch(() => {
        offsetRef.current = 0;
      });

    const interval = setInterval(() => {
      const serverNow = Date.now() + offsetRef.current;
      const target = getNextFundingTimestamp(serverNow);
      setCountdown(formatFundingCountdown(target, serverNow));
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return countdown;
}

interface MarketStatsProps {
  marketData?: {
    ticker: string;
    oraclePrice: string;
    volume24H: string;
    trades24H: number;
    nextFundingRate: string;
    openInterest: string;
    initialMarginFraction?: string;
    maintenanceMarginFraction?: string;
  };
}

export const OpenInterestDisplay: React.FC<{
  openInterest: string;
  oraclePrice: string;
  ticker: string;
  wrapperClassName?: string;
  valueClassName?: string;
}> = ({ openInterest, oraclePrice, ticker, wrapperClassName = '', valueClassName = '' }) => {
  const [mode, setMode] = useState<'USD' | 'BASE'>('USD');

  const baseAmount = parseFloat(openInterest || '0');
  const price = parseFloat(oraclePrice || '0');
  const usdAmount = currencyService.convertToUsd(baseAmount, price);

  const displayValue =
    mode === 'USD'
      ? `${usdAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
      : `${baseAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

  const baseSymbol = ticker ? ticker.split('-')[0] : 'BASE';
  const displayLabel = mode === 'USD' ? 'USD' : baseSymbol;

  return (
    <div className={`flex flex-col ${wrapperClassName}`}>
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-muted text-xs leading-none">Open Interest</span>
        <button
          onClick={() => setMode(mode === 'USD' ? 'BASE' : 'USD')}
          className="text-[9px] font-medium bg-tertiary text-muted hover:text-primary px-1 rounded uppercase transition-colors"
        >
          {displayLabel}
        </button>
      </div>
      <AnimatedValue
        value={displayValue}
        className={valueClassName || 'font-medium text-primary text-sm'}
      />
    </div>
  );
};

export const MarketStats: React.FC<MarketStatsProps> = ({ marketData }) => {
  const countdown = useFundingCountdown();

  if (!marketData) return null;

  const fundingFormatted = formatFundingRate(marketData.nextFundingRate);
  const annualized = formatAnnualizedFundingRate(marketData.nextFundingRate);
  const isPositive = parseFloat(marketData.nextFundingRate) >= 0;

  return (
    <div className="grid grid-cols-2 bg-secondary border-t border-color">
      <div className="flex flex-col p-3 border-r border-b border-color">
        <span className="text-muted text-xs mb-1">Oracle</span>
        <AnimatedValue
          value={formatMarketPrice(marketData.oraclePrice)}
          className="font-medium text-primary text-sm"
        />
      </div>

      <div className="flex flex-col p-3 border-b border-color">
        <span className="text-muted text-xs mb-1">24H Volume</span>
        <AnimatedValue
          value={`${parseFloat(marketData.volume24H || '0').toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
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

      <OpenInterestDisplay
        openInterest={marketData.openInterest}
        oraclePrice={marketData.oraclePrice}
        ticker={marketData.ticker}
        wrapperClassName="p-3 border-b border-color"
      />

      <div className="flex flex-col p-3 border-r border-color">
        <span className="text-muted text-xs mb-1">1h Funding</span>
        <Tooltip content={`Annualized: ${annualized}`} position="top">
          <AnimatedValue
            value={fundingFormatted}
            className={`font-medium text-sm ${isPositive ? 'price-up' : 'price-down'}`}
          />
        </Tooltip>
      </div>

      <div className="flex flex-col p-3">
        <span className="text-muted text-xs mb-1">Next Funding</span>
        <span className="font-medium text-primary text-sm tabular-nums">{countdown}</span>
      </div>
    </div>
  );
};

const MarketSwitcher: React.FC = () => {
  const { selectedMarket } = useMarketStore();
  const { getMarket, isLoading } = useMarkets();
  const livePriceData = useLivePriceStore(state => state.prices[selectedMarket]);
  const livePrice = livePriceData?.price || null;
  const livePriceSide = livePriceData?.side || null;

  const wsOraclePrice = useWebSocketStore(state => state.markets.get(selectedMarket)?.oraclePrice);

  const [isModalOpen, setIsModalOpen] = useState(false);

  const marketData = getMarket(selectedMarket) || {
    ticker: selectedMarket,
    oraclePrice: '0',
    priceChange24H: '0',
    volume24H: '0',
    trades24H: 0,
    nextFundingRate: '0',
    openInterest: '0',
    coinIcon: '',
    initialMarginFraction: '0.05',
    maintenanceMarginFraction: '0',
  };

  const liveOraclePrice = wsOraclePrice ?? marketData.oraclePrice;

  const countdown = useFundingCountdown();

  const snapshotPrice = tradesState.get(selectedMarket)?.trades[0]?.price;
  const currentPrice =
    livePrice && livePrice > 0
      ? formatMarketPrice(livePrice)
      : snapshotPrice
        ? formatMarketPrice(snapshotPrice)
        : '--';

  const priceChange = parseFloat(marketData.priceChange24H || '0');
  const oraclePrice = parseFloat(liveOraclePrice || '0');
  const price24hAgo = oraclePrice - priceChange;
  const priceChangePercentage =
    price24hAgo > 0 ? ((priceChange / price24hAgo) * 100).toFixed(2) : '0';

  const changePercentage = parseFloat(priceChangePercentage);
  const formattedPercentage =
    changePercentage >= 0 ? `+${priceChangePercentage}` : priceChangePercentage;

  const absChange = Math.abs(priceChange);
  const formattedChangeStr =
    priceChange >= 0
      ? `+$${absChange.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : `-$${absChange.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const formattedPercentStr =
    priceChange >= 0 ? `(+${priceChangePercentage}%)` : `(${priceChangePercentage}%)`;

  const fundingFormatted = formatFundingRate(marketData.nextFundingRate);
  const annualized = formatAnnualizedFundingRate(marketData.nextFundingRate);
  const isFundingPositive = parseFloat(marketData.nextFundingRate) >= 0;

  const imf = Number(marketData.initialMarginFraction);
  const maxLeverage = imf > 0 ? `${(1 / imf).toFixed(2)}×` : '-';
  const leverageTooltip =
    'Maximum allowed leverage for this market. To limit risk, maximum leverage decreases linearly with position size after a certain threshold.';

  return (
    <>
      <div className="lg:hidden px-4 py-2 lg:py-0 lg:px-0 flex items-center justify-between w-full bg-secondary text-sm text-primary border-b border-color">
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
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold">
              {selectedMarket.split('-')[0].slice(0, 2)}
            </div>
          )}
          <span className="font-semibold text-primary text-sm">{selectedMarket.split('-')[0]}</span>
          <ChevronDown className="w-4 h-4 text-muted" />
        </button>

        <div className="flex flex-col items-end">
          <AnimatedPrice
            price={currentPrice}
            tradeSide={currentPrice === '--' ? null : livePriceSide}
            className="text-base font-bold"
          />
          <AnimatedValue
            value={`${formattedPercentage}%`}
            className={`text-xs font-medium ${changePercentage >= 0 ? 'price-up' : 'price-down'}`}
          />
        </div>
      </div>

      <div className="hidden  py-0.5 px-2 mb-1.5 lg:flex bg-secondary items-center w-full text-sm text-primary  rounded-lg">
        <button
          onClick={() => setIsModalOpen(true)}
          disabled={isLoading}
          className="flex items-center gap-2 px-2 py-2.5  hover:bg-hover transition-colors disabled:opacity-50 min-w-[140px]"
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
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold"
              style={{
                background:
                  'linear-gradient(135deg, var(--color-brand-primary), var(--color-brand-accent))',
              }}
            >
              {selectedMarket.split('-')[0].slice(0, 2)}
            </div>
          )}
          <div className="flex flex-col items-start">
            <span className="font-semibold text-primary text-base">{selectedMarket}</span>
          </div>
          <ChevronDown className="w-4 h-4 text-muted ml-1" />
        </button>

        <div className="px-2  flex flex-col items-start ">
          <AnimatedPrice
            price={currentPrice}
            tradeSide={currentPrice === '--' ? null : livePriceSide}
            className="text-xl font-bold"
          />
        </div>

        <div className="hide-scrollbar flex items-center overflow-x-auto px-2 flex-1">
          <div className="flex divide-x divide-divider whitespace-nowrap">
            <div className="flex flex-col px-3">
              <span className="text-muted text-xs">Oracle Price</span>
              {/* liveOraclePrice comes from websocketStore — live WS updates applied */}
              <AnimatedValue
                value={`$${formatMarketPrice(liveOraclePrice)}`}
                className="font-medium text-primary"
              />
            </div>

            <div className="flex flex-col px-3">
              <span className="text-muted text-xs">24h Change</span>
              <div
                className={`flex items-center gap-1 font-medium ${changePercentage >= 0 ? 'price-up' : 'price-down'}`}
              >
                <AnimatedValue value={formattedChangeStr} className="font-semibold text-xs" />
                <AnimatedValue
                  value={formattedPercentStr}
                  className="font-medium text-xs opacity-90"
                />
              </div>
            </div>

            <div className="flex flex-col px-3">
              <span className="text-muted text-xs">24h Volume</span>
              <AnimatedValue
                value={`$${parseFloat(marketData.volume24H).toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                className="font-medium text-primary"
              />
            </div>

            <div className="flex flex-col px-3">
              <span className="text-muted text-xs">24h Trades</span>
              <AnimatedValue
                value={marketData.trades24H.toLocaleString()}
                className="font-medium text-primary"
              />
            </div>

            <OpenInterestDisplay
              openInterest={marketData.openInterest}
              oraclePrice={marketData.oraclePrice}
              ticker={marketData.ticker}
              wrapperClassName="px-3"
              valueClassName="font-medium text-primary"
            />

            <div className="flex flex-col px-3">
              <span className="text-muted text-xs">1h Funding</span>
              <Tooltip content={`Annualized: ${annualized}`} position="bottom">
                <AnimatedValue
                  value={fundingFormatted}
                  className={`font-medium ${isFundingPositive ? 'price-up' : 'price-down'}`}
                />
              </Tooltip>
            </div>

            <div className="flex flex-col px-3">
              <span className="text-muted text-xs">Next Funding</span>
              <span className="font-medium text-primary tabular-nums">{countdown}</span>
            </div>

            <div className="flex flex-col px-3">
              <span className="text-muted text-xs">Maximum Leverage</span>
              <Tooltip content={leverageTooltip} position="bottom">
                <AnimatedValue value={maxLeverage} className="font-medium text-primary" />
              </Tooltip>
            </div>
          </div>
        </div>
      </div>

      <MarketSelectorModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </>
  );
};

export default MarketSwitcher;
