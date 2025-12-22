import { useCallback, useEffect, useState } from 'react';

import { useWalletStore } from '../../walletconnect/store/walletConnectStore';
import { AmmSwapService } from '../service/ammSwapService';
import type { SwapQuote, TokenInfo } from '../types/ammSwap.types';

// Assuming NetworkType is defined elsewhere, but for completeness:
// type NetworkType = 'mainnet' | 'testnet';

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
  const [popularTokens, setPopularTokens] = useState<TokenInfo[]>([]);

  // Use the wallet store to get the current Stellar configuration
  const { currentStellarConfig } = useWalletStore();

  useEffect(() => {
    try {
      // Use the Stellar configuration directly from the centralized store.
      // The store handles calling getStellarConfig(network) and updating this value.
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
  }, [currentStellarConfig]); // Re-initialize service if the network/config changes

  // Load user tokens
  useEffect(() => {
    if (!service || !userAddress) return;

    const loadTokens = async () => {
      try {
        const userTokens = await service.getTokenBalances(userAddress);
        const popularAssets = service.getPopularAssets();

        // Create map for quick lookup
        const userTokenMap = new Map();
        userTokens.forEach(token => {
          const key = token.code === 'XLM' ? 'XLM' : `${token.code}:${token.issuer}`;
          userTokenMap.set(key, token);
        });

        // Merge popular assets with user balances
        const allTokens: TokenInfo[] = [];

        for (const asset of popularAssets) {
          const isNative = asset.isNative();
          const key = isNative ? 'XLM' : `${asset.code}:${asset.issuer}`;
          const userToken = userTokenMap.get(key);

          if (userToken) {
            // User has this token
            allTokens.push({ ...userToken, isPopular: true });
            userTokenMap.delete(key); // Remove from map
          } else {
            // User doesn't have this token yet
            allTokens.push({
              asset,
              code: isNative ? 'XLM' : asset.code,
              issuer: isNative ? undefined : asset.issuer,
              balance: '0',
              isPopular: true,
            });
          }
        }

        // Add remaining user tokens that aren't popular
        userTokenMap.forEach(token => {
          allTokens.push(token);
        });

        setPopularTokens(allTokens);

        // Set default tokens if not set - prefer XLM as one of the pair
        if (!fromToken && allTokens.length > 0) {
          const xlmToken = allTokens.find(t => t.code === 'XLM');
          setFromToken(xlmToken || allTokens[0]);
        }
        if (!toToken && allTokens.length > 1) {
          // If fromToken is XLM, pick first non-XLM token
          if (fromToken?.code === 'XLM') {
            const nonXlm = allTokens.find(t => t.code !== 'XLM');
            setToToken(nonXlm || allTokens[1]);
          } else {
            // Otherwise prefer XLM as toToken
            const xlmToken = allTokens.find(t => t.code === 'XLM');
            setToToken(xlmToken || allTokens[1]);
          }
        }
      } catch (err) {
        console.error('Failed to load tokens:', err);
        setError('Failed to load tokens');
      }
    };

    loadTokens();
  }, [service, userAddress]);

  // Get quote when inputs change
  useEffect(() => {
    if (!service || !fromToken || !toToken || !fromAmount || parseFloat(fromAmount) <= 0) {
      setQuote(null);
      setToAmount('');
      return;
    }

    // Check if same token
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
    // Since `toAmount` is the calculated output, setting `fromAmount` to it reverses the quote calculation.
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
    popularTokens,
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
