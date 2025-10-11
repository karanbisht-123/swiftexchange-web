import { useEffect, useRef, useState } from 'react';

import type { WebSocketMessage } from '../utils/WebSocketManager';

export interface FundingRate {
  ticker: string;
  rate: string;
  price: string;
  effectiveAt: string;
  effectiveAtHeight: string;
}

export interface FundingData {
  currentRate: string;
  nextRate: string;
  nextFundingAt: string;
  history: FundingRate[];
  averageRate: number;
  estimatedPayment: (position: number) => number; // Calculate funding payment
}

interface UseFundingRateReturn {
  fundingData: FundingData | null;
  latestRate: FundingRate | null;
  error: string | null;
  isLoading: boolean;
  isConnected: boolean;
}

export function useFundingRate(
  market: string = 'BTC-USD',
  historyLimit: number = 100
): UseFundingRateReturn {
  const [fundingData, setFundingData] = useState<FundingData | null>(null);
  const [latestRate, setLatestRate] = useState<FundingRate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);

  const unsubscribeRef = useRef<(() => void) | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    let socketClient: any = null;
    let indexerClient: any = null;

    const initializeConnection = async () => {
      try {
        const { getSocketClient, getIndexerClient } = await import('../client/clients');

        socketClient = getSocketClient();
        indexerClient = getIndexerClient();

        console.log(`[useFundingRate] Initializing for ${market}`);

        await socketClient.connect();
        if (!isMountedRef.current) return;
        setIsConnected(true);

        // Fetch initial funding rate history from REST API
        setIsLoading(true);
        setError(null);

        const [historyData, marketData] = await Promise.all([
          indexerClient.markets.getPerpetualMarketFundingRates(market, historyLimit),
          indexerClient.markets.getPerpetualMarkets(market),
        ]);

        if (!isMountedRef.current) return;

        const history = historyData.historicalFunding || [];
        const marketInfo = marketData.markets?.[market];

        const currentRate = history[0]?.rate || '0';
        const nextRate = marketInfo?.nextFundingRate || '0';
        const nextFundingAt = marketInfo?.nextFundingAt || '';

        // Calculate average funding rate
        const rates = history.map((h: FundingRate) => parseFloat(h.rate));
        const averageRate =
          rates.length > 0 ? rates.reduce((sum: any, r: any) => sum + r, 0) / rates.length : 0;

        // Function to estimate funding payment for a position size
        const estimatedPayment = (positionSize: number): number => {
          const rate = parseFloat(nextRate);
          return positionSize * rate;
        };

        const initialData: FundingData = {
          currentRate,
          nextRate,
          nextFundingAt,
          history,
          averageRate,
          estimatedPayment,
        };

        setFundingData(initialData);
        if (history.length > 0) {
          setLatestRate(history[0]);
        }
        setIsLoading(false);
        console.log(`[useFundingRate] Loaded ${history.length} funding rates`);

        // Subscribe to markets channel for real-time funding rate updates
        const handleMessage = (msg: WebSocketMessage) => {
          if (!isMountedRef.current) return;

          console.log('[useFundingRate] WS message:', {
            type: msg.type,
            channel: msg.channel,
            hasContents: !!msg.contents,
          });

          if (msg.type !== 'channel_data' || !msg.contents) {
            return;
          }

          // Extract funding rate data from markets update
          const marketUpdates = msg.contents.trading || msg.contents;
          const marketUpdate = marketUpdates[market];

          if (marketUpdate) {
            setFundingData(prev => {
              if (!prev) return prev;

              const newNextRate = marketUpdate.nextFundingRate || prev.nextRate;
              const newNextFundingAt = marketUpdate.nextFundingAt || prev.nextFundingAt;

              // If there's a new historical funding rate, add it to history
              let newHistory = [...prev.history];
              if (msg.contents.historicalFunding) {
                const newRates = msg.contents.historicalFunding.filter(
                  (newRate: FundingRate) =>
                    newRate.ticker === market &&
                    !prev.history.some(h => h.effectiveAt === newRate.effectiveAt)
                );
                if (newRates.length > 0) {
                  newHistory = [...newRates, ...prev.history].slice(0, historyLimit);
                  setLatestRate(newRates[0]);
                }
              }

              // Recalculate average
              const rates = newHistory.map(h => parseFloat(h.rate));
              const averageRate =
                rates.length > 0 ? rates.reduce((sum, r) => sum + r, 0) / rates.length : 0;

              return {
                currentRate: newHistory[0]?.rate || prev.currentRate,
                nextRate: newNextRate,
                nextFundingAt: newNextFundingAt,
                history: newHistory,
                averageRate,
                estimatedPayment: (positionSize: number) => positionSize * parseFloat(newNextRate),
              };
            });
          }
        };

        unsubscribeRef.current = socketClient.subscribeToMarkets(handleMessage);
        console.log(`[useFundingRate] Subscribed to markets for ${market}`);

        const onConnectCleanup = socketClient.onConnect(() => {
          if (isMountedRef.current) {
            console.log('[useFundingRate] Connection established');
            setIsConnected(true);
            setError(null);
          }
        });

        const onDisconnectCleanup = socketClient.onDisconnect(() => {
          if (isMountedRef.current) {
            console.log('[useFundingRate] Connection lost');
            setIsConnected(false);
          }
        });

        return () => {
          onConnectCleanup();
          onDisconnectCleanup();
        };
      } catch (err: any) {
        console.error('[useFundingRate] Error:', err);
        if (isMountedRef.current) {
          setError(err.message || 'Failed to load funding rates');
          setIsConnected(false);
          setIsLoading(false);
        }
      }
    };

    const cleanupPromise = initializeConnection();

    return () => {
      isMountedRef.current = false;
      console.log(`[useFundingRate] Cleaning up ${market}`);

      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }

      cleanupPromise.then(cleanup => {
        if (cleanup) cleanup();
      });
    };
  }, [market, historyLimit]);

  return {
    fundingData,
    latestRate,
    error,
    isLoading,
    isConnected,
  };
}
