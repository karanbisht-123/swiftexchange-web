import { useCallback, useEffect, useState } from 'react';

import { AmmSwapService } from '../service/ammSwapService';
import type {
  SwapOptions,
  // AmmSwapTransaction,
  SwapQuote,
  TokenInfo,
} from '../types/ammSwap.types';
import { debounce, isQuoteValid, validateSwapAmount } from '../utils/ammSwapUtils';

interface UseAmmSwapProps {
  networkKey: string;
  userAddress?: string;
}

export function useAmmSwap({ networkKey, userAddress }: UseAmmSwapProps) {
  const [service] = useState(() => new AmmSwapService(networkKey));

  const [fromToken, setFromToken] = useState<any | null>(null);
  const [toToken, setToToken] = useState<any | null>(null);
  const [fromAmount, setFromAmount] = useState<string>('');
  const [toAmount, setToAmount] = useState<string>('');
  const [quote, setQuote] = useState<SwapQuote | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [slippageTolerance, setSlippageTolerance] = useState<number>(1);
  const [transaction, setTransaction] = useState<any | null>(null);
  const [popularTokens, setPopularTokens] = useState<TokenInfo[]>([]);

  // Load tokens from wallet balances
  useEffect(() => {
    if (userAddress) {
      const fetchBalances = async () => {
        const balances = await service.getTokenBalances(userAddress);
        setPopularTokens(balances);

        // Set default tokens
        if (!fromToken && balances.length > 0) {
          setFromToken(balances[0]);
        }
      };
      fetchBalances();
    }
  }, [userAddress, service]);

  // Debounced quote fetching
  const fetchQuoteDebounced = useCallback(
    debounce(async (from: TokenInfo, to: TokenInfo, amount: string, slippage: number) => {
      if (!amount || parseFloat(amount) <= 0) {
        setQuote(null);
        setToAmount('');
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const options: SwapOptions = {
          slippageTolerance: slippage,
          maxHops: 3,
        };

        const newQuote = await service.getSwapQuote(from.asset, to.asset, amount, options);

        setQuote(newQuote);
        setToAmount(newQuote.estimatedOutput);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to get quote';
        setError(message);
        setQuote(null);
        setToAmount('');
      } finally {
        setIsLoading(false);
      }
    }, 500),
    [service]
  );

  // Handle from amount change
  const handleFromAmountChange = useCallback(
    (amount: string) => {
      setFromAmount(amount);

      if (!fromToken || !toToken) {
        return;
      }

      const validation = validateSwapAmount(amount, fromToken.balance);
      if (!validation.isValid && amount !== '') {
        setError(validation.error || null);
        return;
      }

      setError(null);
      fetchQuoteDebounced(fromToken, toToken, amount, slippageTolerance);
    },
    [fromToken, toToken, slippageTolerance, fetchQuoteDebounced]
  );

  // Handle token selection
  const handleFromTokenChange = useCallback(
    (token: TokenInfo) => {
      setFromToken(token);

      // Swap tokens if selecting same as toToken
      if (toToken && token.code === toToken.code) {
        setToToken(fromToken);
      }

      // Refresh quote
      if (toToken && fromAmount) {
        fetchQuoteDebounced(token, toToken, fromAmount, slippageTolerance);
      }
    },
    [toToken, fromToken, fromAmount, slippageTolerance, fetchQuoteDebounced]
  );

  const handleToTokenChange = useCallback(
    (token: TokenInfo) => {
      setToToken(token);

      // Swap tokens if selecting same as fromToken
      if (fromToken && token.code === fromToken.code) {
        setFromToken(toToken);
      }

      // Refresh quote
      if (fromToken && fromAmount) {
        fetchQuoteDebounced(fromToken, token, fromAmount, slippageTolerance);
      }
    },
    [fromToken, toToken, fromAmount, slippageTolerance, fetchQuoteDebounced]
  );

  // Swap token positions
  const handleSwapTokens = useCallback(() => {
    const tempToken = fromToken;
    setFromToken(toToken);
    setToToken(tempToken);

    // Swap amounts
    setFromAmount(toAmount);
    setToAmount(fromAmount);

    // Clear quote and fetch new one
    setQuote(null);
    if (toToken && fromToken && toAmount) {
      fetchQuoteDebounced(toToken, fromToken, toAmount, slippageTolerance);
    }
  }, [fromToken, toToken, fromAmount, toAmount, slippageTolerance, fetchQuoteDebounced]);

  // Handle slippage change
  const handleSlippageChange = useCallback(
    (newSlippage: number) => {
      setSlippageTolerance(newSlippage);

      // Refresh quote with new slippage
      if (fromToken && toToken && fromAmount) {
        fetchQuoteDebounced(fromToken, toToken, fromAmount, newSlippage);
      }
    },
    [fromToken, toToken, fromAmount, fetchQuoteDebounced]
  );

  // Build transaction
  const buildTransaction = useCallback(
    async (options: SwapOptions = {}): Promise<any> => {
      if (!userAddress) {
        throw new Error('User address is required');
      }

      if (!quote) {
        throw new Error('No quote available');
      }

      if (!isQuoteValid(quote)) {
        throw new Error('Quote expired. Please refresh.');
      }

      setIsLoading(true);
      setError(null);

      try {
        const tx = await service.buildSwapTransaction(userAddress, quote, {
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
    [userAddress, quote, slippageTolerance, service]
  );

  const executeSwap = useCallback(
    async (privateKey: string): Promise<string> => {
      if (!transaction) {
        throw new Error('No transaction to execute');
      }

      setIsLoading(true);
      setError(null);

      try {
        const txHash = await service.executeSwap(transaction, privateKey);

        setTransaction({
          ...transaction,
          status: 'success',
          txHash,
        });

        setFromAmount('');
        setToAmount('');
        setQuote(null);

        return txHash;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Swap execution failed';
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

  // Refresh quote
  const refreshQuote = useCallback(() => {
    if (fromToken && toToken && fromAmount) {
      fetchQuoteDebounced(fromToken, toToken, fromAmount, slippageTolerance);
    }
  }, [fromToken, toToken, fromAmount, slippageTolerance, fetchQuoteDebounced]);

  // Reset swap state
  const reset = useCallback(() => {
    setFromAmount('');
    setToAmount('');
    setQuote(null);
    setError(null);
    setTransaction(null);
  }, []);

  return {
    fromToken,
    toToken,
    fromAmount,
    toAmount,
    quote,
    isLoading,
    error,
    slippageTolerance,
    transaction,
    popularTokens,
    setFromToken: handleFromTokenChange,
    setToToken: handleToTokenChange,
    setFromAmount: handleFromAmountChange,
    setSlippageTolerance: handleSlippageChange,
    swapTokens: handleSwapTokens,
    buildTransaction,
    executeSwap,
    refreshQuote,
    reset,
  };
}
