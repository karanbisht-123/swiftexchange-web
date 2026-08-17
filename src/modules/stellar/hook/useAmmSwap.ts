import { useCallback, useEffect, useRef, useState } from 'react';

import * as StellarSDK from '@stellar/stellar-sdk';

import { getStellarConfig } from '../../walletconnect/config/chains';
import { useWalletStore } from '../../walletconnect/store/walletConnectStore';
import { AmmSwapService } from '../service/ammSwapService';
import { useAmmSwapStore } from '../store/ammSwapStore';
import type { SwapQuote, TokenInfo } from '../types/ammSwap.types';

const homeDomainCache = new Map<string, string>();

interface UseAmmSwapProps {
  userAddress: string;
}

export const useAmmSwap = ({ userAddress }: UseAmmSwapProps) => {
  const [service, setService] = useState<AmmSwapService | null>(null);
  const hasSetDefaultPairRef = useRef(false);
  const [fromToken, setFromToken] = useState<TokenInfo | null>(null);
  const [toToken, setToToken] = useState<TokenInfo | null>(null);
  const [fromAmount, setFromAmount] = useState('');
  const [toAmount, setToAmount] = useState('');
  const [quote, setQuote] = useState<SwapQuote | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshingTokens, setIsRefreshingTokens] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slippageTolerance, setSlippageTolerance] = useState(1);
  const [availableTokens, setAvailableTokens] = useState<TokenInfo[]>([]);
  const [subentryCount, setSubentryCount] = useState<number>(0);
  const [timeLeft, setTimeLeft] = useState(30);

  const network = useWalletStore(state => state.network);
  const currentStellarConfig = getStellarConfig(network);

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
  const fetchTokens = useCallback(
    async (isRefresh = false) => {
      if (!service) return;

      if (isRefresh) setIsRefreshingTokens(true);
      else if (!hasSetDefaultPairRef.current) setIsLoading(true);

      try {
        const { tokens: userTokens, subentryCount: count } = await service.getAssetsWithBalances(
          userAddress || ''
        );

        if (userTokens.length === 0) {
          setError(
            userAddress ? 'No tokens found in your account. Please add tokens first.' : null
          );
          setAvailableTokens([]);
          return;
        }

        setAvailableTokens(userTokens);
        setSubentryCount(count);
        const currentPair = useAmmSwapStore.getState().selectedChartPair || {
          base: 'XLM',
          counter: 'USDC',
          baseIssuer: undefined,
          counterIssuer: 'GBBD47R2LWK7P7TV222OISDOK6V2QQQSK37Q7VURB6L74QVN56AGEBI5',
        };

        const targetFrom =
          userTokens.find(
            t => t.code === currentPair.base && t.issuer === currentPair.baseIssuer
          ) || userTokens.find(t => t.code === currentPair.base);

        const targetTo =
          userTokens.find(
            t => t.code === currentPair.counter && t.issuer === currentPair.counterIssuer
          ) || userTokens.find(t => t.code === currentPair.counter);

        if (!hasSetDefaultPairRef.current && targetFrom && targetTo) {
          setFromToken(targetFrom);
          setToToken(targetTo);
          hasSetDefaultPairRef.current = true;
        } else {
          setFromToken(prev => {
            if (!prev) {
              if (!fromToken && userTokens.length > 0)
                return targetFrom || userTokens.find(t => t.code === 'XLM') || userTokens[0];
              return prev;
            }
            return userTokens.find(t => t.code === prev.code && t.issuer === prev.issuer) || prev;
          });

          setToToken(prev => {
            if (!prev) {
              if (!toToken && userTokens.length > 1) {
                if (targetTo) return targetTo;
                const nonSelectedToken = userTokens.find(
                  t => t.code !== (fromToken?.code || currentPair.base || userTokens[0].code)
                );
                return nonSelectedToken || userTokens[1];
              }
              return prev;
            }
            return userTokens.find(t => t.code === prev.code && t.issuer === prev.issuer) || prev;
          });
        }

        setError(null);
      } catch (err) {
        console.error('Failed to load tokens:', err);
        if (isRefresh) setError('Failed to load your token balances');
      } finally {
        if (isRefresh) setIsRefreshingTokens(false);
        else setIsLoading(false);
      }
    },
    [service, userAddress]
  );

  useEffect(() => {
    fetchTokens();
  }, [fetchTokens]);

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

    // Instead of hardcoding 2 XLM, we use the actual calculated reserve.
    // The native balance from Stellar SDK is total balance. Spendable = total - reserve.
    const reserve = fromToken.code === 'XLM' ? 1 + subentryCount * 0.5 + 0.05 : 0;

    if (requestedAmount > availableBalance - reserve) {
      setError(
        `Insufficient ${fromToken.code} balance. Available: ${Math.max(0, availableBalance - reserve).toFixed(7)}`
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

  useEffect(() => {
    setTimeLeft(30);
  }, [
    fromToken?.code,
    fromToken?.issuer,
    toToken?.code,
    toToken?.issuer,
    fromAmount,
    slippageTolerance,
  ]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    const canCountdown = fromAmount && parseFloat(fromAmount) > 0 && quote && !isLoading;

    if (canCountdown) {
      timer = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      setTimeLeft(30);
    }

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [fromAmount, quote, isLoading]);

  useEffect(() => {
    if (timeLeft === 0) {
      setTimeLeft(30);
      refreshQuote();
    }
  }, [timeLeft, refreshQuote]);

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
      console.log('Waletprovider [useAmmswap ------]', walletProvider);
      if (!service) {
        throw new Error('AMM service not initialized');
      }

      try {
        const txHash = await service.executeSwapWithWalletConnect(transaction, walletProvider);

        setFromToken(prev => {
          if (!prev) return prev;
          const newBalance = Math.max(0, parseFloat(prev.balance || '0') - parseFloat(fromAmount));
          return { ...prev, balance: newBalance.toFixed(7) };
        });

        setToToken(prev => {
          if (!prev) return prev;
          const newBalance = parseFloat(prev.balance || '0') + parseFloat(toAmount);
          return { ...prev, balance: newBalance.toFixed(7) };
        });

        setTimeout(() => fetchTokens(true), 8000);

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
    subentryCount,
    setFromToken,
    setToToken,
    setFromAmount,
    setSlippageTolerance,
    swapTokens,
    refreshQuote,
    buildTransaction,
    executeSwapWithWalletConnect,
    reset,
    timeLeft,
    fetchTokens,
    isRefreshingTokens,
  };
};
