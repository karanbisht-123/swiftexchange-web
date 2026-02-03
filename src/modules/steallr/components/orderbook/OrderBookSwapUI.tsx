import {
  AlertCircle,
  ArrowDownUp,
  CheckCircle,
  RefreshCw,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { WalletType } from '../../../walletconnect/constants/Wallet';
import { useWalletConnect } from '../../../walletconnect/hooks/useWalletConnect';
import { ERROR_MESSAGES, SUCCESS_MESSAGES, UI_STRINGS } from '../../constants/orderBookSwapConstants';
import { useLargeOrder } from '../../hook/useOrderBookSwap';
import { useAmmSwapStore } from '../../store/ammSwapStore';
import { useLargeOrderStore } from '../../store/orderBookSwapStore';
import OrderBook from './OrderBook';
import StellarTradingChart from '../chart/StellarTradingChart';
import LastTrades from '../tradescreen/LastTrades';

const TOKEN_ICONS: Record<string, string> = {
  XLM: 'https://coin-images.coingecko.com/coins/images/100/small/Stellar_symbol_black_RGB.png',
  USDC: 'https://coin-images.coingecko.com/coins/images/6319/small/usdc.png',
  USDT: 'https://coin-images.coingecko.com/coins/images/325/small/Tether.png',
};

const getTokenIcon = (code: string): string | null => {
  return TOKEN_ICONS[code?.toUpperCase()] || null;
};

const OrderBookSwapUI = () => {
  const [orderStatus, setOrderStatus] = useState<'pending' | 'success' | 'error' | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'orderBook' | 'trades'>('overview');

  const { connectedWallets, getProvider, openModal } = useWalletConnect();
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
  } = useLargeOrder({
    userAddress: stellarAddress,
  });

  const { addTransaction } = useLargeOrderStore();
  const { setSelectedChartPair } = useAmmSwapStore();

  useEffect(() => {
    if (fromToken && toToken) {
      setSelectedChartPair({
        base: fromToken.code,
        counter: toToken.code,
        baseIssuer: fromToken.issuer,
        counterIssuer: toToken.issuer,
      });
    }
  }, [fromToken, toToken, setSelectedChartPair]);

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

      addTransaction({
        ...tx,
        status: 'success',
        txHash,
        timestamp: Date.now(),
      });

      setOrderStatus('success');

      setTimeout(() => {
        refreshOrderBook();
      }, 2000);

      setTimeout(() => {
        setOrderStatus(null);
        reset();
      }, 3000);
    } catch (err) {
      setOrderStatus('error');
      const message = err instanceof Error ? err.message : ERROR_MESSAGES.ORDER_FAILED;
      setErrorMessage(message);
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
          <button
            onClick={openModal}
            className="btn btn-primary btn-lg w-full font-semibold mt-4"
          >
            Connect Wallet
          </button>
        </div>
      </div>
    );
  }

  return (
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
          className={`flex-1 p-4 lg:p-6 ${activeTab === 'overview' ? 'block' : 'hidden sm:block'
            }`}
        >
          <div className="mb-6 h-[300px] w-full bg-primary/20 rounded-xl overflow-hidden">
            <StellarTradingChart />
          </div>

          <div className="flex items-center justify-between mb-6">
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
                <label className="text-xs text-muted mb-3 block uppercase tracking-wider font-semibold">From</label>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {getTokenIcon(fromToken?.code || '') ? (
                      <img
                        src={getTokenIcon(fromToken?.code || '')!}
                        alt={fromToken?.code}
                        className="w-10 h-10 rounded-full"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-sm font-bold text-white">
                        {fromToken?.code?.[0] || '?'}
                      </div>
                    )}
                    <select
                      value={fromToken?.code || ''}
                      onChange={e => {
                        const selected = availableTokens.find(t => t.code === e.target.value);
                        if (selected && selected.code !== toToken?.code) {
                          setFromToken(selected);
                        }
                      }}
                      className="bg-transparent text-primary font-bold text-xl focus:outline-none cursor-pointer"
                      disabled={isLoading}
                    >
                      <option value="">Select</option>
                      {availableTokens.map(token => (
                        <option
                          key={`${token.code}-${token.issuer || 'native'}`}
                          value={token.code}
                          disabled={token.code === toToken?.code}
                        >
                          {token.code}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="text-right">
                    <p className="text-lg text-primary font-bold">{fromBalance}</p>
                    <p className="text-[10px] text-muted uppercase font-medium">Balance</p>
                  </div>
                </div>
              </div>

              <div className="relative z-10 shrink-0 -my-3 md:my-0">
                <button
                  onClick={() => {
                    const temp = fromToken;
                    setFromToken(toToken);
                    setToToken(temp);
                  }}
                  className="p-3 rounded-xl bg-secondary hover:bg-hover transition-colors border border-white/10 shadow-lg"
                  disabled={isLoading || !fromToken || !toToken}
                >
                  <ArrowDownUp className="w-5 h-5 text-muted md:rotate-90 transition-transform" />
                </button>
              </div>

              <div className="flex-1 w-full p-6">
                <label className="text-xs text-muted mb-3 block uppercase tracking-wider font-semibold">To</label>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {getTokenIcon(toToken?.code || '') ? (
                      <img
                        src={getTokenIcon(toToken?.code || '')!}
                        alt={toToken?.code}
                        className="w-10 h-10 rounded-full"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-sm font-bold text-white">
                        {toToken?.code?.[0] || '?'}
                      </div>
                    )}
                    <select
                      value={toToken?.code || ''}
                      onChange={e => {
                        const selected = availableTokens.find(t => t.code === e.target.value);
                        if (selected && selected.code !== fromToken?.code) {
                          setToToken(selected);
                        }
                      }}
                      className="bg-transparent text-primary font-bold text-xl focus:outline-none cursor-pointer"
                      disabled={isLoading}
                    >
                      <option value="">Select</option>
                      {availableTokens.map(token => (
                        <option
                          key={`${token.code}-${token.issuer || 'native'}`}
                          value={token.code}
                          disabled={token.code === fromToken?.code}
                        >
                          {token.code}
                        </option>
                      ))}
                    </select>
                  </div>
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
              <div>
                <label className="text-xs text-muted mb-2 block">
                  Amount
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-white/5 border border-white/5 rounded-xl px-4 py-4 text-primary text-xl font-medium focus:outline-none focus:border-primary/50"
                    step="0.0000001"
                    disabled={isLoading}
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-muted mb-2 block uppercase tracking-wider font-semibold">
                  Price
                </label>
                <input
                  type="number"
                  value={price}
                  onChange={e => setPrice(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-white/5 border border-white/5 rounded-xl px-4 py-4 text-primary text-xl font-medium focus:outline-none focus:border-primary/50"
                  step="0.0000001"
                  disabled={isLoading}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between mb-2">
                <label className="text-xs text-muted">Total</label>
                <button onClick={setMaxAmount} className="text-xs text-primary hover:underline uppercase font-bold tracking-wide">Max Available</button>
              </div>
              <input
                type="text"
                value={total || '0.00'}
                readOnly
                className="w-full bg-white/5 border border-white/5 rounded-xl px-4 py-4 text-muted text-xl font-medium cursor-not-allowed"
              />
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
            ) : (
              `${isBuy ? 'Buy' : 'Sell'} ${toToken?.code || 'Token'}`
            )}
          </button>
        </div>
        <div
          className={`lg:w-80 lg:border-l lg:border-white/5 bg-secondary ${activeTab === 'orderBook' ? 'block' : 'hidden sm:block'
            }`}
        >
          <OrderBook orderBook={orderBook} isBuy={isBuy} setPrice={setPrice} />
        </div>

        <div
          className={`lg:hidden bg-secondary ${activeTab === 'trades' ? 'block' : 'hidden'
            }`}
        >
          <LastTrades baseAsset={fromToken || undefined} counterAsset={toToken || undefined} />
        </div>
      </div>
    </div>
  );
};

export default OrderBookSwapUI;