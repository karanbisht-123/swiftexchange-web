import React from 'react';

// 1. Chart Section Loader
export const TradingChartSkeleton: React.FC = () => {
  return (
    <div className="w-full h-full min-h-[300px] flex items-center justify-center bg-secondary select-none">
      <div className="flex flex-col items-center gap-3">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin opacity-85" />
        <span className="text-xs text-muted font-medium tracking-wide">Loading chart...</span>
      </div>
    </div>
  );
};

// 2. Orderbook Section Loader
export const OrderbookSkeleton: React.FC = () => {
  return (
    <div className="w-full h-full min-h-[300px] flex items-center justify-center bg-secondary border-l border-color select-none">
      <div className="flex flex-col items-center gap-3">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin opacity-85" />
        <span className="text-xs text-muted font-medium tracking-wide">Loading orderbook...</span>
      </div>
    </div>
  );
};

// 3. Trading Form Section Loader
export const TradingFormSkeleton: React.FC = () => {
  return (
    <div className="w-full lg:w-[300px] h-full min-h-[400px] flex items-center justify-center bg-secondary border-l border-color select-none">
      <div className="flex flex-col items-center gap-3">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin opacity-85" />
        <span className="text-xs text-muted font-medium tracking-wide">Loading trading form...</span>
      </div>
    </div>
  );
};

// 4. Positions/Table Section Loader
export const TablePanelSkeleton: React.FC = () => {
  return (
    <div className="w-full h-full min-h-[150px] flex items-center justify-center bg-secondary select-none">
      <div className="flex flex-col items-center gap-3">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin opacity-85" />
        <span className="text-xs text-muted font-medium tracking-wide">Loading positions...</span>
      </div>
    </div>
  );
};
