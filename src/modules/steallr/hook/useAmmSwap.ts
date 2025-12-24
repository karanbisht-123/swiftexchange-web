import { useCallback, useEffect, useState } from 'react';

import { useWalletStore } from '../../walletconnect/store/walletConnectStore';
import { AmmSwapService } from '../service/ammSwapService';
import type { SwapQuote, TokenInfo } from '../types/ammSwap.types';

interface UseAmmSwapProps {
  userAddress: string;
}

export const useAmmSwap = ({ userAddress }: UseAmmSwapProps) => {
  const [service, setService] = useState<AmmSwapService | null>(null);
  const [fromToken, setFromToken] = useState<TokenInfo | null>(null);
  const [toToken, setToToken] = useState<TokenInfo | null>(null);
  const [fromAmount, setFromAmount] = useState('');
  const [toAmount, setToAmount] = useState('');
  const [quote, setQuote] = useState<SwapQuote | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slippageTolerance, setSlippageTolerance] = useState(1);
  const [availableTokens, setAvailableTokens] = useState<TokenInfo[]>([]);

  const { currentStellarConfig } = useWalletStore();

  useEffect(() => {
    try {
      const config = currentStellarConfig;

      const ammService = new AmmSwapService(
        config.horizonUrl,
        config.networkPassphrase,
        config.chainId
      );
      setService(ammService);
    } catch (err) {
      console.error('Failed to initialize AMM service:', err);
      setError('Failed to connect to Stellar network');
    }
  }, [currentStellarConfig]);
  useEffect(() => {
    if (!service || !userAddress) return;

    const loadTokens = async () => {
      setIsLoading(true);
      try {
        const userTokens = await service.getTokenBalances(userAddress);

        if (userTokens.length === 0) {
          setError('No tokens found in your account. Please add tokens first.');
          setAvailableTokens([]);
          return;
        }

        setAvailableTokens(userTokens);
        if (!fromToken && userTokens.length > 0) {
          const xlmToken = userTokens.find(t => t.code === 'XLM');
          setFromToken(xlmToken || userTokens[0]);
        }

        if (!toToken && userTokens.length > 1) {
          const nonSelectedToken = userTokens.find(
            t => t.code !== (fromToken?.code || userTokens[0].code)
          );
          setToToken(nonSelectedToken || userTokens[1]);
        }

        setError(null);
      } catch (err) {
        console.error('Failed to load tokens:', err);
        setError('Failed to load your token balances');
      } finally {
        setIsLoading(false);
      }
    };

    loadTokens();
  }, [service, userAddress]);

  useEffect(() => {
    if (!service || !fromToken || !toToken || !fromAmount || parseFloat(fromAmount) <= 0) {
      setQuote(null);
      setToAmount('');
      return;
    }

    // Validate different tokens
    if (
      (fromToken.asset.isNative() && toToken.asset.isNative()) ||
      (!fromToken.asset.isNative() &&
        !toToken.asset.isNative() &&
        fromToken.code === toToken.code &&
        fromToken.issuer === toToken.issuer)
    ) {
      setError('Please select different tokens');
      setQuote(null);
      setToAmount('');
      return;
    }

    // Validate sufficient balance
    const availableBalance = parseFloat(fromToken.balance || '0');
    const requestedAmount = parseFloat(fromAmount);
    const reserve = fromToken.code === 'XLM' ? 2 : 0; // Keep 2 XLM reserve for fees

    if (requestedAmount > availableBalance - reserve) {
      setError(
        `Insufficient ${fromToken.code} balance. Available: ${(availableBalance - reserve).toFixed(7)}`
      );
      setQuote(null);
      setToAmount('');
      return;
    }

    const getQuote = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const swapQuote = await service.getSwapQuote(fromToken.asset, toToken.asset, fromAmount, {
          slippageTolerance,
        });
        setQuote(swapQuote);
        setToAmount(swapQuote.estimatedOutput);
      } catch (err) {
        console.error('Failed to get quote:', err);
        const errorMsg = err instanceof Error ? err.message : 'Failed to get quote';
        setError(errorMsg);
        setQuote(null);
        setToAmount('');
      } finally {
        setIsLoading(false);
      }
    };

    const debounceTimer = setTimeout(getQuote, 500);
    return () => clearTimeout(debounceTimer);
  }, [service, fromToken, toToken, fromAmount, slippageTolerance]);

  const swapTokens = useCallback(() => {
    const temp = fromToken;
    setFromToken(toToken);
    setToToken(temp);
    setFromAmount(toAmount);
  }, [fromToken, toToken, toAmount]);

  const refreshQuote = useCallback(() => {
    if (!service || !fromToken || !toToken || !fromAmount) return;

    setIsLoading(true);
    service
      .getSwapQuote(fromToken.asset, toToken.asset, fromAmount, { slippageTolerance })
      .then(swapQuote => {
        setQuote(swapQuote);
        setToAmount(swapQuote.estimatedOutput);
        setError(null);
      })
      .catch(err => {
        console.error('Failed to refresh quote:', err);
        setError(err instanceof Error ? err.message : 'Failed to refresh quote');
      })
      .finally(() => setIsLoading(false));
  }, [service, fromToken, toToken, fromAmount, slippageTolerance]);

  const buildTransaction = useCallback(async () => {
    if (!service || !quote || !userAddress) {
      throw new Error('Missing required parameters for transaction');
    }

    try {
      const tx = await service.buildSwapTransaction(userAddress, quote, {
        slippageTolerance,
      });
      return tx;
    } catch (err) {
      console.error('Failed to build transaction:', err);
      throw err;
    }
  }, [service, quote, userAddress, slippageTolerance]);

  const executeSwapWithWalletConnect = useCallback(
    async (transaction: any, walletProvider: any) => {
      if (!service) {
        throw new Error('AMM service not initialized');
      }

      try {
        const txHash = await service.executeSwapWithWalletConnect(transaction, walletProvider);
        return txHash;
      } catch (err) {
        console.error('Failed to execute swap:', err);
        throw err;
      }
    },
    [service]
  );

  const reset = useCallback(() => {
    setFromAmount('');
    setToAmount('');
    setQuote(null);
    setError(null);
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
    availableTokens,
    setFromToken,
    setToToken,
    setFromAmount,
    setSlippageTolerance,
    swapTokens,
    refreshQuote,
    buildTransaction,
    executeSwapWithWalletConnect,
    reset,
  };
};
