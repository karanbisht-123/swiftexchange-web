import { ArrowLeftRight, BookOpen, Gift, Wallet } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { useAmmSwapStore } from '../../store/ammSwapStore';
import AmmSwapUI from '../amm/AmmSwapUI';
import ClaimableBalanceModal from '../modals/ClaimableBalanceModal';
import OrderBookSwapUI from '../orderbook/OrderBookSwapUI';
import AssetManager from '../stellarassets/AssetManager';
import TradeTransactionUI from '../TradeTransactionUI';

interface NavigationAsset {
  symbol: string;
  issuer?: string;
}

const StellarTradeScreen = () => {
  const [activeTab, setActiveTab] = useState('amm');
  const [showClaimModal, setShowClaimModal] = useState(true);
  const location = useLocation();
  const navigate = useNavigate();
  const { setPreSelectedToken } = useAmmSwapStore();

  useEffect(() => {
    if (location.state?.selectedAsset && location.state?.fromTradeButton) {
      const asset = location.state.selectedAsset as NavigationAsset;
      setPreSelectedToken({
        code: asset.symbol,
        issuer: asset.issuer,
      });
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, location.pathname, navigate, setPreSelectedToken]);

  return (
    <div className="bg-primary max-w-[100vw] lg:p-2 lg:pb-0 h-screen">

      {showClaimModal && <ClaimableBalanceModal onClose={() => setShowClaimModal(false)} />}

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: rotate(5deg); }
          75% { transform: rotate(-5deg); }
        }
        .animate-shake {
          animation: shake 0.5s ease-in-out infinite;
        }
      `}</style>

      <div className="flex justify-end mb-1 gap-2">
        <button
          onClick={() => setShowClaimModal(true)}
          className="hidden md:inline-flex items-center gap-2 px-3 py-2 md:px-4 md:py-2 rounded-lg bg-pink-500/10 text-pink-500 hover:bg-pink-500/20 border border-pink-500/20 transition-all font-medium text-sm group"
        >
          <Gift className="w-5 h-5 md:w-4 md:h-4" />
          <span className="hidden md:inline">Claims</span>
        </button>

        <div className="hidden md:inline-flex rounded-lg border border-color bg-secondary p-1 shadow-sm">
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
          <button
            onClick={() => setActiveTab('assets')}
            className={`px-6 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'assets'
              ? 'text-white shadow-sm'
              : 'text-secondary hover:text-primary hover:bg-tertiary'
              }`}
            style={{
              backgroundColor:
                activeTab === 'assets' ? 'var(--color-brand-primary)' : 'transparent',
            }}
          >
            Assets
          </button>
        </div>
      </div>

      <div className="animate-fade-in">
        <div className="mb-1 lg:mb-4">
          {activeTab === 'amm' && <AmmSwapUI />}
          {activeTab === 'orderbook' && <OrderBookSwapUI />}
          {activeTab === 'assets' && <AssetManager />}
        </div>
        {activeTab !== 'assets' && <TradeTransactionUI />}
      </div>


      <div className="fixed bottom-6 inset-x-4 z-40 md:hidden">
        <div className="bg-secondary/90 backdrop-blur-lg border border-white/10 p-1.5 rounded-2xl shadow-2xl flex items-center gap-1">
          <button
            onClick={() => setActiveTab('amm')}
            className={`flex-1 flex flex-col items-center justify-center gap-1 py-2 rounded-xl transition-all ${activeTab === 'amm'
              ? 'bg-primary text-white shadow-lg'
              : 'text-muted hover:text-text-primary'
              }`}
          >
            <ArrowLeftRight className="w-5 h-5" />
            <span className="text-[10px] font-medium leading-none">Swap</span>
          </button>
          <button
            onClick={() => setActiveTab('orderbook')}
            className={`flex-1 flex flex-col items-center justify-center gap-1 py-2 rounded-xl transition-all ${activeTab === 'orderbook'
              ? 'bg-primary text-white shadow-lg'
              : 'text-muted hover:text-text-primary'
              }`}
          >
            <BookOpen className="w-5 h-5" />
            <span className="text-[10px] font-medium leading-none">Trade</span>
          </button>
          <button
            onClick={() => setActiveTab('assets')}
            className={`flex-1 flex flex-col items-center justify-center gap-1 py-2 rounded-xl transition-all ${activeTab === 'assets'
              ? 'bg-primary text-white shadow-lg'
              : 'text-muted hover:text-text-primary'
              }`}
          >
            <Wallet className="w-5 h-5" />
            <span className="text-[10px] font-medium leading-none">Assets</span>
          </button>
          <button
            onClick={() => setShowClaimModal(true)}
            className="flex-1 flex flex-col items-center justify-center gap-1 py-2 rounded-xl transition-all text-pink-500 hover:text-pink-400 bg-pink-500/10 hover:bg-pink-500/20"
          >
            <Gift className="w-5 h-5 animate-shake" />
            <span className="text-[10px] font-medium leading-none">Claims</span>
          </button>
        </div>
      </div>
    </div >
  );
};

export default StellarTradeScreen;
