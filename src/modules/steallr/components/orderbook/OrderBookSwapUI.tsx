import { AlertCircle, CheckCircle, RefreshCw, X, ChevronDown, ArrowUpDown } from 'lucide-react';
import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { WalletType } from '../../../walletconnect/constants/Wallet';
import { useWalletConnect } from '../../../walletconnect/hooks/useWalletConnect';
import { ERROR_MESSAGES, SUCCESS_MESSAGES } from '../../constants/orderBookSwapConstants';
import { useLargeOrder } from '../../hook/useOrderBookSwap';
import { useAmmSwapStore } from '../../store/ammSwapStore';
import { useLargeOrderStore } from '../../store/orderBookSwapStore';
import OrderBook from './OrderBook';
import { useWalletStore } from '../../../walletconnect/store/walletConnectStore';
import { useTransactionModalStore } from '../../../../store/transactionModalStore';
import StellarAssetSelectorModal from '../modals/StellarAssetSelectorModal';
import { getTokenIcon } from '../../../evm/utils/ChainUrlHelpers';
import { getChainById } from '../../../evm/utils/Chainregistry';
import { portfolioUtils } from '../../../walletconnect/utils/portfolioUtils';

const StellarTradingChart = lazy(() => import('../chart/StellarTradingChart'));
const LastTrades = lazy(() => import('../tradescreen/LastTrades'));

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}

const OrderBookSwapUI = () => {
  const [orderStatus, setOrderStatus] = useState<'pending' | 'success' | 'error' | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'orderBook' | 'trades'>('overview');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectingAssetFor, setSelectingAssetFor] = useState<'from' | 'to' | null>(null);
  const [orderRateType, setOrderRateType] = useState<'limit' | 'market'>('limit');

  const pushToast = useCallback((message: string, type: Toast['type'] = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);

  const { connectedWallets, getProvider, openModal } = useWalletConnect();
  const currentNetwork = useWalletStore(state => state.network);
  const stellarWallet = connectedWallets[WalletType.STELLAR];
  const stellarAddress = stellarWallet?.address || '';

  const {
    isBuy,
    fromToken,
    toToken,
    amount,
    price,
    total,
    quote,
    isLoading,
    error,
    orderBook,
    availableTokens,
    setIsBuy,
    setFromToken,
    setToToken,
    setAmount,
    setPrice,
    setMaxAmount,
    buildTransaction,
    executeOrderWithWalletConnect,
    refreshOrderBook,
    reset,
    subentryCount,
  } = useLargeOrder({ userAddress: stellarAddress });

  useEffect(() => {
    if (orderRateType === 'market' && orderBook) {
      const bestPrice = isBuy
        ? (orderBook.asks?.[0]?.price || '')
        : (orderBook.bids?.[0]?.price || '');
      if (bestPrice) setPrice(bestPrice);
    }
  }, [orderRateType, orderBook, isBuy, setPrice]);

  const handleRateTypeChange = (type: 'limit' | 'market') => {
    setOrderRateType(type);
    if (type === 'market') {
      const bestPrice = isBuy
        ? (orderBook?.asks?.[0]?.price || '')
        : (orderBook?.bids?.[0]?.price || '');
      if (bestPrice) setPrice(bestPrice);
    } else {
      setPrice('');
    }
  };

  const { addTransaction } = useLargeOrderStore();
  const { setSelectedChartPair } = useAmmSwapStore();
  const isMainnet = currentNetwork === 'mainnet';
  const stellarChainId = isMainnet ? 'pubnet' : 'testnet';
  const chainConfig = getChainById(stellarChainId);
  const lastChartPairRef = useRef<string>('');

  useEffect(() => {
    if (!fromToken || !toToken) return;
    const pairId = `${fromToken.code}:${fromToken.issuer}-${toToken.code}:${toToken.issuer}`;
    if (lastChartPairRef.current !== pairId) {
      lastChartPairRef.current = pairId;
      setSelectedChartPair({
        base: fromToken.code,
        counter: toToken.code,
        baseIssuer: fromToken.issuer,
        counterIssuer: toToken.issuer,
      });
    }
    const newParams = new URLSearchParams(searchParams);
    let needsUpdate = false;
    if (newParams.get('sellAsset') !== fromToken.code) { newParams.set('sellAsset', fromToken.code); needsUpdate = true; }
    if (newParams.get('buyAsset') !== toToken.code) { newParams.set('buyAsset', toToken.code); needsUpdate = true; }
    if (needsUpdate) setSearchParams(newParams, { replace: true });
  }, [fromToken?.code, fromToken?.issuer, toToken?.code, toToken?.issuer, setSelectedChartPair]);

  useEffect(() => {
    if (availableTokens.length === 0) return;
    const sellAsset = searchParams.get('sellAsset');
    const buyAsset = searchParams.get('buyAsset');
    if (sellAsset && sellAsset !== fromToken?.code) {
      const token = availableTokens.find(t => t.code === sellAsset);
      if (token) setFromToken(token);
    }
    if (buyAsset && buyAsset !== toToken?.code) {
      const token = availableTokens.find(t => t.code === buyAsset);
      if (token) setToToken(token);
    }
  }, [availableTokens, searchParams, fromToken?.code, toToken?.code]);

  const handlePlaceOrder = useCallback(async () => {
    if (!fromToken || !toToken || !amount || !price) {
      setErrorMessage('Please fill in all required fields');
      setOrderStatus('error');
      return;
    }
    if (!stellarWallet) {
      setErrorMessage('Please connect your Stellar wallet first');
      setOrderStatus('error');
      return;
    }
    if (parseFloat(amount) <= 0 || parseFloat(price) <= 0) {
      setErrorMessage('Amount and price must be greater than 0');
      setOrderStatus('error');
      return;
    }

    setOrderStatus('pending');
    setErrorMessage(null);

    try {
      const tx = await buildTransaction();
      const provider = getProvider(WalletType.STELLAR);
      if (!provider) throw new Error('Stellar wallet provider not available');
      const txHash = await executeOrderWithWalletConnect(tx, provider);

      useTransactionModalStore.getState().openModal({
        status: 'success',
        type: 'Order',
        hash: txHash,
        isStellar: true,
      });

      setOrderStatus('success');
      refreshOrderBook();
      setTimeout(() => { setOrderStatus(null); reset(); }, 3000);
    } catch (err: any) {
      setOrderStatus('error');
      const message = err?.message || ERROR_MESSAGES.ORDER_FAILED;
      setErrorMessage(message);
      useTransactionModalStore.getState().openModal({
        status: 'error',
        type: 'Order',
        error: message,
        isStellar: true,
      });
    }
  }, [fromToken, toToken, amount, price, stellarWallet, buildTransaction, getProvider, executeOrderWithWalletConnect, addTransaction, refreshOrderBook, reset, pushToast]);

  const canPlaceOrder = amount && parseFloat(amount) > 0 && price && parseFloat(price) > 0 && !isLoading && quote && stellarWallet;
  const fromBalance = fromToken?.balance ? parseFloat(fromToken.balance).toFixed(4) : '0.00';
  const toBalance = toToken?.balance ? parseFloat(toToken.balance).toFixed(4) : '0.00';

  if (!stellarWallet) {
    return (
      <div className="bg-secondary lg:rounded-xl p-6 h-full flex items-center justify-center">
        <div className="w-full max-w-lg text-center space-y-4">
          <AlertCircle className="w-14 h-14 text-warning mx-auto" />
          <h4 className="text-lg font-semibold text-primary">Stellar Wallet Not Connected</h4>
          <p className="text-muted text-sm">Please connect your Stellar wallet to start trading</p>
          <button onClick={openModal} className="btn btn-primary btn-lg w-full font-semibold mt-4">Connect Wallet</button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium pointer-events-auto
              ${t.type === 'success' ? 'bg-green-500/15 border-green-500/30 text-green-400' : ''}
              ${t.type === 'error' ? 'bg-red-500/15 border-red-500/30 text-red-400' : ''}
              ${t.type === 'info' ? 'bg-white/10 border-white/15 text-text-primary' : ''}
            `}
            style={{ animation: 'toast-in 0.25s ease' }}
          >
            {t.type === 'success' && <CheckCircle className="w-4 h-4 shrink-0" />}
            {t.type === 'error' && <AlertCircle className="w-4 h-4 shrink-0" />}
            <span>{t.message}</span>
            <button onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))} className="ml-2 opacity-60 hover:opacity-100">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      <style>{`
        @keyframes toast-in {
          from { opacity: 0; transform: translateX(16px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>


      <div className="flex sm:hidden bg-secondary border border-color lg:rounded-xl overflow-hidden mb-1 lg:mb-4">
        {(['overview', 'orderBook', 'trades'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${activeTab === tab ? 'text-primary bg-primary/5' : 'text-muted'}`}
          >
            {tab === 'orderBook' ? 'Book' : tab === 'trades' ? 'Trades' : 'Chart'}
          </button>
        ))}
      </div>


      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-1 lg:gap-4 items-stretch">

        <div
          className={`bg-secondary lg:rounded-xl overflow-hidden border border-color h-[260px] lg:h-auto lg:min-h-[400px] max-h-[500px] ${activeTab === 'overview' ? 'block' : 'hidden lg:block'
            }`}
        >
          <Suspense fallback={
            <div className="w-full h-full flex items-center justify-center bg-secondary">
              <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
            </div>
          }>
            <StellarTradingChart />
          </Suspense>
        </div>
        <div
          className={`bg-secondary lg:rounded-xl border border-color overflow-hidden h-[440px] max-h-[500px] lg:h-auto lg:min-h-0 ${activeTab === 'trades' ? 'block' : 'hidden lg:block'
            }`}
        >
          <Suspense fallback={
            <div className="w-full h-full flex items-center justify-center bg-secondary">
              <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
            </div>
          }>
            <LastTrades baseAsset={fromToken || undefined} counterAsset={toToken || undefined} />
          </Suspense>
        </div>

        <div
          className={`bg-secondary lg:rounded-xl border border-color p-3 lg:p-5 ${activeTab === 'overview' ? 'block' : 'hidden lg:block'
            }`}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <h2 className="text-sm lg:text-lg font-semibold text-primary">Order Trade</h2>
              <div className="flex gap-0.5 bg-white/5 p-1 rounded-md border border-white/5">
                {(['limit', 'market'] as const).map(type => (
                  <button
                    key={type}
                    onClick={() => handleRateTypeChange(type)}
                    disabled={isLoading}
                    className={`px-2 py-0.5 rounded-sm text-[9px] lg:text-[10px] font-bold uppercase tracking-wider transition-all ${orderRateType === type
                      ? 'bg-brand text-white border border-white/5'
                      : 'text-muted'
                      }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>
            <button onClick={refreshOrderBook} className="p-1.5 rounded-lg hover:bg-hover transition-colors" disabled={isLoading}>
              <RefreshCw className={`w-3.5 h-3.5 text-muted ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="flex gap-1 bg-white/5 p-1 rounded-xl border border-white/5 mb-4">
            <button
              onClick={() => !isBuy && setIsBuy()}
              disabled={isLoading}
              className={`flex-1 py-3 lg:py-3.5 rounded-lg text-sm font-bold uppercase tracking-wider transition-all ${isBuy
                ? 'bg-green-500 text-white shadow-sm'
                : 'text-muted hover:text-primary'
                }`}
            >
              Buy
            </button>
            <button
              onClick={() => isBuy && setIsBuy()}
              disabled={isLoading}
              className={`flex-1 py-3 lg:py-3.5 rounded-lg text-sm font-bold uppercase tracking-wider transition-all ${!isBuy
                ? 'bg-red-500 text-white shadow-sm'
                : 'text-muted hover:text-primary'
                }`}
            >
              Sell
            </button>
          </div>

          <div className="bg-white/[0.03] rounded-xl p-2 lg:p-1 border border-white/5 mb-4">
            <div className="flex flex-col md:flex-row items-center">
              <div className="flex-1 w-full p-2.5 lg:p-5">
                <label className="text-[10px] text-muted mb-2 block uppercase tracking-wider font-semibold">From</label>
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => setSelectingAssetFor('from')}
                    className="flex items-center gap-2 bg-secondary/50 p-1.5 rounded-lg border border-divider/50 hover:bg-hover transition-all"
                  >
                    <img
                      key={fromToken?.code ? `${fromToken.code}-${fromToken.issuer || 'native'}` : 'placeholder'}
                      src={fromToken?.icon || getTokenIcon(fromToken?.code || '', chainConfig, fromToken?.issuer) || `https://ui-avatars.com/api/?name=${fromToken?.code || 'S'}&background=random`}
                      alt={fromToken?.code}
                      className="w-8 h-8 lg:w-9 lg:h-9 rounded-full"
                      onError={(e) => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${fromToken?.code || 'S'}&background=random`; }}
                    />
                    <span className="text-primary font-bold text-sm lg:text-base">{fromToken?.code || 'Select'}</span>
                    <ChevronDown size={12} className="text-muted" />
                  </button>
                  <div className="text-right">
                    <p className="text-sm lg:text-lg text-primary font-bold tabular-nums">{fromBalance}</p>
                    <p className="text-[9px] text-muted uppercase font-medium">Balance</p>
                  </div>
                </div>
                <div className="flex justify-between items-center text-[10px] text-muted mt-1.5 px-0.5">
                  <span>Spendable</span>
                  <span className="text-primary tabular-nums">
                    {fromToken?.balance
                      ? portfolioUtils.formatBalance(
                        fromToken.code === 'XLM'
                          ? Math.max(0, parseFloat(fromToken.balance) - (1 + subentryCount * 0.5)).toString()
                          : fromToken.balance
                      )
                      : '0.00'}{' '}
                    {fromToken?.code || ''}
                  </span>
                </div>
              </div>

              <div className="relative z-10 shrink-0 -my-1 md:my-0">
                <button
                  onClick={() => { const t = fromToken; setFromToken(toToken as any); setToToken(t as any); }}
                  className="p-2 rounded-lg bg-secondary hover:bg-hover transition-colors border border-color"
                  disabled={isLoading || !fromToken || !toToken}
                >
                  <ArrowUpDown className="w-4 h-4 text-muted md:rotate-90 transition-transform" />
                </button>
              </div>

              <div className="flex-1 w-full p-2.5 lg:p-5">
                <label className="text-[10px] text-muted mb-2 block uppercase tracking-wider font-semibold">To</label>
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => setSelectingAssetFor('to')}
                    className="flex items-center gap-2 bg-secondary/50 p-1.5 rounded-lg border border-divider/50 hover:bg-hover transition-all"
                  >
                    <img
                      key={toToken?.code ? `${toToken.code}-${toToken.issuer || 'native'}` : 'placeholder'}
                      src={toToken?.icon || getTokenIcon(toToken?.code || '', chainConfig, toToken?.issuer) || `https://ui-avatars.com/api/?name=${toToken?.code || 'S'}&background=random`}
                      alt={toToken?.code}
                      className="w-8 h-8 lg:w-9 lg:h-9 rounded-full"
                      onError={(e) => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${toToken?.code || 'S'}&background=random`; }}
                    />
                    <span className="text-primary font-bold text-sm lg:text-base">{toToken?.code || 'Select'}</span>
                    <ChevronDown size={12} className="text-muted" />
                  </button>
                  <div className="text-right">
                    <p className="text-sm lg:text-lg text-primary font-bold tabular-nums">{toBalance}</p>
                    <p className="text-[9px] text-muted uppercase font-medium">Balance</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-tertiary rounded-xl p-3 lg:p-4 border border-color">
                <label className="text-[9px] lg:text-[10px] font-black uppercase tracking-[0.1em] text-muted mb-1.5 block">Amount</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={amount}
                  onChange={e => { const v = e.target.value; if (v === '' || /^\d*\.?\d*$/.test(v)) setAmount(v); }}
                  placeholder="0.00"
                  className="w-full bg-transparent border-none p-0 text-primary text-lg lg:text-xl font-black focus:ring-0 focus:outline-none placeholder:text-muted/20"
                  disabled={isLoading}
                />
              </div>
              <div className="bg-tertiary rounded-xl p-3 lg:p-4 border border-color">
                <div className="flex justify-between items-center mb-1.5">
                  <label className="text-[9px] lg:text-[10px] font-black uppercase tracking-[0.1em] text-muted block">Price</label>
                  {orderRateType === 'market' && (
                    <span className="text-[8px] px-1 py-0.5 rounded bg-brand/10 text-brand font-black uppercase tracking-wider">MKT</span>
                  )}
                </div>
                <input
                  type="text"
                  inputMode="decimal"
                  value={orderRateType === 'market' && !price ? 'Market' : price}
                  onChange={e => {
                    if (orderRateType === 'market') return;
                    const v = e.target.value;
                    if (v === '' || /^\d*\.?\d*$/.test(v)) setPrice(v);
                  }}
                  placeholder="0.00"
                  className="w-full bg-transparent border-none p-0 text-primary text-lg lg:text-xl font-black focus:ring-0 focus:outline-none placeholder:text-muted/20 disabled:opacity-60"
                  disabled={isLoading || orderRateType === 'market'}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between mb-1.5">
                <label className="text-[9px] lg:text-[10px] font-black uppercase tracking-[0.1em] text-muted">Total</label>
                <button onClick={setMaxAmount} className="text-[9px] lg:text-[10px] font-black text-brand hover:underline uppercase tracking-widest">Max</button>
              </div>
              <div className="bg-tertiary rounded-xl p-3 lg:p-4 border border-color">
                <span className="text-muted text-lg lg:text-xl font-black tabular-nums">{total || '0.00'}</span>
              </div>
            </div>
          </div>

          {(error || errorMessage) && (
            <div className="mt-3 p-2.5 bg-red-500/10 rounded-lg flex items-start gap-2">
              <AlertCircle className="w-3.5 h-3.5 text-red-500 mt-0.5 shrink-0" />
              <p className="text-xs text-red-500">{error || errorMessage}</p>
            </div>
          )}

          <button
            onClick={handlePlaceOrder}
            disabled={!canPlaceOrder || orderStatus === 'pending'}
            className={`w-full py-3.5 lg:py-4.5 rounded-2xl font-black text-xs uppercase tracking-[0.15em] transition-all mt-4 ${canPlaceOrder && orderStatus !== 'pending'
              ? 'btn btn-primary'
              : 'bg-tertiary text-muted opacity-50 cursor-not-allowed border border-divider'
              }`}
          >
            {orderStatus === 'pending' ? (
              <span className="flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin" />
                Placing...
              </span>
            ) : orderStatus === 'success' ? (
              <span className="flex items-center justify-center gap-2">
                <CheckCircle className="w-4 h-4" />
                {SUCCESS_MESSAGES.ORDER_SUCCESS || 'ORDER PLACED'}
              </span>
            ) : !toToken?.hasTrustline && !toToken?.asset.isNative() ? (
              `ADD TRUSTLINE & ${isBuy ? 'BUY' : 'SELL'}`
            ) : (
              `${isBuy ? 'BUY' : 'SELL'} ${toToken?.code || 'TOKEN'}`
            )}
          </button>
        </div>
        <div
          className={`bg-secondary lg:rounded-xl border border-color p-1 flex flex-col h-[440px] lg:h-auto lg:min-h-0 lg:overflow-hidden overflow-hidden ${activeTab === 'orderBook' ? '' : 'hidden lg:flex'
            }`}
        >
          <OrderBook orderBook={orderBook} setPrice={setPrice} isLoading={isLoading} />
        </div>
      </div>

      <StellarAssetSelectorModal
        isOpen={selectingAssetFor !== null}
        onClose={() => setSelectingAssetFor(null)}
        tokens={availableTokens}
        selectedToken={selectingAssetFor === 'from' ? (fromToken as any) : (toToken as any)}
        onSelect={(token) => {
          if (selectingAssetFor === 'from') setFromToken(token as any);
          else setToToken(token as any);
        }}
        title={`Select ${selectingAssetFor === 'from' ? 'Sell' : 'Buy'} Asset`}
      />
    </>
  );
};

export default OrderBookSwapUI;
