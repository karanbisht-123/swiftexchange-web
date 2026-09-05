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
const TradeTransactionUI = lazy(() => import('../TradeTransactionUI'));

const StellarTradeScreen = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { connectedWallets } = useWalletConnect();
  const stellarWallet = connectedWallets[WalletType.STELLAR];
  const [activeTab, setActiveTab] = useState<'amm' | 'orderbook' | 'assets'>(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    if (tab === 'amm' || tab === 'orderbook' || tab === 'assets') {
      return tab as 'amm' | 'orderbook' | 'assets';
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
    if (tab === 'amm' || tab === 'orderbook' || tab === 'assets') {
      setActiveTab(tab as 'amm' | 'orderbook' | 'assets');
    }
  }, [location]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('tab') !== activeTab) {
      if (activeTab === 'assets') {
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
    <div className="bg-[var(--color-bg-primary)] max-w-[100vw] px-3 sm:px-4 md:px-6 py-2 sm:py-4 lg:p-4 lg:pb-0 min-h-screen overflow-x-hidden relative transition-colors">
      <StellarActivationBanner className="mb-2" />
      {activeTab !== 'assets' && <StellarTickerBar />}
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

      <div className="animate-fade-in pb-20">
        <Suspense
          fallback={
            <div className="w-full h-[400px] flex items-center justify-center bg-[var(--color-bg-secondary)] lg:rounded-2xl border border-[var(--color-border)]/60 shadow-xl">
              <div className="w-8 h-8 border-3 border-[var(--color-brand-primary)] border-t-transparent rounded-full animate-spin"></div>
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

      {/* Desktop Floating Web3 Segmented Navigation Dock */}
      <div className="hidden md:flex fixed bottom-8 left-1/2 -translate-x-1/2 z-50 bg-[var(--color-bg-secondary)]/90 backdrop-blur-xl rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] border border-[var(--color-border)]/70 p-1.5 items-center gap-1.5 select-none">
        <button
          onClick={() => setActiveTab('amm')}
          className={`px-5 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
            activeTab === 'amm'
              ? 'bg-[var(--color-brand-primary)] text-white shadow-md shadow-blue-500/25'
              : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)]/70'
          }`}
        >
          AMM Swap
        </button>
        <button
          onClick={() => setActiveTab('orderbook')}
          className={`px-5 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
            activeTab === 'orderbook'
              ? 'bg-[var(--color-brand-primary)] text-white shadow-md shadow-blue-500/25'
              : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)]/70'
          }`}
        >
          Order Book
        </button>

        <button
          onClick={() => setActiveTab('assets')}
          className={`px-5 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
            activeTab === 'assets'
              ? 'bg-[var(--color-brand-primary)] text-white shadow-md shadow-blue-500/25'
              : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)]/70'
          }`}
        >
          Assets
        </button>
        {stellarWallet?.address && (
          <button
            onClick={() => setShowClaimModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-500/15 text-rose-400 border border-rose-500/30 hover:bg-rose-500/25 active:scale-95 transition-all text-xs font-bold uppercase tracking-wider cursor-pointer shadow-xs"
          >
            <Gift className="w-3.5 h-3.5 animate-shake" />
            <span>Claims</span>
          </button>
        )}
      </div>

      {/* Mobile Edge-to-edge Glass Navigation Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 md:hidden border-t border-[var(--color-border)]/60 bg-[var(--color-bg-secondary)]/95 backdrop-blur-xl px-3 py-1.5 pb-safe">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveTab('amm')}
            className="flex-1 flex flex-col items-center justify-center gap-1 py-1.5 rounded-xl transition-all cursor-pointer"
          >
            <span
              className={`flex items-center justify-center w-9 h-7 rounded-lg transition-all ${
                activeTab === 'amm'
                  ? 'bg-[var(--color-brand-primary)] text-white shadow-sm'
                  : 'text-[var(--color-text-secondary)]'
              }`}
            >
              <ArrowLeftRight className="w-4 h-4" />
            </span>
            <span
              className={`text-[10px] font-semibold leading-none transition-colors ${
                activeTab === 'amm'
                  ? 'text-[var(--color-brand-primary)] font-bold'
                  : 'text-[var(--color-text-secondary)]'
              }`}
            >
              Swap
            </span>
          </button>
          <button
            onClick={() => setActiveTab('orderbook')}
            className="flex-1 flex flex-col items-center justify-center gap-1 py-1.5 rounded-xl transition-all cursor-pointer"
          >
            <span
              className={`flex items-center justify-center w-9 h-7 rounded-lg transition-all ${
                activeTab === 'orderbook'
                  ? 'bg-[var(--color-brand-primary)] text-white shadow-sm'
                  : 'text-[var(--color-text-secondary)]'
              }`}
            >
              <BookOpen className="w-4 h-4" />
            </span>
            <span
              className={`text-[10px] font-semibold leading-none transition-colors ${
                activeTab === 'orderbook'
                  ? 'text-[var(--color-brand-primary)] font-bold'
                  : 'text-[var(--color-text-secondary)]'
              }`}
            >
              Trade
            </span>
          </button>

          <button
            onClick={() => setActiveTab('assets')}
            className="flex-1 flex flex-col items-center justify-center gap-1 py-1.5 rounded-xl transition-all cursor-pointer"
          >
            <span
              className={`flex items-center justify-center w-9 h-7 rounded-lg transition-all ${
                activeTab === 'assets'
                  ? 'bg-[var(--color-brand-primary)] text-white shadow-sm'
                  : 'text-[var(--color-text-secondary)]'
              }`}
            >
              <Wallet className="w-4 h-4" />
            </span>
            <span
              className={`text-[10px] font-semibold leading-none transition-colors ${
                activeTab === 'assets'
                  ? 'text-[var(--color-brand-primary)] font-bold'
                  : 'text-[var(--color-text-secondary)]'
              }`}
            >
              Assets
            </span>
          </button>
          {stellarWallet?.address && (
            <button
              onClick={() => setShowClaimModal(true)}
              className="flex-1 flex flex-col items-center justify-center gap-1 py-1.5 rounded-xl transition-all text-rose-400 hover:text-rose-300 cursor-pointer"
            >
              <span className="flex items-center justify-center w-9 h-7 rounded-lg bg-rose-500/15 border border-rose-500/25">
                <Gift className="w-4 h-4 animate-shake" />
              </span>
              <span className="text-[10px] font-semibold leading-none">Claims</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default StellarTradeScreen;
