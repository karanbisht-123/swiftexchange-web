import { BookOpen, ShoppingCart, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import DydxTopBar from '../../layout/DydxTopBar';
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
import ResizablePanel from './ResizablePanel';

const TradingintrFace = () => {
  const [searchParams] = useSearchParams();
  const [activeChartTab, setActiveChartTab] = useState<'price' | 'depth'>('price');
  const view = searchParams.get('view') || 'trade';

  const [activeBottomTab, setActiveBottomTab] = useState('positions');

  if (view === 'trade') {
    return (
      <div className="bg-primary text-primary font-body flex flex-col max-h-screen">
        <DydxTopBar />

        <div className="hidden md:grid md:grid-cols-[1fr_auto] flex-1 overflow-hidden">
          <div className="flex flex-col overflow-hidden min-w-0">
            <div className="flex overflow-hidden flex-1">
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

            <ResizablePanel defaultHeight={40} minHeight={20} maxHeight={70}>
              <BottomTabsSection
                activeBottomTab={activeBottomTab}
                setActiveBottomTab={setActiveBottomTab}
              />
            </ResizablePanel>
          </div>

          <div className="bg-secondary flex-shrink-0">
            <DydxTradingForm />
          </div>
        </div>

        {/* Mobile Layout */}
        <MobileLayout />
      </div>
    );
  }

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

  if (view === 'portfolio') {
    return (
      <div className="min-h-screen bg-primary text-primary font-body flex flex-col">
        <DydxTopBar />
        <div className="flex-1 bg-secondary p-3 sm:p-6 overflow-auto">
          <PortfolioView activeTab={activeBottomTab} setActiveTab={setActiveBottomTab} />
        </div>
      </div>
    );
  }

  return null;
};

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
      <div className="flex items-center border-b border-gray-800 mb-4 overflow-x-auto scrollbar-hide">
        {tabs.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 sm:px-6 py-3 text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap ${activeTab === tab
                ? 'text-white border-b-2 border-blue-500'
                : 'text-gray-400 hover:text-gray-300'
              }`}
          >
            {labels[tab]}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto">
        {activeTab === 'positions' && <PositionsPanel />}
        {activeTab === 'orders' && <OpenOrdersPanel />}
        {activeTab === 'fills' && <FillsPanel />}
        {activeTab === 'history' && <OrderHistoryPanel />}
      </div>
    </div>
  );
};

const MobileLayout = () => {
  const [activeTab, setActiveTab] = useState('chart');
  const [chartType, setChartType] = useState<'price' | 'depth'>('price');

  const tabs = [
    { id: 'chart', label: 'Chart', icon: TrendingUp },
    { id: 'orderbook', label: 'Book', icon: BookOpen },
    { id: 'trade', label: 'Trade', icon: ShoppingCart },
  ];

  return (
    <div className="md:hidden flex flex-col h-[calc(100svh-60px)] overflow-hidden">
      <div className="max-w-lvw shrink-0">
        <MarketSwitcher />
      </div>

      {activeTab === 'chart' && (
        <div className="flex bg-secondary border-b border-gray-800 shrink-0">
          <button
            onClick={() => setChartType('price')}
            className={`flex-1 text-xs font-medium transition-all active:scale-95 ${chartType === 'price'
                ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30'
                : 'bg-gray-800/50 text-gray-400 active:bg-gray-800'
              }`}
          >
            Price Chart
          </button>
          <button
            onClick={() => setChartType('depth')}
            className={`flex-1 py-2 text-xs font-medium transition-all active:scale-95 ${chartType === 'depth'
                ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30'
                : 'bg-gray-800/50 text-gray-400 active:bg-gray-800'
              }`}
          >
            Depth Chart
          </button>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden bg-secondary">
        {activeTab === 'chart' && (
          <div className="h-full">
            {chartType === 'price' ? <DyDxTradingChart /> : <DepthChart />}
          </div>
        )}
        {activeTab === 'orderbook' && (
          <div className="h-full overflow-auto">
            <OrderAndTrades />
          </div>
        )}
        {activeTab === 'trade' && (
          <div className="h-full overflow-auto">
            <DydxTradingForm />
          </div>
        )}
      </div>

      {/* Bottom Navigation */}
      <div className="flex bg-secondary backdrop-blur-sm shrink-0 safe-area-inset-bottom">
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-3 flex flex-col items-center gap-1 transition-all active:scale-95 ${activeTab === tab.id ? 'text-blue-500' : 'text-gray-400'
                }`}
            >
              <Icon className={`w-5 h-5 ${activeTab === tab.id ? 'text-blue-500' : ''}`} />
              <span className="text-[10px] font-medium">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

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
    <>
      <div className="flex items-center border-b border-gray-800 px-2 sm:px-4  shrink-0 overflow-x-auto scrollbar-hide">
        {tabs.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveBottomTab(tab)}
            className={`px-3 sm:px-4 py-2 text-xs sm:text-sm transition-colors whitespace-nowrap ${activeBottomTab === tab
                ? 'text-white border-b-2 border-[#3b4fd9]'
                : 'text-gray-400 hover:text-gray-300'
              }`}
          >
            {labels[tab]}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto">
        {activeBottomTab === 'positions' && <PositionsPanel />}
        {activeBottomTab === 'orders' && <OpenOrdersPanel />}
        {activeBottomTab === 'fills' && <FillsPanel />}
        {activeBottomTab === 'history' && <OrderHistoryPanel />}
        {activeBottomTab === 'funding' && <FundingPlaceholder />}
      </div>
    </>
  );
};

const FundingPlaceholder = () => (
  <div className="flex flex-col items-center justify-center h-full text-center p-4">
    <h3 className="text-base sm:text-lg font-semibold text-white mb-2">Funding Payments</h3>
    <p className="text-gray-400 text-xs sm:text-sm">This feature is coming soon</p>
  </div>
);

export default TradingintrFace;
