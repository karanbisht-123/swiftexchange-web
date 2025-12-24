import {
  AlertCircle,
  ArrowDownUp,
  CheckCircle,
  RefreshCw,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { useCallback, useState } from 'react';

import { WalletType } from '../../walletconnect/constants/Wallet';
import { useWalletConnect } from '../../walletconnect/hooks/useWalletConnect';
import { ERROR_MESSAGES, SUCCESS_MESSAGES, UI_STRINGS } from '../constants/orderBookSwapConstants';
import { useLargeOrder } from '../hook/useOrderBookSwap';
import { useLargeOrderStore } from '../store/orderBookSwapStore';
import OrderBook from './OrderBook';

const OrderBookSwapUI = () => {
  const [orderStatus, setOrderStatus] = useState<'pending' | 'success' | 'error' | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'trade' | 'orderBook'>('trade');

  const { connectedWallets, getProvider } = useWalletConnect();
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
      <div className="bg-secondary rounded-xl border lg:border-none p-6 h-full flex items-center justify-center">
        <div className="w-full max-w-lg text-center space-y-4">
          <AlertCircle className="w-16 h-16 text-warning mx-auto" />
          <h4 className="heading-4">Stellar Wallet Not Connected</h4>
          <p className="text-muted">Please connect your Stellar wallet to start trading</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-secondary rounded-xl border lg:border-none p-2 sm:p-6">
      {/* --------- MOBILE TABS --------- */}
      <div className="flex sm:hidden mb-4 border-b border-border">
        <button
          onClick={() => setActiveTab('trade')}
          className={`flex-1 py-2 text-sm font-medium ${
            activeTab === 'trade' ? 'border-b-2 border-brand text-brand' : 'text-muted'
          }`}
        >
          Trade
        </button>
        <button
          onClick={() => setActiveTab('orderBook')}
          className={`flex-1 py-2 text-sm font-medium ${
            activeTab === 'orderBook' ? 'border-b-2 border-brand text-brand' : 'text-muted'
          }`}
        >
          Order Book
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        {/* --------- TRADE PANEL --------- */}
        <div
          className={`flex-1 border-r p-2 sm:p-4 ${
            activeTab === 'trade' ? 'block' : 'hidden sm:block'
          }`}
        >
          {/* --- Header --- */}
          <div className="items-center hidden lg:flex justify-between mb-4">
            <h2 className="heading-4">{UI_STRINGS.TITLE || 'Order Book Trading'}</h2>
            <button
              onClick={refreshOrderBook}
              className="btn btn-ghost p-2"
              title="Refresh order book"
              disabled={isLoading}
            >
              <RefreshCw className="w-5 h-5 text-muted" />
            </button>
          </div>

          {/* --- Buy / Sell Toggle --- */}
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => !isBuy && setIsBuy()}
              className={`btn flex-1 ${isBuy ? 'btn-success' : 'btn-ghost'}`}
              disabled={isLoading}
            >
              <TrendingUp className="w-5 h-5 inline mr-2" /> Buy
            </button>
            <button
              onClick={() => isBuy && setIsBuy()}
              className={`btn flex-1 ${!isBuy ? 'btn-danger' : 'btn-ghost'}`}
              disabled={isLoading}
            >
              <TrendingDown className="w-5 h-5 inline mr-2" /> Sell
            </button>
          </div>

          {/* --- Token Pair with Selectors --- */}
          <div className="card flex items-center justify-center gap-4 p-4">
            <div className="text-center flex-1">
              <select
                value={fromToken?.code || ''}
                onChange={e => {
                  const selected = availableTokens.find(t => t.code === e.target.value);
                  if (selected && selected.code !== toToken?.code) {
                    setFromToken(selected);
                  }
                }}
                className="input input-primary w-full text-sm font-semibold mb-2"
                disabled={isLoading}
              >
                <option value="">Select Token</option>
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
              <div className="text-xs text-muted truncate max-w-[120px] mx-auto">
                {fromToken?.issuer?.slice(0, 8) || 'Native'}...
              </div>
              <div className="text-sm text-muted mt-1">Balance: {fromBalance}</div>
            </div>

            <button
              onClick={() => {
                const temp = fromToken;
                setFromToken(toToken);
                setToToken(temp);
              }}
              className="btn btn-ghost p-2"
              disabled={isLoading || !fromToken || !toToken}
            >
              <ArrowDownUp className="w-6 h-6 text-muted" />
            </button>

            <div className="text-center flex-1">
              <select
                value={toToken?.code || ''}
                onChange={e => {
                  const selected = availableTokens.find(t => t.code === e.target.value);
                  if (selected && selected.code !== fromToken?.code) {
                    setToToken(selected);
                  }
                }}
                className="input input-primary w-full text-sm font-semibold mb-2"
                disabled={isLoading}
              >
                <option value="">Select Token</option>
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
              <div className="text-xs text-muted truncate max-w-[120px] mx-auto">
                {toToken?.issuer?.slice(0, 8) || 'Native'}...
              </div>
              <div className="text-sm text-muted mt-1">Balance: {toBalance}</div>
            </div>
          </div>

          {/* --- Wallet Info --- */}
          <div className="card mt-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted">Connected Account:</span>
              <span className="text-text-accent text-mono">
                {stellarAddress.slice(0, 8)}...{stellarAddress.slice(-6)}
              </span>
            </div>
          </div>

          {/* --- Inputs --- */}
          <div className="card p-4 space-y-4 mt-4">
            {/* Amount */}
            <div>
              <label className="block text-sm font-medium text-muted mb-2">
                {isBuy
                  ? `Amount to Buy (${toToken?.code || 'Token'})`
                  : `Amount to Sell (${fromToken?.code || 'Token'})`}
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="0.0"
                  className="input input-primary flex-1 py-4"
                  step="0.0000001"
                  disabled={isLoading}
                />
                <button
                  onClick={setMaxAmount}
                  className="btn btn-primary"
                  disabled={isLoading || !fromToken}
                >
                  MAX
                </button>
              </div>
            </div>

            {/* Price */}
            <div>
              <label className="block text-sm font-medium text-muted mb-2">
                Price ({fromToken?.code || 'From'} per {toToken?.code || 'To'})
              </label>
              <input
                type="number"
                value={price}
                onChange={e => setPrice(e.target.value)}
                placeholder="0.0"
                className="input input-primary w-full py-4"
                step="0.0000001"
                disabled={isLoading}
              />
            </div>

            {/* Total */}
            <div>
              <label className="block text-sm font-medium text-muted mb-2">
                Total ({fromToken?.code || 'From'})
              </label>
              <input
                type="number"
                value={total}
                readOnly
                className="input w-full cursor-not-allowed py-4"
              />
            </div>
          </div>

          {/* --- Error --- */}
          {(error || errorMessage) && (
            <div className="card bg-danger-light border-danger p-4 mt-4 animate-fade-in">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-danger mt-0.5 flex-shrink-0" />
                <p className="text-sm text-danger">{error || errorMessage}</p>
              </div>
            </div>
          )}

          {/* --- Place Order --- */}
          <button
            onClick={handlePlaceOrder}
            disabled={!canPlaceOrder || orderStatus === 'pending'}
            className={`btn btn-lg w-full mt-4 ${
              canPlaceOrder && orderStatus !== 'pending'
                ? isBuy
                  ? 'btn-success'
                  : 'btn-danger'
                : 'btn-ghost opacity-50'
            }`}
          >
            {orderStatus === 'pending' ? (
              <span className="flex items-center justify-center gap-2">
                <RefreshCw className="w-5 h-5 animate-spin" />
                Placing Order...
              </span>
            ) : orderStatus === 'success' ? (
              <span className="flex items-center justify-center gap-2">
                <CheckCircle className="w-6 h-6" />
                {SUCCESS_MESSAGES.ORDER_SUCCESS || 'Order Placed!'}
              </span>
            ) : (
              UI_STRINGS.PLACE_TRADE || 'Place Order'
            )}
          </button>
        </div>

        {/* --------- ORDER BOOK PANEL --------- */}
        <div className={`flex-1 ${activeTab === 'orderBook' ? 'block' : 'hidden sm:block'}`}>
          <OrderBook orderBook={orderBook} isBuy={isBuy} setPrice={setPrice} />
        </div>
      </div>
    </div>
  );
};

export default OrderBookSwapUI;
