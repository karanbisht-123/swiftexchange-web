import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import TradeAssetModal from '../../../evm/feature/one-tap-pay/TradeAssetModal';
import AmmSwapUI from '../AmmSwapUI';
import OrderBookSwapUI from '../OrderBookSwapUI';
import TradeTransactionUI from '../TradeTransactionUI';
import StellarTradingChart from '../chart/StellarTradingChart';

interface Asset {
  id: string;
  symbol: string;
  name: string;
  image: string;
  balance: number;
  volume: number;
  current_price: number;
  price_change_percentage_24h: number;
  contractAddress?: string;
}

const StellarTradeScreen = () => {
  const [activeTab, setActiveTab] = useState('amm');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const location = useLocation();
  const navigate = useNavigate();

  // Check if user came from asset selection via Trade button
  useEffect(() => {
    if (location.state?.selectedAsset && location.state?.fromTradeButton) {
      setSelectedAsset(location.state.selectedAsset as Asset);
      setIsModalOpen(true);
      // Clear the state after opening modal to prevent re-opening on refresh
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, location.pathname, navigate]);

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedAsset(null);
  };

  return (
    <div className="min-h-screen bg-primary max-w-[100vw] p-2">
      <div className="flex justify-end mb-4">
        <div className="inline-flex rounded-lg border border-color bg-secondary p-1 shadow-sm">
          <button
            onClick={() => setActiveTab('amm')}
            className={`px-6 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'amm'
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
            className={`px-6 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'orderbook'
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
            <div className="lg:col-span-6  rounded-xl">
              <StellarTradingChart />
            </div>

            {/* Swap (30%) */}
            <div className="lg:col-span-4 p-0 m-0">
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
        <div className="space-y-4 max-w-[100vw]">
          {/* Chart - Full Width */}
          <div className="rounded-xl lg:border-none border">
            <StellarTradingChart />
          </div>

          {/* OrderBook Swap UI */}
          <div className="">
            <OrderBookSwapUI />
          </div>

          {/* Transaction History */}
          <div className="">
            <TradeTransactionUI />
          </div>
        </div>
      )}

      {selectedAsset && isModalOpen && (
        <TradeAssetModal
          isOpen={isModalOpen}
          onClose={handleCloseModal}
          assetName={selectedAsset.name}
          selectedAsset={selectedAsset}
        />
      )}
    </div>
  );
};

export default StellarTradeScreen;
