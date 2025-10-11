import { useCallback, useEffect, useState } from 'react';

import { OrderBookSwapService } from '../service/orderBookSwapService';
import type {
  LargeOrderOptions,
  LargeOrderQuote,
  LargeOrderTransaction,
  TokenInfo,
} from '../types/orderBookSwap.types';

interface UseLargeOrderProps {
  networkKey: string;
  userAddress?: string;
}

export function useLargeOrder({ networkKey, userAddress }: UseLargeOrderProps) {
  const [service] = useState(() => new OrderBookSwapService(networkKey));
  const [isBuy, setIsBuyState] = useState(true);
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
  const [popularTokens, setPopularTokens] = useState<TokenInfo[]>([]);
  const [orderBook, setOrderBook] = useState<any>(null);

  // Load tokens from wallet balances
  useEffect(() => {
    if (!userAddress) {
      setError('No wallet address provided');
      return;
    }

    const fetchBalances = async () => {
      setIsLoading(true);
      try {
        const balances = await service.getTokenBalances(userAddress);
        if (balances.length === 0) {
          setError('No tokens found in wallet');
          return;
        }

        setPopularTokens(balances);

        // Set default tokens based on order type
        const xlm = balances.find(t => t.code === 'XLM');
        const usdc = balances.find(t => t.code === 'USDC');
        const defaultToken = xlm || balances[0];
        const otherToken = usdc || balances[1] || balances[0];

        if (isBuy) {
          setFromToken(otherToken);
          setToToken(defaultToken);
        } else {
          setFromToken(defaultToken);
          setToToken(otherToken);
        }
      } catch (err) {
        console.error('Failed to fetch balances:', err);
        setError('Failed to load wallet balances');
      } finally {
        setIsLoading(false);
      }
    };

    fetchBalances();
  }, [userAddress, service, isBuy]);

  // Fetch order book when tokens change
  useEffect(() => {
    if (!fromToken?.asset || !toToken?.asset) return;

    const fetchOrderBook = async () => {
      setIsLoading(true);
      try {
        const book = await service.getOrderBook(fromToken.asset, toToken.asset, 20);
        setOrderBook(book);

        // Auto-fill price from order book if empty
        if (!price) {
          const bestPrice = await service.getBestPrice(fromToken.asset, toToken.asset, isBuy);
          if (bestPrice) {
            setPrice(bestPrice);
          }
        }
      } catch (err) {
        console.error('Failed to fetch order book:', err);
        setError('Failed to load order book');
      } finally {
        setIsLoading(false);
      }
    };

    fetchOrderBook();
  }, [fromToken, toToken, isBuy, service, price]);

  // Calculate total and quote on amount or price change
  useEffect(() => {
    if (!amount || !price || !fromToken?.asset || !toToken?.asset) {
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
    } catch (err) {
      console.error('Failed to calculate quote:', err);
      setError('Failed to calculate order quote');
    } finally {
      setIsLoading(false);
    }
  }, [amount, price, fromToken, toToken, slippageTolerance, service]);

  // Quick percentage buttons
  const setAmountPercentage = useCallback(
    (percentage: number) => {
      if (!fromToken?.balance) {
        setError('No balance available for selected token');
        return;
      }

      const balance = parseFloat(fromToken.balance);
      const reserve = fromToken.code === 'XLM' ? 2 : 0;
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
    const reserve = fromToken.code === 'XLM' ? 2 : 0;
    const maxAmount = Math.max(0, balance - reserve);
    setAmount(maxAmount.toFixed(7));
  }, [fromToken]);

  // Toggle buy/sell
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

  // Build transaction
  const buildTransaction = useCallback(
    async (options: LargeOrderOptions = {}): Promise<LargeOrderTransaction> => {
      if (!userAddress) {
        throw new Error('User address is required');
      }

      if (!quote) {
        throw new Error('No quote available');
      }

      if (!fromToken || !toToken) {
        throw new Error('Please select both tokens');
      }

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
    [userAddress, quote, isBuy, slippageTolerance, service, fromToken, toToken]
  );

  // Execute order
  const executeOrder = useCallback(
    async (privateKey: string): Promise<string> => {
      if (!transaction) {
        throw new Error('No transaction to execute');
      }

      if (!privateKey) {
        throw new Error('Private key is required');
      }

      setIsLoading(true);
      setError(null);

      try {
        const txHash = await service.executeOrder(transaction, privateKey);

        setTransaction({
          ...transaction,
          status: 'success',
          txHash,
        });

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
    [transaction, service]
  );

  // Refresh order book
  const refreshOrderBook = useCallback(async () => {
    if (!fromToken?.asset || !toToken?.asset) return;

    setIsLoading(true);
    try {
      const book = await service.getOrderBook(fromToken.asset, toToken.asset, 20);
      setOrderBook(book);
    } catch (err) {
      console.error('Failed to refresh order book:', err);
      setError('Failed to refresh order book');
    } finally {
      setIsLoading(false);
    }
  }, [fromToken, toToken, service]);

  // Reset state
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
    popularTokens,
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
    executeOrder,
    refreshOrderBook,
    reset,
  };
}
