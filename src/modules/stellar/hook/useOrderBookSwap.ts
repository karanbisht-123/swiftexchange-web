import { useCallback, useEffect, useRef, useState } from 'react';

import * as StellarSDK from '@stellar/stellar-sdk';

import { getStellarConfig } from '../../walletconnect/config/chains';
import { useWalletStore } from '../../walletconnect/store/walletConnectStore';
import {
  BinanceBridgeService,
  getBinanceSymbol,
  isBinanceSupported,
  isFlippedPair,
} from '../service/binanceBridgeService';
import { OrderBookSwapService } from '../service/orderBookSwapService';
import { useAmmSwapStore } from '../store/ammSwapStore';
import type {
  LargeOrderOptions,
  LargeOrderQuote,
  LargeOrderTransaction,
  TokenInfo,
} from '../types/orderBookSwap.types';

const globalOrderBookCache = new Map<string, any>();
const homeDomainCache = new Map<string, string>();

const getCacheKey = (from?: TokenInfo | null, to?: TokenInfo | null, isBuy?: boolean) => {
  if (!from || !to) return '';
  return `${from.code}-${from.issuer || ''}-${to.code}-${to.issuer || ''}-${isBuy}`;
};

interface UseLargeOrderProps {
  userAddress?: string;
}

export function useLargeOrder({ userAddress }: UseLargeOrderProps) {
  const [service, setService] = useState<OrderBookSwapService | null>(null);
  const [isBuy, setIsBuyState] = useState(true);
  const hasSetDefaultPairRef = useRef(false);
  const [fromToken, setFromToken] = useState<TokenInfo | null>(null);
  const [toToken, setToToken] = useState<TokenInfo | null>(null);
  const [amount, setAmount] = useState<string>('');
  const [price, setPrice] = useState<string>('');
  const [total, setTotal] = useState<string>('');
  const [quote, setQuote] = useState<LargeOrderQuote | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [slippageTolerance, setSlippageTolerance] = useState<number>(1);
  const [transaction, setTransaction] = useState<LargeOrderTransaction | null>(null);
  const [availableTokens, setAvailableTokens] = useState<TokenInfo[]>([]);
  const cacheKey = getCacheKey(fromToken, toToken, isBuy);
  const [orderBook, setOrderBook] = useState<any>(globalOrderBookCache.get(cacheKey) || null);
  const [subentryCount, setSubentryCount] = useState<number>(0);
  const [binanceActive, setBinanceActive] = useState(() =>
    isBinanceSupported(fromToken?.code || '', toToken?.code || '')
  );

  useEffect(() => {
    setBinanceActive(isBinanceSupported(fromToken?.code || '', toToken?.code || ''));
  }, [fromToken?.code, toToken?.code]);

  useEffect(() => {
    const handleFallback = () => {
      setBinanceActive(false);
    };
    window.addEventListener('binance:connection-failed', handleFallback);
    return () => window.removeEventListener('binance:connection-failed', handleFallback);
  }, []);

  const network = useWalletStore(state => state.network);
  const currentStellarConfig = getStellarConfig(network);
  const mountedRef = useRef(true);

  useEffect(() => {
    try {
      const config = currentStellarConfig;
      const orderBookService = new OrderBookSwapService(
        config.horizonUrl,
        config.networkPassphrase,
        config.chainId
      );
      setService(orderBookService);
      setError(null);
    } catch (err) {
      console.error('Failed to initialize OrderBook service:', err);
      setError('Failed to connect to Stellar network');
    }
  }, [currentStellarConfig]);

  const fetchBalances = useCallback(async () => {
    if (!service) {
      return;
    }
    setIsLoading(true);
    try {
      const { tokens: balances, subentryCount: count } = await service.getAssetsWithBalances(
        userAddress || ''
      );
      if (!mountedRef.current) return;

      if (balances.length === 0) {
        setError(userAddress ? 'No tokens found in your account. Please add tokens first.' : null);
        setAvailableTokens([]);
        return;
      }
      setAvailableTokens(balances);
      const currentPair = useAmmSwapStore.getState().selectedChartPair || {
        base: 'XLM',
        counter: 'USDC',
        baseIssuer: undefined,
        counterIssuer: 'GBBD47R2LWK7P7TV222OISDOK6V2QQQSK37Q7VURB6L74QVN56AGEBI5',
      };

      const targetFrom =
        balances.find(t => t.code === currentPair.base && t.issuer === currentPair.baseIssuer) ||
        balances.find(t => t.code === currentPair.base);

      const targetTo =
        balances.find(
          t => t.code === currentPair.counter && t.issuer === currentPair.counterIssuer
        ) || balances.find(t => t.code === currentPair.counter);

      if (!hasSetDefaultPairRef.current && targetFrom && targetTo) {
        setFromToken(targetFrom);
        setToToken(targetTo);
        hasSetDefaultPairRef.current = true;
      } else {
        setFromToken(prev => {
          if (!prev) {
            return targetFrom || balances.find(t => t.code === 'XLM') || balances[0];
          }
          const existing = balances.find(t => t.code === prev.code && t.issuer === prev.issuer);
          if (!existing) return prev;
          if (existing.balance === prev.balance) return prev;
          return existing;
        });

        setToToken(prev => {
          if (!prev) {
            return targetTo || balances[1] || balances[0];
          }
          const existing = balances.find(t => t.code === prev.code && t.issuer === prev.issuer);
          if (!existing) return prev;
          if (existing.balance === prev.balance) return prev;
          return existing;
        });
      }
      setSubentryCount(count);

      setError(null);
    } catch (err) {
      console.error('Failed to fetch balances:', err);
      if (mountedRef.current) setError('Failed to load wallet balances');
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, [service, userAddress]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    fetchBalances();
  }, [fetchBalances]);

  // Dynamically load home domains for selected tokens
  useEffect(() => {
    let active = true;
    const fetchHomeDomains = async () => {
      const config = currentStellarConfig;
      const server = new StellarSDK.Horizon.Server(config.horizonUrl);

      if (fromToken && fromToken.issuer && !fromToken.homeDomain && !fromToken.domain) {
        if (homeDomainCache.has(fromToken.issuer)) {
          const cached = homeDomainCache.get(fromToken.issuer)!;
          if (active) {
            setFromToken(prev =>
              prev && prev.issuer === fromToken.issuer
                ? { ...prev, homeDomain: cached, domain: cached }
                : prev
            );
          }
        } else {
          try {
            const account = await server.loadAccount(fromToken.issuer);
            const domainName = account.home_domain || '';
            homeDomainCache.set(fromToken.issuer, domainName);
            if (active) {
              setFromToken(prev =>
                prev && prev.issuer === fromToken.issuer
                  ? { ...prev, homeDomain: domainName, domain: domainName }
                  : prev
              );
            }
          } catch (e) {
            console.warn('Failed to load home domain for fromToken', e);
          }
        }
      }

      if (toToken && toToken.issuer && !toToken.homeDomain && !toToken.domain) {
        if (homeDomainCache.has(toToken.issuer)) {
          const cached = homeDomainCache.get(toToken.issuer)!;
          if (active) {
            setToToken(prev =>
              prev && prev.issuer === toToken.issuer
                ? { ...prev, homeDomain: cached, domain: cached }
                : prev
            );
          }
        } else {
          try {
            const account = await server.loadAccount(toToken.issuer);
            const domainName = account.home_domain || '';
            homeDomainCache.set(toToken.issuer, domainName);
            if (active) {
              setToToken(prev =>
                prev && prev.issuer === toToken.issuer
                  ? { ...prev, homeDomain: domainName, domain: domainName }
                  : prev
              );
            }
          } catch (e) {
            console.warn('Failed to load home domain for toToken', e);
          }
        }
      }
    };

    fetchHomeDomains();
    return () => {
      active = false;
    };
  }, [fromToken?.code, fromToken?.issuer, toToken?.code, toToken?.issuer, currentStellarConfig]);

  // Order book + streaming
  useEffect(() => {
    if (!service || !fromToken?.asset || !toToken?.asset) return;

    let closeStream: (() => void) | null = null;
    let isMounted = true;
    let pollingInterval: NodeJS.Timeout | null = null;

    const initOrderBook = async () => {
      const key = getCacheKey(fromToken, toToken, isBuy);
      if (!globalOrderBookCache.has(key)) {
        setIsLoading(true);
      }
      try {
        const base = fromToken.code;
        const counter = toToken.code;

        const symbol = getBinanceSymbol(base, counter);

        if (binanceActive && symbol) {
          const isFlipped = isFlippedPair(base, counter);

          const book = await BinanceBridgeService.fetchOrderBook(symbol, isFlipped, 20);
          if (!isMounted) return;
          setOrderBook(book);
          if (key) globalOrderBookCache.set(key, book);

          if (!price) {
            const bestPrice = isBuy
              ? book.asks.length > 0
                ? book.asks[0].price
                : null
              : book.bids.length > 0
                ? book.bids[0].price
                : null;
            if (bestPrice && isMounted) {
              setPrice(bestPrice);
            }
          }

          const stream = BinanceBridgeService.streamOrderBook(
            symbol,
            isFlipped,
            (updatedBook: any) => {
              if (isMounted) {
                setOrderBook(updatedBook);
                const k = getCacheKey(fromToken, toToken, isBuy);
                if (k) globalOrderBookCache.set(k, updatedBook);
              }
            },
            (err: any) => {
              console.error('[useOrderBookSwap] Binance stream error:', err);
            }
          );

          if (!isMounted) {
            stream();
            return;
          }
          closeStream = stream;
        } else {
          const book = await service.getOrderBook(fromToken.asset, toToken.asset, 20);
          if (!isMounted) return;
          setOrderBook(book);
          if (key) globalOrderBookCache.set(key, book);

          if (!price) {
            const bestPrice = await service.getBestPrice(fromToken.asset, toToken.asset, isBuy);
            if (bestPrice && isMounted) {
              setPrice(bestPrice);
            }
          }

          if (!isMounted) return;
          const stream = service.streamOrderBook(
            fromToken.asset,
            toToken.asset,
            (updatedBook: any) => {
              if (isMounted) {
                setOrderBook(updatedBook);
                const k = getCacheKey(fromToken, toToken, isBuy);
                if (k) globalOrderBookCache.set(k, updatedBook);
              }
            },
            (err: any) => {
              console.error('[useOrderBookSwap] Stream error, falling back to polling:', err);
              if (isMounted && !pollingInterval) {
                pollingInterval = setInterval(() => {
                  service
                    .getOrderBook(fromToken.asset!, toToken.asset!, 20)
                    .then(book => {
                      if (isMounted) {
                        setOrderBook(book);
                        const k = getCacheKey(fromToken, toToken, isBuy);
                        if (k) globalOrderBookCache.set(k, book);
                      }
                    })
                    .catch(e => console.error('[useOrderBookSwap] Polling error:', e));
                }, 8000);
              }
            }
          );

          if (!isMounted) {
            stream();
            return;
          }
          closeStream = stream;
        }
      } catch (err) {
        console.error('Failed to fetch order book:', err);
        if (isMounted) {
          setError('No liquidity available for this trading pair');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    initOrderBook();

    return () => {
      isMounted = false;
      if (closeStream) {
        closeStream();
      }
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [
    fromToken?.code,
    fromToken?.issuer,
    toToken?.code,
    toToken?.issuer,
    isBuy,
    service,
    binanceActive,
  ]);

  // Calculate quote
  useEffect(() => {
    if (!service || !amount || !price || !fromToken?.asset || !toToken?.asset) {
      setTotal('0');
      setQuote(null);
      return;
    }

    setIsLoading(true);
    try {
      const newTotal = service.calculateTotal(amount, price);
      setTotal(newTotal);

      setQuote({
        fromAsset: fromToken.asset,
        toAsset: toToken.asset,
        amount,
        price,
        total: newTotal,
        slippageTolerance,
        timestamp: Date.now(),
      });
      setError(null);
    } catch (err) {
      console.error('Failed to calculate quote:', err);
      setError('Failed to calculate order quote');
    } finally {
      setIsLoading(false);
    }
  }, [amount, price, fromToken, toToken, slippageTolerance, service]);

  const setAmountPercentage = useCallback(
    (percentage: number) => {
      if (!fromToken?.balance) {
        setError('No balance available for selected token');
        return;
      }

      const balance = parseFloat(fromToken.balance);
      const reserve = fromToken.code === 'XLM' ? 1 + subentryCount * 0.5 : 0;
      const availableBalance = Math.max(0, balance - reserve);
      const newAmount = ((availableBalance * percentage) / 100).toFixed(7);
      setAmount(newAmount);
    },
    [fromToken]
  );

  const setMaxAmount = useCallback(() => {
    if (!fromToken?.balance) {
      setError('No balance available for selected token');
      return;
    }

    const balance = parseFloat(fromToken.balance);
    const reserve = fromToken.code === 'XLM' ? 1 + subentryCount * 0.5 : 0;
    const maxAmount = Math.max(0, balance - reserve);
    setAmount(maxAmount.toFixed(7));
  }, [fromToken, subentryCount]);

  const toggleOrderType = useCallback(() => {
    setIsBuyState(prev => !prev);
    const temp = fromToken;
    setFromToken(toToken);
    setToToken(temp);
    setAmount('');
    setPrice('');
    setTotal('');
    setQuote(null);
    setError(null);
  }, [fromToken, toToken]);

  const buildTransaction = useCallback(
    async (options: LargeOrderOptions = {}): Promise<LargeOrderTransaction> => {
      if (!service) throw new Error('OrderBook service not initialized');
      if (!userAddress) throw new Error('User address is required');
      if (!quote) throw new Error('No quote available');
      if (!fromToken || !toToken) throw new Error('Please select both tokens');

      const requiredAmount = isBuy ? parseFloat(quote.total) : parseFloat(quote.amount);
      const availableBalance = parseFloat(fromToken.balance || '0');

      if (requiredAmount > availableBalance) {
        throw new Error(
          `Insufficient ${fromToken.code} balance. Required: ${requiredAmount.toFixed(
            7
          )}, Available: ${availableBalance.toFixed(7)}`
        );
      }

      setIsLoading(true);
      setError(null);

      try {
        const tx = await service.buildOrderTransaction(userAddress, quote, isBuy, {
          ...options,
          slippageTolerance,
        });

        setTransaction(tx);
        return tx;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to build transaction';
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [service, userAddress, quote, isBuy, slippageTolerance, fromToken, toToken]
  );

  const executeOrderWithWalletConnect = useCallback(
    async (transaction: LargeOrderTransaction, walletProvider: any): Promise<string> => {
      if (!service) throw new Error('OrderBook service not initialized');

      setIsLoading(true);
      setError(null);

      try {
        const txHash = await service.executeOrderWithWalletConnect(transaction, walletProvider);

        setTransaction({
          ...transaction,
          status: 'success',
          txHash,
        });

        setTimeout(() => fetchBalances(), 1500);

        window.dispatchEvent(new CustomEvent('stellar:order-placed'));

        return txHash;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Order execution failed';
        setError(message);
        setTransaction({
          ...transaction,
          status: 'failed',
        });
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [service, fetchBalances]
  );

  const refreshOrderBook = useCallback(async () => {
    if (!service || !fromToken?.asset || !toToken?.asset) return;

    setIsLoading(true);
    try {
      const base = fromToken.code;
      const counter = toToken.code;

      const symbol = getBinanceSymbol(base, counter);

      if (binanceActive && symbol) {
        const isFlipped = isFlippedPair(base, counter);
        const book = await BinanceBridgeService.fetchOrderBook(symbol, isFlipped, 20);
        setOrderBook(book);
      } else {
        const book = await service.getOrderBook(fromToken.asset, toToken.asset, 20);
        setOrderBook(book);
      }
    } catch (err) {
      console.error('Failed to refresh order book:', err);
      setError('Failed to refresh order book');
    } finally {
      setIsLoading(false);
    }
  }, [service, fromToken, toToken, binanceActive]);

  const reset = useCallback(() => {
    setAmount('');
    setPrice('');
    setTotal('');
    setQuote(null);
    setError(null);
    setTransaction(null);
  }, []);

  return {
    isBuy,
    fromToken,
    toToken,
    amount,
    price,
    total,
    quote,
    isLoading,
    error,
    slippageTolerance,
    availableTokens,
    subentryCount,
    orderBook,
    setIsBuy: toggleOrderType,
    setFromToken,
    setToToken,
    setAmount,
    setPrice,
    setSlippageTolerance,
    setAmountPercentage,
    setMaxAmount,
    buildTransaction,
    executeOrderWithWalletConnect,
    refreshOrderBook,
    fetchBalances,
    transaction,
    reset,
  };
}
