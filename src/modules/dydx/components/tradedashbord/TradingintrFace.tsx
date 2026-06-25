import {
  ArrowRightLeft,
  BarChart2,
  BookOpen,
  CandlestickChart,
  LineChart,
  Wallet,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { useDydxData } from '../../hooks/useDydxData';
import { useMarkets } from '../../hooks/useMarkets';
import DydxTopBar from '../../layout/DydxTopBar';
import useMarketStore from '../../store/marketStore';
import { DydxWalletConnect } from '../DydxWalletConnect';
import MarketsDisplay from '../MarketsDisplay';
import MarketSwitcher from '../market/MarketSwitcher';
import { MarketStats } from '../market/MarketSwitcher';
import ResizablePanel from './ResizablePanel';
import ResizablePanelHorizontal from './ResizablePanelHorizontal';
import SubscriptionKeepAlive from './SubscriptionKeepAlive';
import { GeolocationGuard } from '../../../commonfeature/components/GeolocationGuard';
import { RESTRICTED_TRADING_LOCATIONS } from '../../../commonfeature/constants/compliance';


const DepthChart = lazy(() => import('../DepthChart'));
const TradingChart = lazy(() => import('../TradingChart/index'))
const FundingChart = lazy(() => import('./FundingChart'));
const OrderAndTrades = lazy(() => import('../order&trade/OrderAndTrades'));
const Orderbook = lazy(() => import('../order&trade/Orderbook'));
const DydxTradingForm = lazy(() => import('../form/DydxTradingForm').then(m => ({ default: m.DydxTradingForm })));
const FillsPanel = lazy(() => import('../orderHistory/FillsPanel'));
const FundingPaymentsPanel = lazy(() => import('../orderHistory/FundingPaymentsPanel'));
const OpenOrdersPanel = lazy(() => import('../orderHistory/OpenOrdersPanel'));
const OrderHistoryPanel = lazy(() => import('../orderHistory/OrderHistoryPanel'));
const PositionsPanel = lazy(() => import('../orderHistory/PositionsPanel'));
const TransferHistoryPanel = lazy(() => import('../orderHistory/TransferHistoryPanel'));

const LoadingFallback = () => (
  <div className="flex items-center justify-center w-full h-full p-4 min-h-[100px]">
    <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
  </div>
);

const TradingintrFace = () => {
  const [searchParams] = useSearchParams();
  const [activeChartTab, setActiveChartTab] = useState<'price' | 'depth' | 'funding'>('price');
  const view = searchParams.get('view') || 'trade';
  const { selectedMarket } = useMarketStore();

  const [activeBottomTab, setActiveBottomTab] = useState('positions');

  return (
    <GeolocationGuard restrictedLocations={RESTRICTED_TRADING_LOCATIONS} blocking={true}>
      <div className="bg-primary text-primary font-body flex flex-col h-screen max-h-screen">
        <DydxTopBar />
        <SubscriptionKeepAlive />

        {view === 'trade' && (
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="hidden lg:grid lg:grid-cols-[1fr_auto] flex-1 overflow-hidden">
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
                      <Suspense fallback={<LoadingFallback />}>
                        {activeChartTab === 'price' && (
                          <div className="absolute inset-0">
                            {/* <DyDxTradingChart /> */}
                            <TradingChart />
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
                      </Suspense>
                    </div>
                  </div>
                  <ResizablePanelHorizontal
                    defaultWidth={300}
                    minWidth={250}
                    maxWidth={500}
                    position="left"
                    className="bg-secondary shrink-0 z-10"
                  >
                    <Suspense fallback={<LoadingFallback />}>
                      <OrderAndTrades />
                    </Suspense>
                  </ResizablePanelHorizontal>
                </div>

                <ResizablePanel defaultHeight={32} minHeight={15} maxHeight={60}>
                  <BottomTabsSection
                    activeBottomTab={activeBottomTab}
                    setActiveBottomTab={setActiveBottomTab}
                  />
                </ResizablePanel>
              </div>

              <div className="bg-secondary flex-shrink-0 h-full overflow-hidden">
                <Suspense fallback={<LoadingFallback />}>
                  <DydxTradingForm />
                </Suspense>
              </div>
            </div>

            <MobileLayout />
          </div>
        )}

        {view === 'markets' && (
          <div className="flex flex-col flex-1 overflow-auto">
            <MarketsDisplay />
          </div>
        )}

        {view === 'portfolio' && (
          <div className="flex flex-col flex-1 bg-secondary p-3 sm:p-6 overflow-auto">
            <PortfolioView activeTab={activeBottomTab} setActiveTab={setActiveBottomTab} />
          </div>
        )}
      </div>
    </GeolocationGuard>
  );
};

const PortfolioView = ({
  activeTab,
  setActiveTab,
}: {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}) => {
  const { positions, openOrderCount, fillCount, loadingPositions, loadingOrders, loadingFills, lastUpdateTime } =
    useDydxData();

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
  const hasInitializedRef = useRef(false);

  useEffect(() => {
    if (lastUpdateTime === null) {
      hasInitializedRef.current = false;
      setNewCounts({ positions: 0, orders: 0, fills: 0 });
      return;
    }

    if (!hasInitializedRef.current) {
      if (loadingOrders || loadingFills) return;
      prevCountsRef.current = {
        positions: positions.length,
        orders: openOrderCount,
        fills: fillCount,
      };
      hasInitializedRef.current = true;
      return;
    }

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
  }, [positions.length, openOrderCount, fillCount, lastUpdateTime, loadingOrders, loadingFills]);

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

      <div className="flex-1 overflow-auto relative">
        <Suspense fallback={<LoadingFallback />}>
          <div style={{ display: activeTab === 'wallet' ? 'block' : 'none' }} className="p-4">
            <DydxWalletConnect />
          </div>
          <div style={{ display: activeTab === 'positions' ? 'flex' : 'none' }} className="h-full flex-col flex overflow-hidden">
            <PositionsPanel />
          </div>
          <div style={{ display: activeTab === 'orders' ? 'flex' : 'none' }} className="h-full flex-col flex overflow-hidden">
            <OpenOrdersPanel />
          </div>
          <div style={{ display: activeTab === 'fills' ? 'flex' : 'none' }} className="h-full flex-col flex overflow-hidden">
            <FillsPanel />
          </div>
          <div style={{ display: activeTab === 'history' ? 'flex' : 'none' }} className="h-full flex-col flex overflow-hidden">
            <OrderHistoryPanel />
          </div>
          <div style={{ display: activeTab === 'funding' ? 'flex' : 'none' }} className="h-full flex-col flex overflow-hidden">
            <FundingPaymentsPanel />
          </div>
          <div style={{ display: activeTab === 'transfers' ? 'flex' : 'none' }} className="h-full flex-col flex overflow-hidden">
            <TransferHistoryPanel />
          </div>
        </Suspense>
      </div>
    </div>
  );
};

const MobileLayout = () => {
  const [activeTab, setActiveTab] = useState('price');
  const [tradeView, setTradeView] = useState<'split' | 'orderbook' | 'form'>('split');
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
    <div className="lg:hidden flex flex-col flex-1 h-full max-w-[100vw] overflow-hidden">
      <div className="max-w-[100vw] shrink-0">
        <MarketSwitcher />
      </div>
      <div className="flex-1 overflow-hidden bg-secondary flex flex-col">
        <div className="flex-1 overflow-hidden relative">
          <Suspense fallback={<LoadingFallback />}>
            {activeTab === 'price' && (
              <div className="h-full">
                {/* <DyDxTradingChart /> */}
                <TradingChart />
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
              <div className="h-full overflow-hidden">
                <OrderAndTrades />
              </div>
            )}
            {activeTab === 'trade' && (
              <div className="h-full overflow-hidden flex relative">
                <div
                  className={`transition-all duration-300 ease-in-out border-r border-color overflow-hidden flex flex-col ${tradeView === 'split' ? 'w-1/2' : tradeView === 'orderbook' ? 'w-full' : 'w-0'
                    }`}
                >
                  <div className="flex-1 relative overflow-hidden group">
                    <Orderbook />
                    {tradeView === 'split' ? (
                      <button
                        onClick={() => setTradeView('orderbook')}
                        className="absolute top-1 right-1 p-1 bg-secondary/90 backdrop-blur rounded shadow-sm border border-color z-50 text-muted hover:text-primary transition-colors"
                        title="Expand Orderbook"
                      >
                        <Maximize2 className="w-3.5 h-3.5" />
                      </button>
                    ) : tradeView === 'orderbook' ? (
                      <button
                        onClick={() => setTradeView('split')}
                        className="absolute top-1 right-1 p-1 bg-secondary/90 backdrop-blur rounded shadow-sm border border-color z-50 text-muted hover:text-primary transition-colors"
                        title="Split View"
                      >
                        <Minimize2 className="w-3.5 h-3.5" />
                      </button>
                    ) : null}
                  </div>
                </div>
                <div
                  className={`transition-all duration-300 ease-in-out overflow-hidden flex flex-col ${tradeView === 'split' ? 'w-1/2' : tradeView === 'form' ? 'w-full' : 'w-0'
                    }`}
                >
                  <div className="flex-1 relative overflow-hidden group">
                    <DydxTradingForm />
                    {tradeView === 'split' ? (
                      <button
                        onClick={() => setTradeView('form')}
                        className="absolute top-1 left-1 p-1 bg-secondary/90 backdrop-blur rounded shadow-sm border border-color z-50 text-muted hover:text-primary transition-colors"
                        title="Expand Form"
                      >
                        <Maximize2 className="w-3.5 h-3.5" />
                      </button>
                    ) : tradeView === 'form' ? (
                      <button
                        onClick={() => setTradeView('split')}
                        className="absolute top-1 left-1 p-1 bg-secondary/90 backdrop-blur rounded shadow-sm border border-color z-50 text-muted hover:text-primary transition-colors"
                        title="Split View"
                      >
                        <Minimize2 className="w-3.5 h-3.5" />
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            )}
            {activeTab === 'portfolio' && (
              <div className="h-full overflow-auto">
                <MobilePortfolio />
              </div>
            )}
          </Suspense>
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

  const { positions, openOrderCount, fillCount, loadingPositions, loadingOrders, loadingFills, lastUpdateTime } =
    useDydxData();

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
  const hasInitializedRef = useRef(false);

  useEffect(() => {
    if (lastUpdateTime === null) {
      hasInitializedRef.current = false;
      setNewCounts({ positions: 0, orders: 0, fills: 0 });
      return;
    }

    if (!hasInitializedRef.current) {
      if (loadingOrders || loadingFills) return;
      prevCountsRef.current = {
        positions: positions.length,
        orders: openOrderCount,
        fills: fillCount,
      };
      hasInitializedRef.current = true;
      return;
    }

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
  }, [positions.length, openOrderCount, fillCount, lastUpdateTime, loadingOrders, loadingFills]);

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

      <div className="flex-1 overflow-auto relative">
        <Suspense fallback={<LoadingFallback />}>
          <div style={{ display: activeTab === 'wallet' ? 'block' : 'none' }} className="p-4">
            <DydxWalletConnect />
          </div>
          <div style={{ display: activeTab === 'positions' ? 'flex' : 'none' }} className="h-full flex-col flex overflow-hidden">
            <PositionsPanel />
          </div>
          <div style={{ display: activeTab === 'orders' ? 'flex' : 'none' }} className="h-full flex-col flex overflow-hidden">
            <OpenOrdersPanel />
          </div>
          <div style={{ display: activeTab === 'fills' ? 'flex' : 'none' }} className="h-full flex-col flex overflow-hidden">
            <FillsPanel />
          </div>
          <div style={{ display: activeTab === 'history' ? 'flex' : 'none' }} className="h-full flex-col flex overflow-hidden">
            <OrderHistoryPanel />
          </div>
          <div style={{ display: activeTab === 'funding' ? 'flex' : 'none' }} className="h-full flex-col flex overflow-hidden">
            <FundingPaymentsPanel />
          </div>
        </Suspense>
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
  const { positions, openOrderCount, fillCount, loadingPositions, loadingOrders, loadingFills, lastUpdateTime } =
    useDydxData();

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
  const hasInitializedRef = useRef(false);

  useEffect(() => {
    if (lastUpdateTime === null) {
      hasInitializedRef.current = false;
      setNewCounts({ positions: 0, orders: 0, fills: 0 });
      return;
    }

    if (!hasInitializedRef.current) {
      if (loadingOrders || loadingFills) return;
      prevCountsRef.current = {
        positions: positions.length,
        orders: openOrderCount,
        fills: fillCount,
      };
      hasInitializedRef.current = true;
      return;
    }

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
  }, [positions.length, openOrderCount, fillCount, lastUpdateTime, loadingOrders, loadingFills]);

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
        <Suspense fallback={<LoadingFallback />}>
          <div style={{ display: activeBottomTab === 'positions' ? 'flex' : 'none' }} className="h-full flex-col flex overflow-hidden">
            <PositionsPanel />
          </div>
          <div style={{ display: activeBottomTab === 'orders' ? 'flex' : 'none' }} className="h-full flex-col flex overflow-hidden">
            <OpenOrdersPanel />
          </div>
          <div style={{ display: activeBottomTab === 'fills' ? 'flex' : 'none' }} className="h-full flex-col flex overflow-hidden">
            <FillsPanel />
          </div>
          <div style={{ display: activeBottomTab === 'history' ? 'flex' : 'none' }} className="h-full flex-col flex overflow-hidden">
            <OrderHistoryPanel />
          </div>
          <div style={{ display: activeBottomTab === 'funding' ? 'flex' : 'none' }} className="h-full flex-col flex overflow-hidden">
            <FundingPaymentsPanel />
          </div>
          <div style={{ display: activeBottomTab === 'transfer' ? 'flex' : 'none' }} className="h-full flex-col flex overflow-hidden">
            <TransferHistoryPanel />
          </div>
        </Suspense>
      </div>
    </>
  );
};

export default TradingintrFace;
