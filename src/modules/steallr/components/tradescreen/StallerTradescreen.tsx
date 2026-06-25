import { ArrowLeftRight, BookOpen, Gift, Wallet } from 'lucide-react';
import { useEffect, useState, lazy, Suspense } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import StellarActiveGuard from '../../../walletconnect/components/StellarActiveGuard';
import { useAmmSwapStore } from '../../store/ammSwapStore';
import ClaimableBalanceModal from '../modals/ClaimableBalanceModal';
import { useWalletConnect } from '../../../walletconnect/hooks/useWalletConnect';
import { WalletType } from '../../../walletconnect/constants/Wallet';
import { TradeTransactionService } from '../../service/tradeTransactionService';

const AmmSwapUI = lazy(() => import('../amm/AmmSwapUI'));
const OrderBookSwapUI = lazy(() => import('../orderbook/OrderBookSwapUI'));
const AssetManager = lazy(() => import('../stellarassets/AssetManager'));
const TradeTransactionUI = lazy(() => import('../TradeTransactionUI'));

interface NavigationAsset {
  symbol: string;
  issuer?: string;
}

const StellarTradeScreen = () => {
  const [activeTab, setActiveTab] = useState('amm');
  const [showClaimModal, setShowClaimModal] = useState(false);
  const [hasCheckedClaims, setHasCheckedClaims] = useState(false);
  const { connectedWallets } = useWalletConnect();
  const stellarWallet = connectedWallets[WalletType.STELLAR];
  const loc = useLocation();
  const navigate = useNavigate();
  const { setPreSelectedToken } = useAmmSwapStore();

  useEffect(() => {
    if (loc.state?.selectedAsset && loc.state?.fromTradeButton) {
      const asset = loc.state.selectedAsset as NavigationAsset;
      setPreSelectedToken({
        code: asset.symbol,
        issuer: asset.issuer,
      });
      navigate(loc.pathname, { replace: true, state: {} });
    }
  }, [loc.state, loc.pathname, navigate, setPreSelectedToken]);

  useEffect(() => {
    const checkClaims = async () => {
      if (stellarWallet?.address && !hasCheckedClaims) {
        try {
          const service = new TradeTransactionService();
          const balances = await service.getClaimableBalances(stellarWallet.address);
          if (balances.length > 0) {
            setShowClaimModal(true);
          }
          setHasCheckedClaims(true);
        } catch (err) {
          console.error('Error checking claims:', err);
        }
      }
    };
    checkClaims();
  }, [stellarWallet?.address, hasCheckedClaims]);

  return (
    <StellarActiveGuard>
      <div className="bg-primary max-w-[100vw] lg:p-4 lg:pb-0 h-screen">
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

          <div className="hidden md:inline-flex rounded-lg border border-color bg-secondary p-1">
            <button
              onClick={() => setActiveTab('amm')}
              className={`px-6 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'amm'
                ? 'text-brand'
                : 'text-secondary hover:text-primary hover:bg-tertiary'
                }`}
            >
              AMM Swap
            </button>
            <button
              onClick={() => setActiveTab('orderbook')}
              className={`px-6 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'orderbook'
                ? 'text-brand'
                : 'text-secondary hover:text-primary hover:bg-tertiary'
                }`}
            >
              Order Book
            </button>
            <button
              onClick={() => setActiveTab('assets')}
              className={`px-6 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'assets'
                ? 'text-brand'
                : 'text-secondary hover:text-primary hover:bg-tertiary'
                }`}
            >
              Assets
            </button>
          </div>
        </div>

        <div className="animate-fade-in pb-16 md:pb-0">
          <Suspense
            fallback={
              <div className="w-full h-[400px] flex items-center justify-center bg-secondary lg:rounded-xl border border-color">
                <div className="w-8 h-8 border-4 border-brand border-t-transparent rounded-full animate-spin"></div>
              </div>
            }
          >
            <div className="mb-1 lg:mb-4">
              {activeTab === 'amm' && <AmmSwapUI />}
              {activeTab === 'orderbook' && <OrderBookSwapUI />}
              {activeTab === 'assets' && <AssetManager />}
            </div>
            {activeTab !== 'assets' && <TradeTransactionUI />}
          </Suspense>
        </div>

        <div className="fixed bottom-0 left-0 right-0 z-40 md:hidden border-t border-white/10 bg-secondary/95 backdrop-blur-lg px-4 py-2 pb-safe">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setActiveTab('amm')}
              className="flex-1 flex flex-col items-center justify-center gap-1.5 py-2 rounded-xl transition-all"
            >
              <span className={`flex items-center justify-center w-9 h-7 rounded-md transition-colors ${activeTab === 'amm' ? 'bg-brand text-white' : 'text-muted'}`}>
                <ArrowLeftRight className="w-5 h-5" />
              </span>
              <span className={`text-[10px] font-medium leading-none transition-colors ${activeTab === 'amm' ? 'text-brand' : 'text-muted'}`}>Swap</span>
            </button>
            <button
              onClick={() => setActiveTab('orderbook')}
              className="flex-1 flex flex-col items-center justify-center gap-1.5 py-2 rounded-xl transition-all"
            >
              <span className={`flex items-center justify-center w-9 h-7 rounded-md transition-colors ${activeTab === 'orderbook' ? 'bg-brand text-white' : 'text-muted'}`}>
                <BookOpen className="w-5 h-5" />
              </span>
              <span className={`text-[10px] font-medium leading-none transition-colors ${activeTab === 'orderbook' ? 'text-brand' : 'text-muted'}`}>Trade</span>
            </button>
            <button
              onClick={() => setActiveTab('assets')}
              className="flex-1 flex flex-col items-center justify-center gap-1.5 py-2 rounded-xl transition-all"
            >
              <span className={`flex items-center justify-center w-9 h-7 rounded-md transition-colors ${activeTab === 'assets' ? 'bg-brand text-white' : 'text-muted'}`}>
                <Wallet className="w-5 h-5" />
              </span>
              <span className={`text-[10px] font-medium leading-none transition-colors ${activeTab === 'assets' ? 'text-brand' : 'text-muted'}`}>Assets</span>
            </button>
            <button
              onClick={() => setShowClaimModal(true)}
              className="flex-1 flex flex-col items-center justify-center gap-1.5 py-2 rounded-xl transition-all text-pink-500 hover:text-pink-400"
            >
              <span className="flex items-center justify-center w-9 h-7 rounded-md bg-pink-500/10 hover:bg-pink-500/20">
                <Gift className="w-5 h-5 animate-shake" />
              </span>
              <span className="text-[10px] font-medium leading-none">Claims</span>
            </button>
          </div>
        </div>
      </div>
    </StellarActiveGuard>
  );
};

export default StellarTradeScreen;