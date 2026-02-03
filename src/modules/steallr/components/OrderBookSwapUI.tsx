import {
  AlertCircle,
  ArrowDownUp,
  CheckCircle,
  RefreshCw,
} from 'lucide-react';
import { useCallback, useState } from 'react';

import { WalletType } from '../../walletconnect/constants/Wallet';
import { useWalletConnect } from '../../walletconnect/hooks/useWalletConnect';
import { ERROR_MESSAGES, SUCCESS_MESSAGES, UI_STRINGS } from '../constants/orderBookSwapConstants';
import { useLargeOrder } from '../hook/useOrderBookSwap';
import { useLargeOrderStore } from '../store/orderBookSwapStore';
import OrderBook from './OrderBook';

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
  const [activeTab, setActiveTab] = useState<'trade' | 'orderBook'>('trade');

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
      <div className="bg-secondary rounded-xl p-6 h-full flex items-center justify-center">
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
    <div className="bg-secondary rounded-xl">
      <div className="flex sm:hidden bg-primary rounded-t-xl">
        <button
          onClick={() => setActiveTab('trade')}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'trade'
            ? 'text-primary bg-secondary rounded-tl-xl'
            : 'text-muted hover:text-primary'
            }`}
        >
          Trade
        </button>
        <button
          onClick={() => setActiveTab('orderBook')}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'orderBook'
            ? 'text-primary bg-secondary rounded-tr-xl'
            : 'text-muted hover:text-primary'
            }`}
        >
          Order Book
        </button>
      </div>

      <div className="flex flex-col lg:flex-row">
        <div
          className={`flex-1 p-4 lg:p-6 ${activeTab === 'trade' ? 'block' : 'hidden sm:block'
            }`}
        >
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
              className={`flex-1 py-3 rounded-lg font-medium text-sm transition-all ${isBuy
                ? 'bg-green-500 text-white'
                : 'bg-gray-600/20 text-muted hover:text-primary'
                }`}
              disabled={isLoading}
            >
              Buy
            </button>
            <button
              onClick={() => isBuy && setIsBuy()}
              className={`flex-1 py-3 rounded-lg font-medium text-sm transition-all ${!isBuy
                ? 'bg-red-500 text-white'
                : 'bg-gray-600/20 text-muted hover:text-primary'
                }`}
              disabled={isLoading}
            >
              Sell
            </button>
          </div>

          <div className="space-y-3 mb-4">
            <div className="card">
              <label className="text-xs text-muted mb-3 block">From</label>
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
                    className="bg-transparent text-primary font-semibold text-base focus:outline-none cursor-pointer"
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
                <p className="text-sm text-muted">Balance: {fromBalance}</p>
              </div>
            </div>

            <div className="flex justify-center -my-2 relative z-10">
              <button
                onClick={() => {
                  const temp = fromToken;
                  setFromToken(toToken);
                  setToToken(temp);
                }}
                className="p-2.5 rounded-lg bg-secondary hover:bg-hover transition-colors border-2 border-primary"
                disabled={isLoading || !fromToken || !toToken}
              >
                <ArrowDownUp className="w-5 h-5 text-muted" />
              </button>
            </div>

            <div className="card">
              <label className="text-xs text-muted mb-3 block">To</label>
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
                    className="bg-transparent text-primary font-semibold text-base focus:outline-none cursor-pointer"
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
                <p className="text-sm text-muted">Balance: {toBalance}</p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-xs text-muted mb-2 block">
                {isBuy ? `Amount (${toToken?.code || 'Token'})` : `Amount (${fromToken?.code || 'Token'})`}
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-primary rounded-xl px-4 py-4 lg:py-6 pr-20 text-primary text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                  step="0.0000001"
                  disabled={isLoading}
                />
                <button
                  onClick={setMaxAmount}
                  className="absolute right-2 top-1/2 -translate-y-1/2 py-4 px-8  bg-secondary rounded-md text-xs font-semibold text-muted hover:text-primary transition-colors"
                  disabled={isLoading || !fromToken}
                >
                  MAX
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs text-muted mb-2 block">
                Price ({fromToken?.code || 'Token'} per {toToken?.code || 'Token'})
              </label>
              <input
                type="number"
                value={price}
                onChange={e => setPrice(e.target.value)}
                placeholder="0.00"
                className="w-full bg-primary rounded-md px-4 py-4 lg:py-6 text-primary text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                step="0.0000001"
                disabled={isLoading}
              />
            </div>

            <div>
              <label className="text-xs text-muted mb-2 block">
                Total ({fromToken?.code || 'Token'})
              </label>
              <input
                type="text"
                value={total || '0.00'}
                readOnly
                className="w-full bg-primary rounded-xl px-4 py-4 lg:py-6 text-muted text-base cursor-not-allowed"
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
            className={`w-full mt-6 py-4 rounded-xl font-semibold text-base transition-all ${canPlaceOrder && orderStatus !== 'pending'
              ? isBuy
                ? 'bg-green-500 hover:bg-green-600 text-white shadow-lg hover:shadow-xl'
                : 'bg-red-500 hover:bg-red-600 text-white shadow-lg hover:shadow-xl'
              : 'bg-gray-600/20 text-gray-500 cursor-not-allowed'
              }`}
          >
            {orderStatus === 'pending' ? (
              <span className="flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin" />
                Placing Order...
              </span>
            ) : orderStatus === 'success' ? (
              <span className="flex items-center justify-center gap-2">
                <CheckCircle className="w-5 h-5" />
                {SUCCESS_MESSAGES.ORDER_SUCCESS || 'Order Placed!'}
              </span>
            ) : (
              `${isBuy ? 'Buy' : 'Sell'} ${toToken?.code || 'Token'}`
            )}
          </button>

          <div className="mt-4 text-center">
            <p className="text-xs text-muted">
              Connected: {stellarAddress.slice(0, 6)}...{stellarAddress.slice(-4)}
            </p>
          </div>
        </div>

        <div className={`lg:w-80 lg:border-l border-color ${activeTab === 'orderBook' ? 'block' : 'hidden sm:block'}`}>
          <OrderBook orderBook={orderBook} isBuy={isBuy} setPrice={setPrice} />
        </div>
      </div>
    </div>
  );
};

export default OrderBookSwapUI;