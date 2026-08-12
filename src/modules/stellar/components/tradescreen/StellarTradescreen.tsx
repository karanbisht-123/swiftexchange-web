import { ArrowLeftRight, BookOpen, Gift, Wallet } from 'lucide-react';
import { Suspense, lazy, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { StellarActivationBanner } from '../../../walletconnect/components/StellarActivationBanner';
import { WalletType } from '../../../walletconnect/constants/Wallet';
import { useWalletConnect } from '../../../walletconnect/hooks/useWalletConnect';
import { TradeTransactionService } from '../../service/tradeTransactionService';
import { useAmmSwapStore } from '../../store/ammSwapStore';
import ClaimableBalanceModal from '../modals/ClaimableBalanceModal';
import { StellarTickerBar } from './StellarTickerBar';

const AmmSwapUI = lazy(() => import('../amm/AmmSwapUI'));
const OrderBookSwapUI = lazy(() => import('../orderbook/OrderBookSwapUI'));
const AssetManager = lazy(() => import('../stellarassets/AssetManager'));
const StellarPortfolioUI = lazy(() => import('../stellarassets/StellarPortfolioUI'));
const TradeTransactionUI = lazy(() => import('../TradeTransactionUI'));

const StellarTradeScreen = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { connectedWallets } = useWalletConnect();
  const stellarWallet = connectedWallets[WalletType.STELLAR];
  const [activeTab, setActiveTab] = useState<'amm' | 'orderbook' | 'assets' | 'portfolio'>(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    if (tab === 'amm' || tab === 'orderbook' || tab === 'assets' || tab === 'portfolio') {
      return tab as 'amm' | 'orderbook' | 'assets' | 'portfolio';
    }
    return 'amm';
  });
  const [showClaimModal, setShowClaimModal] = useState(false);
  const [hasCheckedClaims, setHasCheckedClaims] = useState(false);
  const { setPreSelectedToken } = useAmmSwapStore();

  useEffect(() => {
    if (location.state?.selectedAsset && location.state?.fromTradeButton) {
      const asset = location.state.selectedAsset as { symbol: string; issuer?: string };
      setPreSelectedToken({
        code: asset.symbol,
        issuer: asset.issuer,
      });
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, location.pathname, navigate, setPreSelectedToken]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tab = params.get('tab');
    if (tab === 'amm' || tab === 'orderbook' || tab === 'assets' || tab === 'portfolio') {
      setActiveTab(tab as 'amm' | 'orderbook' | 'assets' | 'portfolio');
    }
  }, [location]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('tab') !== activeTab) {
      if (activeTab === 'portfolio' || activeTab === 'assets') {
        // Strip out unnecessary trading params (like sellAsset, buyAsset) for clean URLs
        navigate({ search: `?tab=${activeTab}` }, { replace: true });
      } else {
        // Preserve trading params for amm and orderbook
        params.set('tab', activeTab);
        navigate({ search: params.toString() }, { replace: true });
      }
    }
  }, [activeTab, navigate, location.search]);

  useEffect(() => {
    if (!stellarWallet?.address || hasCheckedClaims) return;

    const checkClaims = async () => {
      const service = new TradeTransactionService();
      try {
        const claims = await service.getClaimableBalances(stellarWallet.address);
        if (claims.length > 0) {
          setShowClaimModal(true);
        }
      } catch (err) {
        console.warn('Failed to auto check claims:', err);
      } finally {
        setHasCheckedClaims(true);
      }
    };
    checkClaims();
  }, [stellarWallet?.address, hasCheckedClaims]);

  return (
    <div className="bg-primary max-w-[100vw] lg:p-4 lg:pb-0 min-h-screen overflow-x-hidden relative">
      <StellarActivationBanner className="mb-2" />
      {activeTab !== 'portfolio' && <StellarTickerBar />}
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

      <div className="animate-fade-in pb-18">
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
            {activeTab === 'portfolio' && <StellarPortfolioUI />}
            {activeTab === 'assets' && <AssetManager />}
          </div>
          {activeTab !== 'assets' && activeTab !== 'portfolio' && <TradeTransactionUI />}
        </Suspense>
      </div>

      {/* Desktop Floating Navigation Bar */}
      <div className="hidden md:flex fixed bottom-8 left-1/2 -translate-x-1/2 z-50 bg-secondary/90 backdrop-blur-lg rounded-full shadow-2xl border border-white/10 p-1.5 items-center gap-1">
        <button
          onClick={() => setActiveTab('amm')}
          className={`px-6 py-2.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
            activeTab === 'amm'
              ? 'bg-brand text-white shadow-sm'
              : 'text-muted hover:text-primary hover:bg-white/5'
          }`}
        >
          AMM Swap
        </button>
        <button
          onClick={() => setActiveTab('orderbook')}
          className={`px-6 py-2.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
            activeTab === 'orderbook'
              ? 'bg-brand text-white shadow-sm'
              : 'text-muted hover:text-primary hover:bg-white/5'
          }`}
        >
          Order Book
        </button>
        <button
          onClick={() => setActiveTab('portfolio')}
          className={`px-6 py-2.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
            activeTab === 'portfolio'
              ? 'bg-brand text-white shadow-sm'
              : 'text-muted hover:text-primary hover:bg-white/5'
          }`}
        >
          Portfolio
        </button>
        <button
          onClick={() => setActiveTab('assets')}
          className={`px-6 py-2.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
            activeTab === 'assets'
              ? 'bg-brand text-white shadow-sm'
              : 'text-muted hover:text-primary hover:bg-white/5'
          }`}
        >
          Assets
        </button>
        {stellarWallet?.address && (
          <button
            onClick={() => setShowClaimModal(true)}
            className="flex items-center gap-1.5 px-6 py-2.5 rounded-full bg-pink-500 text-white shadow-lg shadow-pink-500/20 hover:bg-pink-600 active:scale-95 transition-all text-xs font-bold uppercase tracking-wider cursor-pointer"
          >
            <Gift className="w-3.5 h-3.5 animate-shake" />
            <span>Claims</span>
          </button>
        )}
      </div>

      {/* Mobile Edge-to-edge Navigation Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 md:hidden border-t border-white/10 bg-secondary/95 backdrop-blur-lg px-4 py-2 pb-safe">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveTab('amm')}
            className="flex-1 flex flex-col items-center justify-center gap-1.5 py-2 rounded-xl transition-all"
          >
            <span
              className={`flex items-center justify-center w-9 h-7 rounded-md transition-colors ${activeTab === 'amm' ? 'bg-brand text-white' : 'text-muted'}`}
            >
              <ArrowLeftRight className="w-5 h-5" />
            </span>
            <span
              className={`text-[10px] font-medium leading-none transition-colors ${activeTab === 'amm' ? 'text-brand' : 'text-muted'}`}
            >
              Swap
            </span>
          </button>
          <button
            onClick={() => setActiveTab('orderbook')}
            className="flex-1 flex flex-col items-center justify-center gap-1.5 py-2 rounded-xl transition-all"
          >
            <span
              className={`flex items-center justify-center w-9 h-7 rounded-md transition-colors ${activeTab === 'orderbook' ? 'bg-brand text-white' : 'text-muted'}`}
            >
              <BookOpen className="w-5 h-5" />
            </span>
            <span
              className={`text-[10px] font-medium leading-none transition-colors ${activeTab === 'orderbook' ? 'text-brand' : 'text-muted'}`}
            >
              Trade
            </span>
          </button>
          <button
            onClick={() => setActiveTab('portfolio')}
            className="flex-1 flex flex-col items-center justify-center gap-1.5 py-2 rounded-xl transition-all"
          >
            <span
              className={`flex items-center justify-center w-9 h-7 rounded-md transition-colors ${activeTab === 'portfolio' ? 'bg-brand text-white' : 'text-muted'}`}
            >
              <Wallet className="w-5 h-5" />
            </span>
            <span
              className={`text-[10px] font-medium leading-none transition-colors ${activeTab === 'portfolio' ? 'text-brand' : 'text-muted'}`}
            >
              Portfolio
            </span>
          </button>
          <button
            onClick={() => setActiveTab('assets')}
            className="flex-1 flex flex-col items-center justify-center gap-1.5 py-2 rounded-xl transition-all"
          >
            <span
              className={`flex items-center justify-center w-9 h-7 rounded-md transition-colors ${activeTab === 'assets' ? 'bg-brand text-white' : 'text-muted'}`}
            >
              <Wallet className="w-5 h-5" />
            </span>
            <span
              className={`text-[10px] font-medium leading-none transition-colors ${activeTab === 'assets' ? 'text-brand' : 'text-muted'}`}
            >
              Assets
            </span>
          </button>
          {stellarWallet?.address && (
            <button
              onClick={() => setShowClaimModal(true)}
              className="flex-1 flex flex-col items-center justify-center gap-1.5 py-2 rounded-xl transition-all text-pink-500 hover:text-pink-400"
            >
              <span className="flex items-center justify-center w-9 h-7 rounded-md bg-pink-500/10 hover:bg-pink-500/20">
                <Gift className="w-5 h-5 animate-shake" />
              </span>
              <span className="text-[10px] font-medium leading-none">Claims</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default StellarTradeScreen;
