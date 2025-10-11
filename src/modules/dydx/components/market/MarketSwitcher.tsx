import React from 'react';

import { useMarkets } from '../../hooks/useMarkets';
import useMarketStore from '../../store/marketStore';

const MarketSwitcher: React.FC = () => {
  const { selectedMarket, setSelectedMarket } = useMarketStore();
  const { markets, getMarket, isLoading, isConnected, totalMarkets } = useMarkets();

  console.log(isConnected);
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

  const priceChangePercentage =
    marketData.oraclePrice && marketData.priceChange24H
      ? (
          (parseFloat(marketData.priceChange24H) / parseFloat(marketData.oraclePrice)) *
          100
        ).toFixed(2)
      : '0';

  const trendColor =
    parseFloat(marketData.priceChange24H) >= 0 ? 'text-theme-up' : 'text-theme-down';

  const isSelectDisabled = isLoading || totalMarkets === 0;

  return (
    <div className="flex bg-secondary items-center w-full px-2 py-3 bg-theme-bg text-sm text-theme-text border-b border-theme-border">
      {/* Market Select (~20% width) */}
      <div className="w-[20%] pr-4 relative">
        <select
          value={selectedMarket}
          onChange={handleMarketChange}
          className="w-full bg-primary bg-theme-input text-theme-text border-none rounded-md px-3 py-2 focus:ring-2 focus:ring-theme-accent focus:outline-none disabled:opacity-50 transition-all"
          disabled={isSelectDisabled}
        >
          {Object.keys(markets).map(market => (
            <option key={market} value={market} className="bg-theme-input text-theme-text">
              {market}
            </option>
          ))}
        </select>

        {/* WebSocket Status Indicator */}
        {/* {!isLoading && (
          <div className="absolute right-6 top-1/2 transform -translate-y-1/2 pointer-events-none">
            <div
              className={`w-2 h-2 rounded-full ${
                isConnected ? "bg-green-500" : "bg-yellow-500"
              }`}
              title={isConnected ? "Live updates active" : "Using cached data"}
            />
          </div>
        )} */}
      </div>

      {/* Oracle Price (~10% width) */}
      <div className="w-[10%] flex items-center">
        <span className={`font-medium ${trendColor}`}>{marketData.oraclePrice}</span>
      </div>

      {/* Other Details (Scrollable, ~70% width) */}
      <div className="w-[70%] flex items-center overflow-x-auto scrollbar-thin scrollbar-thumb-theme-scroll scrollbar-track-theme-bg">
        <div className="flex space-x-6 whitespace-nowrap">
          <div className="flex flex-col">
            <span className="text-theme-muted text-xs">24H Change</span>
            <span className={`${trendColor} font-medium`}>
              {marketData.priceChange24H} ({priceChangePercentage}%)
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-theme-muted text-xs">24H Volume</span>
            <span className="font-medium text-theme-text">{marketData.volume24H}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-theme-muted text-xs">24H Trades</span>
            <span className="font-medium text-theme-text">{marketData.trades24H}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-theme-muted text-xs">Open Interest</span>
            <span className="font-medium text-theme-text">
              {marketData.openInterest} {marketData.ticker.split('-')[0]}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-theme-muted text-xs">Next Funding</span>
            <span className="font-medium text-theme-text">{marketData.nextFundingRate}%</span>
          </div>
          <div className="flex flex-col">
            <span className="text-theme-muted text-xs">Funding At</span>
            <span className="font-medium text-theme-text">{marketData.nextFundingAt}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MarketSwitcher;
