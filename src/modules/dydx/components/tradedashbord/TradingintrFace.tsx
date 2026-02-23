import { BookOpen, ArrowRightLeft, CandlestickChart, Wallet, BarChart2, LineChart } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { useDydxData } from '../../hooks/useDydxData';
import DydxTopBar from '../../layout/DydxTopBar';
import DepthChart from '../DepthChart';
import DyDxTradingChart from '../DyDxTradingChart';
import MarketsDisplay from '../MarketsDisplay';
import { DydxTradingForm } from '../form/DydxTradingForm';
import MarketSwitcher from '../market/MarketSwitcher';
import { MarketStats } from '../market/MarketSwitcher';
import { DydxWalletConnect } from '../DydxWalletConnect';
import OrderAndTrades from '../order&trade/OrderAndTrades';
import FillsPanel from '../orderHistory/FillsPanel';
import OpenOrdersPanel from '../orderHistory/OpenOrdersPanel';
import OrderHistoryPanel from '../orderHistory/OrderHistoryPanel';
import PositionsPanel from '../orderHistory/PositionsPanel';
import FundingPaymentsPanel from '../orderHistory/FundingPaymentsPanel';
import TransferHistoryPanel from '../orderHistory/TransferHistoryPanel';
import FundingChart from './FundingChart';
import ResizablePanel from './ResizablePanel';
import { useMarkets } from '../../hooks/useMarkets';
import useMarketStore from '../../store/marketStore';
import Orderbook from '../order&trade/Orderbook';
const TradingintrFace = () => {
  const [searchParams] = useSearchParams();
  const [activeChartTab, setActiveChartTab] = useState<'price' | 'depth' | 'funding'>('price');
  const view = searchParams.get('view') || 'trade';
  const { selectedMarket } = useMarketStore();

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
                <div className="flex border-b border-color bg-secondary">
                  {(['price', 'depth', 'funding'] as const).map(tab => (
                    <button
                      key={tab}
                      onClick={() => setActiveChartTab(tab)}
                      className="relative px-4 py-2 text-sm font-medium transition-all duration-200 capitalize"
                    >
                      <span
                        className={
                          activeChartTab === tab
                            ? 'text-primary'
                            : 'text-muted hover:text-primary'
                        }
                      >
                        {tab === 'price' ? 'Price Chart' : tab === 'depth' ? 'Depth' : 'Funding'}
                      </span>
                      {activeChartTab === tab && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 transition-all duration-300" />
                      )}
                    </button>
                  ))}
                </div>

                <div className="flex-1 relative">
                  {activeChartTab === 'price' && (
                    <div className="absolute inset-0">
                      <DyDxTradingChart />
                    </div>
                  )}
                  {activeChartTab === 'depth' && (
                    <div className="absolute inset-0">
                      <DepthChart />
                    </div>
                  )}
                  {activeChartTab === 'funding' && selectedMarket && (
                    <div className="absolute inset-0">
                      <FundingChart market={selectedMarket} />
                    </div>
                  )}
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

        <MobileLayout />
      </div >
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
  const {
    positions,
    openOrderCount,
    fillCount,
    loadingPositions,
    loadingOrders,
    loadingFills
  } = useDydxData();

  const tabs = ['wallet', 'positions', 'orders', 'fills', 'history', 'funding', 'transfers'];
  const labels: Record<string, string> = {
    wallet: 'Wallet',
    positions: 'Positions',
    orders: 'Open Orders',
    fills: 'Fills',
    history: 'Order History',
    funding: 'Funding Payments',
    transfers: 'Transfer History',
  };

  const prevCountsRef = useRef({ positions: 0, orders: 0, fills: 0 });
  const [newCounts, setNewCounts] = useState({ positions: 0, orders: 0, fills: 0 });

  useEffect(() => {
    const currentCounts = {
      positions: positions.length,
      orders: openOrderCount,
      fills: fillCount,
    };

    const newChanges = {
      positions:
        currentCounts.positions > prevCountsRef.current.positions
          ? currentCounts.positions - prevCountsRef.current.positions
          : 0,
      orders:
        currentCounts.orders > prevCountsRef.current.orders
          ? currentCounts.orders - prevCountsRef.current.orders
          : 0,
      fills:
        currentCounts.fills > prevCountsRef.current.fills
          ? currentCounts.fills - prevCountsRef.current.fills
          : 0,
    };

    setNewCounts(newChanges);

    const timer = setTimeout(() => {
      setNewCounts({ positions: 0, orders: 0, fills: 0 });
    }, 5000);

    prevCountsRef.current = currentCounts;

    return () => clearTimeout(timer);
  }, [positions.length, openOrderCount, fillCount]);

  return (
    <div className="h-full flex flex-col max-w-full">
      <div className="flex items-center border-b border-color mb-4 overflow-x-auto scrollbar-hide">
        {tabs.map(tab => {
          const isLoading =
            (tab === 'positions' && loadingPositions) ||
            (tab === 'orders' && loadingOrders) ||
            (tab === 'fills' && loadingFills);
          const newCount =
            tab === 'positions'
              ? newCounts.positions
              : tab === 'orders'
                ? newCounts.orders
                : tab === 'fills'
                  ? newCounts.fills
                  : 0;

          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`relative px-4 sm:px-6 py-3 text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap ${activeTab === tab
                ? 'text-primary border-b-2 border-blue-500'
                : 'text-muted hover:text-primary'
                }`}
            >
              <span className="flex items-center gap-2">
                {labels[tab]}
                {isLoading && (
                  <div className="w-3 h-3 border-2 border-muted border-t-blue-500 rounded-full animate-spin" />
                )}
                {newCount > 0 && (
                  <span className="bg-green-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full animate-pulse">
                    +{newCount}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-auto">
        {activeTab === 'wallet' && (
          <div className="p-4">
            <DydxWalletConnect />
          </div>
        )}
        {activeTab === 'positions' && <PositionsPanel />}
        {activeTab === 'orders' && <OpenOrdersPanel />}
        {activeTab === 'fills' && <FillsPanel />}
        {activeTab === 'history' && <OrderHistoryPanel />}
        {activeTab === 'funding' && <FundingPaymentsPanel />}
        {activeTab === 'transfers' && <TransferHistoryPanel />}
      </div>
    </div>
  );
};

const MobileLayout = () => {
  const [activeTab, setActiveTab] = useState('price');
  const { getMarket } = useMarkets();
  const { selectedMarket } = useMarketStore();

  const marketData = getMarket(selectedMarket);

  const tabs = [
    { id: 'price', label: 'Price', icon: CandlestickChart },
    { id: 'depth', label: 'Depth', icon: BarChart2 },
    { id: 'funding', label: 'Funding', icon: LineChart },
    { id: 'orderbook', label: 'Orderbook', icon: BookOpen },
    { id: 'trade', label: 'Trade', icon: ArrowRightLeft },
    { id: 'portfolio', label: 'Portfolio', icon: Wallet },
  ];

  return (
    <div className="md:hidden flex flex-col max-w-lvw flex h-[calc(100svh-60px)] overflow-hidden">
      <div className="max-w-lvw shrink-0">
        <MarketSwitcher />
      </div>
      <div className="flex-1 overflow-hidden bg-secondary flex flex-col">
        <div className="flex-1 overflow-hidden">
          {activeTab === 'price' && (
            <div className="h-full">
              <DyDxTradingChart />
            </div>
          )}
          {activeTab === 'depth' && (
            <div className="h-full">
              <DepthChart />
            </div>
          )}
          {activeTab === 'funding' && (
            <div className="h-full">
              <FundingChart market={selectedMarket} />
            </div>
          )}
          {activeTab === 'orderbook' && (
            <div className="h-full overflow-auto">
              <OrderAndTrades />
            </div>
          )}
          {activeTab === 'trade' && (
            <div className="h-full overflow-hidden flex">
              <div className="w-2/4 overflow-auto border-r border-color">
                <Orderbook />
              </div>
              <div className="flex-1 overflow-auto">
                <DydxTradingForm />
              </div>
            </div>
          )}
          {activeTab === 'portfolio' && (
            <div className="h-full overflow-auto">
              <MobilePortfolio />
            </div>
          )}
        </div>
        <div className="flex items-center justify-center gap-2 px-4 py-3 bg-secondary border-t border-color shrink-0">
          {tabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all ${isActive
                  ? 'bg-blue-600 text-white'
                  : 'bg-primary text-muted hover:bg-hover hover:text-primary'
                  }`}
              >
                <Icon className="w-5 h-5 shrink-0" />
                {isActive && (
                  <span className="text-xs font-medium whitespace-nowrap">{tab.label}</span>
                )}
              </button>
            );
          })}
        </div>
        {marketData && <MarketStats marketData={marketData} />}
      </div>
    </div>
  );
};

const MobilePortfolio = () => {
  const [activeTab, setActiveTab] = useState('wallet');

  const {
    positions,
    openOrderCount,
    fillCount,
    loadingPositions,
    loadingOrders,
    loadingFills
  } = useDydxData();

  const tabs = ['wallet', 'positions', 'orders', 'fills', 'history', 'funding'];
  const labels: Record<string, string> = {
    wallet: 'Wallet',
    positions: 'Positions',
    orders: 'Open Orders',
    fills: 'Fills',
    history: 'Order History',
    funding: 'Funding Payments',
  };

  const prevCountsRef = useRef({ positions: 0, orders: 0, fills: 0 });
  const [newCounts, setNewCounts] = useState({ positions: 0, orders: 0, fills: 0 });

  useEffect(() => {
    const currentCounts = {
      positions: positions.length,
      orders: openOrderCount,
      fills: fillCount,
    };

    const newChanges = {
      positions:
        currentCounts.positions > prevCountsRef.current.positions
          ? currentCounts.positions - prevCountsRef.current.positions
          : 0,
      orders:
        currentCounts.orders > prevCountsRef.current.orders
          ? currentCounts.orders - prevCountsRef.current.orders
          : 0,
      fills:
        currentCounts.fills > prevCountsRef.current.fills
          ? currentCounts.fills - prevCountsRef.current.fills
          : 0,
    };

    setNewCounts(newChanges);

    const timer = setTimeout(() => {
      setNewCounts({ positions: 0, orders: 0, fills: 0 });
    }, 5000);

    prevCountsRef.current = currentCounts;

    return () => clearTimeout(timer);
  }, [positions.length, openOrderCount, fillCount]);

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center border-b border-color overflow-x-auto scrollbar-hide shrink-0">
        {tabs.map(tab => {
          const isLoading =
            (tab === 'positions' && loadingPositions) ||
            (tab === 'orders' && loadingOrders) ||
            (tab === 'fills' && loadingFills);
          const newCount =
            tab === 'positions'
              ? newCounts.positions
              : tab === 'orders'
                ? newCounts.orders
                : tab === 'fills'
                  ? newCounts.fills
                  : 0;

          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`relative px-4 py-3 text-xs font-semibold transition-colors whitespace-nowrap ${activeTab === tab
                ? 'text-primary border-b-2 border-blue-500'
                : 'text-muted hover:text-primary'
                }`}
            >
              <span className="flex items-center gap-2">
                {labels[tab]}
                {isLoading && (
                  <div className="w-2.5 h-2.5 border-2 border-muted border-t-blue-500 rounded-full animate-spin" />
                )}
                {newCount > 0 && (
                  <span className="bg-green-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full animate-pulse">
                    +{newCount}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-auto">
        {activeTab === 'wallet' && (
          <div className="p-4">
            <DydxWalletConnect />
          </div>
        )}
        {activeTab === 'positions' && <PositionsPanel />}
        {activeTab === 'orders' && <OpenOrdersPanel />}
        {activeTab === 'fills' && <FillsPanel />}
        {activeTab === 'history' && <OrderHistoryPanel />}
        {activeTab === 'funding' && <FundingPaymentsPanel />}
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
  const {
    positions,
    openOrderCount,
    fillCount,
    loadingPositions,
    loadingOrders,
    loadingFills
  } = useDydxData();

  const tabs = ['positions', 'orders', 'fills', 'history', 'funding', 'transfer'];
  const labels: Record<string, string> = {
    positions: 'Positions',
    orders: 'Open Orders',
    fills: 'Fills',
    history: 'Order History',
    funding: 'Funding Payments',
    transfer: 'Transfer History',
  };

  const prevCountsRef = useRef({ positions: 0, orders: 0, fills: 0 });
  const [newCounts, setNewCounts] = useState({ positions: 0, orders: 0, fills: 0 });

  useEffect(() => {
    const currentCounts = {
      positions: positions.length,
      orders: openOrderCount,
      fills: fillCount,
    };

    const newChanges = {
      positions:
        currentCounts.positions > prevCountsRef.current.positions
          ? currentCounts.positions - prevCountsRef.current.positions
          : 0,
      orders:
        currentCounts.orders > prevCountsRef.current.orders
          ? currentCounts.orders - prevCountsRef.current.orders
          : 0,
      fills:
        currentCounts.fills > prevCountsRef.current.fills
          ? currentCounts.fills - prevCountsRef.current.fills
          : 0,
    };

    setNewCounts(newChanges);

    const timer = setTimeout(() => {
      setNewCounts({ positions: 0, orders: 0, fills: 0 });
    }, 5000);

    prevCountsRef.current = currentCounts;

    return () => clearTimeout(timer);
  }, [positions.length, openOrderCount, fillCount]);

  return (
    <>
      <div className="flex items-center border-b border-color px-2 sm:px-4 shrink-0 overflow-x-auto scrollbar-hide bg-secondary">
        {tabs.map(tab => {
          const isLoading =
            (tab === 'positions' && loadingPositions) ||
            (tab === 'orders' && loadingOrders) ||
            (tab === 'fills' && loadingFills);
          const newCount =
            tab === 'positions'
              ? newCounts.positions
              : tab === 'orders'
                ? newCounts.orders
                : tab === 'fills'
                  ? newCounts.fills
                  : 0;

          return (
            <button
              key={tab}
              onClick={() => setActiveBottomTab(tab)}
              className={`relative px-3 sm:px-4 py-2 text-xs sm:text-sm transition-colors whitespace-nowrap ${activeBottomTab === tab
                ? 'text-primary border-b-2 border-blue-500'
                : 'text-muted hover:text-primary'
                }`}
            >
              <span className="flex items-center gap-2">
                {labels[tab]}
                {isLoading && (
                  <div className="w-2.5 h-2.5 border-2 border-muted border-t-blue-500 rounded-full animate-spin" />
                )}
                {newCount > 0 && (
                  <span className="bg-green-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full animate-pulse">
                    +{newCount}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-hidden flex flex-col min-h-0 pb-6 relative">
        {activeBottomTab === 'positions' && <PositionsPanel />}
        {activeBottomTab === 'orders' && <OpenOrdersPanel />}
        {activeBottomTab === 'fills' && <FillsPanel />}
        {activeBottomTab === 'history' && <OrderHistoryPanel />}
        {activeBottomTab === 'funding' && <FundingPaymentsPanel />}
        {activeBottomTab === 'transfer' && <TransferHistoryPanel />}
      </div>
    </>
  );
};

export default TradingintrFace;