import { AlertCircle, CheckCircle, RefreshCw, X, ChevronDown, ArrowUpDown } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { WalletType } from '../../../walletconnect/constants/Wallet';
import { useWalletConnect } from '../../../walletconnect/hooks/useWalletConnect';
import {
  ERROR_MESSAGES,
  SUCCESS_MESSAGES,
  UI_STRINGS,
} from '../../constants/orderBookSwapConstants';
import { useLargeOrder } from '../../hook/useOrderBookSwap';
import { useAmmSwapStore } from '../../store/ammSwapStore';
import { useLargeOrderStore } from '../../store/orderBookSwapStore';
import StellarTradingChart from '../chart/StellarTradingChart';
import LastTrades from '../tradescreen/LastTrades';
import OrderBook from './OrderBook';
import { addLocalTransaction } from '../../../evm/service/localTransactionService';
import { useWalletStore } from '../../../walletconnect/store/walletConnectStore';
import StellarTransactionModal from '../modals/StellarTransactionModal';
import StellarAssetSelectorModal from '../modals/StellarAssetSelectorModal';

import { getTokenIcon } from '../../../evm/utils/ChainUrlHelpers';
import { getChainById } from '../../../evm/utils/Chainregistry';
import { portfolioUtils } from '../../../walletconnect/utils/portfolioUtils';

// Inline toast
interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}

const OrderBookSwapUI = () => {
  const [orderStatus, setOrderStatus] = useState<'pending' | 'success' | 'error' | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [txModal, setTxModal] = useState<{
    isOpen: boolean;
    status: 'success' | 'error';
    hash?: string;
    error?: string;
  }>({ isOpen: false, status: 'success' });
  const [activeTab, setActiveTab] = useState<'overview' | 'orderBook' | 'trades'>('overview');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectingAssetFor, setSelectingAssetFor] = useState<'from' | 'to' | null>(null);

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
  } = useLargeOrder({
    userAddress: stellarAddress,
  });

  const { addTransaction } = useLargeOrderStore();
  const { setSelectedChartPair } = useAmmSwapStore();

  const isMainnet = currentNetwork === 'mainnet';
  const stellarChainId = isMainnet ? 'pubnet' : 'testnet';
  const chainConfig = getChainById(stellarChainId);

  const lastChartPairRef = useRef<string>('');

  useEffect(() => {
    if (fromToken && toToken) {
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
      if (fromToken) newParams.set('sellAsset', fromToken.code);
      if (toToken) newParams.set('buyAsset', toToken.code);
      setSearchParams(newParams, { replace: true });
    }
  }, [
    fromToken?.code, 
    fromToken?.issuer, 
    toToken?.code, 
    toToken?.issuer, 
    setSelectedChartPair,
    searchParams,
    setSearchParams
  ]);

  useEffect(() => {
    if (availableTokens.length === 0) return;

    const sellAsset = searchParams.get('sellAsset');
    const buyAsset = searchParams.get('buyAsset');

    if (sellAsset) {
      const token = availableTokens.find(t => t.code === sellAsset);
      if (token && token.code !== toToken?.code) setFromToken(token);
    }

    if (buyAsset) {
      const token = availableTokens.find(t => t.code === buyAsset);
      if (token && token.code !== fromToken?.code) setToToken(token);
    }
  }, [availableTokens]);

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

      if (!provider) {
        throw new Error('Stellar wallet provider not available');
      }

      const txHash = await executeOrderWithWalletConnect(tx, provider);

      addLocalTransaction({
        hash: txHash,
        chainId: 'pubnet',
        type: 'orderbook',
        timestamp: Date.now(),
        description: `Limit Order: ${isBuy ? 'Buy' : 'Sell'} ${amount} ${toToken.code} @ ${price} ${fromToken.code}`,
        status: 'success',
        from: stellarAddress,
        network: currentNetwork,
      });

      setTxModal({
        isOpen: true,
        status: 'success',
        hash: txHash,
      });

      setOrderStatus('success');
      refreshOrderBook();

      // No reload or forced timeout here; modal handles navigation
      setTimeout(() => {
        setOrderStatus(null);
        reset();
      }, 3000);
    } catch (err: any) {
      setOrderStatus('error');
      const message = err?.message || ERROR_MESSAGES.ORDER_FAILED;
      setErrorMessage(message);
      setTxModal({
        isOpen: true,
        status: 'error',
        error: message,
      });
      console.error('Order failed:', message);
    }
  }, [
    fromToken,
    toToken,
    amount,
    price,
    stellarWallet,
    buildTransaction,
    getProvider,
    executeOrderWithWalletConnect,
    addTransaction,
    refreshOrderBook,
    reset,
    pushToast,
  ]);

  const canPlaceOrder =
    amount &&
    parseFloat(amount) > 0 &&
    price &&
    parseFloat(price) > 0 &&
    !isLoading &&
    quote &&
    stellarWallet;

  const fromBalance = fromToken?.balance ? parseFloat(fromToken.balance).toFixed(4) : '0.00';
  const toBalance = toToken?.balance ? parseFloat(toToken.balance).toFixed(4) : '0.00';

  if (!stellarWallet) {
    return (
      <div className="bg-secondary lg:rounded-xl p-6 h-full flex items-center justify-center">
        <div className="w-full max-w-lg text-center space-y-4">
          <AlertCircle className="w-16 h-16 text-warning mx-auto" />
          <h4 className="text-lg font-semibold text-primary">Stellar Wallet Not Connected</h4>
          <p className="text-muted text-sm">Please connect your Stellar wallet to start trading</p>
          <button onClick={openModal} className="btn btn-primary btn-lg w-full font-semibold mt-4">
            Connect Wallet
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Toast overlay */}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl border text-sm font-medium pointer-events-auto
              ${t.type === 'success' ? 'bg-green-500/15 border-green-500/30 text-green-400' : ''}
              ${t.type === 'error' ? 'bg-red-500/15 border-red-500/30 text-red-400' : ''}
              ${t.type === 'info' ? 'bg-white/10 border-white/15 text-text-primary' : ''}
            `}
            style={{ animation: 'toast-in 0.25s ease' }}
          >
            {t.type === 'success' && <CheckCircle className="w-4 h-4 shrink-0" />}
            {t.type === 'error' && <AlertCircle className="w-4 h-4 shrink-0" />}
            <span>{t.message}</span>
            <button
              onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
              className="ml-2 opacity-60 hover:opacity-100"
            >
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

      <div className="bg-secondary lg:rounded-xl overflow-hidden shadow-sm">
        <div className="flex sm:hidden bg-secondary border-b border-white/5">
          <button
            onClick={() => setActiveTab('overview')}
            className={`flex-1 py-3 text-sm font-medium transition-colors relative ${activeTab === 'overview' ? 'text-primary' : 'text-muted hover:text-primary'
              }`}
          >
            Overview
            {activeTab === 'overview' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-t-full" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('orderBook')}
            className={`flex-1 py-3 text-sm font-medium transition-colors relative ${activeTab === 'orderBook' ? 'text-primary' : 'text-muted hover:text-primary'
              }`}
          >
            Orderbook
            {activeTab === 'orderBook' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-t-full" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('trades')}
            className={`flex-1 py-3 text-sm font-medium transition-colors relative ${activeTab === 'trades' ? 'text-primary' : 'text-muted hover:text-primary'
              }`}
          >
            Last Trades
            {activeTab === 'trades' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-t-full" />
            )}
          </button>
        </div>

        <div className="flex flex-col lg:flex-row">
          <div
            className={`flex-1 p-4 lg:p-6 ${activeTab === 'overview' ? 'block' : 'hidden sm:block'}`}
          >
            <div className="mb-6 h-[300px] w-full bg-primary/20 rounded-xl overflow-hidden">
              <StellarTradingChart />
            </div>

            <div className="flex items-center justify-between ">
              <h2 className="text-lg font-semibold text-primary">
                {UI_STRINGS.TITLE || 'Limit Order'}
              </h2>
              <button
                onClick={refreshOrderBook}
                className="p-2 rounded-lg hover:bg-hover transition-colors"
                title="Refresh order book"
                disabled={isLoading}
              >
                <RefreshCw className={`w-4 h-4 text-muted ${isLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            <div className="flex gap-2 mb-6">
              <button
                onClick={() => !isBuy && setIsBuy()}
                className={`flex-1 h-16 rounded-xl font-bold text-lg transition-all ${isBuy
                  ? 'bg-green-500 text-white shadow-lg shadow-green-500/20'
                  : 'bg-white/5 text-muted hover:text-primary'
                  }`}
                disabled={isLoading}
              >
                Buy
              </button>
              <button
                onClick={() => isBuy && setIsBuy()}
                className={`flex-1 h-16 rounded-xl font-bold text-lg transition-all ${!isBuy
                  ? 'bg-red-500 text-white shadow-lg shadow-red-500/20'
                  : 'bg-white/5 text-muted hover:text-primary'
                  }`}
                disabled={isLoading}
              >
                Sell
              </button>
            </div>

            <div className="bg-white/5 rounded-2xl p-1 border border-white/5 mb-6">
              <div className="flex flex-col md:flex-row items-center relative">
                <div className="flex-1 w-full p-6">
                  <label className="text-xs text-muted mb-3 block uppercase tracking-wider font-semibold">
                    From
                  </label>
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => setSelectingAssetFor('from')}
                      className="flex items-center gap-3 bg-secondary/50 p-2 rounded-xl border border-divider/50 hover:bg-hover transition-all"
                    >
                      <div className="relative">
                        {(() => {
                          const icon = getTokenIcon(fromToken?.code || '', chainConfig, fromToken?.issuer);
                          return (
                            <img
                              src={icon || `https://ui-avatars.com/api/?name=${fromToken?.code || 'S'}&background=random`}
                              alt={fromToken?.code}
                              className="w-10 h-10 rounded-full"
                            />
                          );
                        })()}
                      </div>
                      <div className="flex flex-col items-start pr-2">
                        <span className="text-primary font-black text-lg">{fromToken?.code || 'Select'}</span>
                        <ChevronDown size={14} className="text-muted" />
                      </div>
                    </button>
                    <div className="text-right">
                      <p className="text-lg text-primary font-bold">{fromBalance}</p>
                      <p className="text-[10px] text-muted uppercase font-medium">Balance</p>
                    </div>
                  </div>
                  <div className="flex justify-between items-center text-xs text-muted mt-2 font-bold px-1">
                    <span>Spendable Balance</span>
                    <span className="text-primary">
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

                <div className="relative z-10 shrink-0 -my-3 md:my-0">
                  <button
                    onClick={() => {
                      const temp = fromToken;
                      setFromToken(toToken as any);
                      setToToken(temp as any);
                    }}
                    className="p-3 rounded-xl bg-secondary hover:bg-hover transition-colors border border-white/10 shadow-lg"
                    disabled={isLoading || !fromToken || !toToken}
                  >
                    <ArrowUpDown className="w-5 h-5 text-muted md:rotate-90 transition-transform" />
                  </button>
                </div>

                <div className="flex-1 w-full p-6">
                  <label className="text-xs text-muted mb-3 block uppercase tracking-wider font-semibold">
                    To
                  </label>
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => setSelectingAssetFor('to')}
                      className="flex items-center gap-3 bg-secondary/50 p-2 rounded-xl border border-divider/50 hover:bg-hover transition-all"
                    >
                      <div className="relative">
                        {(() => {
                          const icon = getTokenIcon(toToken?.code || '', chainConfig, toToken?.issuer);
                          return (
                            <img
                              src={icon || `https://ui-avatars.com/api/?name=${toToken?.code || 'S'}&background=random`}
                              alt={toToken?.code}
                              className="w-10 h-10 rounded-full"
                            />
                          );
                        })()}
                      </div>
                      <div className="flex flex-col items-start pr-2">
                        <span className="text-primary font-black text-lg">{toToken?.code || 'Select'}</span>
                        <ChevronDown size={14} className="text-muted" />
                      </div>
                    </button>
                    <div className="text-right">
                      <p className="text-lg text-primary font-bold">{toBalance}</p>
                      <p className="text-[10px] text-muted uppercase font-medium">Balance</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-tertiary rounded-2xl p-4 border border-divider/50 relative overflow-hidden">
                  <label className="text-[10px] font-black uppercase tracking-[0.1em] text-muted mb-2 block">Amount</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={amount}
                    onChange={e => {
                      const val = e.target.value;
                      if (val === '' || /^\d*\.?\d*$/.test(val)) {
                        setAmount(val);
                      }
                    }}
                    placeholder="0.00"
                    className="peer w-full bg-transparent border-none p-0 text-primary text-xl font-black focus:ring-0 placeholder:text-muted/20 outline-none"
                    disabled={isLoading}
                  />
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-8 bg-brand opacity-0 transition-opacity peer-focus:opacity-100" />
                </div>

                <div className="bg-tertiary rounded-2xl p-4 border border-divider/50 relative overflow-hidden">
                  <label className="text-[10px] font-black uppercase tracking-[0.1em] text-muted mb-2 block">Price</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={price}
                    onChange={e => {
                      const val = e.target.value;
                      if (val === '' || /^\d*\.?\d*$/.test(val)) {
                        setPrice(val);
                      }
                    }}
                    placeholder="0.00"
                    className="peer w-full bg-transparent border-none p-0 text-primary text-xl font-black focus:ring-0 placeholder:text-muted/20 outline-none"
                    disabled={isLoading}
                  />
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-8 bg-brand opacity-0 transition-opacity peer-focus:opacity-100" />
                </div>
              </div>

              <div>
                <div className="flex justify-between mb-2">
                  <label className="text-[10px] font-black uppercase tracking-[0.1em] text-muted">Total</label>
                  <button
                    onClick={setMaxAmount}
                    className="text-[10px] font-black text-brand hover:underline uppercase tracking-widest"
                  >
                    Max Available
                  </button>
                </div>
                <div className="bg-tertiary rounded-2xl p-4 border border-divider/50">
                  <span className="text-muted text-xl font-black">{total || '0.00'}</span>
                </div>
              </div>
            </div>

            {(error || errorMessage) && (
              <div className="mt-4 p-3 bg-red-500/10 rounded-lg flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                <p className="text-sm text-red-500">{error || errorMessage}</p>
              </div>
            )}

            <button
              onClick={handlePlaceOrder}
              disabled={!canPlaceOrder || orderStatus === 'pending'}
              className={`w-full mt-6 py-5 rounded-xl font-bold text-lg transition-all ${canPlaceOrder && orderStatus !== 'pending'
                ? isBuy
                  ? 'bg-green-500 hover:bg-green-600 text-white shadow-xl hover:shadow-2xl hover:-translate-y-0.5'
                  : 'bg-red-500 hover:bg-red-600 text-white shadow-xl hover:shadow-2xl hover:-translate-y-0.5'
                : 'bg-white/5 text-muted cursor-not-allowed border border-white/5'
                }`}
            >
              {orderStatus === 'pending' ? (
                <span className="flex items-center justify-center gap-3">
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  Placing Order...
                </span>
              ) : orderStatus === 'success' ? (
                <span className="flex items-center justify-center gap-3">
                  <CheckCircle className="w-6 h-6" />
                  {SUCCESS_MESSAGES.ORDER_SUCCESS || 'Order Placed!'}
                </span>
              ) : !toToken?.hasTrustline && !toToken?.asset.isNative() ? (
                `Add Trustline & ${isBuy ? 'Buy' : 'Sell'}`
              ) : (
                `${isBuy ? 'Buy' : 'Sell'} ${toToken?.code || 'Token'}`
              )}
            </button>
          </div>

          <div
            className={`lg:w-80 lg:border-l lg:border-white/5 bg-secondary flex flex-col ${activeTab === 'orderBook' || activeTab === 'trades' ? 'block' : 'hidden lg:flex'
              }`}
          >
            {/* Order Book Section */}
            <div className={`${activeTab === 'orderBook' ? 'block' : 'hidden lg:block'} flex-1 min-h-[300px]`}>
              <OrderBook orderBook={orderBook} isBuy={isBuy} setPrice={setPrice} />
            </div>

            {/* Last Trades Section - Visible below Order Book on Desktop */}
            <div className={`lg:border-t lg:border-white/5 ${activeTab === 'trades' ? 'block' : 'hidden lg:block'} lg:h-[400px] overflow-y-auto`}>
              <LastTrades baseAsset={fromToken || undefined} counterAsset={toToken || undefined} />
            </div>
          </div>
        </div>
      </div>

      <StellarTransactionModal
        isOpen={txModal.isOpen}
        onClose={() => setTxModal(prev => ({ ...prev, isOpen: false }))}
        status={txModal.status}
        type="Order"
        hash={txModal.hash}
        error={txModal.error}
      />

      <StellarAssetSelectorModal
        isOpen={selectingAssetFor !== null}
        onClose={() => setSelectingAssetFor(null)}
        tokens={availableTokens}
        selectedToken={selectingAssetFor === 'from' ? (fromToken as any) : (toToken as any)}
        onSelect={(token) => {
          if (selectingAssetFor === 'from') {
            setFromToken(token as any);
          } else {
            setToToken(token as any);
          }
        }}
        title={`Select ${selectingAssetFor === 'from' ? 'Sell' : 'Buy'} Asset`}
      />
    </>
  );
};

export default OrderBookSwapUI;
