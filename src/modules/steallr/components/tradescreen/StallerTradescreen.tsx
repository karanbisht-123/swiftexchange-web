import { useState } from 'react';

import AmmSwapUI from '../AmmSwapUI';
import OrderBookSwapUI from '../OrderBookSwapUI';
import TradeTransactionUI from '../TradeTransactionUI';
import StellarTradingChart from '../chart/StellarTradingChart';

const StellarTradescreen = () => {
  const [activeTab, setActiveTab] = useState('amm');

  return (
    <div className="min-h-screen bg-primary  max-w-[100vw] p-2">
      {/* Tab Switcher - Right Corner */}
      <div className="flex justify-end mb-4">
        <div className="inline-flex rounded-lg border border-color bg-secondary p-1 shadow-sm">
          <button
            onClick={() => setActiveTab('amm')}
            className={`px-6 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === 'amm'
                ? 'text-white shadow-sm'
                : 'text-secondary hover:text-primary hover:bg-tertiary'
            }`}
            style={{
              backgroundColor: activeTab === 'amm' ? 'var(--color-brand-primary)' : 'transparent',
            }}
          >
            AMM Swap
          </button>
          <button
            onClick={() => setActiveTab('orderbook')}
            className={`px-6 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === 'orderbook'
                ? 'text-white shadow-sm'
                : 'text-secondary hover:text-primary hover:bg-tertiary'
            }`}
            style={{
              backgroundColor:
                activeTab === 'orderbook' ? 'var(--color-brand-primary)' : 'transparent',
            }}
          >
            Order Book
          </button>
        </div>
      </div>

      {activeTab === 'amm' && (
        <div className="space-y-4 animate-fade-in">
          <div className="grid grid-cols-1 lg:grid-cols-10 gap-4">
            {/* Chart (70%) */}
            <div className="lg:col-span-6 border lg:border-none rounded-xl">
              <StellarTradingChart />
            </div>

            {/* Swap (30%) */}
            <div className="lg:col-span-4  p-0 m-0">
              <AmmSwapUI />
            </div>
          </div>

          {/* Transaction History */}
          <div className="">
            <TradeTransactionUI />
          </div>
        </div>
      )}

      {/* Desktop: OrderBook Layout (Chart Full Width, OrderBook Below) */}
      {activeTab === 'orderbook' && (
        <div className="space-y-4  max-w-[100vw]">
          {/* Chart - Full Width */}
          <div className="rounded-xl lg:border-none border">
            <StellarTradingChart />
          </div>

          {/* OrderBook Swap UI */}
          <div className="">
            <OrderBookSwapUI />
          </div>

          {/* Transaction History */}
          <div className=" ">
            <TradeTransactionUI />
          </div>
        </div>
      )}
    </div>
  );
};

export default StellarTradescreen;
