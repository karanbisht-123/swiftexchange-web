import {
  AlertCircle,
  ArrowUpDown,
  Check,
  CheckCircle,
  ChevronDown,
  Copy,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { useTransactionModalStore } from '../../../../store/transactionModalStore';
import { getTokenIcon } from '../../../evm/utils/ChainUrlHelpers';
import { getChainById } from '../../../evm/utils/Chainregistry';
import { getStellarConfig } from '../../../walletconnect/config/chains';
import { WalletType } from '../../../walletconnect/constants/Wallet';
import { useWalletConnect } from '../../../walletconnect/hooks/useWalletConnect';
import { useWalletStore } from '../../../walletconnect/store/walletConnectStore';
import { portfolioUtils } from '../../../walletconnect/utils/portfolioUtils';
import { ERROR_MESSAGES, SUCCESS_MESSAGES } from '../../constants/orderBookSwapConstants';
import { useLargeOrder } from '../../hook/useOrderBookSwap';
import { getBinanceSymbol, isFlippedPair } from '../../service/binanceBridgeService';
import { StellarChartService } from '../../service/stellarChartService';
import { useAmmSwapStore } from '../../store/ammSwapStore';
import { useLargeOrderStore } from '../../store/orderBookSwapStore';
import StellarAssetSelectorModal from '../modals/StellarAssetSelectorModal';
import OrderBook from './OrderBook';

const StellarTradingChart = lazy(() => import('../chart/StellarTradingChart'));
const LastTrades = lazy(() => import('../tradescreen/LastTrades'));

const OrderBookSwapUI = () => {
  const [orderStatus, setOrderStatus] = useState<'pending' | 'success' | 'error' | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'orderBook' | 'trades'>('overview');
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectingAssetFor, setSelectingAssetFor] = useState<'from' | 'to' | null>(null);
  const [orderRateType, setOrderRateType] = useState<'limit' | 'market'>('limit');
  const [copied, setCopied] = useState(false);

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
    fetchBalances,
    isRefreshingBalances,
  } = useLargeOrder({ userAddress: stellarAddress });

  const [marketStats, setMarketStats] = useState<{
    lastPrice: string;
    lastPriceUsd: string;
    priceChangePercent: string;
    priceChangePercentRaw: number;
    volume: string;
    volumeUsd: string;
  } | null>(null);

  const binanceActive = useMemo(() => {
    if (!fromToken || !toToken) return false;
    return getBinanceSymbol(fromToken.code, toToken.code) !== null;
  }, [fromToken?.code, toToken?.code]);

  const spreadStats = useMemo(() => {
    const bids = orderBook?.bids || [];
    const asks = orderBook?.asks || [];
    if (bids.length === 0 || asks.length === 0) {
      return { raw: '—', percent: '—' };
    }
    const bestBid = parseFloat(bids[0].price);
    const bestAsk = parseFloat(asks[0].price);
    if (isNaN(bestBid) || isNaN(bestAsk) || bestBid <= 0 || bestAsk <= 0) {
      return { raw: '—', percent: '—' };
    }
    const raw = Math.abs(bestAsk - bestBid);
    const percent = (raw / bestAsk) * 100;
    return {
      raw: raw.toFixed(7),
      percent: percent.toFixed(4) + '%',
    };
  }, [orderBook]);

  const isLowLiquidity = useMemo(() => {
    const bids = orderBook?.bids || [];
    const asks = orderBook?.asks || [];
    const bidsCount = bids.length;
    const asksCount = asks.length;
    const totalBidsVol = bids.reduce((sum: number, b: any) => sum + (parseFloat(b.amount) || 0), 0);
    const totalAsksVol = asks.reduce((sum: number, a: any) => sum + (parseFloat(a.amount) || 0), 0);

    if (isLoading || !orderBook) return false;
    return bidsCount < 5 || asksCount < 5 || (totalBidsVol < 200 && totalAsksVol < 200);
  }, [orderBook, isLoading]);

  useEffect(() => {
    if (!fromToken || !toToken) return;

    let isMounted = true;

    const fetchStats = async () => {
      try {
        const isToNative = toToken.asset.isNative();
        const target = !isToNative ? toToken : fromToken;
        const quote = !isToNative ? fromToken : toToken;

        let xlmPriceInUsd = 0.18;
        try {
          const xlmRes = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=XLMUSDT');
          if (xlmRes.ok) {
            const xlmData = await xlmRes.json();
            xlmPriceInUsd = parseFloat(xlmData.price) || 0.18;
          }
        } catch (err) {
          console.warn('Failed to fetch XLM price from Binance', err);
        }

        const symbol = getBinanceSymbol(target.code, quote.code);

        let lastPrice = 0;
        let lastPriceUsd = 0;
        let priceChangePercentRaw = 0;
        let volumeInTarget = 0;

        if (binanceActive && symbol) {
          const res = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`);
          if (!res.ok) throw new Error('Binance ticker request failed');
          const ticker = await res.json();

          const binancePrice = parseFloat(ticker.lastPrice);
          const binanceOpen = parseFloat(ticker.openPrice);
          const binanceVol = parseFloat(ticker.volume);
          const binanceQuoteVol = parseFloat(ticker.quoteVolume);

          const isFlipped = isFlippedPair(target.code, quote.code);

          if (!isFlipped) {
            lastPrice = binancePrice;
            const openPrice = binanceOpen;
            priceChangePercentRaw =
              openPrice > 0
                ? ((lastPrice - openPrice) / openPrice) * 100
                : parseFloat(ticker.priceChangePercent);
            volumeInTarget = binanceVol;
          } else {
            lastPrice = binancePrice > 0 ? 1 / binancePrice : 0;
            const openPrice = binanceOpen > 0 ? 1 / binanceOpen : 0;
            priceChangePercentRaw =
              openPrice > 0
                ? ((lastPrice - openPrice) / openPrice) * 100
                : -parseFloat(ticker.priceChangePercent);
            volumeInTarget = binanceQuoteVol;
          }
        } else {
          const config = getStellarConfig(currentNetwork);
          const chartService = new StellarChartService(
            config.horizonUrl,
            config.networkPassphrase,
            config.chainId
          );

          const endTime = Date.now();
          const startTime = endTime - 24 * 60 * 60 * 1000;

          const pair = {
            base: fromToken.code,
            counter: toToken.code,
            baseIssuer: fromToken.issuer,
            counterIssuer: toToken.issuer,
          };

          const records = await chartService.fetchTradeAggregations(
            pair,
            { startTime, endTime },
            { resolution: 900000, limit: 100 }
          );

          if (records.length > 0) {
            const firstRecord = records[0];
            const lastRecord = records[records.length - 1];

            const firstOpen = parseFloat(firstRecord.open);
            const lastClose = parseFloat(lastRecord.close);

            let totalBaseVol = 0;
            let totalCounterVol = 0;
            for (const r of records) {
              totalBaseVol += parseFloat(r.baseVolume) || 0;
              totalCounterVol += parseFloat(r.counterVolume) || 0;
            }

            const isTargetFrom =
              target.code === fromToken.code && target.issuer === fromToken.issuer;

            if (isTargetFrom) {
              lastPrice = lastClose;
              priceChangePercentRaw =
                firstOpen > 0 ? ((lastClose - firstOpen) / firstOpen) * 100 : 0;
              volumeInTarget = totalBaseVol;
            } else {
              lastPrice = lastClose > 0 ? 1 / lastClose : 0;
              const initialPrice = firstOpen > 0 ? 1 / firstOpen : 0;
              priceChangePercentRaw =
                initialPrice > 0 ? ((lastPrice - initialPrice) / initialPrice) * 100 : 0;
              volumeInTarget = totalCounterVol;
            }
          } else {
            const bids = orderBook?.bids || [];
            const asks = orderBook?.asks || [];
            if (bids.length > 0 && asks.length > 0) {
              lastPrice = (parseFloat(bids[0].price) + parseFloat(asks[0].price)) / 2;
            } else if (bids.length > 0) {
              lastPrice = parseFloat(bids[0].price);
            } else if (asks.length > 0) {
              lastPrice = parseFloat(asks[0].price);
            }
            priceChangePercentRaw = 0;
            volumeInTarget = 0;
          }
        }

        if (target.code === 'USDC' || target.code === 'USDT') {
          lastPriceUsd = 1.0;
        } else if (target.code === 'XLM') {
          lastPriceUsd = xlmPriceInUsd;
        } else if (quote.code === 'XLM') {
          lastPriceUsd = lastPrice * xlmPriceInUsd;
        } else if (quote.code === 'USDC' || quote.code === 'USDT') {
          lastPriceUsd = lastPrice * 1.0;
        } else {
          lastPriceUsd = lastPrice * xlmPriceInUsd;
        }

        const volumeInQuote = volumeInTarget * lastPrice;
        let volumeUsdVal = 0;
        if (quote.code === 'USDC' || quote.code === 'USDT') {
          volumeUsdVal = volumeInQuote;
        } else if (quote.code === 'XLM') {
          volumeUsdVal = volumeInQuote * xlmPriceInUsd;
        } else {
          volumeUsdVal = volumeInTarget * lastPriceUsd;
        }

        if (isMounted) {
          setMarketStats({
            lastPrice: lastPrice.toFixed(7),
            lastPriceUsd: lastPriceUsd.toFixed(4),
            priceChangePercent:
              (priceChangePercentRaw >= 0 ? '+' : '') + priceChangePercentRaw.toFixed(2) + '%',
            priceChangePercentRaw,
            volume: volumeInQuote.toLocaleString(undefined, { maximumFractionDigits: 2 }),
            volumeUsd: volumeUsdVal.toLocaleString(undefined, {
              style: 'currency',
              currency: 'USD',
            }),
          });
        }
      } catch (err) {
        console.error('Error fetching market stats:', err);
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 30000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [
    fromToken?.code,
    fromToken?.issuer,
    toToken?.code,
    toToken?.issuer,
    binanceActive,
    currentNetwork,
    orderBook,
  ]);

  useEffect(() => {
    if (orderRateType === 'market' && orderBook) {
      const bestPrice = isBuy ? orderBook.asks?.[0]?.price || '' : orderBook.bids?.[0]?.price || '';
      if (bestPrice) setPrice(bestPrice);
    }
  }, [orderRateType, orderBook, isBuy, setPrice]);

  const handleRateTypeChange = (type: 'limit' | 'market') => {
    setOrderRateType(type);
    if (type === 'market') {
      const bestPrice = isBuy
        ? orderBook?.asks?.[0]?.price || ''
        : orderBook?.bids?.[0]?.price || '';
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
    if (newParams.get('sellAsset') !== fromToken.code) {
      newParams.set('sellAsset', fromToken.code);
      needsUpdate = true;
    }
    if (newParams.get('buyAsset') !== toToken.code) {
      newParams.set('buyAsset', toToken.code);
      needsUpdate = true;
    }
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
    if (!stellarWallet) {
      openModal();
      return;
    }
    if (!fromToken || !toToken || !amount || !price) {
      setErrorMessage('Please fill in all required fields');
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
      setTimeout(() => {
        setOrderStatus(null);
        reset();
      }, 3000);
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

  const spendableAmount = fromToken?.balance
    ? portfolioUtils.formatBalance(
        fromToken.code === 'XLM'
          ? Math.max(0, parseFloat(fromToken.balance) - (1 + subentryCount * 0.5 + 0.05)).toString()
          : fromToken.balance
      )
    : '0.00';

  return (
    <>
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
          className={`bg-secondary lg:rounded-xl overflow-hidden border border-color h-[260px] lg:h-auto lg:min-h-[400px] max-h-[500px] ${
            activeTab === 'overview' ? 'block' : 'hidden lg:block'
          }`}
        >
          <Suspense
            fallback={
              <div className="w-full h-full flex items-center justify-center bg-secondary">
                <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
              </div>
            }
          >
            <StellarTradingChart />
          </Suspense>
        </div>
        <div
          className={`bg-secondary lg:rounded-xl border border-color overflow-hidden h-[440px] max-h-[500px] lg:h-auto lg:min-h-0 ${
            activeTab === 'trades' ? 'block' : 'hidden lg:block'
          }`}
        >
          <Suspense
            fallback={
              <div className="w-full h-full flex items-center justify-center bg-secondary">
                <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
              </div>
            }
          >
            <LastTrades baseAsset={fromToken || undefined} counterAsset={toToken || undefined} />
          </Suspense>
        </div>

        {/* ============ ORDER TRADE FORM ============ */}
        <div
          className={`bg-secondary lg:rounded-xl border border-color p-4 lg:p-6 ${
            activeTab === 'overview' ? 'block' : 'hidden lg:block'
          }`}
        >
          <div className="flex items-center justify-between mb-5 lg:mb-6">
            <div className="flex items-center gap-2.5">
              <h2 className="text-base lg:text-lg font-bold text-primary tracking-tight">
                Order Trade
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex gap-0.5 bg-white/5 p-1 rounded-lg border border-white/5">
                {(['limit', 'market'] as const).map(type => (
                  <button
                    key={type}
                    onClick={() => handleRateTypeChange(type)}
                    disabled={isLoading}
                    className={`px-2.5 lg:px-3 py-1.5 rounded-md text-[10px] lg:text-[11px] font-bold uppercase tracking-wider transition-all min-h-[28px] ${
                      orderRateType === type
                        ? 'bg-brand text-white'
                        : 'text-muted hover:text-primary'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
              <button
                onClick={refreshOrderBook}
                className="p-2 rounded-lg hover:bg-hover transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
                disabled={isLoading}
                aria-label="Refresh order book"
              >
                <RefreshCw className={`w-4 h-4 text-muted ${isLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {(() => {
            const isToNative = toToken?.asset.isNative();
            const targetToken = !isToNative ? toToken : fromToken;
            const quoteToken = !isToNative ? fromToken : toToken;
            const homeDomain =
              targetToken?.homeDomain ||
              targetToken?.domain ||
              (targetToken?.asset.isNative() ? 'stellar.org' : '—');
            const hasIssuer = !!(
              targetToken &&
              !targetToken.asset.isNative() &&
              targetToken.issuer
            );
            const issuerShort =
              targetToken && targetToken.issuer
                ? `${targetToken.issuer.slice(0, 4)}...${targetToken.issuer.slice(-4)}`
                : 'Native';

            const handleCopyIssuer = () => {
              if (hasIssuer && targetToken.issuer) {
                navigator.clipboard.writeText(targetToken.issuer);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }
            };

            const isPricePositive = marketStats ? marketStats.priceChangePercentRaw >= 0 : true;

            return (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 p-3.5 mb-5 lg:mb-6 bg-white/[0.02] border border-white/5 rounded-2xl text-[11px] select-none">
                  <div className="flex flex-col gap-1 min-w-0">
                    <span className="text-[10px] font-bold text-muted uppercase tracking-wider">
                      Asset Info
                    </span>
                    <div className="flex flex-col gap-0.5 truncate">
                      <span className="text-primary font-medium truncate">{homeDomain}</span>
                      <div className="flex items-center gap-1 text-muted">
                        <span className="truncate">{issuerShort}</span>
                        {hasIssuer && (
                          <>
                            <button
                              onClick={handleCopyIssuer}
                              className={`transition-colors focus:outline-none ${copied ? 'text-green-400' : 'hover:text-primary'}`}
                              title={copied ? 'Copied!' : 'Copy Issuer Address'}
                            >
                              {copied ? <Check size={11} /> : <Copy size={11} />}
                            </button>
                            <a
                              href={`https://stellar.expert/explorer/${isMainnet ? 'public' : 'testnet'}/account/${targetToken?.issuer || ''}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="hover:text-primary transition-colors focus:outline-none"
                              title="View on Stellar.expert"
                            >
                              <ExternalLink size={11} />
                            </a>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1 min-w-0">
                    <span className="text-[10px] font-bold text-muted uppercase tracking-wider">
                      Last Price
                    </span>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-primary font-semibold truncate tabular-nums">
                        {marketStats ? `${marketStats.lastPrice} ${quoteToken?.code}` : '—'}
                      </span>
                      <span className="text-muted tabular-nums">
                        {marketStats ? `($${marketStats.lastPriceUsd})` : '—'}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1 min-w-0">
                    <span className="text-[10px] font-bold text-muted uppercase tracking-wider">
                      24H Change
                    </span>
                    <span
                      className={`font-semibold tabular-nums mt-1 ${
                        isPricePositive ? 'text-green-500' : 'text-red-500'
                      }`}
                    >
                      {marketStats ? marketStats.priceChangePercent : '—'}
                    </span>
                  </div>

                  <div className="flex flex-col gap-1 min-w-0">
                    <span className="text-[10px] font-bold text-muted uppercase tracking-wider">
                      24H Volume
                    </span>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-primary font-semibold truncate tabular-nums">
                        {marketStats ? `${marketStats.volume} ${quoteToken?.code}` : '—'}
                      </span>
                      <span className="text-muted tabular-nums">
                        {marketStats ? marketStats.volumeUsd : '—'}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1 min-w-0 col-span-2 sm:col-span-1">
                    <span className="text-[10px] font-bold text-muted uppercase tracking-wider">
                      Spread
                    </span>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-primary font-semibold tabular-nums">
                        {spreadStats.percent}
                      </span>
                      <span className="text-muted truncate tabular-nums">
                        {spreadStats.raw !== '—' ? `${spreadStats.raw} ${quoteToken?.code}` : '—'}
                      </span>
                    </div>
                  </div>
                </div>
                {isLowLiquidity && (
                  <div className="mt-[-12px] mb-5 lg:mb-6 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-2xl flex items-center gap-2 text-yellow-500 text-[10px] font-bold uppercase tracking-wider select-none">
                    <AlertCircle size={12} className="shrink-0" />
                    <span>
                      Warning: This asset pair has low liquidity. Orders may experience high price
                      slippage.
                    </span>
                  </div>
                )}
              </>
            );
          })()}

          <div className="flex gap-1 bg-white/5 p-1 rounded-xl border border-white/5 mb-5 lg:mb-6">
            <button
              onClick={() => !isBuy && setIsBuy()}
              disabled={isLoading}
              className={`flex-1 py-3 lg:py-3.5 rounded-lg text-sm font-bold uppercase tracking-wider transition-all min-h-[44px] ${
                isBuy ? 'bg-green-500 text-white shadow-sm' : 'text-muted hover:text-primary'
              }`}
            >
              Buy
            </button>
            <button
              onClick={() => isBuy && setIsBuy()}
              disabled={isLoading}
              className={`flex-1 py-3 lg:py-3.5 rounded-lg text-sm font-bold uppercase tracking-wider transition-all min-h-[44px] ${
                !isBuy ? 'bg-red-500 text-white shadow-sm' : 'text-muted hover:text-primary'
              }`}
            >
              Sell
            </button>
          </div>

          <div className="flex flex-col md:flex-row items-stretch  md:gap-16 relative mb-5 lg:mb-6">
            {/* Pay Card */}
            <div className="flex-1 bg-tertiary rounded-2xl p-4 border border-color">
              <div className="flex justify-between items-center mb-3">
                <label className="text-[10px] lg:text-[11px] font-bold uppercase tracking-wider text-muted">
                  From
                </label>
                <span className="text-[10px] lg:text-[11px] font-bold uppercase tracking-wider text-muted">
                  Balance
                </span>
              </div>

              <div className="flex items-center justify-between gap-3">
                <button
                  onClick={() => setSelectingAssetFor('from')}
                  className="flex items-center gap-2 bg-secondary rounded-lg px-2 py-2 hover:bg-hover active:scale-[0.98] transition-all relative group min-w-0"
                  style={{ width: 'clamp(120px, 38vw, 160px)' }}
                >
                  <div className="relative min-w-[32px] shrink-0">
                    <img
                      key={
                        fromToken?.code
                          ? `${fromToken.code}-${fromToken.issuer || 'native'}`
                          : 'placeholder'
                      }
                      src={
                        fromToken?.icon ||
                        getTokenIcon(fromToken?.code || '', chainConfig, fromToken?.issuer) ||
                        `https://ui-avatars.com/api/?name=${fromToken?.code || 'S'}&background=random`
                      }
                      className="w-8 h-8 rounded-full bg-tertiary object-cover"
                      alt=""
                      onError={e => {
                        (e.target as HTMLImageElement).src =
                          `https://ui-avatars.com/api/?name=${fromToken?.code || 'S'}&background=random`;
                      }}
                    />
                    <img
                      src={chainConfig?.nativeCurrency.logoURI}
                      className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-secondary bg-secondary"
                      alt=""
                    />
                  </div>
                  <div className="flex flex-col items-start pr-1 min-w-0 overflow-hidden text-left">
                    <span className="font-bold text-[13px] leading-tight truncate w-full">
                      {fromToken ? fromToken.name || fromToken.code : 'Select'}
                    </span>
                    <span className="text-[9px] text-muted font-medium tracking-tight truncate w-full">
                      {fromToken
                        ? fromToken.homeDomain ||
                          (fromToken.asset.isNative() ? 'stellar.org' : 'Stellar')
                        : 'stellar'}
                    </span>
                  </div>
                  <ChevronDown
                    size={14}
                    className="text-muted group-hover:text-primary transition-all ml-auto flex-shrink-0"
                  />
                </button>

                <div className="text-right flex flex-col items-end">
                  <p className="text-base lg:text-lg text-primary font-bold tabular-nums leading-tight">
                    {fromBalance}
                  </p>
                </div>
              </div>

              <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between">
                <span className="text-[9px] lg:text-[10px] text-muted uppercase font-bold tracking-wider">
                  Spendable
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] lg:text-[11px] text-brand font-bold tabular-nums">
                    {spendableAmount}
                  </span>
                  <button
                    onClick={() => fetchBalances(true)}
                    className="p-1 hover:bg-white/5 rounded transition-colors text-muted hover:text-primary"
                  >
                    <RefreshCw size={10} className={isRefreshingBalances ? 'animate-spin' : ''} />
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-center md:absolute md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:z-10 -mt-4 md:mt-0">
              <button
                onClick={() => {
                  const t = fromToken;
                  setFromToken(toToken as any);
                  setToToken(t as any);
                }}
                className="w-11 h-11 lg:w-12 lg:h-12 rounded-full bg-secondary flex items-center justify-center hover:scale-110 active:scale-90 transition-all duration-300 text-brand group backdrop-blur-md border border-color min-w-[44px] min-h-[44px]"
                disabled={isLoading || !fromToken || !toToken}
                aria-label="Swap tokens"
              >
                <ArrowUpDown
                  size={18}
                  className="group-hover:rotate-180 transition-transform duration-500 md:rotate-90"
                />
              </button>
            </div>

            {/* Receive Card */}
            <div className="flex-1 bg-tertiary rounded-2xl p-4 border border-color -mt-4 md:mt-0">
              <div className="flex justify-between items-center mb-3">
                <label className="text-[10px] lg:text-[11px] font-bold uppercase tracking-wider text-muted">
                  To
                </label>
                <span className="text-[10px] lg:text-[11px] font-bold uppercase tracking-wider text-muted">
                  Balance
                </span>
              </div>

              <div className="flex items-center justify-between gap-3">
                <button
                  onClick={() => setSelectingAssetFor('to')}
                  className="flex items-center gap-2 bg-secondary rounded-lg px-2 py-2 hover:bg-hover active:scale-[0.98] transition-all relative group min-w-0"
                  style={{ width: 'clamp(120px, 38vw, 160px)' }}
                >
                  <div className="relative min-w-[32px] shrink-0">
                    <img
                      key={
                        toToken?.code
                          ? `${toToken.code}-${toToken.issuer || 'native'}`
                          : 'placeholder'
                      }
                      src={
                        toToken?.icon ||
                        getTokenIcon(toToken?.code || '', chainConfig, toToken?.issuer) ||
                        `https://ui-avatars.com/api/?name=${toToken?.code || 'S'}&background=random`
                      }
                      className="w-8 h-8 rounded-full bg-tertiary object-cover"
                      alt=""
                      onError={e => {
                        (e.target as HTMLImageElement).src =
                          `https://ui-avatars.com/api/?name=${toToken?.code || 'S'}&background=random`;
                      }}
                    />
                    <img
                      src={chainConfig?.nativeCurrency.logoURI}
                      className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-secondary bg-secondary"
                      alt=""
                    />
                  </div>
                  <div className="flex flex-col items-start pr-1 min-w-0 overflow-hidden text-left">
                    <span className="font-bold text-[13px] leading-tight truncate w-full">
                      {toToken ? toToken.name || toToken.code : 'Select'}
                    </span>
                    <span className="text-[9px] text-muted font-medium tracking-tight truncate w-full">
                      {toToken
                        ? toToken.homeDomain ||
                          (toToken.asset.isNative() ? 'stellar.org' : 'Stellar')
                        : 'stellar'}
                    </span>
                  </div>
                  <ChevronDown
                    size={14}
                    className="text-muted group-hover:text-primary transition-all ml-auto flex-shrink-0"
                  />
                </button>

                <div className="text-right flex flex-col items-end">
                  <p className="text-base lg:text-lg text-primary font-bold tabular-nums leading-tight">
                    {toBalance}
                  </p>
                </div>
              </div>

              <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between">
                <span className="text-[9px] lg:text-[10px] text-muted uppercase font-bold tracking-wider">
                  Spendable
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] lg:text-[11px] text-brand font-bold tabular-nums">
                    {toToken?.balance
                      ? portfolioUtils.formatBalance(
                          toToken.code === 'XLM'
                            ? Math.max(
                                0,
                                parseFloat(toToken.balance) - (1 + subentryCount * 0.5 + 0.05)
                              ).toString()
                            : toToken.balance
                        )
                      : '0.00'}
                  </span>
                  <button
                    onClick={() => fetchBalances(true)}
                    className="p-1 hover:bg-white/5 rounded transition-colors text-muted hover:text-primary"
                  >
                    <RefreshCw size={10} className={isRefreshingBalances ? 'animate-spin' : ''} />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* ===== Inputs: Amount / Price ===== */}
          <div className="grid grid-cols-2 gap-2 md:gap-16 mb-4 lg:mb-5">
            <div className="bg-tertiary rounded-2xl p-4 border border-color">
              <div className="flex justify-between items-center mb-2">
                <label className="text-[10px] lg:text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
                  Amount
                </label>
                {fromToken && (
                  <button
                    onClick={setMaxAmount}
                    className="text-[9px] lg:text-[10px] font-bold text-brand hover:underline uppercase tracking-widest"
                  >
                    Max
                  </button>
                )}
              </div>
              <input
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={e => {
                  const v = e.target.value;
                  if (v === '' || /^\d*\.?\d*$/.test(v)) setAmount(v);
                }}
                placeholder="0.00"
                className="w-full bg-transparent border-none p-0 text-right text-lg lg:text-xl font-bold tabular-nums focus:ring-0 focus:outline-none placeholder:text-muted/30"
                disabled={isLoading}
              />
            </div>

            <div className="bg-tertiary rounded-2xl p-4 border border-color">
              <div className="flex justify-between items-center mb-2">
                <label className="text-[10px] lg:text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
                  Price
                </label>
                {orderRateType === 'market' && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-brand/10 text-brand font-bold uppercase tracking-wider">
                    MKT
                  </span>
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
                className="w-full bg-transparent border-none p-0 text-right text-lg lg:text-xl font-bold tabular-nums focus:ring-0 focus:outline-none placeholder:text-muted/30 disabled:opacity-60 disabled:text-muted"
                disabled={isLoading || orderRateType === 'market'}
              />
            </div>
          </div>

          <div className="bg-tertiary rounded-2xl p-4 border border-color mb-5 lg:mb-6">
            <div className="flex justify-between items-center">
              <label className="text-[10px] lg:text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
                Total
              </label>
              <span className="text-lg lg:text-xl font-bold text-primary tabular-nums">
                {total || '0.00'}
              </span>
            </div>
          </div>

          {(error || errorMessage) && (
            <div className="mb-4 p-3 bg-red-500/10 rounded-xl flex items-start gap-2 border border-red-500/20">
              <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
              <p className="text-xs text-red-500 leading-relaxed">{error || errorMessage}</p>
            </div>
          )}

          <button
            onClick={handlePlaceOrder}
            disabled={stellarWallet ? !canPlaceOrder || orderStatus === 'pending' : false}
            className={`w-full py-4 lg:py-5 rounded-2xl font-bold text-sm uppercase tracking-[0.15em] transition-all min-h-[52px] lg:min-h-[56px] ${
              !stellarWallet
                ? 'btn btn-primary bg-brand hover:bg-brand-hover text-white cursor-pointer'
                : canPlaceOrder && orderStatus !== 'pending'
                  ? 'btn btn-primary'
                  : 'bg-tertiary text-muted opacity-50 cursor-not-allowed border border-divider'
            }`}
          >
            {!stellarWallet ? (
              'Connect Wallet'
            ) : orderStatus === 'pending' ? (
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
          className={`bg-secondary lg:rounded-xl border border-color p-1 flex flex-col h-[440px] lg:h-auto lg:min-h-0 lg:overflow-hidden overflow-hidden ${
            activeTab === 'orderBook' ? '' : 'hidden lg:flex'
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
        onSelect={token => {
          if (selectingAssetFor === 'from') setFromToken(token as any);
          else setToToken(token as any);
        }}
        title={`Select ${selectingAssetFor === 'from' ? 'Sell' : 'Buy'} Asset`}
      />
    </>
  );
};

export default OrderBookSwapUI;
