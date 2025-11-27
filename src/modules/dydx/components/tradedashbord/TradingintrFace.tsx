import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import DydxTopBar from '../../layout/DydxTopBar';
// import { DydxDebugger } from '../../utils/dydxDebugger';
import DepthChart from '../DepthChart';
import DyDxTradingChart from '../DyDxTradingChart';
import MarketsDisplay from '../MarketsDisplay';
import { DydxTradingForm } from '../form/DydxTradingForm';
import MarketSwitcher from '../market/MarketSwitcher';
import OrderAndTrades from '../order&trade/OrderAndTrades';
import FillsPanel from '../orderHistory/FillsPanel';
import OpenOrdersPanel from '../orderHistory/OpenOrdersPanel';
import OrderHistoryPanel from '../orderHistory/OrderHistoryPanel';
import PositionsPanel from '../orderHistory/PositionsPanel';

const TradingintrFace = () => {
  const [searchParams] = useSearchParams();
  const [activeChartTab, setActiveChartTab] = useState<'price' | 'depth'>('price');
  const view = searchParams.get('view') || 'trade';

  const [activeBottomTab, setActiveBottomTab] = useState('positions');

  if (view === 'trade') {
    return (
      <div className="min-h-screen bg-primary text-primary font-body flex flex-col">
        <DydxTopBar />

        {/* Mobile Tabs */}
        <div className="md:hidden border-b border-gray-800">
          <MobileTabs />
        </div>

        <div className="hidden md:grid md:grid-cols-[1fr_auto] flex-1 overflow-hidden">
          <div className="flex flex-col overflow-hidden min-w-0">
            <div className="flex overflow-hidden h-[60vh]">
              <div className="flex-1 bg-secondary overflow-hidden flex flex-col">
                <MarketSwitcher />
                <div className="flex border-b border-gray-800 bg-secondary">
                  {(['price', 'depth'] as const).map(tab => (
                    <button
                      key={tab}
                      onClick={() => setActiveChartTab(tab)}
                      className="relative px-4 py-2 text-sm font-medium transition-all duration-200 capitalize"
                    >
                      <span
                        className={
                          activeChartTab === tab
                            ? 'text-white'
                            : 'text-gray-400 hover:text-gray-200'
                        }
                      >
                        {tab === 'price' ? 'Price Chart' : 'Depth'}
                      </span>
                      {activeChartTab === tab && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 transition-all duration-300" />
                      )}
                    </button>
                  ))}
                </div>

                <div className="flex-1 relative">
                  <div
                    className={`absolute inset-0 ${activeChartTab === 'price' ? 'block' : 'hidden'}`}
                  >
                    <DyDxTradingChart />
                  </div>
                  <div
                    className={`absolute inset-0 ${activeChartTab === 'depth' ? 'block' : 'hidden'}`}
                  >
                    <DepthChart />
                  </div>
                </div>
              </div>
              <div className="w-[250px] flex-shrink-0 bg-secondary overflow-hidden">
                <OrderAndTrades />
              </div>
            </div>

            <BottomTabsSection
              activeBottomTab={activeBottomTab}
              setActiveBottomTab={setActiveBottomTab}
            />
          </div>

          {/* Right Side – Trading Form */}
          <div className="bg-secondary  flex-shrink-0">
            <DydxTradingForm />
          </div>
        </div>

        {/* Mobile Layout */}
        <MobileLayout />
      </div>
    );
  }

  // ── Markets View ─────────────────────────────────────────────
  if (view === 'markets') {
    return (
      <div className="min-h-screen bg-primary text-primary font-body flex flex-col">
        <DydxTopBar />
        <div className="flex-1 overflow-auto">
          <MarketsDisplay />
        </div>
      </div>
    );
  }

  // ── Portfolio View ─────────────────────────────
  if (view === 'portfolio') {
    return (
      <div className="min-h-screen bg-primary text-primary font-body flex flex-col">
        <DydxTopBar />
        <div className="flex-1 bg-secondary p-6 overflow-auto">
          <PortfolioView activeTab={activeBottomTab} setActiveTab={setActiveBottomTab} />
        </div>
      </div>
    );
  }

  return null;
};

// ── Portfolio View with Tabs ─────────────────────────────
const PortfolioView = ({
  activeTab,
  setActiveTab,
}: {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}) => {
  const tabs = ['positions', 'orders', 'fills', 'history'];
  const labels: Record<string, string> = {
    positions: 'Positions',
    orders: 'Open Orders',
    fills: 'Fills',
    history: 'Order History',
  };

  return (
    <div className="h-full flex flex-col max-w-full">
      {/* Tab Headers */}
      <div className="flex items-center border-b border-gray-800 mb-4 overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-6 py-3 text-sm font-semibold transition-colors whitespace-nowrap ${
              activeTab === tab
                ? 'text-white border-b-2 border-blue-500'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            {labels[tab]}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-auto">
        {activeTab === 'positions' && <PositionsPanel />}
        {activeTab === 'orders' && <OpenOrdersPanel />}
        {activeTab === 'fills' && <FillsPanel />}
        {activeTab === 'history' && <OrderHistoryPanel />}
      </div>
    </div>
  );
};

// ── Reusable Mobile Tabs ─────────────────────────────────────
const MobileTabs = () => {
  const [activeTab, setActiveTab] = useState('chart');

  return (
    <div className="flex">
      {['chart', 'orderbook', 'trade'].map(tab => (
        <button
          key={tab}
          onClick={() => setActiveTab(tab)}
          className={`flex-1 py-3 text-center transition-colors capitalize ${
            activeTab === tab ? 'text-white border-b-2 border-blue-500' : 'text-gray-400'
          }`}
        >
          {tab === 'orderbook' ? 'Order Book' : tab}
        </button>
      ))}
    </div>
  );
};

// ── Mobile Layout (inside Trade view only) ───────────────────
const MobileLayout = () => {
  const [activeTab, setActiveTab] = useState('chart');
  console.log('activeTab :', setActiveTab);

  return (
    <div className="md:hidden flex-1 overflow-hidden">
      {activeTab === 'chart' && (
        <div className="h-full bg-secondary">
          <DyDxTradingChart />
        </div>
      )}
      {activeTab === 'orderbook' && (
        <div className="h-full bg-secondary">
          <OrderAndTrades />
        </div>
      )}
      {activeTab === 'trade' && (
        <div className="h-full bg-secondary">
          <DydxTradingForm />
        </div>
      )}
    </div>
  );
};

// ── Bottom Tabs Section (Positions, Orders, etc.) ─────────────
const BottomTabsSection = ({
  activeBottomTab,
  setActiveBottomTab,
}: {
  activeBottomTab: string;
  setActiveBottomTab: (tab: string) => void;
}) => {
  const tabs = ['positions', 'orders', 'fills', 'history', 'funding'];
  const labels: Record<string, string> = {
    positions: 'Positions',
    orders: 'Open Orders',
    fills: 'Fills',
    history: 'Order History',
    funding: 'Funding Payments',
  };

  return (
    <div className="h-[40vh] bg-secondary border-t border-gray-800 flex flex-col overflow-hidden">
      {/* Tab Headers */}
      <div className="flex items-center border-b border-gray-800 px-4 h-12 flex-shrink-0 overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveBottomTab(tab)}
            className={`px-4 py-2 text-sm transition-colors whitespace-nowrap ${
              activeBottomTab === tab
                ? 'text-white border-b-2 border-blue-500'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            {labels[tab]}
          </button>
        ))}
      </div>

      {/* Tab Content - Scrollable */}
      <div className="flex-1 overflow-auto">
        {activeBottomTab === 'positions' && <PositionsPanel />}
        {activeBottomTab === 'orders' && <OpenOrdersPanel />}
        {activeBottomTab === 'fills' && <FillsPanel />}
        {activeBottomTab === 'history' && <OrderHistoryPanel />}
        {activeBottomTab === 'funding' && <FundingPlaceholder />}
      </div>
    </div>
  );
};

// ── Funding Placeholder (Coming Soon) ─────────────────────────────
const FundingPlaceholder = () => (
  <div className="flex flex-col items-center justify-center h-full text-center">
    {/* <div className="text-5xl mb-4">💰</div> */}
    <h3 className="text-lg font-semibold text-white mb-2">Funding Payments</h3>
    <p className="text-gray-400 text-sm">This feature is coming soon</p>
  </div>
);

export default TradingintrFace;
